/**
 * 节点尺寸同步的**纯规则**（`NodeShell` 的「比例 → 尺寸」换算）
 *
 * 归属：`core/rules` —— 只做算术，无 `window` / `Date.now()` / `Math.random()`（原则 4）。
 * 消费方：`ui/nodes/useNodeSize.ts`（把结果写回 store）。
 *
 * 两种尺寸模式：
 *  - `width-fixed`：宽度固定，`height = 当前宽度 ÷ 比例`
 *  - `area-fixed`：面积固定，`width = √比例 × base`，`height = base ÷ √比例`
 */

/** `area-fixed` 节点的**面积基准**（视频生成 / 图片生成统一尺寸的唯一来源） */
export const NODE_AREA_FIXED_BASE_SIZE = 380;

// ─────────── 视频节点「按真实宽高比」自适应（原 `BL.jsx:181-223` 的 `ct`）───────────

/** 自适应尺寸的**基准宽**（px，原 `:200` 的 `Ke` = 320） */
export const VIDEO_BOX_BASE_W = 320;
/** 自适应尺寸的**上限**（px，原 `:201` 的 `Ct` = 460；宽高共用同一个上限） */
export const VIDEO_BOX_MAX = 460;
/** 「真实比例已一致」的容差（原 `:198` 的 `Math.abs(gt - Nt) < 0.02`） */
export const VIDEO_BOX_RATIO_TOLERANCE = 0.02;

/** 尺寸模式：`width-fixed`（宽固定）/ `area-fixed`（面积固定） */
export type SizeSyncMode = 'width-fixed' | 'area-fixed';

export interface SizeSyncOptions {
  /** 尺寸模式，默认 `width-fixed` */
  mode?: SizeSyncMode;
  defaultWidth?: number;
  defaultHeight?: number;
  /** `area-fixed` 的面积基准 */
  baseSize?: number;
}

/** `computeSizeSync` 的产物 */
export interface SizeSync {
  width: number;
  height: number;
}

/**
 * 解析 `'16:9'` / `'1:1'` / `'Auto'` → 宽高比数值或 `null`。
 * ⚠️ `'Auto'` / 空 ⇒ `null`（**不干预**节点尺寸 —— 由媒体自适应决定）。
 */
export function parseAspect(aspectRatio?: string | null): number | null {
  if (!aspectRatio || aspectRatio === 'Auto') return null;
  const m = aspectRatio.match(/^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return h === 0 ? null : w / h;
}

/**
 * 按比例计算节点目标尺寸。
 *  - `ratio = null`（Auto / 无比例）→ 返回默认尺寸
 *  - `width-fixed`：宽固定为 `currentWidth`，高 = 宽 ÷ 比例
 *  - `area-fixed`：宽 = √比例 × `baseSize`，高 = `baseSize` ÷ √比例
 */
export function computeSizeSync(
  ratio: number | null,
  opts: SizeSyncOptions & { currentWidth?: number } = {},
): SizeSync {
  const mode = opts.mode ?? 'width-fixed';
  const defaultWidth = opts.defaultWidth ?? 420;
  const defaultHeight = opts.defaultHeight ?? 420;
  const baseSize = opts.baseSize ?? NODE_AREA_FIXED_BASE_SIZE;
  const currentWidth = opts.currentWidth ?? defaultWidth;
  if (ratio) {
    if (mode === 'area-fixed') {
      return {
        width: Math.round(Math.sqrt(ratio) * baseSize),
        height: Math.round(baseSize / Math.sqrt(ratio)),
      };
    }
    return { width: currentWidth, height: Math.round(currentWidth / ratio) };
  }
  return { width: currentWidth, height: defaultHeight };
}

/**
 * 视频节点**按真实宽高比**算自适应尺寸（原 `BL.jsx:181-223` 的 `ct`）
 *
 * ⚠️ **与 `computeSizeSync` 不是同一件事**（不合并 —— 两者判据不同）：
 *   · `computeSizeSync` 是**声明式**的「按 `aspectRatio` prop 同步」，宽度沿用**当前**宽；
 *   · 本函数是**实测式**的「按 `<video>` 的真实像素调**一次**」，宽度从**固定基准 320** 起算，
 *     且带 **460 上限夹取**（`computeSizeSync` 没有上限）。
 *
 * 逐字对源（`:185-215`）：
 * ```js
 * if (!kt || !xt) return;                              // 量不到真实像素 ⇒ 不管
 * const Nt = kt / xt;
 * if (gt != null && Math.abs(gt - Nt) < 0.02) return;  // data 里存的比例已一致 ⇒ 不调
 * let ee = 320, Q = Math.round(ee / Nt);               // 基准宽 320 ⇒ 高
 * if (Q > 460) { Q = 460; ee = Math.round(460 * Nt); }
 * if (ee > 460) { ee = 460; Q = Math.round(460 / Nt); }
 * ```
 *
 * @param videoW/videoH `<video>` 实测像素（`0`/`NaN` ⇒ `null`，源 `if (!kt || !xt) return`）
 * @param curW/curH `data` 里**已存**的真实像素（比例一致 ⇒ `null`，源 `gt` 的容差）
 * @returns 目标尺寸；**不用调** ⇒ `null`
 */
export function fitVideoBox(
  videoW: number,
  videoH: number,
  curW?: number | null,
  curH?: number | null,
): SizeSync | null {
  if (!videoW || !videoH) return null;
  const ratio = videoW / videoH;
  const cur = curW && curH ? curW / curH : null;
  if (cur != null && Math.abs(cur - ratio) < VIDEO_BOX_RATIO_TOLERANCE) return null;
  let width = VIDEO_BOX_BASE_W;
  let height = Math.round(width / ratio);
  if (height > VIDEO_BOX_MAX) {
    height = VIDEO_BOX_MAX;
    width = Math.round(VIDEO_BOX_MAX * ratio);
  }
  if (width > VIDEO_BOX_MAX) {
    width = VIDEO_BOX_MAX;
    height = Math.round(VIDEO_BOX_MAX / ratio);
  }
  return { width, height };
}
