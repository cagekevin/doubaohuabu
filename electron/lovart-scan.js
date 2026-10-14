// ============================================================
// Lovart 页面「按 frame 全量扫描」+ 诊断日志（主进程）
// ------------------------------------------------------------
// 为什么需要主进程参与：
//   渲染端只能拿到 <webview> 元素，而 webview.executeJavaScript
//   只作用于顶层文档。Lovart 的画布/编辑器如果跑在嵌套 iframe 里
//   （含跨域 iframe），顶层扫描就什么都看不到 —— 这是「页面上明明
//   有图却扫不到」的典型成因。
//   主进程用 webContents.mainFrame.framesInSubtree 可以在**每一个**
//   frame（含跨域）里执行同一段采集脚本，把结果汇总回渲染端。
//
// 另外提供诊断日志落盘：扫描/下载的关键事实写进
//   <userData>/lovart-diag.log
// 一行一条 JSON，出问题时可整文件取出定位（用户目录里，不涉密图片）。
// ============================================================

const fs = require('fs');
const path = require('path');
const { handle } = require('./ipc');

const FRAME_TIMEOUT_MS = 8000; // 单 frame 扫描上限
const DEFAULT_MAX_FRAMES = 12;

let diagLogPath = '';

/** 追加一行诊断日志（失败静默，绝不影响主流程） */
function writeDiag(tag, payload) {
  try {
    if (!diagLogPath) return '';
    const line = JSON.stringify({
      t: new Date().toISOString(),
      tag,
      ...(payload && typeof payload === 'object' ? payload : { value: payload })
    });
    fs.appendFileSync(diagLogPath, line + '\n', 'utf8');
    return diagLogPath;
  } catch (e) {
    return '';
  }
}

// 给单个 frame 的执行套超时：某个 frame 卡住不能拖垮整次扫描
function execWithTimeout(frame, script, ms) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ ok: false, error: `frame 执行超时（${Math.round(ms / 1000)}s）` });
    }, ms);
    let p;
    try {
      p = frame.executeJavaScript(script, true);
    } catch (e) {
      clearTimeout(timer);
      done = true;
      resolve({ ok: false, error: (e && e.message) || 'frame 执行失败' });
      return;
    }
    Promise.resolve(p).then((result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: true, result });
    }).catch((e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, error: (e && e.message) || 'frame 执行异常' });
    });
  });
}

