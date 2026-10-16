/**
 * 交互式连线（原 `B3.jsx`，152 行；`type: 'interactive'`）
 *
 * 依据（**逐行回源**）：`B3.jsx`
 *   | 件 | 行 | 语义 |
 *   | - | - | - |
 *   | 隐藏粗线 | 125-127 | `stroke=transparent strokeWidth=28` + `cursor:pointer`，**吃悬停** |
 *   | 悬停计时 | 24 / 28-59 | 进 ⇒ 1000ms 后开气泡；出 ⇒ **120ms** 后关（进出气泡会重新计时） |
 *   | 指针位置 | 28-46 / 69-76 | `mousemove` 记 `clientX/Y`（气泡就长在指针处） |
 *   | 气泡 | 128-151 | portal；两个按钮：**插入节点** / **断开连线** |
 *   | 插入 | 84-116 | 指针处（flow 坐标）居中建**文本**节点 → 删原边 → 补 `source→new`、`new→target` |
 *   | 断开 | 117-122 | `removeEdge(id)` |
 *   | 高亮 | 25-27 / 124 | 边**或任一端点**被选中 ⇒ `edge-hl` |
 *
 * ⚠️ 样式来自 `constants`（`EDGE_STYLE` / `EDGE_MARKER`），颜色用 CSS 变量 → SSOT。
 * ⚠️ 本文件此前只有 `BaseEdge`（41 行、**零交互**）—— 气泡是 docs/过程.md 记的「缺 1000ms 长按开菜单」。
 * ⚠️ **两处有意差异**（登记 `TD-03-15`）：① 气泡坐标系用 **`position:fixed` + 屏幕坐标**（源是
 *    flow 坐标 + 画布内的 portal）—— 悬停期间不会平移/缩放，行为等价且少一层依赖；
 *    ② 落点走**已有的** `insertNodeOnEdge`（给它加了显式落点参数），而不是在 UI 里拼三步 store 写
 *    （原则 1：编排住 state）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BaseEdge, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';
import { useStore } from '@/state';
import { EDGE_TEXT } from '@/constants/text';
import { useAnchoredLayer } from '@/ui/common/useAnchoredLayer';
import styles from './InteractiveEdge.module.css';

/** 悬停多久开气泡（原 `B3.jsx:24` 的 `v = 1000`） */
const HOVER_DELAY_MS = 1000;
/** 移出多久关（原 `:58` 的 `120`） */
const HIDE_DELAY_MS = 120;
/** 透明粗线的宽度（原 `:126` 的 `strokeWidth={28}`）—— 只为「好点中」 */
const HIT_STROKE_WIDTH = 28;

export function InteractiveEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow();
  const nodes = useStore((s) => s.nodes);
  const removeEdge = useStore((s) => s.removeEdge);
  const insertNodeOnEdge = useStore((s) => s.insertNodeOnEdge);

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const [open, setOpen] = useState(false);
  /** 指针屏幕坐标（原 `p`） */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  /**
   * ★ 气泡摆位交给**浮层定位原语**（`B06`）—— 锚点就是**指针位置**。
   * ⚠️ 一处**可见的行为差异**（记在 `B06` 行）：原来是 `transform: translate(-50%, -50%)`
   *    **以指针为中心**；原语统一成"锚点右下方 + 越界收边/翻转" ⇒ 气泡会出现在指针**右下**、
   *    贴边时自动收回视口。这是"全库浮层同一种摆法"的代价，换来的是不再有溢出。
   */
  const { ref: bubbleRef, style: bubbleStyle } = useAnchoredLayer({
    open: open && pointer !== null,
    anchor: pointer,
    depsKey: '',
  });
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  /** 进入（线或气泡）⇒ 记指针 + **重开 1000ms**（原 `b`，`:28-46`） */
  const arm = useCallback(
    (e?: { clientX?: number; clientY?: number }) => {
      if (showTimer.current !== null) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (e?.clientX != null && e.clientY != null) setPointer({ x: e.clientX, y: e.clientY });
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        setOpen(true);
        hideTimer.current = null;
      }, HOVER_DELAY_MS);
    },
    [],
  );

  /** 移出 ⇒ **120ms 后**关（原 `x`，`:47-59`）—— 给"移到气泡上"留时间 */
  const scheduleHide = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
    }
    showTimer.current = window.setTimeout(() => {
      setOpen(false);
      setPointer(null);
      showTimer.current = null;
    }, HIDE_DELAY_MS);
  }, []);

  // 卸载时清定时器（不留悬空定时器 —— 原则 4）
  useEffect(() => () => clearTimers(), [clearTimers]);

  /** 插入文本节点（原 `P`，`:84-116`） */
  const onInsert = useCallback(() => {
    const anchor = pointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let center: { x: number; y: number };
    try {
      center = screenToFlowPosition(anchor);
    } catch {
      // 原 `:95-100` 的兜底：换算失败就退回两端中点
      center = { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
    }
    insertNodeOnEdge(id, 'text', undefined, center);
    setOpen(false);
    setPointer(null);
  }, [id, insertNodeOnEdge, pointer, screenToFlowPosition, sourceX, sourceY, targetX, targetY]);

  /** 断开连线（原 `j`，`:117-122`） */
  const onDisconnect = useCallback(() => {
    removeEdge(id);
    setOpen(false);
    setPointer(null);
  }, [id, removeEdge]);

  /** 高亮：边**或任一端点**被选中（原 `y`，`:25-27`）—— 用 `edge-hl` 让样式层去决定画成什么样 */
  const highlighted =
    !!selected ||
    nodes.some((n) => (n.id === source || n.id === target) && n.selected);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        // 选中态：加粗（颜色仍走 CSS 变量）
        // ⚠️ 源给的是**类名** `edge-hl`（`:124`）；本仓**不输出那个类** —— mockup 未收录它的样式，
        //    编一个就是"编造样式" ⇒ 用本文件既有的**内联加粗**表达同一个语义（登记 `TD-03-15`）。
        style={highlighted ? { ...style, strokeWidth: 3 } : style}
      />

      {/* 透明粗线：只为了"好点中"（原 `:125-127`） */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={HIT_STROKE_WIDTH}
        style={{ cursor: 'pointer' }}
        onMouseEnter={arm}
        onMouseLeave={scheduleHide}
        onMouseMove={arm}
      />

      {/* 气泡（原 `:128-151`）—— portal 到 body，`position: fixed` 跟着指针 */}
      {open &&
        pointer &&
        createPortal(
          <div
            ref={bubbleRef}
            className={`${styles.edgeActions} nodrag nopan`}
            style={bubbleStyle}
            onMouseEnter={arm}
            onMouseLeave={scheduleHide}
          >
            <button
              type="button"
              className={`${styles.edgeAct} ${styles.edgeActAdd}`}
              title={EDGE_TEXT.insertNode}
              onClick={onInsert}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.edgeAct} ${styles.edgeActDel}`}
              title={EDGE_TEXT.disconnect}
              onClick={onDisconnect}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
