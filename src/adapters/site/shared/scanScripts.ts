/**
 * 页面扫描脚本（**在 webview 里执行的字符串脚本**，不是本工程的 TS 模块）
 *
 * ⚠️ 为什么是字符串：这些脚本通过 `webview.executeJavaScript(script)` 在**外部站点页面**里跑，
 *    它们的运行环境是别人的页面，不是我们的模块图 ⇒ 不受 eslint/tsc 管辖，
 *    正确性靠 `08` W12 / W15 的运行时验证。
 *
 * ⚠️ **两个扫描器判据不同，不许合并**（Step 3「判真假接缝」）：
 *   | 扫描器 | 原实现 | 用途 | 判据 |
 *   |---|---|---|---|
 *   | `buildResultScanScript` | `Xk` 35949-36035 | **等生成结果** | 只扫 `img`；`minSide` 默认 **96**；输出 `{url,kind,w,h}` |
 *   | `buildLibraryScanScript` | `hp` 22663-23233 | **抓素材** | 扫 `img`/`srcset`/`video.poster`/`svg`/CSS `background` ＋ **perf 网络资源**；打**作用域**标签；画布内 <140px 丢弃 |
 *
 * ⚠️ 但两者**共用**「收集所有根（document + iframe + shadowRoot，≤4 层）」——
 *    那一步是**探测重复** ⇒ 抽成 `COLLECT_ROOTS_SRC`（唯一实现）。
 *
 * ⚠️ **原则 6**：收集过程中读不到的 frame/root **一律记录并上报**（`unread[]`），
 *    **不许静默 catch**（那会让调用方以为"页面就这些图"）。
 */

import { CANVAS_ICON_MAX_HEIGHT } from '@/constants';

/** 最小边长（结果扫描默认；原 `Xk` 的 `e && e.minSide || 96`） */
export const RESULT_SCAN_MIN_SIDE = 96;

/** 递归深度上限（原 `Xk` 的 `!(u > 4)`） */
export const SCAN_MAX_DEPTH = 4;

/**
 * 收集所有可查询的根（document + 同源 iframe + shadowRoot），最多 `SCAN_MAX_DEPTH` 层
 * —— **唯一的探测实现**，两个扫描器共用
 *
 * ⚠️ 跨域 iframe 访问**必然抛 `SecurityError`** —— 这是预期内边界，但**必须记录**（不静默吞）
 */
const COLLECT_ROOTS_SRC = `
  function collectRoots(startDepth) {
    const roots = [];
    const unread = [];
    const seen = new Set();
    // ★ 诊断计数（原 hp 的 p.iframeCount += P.length 22927 / p.shadowCount++ 22949）——
    //   与「收集 roots」是**同一次遍历** ⇒ 在这里数，不在调用方重走一遍（判据 C1）
    let iframeCount = 0;
    let shadowCount = 0;
    function walk(node, d) {
      if (!node || seen.has(node) || d > ${SCAN_MAX_DEPTH}) return;
      seen.add(node); roots.push(node);
      let frames = [];
      try { frames = node.querySelectorAll('iframe'); } catch (e) { unread.push({ kind: 'iframe-query', why: String((e && e.message) || e) }); }
      // ⚠️ 源数的是**查到的 iframe 数**（不是"成功进入的"）—— P.length 在进入循环之前就加
      iframeCount += frames.length;
      for (const f of frames) {
        try {
          if (f.contentDocument) walk(f.contentDocument, d + 1);
          else unread.push({ kind: 'cross-origin-frame', src: f.getAttribute('src') || '', why: 'no-contentDocument' });
        } catch (e) {
          unread.push({ kind: 'cross-origin-frame', src: f.getAttribute('src') || '', why: String((e && e.message) || e) });
        }
      }
      let all = [];
      try { all = node.querySelectorAll('*'); } catch (e) { unread.push({ kind: 'all-query', why: String((e && e.message) || e) }); }
      for (const el of all) {
        if (el.shadowRoot) { shadowCount++; walk(el.shadowRoot, d + 1); }
      }
    }
    walk(document, startDepth || 0);
    return { roots: roots, unread: unread, iframeCount: iframeCount, shadowCount: shadowCount };
  }
`;

