/**
 * 图像处理**原语**（canvas 操作）—— `lib` 层（L0，**无业务知识**）
 *
 * 依据（**逐行回源抄录**）：
 *   - `XD`  shared.js:39795-39824 —— 马赛克（缩小再放大，`imageSmoothingEnabled=false`）
 *   - `JD`  shared.js:39825-39832 —— 模糊（`ctx.filter = blur(Npx)`，外扩 `ceil(N*2)`）
 *
 * ⚠️ 本文件**不得 import `core`**（`lib` 是 L0，`core` 是 L2）——
 *    业务编排（外扩比例、格子公式、效果分发）在 `adapters/media/facemask.ts`。
 * ⚠️ 依赖 DOM；`core` 不得直接调它（原则 4）。
 */

import { FACE_MASK_PATTERN_COLOR } from '@/constants/facemask';
import { clamp } from './math';

/** 临时 canvas 缓存（原 `bS()` 的 `{tmp, tiles}`） */
export interface TmpState {
  tmp: HTMLCanvasElement | null;
  tiles: Record<string, HTMLCanvasElement>;
}

/**
 * 可绘制源（`<img>` / `<canvas>` 都可）
 * 原实现直接把它当 `drawImage` 的源，并用 `width`/`height` 夹取边界
 */
export type DrawableSource = CanvasImageSource & { readonly width: number; readonly height: number };

export const createTmpState = (): TmpState => ({ tmp: null, tiles: {} });

/** 加载图片（原 `eL`）—— 失败时抛 `decode-fail`（**原文透传**，原则 6） */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode-fail'));
    img.src = src;
  });
}

/** 建一个指定尺寸的离屏 canvas（`document.createElement('canvas')` + 设宽高）—— 收口全仓 7 处各自 new */
export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 马赛克（原 `XD`）：把区域缩小到 `区域/格子`，再以**关闭插值**放大回去 */
export function drawMosaic(
  ctx: CanvasRenderingContext2D,
  img: DrawableSource,
  x: number,
  y: number,
  w: number,
  h: number,
  cell: number,
  st: TmpState,
): void {
  const c = Math.max(4, Math.round(cell));
  const u = clamp(Math.floor(x / c) * c, 0, img.width);
  const d = clamp(Math.floor(y / c) * c, 0, img.height);
  const f = clamp(Math.ceil((x + w) / c) * c, 0, img.width);
  const p = clamp(Math.ceil((y + h) / c) * c, 0, img.height);
  const rw = f - u;
  const rh = p - d;
  if (rw <= 0 || rh <= 0) return;

  const tw = Math.max(1, Math.round(rw / c));
  const th = Math.max(1, Math.round(rh / c));
  if (!st.tmp) st.tmp = document.createElement('canvas');
  st.tmp.width = tw;
  st.tmp.height = th;
  const tctx = st.tmp.getContext('2d');
  if (!tctx) return;

  tctx.clearRect(0, 0, tw, th);
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(img, u, d, rw, rh, 0, 0, tw, th);

  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false; // ★ 关键：最近邻放大 ⇒ 块状
  ctx.drawImage(st.tmp, 0, 0, tw, th, u, d, rw, rh);
  ctx.imageSmoothingEnabled = prev;
}

/** 模糊（原 `JD`）：外扩 `ceil(r*2)` 再 `ctx.filter` 绘制（避免边缘变暗） */
export function drawBlur(
  ctx: CanvasRenderingContext2D,
  img: DrawableSource,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const pad = Math.ceil(radius * 2);
  const l = clamp(Math.floor(x) - pad, 0, img.width);
  const c = clamp(Math.floor(y) - pad, 0, img.height);
  const u = clamp(Math.ceil(x + w) + pad, 0, img.width);
  const d = clamp(Math.ceil(y + h) + pad, 0, img.height);
  const rw = u - l;
  const rh = d - c;
  if (rw <= 0 || rh <= 0) return;

  const prev = ctx.filter;
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(img, l, c, rw, rh, l, c, rw, rh);
  ctx.filter = prev;
}

/**
 * 生成圆点 / 网格 pattern（原 `QD`）
 * @param kind 只接受 `'dots'` / `'grid'`（业务语义由调用方映射）
 */
export function makeDotGridPattern(
  ctx: CanvasRenderingContext2D,
  kind: 'dots' | 'grid',
  cell: number,
  st: TmpState,
): CanvasPattern | string {
  // ⚠️ canvas 的 fillStyle 不支持 CSS 变量 ⇒ 用常量（SSOT 在 constants/facemask.ts）
  const color = FACE_MASK_PATTERN_COLOR;
  const key = `${kind}:${cell}`;
  const cached = st.tiles[key];
  if (cached) return ctx.createPattern(cached, 'repeat') ?? color;

  const t = createCanvas(cell, cell);
  const tc = t.getContext('2d');
  if (!tc) return color;
  tc.fillStyle = color;

  if (kind === 'dots') {
    tc.beginPath();
    tc.arc(cell / 2, cell / 2, Math.max(1, cell / 2 - 1), 0, Math.PI * 2);
    tc.fill();
  } else {
    const line = Math.max(1, Math.round(cell / 4));
    tc.fillRect(0, 0, cell, line);
    tc.fillRect(0, 0, line, cell);
  }

  st.tiles[key] = t;
  return ctx.createPattern(t, 'repeat') ?? color;
}
