/**
 * 读**拖放 / 粘贴**进来的文件（原 `n$` / `Pu`，`shared.js:23974-24020`）
 *
 * 依据（**逐行回源抄录**）：
 * ```js
 * function n$(e) {                     // 读文本
 *   return new Promise(t => {
 *     const n = new FileReader();
 *     n.onload = () => t(String(n.result || ''));
 *     n.onerror = () => t('');
 *     n.readAsText(e);
 *   });
 * }
 * function Pu(e) {                      // 读图（**顺带量原始尺寸**）
 *   return new Promise(t => {
 *     const n = new FileReader();
 *     n.onload = () => {
 *       const r = n.result;
 *       const s = new Image();
 *       s.onload  = () => t({ name: stripExt(e.name), dataUrl: r, natW: s.naturalWidth  || 200, natH: s.naturalHeight || 160 });
 *       s.onerror = () => t({ name: stripExt(e.name), dataUrl: r, natW: 200, natH: 160 });
 *       s.src = r;
 *     };
 *     n.onerror = () => t({ name: stripExt(e.name), dataUrl: '', natW: 200, natH: 160 });
 *     n.readAsDataURL(e);
 *   });
 * }
 * ```
 *
 * ⚠️ **两条都不 reject**：读不出来也 resolve（`dataUrl` 为空串 / 文本为空串）——
 *    调用方按 `dataUrl`/内容**自己过滤**（源在 drop 处理里 `.filter(it => it && it.dataUrl)`）。
 * ⚠️ **文件名去掉扩展名**（`stripExtension`）：`.png` / `.jpeg` 都去（正则取**最后一段**）。
 *
 * 归属：纯浏览器能力（`lib` 层，L0；与 `lib/videoPoster.ts` 同法）⇒ **不可测**（要真 `File`），
 *    故**不进单测**；纯逻辑部分（去扩展名）已导出且被调用方直接使用。
 */

import { loadImage } from './image';

/** 量不到尺寸时的兜底（原 `Pu` 的 `|| 200` / `|| 160`） */
const FALLBACK_W = 200;
const FALLBACK_H = 160;

/** 去掉扩展名（原 `(e.name || '').replace(/\.[^.]+$/, '')`） */
export function stripExtension(name: string | null | undefined): string {
  return (name || '').replace(/\.[^.]+$/, '');
}

/** 读成文本（原 `n$`，`shared.js:23974-23985`）—— ⚠️ 读失败 resolve `''`，**不 reject** */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

/** 读成图（含原始尺寸；原 `Pu`，`shared.js:23986-24020`）—— ⚠️ 任何失败都 resolve，`dataUrl` 可能为空串 */
export interface DroppedImage {
  /** 文件名（**已去扩展名**） */
  name: string;
  /** 内联 base64（读失败 ⇒ 空串） */
  dataUrl: string;
  /** 原始宽（量不到 ⇒ `200`） */
  natW: number;
  /** 原始高（量不到 ⇒ `160`） */
  natH: number;
}

export function readImageFile(file: File): Promise<DroppedImage> {
  return new Promise((resolve) => {
    const name = stripExtension(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      loadImage(dataUrl).then(
        (img) =>
          resolve({
            name,
            dataUrl,
            natW: img.naturalWidth || FALLBACK_W,
            natH: img.naturalHeight || FALLBACK_H,
          }),
        // ⚠️ 量尺寸失败**照样给图**（源如此：只丢尺寸，不丢 dataUrl）
        () => resolve({ name, dataUrl, natW: FALLBACK_W, natH: FALLBACK_H }),
      );
    };
    // ⚠️ 读文件失败 ⇒ `dataUrl` 空串（调用方过滤掉这一条）
    reader.onerror = () => resolve({ name, dataUrl: '', natW: FALLBACK_W, natH: FALLBACK_H });
    reader.readAsDataURL(file);
  });
}