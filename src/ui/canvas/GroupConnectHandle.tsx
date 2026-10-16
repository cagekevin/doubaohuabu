/**
 * 组连线锚点（原 `_Component37.jsx`，191 行 —— 逐行回源移植）
 *
 * **它是什么**：选中 ≥2 个节点时，在选择框**右侧**出现一个锚点；从它拖线：
 *   · 拖到**某个节点**上 ⇒ `connectManyToTarget(选中的 id 们, 目标)`（源 `:105-118`）
 *   · 拖到**空白** ⇒ `onGroupConnectEnd(ids, 屏幕坐标)` ⇒ 开建节点浮层
 *     `mode:'group'`（源 `:119-128` + `_Component42.jsx:608-620` 的 `xe`）
 *
 * **渲染位置（对源）**：源用 `_Component34` 把自己 portal 进
 * `.react-flow__viewport-portal`（`shared.js:22371-22388`）⇒ 锚点/连线都在
 * **flow 坐标**里，平移缩放自动跟随。本仓用 `@xyflow/react` 的 `ViewportPortal`
 * （同一机制：渲染进 viewport 内）表达同一件事。
 *
 * ⚠️ 本组件**不写 store**（只调 state action + 回调）—— 原则 1。
 * ⚠️ 拖拽中的目标高亮：源给节点 DOM 加类 `gc-target-hint`（原版 CSS 未入库，
 *    见 TD-16-87 母体）⇒ 本仓**内联样式**表达同一语义（`.react-flow__node` 是
 *    xyflow 的 DOM，CSS Modules 管不到它，也不该为它开全局样式表）。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { getBezierPath, Position, useReactFlow, ViewportPortal } from '@xyflow/react';
import { useStore } from '@/state';
import { CANVAS_TEXT } from '@/constants/text';
import { Icon } from '@/ui/common/Icon';
import { bindDragListeners } from '@/ui/common/dragListeners';
import styles from './GroupConnectHandle.module.css';

/** 选中节点外接框 + 锚点几何（原 `:21-48` 的 `o`） */
interface SelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  count: number;
}

/** 拖拽中的连线两端（flow 坐标，原 `:49` 的 `a`） */
interface DragLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 源的两个兜底尺寸（原 `s3`/`o3` = 200/160，`shared.js:41058-41059`） */
const FALLBACK_W = 200;
const FALLBACK_H = 160;

/** 锚点相对选择框右侧的间距（原 `:58` / `:137` 的 `24`） */
const HANDLE_GAP = 24;
/** 贝塞尔曲率（原 `:163` 的 `curvature: 0.3`） */
const CURVATURE = 0.3;

export interface GroupConnectHandleProps {
  /**
   * 拖到空白处（原 `onGroupConnectEnd`）—— 调用方开建节点浮层 `mode:'group'`
   * @param ids 选中的节点 id（源 `B`）
   * @param screen 松手处的**屏幕坐标**（源 `ue` = `{x: clientX, y: clientY}`）
   */
  onGroupConnectEnd: (ids: string[], screen: { x: number; y: number }) => void;
}

