// ============================================================
// 读写系统剪贴板里的图片
//   读 = 画布 Cmd/Ctrl+V 粘贴为素材节点；写 = 「粘贴发送参考图」链路
// ------------------------------------------------------------
// ⚠ Electron 44（本机 44.4.3）把 clipboard 模块换成了 **W3C 异步 Clipboard API**：
//     可用：clear / has / read / write / readText / writeText，且后四个返回 **Promise**
//     移除：readImage / writeImage / availableFormats / readBuffer / writeBuffer / readFilePath
//
//   实测结论（2026-09-28，本机 44.4.3）：
//   · clipboard.read(fmt) → Promise<ClipboardItem[]>，item.types 是 mime 列表，
//     item.getType(mime) → Blob（异步）。
//   · macOS 截图（pasteboard 上是 TIFF）时 Chromium 会**自动转码出 image/png**，
//     has('image/png') === true，getType 拿到完整 PNG 字节（120×260 原图正常还原）。
//   · 千万别去 getType item.types 里那两个 `electron application/osclipboard;format="…"`
//     风味——那是裸 TIFF raw buffer，nativeImage.createFromBuffer 解不出来（isEmpty()）。
//   · 老代码里 clipboard.readImage() 直接抛 "not a function"，被外层 catch 吞掉后
//     返回 { ok:false } → 渲染层按「剪贴板没图」处理 → 表现为 Cmd+V 完全无反应。
//
// 两条来源（与修复前一致）：
//   ① 位图：截图 / 浏览器或图片软件「复制图片」
//   ② 文件引用：Finder 里复制图片文件，pasteboard 上只有路径没有像素
//      —— Electron 不再暴露 readFilePath，macOS 上改用 osascript 读 `clipboard as alias`
// 没有图片时静默返回 { ok: false }，渲染层据此回落到「粘贴画布节点」，不弹任何错误。
// ============================================================

const { clipboard, nativeImage, webContents, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { handle } = require('./ipc');

const CLIPBOARD_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|tiff?)$/i;

const CLIPBOARD_IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff'
};

// 位图探测顺序：Chromium 基本都能转码出 png，其余格式作为「原生字节」兜底
const CLIPBOARD_IMAGE_FORMATS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

/**
 * 从剪贴板取一种格式的位图字节。
 * @param {string} fmt mime
 * @param {boolean} useHas 是否先用 has() 探测（第二轮不探测，防 has 误报）
 */
async function readClipboardFormat(fmt, useHas) {
  if (useHas && typeof clipboard.has === 'function') {
    try {
      if (!(await clipboard.has(fmt))) return null; // Electron 44 的 has() 返回 Promise
    } catch (_) { /* has 不可靠时不要据此放弃 */ }
  }
  const items = await clipboard.read(fmt);
  const item = Array.isArray(items) ? items[0] : null;
  if (!item || typeof item.getType !== 'function') return null;

  const types = Array.isArray(item.types) ? item.types : [];
  // types 非空时必须真的含该格式（否则拿到的字节流可能不是这个 mime 的内容）
  if (types.length && types.indexOf(fmt) === -1) return null;

  const blob = await item.getType(fmt);
  if (!blob) return null;
  const buf = Buffer.from(await blob.arrayBuffer());
  if (!buf || !buf.length) return null;

  const img = nativeImage.createFromBuffer(buf);
  if (!img || img.isEmpty()) return null; // 解不出来 → 换下一个格式
  return { buf, mime: fmt, img };
}

/**
 * 取剪贴板里的第一张位图。命中返回 { buf, mime, img }，否则 null。
 * 两轮：先按 has() 快速探测；全都没中时再无探测重跑一遍（防 has() 漏判）。
 */
async function readClipboardBitmap() {
  // Electron 44：异步 Clipboard API
  if (typeof clipboard.read === 'function') {
    for (const useHas of [true, false]) {
      for (const fmt of CLIPBOARD_IMAGE_FORMATS) {
        try {
          const got = await readClipboardFormat(fmt, useHas);
          if (got) return got;
        } catch (_) { /* 该格式不可用 → 换下一个 */ }
      }
    }
    return null;
  }
  // 老款 Electron 兜底：同步 readImage（本机已被移除，保留为兼容分支）
  try {
    const img = typeof clipboard.readImage === 'function' ? clipboard.readImage() : null;
    if (img && !img.isEmpty()) return { buf: img.toPNG(), mime: 'image/png', img };
  } catch (_) { /* 老 Electron 兼容分支：API 不存在或读取失败 ⇒ 回落主路径 */ }
  return null;
}

/**
 * 取剪贴板上的图片文件路径（Finder 复制文件）。没有则返回 ''。
 * Electron 44 移除了 readFilePath → macOS 走 osascript 兜底（剪贴板不是文件时
 * osascript 会立刻报错，不会挂住；再叠一层 2s 超时保底）。
 */
