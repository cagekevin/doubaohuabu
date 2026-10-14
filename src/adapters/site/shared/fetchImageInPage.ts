/**
 * 页内取图（原 `mp.jsx`，`shared.js:35` import · 被 `Lc` `:23838` 当**首选**路径调用）
 *
 * ★★ **为什么必须住在页内**（这是本仓此前整条缺失的一路）：
 *   ① 豆包出图的直链要**页面自己的会话**（cookie / referer）；
 *   ② 那张图**已经显示在页面上** ⇒ 浏览器 HTTP 缓存里就有，源用 `cache:'force-cache'` 直接命中。
 *   渲染进程（CORS）与主进程裸 `fetch`（无 cookie / 无 referer / 无 cache）**两样都没有**。
 *
 * 逐条对源（**策略顺序即语义，命中即停**）：
 *   ① `data:image/*` ⇒ 直接可用（先过空白图检测）
 *   ② `fetch(url, { credentials })` —— 先 `'omit'` 再 `'include'`，`cache:'force-cache'`
 *   ③ `XMLHttpRequest` —— 先 `withCredentials=false` 再 `true`（`timeout=20000`）
 *   ④ `<img>` → `canvas.toDataURL('image/png')`（跨域污染 ⇒ 放弃）
 *   ⑤ 全失败 ⇒ `{ok:false, error: 各条原因以 ' / ' 相连，截 220 字}`
 *
 * ⚠️ **空白 / 占位图检测**（源内联的 `n`）：缩到 24×24 灰度，**方差 < 10** ⇒ 判"空白" ⇒ 直接失败
 *    （**不是**"当成结果交上去"）。这是**取图侧**的闸，与 `Nk`（占位图判定）不是一回事。
 * ⚠️ 体积上限 `30MB`（源 `t = 31457280`）；`natW/natH` 量不到 ⇒ `0`（源同）。
 * ⚠️ 脚本**只读**（零注入）：只发请求、不碰全局。
 */

