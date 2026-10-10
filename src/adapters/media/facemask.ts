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
import { expandFaceRect, maskCellSize, normalizeFaceMaskOpts, type FaceBox } from '@/core/rules/facemask';
import { createTmpState, drawBlur, drawMosaic, loadImage, makeDotGridPattern, type DrawableSource } from '@/lib/image';

export interface FaceMaskResult {
  dataUrl: string;
  w: number;
  h: number;
  mime: string;
}

/** 单块遮罩分发（原 `ZD`） */
function drawMask(
  ctx: CanvasRenderingContext2D,
  img: DrawableSource,
  x: number,
  y: number,
  w: number,
  h: number,
  effect: FaceMaskEffect,
  strength: number,
  opacity: number,
): void {
  const st = createTmpState();
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = opacity;

  if (effect === 'mosaic') {
    drawMosaic(ctx, img, x, y, w, h, maskCellSize('mosaic', w, h, strength), st);
  } else if (effect === 'blur') {
    drawBlur(ctx, img, x, y, w, h, maskCellSize('blur', w, h, strength));
  } else {
    const cell = maskCellSize(effect, w, h, strength);
    ctx.fillStyle = makeDotGridPattern(ctx, effect, cell, st);
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  }

  ctx.globalAlpha = prevAlpha;
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
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const bctx = base.getContext('2d');
  if (!bctx) throw new Error(FACE_MASK_ERROR.invalidSize);
  bctx.drawImage(img, 0, 0);

  // 输出画布
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
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
