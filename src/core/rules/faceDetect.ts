/**
 * 人脸检测的**纯计算**（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐条回源抄录**）：
 *   - `UD` shared.js:39516-39531 —— **IoU**（交并比，含两个守卫）
 *   - `zD` shared.js:39532-39545 —— **NMS**（按 score 降序，IoU > 阈值即丢）
 *   - `T0` shared.js:39545 —— 缩放基准 `1600`
 *   - `wS` shared.js:39546-39632 —— **缩放计划**（2 模型 × 2 缩放）+ 过滤 + 夹取
 *   - `kl` shared.js:39638-39648 —— 夹到 `[0,1]`
 *   - `HD` shared.js:39637 —— 检测时的**加载宽度** `1024`
 *   - `VD` shared.js:39669-39704 —— 像素框 → **归一化 `FaceBox`**（`kl` 夹取）
 *
 * ⚠️ **为什么纯计算要单独成文件**（而不是全塞 `adapters/media/faceDetect.ts`）：
 *    项目规约「原则 7：测试只在 `core` 各层下的 `tests/` 目录」⇒ 塞进 `adapters/` 的算法**无法单测**。
 *    ⇒ 按判据 C3「按关注点拆」：**可测的纯计算** 留在这里，**mediapipe/DOM 编排** 进 `adapters/`。
 *
 * ⚠️ 本模块**不接触** `window`/`document`/`Date`/随机（原则 4）。
 */

import type { FaceBox } from './facemask';
import { clamp } from '@/lib/math';

/** 像素坐标的人脸框（原 `{x, y, w, h, score}`） */
export interface PixelFaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

/** 缩放基准（原 `T0` 39545）—— ⚠️ **不是超时**，是「最长边目标」 */
export const FACE_DETECT_BASE = 1600;
/** 缩放上限倍数（原 `wS` 的 `T0 * 2.2`） */
export const FACE_DETECT_MAX_FACTOR = 2.2;
/** 第二次尝试的额外放大（原 `wS` 的 `* 1.8`） */
export const FACE_DETECT_ALT_SCALE = 1.8;
/** 最小置信度（原 `minDetectionConfidence: 0.35` **与**过滤阈值同为 0.35） */
export const FACE_MIN_SCORE = 0.35;
/** 最小边长（px，原 `f.w > 2 && f.h > 2`） */
export const FACE_MIN_SIZE = 2;
/** NMS 的 IoU 阈值（原 `zD` 第二参默认值 `0.45`） */
export const FACE_NMS_IOU = 0.45;
/** 检测时的图片加载宽度（原 `HD` = 1024） */
export const FACE_LOAD_WIDTH = 1024;

/** 交并比（原 `UD` 39516） */
export function iou(a: PixelFaceBox, b: PixelFaceBox): number {
  const ix = Math.max(a.x, b.x);
  const iy = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, ix2 - ix) * Math.max(0, iy2 - iy);
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * 非极大值抑制（原 `zD` 39532）
 *
 * ⚠️ 语义：按 `score` **降序**遍历，若与任一**已保留**框的 IoU `> iouThreshold` 则丢弃。
 *    注意是 `>`（不是 `>=`）—— 恰好等于阈值时**保留**。
 */
export function nmsBoxes<T extends PixelFaceBox>(
  boxes: readonly T[],
  iouThreshold: number = FACE_NMS_IOU,
): T[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: T[] = [];
  for (const box of sorted) {
    if (!kept.some((k) => iou(k, box) > iouThreshold)) kept.push(box);
  }
  return kept;
}

/** 一次检测尝试（原 `wS` 的 plan 项） */
export interface DetectAttempt {
  detector: 'full' | 'short';
  scale: number;
}

/**
 * 构造检测尝试计划（原 `wS` 39546 的 `a` 数组 + 跳过判据）
 *
 * 原计划恒为 4 项：`[full, short] × [base, base*1.8]`；跳过条件 = `scale > 0.01 && maxSide*scale > 3520`。
 *
 * ★ **回源发现：该跳过条件实际是死代码** ——
 *    `base = min(1, 1600/maxSide)` ⇒ `maxSide*base <= 1600`、`maxSide*base*1.8 <= 2880`，
 *    两者都 `< 3520` ⇒ **永不跳过**。本实现**按源保留**该判据（万一将来改基准就会生效）。
 *
 * @returns **可执行**的尝试列表（已滤掉会被跳过的项 —— 被跳过的项在源码里也不产生任何可观测影响）
 */
