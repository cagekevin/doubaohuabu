// ============================================================
// Lovart 图片下载服务（主进程）
// ------------------------------------------------------------
// 为什么放在主进程：
//   渲染进程 fetch 受 CORS 限制（Lovart CDN 基本不给 ACAO），
//   而主进程 session.fromPartition(partition).fetch 会带上该账号
//   webview 的 cookie，并可用 referer 冒充站内请求 → 才能真正取到原图。
//
// 与旧 lovart-capture.js（CDP Fetch 全量拦截）的差异：
//   - 不挂 debugger、不拦任何请求，对页面零侵入（旧方案会拖慢 Lovart 页面）
//   - 输入是「渲染端在页面里扫出来的 URL 列表」，因此历史图片也能覆盖
//   - 逐张完成后立即用 IPC 单张推送，避免一次性传几十 MB dataUrl
//
// 无损保证：拿到的是 CDN 上的原始字节，只做 base64 封装，绝不重编码。
//   若 URL 疑似缩略图（带 x-oss-process / imageMogr2 等处理参数），
//   会去掉参数再取一次，挑尺寸更大的那份。
// ============================================================

const { session, nativeImage } = require('electron');
const { URL } = require('url');
// 诊断日志（同一个文件，便于一起取证）
const { writeDiag } = require('./lovart-scan');

const MAX_BYTES = 30 * 1024 * 1024; // 单张 30MB 上限
const TIMEOUT_MS = 25000; // 单张超时
const CONCURRENCY = 4; // 并发下载数
const DEFAULT_LIMIT = 80; // 单次任务最多下载张数
// 占位图判定（与渲染端 lovartScan.isJunkItem 保持一致）
const PLACEHOLDER_SIDE = 200; // 长边 < 200px 视为占位/图标
const PLACEHOLDER_BYTES = 4096; // < 4KB 且长边 < 512px 视为占位

function isPlaceholderImage(bytes, natW, natH, opts) {
  const o = opts || {};
  const minSide = o.minSide || PLACEHOLDER_SIDE;
  const minBytes = o.minBytes || PLACEHOLDER_BYTES;
  const big = Math.max(natW || 0, natH || 0);
  if (big > 0 && big < minSide) return { placeholder: true, reason: `尺寸过小（${natW}×${natH}），疑似占位图` };
  if ((bytes || 0) > 0 && bytes < minBytes && big < 512) {
    return { placeholder: true, reason: `内容过小（${(bytes / 1024).toFixed(1)}KB），疑似占位图` };
  }
  return { placeholder: false };
}

// 已知 CDN 图片处理参数：命中即视为「可能是缩略图」
// 注意要兼容两类写法：
//   1) query 参数式：?x-oss-process=image/resize,w_300   → key 精确等于参数名
//   2) 路径式：?imageMogr2/thumbnail/300x               → key 形如 "<参数名>/..."
// 因此统一按「参数名后跟 '/' 或字符串结尾」匹配。
const PROCESS_KEYS_RE = /^(x-oss-process|imageMogr2|imageView2|imageView|imgaot|image_process|resize|quality|thumbnail|thumb|w|h|width|height|q)(\/|$)/i;

// ---- MIME 嗅探（content-type 不可靠时兜底）----
function sniffMime(buf) {
  if (!buf || buf.length < 12) return '';
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  // RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  // ftypheic / ftypheix / ftypavif / ftypmif1
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (brand.indexOf('avif') === 0) return 'image/avif';
    if (brand.indexOf('hei') === 0 || brand.indexOf('mif1') === 0 || brand.indexOf('msf1') === 0) return 'image/heic';
  }
  return '';
}

function isImageMime(ct) {
  if (typeof ct !== 'string') return false;
  return /^image\//i.test(ct.trim().split(';')[0]);
}

// 去掉已知的缩略图处理参数，得到「原图候选 URL」；无参数可去时返回 ''
function stripProcessParams(rawUrl) {
  try {
    const u = new URL(rawUrl);
    let changed = false;
    for (const k of Array.from(u.searchParams.keys())) {
      if (PROCESS_KEYS_RE.test(k)) { u.searchParams.delete(k); changed = true; }
    }
    return changed ? u.toString() : '';
  } catch (e) {
    return '';
  }
}