function initLovartScan({ getMainWindow }) {
  const { webContents, app } = require('electron');

  try {
    diagLogPath = path.join(app.getPath('userData'), 'lovart-diag.log');
  } catch (e) {
    diagLogPath = '';
  }

  // ---- 在每个 frame 里跑采集脚本 ----
  handle('lovart-scan-frames', async (event, args) => {
    const payload = args || {};
    const wcId = Number(payload.webContentsId) || 0;
    const script = typeof payload.script === 'string' ? payload.script : '';
    const maxFrames = Math.max(1, Math.min(Number(payload.maxFrames) || DEFAULT_MAX_FRAMES, 24));

    if (!wcId || !script) return { ok: false, error: '缺少 webContentsId 或扫描脚本' };

    let wc = null;
    try {
      wc = webContents.fromId(wcId);
    } catch (e) {
      wc = null;
    }
    if (!wc || wc.isDestroyed()) return { ok: false, error: '目标页面已关闭或不存在' };

    // 收集 frame 列表：优先 framesInSubtree（含跨域），退化为 mainFrame
    let frames = [];
    try {
      const mf = wc.mainFrame;
      const sub = mf && mf.framesInSubtree;
      if (sub && sub.length) frames = sub;
      else if (mf) frames = [mf];
    } catch (e) {
      frames = [];
    }
    if (frames.length === 0) return { ok: false, error: '无法枚举页面 frame' };

    // 顶层优先，避免被大量广告 iframe 挤掉
    const ordered = frames.slice(0, maxFrames);

    const results = await Promise.all(ordered.map(async (frame) => {
      let url = '';
      try { url = (frame && frame.url) || ''; } catch (e) { url = ''; }
      const r = await execWithTimeout(frame, script, FRAME_TIMEOUT_MS);
      return {
        url,
        ok: r.ok,
        result: r.ok ? r.result : null,
        error: r.ok ? '' : r.error
      };
    }));

    const okCount = results.filter((r) => r.ok).length;
    writeDiag('scan-frames', {
      wcId,
      frameTotal: frames.length,
      tried: ordered.length,
      okCount,
      frames: results.map((r) => ({
        url: r.url.slice(0, 160),
        ok: r.ok,
        error: r.error,
        items: (r.result && Array.isArray(r.result.items)) ? r.result.items.length : 0,
        diag: r.result && r.result.diag ? {
          href: r.result.diag.href,
          title: r.result.diag.title,
          imgTotal: r.result.diag.imgTotal,
          imgUsable: r.result.diag.imgUsable,
          canvasCount: r.result.diag.canvasCount,
          perfImg: r.result.diag.perfImg,
          itemsRaw: r.result.diag.itemsRaw,
          itemsKept: r.result.diag.itemsKept,
          shadowCount: r.result.diag.shadowCount,
          iframeCount: r.result.diag.iframeCount,
          samples: r.result.diag.samples
        } : null
      }))
    });

    return { ok: true, frames: results, logPath: diagLogPath };
  });

  // ---- 渲染端主动写诊断（扫描汇总 / 下载失败明细）----
  handle('lovart-diag', async (event, payload) => {
    const p = payload || {};
    writeDiag(p.tag || 'renderer', p.data || p);
    return { ok: true, path: diagLogPath };
  });

  // ---- 打开诊断日志（在 Finder 里定位，方便用户发给我们）----
  handle('lovart-diag-open', async () => {
    try {
      const { shell } = require('electron');
      if (diagLogPath && fs.existsSync(diagLogPath)) {
        shell.showItemInFolder(diagLogPath);
        return { ok: true, path: diagLogPath };
      }
    } catch (e) { /* 打开目录是尽力而为（失败仍返回 path） */ }
    return { ok: false, path: diagLogPath };
  });

  // ---- 一键 DOM 快照：把所有 frame 的 img/canvas/background-image 关键信息写到日志 ----
  // 用途：用户觉得扫描不到图时，把当前 Lovart 页面真实 DOM 序列化到
  //   userData/lovart-dom-dump-{timestamp}.json
  // 我们拿到这份文件后就能精确调选择器，比盲改代码靠谱。
  handle('lovart-dom-dump', async (event, args) => {
    const payload = args || {};
    const wcId = Number(payload.webContentsId) || 0;
    const script = typeof payload.script === 'string' ? payload.script : '';
    if (!wcId || !script) return { ok: false, error: '缺少 webContentsId 或脚本' };

    let wc = null;
    try { wc = webContents.fromId(wcId); } catch (e) { wc = null; }
    if (!wc || wc.isDestroyed()) return { ok: false, error: '目标页面已关闭或不存在' };

    let frames = [];
    try {
      const mf = wc.mainFrame;
      const sub = mf && mf.framesInSubtree;
      if (sub && sub.length) frames = sub;
      else if (mf) frames = [mf];
    } catch (e) { frames = []; }
    if (frames.length === 0) return { ok: false, error: '无法枚举页面 frame' };
    const ordered = frames.slice(0, Math.max(1, Math.min(Number(payload.maxFrames) || 12, 24)));

    const results = await Promise.all(ordered.map(async (frame) => {
      let url = '';
      try { url = (frame && frame.url) || ''; } catch (e) { url = ''; }
      const r = await execWithTimeout(frame, script, FRAME_TIMEOUT_MS);
      return {
        url,
        ok: r.ok,
        result: r.ok ? r.result : null,
        error: r.ok ? '' : r.error
      };
    }));

    const merged = {
      timestamp: new Date().toISOString(),
      wcId,
      frames: results.map((r) => ({ url: r.url, ok: r.ok, error: r.error })),
      summary: { imgs: 0, imgsUsable: 0, imgsZeroDim: 0, canvases: 0, canvasesDumpable: 0, bgEls: 0, iframes: 0, shadows: 0 },
      imgs: [], canvases: [], bgEls: [], iframesPerFrame: []
    };
    for (const r of results) {
      if (!r.ok || !r.result) continue;
      const s = r.result.summary || {};
      merged.summary.imgs += s.imgs || 0;
      merged.summary.imgsUsable += s.imgsUsable || 0;
      merged.summary.imgsZeroDim += s.imgsZeroDim || 0;
      merged.summary.canvases += s.canvases || 0;
      merged.summary.canvasesDumpable += s.canvasesDumpable || 0;
      merged.summary.bgEls += s.bgEls || 0;
      merged.summary.iframes += s.iframes || 0;
      merged.summary.shadows += s.shadows || 0;
      if (Array.isArray(r.result.imgs)) merged.imgs.push(...r.result.imgs);
      if (Array.isArray(r.result.canvases)) merged.canvases.push(...r.result.canvases);
      if (Array.isArray(r.result.bgEls)) merged.bgEls.push(...r.result.bgEls);
      if (Array.isArray(r.result.iframes)) {
        for (const f of r.result.iframes) merged.iframesPerFrame.push({ from: r.url, ...f });
      }
    }

    let outPath = '';
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      outPath = path.join(app.getPath('userData'), `lovart-dom-dump-${stamp}.json`);
      fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf8');
    } catch (e) {
      return { ok: false, error: '写入失败：' + ((e && e.message) || e), dump: merged };
    }
    writeDiag('dom-dump', { path: outPath, summary: merged.summary });
    return { ok: true, path: outPath, summary: merged.summary };
  });

  console.log(`[lovart-scan] 已注册 lovart-scan-frames / lovart-diag / lovart-dom-dump；诊断日志：${diagLogPath || '(不可用)'}`);
}

// 导出面 = 宿主可用面（`initLovartScan`）＋ 一处**真跨文件消费者**：`writeDiag` 被 `electron/lovart-fetch.js` 调
module.exports = { initLovartScan, writeDiag };
