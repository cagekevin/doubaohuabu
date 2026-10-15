/**
 * E3 探针（真 Electron）：**三个协议 handler（`img` / `vid` / `appasset`）的 in/out 对照**。
 *
 * 为什么需要它：这三个 handler 是 `app.whenReady()` 里注册的**内联闭包**（`main.ts`），
 * 既不导出、也依赖 `net.fetch` / `nativeImage` / `protocol` —— **纯 Node 里跑不了**（E1 的边界）。
 * ⇒ 只能起真 Electron，**在 `protocol.handle` 上做手脚把它抓下来**，再喂假 `Request` 比 `Response`。
 *
 * 做法：
 *   ① 在 `require(main.js)` **之前**把 `protocol.handle` 换成"捕获版"（记下 scheme → handler，再转发给原实现）；
 *   ② `require(<root>/main.js)` —— 它会在 `whenReady` 里把三个 handler 注册进来（被我们捕获）；
 *   ③ 等 main 的 `whenReady` 跑完，**直接调捕获到的 handler**（真代码，不是副本），喂 `new Request(url, {headers})`；
 *   ④ 只回**可比的形状**：`status` · 排序后的响应头 · body 字节长度 + sha1（⛔ 不回整段 body —— 二进制没法人读）。
 *
 * 用法（由父进程 spawn，不手跑）：`electron <本文件> <job.json>`
 *   job = { root, userData, cases: [{ id, scheme, url, headers? }] }
 * 退出码：0 正常跑完（哪怕有 case 失败 —— 失败也是"事实"，交由父进程比）。
 */
const { app, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

/**
 * ★ **必须改 `appData`，不是 `userData`**：
 *   `main.js` 顶层自己会 `app.setName('doubao-canvas')` ＋
 *   `app.setPath('userData', path.join(app.getPath('appData'), 'doubao-canvas'))`
 *   ⇒ 直接设 `userData` 会被它**覆盖**（实测：`getPath('userData')` 仍是真机路径，
 *     夹具放临时目录 ⇒ img/vid 的"两侧都 404"是**假通过**）。
 *   ⇒ 改它的**上游** `appData` ⇒ 它算出来的 userData ＝ `<job.appData>/doubao-canvas`。
 */
if (job.appData) app.setPath('appData', job.appData);
if (job.userData) app.setPath('userData', job.userData);

/** 抓下来的 handler（scheme → fn） */
const captured = {};
const origHandle = protocol.handle.bind(protocol);
protocol.handle = (scheme, fn) => {
  captured[scheme] = fn;
  return origHandle(scheme, fn);
};

function emit(o) {
  fs.writeSync(1, '__E3__ ' + JSON.stringify(o) + '\n');
}

// ② 载入**真** main（旧 `.js` 基线 / 新 `.js` 产物）—— 它会注册三个 handler
//   ⚠️ 旧侧可能**加载即抛**（基线树不自洽时）⇒ 兜住它，别让 Electron 弹错误框**挂住不退出**
let loadError = null;
try {
  require(path.join(job.root, 'main.js'));
} catch (e) {
  loadError = String((e && e.stack) || e);
}

/** 硬兜底：无论发生什么，40s 后退出（否则探针挂住 ⇒ 父进程等到 90s 被杀） */
setTimeout(() => app.exit(0), 40000);

app.whenReady().then(async () => {
  if (loadError) {
    emit({ id: '__load__', error: loadError.split('\n').slice(0, 4).join(' | ') });
    app.exit(0);
    return;
  }
  // 等 main 的 whenReady 回调把 protocol.handle 注册完（它的回调同步跑完注册段）
  await new Promise((r) => setTimeout(r, 2500));
  // 自证：userData 是否真生效、夹具是否真在（⛔ 否则 img/vid 的"两侧都 404"是**假通过**）
  emit({
    id: '__env__',
    userData: app.getPath('userData'),
    hasImg: fs.existsSync(path.join(app.getPath('userData'), 'images', 'test.png')),
    hasVid: fs.existsSync(path.join(app.getPath('userData'), 'videos', 'test.mp4')),
  });
  for (const c of job.cases) {
    let out;
    try {
      const fn = captured[c.scheme];
      if (typeof fn !== 'function') {
        out = { id: c.id, missing: true, have: Object.keys(captured) };
      } else {
        const res = await fn(new Request(c.url, c.headers ? { headers: c.headers } : undefined));
        const buf = Buffer.from(await res.arrayBuffer());
        out = {
          id: c.id,
          status: res.status,
          headers: [...res.headers].map(([k, v]) => `${k.toLowerCase()}=${v}`).sort(),
          len: buf.length,
          sha: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16),
        };
      }
    } catch (e) {
      out = { id: c.id, error: String((e && e.message) || e) };
    }
    emit(out);
  }
  app.exit(0);
});
