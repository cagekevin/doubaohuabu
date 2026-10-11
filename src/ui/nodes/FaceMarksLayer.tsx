/**
 * 人脸遮罩层（原 `iL.jsx`，191 行）—— 素材图上的**检测角标**：识别人脸 → 单击遮脸 → 双击设参数
 *
 * 依据（**逐行回源**）：`iL.jsx`
 *   | 件 | 行 | 语义 |
 *   | - | - | - |
 *   | 检测 | 46-83 | `src` 变了就重测；检测中先写 `loading` |
 *   | 量尺寸 | 84-104 | `ResizeObserver` 量**显示框**（脸框要按它换算） |
 *   | 换落点 | 105-108 | `sL` = 本仓 `displayFaceRects`（纯层，已测） |
 *   | 单击 | 152-160 + `N=220` | **延迟 220ms** 再执行（留给双击判别） |
 *   | 遮脸 | 109-139 | `applyFaceMask` → `replaceMaterialImage(name + '·已遮脸')` → `clearFaceMark` |
 *   | 双击 | 161-168 | `openFaceMaskPanel(nodeId, clientX, clientY)` |
 *   | render | 170-191 | 角标 + 每个人脸框（4 个角 + 提示） |
 *
 * ⚠️ 三处如实差异（登记 `TD-03-19` / `TD-03-20`）：
 *   ① 上游 `detectFaces` **没有取消句柄** ⇒ 用「忽略过期结果」代替真取消（源 `qD` 可取消）；
 *   ② 检测结果**按节点**记忆（`faceMarks[nodeId].key === src` 即不重测），源是**跨节点**按 `src` 缓存；
 *   ③ 遮脸失败源是 `console.warn` **静默** ⇒ 本仓给 toast（失败可见）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHostOps, useStore } from '@/state';
import { displayFaceRects } from '@/core/rules/faceDetect';
import { FACE_MASK_EFFECT_LABEL } from '@/constants/facemask';
import { FACEMASK_TEXT } from '@/constants/text';
import styles from './shared.module.css';

/** 单击延迟（原 `iL.jsx:143` 的 `N = 220`）—— 等这么久没有第二次点击才算单击 */
const CLICK_DELAY_MS = 220;

export interface FaceMarksLayerProps {
  nodeId: string;
  /** 图片地址（`img://` / `data:`）—— 既是检测输入，也是「图片来源」的记忆键 */
  src: string;
  /** 图片**原始**宽高（换算脸框落点用） */
  natW?: number;
  natH?: number;
  /** 节点标签（遮脸后给它加 `·已遮脸`） */
  label?: string;
}

