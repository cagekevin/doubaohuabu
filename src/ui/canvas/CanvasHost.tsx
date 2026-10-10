/**
 * 画布宿主（原 `_Component39` / `_Component42` 体系的画布部分）
 *
 * 依据：docs/03-人类版.md §1
 *   - `<ReactFlow nodeTypes=dO edgeTypes=fO>` + Background(Lines/20/1) + Controls(showInteractive=false) + MiniMap
 *   - MiniMap 配色：material `#a5b4fc` / account `#34d399` / 其它 `#fcd34d`（走 CSS 变量）
 *   - 网格 `GRID_SIZE=20`、透明度 `GRID_OPACITY=0.4`、拖拽 MIME `DRAG_MIME_MATERIAL`
 *
 * 职责边界：
 *   - 本组件**只做 UI 与事件接线**；环检测在 `core/rules/graph`（经 `state.connect` 调用）
 *   - 撤销/重做由 `state.commit` + `core/rules/undo` 负责
 *
 * ⚠️ 快捷键：Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 重做（原实现行为）
 */

import { useCallback, useEffect } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import type { CanvasEdge } from '@/stable/model/project';
import type { CanvasNode } from '@/stable/model/node';
import { useStore } from '@/state';
import { nodeTypes } from '@/ui/nodes';
import type { RFCanvasNode } from '@/ui/nodes/types';
import { InteractiveEdge } from '@/ui/edges/InteractiveEdge';
import { DRAG_MIME_MATERIAL, GRID_OPACITY, GRID_SIZE, MAX_ZOOM, MIN_ZOOM } from '@/constants';
import { CANVAS_TEXT } from '@/constants/text';
import styles from './CanvasHost.module.css';

const edgeTypes = { interactive: InteractiveEdge };

/** MiniMap 节点配色（CSS 变量，见 tokens.css） */
const MINIMAP_COLOR: Record<string, string> = {
  material: 'var(--color-node-material)',
  account: 'var(--color-node-account)',
};

function Inner() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const setGraph = useStore((s) => s.setGraph);
  const commit = useStore((s) => s.commit);
  const connect = useStore((s) => s.connect);
  const undoAction = useStore((s) => s.undoAction);
  const redoAction = useStore((s) => s.redoAction);
  const pushToast = useStore((s) => s.pushToast);
  const pushBackendError = useStore((s) => s.pushBackendError);
  const library = useStore((s) => s.library);
  const addTextNode = useStore((s) => s.addTextNode);
  const addMaterialNode = useStore((s) => s.addMaterialNode);

  const { fitView, screenToFlowPosition } = useReactFlow();

  // 节点/边变更：位置变化**不在此 commit**（拖拽开始才 commit，见 onNodeDragStart）
  const onNodesChange = useCallback(
    (changes: NodeChange<RFCanvasNode>[]) => {
      const next = applyNodeChanges(changes, nodes as unknown as RFCanvasNode[]);
      setGraph(next as unknown as CanvasNode[], edges);
    },
    [setGraph, nodes, edges],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      // ⚠️ xyflow 的 applyEdgeChanges 返回 `Edge[]`（type 是 `string|undefined`），
      //    而我们的 `CanvasEdge.type` 收窄为 `'interactive'` ⇒ 边界处做一次断言
      //    （结构等价，只是字面量宽度不同）
      setGraph(nodes, applyEdgeChanges(changes, edges) as CanvasEdge[]);
    },
    [setGraph, nodes, edges],
  );

  /** ★ 拖拽开始即 commit（快照 = 变更前）—— 与源码 29001 一致，满足 W5 */
  const onNodeDragStart = useCallback(() => {
    commit('graph-move');
  }, [commit]);

  /** ★ 连线：环检测在 state.connect 内（走 core/rules/graph） */
  const onConnect = useCallback(
    (conn: { source: string | null; target: string | null }) => {
      if (!conn.source || !conn.target) return;
      const rejected = connect({ source: conn.source, target: conn.target });
      if (rejected) pushToast(rejected);
    },
    [connect, pushToast],
  );

  // 快捷键（原实现：Ctrl+Z / Ctrl+Shift+Z）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redoAction();
      else undoAction();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoAction, redoAction]);

  // 字体/布局就绪后 fitView（原 `_Component38`）
  useEffect(() => {
    const t = window.setTimeout(() => void fitView({ padding: 0.2 }), 50);
    return () => window.clearTimeout(t);
  }, [fitView]);

  const empty = nodes.length === 0;

  /** ★ 双击空白 → 建文本节点（原「双击画布创建文本框」） */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // 只在**空白处**双击才建（点在节点/边上不建）
      const target = e.target as HTMLElement;
      if (target.closest('.react-flow__node') || target.closest('.react-flow__edge')) return;
      addTextNode(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addTextNode, screenToFlowPosition],
  );

  /** ★ 从资源库拖入 → 建素材节点（原「从右侧资源库拖入素材」） */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const libId = e.dataTransfer.getData(DRAG_MIME_MATERIAL);
      if (!libId) return;
      e.preventDefault();
      const item = library.find((it) => it.id === libId);
      if (!item) {
        // ★ 拖了不存在的素材 —— 明确上报（原则 6），不静默吞
        pushBackendError('unknown', `拖入的素材不在资源库中（libId=${libId}）`);
        return;
      }
      addMaterialNode(item, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [library, addMaterialNode, screenToFlowPosition, pushBackendError],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME_MATERIAL)) {
      e.preventDefault(); // 允许放置
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  return (
    // ⚠️ 这些事件挂**外层容器**（原实现是 `div.canvas-wrap`）—— ReactFlow 自身不透传。
    //    `onDoubleClick` 用**捕获阶段**：ReactFlow 的 pane 会拦截冒泡（W15 实测抓到）
    <div
      className={styles.wrap}
      onDoubleClickCapture={onDoubleClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow<RFCanvasNode, CanvasEdge>
        className="xy-theme"
        // ⚠️ `stable/model` 的 `CanvasNode` 与 xyflow 的 `RFCanvasNode` 语义一致，
        //    仅框架约束不同（见 `ui/nodes/types.ts`）⇒ 边界处断言
        nodes={nodes as unknown as RFCanvasNode[]}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onConnect={onConnect}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Lines} gap={GRID_SIZE} size={1} style={{ opacity: GRID_OPACITY }} />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={(n) => MINIMAP_COLOR[n.type ?? ''] ?? 'var(--color-node-other)'} pannable zoomable />
      </ReactFlow>

      {empty && (
        <div className={styles.emptyHint}>
          <div className={styles.emptyTitle}>{CANVAS_TEXT.emptyTitle}</div>
          <div>{CANVAS_TEXT.emptyHint}</div>
        </div>
      )}
    </div>
  );
}

export function CanvasHost() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