export function buildDetectPlan(width: number, height: number): DetectAttempt[] {
  // ⚠️ **任一维为 0 就无意义**（原 `wS` 在算计划前就 `if (!W || !H) return []`）
  if (!width || !height) return [];
  const maxSide = Math.max(width, height);
  const base = Math.min(1, FACE_DETECT_BASE / maxSide);
  const plan: DetectAttempt[] = [
    { detector: 'full', scale: base },
    { detector: 'short', scale: base },
    { detector: 'full', scale: base * FACE_DETECT_ALT_SCALE },
    { detector: 'short', scale: base * FACE_DETECT_ALT_SCALE },
  ];
  const cap = FACE_DETECT_BASE * FACE_DETECT_MAX_FACTOR;
  return plan.filter((a) => !(a.scale > 0.01 && maxSide * a.scale > cap));
}

/** 夹到图内（原 `wS` 尾部 39624-39631）—— `x/y` 夹到 `[0, side-1]`，`w/h` 至少 1 且不越界 */
export function clampBoxToImage(box: PixelFaceBox, width: number, height: number): PixelFaceBox {
  const x = clamp(box.x, 0, width - 1);
  const y = clamp(box.y, 0, height - 1);
  return {
    x,
    y,
    w: Math.max(1, Math.min(box.w, width - x)),
    h: Math.max(1, Math.min(box.h, height - y)),
    score: box.score,
  };
}

/** 置信度 + 最小边长过滤（原 `wS` 39620-39622） */
export function isUsableFaceBox(box: PixelFaceBox): boolean {
  return box.score >= FACE_MIN_SCORE && box.w > FACE_MIN_SIZE && box.h > FACE_MIN_SIZE;
}

/**
 * 一次检测的统计（原 `Rs`）—— **由 `adapters/media/faceDetect` 维护**，本模块只用它的形状
 *
 * ⚠️ 形状放这里（而不是适配器里）：`MediaPort.faceDetectStats` 要暴露它，而端口**只有类型**
 *   （原则 3）—— 与同文件族 `facemask` 的 `FaceBox`/`FaceMaskOpts` 同法（端口 import `core/rules`）。
 * ⚠️ **每次检测重置**（源 `Rs`；`detectFacesInImage` 在跑计划**之前**清零）。
 */
export interface FaceDetectStats {
  /** 已尝试的检测次数 */
  tried: number;
  /** 抛异常的检测次数 */
  failed: number;
  /** 去重后的错误原文 */
  errors: string[];
}

/** GPU / WebGL 不可用的错误特征（原 `G3.jsx:349` 内联正则） */
export const FACE_DETECT_GPU_RE = /activeTexture|WebGL|GL_|gpu/i;

/**
 * 「一张脸都没检测到」时该说哪句话（原 `G3.jsx:346-350` 的三目）—— ★ 纯函数
 *
 * 源逐字：
 * ```js
 * const K = LD();                      // = faceDetectStats()
 * const Y = K.errors[0] || '';
 * K.failed > 0 && K.failed >= K.tried
 *   ? (/activeTexture|WebGL|GL_|gpu/i.test(Y) ? '…GPU/WebGL 不可用…' : `人脸识别失败：${Y || '检测器异常'}`)
 *   : '未识别到人脸，可用效果笔刷手动涂抹遮脸'
 * ```
 *
 * ⚠️ 判据是「**全部**尝试都抛」（`failed >= tried` 且 `failed > 0`，`tried` 恒 > 0）——
 *    「跑通了但没脸」是**另一档**（`no-faces`），不能混（混了就会把真失败说成\"没识别到\"）。
 * ⚠️ `errors[0]` 可能为空串 ⇒ 交调用方，由文案层兜「检测器异常」（原 `G3:349` 的 `Y || …`）。
 */
export type EmptyFaceDetectExplanation =
  | { kind: 'no-faces' }
  | { kind: 'gpu' }
  | { kind: 'failed'; reason: string };

export function explainEmptyFaceDetect(stats: FaceDetectStats): EmptyFaceDetectExplanation {
  const reason = stats.errors[0] || '';
  if (stats.failed > 0 && stats.failed >= stats.tried) {
    return FACE_DETECT_GPU_RE.test(reason) ? { kind: 'gpu' } : { kind: 'failed', reason };
  }
  return { kind: 'no-faces' };
}