/** 取图脚本（`(function(url){ return (async()=>{…})(); })(url)` —— 与原 `(${mp})(url)` 同形） */
export function buildFetchImageScript(url: string): string {
  return `(function(u){
  return (async function(){
    if (!u || typeof u !== 'string') return { ok: false, error: '无效 URL' };
    var MAX_BYTES = 31457280;

    // 空白 / 占位图检测（源内联的 n）：24×24 灰度方差 < 10 ⇒ 空白
    var isBlank = async function (d) {
      try {
        var im = new Image();
        im.src = d;
        await new Promise(function (res) {
          if (im.complete && im.naturalWidth) { return res(); }
          im.onload = function () { return res(); };
          im.onerror = function () { return res(); };
          setTimeout(res, 3000);
        });
        var pw = im.naturalWidth || 0;
        var ph = im.naturalHeight || 0;
        if (!pw || !ph) { return false; }
        var m = 24;
        var cv = document.createElement('canvas');
        cv.width = m;
        cv.height = m;
        var cx = cv.getContext('2d');
        if (!cx) { return false; }
        cx.drawImage(im, 0, 0, pw, ph, 0, 0, m, m);
        var data;
        try { data = cx.getImageData(0, 0, m, m).data; } catch (e) { return false; }
        var sum = 0;
        var sq = 0;
        var cnt = 0;
        for (var i = 0; i < data.length; i += 4) {
          var g = data[i + 3] < 16 ? 0 : data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          sum += g; sq += g * g; cnt++;
        }
        if (!cnt) { return false; }
        var mean = sum / cnt;
        return Math.sqrt(Math.max(0, sq / cnt - mean * mean)) < 10;
      } catch (e) {
        return false;
      }
    };

    var blobToDataUrl = function (blob) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { return res(String(fr.result || '')); };
        fr.onerror = function () { return rej(new Error('读取失败')); };
        fr.readAsDataURL(blob);
      });
    };

    var measure = async function (d) {
      var w = 0;
      var h = 0;
      try {
        var im = new Image();
        im.src = d;
        await new Promise(function (res) {
          if (im.complete && im.naturalWidth) { return res(); }
          im.onload = function () { return res(); };
          im.onerror = function () { return res(); };
          setTimeout(res, 3000);
        });
        w = im.naturalWidth || 0;
        h = im.naturalHeight || 0;
      } catch (e) {}
      return { natW: w, natH: h };
    };

    // ① data: 直通
    if (/^data:image\\//i.test(u)) {
      if (await isBlank(u)) { return { ok: false, error: '空白/占位图，已跳过' }; }
      var comma = u.indexOf(',');
      var bytes = comma > 0 ? Math.round((u.length - comma - 1) * 3 / 4) : 0;
      return { ok: true, dataUrl: u, sizeBytes: bytes, via: 'data', natW: 0, natH: 0 };
    }

    var reasons = [];
    var blob = null;

    // ② fetch：先 omit 再 include
    var creds = ['omit', 'include'];
    for (var ci = 0; ci < creds.length; ci++) {
      try {
        var res = await fetch(u, { credentials: creds[ci], cache: 'force-cache' });
        if (!res || !res.ok) { reasons.push('fetch(' + creds[ci] + '): HTTP ' + ((res && res.status) || 0)); continue; }
        var b = await res.blob();
        if (!b || !b.size) { reasons.push('fetch(' + creds[ci] + '): 空内容（0 字节）'); continue; }
        blob = b;
        break;
      } catch (e) {
        reasons.push('fetch(' + creds[ci] + '): ' + ((e && e.message) || e));
      }
    }
    if (blob) {
      if (blob.size > MAX_BYTES) { return { ok: false, error: '文件过大（' + (blob.size / 1048576).toFixed(1) + 'MB）' }; }
      var d1 = await blobToDataUrl(blob);
      if (d1.indexOf('data:image/') === 0) {
        if (await isBlank(d1)) { return { ok: false, error: '空白/占位图，已跳过' }; }
        var s1 = await measure(d1);
        return { ok: true, dataUrl: d1, sizeBytes: blob.size, mime: (blob.type || '').split(';')[0], via: 'fetch', natW: s1.natW, natH: s1.natH };
      }
      reasons.push('返回内容不是图片');
    }

    // ③ XHR：先 withCredentials=false 再 true
    var xhrBlob = null;
    var wc = [false, true];
    for (var xi = 0; xi < wc.length; xi++) {
      try {
        xhrBlob = await new Promise(function (res, rej) {
          var x = new XMLHttpRequest();
          x.open('GET', u, true);
          x.responseType = 'blob';
          x.withCredentials = wc[xi];
          x.timeout = 20000;
          x.onload = function () {
            if (x.status >= 200 && x.status < 300 && x.response && x.response.size) { res(x.response); }
            else { rej(new Error('HTTP ' + x.status)); }
          };
          x.onerror = function () { return rej(new Error('网络错误')); };
          x.ontimeout = function () { return rej(new Error('超时')); };
          x.send();
        });
        break;
      } catch (e) {
        xhrBlob = null;
        reasons.push('xhr(cred=' + wc[xi] + '): ' + ((e && e.message) || e));
      }
    }
    if (xhrBlob) {
      if (xhrBlob.size > MAX_BYTES) { return { ok: false, error: '文件过大' }; }
      var d2 = await blobToDataUrl(xhrBlob);
      if (d2.indexOf('data:image/') === 0) {
        if (await isBlank(d2)) { return { ok: false, error: '空白/占位图，已跳过' }; }
        var s2 = await measure(d2);
        return { ok: true, dataUrl: d2, sizeBytes: xhrBlob.size, mime: (xhrBlob.type || '').split(';')[0], via: 'xhr', natW: s2.natW, natH: s2.natH };
      }
      reasons.push('XHR 返回内容不是图片');
    }

    // ④ canvas 兜底
    try {
      var d3 = await new Promise(function (res) {
        var im = new Image();
        im.crossOrigin = null;
        im.onload = function () {
          try {
            var cv = document.createElement('canvas');
            cv.width = im.naturalWidth;
            cv.height = im.naturalHeight;
            cv.getContext('2d').drawImage(im, 0, 0);
            res(cv.toDataURL('image/png'));
          } catch (e) { res(null); }
        };
        im.onerror = function () { return res(null); };
        im.src = u;
      });
      if (d3 && d3.length > 5000) {
        var est = Math.round((d3.length - d3.indexOf(',') - 1) * 3 / 4);
        if (await isBlank(d3)) { return { ok: false, error: '空白/占位图，已跳过' }; }
        var s3 = await measure(d3);
        return { ok: true, dataUrl: d3, sizeBytes: est, mime: 'image/png', via: 'canvas', natW: s3.natW, natH: s3.natH };
      }
      reasons.push('canvas 转换失败（可能跨域污染）');
    } catch (e) {
      reasons.push('canvas: ' + ((e && e.message) || e));
    }

    return { ok: false, error: reasons.join(' / ').slice(0, 220) };
  })();
})(${JSON.stringify(url)})`;
}
