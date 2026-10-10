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
 *   | `buildLibraryScanScript` | `hp` 22663-23233 | **抓素材** | 扫 `img`/`srcset`/`video.poster`/`svg`/CSS `background`；打**作用域**标签；画布内 <140px 丢弃 |
 *
 * ⚠️ 但两者**共用**「收集所有根（document + iframe + shadowRoot，≤4 层）」——
 *    那一步是**探测重复** ⇒ 抽成 `COLLECT_ROOTS_SRC`（唯一实现）。
 *
 * ⚠️ **原则 6**：收集过程中读不到的 frame/root **一律记录并上报**（`unread[]`），
 *    **不许静默 catch**（那会让调用方以为"页面就这些图"）。
 */

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
    function walk(node, d) {
      if (!node || seen.has(node) || d > ${SCAN_MAX_DEPTH}) return;
      seen.add(node); roots.push(node);
      let frames = [];
      try { frames = node.querySelectorAll('iframe'); } catch (e) { unread.push({ kind: 'iframe-query', why: String((e && e.message) || e) }); }
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
        if (el.shadowRoot) walk(el.shadowRoot, d + 1);
      }
    }
    walk(document, startDepth || 0);
    return { roots: roots, unread: unread };
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

/** 画布内小于此高度的图视为图标（原 `hp` 22857） */
const CANVAS_ICON_MAX_H = 140;

/**
 * **素材抓取扫描**（原 `hp` 22663-23233）—— 扫多种源，打**作用域**标签
 *
 * 返回 `{ok, images: [{url, scope, natW, natH}], href, skipped, unread}`
 */
export function buildLibraryScanScript(): string {
  return `(() => {
${COLLECT_ROOTS_SRC}
  const HINTS = ${JSON.stringify(SCOPE_HINTS)};
  const ICON_H = ${CANVAS_ICON_MAX_H};
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

  function push(url, el, w, h) {
    if (!url || seen.has(url)) return;
    if (!/^https?:|^data:image\\//i.test(url)) return;
    if (/\\.svg(\\?|$)/i.test(url)) return;
    const scope = el ? scopeOf(el) : 'site';
    if (scope === 'canvas' && h > 0 && h < ICON_H) return;
    seen.add(url);
    out.push({ url: url, scope: scope, natW: w || 0, natH: h || 0 });
  }

  function walk(root) {
    if (!root || !root.querySelectorAll) return;
    let imgs = [];
    try { imgs = root.querySelectorAll('img'); } catch (e) { collected.unread.push({ kind: 'img-query', why: String((e && e.message) || e) }); }
    for (const img of imgs) {
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
  for (const root of collected.roots) walk(root);

  return { ok: true, images: out, href: location.href, skipped: 0, unread: collected.unread };
})()`;
}
