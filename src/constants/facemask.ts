/**
 * 遮脸参数（★ SSOT）
 *
 * 依据（**逐行回源抄录**）：
 *   - `Ya`  shared.js:25465-25469 —— 默认值
 *   - `em`  shared.js:25478-25490 —— 规范化与范围（`Ly` 是 clamp）
 *   - `Fu`  shared.js:39865-39880 —— 4 种效果的标签与提示
 *   - `ZD`  shared.js:39833-39862 —— 各效果的格子尺寸公式
 */

/** 遮脸效果（原 `Fu`） */
export const FACE_MASK_EFFECTS = ['mosaic', 'blur', 'dots', 'grid'] as const;
export type FaceMaskEffect = (typeof FACE_MASK_EFFECTS)[number];

/** 默认值（原 `Ya`，`Object.freeze`） */
export const FACE_MASK_DEFAULTS = Object.freeze({
  effect: 'mosaic' as FaceMaskEffect,
  strength: 1,
  pad: 0.12,
  opacity: 1,
});

/** 取值范围（原 `Ly(v, min, max)` 的调用点） */
export const FACE_MASK_RANGE = Object.freeze({
  strength: [0.4, 3] as const,
  pad: [0, 0.6] as const,
  opacity: [0, 1] as const,
});

/** 效果标签与提示（原 `Fu`，供 UI 直接渲染） */
export const FACE_MASK_EFFECT_LABEL: Record<FaceMaskEffect, { label: string; hint: string }> = {
  mosaic: { label: '马赛克', hint: '块状像素化，最常用' },
  blur: { label: '模糊', hint: '高斯模糊，过渡自然' },
  dots: { label: '圆点', hint: '圆点阵列覆盖' },
  grid: { label: '网格', hint: '网格线条覆盖' },
};

/** 各效果的格子/半径系数（原 `ZD` 39840-39856） */
export const FACE_MASK_CELL = Object.freeze({
  /** `max(6, min(w,h) * 0.07 * strength)` */
  mosaic: { min: 6, ratio: 0.07 },
  /** `max(4, min(w,h) * 0.06 * strength)` */
  blur: { min: 4, ratio: 0.06 },
  /** `max(10, round(min(w,h) * 0.09 * strength))` */
  dots: { min: 10, ratio: 0.09 },
  grid: { min: 10, ratio: 0.09 },
});

/** JPEG 重编码质量（原 `nL.jsx` 的 `toDataURL('image/jpeg', 0.92)`） */
export const FACE_MASK_JPEG_QUALITY = 0.92;

/**
 * 圆点 / 网格 pattern 的填充色（原 `QD`）
 *
 * ⚠️ **这是「字面量色值」的唯一合法例外**：canvas 2D 的 `fillStyle`
 *    **不支持 `var(--...)`**（CSS 变量只在渲染 CSS 时解析）。
 *    因此 canvas 用色必须以**常量**形式落在 `constants/`（SSOT 层），
 *    由 `scripts/check-invariants.cjs` 单独放行。
 */
export const FACE_MASK_PATTERN_COLOR = 'rgb(0 0 0 / 0.85)';

/**
 * 遮脸的三条错误文案（原 `nL.jsx` 的 `throw new Error(...)`）
 * ⚠️ 原则 6：这些是**生产者原文**，消费者**不得改写**
 */
export const FACE_MASK_ERROR = Object.freeze({
  emptySource: '图片源为空',
  invalidBox: '人脸框无效',
  invalidSize: '图片尺寸无效',
});
