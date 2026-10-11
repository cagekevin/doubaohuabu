/**
 * 人脸检测（mediapipe 懒加载）—— ★ **只返回脸框，不画**
 *
 * 依据（**逐行回源抄录**）：
 *   - `Ip` shared.js:39477 前 —— 资源基址：`file:` ⇒ **`appasset://mediapipe`**，否则 `/mediapipe`
 *   - `DD` —— wasm 路径（`vision_wasm_internal.js` / `.wasm`）
 *   - `vS` shared.js:39483-39515 —— **懒加载单例**（双模型：`blaze_face_full_range` + `blaze_face_short_range`）
 *   - `wS` shared.js:39546-39632 —— 检测编排（缩放计划 → 检测 → 还原坐标 → 过滤 → NMS → 夹取）
 *   - `VD` shared.js:39669-39704 —— 加载图片 → 检测 → **归一化**
 *   - `LD` shared.js:39477-39482 —— 统计读取
 *   - `Xt` shared.js:22564-22570 —— 图片引用拼 `?w=`（**只对 `img://`**）
 *
 * ⚠️ 为什么在 `adapters/`（判据 A1）：本文件需要 **WASM + DOM**（`<canvas>` 缩放）。
 *    `core/rules` 是纯层（不得碰 WASM/DOM）；`ui` 是视图层（不得碰外部资源）。
 *    纯计算已按 C3 拆到 `core/rules/faceDetect.ts`（那边**可单测**，原则 7）。
 *
 * ⚠️ **懒加载**（判据 B5 · M3）：`@mediapipe/tasks-vision` 走**动态 `import()`**（Vite 会代码分割），
 *    11.2 MB 的 wasm 只在**首次真正检测**时才拉 —— 不影响启动。
 *    ⚠️ 包类型用 `import type`（**编译期擦除**，不破坏懒加载）。
 *
 * ⚠️ **失败可重试 + 如实上报**（原 `vS` 的 `.catch(e => { bl = null; throw e })`）：
 *    加载失败清空单例（下次重试）；检测异常计入统计并**继续**（不吞、不假装成功 —— 原则 6）。
 *
 * ⚠️ **与原版的一处有意省略**：原 `VD` 用模块级 `Map`（`Xc`）按 `key` 缓存结果并做并发去重。
 *    本实现**不做缓存** —— 缓存属「谁持有状态」的问题（原则 1 归 `state`），
 *    且此处缓存会引入陈旧脸框的风险。调用方需要时自行按 key 缓存。
 */

import type { FaceDetector as MpFaceDetector, FaceDetectorResult } from '@mediapipe/tasks-vision';
import type { FaceBox } from '@/core/rules/facemask';
import {
  buildDetectPlan,
  clampBoxToImage,
  isUsableFaceBox,
  nmsBoxes,
  toNormalizedFaceBoxes,
  FACE_LOAD_WIDTH,
  FACE_MIN_SCORE,
  type PixelFaceBox,
} from '@/core/rules/faceDetect';
import { loadImage } from '@/lib/image';
import { withThumb } from '@/stable/protocols/img';

/** 资源目录名（与 `main.js` 的 `appasset://mediapipe/...` → `dist/mediapipe/...` 对应） */
const ASSET_DIR = 'mediapipe';
/** 长焦模型（原 `blaze_face_full_range.tflite`） */
const MODEL_FULL = 'blaze_face_full_range.tflite';
/** 短焦模型（原 `blaze_face_short_range.tflite`） */
const MODEL_SHORT = 'blaze_face_short_range.tflite';

interface Detectors {
  full: MpFaceDetector;
  short: MpFaceDetector;
}

/** 检测统计（原 `Rs`，经 `LD` 读取）—— 供人脸/指纹诊断面板显示 */
export interface FaceDetectStats {
  /** 已尝试的检测次数 */
  tried: number;
  /** 抛异常的检测次数 */
  failed: number;
  /** 去重后的错误原文 */
  errors: string[];
}

/** 懒加载单例（原 `bl`）；失败时置回 `null` 以便重试 */
let detectors: Promise<Detectors> | null = null;
/** 统计（原 `Rs`）—— **每次检测重置** */
let stats: FaceDetectStats = { tried: 0, failed: 0, errors: [] };

/** 读取统计（原 `LD` 39477）—— 返回**副本**，防外部改内部状态 */
export function faceDetectStats(): FaceDetectStats {
  return { ...stats, errors: [...stats.errors] };
}

/**
 * 资源基址（原 `Ip`）
 * ⚠️ 生产环境页面由 `file://` 加载，Chromium 禁止 `file://` 页面 fetch 本地文件
 *    ⇒ 必须走主进程注册的 `appasset://` 特权 scheme（`main.js:652-656, 1060-1098`）。
 */
