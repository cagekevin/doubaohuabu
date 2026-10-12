/**
 * 图片编辑器（遮脸 / 裁剪 / 涂抹）—— 原 `G3.jsx`（1087 行）
 *
 * ★ **2026-10-12 落（`TD-09-4`）**：a+b 两块纯规则（`imageCrop.ts` / `maskBrush.ts`）早已落，
 *   本文件是最后一块 —— **视图半**（加载 / 双模式状态机 / 指针事件 / 保存）。
 * ★ **`docs/过程.md` §2.2 定稿**：`ui/panels/ImageEditor.tsx`，**动态导入（`lazy`）**，判据 **M3**。
 *
 * ⚠️ **分层边界（铁律②：`ui` 不得 import `adapters`）**：
 *   · 遮脸绘制 → `lib/image.ts` 的 `drawMaskEffect`（效果分发，`adapters/media/facemask.ts` 的
 *     `drawMask` 已收口到它）+ `core/rules/facemask.ts` 的 `maskCellSize`（格子公式）；
 *   · 裁剪几何 → `core/rules/imageCrop.ts`；笔刷/撤销 → `core/rules/maskBrush.ts`；
 *   · 人脸检测 → `hostOps.detectFaces`（经 `MediaPort`；`err` 透传原文）+ `hostOps.faceDetectStats`
 *     （**一张脸都没返回**时分档 —— 判据在纯层 `core/rules/faceDetect.explainEmptyFaceDetect`）；
 *   · 复制到剪贴板 → `hostOps.copyImage`（经 `ClipboardPort.writeImage`）。
 *
 * ⚠️ **与源的两处有意简化/差异（登记 `TD-09-4`）**：
 *   ① 保存**直接传 base64**（源是编辑器先 `saveImageSync` 外置）—— 本仓外置已收进
 *      `replaceMaterialImage` / `replaceImageGenImage`（判据 C1：单一外置点）；
 *   ② Esc 走 **window 级** `keydown`（源同法），**不用** `useEscapeKey`（元素级，焦点在 canvas 不生效）。
 *   ~~③ 人脸失败不做 GPU/WebGL 细分~~ —— **已按逐字对源补回**（`G3.jsx:346-350` 的三档）：
 *      原以「消费者替生产者分类」（原则 6）为由省掉，但那同时**把真失败说成了「未识别到人脸」**
 *      （用户可见的错话）；补回时把判据**收进纯层**（`core/rules/faceDetect`，可测 + 单点），
 *      而不是留在视图里就地正则。
 *
 * ⚠️ **本组件不可单测**（canvas 实时交互）—— 靠 Electron 内运行时验证；纯几何在 `core/rules` 已有单测。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHostOps } from '@/state';
import { IMAGE_EDITOR_TEXT } from '@/constants/text';
import { FACE_MASK_EFFECTS, FACE_MASK_EFFECT_LABEL, type FaceMaskEffect } from '@/constants/facemask';
import {
  applyCrop,
  cropRatioOf,
  CROP_MIN_EDGE,
  CROP_RATIO_PRESETS,
  initialCropRect,
  type CropRect,
} from '@/core/rules/imageCrop';
import { maskCellSize } from '@/core/rules/facemask';
// ★ 「一张脸都没检测到」的分档判据（原 `G3.jsx:346-350`）—— 纯层，可测
import { explainEmptyFaceDetect } from '@/core/rules/faceDetect';
import { BRUSH_DEFAULT_DIAMETER, BRUSH_UNDO_LIMIT, brushPatchRect, pushUndoSnapshot } from '@/core/rules/maskBrush';
import { createCanvas, createTmpState, drawMaskEffect, type TmpState } from '@/lib/image';
import { clamp } from '@/lib/math';
// ★ 浮层壳走**共享件**（遮罩 / 卡片 / 头三槽 / 关闭钮 / 正文 / 脚只有一种）
import { PanelShell } from '@/ui/common/PanelShell';
import styles from './ImageEditor.module.css';

/** 脸框最小边（源 `El` = 16，`shared.js:42649`） */
const FACE_BOX_MIN_EDGE = 16;
/** 一键遮脸的脸框外扩比例（源 `V0` = 0.1，`shared.js:42650`） */
const FACE_EXPAND_RATIO = 0.1;
/** 笔刷两笔插值步长比例（源 `C * 0.22`，`G3.jsx:320`） */
const BRUSH_STEP_RATIO = 0.22;
/** 缩放范围（源 `Tt(ae * we, 0.05, 12)`，`G3.jsx:678`） */
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 12;
/** 滚轮缩放步进（源 `we = Z.deltaY < 0 ? 1.12 : 0.892857…`，`G3.jsx:677`） */
const ZOOM_IN_STEP = 1.12;
const ZOOM_OUT_STEP = 0.8928571428571428;

