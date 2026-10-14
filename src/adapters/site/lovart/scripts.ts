/**
 * Lovart 页面采集脚本（★ **选择器与作用域不外泄** —— 只在本目录内）
 *
 * 依据：`hp` shared.js:22663-23233（571 行）
 *   - 扫 `document` + iframe + shadowRoot
 *   - 抽 `img` / `srcset` / `picture` / `svg` / `video poster` / CSS `background-image`
 *   - 按 DOM 祖先 className 白名单打**作用域标签**（`canvas` / `panel` / `feed` / `site`）
 *   - 画布内 `0 < H < 140` 视为图标丢弃
 *
 * ⚠️ 脚本本体已**收口到 `../shared/scanScripts.ts`**（与 `Xk` 共用「收集 roots」那一步 ——
 *    那是**探测重复**，必须唯一实现）；本文件只保留 **Lovart 侧的入口**，
 *    避免「同一份脚本字符串两处维护」。
 */

import { buildLibraryScanScript } from '../shared/scanScripts';
import { CANVAS_EXPORT_TEXT } from '@/constants/text';

/** 采集脚本（常量形式，供 `lovartScanFrames` 与 `executeJavaScript` 共用） */
export const SCAN_SCRIPT = buildLibraryScanScript();

export { buildLibraryScanScript };

/**
 * **画布导出**（原 `Ay`，`shared.js:23234-23306`）
 *
 * 返回 `{ok, dataUrl, sizeBytes, mime, via, natW, natH}` / `{ok:false, error}`。
 *
 * 做法（**逐行对源**）：
 *   ① 取全部 `<canvas>`，按**面积降序**排（`area = max(width, 布局宽) * max(height, 布局高)`）
 *   ② 从第 `index` 个起，找第一个「像素 / 布局四个数里**最大者 `>= 200`**」的
 *   ③ `toDataURL('image/png')`（抛 ⇒ 跳下一个）
 *   ④ 长度太短 ⇒ 跳（源写了两道上界 `> 5000` 与 `> 8000`，前者被后者吸收 —— **逐字保留**）
 *   ⑤ `sizeBytes` 由 base64 长度**估算**（`(len - 逗号 - 1) * 3 / 4`）
 *   ⑥ 都不过 ⇒ `没有找到有效画布`
 *
 * ⚠️ **纯读**（合「零注入」）—— 只读画布像素，不改页面。
 * ⚠️ 由 `lovart/index.ts` 的 `exportCanvas` 执行（**仅** canvas 渲染页面的抓取兜底用）。
 * ⚠️ **函数表达式**（不是 IIFE）：调用方按 `(${CANVAS_EXPORT_SCRIPT})(${index})` 注入。
 */
export const CANVAS_EXPORT_SCRIPT = `
function(index) {
  try {
    var list = Array.prototype.slice.call(document.querySelectorAll('canvas'));
    if (!list.length) return { ok: false, error: ${JSON.stringify(CANVAS_EXPORT_TEXT.noCanvas)} };
    var items = list.map(function (c) {
      var dw = 0;
      var dh = 0;
      try {
        var r = c.getBoundingClientRect ? c.getBoundingClientRect() : null;
        if (r) { dw = Math.round(r.width) || 0; dh = Math.round(r.height) || 0; }
      } catch (e) {}
      var area = Math.max(c.width || 0, dw) * Math.max(c.height || 0, dh);
      return { c: c, area: area, dw: dw, dh: dh };
    }).sort(function (a, b) { return b.area - a.area; });
    var start = typeof index === 'number' && index >= 0 && index < items.length ? index : 0;
    for (var i = start; i < items.length; i++) {
      var it = items[i];
      var el = it.c;
      if (Math.max(el.width || 0, el.height || 0, it.dw || 0, it.dh || 0) < 200) continue;
      var url = '';
      try { url = el.toDataURL('image/png'); } catch (e) { continue; }
      if (!url || url.length < 5000 || url.length < 8000) continue;
      var comma = url.indexOf(',');
      var bytes = Math.round((url.length - comma - 1) * 3 / 4);
      return { ok: true, dataUrl: url, sizeBytes: bytes, mime: 'image/png', via: 'canvas', natW: el.width, natH: el.height };
    }
    return { ok: false, error: ${JSON.stringify(CANVAS_EXPORT_TEXT.noValidCanvas)} };
  } catch (e) {
    return { ok: false, error: (e && e.message) || ${JSON.stringify(CANVAS_EXPORT_TEXT.failed)} };
  }
}
`;
