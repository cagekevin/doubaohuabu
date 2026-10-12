/**
 * 图片裁剪的**几何纯规则**（★ 纯函数，必测）
 *
 * ★ **2026-10-12（`TD-09-4` 第一块）**：图片编辑器（源 `G3.jsx` 1087 行）未落，本文件先落它
 *   最源头的部分 —— **裁剪几何**（与 DOM/画布无关，可在 UI 之前单测钉住）。
 *
 * 依据（**逐行回源**，`expanded_components/G3.jsx`）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `initialCropRect` | `:604-625` 的 effect | 基准边 `min(w,h) × 0.8`；有比例档 ⇒ 宽 `base`、高 `base / r`；**超高 ⇒ 夹到 `h × 0.9` 并按比例回算宽**；最后**居中**取整 |
 *   | `applyCrop` | `:627-664` 的 `Nt` 前半 | 先把 `x/y` 夹进 `[0, size-1]`、`w/h` 夹进 `[min, size - x/y]`；仍小于 `min` ⇒ 「裁剪区域太小」**明确失败**（不静默拆） |
 *   | `CROP_MIN_EDGE` | `shared.js:42648` 的 `ts = 24` | 裁剪框最小边 |
 *   | `CropRatioPreset` | `shared.js:42624-42634…` 的 `ef` | 比例档（`free` 无 `r` ⇒ 自由；`1:1` ⇒ `r:1`；`3:4` ⇒ `r:3/4`…） |
 *
 * ⚠️ **不重造**：源的 `Tt(e,t,n)` = `Math.max(t, Math.min(n, e))` ⇒ **逐字等于本仓 `lib/math.clamp`**
 *   （判据 C1）⇒ 本文件委托它，不再写第三份。
 * ⚠️ 本模块**不碰 canvas / DOM**：真正"把像素裁下来"那段（源 `:641-657` 的 `drawImage` 两连）属
 *   `lib/image`，等编辑器 UI 落地时再接 —— 几何先独立可测。
 */

import { clamp } from '@/lib/math';

/** 裁剪框最小边（源 `ts` = 24） */
export const CROP_MIN_EDGE = 24;

/**
 * 裁剪比例档（原 `ef`，`shared.js:42624-42647`）—— **逐字回源**（6 档）
 *
 * ⚠️ `free` 无 `r`（自由比例）；其余 5 档 `r` = 宽 / 高。
 */
export const CROP_RATIO_PRESETS: readonly CropRatioPreset[] = [
  { value: 'free', label: '自由' },
  { value: '1:1', label: '1:1', r: 1 },
  { value: '3:4', label: '3:4', r: 3 / 4 },
  { value: '4:3', label: '4:3', r: 4 / 3 },
  { value: '9:16', label: '9:16', r: 9 / 16 },
  { value: '16:9', label: '16:9', r: 16 / 9 },
];

/** 初始框的基准比例（源 `Math.min(a.w, a.h) * 0.8`） */
const INITIAL_BASE_RATIO = 0.8;
/** 初始框的高度上限（源 `if (Y > a.h * 0.9)`） */
const INITIAL_MAX_H_RATIO = 0.9;

/** 一个矩形（裁剪框用） */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 被裁图片的尺寸 */
export interface CropSize {
  w: number;
  h: number;
}

/** 裁剪比例档（源 `ef`）—— UI 用；`r` 缺省 ⇒ 自由比例 */
export interface CropRatioPreset {
  value: string;
  label: string;
  /** 宽高比（`w / h`）；`free` 档没有它 */
  r?: number;
}

/** 比例档的 `r`（`free` / 查不到 ⇒ `undefined` —— 源 `(ef.find(…) || {}).r || 0` 的空值语义） */
export function cropRatioOf(presets: readonly CropRatioPreset[], value: string): number | undefined {
  return presets.find((p) => p.value === value)?.r;
}

/**
 * 初始裁剪框（源 `G3.jsx:604-625`）
 *
 * @param ratio 宽高比；**不传 / `0` ⇒ 自由**（源 `T ? … : …` 的空值语义）
 */
export function initialCropRect(size: CropSize, ratio?: number): CropRect {
  const base = Math.min(size.w, size.h) * INITIAL_BASE_RATIO;
  let w = base;
  let h = ratio ? base / ratio : base;
  if (h > size.h * INITIAL_MAX_H_RATIO) {
    h = size.h * INITIAL_MAX_H_RATIO;
    // 源 `K = T ? Y * T : K` —— 有比例才回算宽，**自由比例保持原宽**（照抄）
    w = ratio ? h * ratio : w;
  }
  return {
    x: Math.round((size.w - w) / 2),
    y: Math.round((size.h - h) / 2),
    w: Math.round(w),
    h: Math.round(h),
  };
}

/**
 * 应用裁剪（源 `G3.jsx:627-664` 的前半：clamp）
 *
 * ⚠️ **与源的一处有意偏离（回源发现，留痕）**：源在 clamp 之后还有一句
 *   `if (de < ts || ae < ts) { w('裁剪区域太小'); return; }` —— 但源的 clamp
 *   `Tt(e,t,n) = Math.max(t, Math.min(n, e))` **在公式上就保证结果 ≥ `ts`**
 *   （`Math.max(ts, …)` 不可能小于 `ts`）⇒ 那句判定**永不触发**，是**死分支/假护栏**
 *   （本仓另有 13 笔同形态债）。⇒ 本仓**不照抄**它：`applyCrop` 只做 clamp 并直接返回，
 *   调用方拿到的**必然是合法框**；源的「裁剪区域太小」文案保留在 `docs/过程.md` 的登记里备查。
 */
export function applyCrop(rect: CropRect, size: CropSize, min: number = CROP_MIN_EDGE): CropRect {
  const x = Math.round(clamp(rect.x, 0, size.w - 1));
  const y = Math.round(clamp(rect.y, 0, size.h - 1));
  const w = Math.round(clamp(rect.w, min, size.w - x));
  const h = Math.round(clamp(rect.h, min, size.h - y));
  return { x, y, w, h };
}