/** 夹到 `[0,1]`（原 `kl` 39638） */
export function clamp01(v: number): number {
  if (v < 0) return 0;
  return v > 1 ? 1 : v;
}

/**
 * 像素框 → 归一化 `FaceBox`（原 `VD` 39669 + `kl`）
 *
 * ⚠️ **有意偏离**：原版归一化结果里还带 `score`，而项目 SSOT 的 `FaceBox` 只有 `{nx,ny,nw,nh}`
 *    ⇒ 这里**丢掉 `score`**（遮脸流程不需要它）。若将来需要按置信度排序，再扩 `FaceBox`。
 */
export function toNormalizedFaceBoxes(
  boxes: readonly PixelFaceBox[],
  width: number,
  height: number,
): FaceBox[] {
  const w = width || 1;
  const h = height || 1;
  return boxes.map((b) => ({
    nx: clamp01(b.x / w),
    ny: clamp01(b.y / h),
    nw: clamp01(b.w / w),
    nh: clamp01(b.h / h),
  }));
}

// ─────────────────────── 显示映射（原 `rL` + `sL`）───────────────────────

/** 脸框显示块的**最小边长**（原 `sL` 的 `r = 4`）—— 太小就点不到 */
export const FACE_RECT_MIN_SIDE = 4;

/** `cover` 适配后的**有效画面区**（原 `rL`） */
export interface CoverFit {
  /** 有效宽 */
  w: number;
  /** 有效高 */
  h: number;
  /** 左右留黑偏移 */
  offX: number;
  /** 上下留黑偏移 */
  offY: number;
}

/**
 * 元素框 → **`object-fit: cover` 后的有效画面区**（原 `rL`，`shared.js:39905-39923`）
 *
 * 源逐字：`r = boxW/boxH`（**框**的宽高比）；`n` = 图片宽高比；
 *   · `n > r`（图更宽）⇒ 宽度撑满 `w = boxW`、高度按图裁 `h = boxW / n`
 *   · 否则 ⇒ 高度撑满 `h = boxH`、宽度按图裁 `w = boxH * n`
 *   · 两侧/上下**居中**留黑（`offX` / `offY`）
 * ⚠️ 任一入参为假值 / `ratio <= 0` ⇒ 全 0（源第一句）。
 */
export function coverFit(boxW: number, boxH: number, ratio: number): CoverFit {
  if (!boxW || !boxH || !ratio || ratio <= 0) return { w: 0, h: 0, offX: 0, offY: 0 };
  const boxRatio = boxW / boxH;
  const w = ratio > boxRatio ? boxW : boxH * ratio;
  const h = ratio > boxRatio ? boxW / ratio : boxH;
  return { w, h, offX: (boxW - w) / 2, offY: (boxH - h) / 2 };
}

/** 一个脸框**在元素里**的落点（原 `sL` 的元素） */
export interface DisplayFaceRect {
  /** 它在 `faces` 里的下标（源就是 `i` —— 点击时按它回查那张脸） */
  i: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 归一化脸框 → **元素内的像素落点**（原 `sL`，`shared.js:39924-39940`）
 *
 * ⚠️ 与源一致的三点：① 有效区为 0 / 没脸 ⇒ `[]`；② 落点 = `off + 归一化值 × 有效边长`；
 *    ③ 宽高各取 `max(minSide, …)`（`minSide` 默认 **4**，源是默认参数 `r = 4`）。
 *
 * @param box 元素**当前**尺寸（`ResizeObserver` 量的那个，不是图片原始尺寸）
 * @param ratio 图片原始宽高比（`natW / natH`）
 */
export function displayFaceRects(
  faces: readonly FaceBox[] | null | undefined,
  box: { w: number; h: number },
  ratio: number,
  minSide: number = FACE_RECT_MIN_SIDE,
): DisplayFaceRect[] {
  const fit = coverFit(box?.w, box?.h, ratio);
  if (!fit.w || !fit.h || !faces || !faces.length) return [];
  return faces.map((f, i) => ({
    i,
    left: fit.offX + (f.nx || 0) * fit.w,
    top: fit.offY + (f.ny || 0) * fit.h,
    width: Math.max(minSide, (f.nw || 0) * fit.w),
    height: Math.max(minSide, (f.nh || 0) * fit.h),
  }));
}