/**
 * **生成结果扫描**（原 `Xk` 35949-36035）—— 只扫 `img`，按 `minSide` 过滤
 *
 * 返回 `{ok, href, items: [{url, kind, w, h, scope}], unread}`，`kind` ∈ `http` / `data` / `blob`
 */
export function buildResultScanScript(minSide: number = RESULT_SCAN_MIN_SIDE): string {
  return `(() => {
${COLLECT_ROOTS_SRC}
  const MIN_SIDE = ${JSON.stringify(minSide)};
  const collected = collectRoots(0);
  const out = [];
  const added = new Set();
  function push(url, w, h) {
    if (!url || added.has(url)) return;
    let kind = 'http';
    if (/^data:/i.test(url)) kind = 'data';
    else if (/^blob:/i.test(url)) kind = 'blob';
    else if (!/^https?:/i.test(url)) return;
    added.add(url);
    out.push({ url: url, kind: kind, w: w || 0, h: h || 0, scope: 'site' });
  }
  for (const root of collected.roots) {
    let imgs = [];
    try { imgs = root.querySelectorAll('img'); } catch (e) { collected.unread.push({ kind: 'img-query', why: String((e && e.message) || e) }); continue; }
    for (const img of imgs) {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (Math.min(w, h) < MIN_SIDE) continue;
      let src = img.currentSrc || img.src || '';
      if (!src && img.srcset) {
        try {
          const parts = String(img.srcset).split(',').map(function (v) { return v.trim().split(/\\s+/)[0]; }).filter(Boolean);
          if (parts.length) src = parts[parts.length - 1];
        } catch (e) { collected.unread.push({ kind: 'srcset-parse', why: String((e && e.message) || e) }); }
      }
      if (src) push(src, w, h);
    }
  }
  return { ok: true, href: (location && location.href) || '', items: out, unread: collected.unread };
})()`;
}

/** 作用域判定用的 className 白名单（原 `hp` 的 `y` 22807-22834） */
const SCOPE_HINTS = {
  canvas: ['tl-container', 'tl-canvas', 'tl-shape', 'lovart-canvas', 'artboard', 'viewport-canvas', 'image-editor'],
  panel: ['asset-panel', 'layer-panel', 'library-panel', 'sidebar', 'preset-panel', 'lora-panel'],
  feed: ['feed', 'plaza', 'recommend', 'for-you', 'trending', 'popular', 'gallery-grid', 'discover'],
};

// ── perf（网络资源）通道的判据（原 `hp:22700` ＋ `:23062-23072`）────────────────────

