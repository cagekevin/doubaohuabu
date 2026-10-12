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