function safeNameFromUrl(rawUrl, idx) {
  try {
    const u = new URL(rawUrl);
    const base = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    // 去掉 query 带来的噪声，限制长度
    const cleaned = base.replace(/[?#].*$/, '').slice(0, 80);
    if (cleaned && /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic)$/i.test(cleaned)) return cleaned;
    return cleaned || `Lovart 图 ${idx + 1}`;
  } catch (e) {
    return `Lovart 图 ${idx + 1}`;
  }
}

// 组装请求头：尽量贴近浏览器真实图片请求。
// 但「越像浏览器」不等于「越容易过」：加了 origin / sec-fetch-site 的跨站请求
// 反而可能被 CDN / Cloudflare 判为异常。因此这里给三档，逐档降级重试：
//   1) 完整浏览器图片头（accept + referer + origin + sec-fetch-*）
//   2) 只带 accept + referer
//   3) 裸请求（只带 accept）
const ACCEPT_IMG = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
const ACCEPT_LANG = 'zh-CN,zh;q=0.9,en;q=0.8';

function headerProfiles(referer) {
  const full = { accept: ACCEPT_IMG, 'accept-language': ACCEPT_LANG };
  if (referer) {
    full.referer = referer;
    try { full.origin = new URL(referer).origin; } catch (e) { /* referer 非法 ⇒ 不带 origin 头（其余头照发） */ }
  }
  full['sec-fetch-dest'] = 'image';
  full['sec-fetch-mode'] = 'no-cors';
  full['sec-fetch-site'] = 'same-site';

  const mid = { accept: ACCEPT_IMG, 'accept-language': ACCEPT_LANG };
  if (referer) mid.referer = referer;

  return [full, mid, { accept: '*/*' }];
}

// 需要降档重试的状态码（鉴权 / 风控 / 拒绝）
const RETRY_STATUS = [401, 403, 406, 429, 451];

// 单张下载：返回 { ok, dataUrl, sizeBytes, natW, natH, mime } / { ok:false, error } / { ok:false, skipped }
async function fetchOne(ses, rawUrl, referer, minimalHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const profiles = minimalHeaders ? [headerProfiles(referer)[1]] : headerProfiles(referer);
  const errs = [];
  try {
    let res = null;
    for (let i = 0; i < profiles.length; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        res = await ses.fetch(rawUrl, {
          method: 'GET',
          signal: controller.signal,
          credentials: 'include',
          headers: profiles[i]
        });
      } catch (e) {
        // 受限头（origin / sec-fetch-*）被网络栈拒绝时会抛错 → 直接降档
        if (e && e.name === 'AbortError') throw e;
        errs.push(`档${i + 1}:${(e && e.message) || '请求失败'}`);
        res = null;
        continue;
      }
      if (res && res.ok) break;
      const st = res ? res.status : 0;
      errs.push(`档${i + 1}:HTTP ${st}`);
      if (RETRY_STATUS.indexOf(st) < 0) break; // 非风控类失败，降档也没用
    }

    if (!res || !res.ok) {
      const st = res ? res.status : 0;
      return { ok: false, error: st ? `HTTP ${st}（${errs.join(' ')}）`.slice(0, 200) : `网络请求失败（${errs.join(' ')}）`.slice(0, 200) };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength === 0) return { ok: false, error: '空响应（0 字节）' };
    if (ab.byteLength > MAX_BYTES) {
      return { ok: false, error: `文件过大（${(ab.byteLength / 1024 / 1024).toFixed(1)}MB > ${MAX_BYTES / 1024 / 1024}MB）` };
    }
    const buf = Buffer.from(ab);
    let mime = isImageMime(ct) ? ct.split(';')[0].trim() : sniffMime(buf);
    if (!mime) mime = sniffMime(buf);
    if (!mime) return { ok: false, error: '返回内容不是图片' };

    let natW = 0;
    let natH = 0;
    try {
      const img = nativeImage.createFromBuffer(buf);
      if (img && !img.isEmpty()) {
        const sz = img.getSize();
        natW = sz.width || 0;
        natH = sz.height || 0;
      }
    } catch (e) { /* 某些格式（avif/heic）nativeImage 解不了，尺寸留 0 不影响功能 */ }

    // 占位图 / 站点杂图剔除：这是「抓到的不是生成的图」的第二道防线
    // （第一道在页面脚本内按 naturalWidth/Height 过滤）
    const ph = isPlaceholderImage(ab.byteLength, natW, natH);
    if (ph.placeholder) {
      return { ok: false, skipped: true, reason: ph.reason };
    }

    return {
      ok: true,
      dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
      sizeBytes: ab.byteLength,
      natW,
      natH,
      mime
    };
  } catch (e) {
    const msg = (e && e.name === 'AbortError') ? `超时（${TIMEOUT_MS / 1000}s）` : ((e && e.message) || '未知网络错误');
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// 带「缩略图 → 原图」的下载策略。
// 关键修正：只要 URL 带服务端处理参数（x-oss-process / imageMogr2 等），
// 一律**优先取去掉参数的原图**。旧实现「先取带参数的、尺寸 ≥1024 就接受」
// 会把 1024 的 webp 缩略图当成原图存档 —— 与「保持原始分辨率与画质」相悖。
async function fetchBest(ses, rawUrl, referer) {
  const alt = stripProcessParams(rawUrl);
  if (!alt) return fetchOne(ses, rawUrl, referer);

  const orig = await fetchOne(ses, alt, referer);
  if (orig.ok) return orig;
  // 原图取不到（被拦 / 已删除）时，退回带参数的版本，至少让用户看到图
  const fallback = await fetchOne(ses, rawUrl, referer);
  if (fallback.ok) {
    writeDiag('fetch-fallback', { url: rawUrl.slice(0, 200), reason: orig.error || '原图不可用' });
    return fallback;
  }
  return orig;
}

/**
 * 注册下载 IPC。
 * 渲染端调用 lovart-fetch-images 后立即拿到 { ok, jobId }，
 * 之后通过 'lovart-fetch-item'（每张完成）与 'lovart-fetch-done'（整批结束）接收结果。
 */
function initLovartFetch({ getMainWindow }) {
  const { ipcMain } = require('electron');

  ipcMain.handle('lovart-fetch-images', async (event, args) => {
    const payload = args || {};
    const accountId = payload.accountId || '';
    const partition = payload.partition || '';
    const referer = payload.referer || 'https://www.lovart.ai/';
    const limit = Math.max(1, Math.min(Number(payload.limit) || DEFAULT_LIMIT, 200));
    const urls = Array.isArray(payload.urls) ? payload.urls.slice(0, limit) : [];

    if (!accountId || urls.length === 0) {
      return { ok: false, error: '缺少账号或图片 URL 列表' };
    }

    let ses;
    try {
      ses = partition ? session.fromPartition(partition) : session.defaultSession;
    } catch (e) {
      return { ok: false, error: `无法打开会话分区：${(e && e.message) || e}` };
    }

    const win = getMainWindow && getMainWindow();
    /**
     * 进度推送 —— ★ **返回"是否真的送到"**（`TD-13-8`）
     *
     * ⚠️ 此前它**没有返回值**且 `catch` 全吞 ⇒ 调用方**无从知道有没有送到**，
     *    于是「先 `okCount++`、再推送」的写法会把**没送达**的图算成成功
     *    ⇒ 用户看到「已获取 N 张」而实际缺图（假成功）。
     */
    const sender = (channel, data) => {
      try {
        // 优先回到发起请求的那个渲染进程；窗口已销毁则退回主窗口
        const target = (event && event.sender && !event.sender.isDestroyed()) ? event.sender
          : (win && !win.isDestroyed() ? win.webContents : null);
        if (target && !target.isDestroyed()) {
          target.send(channel, data);
          return true;
        }
        // ★ TD-13-8：**没有可送达的目标**同样是"没送到"（此前一律静默）
        console.warn('[lovart-fetch] 进度推送无目标（窗口/渲染进程已销毁）:', channel);
        return false;
      } catch (e) {
        // ★ TD-13-8：推送失败**不再静默**（原则 6）—— 否则调用方会把"没送到"算成成功
        console.warn('[lovart-fetch] 进度推送失败:', channel, (e && e.message) || e);
        return false;
      }
    };

    const jobId = `lj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    // 后台跑，不阻塞 handle 的返回（大 batch 可能要几十秒）
    (async () => {
      let okCount = 0;
      let failCount = 0;
      let skipCount = 0;
      const failures = [];
      const skippedList = [];
      let cursor = 0;
      const total = urls.length;

      const worker = async () => {
        while (true) {
          const i = cursor++;
          if (i >= total) return;
          const rawUrl = urls[i];
          let r;
          try {
            r = await fetchBest(ses, rawUrl, referer);
          } catch (e) {
            r = { ok: false, error: (e && e.message) || '未知错误' };
          }
          if (r.ok) {
            // ★ **TD-13-8：先送、再计数** —— 送不到就不算成功。
            //   （此前是 `okCount++` 在前、`sender` 在后且全吞 ⇒ 渲染层永远收不到那张图，
            //     它却已被计入「已获取」⇒ 用户看到成功数虚高、实际缺图。）
            const delivered = sender('lovart-fetch-item', {
              jobId,
              accountId,
              index: i,
              total,
              item: {
                name: safeNameFromUrl(rawUrl, i),
                dataUrl: r.dataUrl,
                sizeBytes: r.sizeBytes,
                natW: r.natW,
                natH: r.natH,
                sourceUrl: rawUrl,
                source: 'capture'
              }
            });
            if (delivered) {
              okCount++;
            } else {
              // 图**已下载**但没送到渲染层 ⇒ 对用户而言就是没拿到 ⇒ 记失败并给出可读原因
              failCount++;
              if (failures.length < 12) {
                failures.push({ url: rawUrl, error: '图片已下载但未送达渲染层（IPC 推送失败）' });
              }
            }
          } else if (r.skipped) {
            // 占位图 / 站点杂图：不计失败，单独通知（UI 上提示「已跳过」）
            skipCount++;
            if (skippedList.length < 12) skippedList.push({ url: rawUrl, reason: r.reason || '无效图' });
            sender('lovart-fetch-item', { jobId, accountId, index: i, total, skipped: true, reason: r.reason || '无效图', url: rawUrl });
          } else {
            failCount++;
            if (failures.length < 12) failures.push({ url: rawUrl, error: r.error || '失败' });
            sender('lovart-fetch-item', { jobId, accountId, index: i, total, failed: true, error: r.error || '失败', url: rawUrl });
          }
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
      await Promise.all(workers);

      sender('lovart-fetch-done', { jobId, accountId, total, okCount, failCount, skipCount, failures, skipped: skippedList });
      writeDiag('fetch-done', {
        accountId,
        partition,
        total,
        okCount,
        failCount,
        skipCount,
        failures: failures.map((f) => ({ url: String(f.url).slice(0, 200), error: f.error })),
        skipped: skippedList.map((s) => ({ url: String(s.url).slice(0, 200), reason: s.reason }))
      });
    })().catch((e) => {
      sender('lovart-fetch-done', {
        jobId, accountId, total: urls.length, okCount: 0, failCount: urls.length, skipCount: 0,
        failures: [{ url: '', error: (e && e.message) || '任务异常中断' }]
      });
    });

    // 注意：total 声明在上面那个 async IIFE 内部，handler 作用域里看不到它。
    // 直接写 `return { ok, jobId, total }` 会抛 ReferenceError: total is not defined —
    // 而 ipcMain.handle 的返回值是要被渲染端 await 的，一抛错整批抓取就判失败
    // （表现：扫描明明扫到了图、主进程也下成功了，UI 却始终「一张都没抓到」）。
    return { ok: true, jobId, total: urls.length };
  });

  console.log('[lovart-fetch] 已注册 lovart-fetch-images（主动扫描后的原图下载，带账号 cookie）');
}

module.exports = {
  initLovartFetch,
  // 内部工具（导出仅为单测/排查用，生产链路只用 initLovartFetch）
  _stripProcessParams: stripProcessParams,
  _sniffMime: sniffMime,
  _safeNameFromUrl: safeNameFromUrl,
  _headerProfiles: headerProfiles,
  _isPlaceholderImage: isPlaceholderImage,
  _fetchBest: fetchBest,
  _fetchOne: fetchOne
};