/** 编辑器里的脸框（**像素坐标**，与 `core/rules/facemask` 的归一化 `FaceBox` 不同） */
interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 8 向缩放 handle（源 `['nw','n','ne','w','e','sw','s','se']`） */
type Handle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';
const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
/** 拖动模式：`move` 或含方向的 handle */
type DragMode = 'move' | Handle;

export interface ImageEditorProps {
  /** 被编辑的图（`img://` / `data:`） */
  imgRef: string;
  label: string;
  onClose: () => void;
  /** 保存并替换（原 `G3.jsx` 的 `r`）—— 外壳分派到 `replaceMaterialImage` / `replaceImageGenImage` */
  onSaved: (dataUrl: string, size: { w: number; h: number }) => void;
}

export function ImageEditor({ imgRef, label, onClose, onSaved }: ImageEditorProps) {
  const hostOps = useHostOps();

  // ── state（逐一对源 G3.jsx 的 useState）──
  const [mode, setMode] = useState<'mask' | 'crop'>('mask'); // 原 `s`
  const [size, setSize] = useState({ w: 0, h: 0 }); // 原 `a`
  const [loaded, setLoaded] = useState(false); // 原 `c`
  const [error, setError] = useState(''); // 原 `d`
  const [detecting, setDetecting] = useState(''); // 原 `p`
  const [notice, setNotice] = useState(''); // 原 `m`
  const [zoom, setZoom] = useState(1); // 原 `v`
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // 原 `b`
  const [effect, setEffect] = useState<FaceMaskEffect>('mosaic'); // 原 `k`
  const [brushSize, setBrushSize] = useState(BRUSH_DEFAULT_DIAMETER); // 原 `C`
  const [opacity, setOpacity] = useState(1); // 原 `E`
  const [showBoxes, setShowBoxes] = useState(true); // 原 `j`
  const [faces, setFaces] = useState<PixelBox[]>([]); // 原 `z`
  const [activeFace, setActiveFace] = useState(-1); // 原 `R`
  const [canUndo, setCanUndo] = useState(false); // 原 `A`
  const [cropRect, setCropRect] = useState<CropRect | null>(null); // 原 `M`
  const [ratioValue, setRatioValue] = useState('free'); // 原 `_`

  // ── refs ──
  const viewportRef = useRef<HTMLDivElement>(null); // 原 `J`
  const canvasRef = useRef<HTMLCanvasElement>(null); // 原 `se`（编辑画布）
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null); // 原 `ke`（原始图）
  const undoStackRef = useRef<HTMLCanvasElement[]>([]); // 原 `pe`
  const strokeRef = useRef<{ active: boolean; last: { x: number; y: number } | null }>({
    active: false,
    last: null,
  }); // 原 `ce`
  const faceDragRef = useRef<{ index: number; mode: DragMode; start: { x: number; y: number }; orig: PixelBox } | null>(
    null,
  ); // 原 `Ie`
  const cropDragRef = useRef<{ mode: DragMode; start: { x: number; y: number }; orig: CropRect } | null>(null); // 原 `he`
  const panRef = useRef<{ startX: number; startY: number; orig: { x: number; y: number } } | null>(null); // 原 `oe`
  const spaceRef = useRef(false); // 原 `De`
  const tmpStateRef = useRef<TmpState>(createTmpState()); // ★ 编辑器共享的马赛克/pattern 缓存

  /** 让图片适应视口（原 `te`，`G3.jsx:122-137`）—— 声明在加载 effect 之前（effect 内引用不可前向） */
  const fitView = useCallback((w: number, h: number) => {
    const vp = viewportRef.current;
    if (!vp || !w || !h) return;
    const rect = vp.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const z = Math.min(rect.width / w, rect.height / h) * 0.92;
    setZoom(z);
    setOffset({ x: (rect.width - w * z) / 2, y: (rect.height - h * z) / 2 });
  }, []);

  // 换图 ⇒ 立即回到加载态（渲染期调整，不用 effect —— react-hooks/set-state-in-effect）
  const [prevImgRef, setPrevImgRef] = useState(imgRef);
  if (prevImgRef !== imgRef) {
    setPrevImgRef(imgRef);
    setLoaded(false);
    setError('');
  }

  // ── 加载原图（原 `G3.jsx:50-104` 的 effect）──
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        setError(IMAGE_EDITOR_TEXT.badSize);
        return;
      }
      const src = createCanvas(w, h);
      src.getContext('2d')?.drawImage(img, 0, 0);
      sourceCanvasRef.current = src;
      const cv = canvasRef.current;
      if (cv) {
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d');
        ctx?.clearRect(0, 0, w, h);
        ctx?.drawImage(img, 0, 0);
      }
      undoStackRef.current = [];
      setCanUndo(false);
      setFaces([]);
      setActiveFace(-1);
      setCropRect(null);
      setSize({ w, h });
      setLoaded(true);
      requestAnimationFrame(() => fitView(w, h));
    };
    img.onerror = () => {
      if (!cancelled) setError(IMAGE_EDITOR_TEXT.loadFailed);
    };
    img.src = imgRef;
    return () => {
      cancelled = true;
    };
  }, [imgRef, fitView]);

  /** 客户区坐标 → 图片坐标（原 `ut`，`G3.jsx:275-288`） */
  const toImagePos = useCallback(
    (e: { clientX: number; clientY: number }, target?: HTMLElement): { x: number; y: number } => {
      const el = target ?? (e as unknown as { currentTarget: HTMLElement }).currentTarget;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 0, y: 0 };
      return { x: (e.clientX - rect.left) * (size.w / rect.width), y: (e.clientY - rect.top) * (size.h / rect.height) };
    },
    [size],
  );

  // ── 撤销栈（原 `X` 推快照 / `re` 撤销）──
  const pushUndo = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !cv.width) return;
    const snapshot = createCanvas(cv.width, cv.height);
    snapshot.getContext('2d')?.drawImage(cv, 0, 0);
    undoStackRef.current = pushUndoSnapshot(undoStackRef.current, snapshot, BRUSH_UNDO_LIMIT);
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    const snapshot = undoStackRef.current.pop();
    const cv = canvasRef.current;
    if (!snapshot || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(snapshot, 0, 0);
    ctx.restore();
    setCanUndo(undoStackRef.current.length > 0);
  }, []);

  // ── 遮脸涂抹（原 `Je` + `Qe`；`Qe` 已收口到 `drawMaskEffect`）──
  const stroke = useCallback(
    (x: number, y: number) => {
      const ctx = canvasRef.current?.getContext('2d');
      const src = sourceCanvasRef.current;
      if (!ctx || !src) return;
      const r = brushSize / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      const rect = brushPatchRect(x, y, r);
      drawMaskEffect(ctx, src, rect.x, rect.y, rect.w, rect.h, effect, maskCellSize(effect, rect.w, rect.h, 1), opacity, tmpStateRef.current);
      ctx.restore();
    },
    [brushSize, effect, opacity],
  );

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'mask' || e.button === 1 || e.button === 2 || spaceRef.current) return;
      const pos = toImagePos(e);
      strokeRef.current = { active: true, last: pos };
      pushUndo();
      stroke(pos.x, pos.y);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [mode, toImagePos, pushUndo, stroke],
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const st = strokeRef.current;
      if (!st.active) return;
      const pos = toImagePos(e);
      const last = st.last ?? pos;
      const dx = pos.x - last.x;
      const dy = pos.y - last.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1, brushSize * BRUSH_STEP_RATIO);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        stroke(last.x + dx * t, last.y + dy * t);
      }
      st.last = pos;
    },
    [toImagePos, brushSize, stroke],
  );

  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (strokeRef.current.active) {
      strokeRef.current.active = false;
      strokeRef.current.last = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  // ── 识别脸框（原 `At`，`G3.jsx:339-369`）──
  const detectFaces = useCallback(async () => {
    setDetecting(IMAGE_EDITOR_TEXT.detectingHint);
    setNotice('');
    const r = await hostOps.detectFaces(imgRef);
    setDetecting('');
    if (!r.ok) {
      setNotice(IMAGE_EDITOR_TEXT.detectFail(r.message));
      return;
    }
    if (!r.value.length) {
      // ★ **一张脸都没有 ≠「没识别到人脸」**（原 `G3.jsx:346-350`，逐字对源）：读本次统计分档 ——
      //   检测器**整个失败**（`failed >= tried`）时要说「识别失败」（GPU/WebGL 不可用 / 原始错误原文），
      //   否则才说「未识别到人脸」。判据是纯的 ⇒ 在 `core/rules/faceDetect.explainEmptyFaceDetect`。
      const how = explainEmptyFaceDetect(hostOps.faceDetectStats());
      setNotice(
        how.kind === 'gpu'
          ? IMAGE_EDITOR_TEXT.gpuUnavailable
          : how.kind === 'failed'
            ? IMAGE_EDITOR_TEXT.detectFail(how.reason)
            : IMAGE_EDITOR_TEXT.noFaces,
      );
      return;
    }
    setFaces(
      r.value.map((f) => ({ x: f.nx * size.w, y: f.ny * size.h, w: f.nw * size.w, h: f.nh * size.h })),
    );
    setActiveFace(-1);
    setShowBoxes(true);
    setNotice(IMAGE_EDITOR_TEXT.detectedBoxes(r.value.length));
  }, [hostOps, imgRef, size]);

  // ── 一键遮脸（原 `_t`，`G3.jsx:370-398`）──
  const applyAll = useCallback(() => {
    const cv = canvasRef.current;
    const src = sourceCanvasRef.current;
    if (!cv || !src) return;
    if (!faces.length) {
      setNotice(IMAGE_EDITOR_TEXT.needBoxes);
      return;
    }
    pushUndo();
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    for (const f of faces) {
      const ex = f.w * FACE_EXPAND_RATIO;
      const ey = f.h * FACE_EXPAND_RATIO;
      const x = clamp(f.x - ex, 0, cv.width);
      const y = clamp(f.y - ey, 0, cv.height);
      const w = clamp(f.w + ex * 2, 0, cv.width - x);
      const h = clamp(f.h + ey * 2, 0, cv.height - y);
      if (w <= 0 || h <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      drawMaskEffect(ctx, src, x, y, w, h, effect, maskCellSize(effect, w, h, 1), opacity, tmpStateRef.current);
      ctx.restore();
    }
    setNotice(IMAGE_EDITOR_TEXT.maskedBoxes(faces.length));
  }, [faces, effect, opacity, pushUndo]);

  // ── 整图遮脸（原 `Mt`，`G3.jsx:399-408`）──
  const applyWhole = useCallback(() => {
    const cv = canvasRef.current;
    const src = sourceCanvasRef.current;
    if (!cv || !src) return;
    pushUndo();
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    drawMaskEffect(ctx, src, 0, 0, cv.width, cv.height, effect, maskCellSize(effect, cv.width, cv.height, 1), opacity, tmpStateRef.current);
    setNotice(IMAGE_EDITOR_TEXT.maskedWhole);
  }, [effect, opacity, pushUndo]);

  // ── 脸框拖动（原 `zt`/`Rt`/`Be`，`G3.jsx:409-482`）──
  const onFacePointerDown = useCallback(
    (e: React.PointerEvent, index: number, mode: DragMode) => {
      e.stopPropagation();
      e.preventDefault();
      const orig = faces[index];
      if (!orig) return;
      setActiveFace(index);
      const overlay = ((e.currentTarget as HTMLElement).closest(`.${styles.overlay}`) ?? e.currentTarget) as HTMLElement;
      faceDragRef.current = { index, mode, start: toImagePos(e, overlay), orig: { ...orig } };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [faces, toImagePos],
  );

  const onFacePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = faceDragRef.current;
      if (!drag) return;
      const pos = toImagePos(e, e.currentTarget as HTMLElement);
      const dx = pos.x - drag.start.x;
      const dy = pos.y - drag.start.y;
      const orig = drag.orig;
      setFaces((prev) => {
        const next = [...prev];
        if (drag.mode === 'move') {
          next[drag.index] = {
            x: clamp(orig.x + dx, 0, size.w - orig.w),
            y: clamp(orig.y + dy, 0, size.h - orig.h),
            w: orig.w,
            h: orig.h,
          };
        } else {
          let l = orig.x;
          let t = orig.y;
          let r = orig.x + orig.w;
          let b = orig.y + orig.h;
          if (drag.mode.includes('w')) l = clamp(orig.x + dx, 0, r - FACE_BOX_MIN_EDGE);
          if (drag.mode.includes('e')) r = clamp(orig.x + orig.w + dx, l + FACE_BOX_MIN_EDGE, size.w);
          if (drag.mode.includes('n')) t = clamp(orig.y + dy, 0, b - FACE_BOX_MIN_EDGE);
          if (drag.mode.includes('s')) b = clamp(orig.y + orig.h + dy, t + FACE_BOX_MIN_EDGE, size.h);
          next[drag.index] = { x: l, y: t, w: r - l, h: b - t };
        }
        return next;
      });
    },
    [toImagePos, size],
  );

  const onFacePointerUp = useCallback((e: React.PointerEvent) => {
    if (faceDragRef.current) {
      faceDragRef.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  // ── 裁剪框拖动（原 `it`/`kt`/`xt`，`G3.jsx:483-599`）──
  const onCropPointerDown = useCallback(
    (e: React.PointerEvent, mode: DragMode) => {
      e.stopPropagation();
      e.preventDefault();
      if (!cropRect) return;
      const overlay = ((e.currentTarget as HTMLElement).closest(`.${styles.overlay}`) ?? e.currentTarget) as HTMLElement;
      cropDragRef.current = { mode, start: toImagePos(e, overlay), orig: { ...cropRect } };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [cropRect, toImagePos],
  );

  const onCropPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = cropDragRef.current;
      if (!drag) return;
      const pos = toImagePos(e, e.currentTarget as HTMLElement);
      const dx = pos.x - drag.start.x;
      const dy = pos.y - drag.start.y;
      const orig = drag.orig;
      const ratio = cropRatioOf(CROP_RATIO_PRESETS, ratioValue) ?? 0;
      setCropRect(() => {
        if (drag.mode === 'move') {
          return {
            x: clamp(orig.x + dx, 0, size.w - orig.w),
            y: clamp(orig.y + dy, 0, size.h - orig.h),
            w: orig.w,
            h: orig.h,
          };
        }
        let l = orig.x;
        let t = orig.y;
        let r = orig.x + orig.w;
        let b = orig.y + orig.h;
        const wdir = drag.mode.includes('w');
        const edir = drag.mode.includes('e');
        const ndir = drag.mode.includes('n');
        const sdir = drag.mode.includes('s');
        if (wdir) l = clamp(orig.x + dx, 0, r - CROP_MIN_EDGE);
        if (edir) r = clamp(orig.x + orig.w + dx, l + CROP_MIN_EDGE, size.w);
        if (ndir) t = clamp(orig.y + dy, 0, b - CROP_MIN_EDGE);
        if (sdir) b = clamp(orig.y + orig.h + dy, t + CROP_MIN_EDGE, size.h);
        let w = r - l;
        let h = b - t;
        if (ratio) {
          const rv = /^\d/.test(ratioValue) ? ratio : 1;
          h = w / rv;
          if (h > size.h) {
            h = size.h;
            w = h * rv;
          }
          if (sdir) t = b - h;
          else b = t + h;
          if (wdir) l = r - w;
          else r = l + w;
          if (l < 0) {
            l = 0;
            r = w;
          }
          if (t < 0) {
            t = 0;
            b = h;
          }
          if (r > size.w) {
            r = size.w;
            l = r - w;
          }
          if (b > size.h) {
            b = size.h;
            t = b - h;
          }
          w = r - l;
          h = b - t;
        }
        return { x: l, y: t, w, h };
      });
    },
    [toImagePos, ratioValue, size],
  );

  const onCropPointerUp = useCallback((e: React.PointerEvent) => {
    if (cropDragRef.current) {
      cropDragRef.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  // ── 进入裁剪模式 / 重置框后初始化裁剪框（原 `G3.jsx:600-624`）—— 渲染期调整，不用 effect ──
  if (mode === 'crop' && loaded && !cropRect) {
    setCropRect(initialCropRect(size, cropRatioOf(CROP_RATIO_PRESETS, ratioValue)));
  }

  // ── 应用裁剪（原 `Nt`，`G3.jsx:625-666`）──
  const applyCropNow = useCallback(() => {
    const cv = canvasRef.current;
    const src = sourceCanvasRef.current;
    if (!cv || !src || !cropRect) return;
    const rect = applyCrop(cropRect, size);
    // 把裁剪区域画回两张画布并缩小尺寸（原 `we`，`G3.jsx:639-649`）
    const cropTo = (canvas: HTMLCanvasElement) => {
      const tmp = createCanvas(rect.w, rect.h);
      tmp.getContext('2d')?.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      canvas.width = rect.w;
      canvas.height = rect.h;
      canvas.getContext('2d')?.clearRect(0, 0, rect.w, rect.h);
      canvas.getContext('2d')?.drawImage(tmp, 0, 0);
    };
    cropTo(cv);
    cropTo(src);
    sourceCanvasRef.current = src;
    undoStackRef.current = [];
    setCanUndo(false);
    setFaces([]);
    setActiveFace(-1);
    setCropRect(null);
    setSize({ w: rect.w, h: rect.h });
    setNotice(IMAGE_EDITOR_TEXT.cropped(rect.w, rect.h));
    requestAnimationFrame(() => fitView(rect.w, rect.h));
  }, [cropRect, size, fitView]);

  // ── 滚轮缩放（原 `gt`，`G3.jsx:667-688`）──
  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setZoom((prev) => {
        const step = e.deltaY < 0 ? ZOOM_IN_STEP : ZOOM_OUT_STEP;
        const next = clamp(prev * step, ZOOM_MIN, ZOOM_MAX);
        const ratio = next / prev;
        setOffset((o) => ({ x: mx - (mx - o.x) * ratio, y: my - (my - o.y) * ratio }));
        return next;
      });
    },
    [],
  );

  // ── 平移（原 `Ke`/`Ct`/`ee`，`G3.jsx:689-735`；空格或右键拖拽）──
  const onViewportPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 1 && e.button !== 2 && !spaceRef.current) return;
      e.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      panRef.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, orig: { ...offset } };
      viewportRef.current?.setPointerCapture(e.pointerId);
    },
    [offset],
  );

  const onViewportPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!pan || !rect) return;
    setOffset({ x: pan.orig.x + (e.clientX - rect.left - pan.startX), y: pan.orig.y + (e.clientY - rect.top - pan.startY) });
  }, []);

  const onViewportPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current) {
      panRef.current = null;
      viewportRef.current?.releasePointerCapture(e.pointerId);
    }
  }, []);

  // ── 键盘：Esc 关 / Space 平移 / Delete 删脸框（原 `G3.jsx:736-772`）──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = true;
        e.preventDefault();
      }
      // ⚠️ **不在这里处理 `Esc`** —— 已随 `PanelShell`（`ui/common/` 是 `Escape` 唯一落点），
      //    且它的监听也是 window 级 ⇒ 焦点在 canvas 时同样生效（本组件原先自己挂一份的原因）
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeFace >= 0 && mode === 'mask') {
        const tag = (e.target as HTMLElement | null)?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setFaces((prev) => prev.filter((_, i) => i !== activeFace));
        setActiveFace(-1);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onClose, activeFace, mode]);

  // ── 保存 / 复制（原 `ve`/`qe`/`tt`，`G3.jsx:791-841`）──
  const toDataUrl = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return '';
    if (/\.jpe?g($|\?)/i.test(imgRef) || /^data:image\/jpe?g/i.test(imgRef)) {
      return cv.toDataURL('image/jpeg', 0.95);
    }
    return cv.toDataURL('image/png');
  }, [imgRef]);

  const save = useCallback(() => {
    const cv = canvasRef.current;
    const dataUrl = toDataUrl();
    if (!dataUrl || !cv) return;
    onSaved(dataUrl, { w: cv.width, h: cv.height });
  }, [toDataUrl, onSaved]);

  const copy = useCallback(async () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dataUrl = cv.toDataURL('image/png');
    const r = await hostOps.copyImage({ dataUrl });
    if (r.ok) setNotice(IMAGE_EDITOR_TEXT.copied);
    else setNotice(IMAGE_EDITOR_TEXT.copyFailed(r.message));
  }, [hostOps]);

  const zoomPercent = Math.round(zoom * 100);
  const hint = mode === 'mask' ? IMAGE_EDITOR_TEXT.hintMask : IMAGE_EDITOR_TEXT.hintCrop;
  const noticeLine = notice || error || detecting;

  return (
    /*
     * ★★ **2026-10-12 收口到共享壳**（此前它自造了一套 `.overlayRoot` + `.scrim` + `.panelHead`
     *   + 自绘 `✕` —— 正是 `PanelShell` 要消灭的那份重复）。
     *   ⇒ 遮罩 / 卡片 / 头三槽 / 关闭钮 / 正文 / 脚**全部**归 `ui/common/PanelShell`：
     *     · 中槽 = 页签（`一键遮脸 / 裁剪`）· 脚 = 提示 + 缩放 + 动作 · `✕` = 真源那颗。
     *   ⚠️ `Esc` 也随之归 `PanelShell`（`ui/common/` 是 `Escape` 唯一落点）——
     *      本组件自己的 window 监听**不再处理 Esc**（见下面的键盘 effect）。
     */
    <PanelShell
      overlay
      onClose={onClose}
      className={styles.panel}
      bodyClassName={styles.body}
      testId="image-editor"
      title={
        <>
          {IMAGE_EDITOR_TEXT.title}
          {label ? <span className={styles.titleSub}>{IMAGE_EDITOR_TEXT.titleSub(label)}</span> : null}
        </>
      }
      meta={
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab}${mode === 'mask' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setMode('mask')}
          >
            {IMAGE_EDITOR_TEXT.tabMask}
          </button>
          <button
            type="button"
            className={`${styles.tab}${mode === 'crop' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setMode('crop')}
          >
            {IMAGE_EDITOR_TEXT.tabCrop}
          </button>
        </div>
      }
      footer={
        <>
          <div className={styles.hint}>{loaded ? `${hint}  ·  ${size.w}×${size.h}` : ''}</div>
          <div className={styles.zoom}>
            <button type="button" className={styles.zoomBtn} onClick={() => setZoom((z) => clamp(z / 1.15, ZOOM_MIN, ZOOM_MAX))}>
              −
            </button>
            <span className={styles.zoomVal}>{zoomPercent}%</span>
            <button type="button" className={styles.zoomBtn} onClick={() => setZoom((z) => clamp(z * 1.15, ZOOM_MIN, ZOOM_MAX))}>
              +
            </button>
            <button type="button" className={`${styles.zoomBtn} ${styles.zoomFit}`} onClick={() => fitView(size.w, size.h)}>
              {IMAGE_EDITOR_TEXT.fit}
            </button>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={onClose}>
              {IMAGE_EDITOR_TEXT.cancel}
            </button>
            <button type="button" className={styles.btn} onClick={() => void copy()} disabled={!loaded}>
              {IMAGE_EDITOR_TEXT.copy}
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={!loaded}>
              {IMAGE_EDITOR_TEXT.save}
            </button>
          </div>
        </>
      }
    >
        <div className={styles.toolbar}>
          {mode === 'mask' ? (
            <>
              <div className={styles.group}>
                <span className={styles.groupLabel}>{IMAGE_EDITOR_TEXT.effectLabel}</span>
                <div className={styles.seg}>
                  {FACE_MASK_EFFECTS.map((v) => (
                    <button
                      type="button"
                      className={`${styles.segBtn}${effect === v ? ` ${styles.segActive}` : ''}`}
                      title={FACE_MASK_EFFECT_LABEL[v].hint}
                      onClick={() => setEffect(v)}
                      key={v}
                    >
                      {FACE_MASK_EFFECT_LABEL[v].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.divider} />
              <div className={styles.group}>
                <span className={styles.groupLabel}>{IMAGE_EDITOR_TEXT.brushLabel}</span>
                <input
                  className={styles.range}
                  type="range"
                  min={12}
                  max={220}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  title={IMAGE_EDITOR_TEXT.brushTitle(brushSize)}
                />
                <span className={styles.rangeVal}>{brushSize}</span>
              </div>
              <div className={styles.group}>
                <span className={styles.groupLabel}>{IMAGE_EDITOR_TEXT.opacityLabel}</span>
                <input
                  className={styles.range}
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                  title={IMAGE_EDITOR_TEXT.opacityTitle(Math.round(opacity * 100))}
                />
                <span className={styles.rangeVal}>{Math.round(opacity * 100)}%</span>
              </div>
              <label className={styles.check}>
                <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
                {IMAGE_EDITOR_TEXT.showBoxes}
              </label>
              <div className={styles.divider} />
              <div className={styles.group}>
                <button type="button" className={styles.btn} onClick={() => void detectFaces()} disabled={!!detecting}>
                  {detecting ? IMAGE_EDITOR_TEXT.detecting : IMAGE_EDITOR_TEXT.detectFaces}
                </button>
                <button type="button" className={styles.btn} onClick={applyAll} disabled={!faces.length}>
                  {IMAGE_EDITOR_TEXT.applyAll}
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => {
                    setFaces([]);
                    setActiveFace(-1);
                    setNotice(IMAGE_EDITOR_TEXT.clearedBoxes);
                  }}
                  disabled={!faces.length}
                >
                  {IMAGE_EDITOR_TEXT.clearBoxes}
                </button>
                <span className={styles.count}>{IMAGE_EDITOR_TEXT.boxCount(faces.length)}</span>
              </div>
              <div className={styles.divider} />
              <button type="button" className={styles.btn} onClick={undo} disabled={!canUndo}>
                {IMAGE_EDITOR_TEXT.undo}
              </button>
              <button type="button" className={styles.btn} onClick={applyWhole} title={IMAGE_EDITOR_TEXT.applyWholeTitle}>
                {IMAGE_EDITOR_TEXT.applyWhole}
              </button>
            </>
          ) : (
            <>
              <div className={styles.group}>
                <span className={styles.groupLabel}>{IMAGE_EDITOR_TEXT.ratioLabel}</span>
                <div className={styles.seg}>
                  {CROP_RATIO_PRESETS.map((p) => (
                    <button
                      type="button"
                      className={`${styles.segBtn}${ratioValue === p.value ? ` ${styles.segActive}` : ''}`}
                      onClick={() => setRatioValue(p.value)}
                      key={p.value}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.divider} />
              <button type="button" className={styles.btn} onClick={() => setCropRect(null)}>
                {IMAGE_EDITOR_TEXT.resetBox}
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={applyCropNow} disabled={!cropRect}>
                {IMAGE_EDITOR_TEXT.applyCrop}
              </button>
            </>
          )}
        </div>

        {noticeLine ? (
          <div className={`${styles.notice}${error ? ` ${styles.noticeError}` : ''}`}>{noticeLine}</div>
        ) : null}

        <div
          ref={viewportRef}
          className={`${styles.viewport}${mode === 'mask' ? ` ${styles.cursorBrush}` : ''}`}
          onWheel={onWheel}
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={onViewportPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!loaded && !error ? <div className={styles.loading}>{IMAGE_EDITOR_TEXT.loading}</div> : null}
          {loaded ? (
            <div className={styles.stage} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
              <div className={styles.canvasWrap} style={{ width: size.w, height: size.h }}>
                <canvas
                  ref={canvasRef}
                  className={styles.canvas}
                  style={{ width: size.w, height: size.h }}
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                  onPointerLeave={onCanvasPointerUp}
                />
                {mode === 'mask' ? (
                  <div className={styles.overlay} onPointerMove={onFacePointerMove} onPointerUp={onFacePointerUp}>
                    {showBoxes
                      ? faces.map((f, i) => (
                          <div
                            className={`${styles.facebox}${activeFace === i ? ` ${styles.faceboxActive}` : ''}`}
                            style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
                            onPointerDown={(e) => onFacePointerDown(e, i, 'move')}
                            key={i}
                          >
                            {HANDLES.map((h) => (
                              <span
                                className={`${styles.handle} ${styles[`handle${h}` as keyof typeof styles]}`}
                                onPointerDown={(e) => onFacePointerDown(e, i, h)}
                                key={h}
                              />
                            ))}
                          </div>
                        ))
                      : null}
                  </div>
                ) : null}
                {mode === 'crop' && cropRect ? (
                  <div className={styles.overlay} onPointerMove={onCropPointerMove} onPointerUp={onCropPointerUp}>
                    <div className={`${styles.cropShade} ${styles.shadeTop}`} style={{ height: cropRect.y }} />
                    <div className={`${styles.cropShade} ${styles.shadeBottom}`} style={{ top: cropRect.y + cropRect.h, bottom: 0 }} />
                    <div className={`${styles.cropShade} ${styles.shadeLeft}`} style={{ top: cropRect.y, height: cropRect.h, width: cropRect.x }} />
                    <div
                      className={`${styles.cropShade} ${styles.shadeRight}`}
                      style={{ top: cropRect.y, height: cropRect.h, left: cropRect.x + cropRect.w, right: 0 }}
                    />
                    <div
                      className={styles.cropbox}
                      style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
                      onPointerDown={(e) => onCropPointerDown(e, 'move')}
                    >
                      <div className={styles.cropGrid} />
                      {HANDLES.map((h) => (
                        <span
                          className={`${styles.handle} ${styles[`handle${h}` as keyof typeof styles]}`}
                          onPointerDown={(e) => onCropPointerDown(e, h)}
                          key={h}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
    </PanelShell>
  );
}