export function FaceMarksLayer({ nodeId, src, natW, natH, label }: FaceMarksLayerProps) {
  /**
   * ★ **`TD-16-107`**：人脸检测 / 遮脸经 **`hostOps` 控制器**（端口注入）——
   *   本组件此前**直接 import `adapters/media`**（违反铁律② `ui-no-adapters`，闸实红 2 条）。
   */
  const hostOps = useHostOps();
  const mark = useStore((s) => s.faceMarks[nodeId]);
  const setFaceMark = useStore((s) => s.setFaceMark);
  const clearFaceMark = useStore((s) => s.clearFaceMark);
  const setFaceMasking = useStore((s) => s.setFaceMasking);
  const replaceMaterialImage = useStore((s) => s.replaceMaterialImage);
  const faceMaskOpts = useStore((s) => s.faceMaskOpts);
  const openFaceMaskPanel = useStore((s) => s.openFaceMaskPanel);
  const pushToast = useStore((s) => s.pushToast);

  const layerRef = useRef<HTMLDivElement>(null);
  /** 显示框尺寸（原 `a`，由 `ResizeObserver` 量） */
  const [box, setBox] = useState({ w: 0, h: 0 });
  const clickTimer = useRef<number | null>(null);

  const status = mark?.status ?? 'idle';
  /**
   * ⚠️ `useMemo`：`?? []` 会在没有检测结果时**每次渲染造新数组** ⇒ 会让下面的 `useMemo`/`useCallback`
   *   依赖每帧都变（`GenVideoNode` 同款先例）。
   */
  const faces = useMemo(() => mark?.faces ?? [], [mark]);
  const masking = mark?.masking ?? null;

  /** ① 检测（原 46-83）—— 同一张图且已有结果就不重测（差异 ②） */
  useEffect(() => {
    if (!src) return;
    if (mark?.key === src && mark.status !== 'loading') return;
    setFaceMark(nodeId, { status: 'loading', key: src, faces: [], masking: null });
    // 差异 ①：没有取消句柄 ⇒ 用「忽略过期结果」代替
    let stale = false;
    // ⚠️ 端口**恒返 `Result`、不 reject**（底层抛已被 `adapters/media/facePort` 收口）⇒ 无需 `.catch`
    void hostOps.detectFaces(src).then((r) => {
      if (stale) return;
      if (!r.ok) {
        // 原则 6：失败原文照带（不改写）—— 端口已给 `message`
        setFaceMark(nodeId, { status: 'error', key: src, faces: [], error: r.message, masking: null });
        return;
      }
      setFaceMark(nodeId, {
        status: r.value.length ? 'done' : 'empty',
        key: src,
        faces: r.value,
        masking: null,
      });
    });
    return () => {
      stale = true;
    };
  }, [src, nodeId, setFaceMark, hostOps, mark?.key, mark?.status]);

  /** ② 量显示框（原 84-104）—— 脸框是归一化坐标，落点依赖它 */
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = (): void => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** ③ 归一化脸框 → 显示落点（原 `sL`，纯层） */
  const rects = useMemo(
    () => displayFaceRects(faces, box, natW && natH ? natW / natH : 1),
    [faces, box, natW, natH],
  );

  /** 遮脸（原 `x`，109-139） */
  const applyMask = useCallback(
    async (index: number) => {
      if (masking !== null) return;
      const face = faces[index];
      if (!face || !src) return;
      setFaceMasking(nodeId, index);
      // ⚠️ 端口恒返 `Result`（不抛）⇒ 失败分支**显式**处理（差异 ③：源 `console.warn` 静默，本仓可见）
      const r = await hostOps.applyFaceMask(src, face, faceMaskOpts);
      if (!r.ok) {
        pushToast(`${FACEMASK_TEXT.failed}：${r.message}`, 4000, 'error');
        setFaceMasking(nodeId, null);
        return;
      }
      const name = label || '素材';
      const nextName = name.includes(FACEMASK_TEXT.nameSuffix) ? name : `${name}${FACEMASK_TEXT.nameSuffix}`;
      const done = replaceMaterialImage(nodeId, r.value.dataUrl, { name: nextName, w: r.value.w, h: r.value.h });
      // 原 `124`：外置失败 ⇒ 报「图片保存失败」（原文，不改写）
      if (!done) {
        pushToast(`${FACEMASK_TEXT.failed}：${FACEMASK_TEXT.saveFailed}`, 4000, 'error');
        setFaceMasking(nodeId, null);
        return;
      }
      clearFaceMark(nodeId);
    },
    [masking, faces, src, nodeId, faceMaskOpts, label, replaceMaterialImage, clearFaceMark, setFaceMasking, pushToast, hostOps],
  );

  // 卸载时清掉待定的单击（不留悬空定时器 —— 原则 4）
  useEffect(
    () => () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    },
    [],
  );

  /** 单击：**延迟 220ms**（原 `S`，152-160）—— 期间来了双击就把定时器清掉 */
  const onMarkClick = (index: number) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (clickTimer.current !== null) return;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      void applyMask(index);
    }, CLICK_DELAY_MS);
  };

  /** 双击：开参数面板（原 `E`，161-168） */
  const onMarkDoubleClick = (e: { stopPropagation: () => void; clientX: number; clientY: number }) => {
    e.stopPropagation();
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    openFaceMaskPanel(nodeId, e.clientX, e.clientY);
  };

  const effectLabel = FACE_MASK_EFFECT_LABEL[faceMaskOpts.effect].label;
  const padPercent = Math.round(faceMaskOpts.pad * 100);
  const show = status === 'done' && rects.length > 0;

  return (
    <div className={styles.faceMarksLayer} ref={layerRef}>
      {status === 'loading' && <span className={styles.faceMarksBusy}>{FACEMASK_TEXT.detecting}</span>}
      {show && (
        <span className={styles.faceMarksBadge} title={FACEMASK_TEXT.badgeTitle(rects.length)}>
          {FACEMASK_TEXT.badge}
        </span>
      )}
      {show &&
        rects.map((r) => (
          <div
            className={`${styles.faceMark} nodrag nopan nowheel${masking === r.i ? ` ${styles.faceMarkMasking}` : ''}`}
            key={r.i}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            title={
              masking === r.i
                ? FACEMASK_TEXT.masking
                : FACEMASK_TEXT.markTitle(effectLabel, faceMaskOpts.strength, padPercent)
            }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onMarkClick(r.i)}
            onDoubleClick={onMarkDoubleClick}
          >
            <span className={`${styles.faceMarkCorner} ${styles.faceMarkTl}`} />
            <span className={`${styles.faceMarkCorner} ${styles.faceMarkTr}`} />
            <span className={`${styles.faceMarkCorner} ${styles.faceMarkBl}`} />
            <span className={`${styles.faceMarkCorner} ${styles.faceMarkBr}`} />
            <span className={styles.faceMarkTip}>
              {masking === r.i ? FACEMASK_TEXT.masking : FACEMASK_TEXT.markTip}
            </span>
          </div>
        ))}
    </div>
  );
}