function assetBase(): string {
  try {
    return typeof location !== 'undefined' && location.protocol === 'file:'
      ? `appasset://${ASSET_DIR}`
      : `/${ASSET_DIR}`;
  } catch {
    return `/${ASSET_DIR}`;
  }
}

/** 懒加载双检测器（原 `vS` 39483） */
function loadDetectors(): Promise<Detectors> {
  detectors ??= (async (): Promise<Detectors> => {
    const base = assetBase();
    const paths = {
      wasmLoaderPath: `${base}/vision_wasm_internal.js`,
      wasmBinaryPath: `${base}/vision_wasm_internal.wasm`,
    };
    // ★ 动态 import ⇒ Vite 代码分割；wasm 只在首次检测时拉（判据 M3）
    const { FaceDetector } = await import('@mediapipe/tasks-vision');
    const make = (model: string): Promise<MpFaceDetector> =>
      FaceDetector.createFromOptions(paths, {
        baseOptions: { modelAssetPath: `${base}/${model}`, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: FACE_MIN_SCORE,
      });
    const [full, short] = await Promise.all([make(MODEL_FULL), make(MODEL_SHORT)]);
    return { full, short };
  })().catch((e: unknown) => {
    detectors = null; // 原版同：清空单例，允许下次重试
    throw e;
  });
  return detectors;
}

/**
 * 缩放图片（原 `OD`）
 * ⚠️ **舍入细节未回源**（原 `OD` 是压缩后的组件级函数，`shared-decls.json` 里没有）——
 *    这里用 `Math.round(边 × scale)`，并保证至少 1px。若日后发现检测结果与原版有系统偏差，
 *    第一个要复核的就是这里。
 */
function scaleImage(img: HTMLImageElement, scale: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D 画布上下文（人脸检测缩放）');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/** 对**已加载**的图片检测，返回**像素**框（原 `wS` 39546） */
export async function detectFacesInImage(img: HTMLImageElement): Promise<PixelFaceBox[]> {
  const width = img.naturalWidth || img.width || 0;
  const height = img.naturalHeight || img.height || 0;
  if (!width || !height) return [];

  const { full, short } = await loadDetectors();
  const byName: Record<'full' | 'short', MpFaceDetector> = { full, short };
  const plan = buildDetectPlan(width, height);

  const hits: PixelFaceBox[] = [];
  /** 同缩放倍数的图片**只缩放一次**（原 `c` 缓存，键 = `scale.toFixed(4)`） */
  const scaled = new Map<string, HTMLCanvasElement>();
  stats = { tried: 0, failed: 0, errors: [] };

  for (const attempt of plan) {
    const key = attempt.scale.toFixed(4);
    let input = scaled.get(key);
    if (!input) {
      input = scaleImage(img, attempt.scale);
      scaled.set(key, input);
    }

    stats.tried += 1;
    let result: FaceDetectorResult;
    try {
      result = byName[attempt.detector].detect(input);
    } catch (e: unknown) {
      stats.failed += 1;
      const msg = String((e as Error | undefined)?.message ?? e);
      if (!stats.errors.includes(msg)) stats.errors.push(msg);
      continue;
    }

    for (const det of result.detections ?? []) {
      const b = det.boundingBox;
      if (!b) continue;
      const score = det.categories?.[0]?.score ?? 0;
      // ★ 命中坐标要**除以缩放倍数**还原回原图（原 `wS` 39616-39619）
      hits.push({
        x: b.originX / attempt.scale,
        y: b.originY / attempt.scale,
        w: b.width / attempt.scale,
        h: b.height / attempt.scale,
        score,
      });
    }
  }

  return nmsBoxes(hits.filter(isUsableFaceBox)).map((b) => clampBoxToImage(b, width, height));
}

/**
 * 检测一张图片 → **归一化**脸框（原 `VD` 39669）
 *
 * @param src 图片引用；`img://` 会拼 `?w=1024`（原 `Xt(src, HD)`，**只对 `img://`**）
 *
 * ⚠️ **2026-10-11 简化**：这里原先自己加了一道 `isImgRef(src) ? … : src` 守卫，注释写着
 *    「直接调 `withThumb` 会给任意 URL 也拼 `?w=`，与原版**不等价**」。现在那道守卫已**收进**
 *    `withThumb` 自身（协议真源按 `Xt` 纠正）⇒ 本地这层冗余，去掉。
 */
export async function detectFaces(src: string): Promise<FaceBox[]> {
  const target = withThumb(src, FACE_LOAD_WIDTH);
  const img = await loadImage(target);
  const width = img.naturalWidth || img.width || 1;
  const height = img.naturalHeight || img.height || 1;
  const boxes = await detectFacesInImage(img);
  return toNormalizedFaceBoxes(boxes, width, height);
}
