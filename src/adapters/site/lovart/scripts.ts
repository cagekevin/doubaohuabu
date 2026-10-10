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

/** 采集脚本（常量形式，供 `lovartScanFrames` 与 `executeJavaScript` 共用） */
export const SCAN_SCRIPT = buildLibraryScanScript();

export { buildLibraryScanScript };