function readClipboardFilePath() {
  if (typeof clipboard.readFilePath === 'function') {
    try { return clipboard.readFilePath() || ''; } catch (_) { return ''; }
  }
  if (process.platform !== 'darwin') return '';
  try {
    const out = execFileSync('/usr/bin/osascript', ['-e', 'POSIX path of (the clipboard as alias)'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return String(out || '').trim().split('\n')[0].trim() || '';
  } catch (_) {
    return '';
  }
}

/**
 * 供 IPC 直接调用的主入口。
 * @returns {Promise<{ok:true, source:'bitmap'|'file', mime, dataUrl, name?, w, h}|{ok:false, error?:string}>}
 */
async function readClipboardImage() {
  // ① 位图：直接回传剪贴板里的**原始字节**，不再二次 PNG/JPEG 编码。
  //    既避免 JPEG 被转 PNG 膨胀约 7 倍，也保住 GIF 动图与原始画质。
  try {
    const got = await readClipboardBitmap();
    if (got && got.buf && got.buf.length) {
      const s = got.img.getSize();
      return {
        ok: true,
        source: 'bitmap',
        mime: got.mime,
        dataUrl: `data:${got.mime};base64,${got.buf.toString('base64')}`,
        w: Math.max(1, Math.round(s.width) || 0),
        h: Math.max(1, Math.round(s.height) || 0)
      };
    }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }

  // ② 文件引用（Finder 复制图片文件）：pasteboard 上没有像素，只有路径
  try {
    const p = readClipboardFilePath();
    if (p && CLIPBOARD_IMAGE_EXT_RE.test(p) && fs.existsSync(p)) {
      const ext = path.extname(p).slice(1).toLowerCase();
      const mime = CLIPBOARD_IMAGE_MIME[ext] || 'image/png';
      const buf = fs.readFileSync(p);
      if (buf && buf.length) {
        const ni = nativeImage.createFromPath(p);
        const s = ni.isEmpty() ? { width: 0, height: 0 } : ni.getSize();
        return {
          ok: true,
          source: 'file',
          mime,
          dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
          name: path.basename(p),
          w: Math.max(1, Math.round(s.width) || 0),
          h: Math.max(1, Math.round(s.height) || 0)
        };
      }
    }
  } catch (_) { /* 没有文件引用也是正常情况 */ }

  return { ok: false };
}

// ───────────────────── IPC 自注册（本域） ─────────────────────
/**
 * ★ **域唯一门面**：宿主壳只说「初始化剪贴板图片域」。
 * ⚠️ 宿主壳不再需要域内任何别的名字 —— 新旧 clipboard API 兼容 / macOS 路径兜底全在本文件。
 */
// ─────────────── 写：图片 → 系统剪贴板（「粘贴发送参考图」链路的核心一步） ───────────────
// ⚠ 本机 Electron 44.4.3 的**主进程** `clipboard` 只暴露 clear / has / readText / writeText /
//   read / write，**没有 `writeImage`**。原先直接调 `clipboard.writeImage(ni)` 会抛 TypeError，
//   被外层 catch 吞成 `{ ok:false }` ⇒ 参考图被逐张判「写入失败」跳过（「文本框发送节点不发送
//   参考图」的根因）。⇒ 分层写入，任一成功即返回：
//     ① 主进程原生 `clipboard.writeImage`（存在就用，兼容有该 API 的 Electron）
//     ② 回落到「目标 webview 页面内」用标准 Async Clipboard API（`navigator.clipboard.write`
//        + `ClipboardItem`）—— 已实测能把 image/png 真正写进系统剪贴板（回读可确认）。
async function writeImageToPasteboard(ni, webContentsId) {
  if (ni && typeof clipboard.writeImage === 'function') {
    clipboard.writeImage(ni);
    return { ok: true, via: 'main-native' };
  }
  if (!webContentsId) {
    return {
      ok: false,
      error: '当前 Electron 主进程没有 clipboard.writeImage，且未指定目标 webview（无法回落到页面内写入）'
    };
  }
  const wc = webContents.fromId(webContentsId);
  if (!wc) return { ok: false, error: `找不到目标 webContents: ${webContentsId}` };

  // 页面内写剪贴板需要 clipboard-sanitized-write 权限；豆包等分区默认没有权限处理器，
  // 这里按与 Lovart 容器同样的口径放行（只影响该 webview 所在分区会话）。
  try {
    const ses = wc.session;
    if (ses && !ses.__dcClipboardPermPatched) {
      ses.__dcClipboardPermPatched = true;
      try { ses.setPermissionCheckHandler(() => true); } catch (_) { /* 忽略 */ }
      try { ses.setPermissionRequestHandler((_w, _p, cb) => cb(true)); } catch (_) { /* 忽略 */ }
    }
  } catch (_) { /* 忽略 */ }

  let b64 = '';
  try { b64 = ni.toPNG().toString('base64'); } catch (e) {
    return { ok: false, error: `图片编码失败: ${e && e.message || e}` };
  }
  if (!b64) return { ok: false, error: '图片数据为空' };

  const script = `(async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.write) {
        return { ok: false, error: '页面不支持 navigator.clipboard.write' };
      }
      const bin = atob(${JSON.stringify(b64)});
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': new Blob([arr], { type: 'image/png' }) })
      ]);
      let verified = null;
      try {
        verified = (await navigator.clipboard.read()).some((it) => it.types.indexOf('image/png') !== -1);
      } catch (_) { verified = null; }
      return { ok: true, verified };
    } catch (e) {
      return { ok: false, error: String((e && e.name) + ': ' + ((e && e.message) || e)) };
    }
  })()`;

  try {
    const r = await wc.executeJavaScript(script);
    if (r && r.ok) return { ok: true, via: 'page-clipboard', verified: r.verified === true };
    return { ok: false, error: (r && r.error) || '页面写剪贴板失败' };
  } catch (e) {
    return { ok: false, error: `页面写剪贴板异常: ${(e && e.message) || e}` };
  }
}

/**
 * 将 dataUrl 图片写入临时文件并复制到系统剪贴板。
 *
 * 兼容两种输入：`data:base64` 原值，或 `img://` 引用（引用先解析为真实文件）；
 * `webContentsId` 可选 —— 主进程无 `writeImage` 时用它把图片经该 webview 页面写进系统剪贴板。
 * ⚠️ `img://` → 本地路径是**存储/媒体域**的实现，由 `initClipboardImage` **注入**。
 */
async function copyImageToClipboard(img, webContentsId, resolveImageRef) {
  let dataUrl = (img.dataUrl || '');
  let realPath = null;
  if (dataUrl.startsWith('img://')) {
    realPath = resolveImageRef(dataUrl);
    if (!realPath) return { ok: false, error: '图片文件不存在（img:// 引用失效）' };
  }

  const ext = realPath
    ? path.extname(realPath).slice(1).toLowerCase()
    : (dataUrl.match(/^data:image\/(\w+);/) || [])[1];

  let buffer;
  if (realPath) {
    buffer = fs.readFileSync(realPath);
  } else {
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return { ok: false, error: '无效的 dataUrl 格式' };
    }
    buffer = Buffer.from(match[2], 'base64');
  }
  if (!buffer || buffer.length === 0) return { ok: false, error: '图片数据为空' };

  // 写入临时文件（nativeImage 需要文件路径）
  const tmpDir = path.join(os.tmpdir(), 'doubao-canvas');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const safeLabel = (img.label || 'image').replace(/[\\/:"*?<>|]/g, '_').slice(0, 40);
  const fileName = `${safeLabel}-${Date.now()}.${ext || 'png'}`;
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, buffer);

  // 用 nativeImage 加载并写入剪贴板
  const ni = nativeImage.createFromPath(filePath);
  if (ni.isEmpty()) {
    return { ok: false, error: '图片数据为空或格式不支持' };
  }

  // 写系统剪贴板（分层：主进程原生 → 目标页面内 Async Clipboard API）
  const writeRes = await writeImageToPasteboard(ni, webContentsId);
  if (!writeRes.ok) {
    // 临时文件不再需要，清掉再返回失败原因（原因会一路带到发送日志/界面提示）
    try { fs.unlinkSync(filePath); } catch (_) { /* 忽略清理失败 */ }
    return { ok: false, error: writeRes.error || '写入系统剪贴板失败' };
  }

  // 通知所有窗口：系统剪贴板刚被写入图片（画布侧用它判定「最近一次操作是外部/也是图片」，
  // 从而在 Cmd+V 时优先粘贴图片而不是画布内部复制的节点）
  try {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('clipboard-image-changed');
    });
  } catch (_) { /* 忽略广播失败 */ }

  // 清理临时文件（剪贴板已持有内存副本）
  try { fs.unlinkSync(filePath); } catch (_) { /* 忽略清理失败 */ }

  return { ok: true, ext: ext || 'png', via: writeRes.via, verified: writeRes.verified === true };
}

// 导出面 = **宿主可用面**：只有 `initClipboardImage` 出本文件（`read*` / 写剪贴板都是内部实现）
function initClipboardImage({ resolveImageRef }) {
  handle('read-clipboard-image', async () => readClipboardImage());
  handle('copy-image-to-clipboard', async (_e, img, webContentsId) => copyImageToClipboard(img, webContentsId, resolveImageRef));
}

module.exports = { initClipboardImage };