/** 「像图片」的 URL（原 `hp:22700` 的 `d`） */
const PERF_IMG_RE = /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic|heif)(\?|#|$)/i;
/** **明确不是图**的 URL（原 `:23062` 的内联正则） */
const PERF_SKIP_RE = /\.(js|mjs|css|json|html?|xml|txt|map|wasm|woff2?|ttf|otf|eot)(\?|#|$)/i;
/** `initiatorType` 里**明确不是图**的（原 `:23066`） */
const PERF_SKIP_INITIATORS = ['script', 'xmlhttprequest', 'fetch', 'beacon'];
/** `initiatorType` 白名单（原 `:23070` 的 `D`；含空串） */
const PERF_LIKELY_INITIATORS = ['img', 'image', 'css', 'link', 'video', 'input', ''];
/** 白名单档的**最小体积**（原 `:23071` 的 `8192`） */
const PERF_MIN_BYTES = 8192;
/** 过小 ⇒ 占位 / 图标（原 `:23072` 的 `< 2048`） */
const PERF_MIN_USABLE_BYTES = 2048;

/**
 * **素材抓取扫描**（原 `hp` 22663-23233）—— 扫多种源，打**作用域**标签
 *
 * 返回 `{ok, images: [{url, scope, natW, natH}], href, skipped, unread}`
 */
export function buildLibraryScanScript(): string {
  return `(() => {
${COLLECT_ROOTS_SRC}
  const HINTS = ${JSON.stringify(SCOPE_HINTS)};
  const ICON_H = ${CANVAS_ICON_MAX_HEIGHT};
  const PERF_IMG_RE = ${PERF_IMG_RE};
  const PERF_SKIP_RE = ${PERF_SKIP_RE};
  const PERF_SKIP_INIT = ${JSON.stringify(PERF_SKIP_INITIATORS)};
  const PERF_LIKELY_INIT = ${JSON.stringify(PERF_LIKELY_INITIATORS)};
  const PERF_MIN_BYTES = ${PERF_MIN_BYTES};
  const PERF_MIN_USABLE = ${PERF_MIN_USABLE_BYTES};
  const scopeCache = new WeakMap();

  function scopeOf(el) {
    let cur = el;
    const chain = [];
    while (cur && cur !== document.documentElement) {
      if (scopeCache.has(cur)) { chain.push(scopeCache.get(cur)); }
      else {
        const cls = String(cur.className || '');
        for (const scope of Object.keys(HINTS)) {
          if (HINTS[scope].some(function (k) { return cls.indexOf(k) >= 0; })) { chain.push(scope); break; }
        }
      }
      cur = cur.parentElement;
    }
    const order = { canvas: 4, panel: 3, feed: 2 };
    let best = null, bestW = 0;
    for (const s of chain) { const w = order[s] || 0; if (w > bestW) { best = s; bestW = w; } }
    const result = best || 'site';
    scopeCache.set(el, result);
    return result;
  }

  const collected = collectRoots(0);
  const out = [];
  const seen = new Set();
  // ★ **诊断**（原 hp 的 p，22663）—— 抓不到图时用来说清"为什么"（见 core/rules/scanDiag）
  const diag = {
    docCount: collected.roots.length,
    iframeCount: collected.iframeCount,
    shadowCount: collected.shadowCount,
    imgTotal: 0,
    imgUsable: 0,
    perfImg: 0,
    canvasCount: 0,
    canvases: [],
    itemsRaw: 0,
    itemsKept: 0
  };

  function push(url, el, w, h) {
    if (!url) return;
    // ⚠️ 源 p.itemsRaw++ 在 b 的过滤之前（22856）；本仓把"没有 url"排除在候选之外
    //    （数它会把"候选"算成比实际多）—— 这是**有意的一处口径收紧**，只影响摘要数字。
    diag.itemsRaw++;
    if (seen.has(url)) return;
    if (!/^https?:|^data:image\\//i.test(url)) return;
    if (/\\.svg(\\?|$)/i.test(url)) return;
    const scope = el ? scopeOf(el) : 'site';
    if (scope === 'canvas' && h > 0 && h < ICON_H) return;
    diag.itemsKept++;
    seen.add(url);
    out.push({ url: url, scope: scope, natW: w || 0, natH: h || 0 });
  }

  function walk(root) {
    if (!root || !root.querySelectorAll) return;
    let imgs = [];
    try { imgs = root.querySelectorAll('img'); } catch (e) { collected.unread.push({ kind: 'img-query', why: String((e && e.message) || e) }); }
    for (const img of imgs) {
      diag.imgTotal++;
      // 原 22985 的 if (D || A)：**有自然尺寸或布局尺寸**才算"可用"
      if (img.naturalWidth > 0 || img.naturalHeight > 0 || img.clientWidth > 0 || img.clientHeight > 0) diag.imgUsable++;
      push(img.currentSrc || img.src, img, img.naturalWidth, img.naturalHeight);
      const ss = img.getAttribute('srcset');
      if (ss) ss.split(',').forEach(function (part) { push(String(part).trim().split(/\\s+/)[0], img, img.naturalWidth, img.naturalHeight); });
    }
    root.querySelectorAll('picture source').forEach(function (s) {
      const ss = s.getAttribute('srcset');
      if (ss) ss.split(',').forEach(function (part) { push(String(part).trim().split(/\\s+/)[0], s, 0, 0); });
    });
    root.querySelectorAll('video').forEach(function (v) { push(v.poster, v, v.videoWidth, v.videoHeight); });
    root.querySelectorAll('svg image').forEach(function (s) { push(s.getAttribute('href') || s.getAttribute('xlink:href'), s, 0, 0); });
    root.querySelectorAll('*').forEach(function (el) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const m = /url\\(["']?([^"')]+)["']?\\)/.exec(bg);
        if (m) push(m[1], el, el.clientWidth, el.clientHeight);
      }
    });
  }

  // 直接遍历已收集的根（iframe / shadowRoot 已在 collectRoots 里穿透）
  for (const root of collected.roots) {
    walk(root);
    // ★ 原 23057-23079：**网络资源通道** —— DOM 里没有、但已被网络加载的图**也当候选**
    //   （只扫 DOM 会漏掉"靠网络加载、不在 DOM 里"的图；diag.perfImg 也因此才有可诚实上报的计数）
    //   ⚠️ 源**按 root 各读一次**：defaultView 缺（shadowRoot）时**回落到全局 performance**
    //      ⇒ 同一批条目会被**重复计数**（push 靠 seen 去重，但 perfImg 会计大）。源如此，照抄。
    let perf = [];
    try {
      const win = root.defaultView || null;
      perf = (win && win.performance ? win.performance.getEntriesByType('resource') : performance.getEntriesByType('resource')) || [];
    } catch (e) {
      collected.unread.push({ kind: 'perf-query', why: String((e && e.message) || e) });
    }
    for (const pe of perf) {
      if (!pe || !pe.name) continue;
      if (PERF_SKIP_RE.test(pe.name)) continue;
      const it = String(pe.initiatorType || '').toLowerCase();
      if (PERF_SKIP_INIT.indexOf(it) >= 0) continue;
      const size = pe.decodedBodySize || pe.transferSize || 0;
      const likely = PERF_LIKELY_INIT.indexOf(it) >= 0;
      if (PERF_IMG_RE.test(pe.name) || (likely && size >= PERF_MIN_BYTES)) {
        // 原 23072：!(R > 0) || !(R < 2048) —— 体积**未知**（0）放行；已知过小则丢
        if (!(size > 0) || !(size < PERF_MIN_USABLE)) {
          diag.perfImg++;
          // ⚠️ 无元素 ⇒ push 的 scope 落 site（源 b 缺 scope 时也是 t.SITE，:22863）
          push(pe.name, null, pe.width || 0, pe.height || 0);
        }
      }
    }
    // 原 23082-23097 的 p.canvasCount += j.length / p.canvases.push({w,h,dw,dh}) —— 与遍历同一轮
    let cs = [];
    try { cs = root.querySelectorAll('canvas'); } catch (e) { collected.unread.push({ kind: 'canvas-query', why: String((e && e.message) || e) }); }
    diag.canvasCount += cs.length;
    // 原 23083 的 p.canvases.length < 6 —— **最多收 6 个**（够门的判断，不把整页画布都搬回来）
    for (let ci = 0; ci < cs.length && diag.canvases.length < 6; ci++) {
      const cv = cs[ci];
      let cw = 0;
      let ch = 0;
      try {
        const cr = cv.getBoundingClientRect();
        cw = Math.round(cr.width) || 0;
        ch = Math.round(cr.height) || 0;
      } catch (e) {}
      diag.canvases.push({ w: cv.width || 0, h: cv.height || 0, dw: cw, dh: ch });
    }
  }

  return { ok: true, images: out, href: location.href, skipped: 0, unread: collected.unread, diag: diag };
})()`;
}