export function GroupConnectHandle({ onGroupConnectEnd }: GroupConnectHandleProps) {
  const nodes = useStore((s) => s.nodes);
  const connectManyToTarget = useStore((s) => s.connectManyToTarget);
  const { screenToFlowPosition } = useReactFlow();

  /** 选中的节点（原 `s`） */
  const selected = useMemo(() => nodes.filter((n) => n.selected), [nodes]);

  /** 外接框（原 `o`：`measured` 优先，本仓节点恒带 width/height ⇒ 只用 `?? 兜底`） */
  const bounds: SelectionBounds | null = useMemo(() => {
    if (selected.length < 2) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of selected) {
      const w = n.width ?? FALLBACK_W;
      const h = n.height ?? FALLBACK_H;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }
    return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, count: selected.length };
  }, [selected]);

  const [line, setLine] = useState<DragLine | null>(null);
  /** 当前高亮的目标 DOM（源 `c.current.targetEl`）—— 松手/换目标时清内联样式 */
  const hintedRef = useRef<HTMLElement | null>(null);

  const clearHint = useCallback(() => {
    const el = hintedRef.current;
    if (el) {
      el.style.outline = '';
      el.style.outlineOffset = '';
      hintedRef.current = null;
    }
  }, []);

  /**
   * ★ 锚点按下 → 开始拖线（原 `u`，`:51-133` 逐行）
   *
   * 源流程：`preventDefault` + `stopPropagation`（别触发画布框选）→ 记起点
   * （`{x: maxX + 24, y: cy}`）→ 挂 **window** 级 `pointermove`/`pointerup`
   * → move 里更新线端 + 高亮合法目标 → up 里分派（连一批 / 回调开浮层）。
   */
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!bounds) return;
      e.preventDefault();
      e.stopPropagation();
      const start = { x: bounds.maxX + HANDLE_GAP, y: bounds.cy };
      // 源 `:61-64`：起点即线头，线尾先重合
      hintedRef.current = null;
      setLine({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });

      /**
       * 解绑函数（`onUp` 里调；先给个空实现免"未赋值"路径）。
       * ★ 监听由 `ui/common/dragListeners` 挂 —— 同一套机制此前有 **4 份手写**（见该文件头注），
       *   它额外覆盖 **`pointercancel`**（此前只有 `GenPanel` 处理了它）。
       */
      let unbind: () => void = () => {};

      const onMove = (ev: PointerEvent): void => {
        const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        setLine((cur) => (cur ? { ...cur, x2: p.x, y2: p.y } : cur));
        // 目标探测（原 `:83-97`）：指针下的 `.react-flow__node`，且**不在选中集里**
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const el = under?.closest('.react-flow__node') as HTMLElement | null;
        const id = el?.getAttribute('data-id') ?? null;
        const ok = !!el && !!id && !selected.some((n) => n.id === id);
        if (hintedRef.current && hintedRef.current !== el) clearHint();
        if (ok && el) {
          el.style.outline = `2px dashed var(--field-border-focus)`;
          el.style.outlineOffset = '2px';
          hintedRef.current = el;
        } else {
          hintedRef.current = null;
        }
      };

      const onUp = (ev: PointerEvent): void => {
        unbind();
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const el = under?.closest('.react-flow__node') as HTMLElement | null;
        const targetId = el?.getAttribute('data-id') ?? null;
        if (el) {
          el.style.outline = '';
          el.style.outlineOffset = '';
        }
        clearHint();
        setLine(null);
        const ids = selected.map((n) => n.id);
        if (targetId) {
          // 源 `:110-118`：剔掉目标自己再连（`connectManyToTarget` 内部也会剔）
          const sources = ids.filter((id) => id !== targetId);
          if (sources.length > 0) connectManyToTarget(sources, targetId);
        } else if (ids.length > 0) {
          // 源 `:119-128`：落空 ⇒ 交回画布开 `mode:'group'` 浮层
          onGroupConnectEnd(ids, { x: ev.clientX, y: ev.clientY });
        }
      };

      unbind = bindDragListeners({ onMove, onEnd: onUp });
    },
    [bounds, clearHint, connectManyToTarget, onGroupConnectEnd, screenToFlowPosition, selected],
  );

  /** 锚点坐标（原 `d`/`f`）—— flow 坐标，ViewportPortal 里直接绝对定位 */
  const handleX = bounds ? bounds.maxX + HANDLE_GAP : 0;
  const handleY = bounds ? bounds.cy : 0;

  /** 拖拽线路径（原 `:139-177`：贝塞尔 + 按拖动方向推目标边） */
  const path = useMemo(() => {
    if (!line) return null;
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    let targetPosition: Position;
    if (Math.abs(dx) > Math.abs(dy)) targetPosition = dx > 0 ? Position.Left : Position.Right;
    else targetPosition = dy > 0 ? Position.Top : Position.Bottom;
    const [d] = getBezierPath({
      sourceX: line.x1,
      sourceY: line.y1,
      sourcePosition: Position.Right,
      targetX: line.x2,
      targetY: line.y2,
      targetPosition,
      curvature: CURVATURE,
    });
    return d;
  }, [line]);

  if (!bounds) return null;

  return (
    <ViewportPortal>
      {path && (
        <svg
          width="100%"
          height="100%"
          // 源 `:171-174` 逐字：绝对定位铺满 + overflow visible + 不吃事件
          style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <path d={path} className={styles.line} fill="none" />
        </svg>
      )}
      <div
        className={styles.handle}
        style={{ left: handleX, top: handleY, marginLeft: -15, marginTop: -15, pointerEvents: 'auto' }}
        onPointerDown={onPointerDown}
        title={CANVAS_TEXT.groupConnectHint}
        role="button"
        tabIndex={-1}
      >
        <Icon name="group" />
      </div>
    </ViewportPortal>
  );
}
