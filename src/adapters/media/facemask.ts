/**
 * 遮脸能力实现（★ 编排层：DOM 原语 + 业务规则）
 *
 * 依据（**逐行回源抄录**）：
 *   - `nL.jsx` —— 主流程：加载 → 外扩 → clip → 绘制 → 重编码
 *   - `ZD`     shared.js:39833-39862 —— 效果分发
 *
 * 为什么在 `adapters/` 而不在 `lib/`：
 *   本文件同时需要 **DOM（canvas）** 与 **业务规则（外扩比例/格子公式/效果枚举）**。
 *   `lib` 是 L0（不得 import `core`），`core` 是 L2（不得碰 DOM）——
 *   两者交汇处只能是 `adapters/`（唯一接触外部世界的地方）。
 *
 * ⚠️ 错误**原文透传**（原则 6）：`图片源为空` / `人脸框无效` / `图片尺寸无效`
 */

import {
  FACE_MASK_ERROR,
  FACE_MASK_JPEG_QUALITY,
  type FaceMaskEffect,
} from '@/constants/facemask';
import {
  expandFaceRect,
  maskCellSize,
  normalizeFaceMaskOpts,
  type FaceBox,
  type FaceMaskResult,
} from '@/core/rules/facemask';
import { createCanvas, createTmpState, drawMaskEffect, loadImage, type DrawableSource, type TmpState } from '@/lib/image';

export type { FaceMaskResult };

/**
 * 单块遮罩分发（原 `ZD`）
 *
 * ★ **2026-10-12 收口（`TD-09-4`）**：效果分发那半已拆到 `lib/image.ts` 的 `drawMaskEffect`
 *   （判据 C1：编辑器也要用同一份分发，不再各写一遍）。本函数只保留"算 cell + 委托"。
 * ⚠️ 编辑器涂抹时 `strength` 恒 **1**（源 `G3.jsx` 的 `Qe` 只有透明度、没有强度），
 *   `(x,y,w,h)` = 圆形笔刷的**外接正方**（`x-r, y-r, 2r, 2r`）。
 */
export function drawMask(
  ctx: CanvasRenderingContext2D,
  img: DrawableSource,
  x: number,
  y: number,
  w: number,
  h: number,
  effect: FaceMaskEffect,
  strength: number,
  opacity: number,
  st: TmpState = createTmpState(),
): void {
  drawMaskEffect(ctx, img, x, y, w, h, effect, maskCellSize(effect, w, h, strength), opacity, st);
}

/**
 * 对人脸框应用遮罩（原 `nL`）
 *
 * ⚠️ 输出格式：源是 PNG → `image/png`；否则 `image/jpeg`（质量 0.92）
 */
export async function applyFaceMask(
  src: string,
  face: FaceBox,
  rawOpts: unknown = {},
): Promise<FaceMaskResult> {
  if (!src) throw new Error(FACE_MASK_ERROR.emptySource);
  if (!face || !face.nw || !face.nh) throw new Error(FACE_MASK_ERROR.invalidBox);

  const img = await loadImage(src);
  const W = img.naturalWidth || img.width || 0;
  const H = img.naturalHeight || img.height || 0;
  if (!W || !H) throw new Error(FACE_MASK_ERROR.invalidSize);

  const opts = normalizeFaceMaskOpts(rawOpts);

  // 源画布（遮罩只作用于它，避免多次调用累积）
  const base = createCanvas(W, H);
  const bctx = base.getContext('2d');
  if (!bctx) throw new Error(FACE_MASK_ERROR.invalidSize);
  bctx.drawImage(img, 0, 0);

  // 输出画布
  const out = createCanvas(W, H);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error(FACE_MASK_ERROR.invalidSize);
  ctx.drawImage(base, 0, 0);

  const rect = expandFaceRect(face, opts.pad, W, H);
  if (rect) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    drawMask(ctx, base, rect.x, rect.y, rect.w, rect.h, opts.effect, opts.strength, opts.opacity);
    ctx.restore();
  }

  const mime = /^data:image\/png/i.test(src) ? 'image/png' : 'image/jpeg';
  return {
    dataUrl:
      mime === 'image/jpeg' ? out.toDataURL('image/jpeg', FACE_MASK_JPEG_QUALITY) : out.toDataURL('image/png'),
    w: W,
    h: H,
    mime,
  };
}
