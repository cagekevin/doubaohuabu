/**
 * 遮脸几何与参数（★ 纯逻辑，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：
 *   - `em`   shared.js:25478-25490 —— 参数规范化（clamp 范围）
 *   - `nL`   `nL.jsx` —— 人脸框按 `pad` 外扩的**几何计算**（本文件的 `expandFaceRect`）
 *   - `ZD`   shared.js:39833-39862 —— 各效果的**格子尺寸公式**（本文件的 `maskCellSize`）
 *
 * ⚠️ 只做**纯计算**；canvas 绘制在 `lib/image.ts`（`core` 不得碰 DOM —— 原则 4）
 */

import {
  FACE_MASK_CELL,
  FACE_MASK_DEFAULTS,
  FACE_MASK_EFFECTS,
  FACE_MASK_RANGE,
  type FaceMaskEffect,
} from '@/constants/facemask';
import { clamp } from '@/lib/math';

/** 人脸框（**归一化坐标** 0~1；原 `{nx, ny, nw, nh}`） */
export interface FaceBox {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

/** 遮脸选项（规范化后） */
export interface FaceMaskOpts {
  effect: FaceMaskEffect;
  /** `[0.4, 3]` */
  strength: number;
  /** `[0, 0.6]` —— 人脸框外扩比例 */
  pad: number;
  /** `[0, 1]` */
  opacity: number;
}

/**
 * 遮脸产出的**结果形状**（原 `nL` 的 `{dataUrl, w, h}` ＋ `mime`）
 *
 * ★ **2026-10-11 从 `adapters/media/facemask.ts` 上移到纯层**（`TD-16-107`）：
 *   它是**纯数据形状**；而 `MediaPort.applyFaceMask` 要以它作返回类型 —— 端口**不得依赖 adapters**。
 *   （同 `stable/model` 的「值形状」归位判据：形状住纯层，IO 住 adapter。）
 */
export interface FaceMaskResult {
  dataUrl: string;
  w: number;
  h: number;
  mime: string;
}

/**
 * clamp（原 `Ly`）—— 实现已下沉到 `lib/math`（通用原语），此处**再导出**保持对外 API
 * （`core/rules/tests/facemask.test.ts` 直接 import 它）。
 */
export { clamp };

/**
 * 规范化遮脸选项（原 `em`）
 *
 * ⚠️ 与源码一致：`effect` 非法则回落默认；`strength`/`pad` 非有限数则回落默认，
 *    否则 clamp 到范围内。
 */
export function normalizeFaceMaskOpts(raw: unknown): FaceMaskOpts {
  const t = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const effect = FACE_MASK_EFFECTS.includes(t.effect as FaceMaskEffect)
    ? (t.effect as FaceMaskEffect)
    : FACE_MASK_DEFAULTS.effect;

  const s = Number(t.strength);
  const p = Number(t.pad);
  const o = Number(t.opacity);

  return {
    effect,
    strength: Number.isFinite(s)
      ? clamp(s, FACE_MASK_RANGE.strength[0], FACE_MASK_RANGE.strength[1])
      : FACE_MASK_DEFAULTS.strength,
    pad: Number.isFinite(p) ? clamp(p, FACE_MASK_RANGE.pad[0], FACE_MASK_RANGE.pad[1]) : FACE_MASK_DEFAULTS.pad,
    opacity: Number.isFinite(o)
      ? clamp(o, FACE_MASK_RANGE.opacity[0], FACE_MASK_RANGE.opacity[1])
      : FACE_MASK_DEFAULTS.opacity,
  };
}

/** 像素矩形 */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 人脸框 → 像素矩形 + 按 `pad` 外扩（原 `nL.jsx` 25-38）
 *
 * 公式（逐行对应）：
 *   `x = nx * W`，`y = ny * H`，`fw = nw * W`，`fh = nh * H`
 *   `padX = fw * pad`，`padY = fh * pad`
 *   `rx = clamp(x - padX, 0, W)`，`ry = clamp(y - padY, 0, H)`
 *   `rw = clamp(fw + padX*2, 0, W - rx)`，`rh = clamp(fh + padY*2, 0, H - ry)`
 *
 * @returns 越界/零面积时返回 `null`（调用方**不绘制**，与源码 `if (b > 0 && x > 0)` 一致）
 */
export function expandFaceRect(face: FaceBox, pad: number, imgW: number, imgH: number): PixelRect | null {
  if (!face || !face.nw || !face.nh) return null;
  if (!imgW || !imgH) return null;

  const x = face.nx * imgW;
  const y = face.ny * imgH;
  const fw = face.nw * imgW;
  const fh = face.nh * imgH;
  const padX = fw * pad;
  const padY = fh * pad;

  const rx = clamp(x - padX, 0, imgW);
  const ry = clamp(y - padY, 0, imgH);
  const rw = clamp(fw + padX * 2, 0, imgW - rx);
  const rh = clamp(fh + padY * 2, 0, imgH - ry);

  if (rw <= 0 || rh <= 0) return null;
  return { x: rx, y: ry, w: rw, h: rh };
}

/**
 * 各效果的格子/半径尺寸（原 `ZD` 39840-39856）
 *
 * | 效果 | 公式 |
 * |---|---|
 * | `mosaic` | `max(6, min(w,h) * 0.07 * strength)` |
 * | `blur` | `max(4, min(w,h) * 0.06 * strength)` |
 * | `dots` / `grid` | `max(10, round(min(w,h) * 0.09 * strength))` |
 */
export function maskCellSize(effect: FaceMaskEffect, rectW: number, rectH: number, strength: number): number {
  const short = Math.min(rectW, rectH);
  const cfg = FACE_MASK_CELL[effect] ?? FACE_MASK_CELL.mosaic;
  const raw = short * cfg.ratio * strength;
  // `dots`/`grid` 走 `Math.round`，`mosaic`/`blur` 不 round（与源码一致）
  const v = effect === 'dots' || effect === 'grid' ? Math.round(raw) : raw;
  return Math.max(cfg.min, v);
}
