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

/**
 * 量一个 `dataUrl` 的**原始尺寸**，量不到 ⇒ `0`（原 `Lc` 的 `<img>` 那半，`shared.js:23812-23820`）
 *
 * ⚠️ 与 `measureImageSize` 的**兜底不同**（那条是 `Pu` 的 `200 × 160`）：源 `Lc` 失败给 `0`，
 *    而 `addImageGenResult` 用 `natW && natH` 判「有尺寸才写进库条目」⇒ **两者不能混**。
 * ⚠️ 消费者：`adapters/site/doubao` 的出片轮询（原 `DR` 的项带 `natW`/`natH`）。
 */
export function measureNaturalSize(dataUrl: string): Promise<{ natW: number; natH: number }> {
  return loadImage(dataUrl).then(
    (img) => ({ natW: img.naturalWidth || 0, natH: img.naturalHeight || 0 }),
    () => ({ natW: 0, natH: 0 }),
  );
}

/**
 * 量一个**已读好的 `dataUrl`** 的原始尺寸（原 `Pu` 的 `<img>` 那半）
 *
 * ⚠️ **两次都不 reject**（源同法：只丢尺寸，不丢图）—— 加载失败 / `naturalWidth` 为 0
 *    都给兜底 `200 × 160`。
 * ⚠️ 消费者两处（判据 C1）：`readImageFile`（拖放 / 粘贴）与画廊「导入图片」——
 *    后者从系统对话框拿到的是**现成 dataUrl**（没有 `File` 可读）。
 */
export function measureImageSize(dataUrl: string): Promise<{ natW: number; natH: number }> {
  return measureNaturalSize(dataUrl).then((s) => ({
    natW: s.natW || FALLBACK_W,
    natH: s.natH || FALLBACK_H,
  }));
}

export function readImageFile(file: File): Promise<DroppedImage> {
  return new Promise((resolve) => {
    const name = stripExtension(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      // ⚠️ 量尺寸失败**照样给图**（源如此：只丢尺寸，不丢 dataUrl）
      measureImageSize(dataUrl).then((size) => resolve({ name, dataUrl, ...size }));
    };
    // ⚠️ 读文件失败 ⇒ `dataUrl` 空串（调用方过滤掉这一条）
    reader.onerror = () => resolve({ name, dataUrl: '', natW: FALLBACK_W, natH: FALLBACK_H });
    reader.readAsDataURL(file);
  });
}