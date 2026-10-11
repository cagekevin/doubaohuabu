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

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useStore, useStoreApi } from '@/state';
import { nodeTypes } from '@/ui/nodes';
import type { RFCanvasNode } from '@/ui/nodes/types';
import { InteractiveEdge } from '@/ui/edges/InteractiveEdge';
import { DRAG_MIME_MATERIAL, GRID_OPACITY, GRID_SIZE, MAX_ZOOM, MIN_ZOOM } from '@/constants';
import { CANVAS_TEXT } from '@/constants/text';
import { CreatePanel, type CreatePanelState } from './CreatePanel';
import { SelectionToolbar } from './SelectionToolbar';
import { SplitKeywordModal } from '@/ui/nodes/SplitKeywordModal';
import styles from './CanvasHost.module.css';

const edgeTypes = { interactive: InteractiveEdge };

/**
 * 边点击弹「建节点」浮层的防抖（ms，原 `_Component42.jsx:574` 的 `setTimeout(..., 220)`）
 * ⚠️ 拖画布 / 框选也会触发 `onEdgeClick`，不防抖会误弹
 */
const EDGE_CLICK_DEBOUNCE_MS = 220;

/** MiniMap 节点配色（CSS 变量，见 tokens.css） */
const MINIMAP_COLOR: Record<string, string> = {
  material: 'var(--color-node-material)',
  account: 'var(--color-node-account)',
};

function Inner() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  /** ★ 只改自己那一半（`setGraph` 会连另一半一起覆盖 ⇒ 见 `canvas.ts` 的 `setNodes` 注释） */
  const setNodes = useStore((s) => s.setNodes);
  const setEdges = useStore((s) => s.setEdges);
  /** ★ 非订阅式读取（事件回调里要读「当前值」时用 —— 原版 `t()` 的对应物） */
  const storeApi = useStoreApi();
  const commit = useStore((s) => s.commit);
  const connect = useStore((s) => s.connect);
  const undoAction = useStore((s) => s.undoAction);
  const redoAction = useStore((s) => s.redoAction);
  const pushToast = useStore((s) => s.pushToast);
  const pushBackendError = useStore((s) => s.pushBackendError);
  const library = useStore((s) => s.library);
  const addTextNode = useStore((s) => s.addTextNode);
  const addMaterialNode = useStore((s) => s.addMaterialNode);
  /** ★ 建节点浮层（原 `Ae`）—— `null` = 不显示 */
  const [createPanel, setCreatePanel] = useState<CreatePanelState | null>(null);
  /** ★ 删除必须走它（见 `onNodesChange` 的注释） */
  const removeNodes = useStore((s) => s.removeNodes);
  /**
   * ★ 「按关键词拆分」弹窗（原 `splitKeywordModal`）—— **必须由本组件渲染**（见 `ui.ts` 的注释：
   *   拆分要删掉源节点，弹窗若住在节点里会随之卸载；且节点在变换容器内，浮层会被 transform 带偏）
   */
  const splitModal = useStore((s) => s.splitKeywordModal);
  const closeSplitKeywordModal = useStore((s) => s.closeSplitKeywordModal);

  const { fitView, screenToFlowPosition } = useReactFlow();

  // 节点/边变更：位置变化**不在此 commit**（拖拽开始才 commit，见 onNodeDragStart）
  const onNodesChange = useCallback(
    (changes: NodeChange<RFCanvasNode>[]) => {
      /**
       * ★★ **从 store 读「当前」值，不用 React 闭包**（与源 `shared.js:26826` 的 `t().nodes` 一致）
       *
       * 闭包里的 `nodes` 是**上次渲染的快照**：连续变更（如"删节点"紧接"选中变化"）时，
       * 后一次会用旧值把前一次的结果**覆盖回去** ⇒ 实测表现为"删掉的节点又冒出来"、
       * 撤销栈被压入坏快照（Ctrl+Z 后边回不来）。
       */
      const current = storeApi.getState().nodes;

      /**
       * ★★ **删除必须走 `removeNodes`，不能交给 `applyNodeChanges`**
       *
       * 依据 `docs/14` §2 的 ★ 缺口（原实现里 `removeNodes` **零调用**）：
       *   `applyNodeChanges` 只把节点从数组里丢掉、**完全不动 `edges`**
       *   ⇒ ① 留下**悬空边**；且它**不 `commit` 快照** ⇒ ② 删除**不可撤销**。
       * `removeNodes` 三件事都做：**commit 快照** + **清相关边** + **清幸存节点的 `referenceOrder` 引用**。
       *
       * ⚠️ **顺序：先应用其余变更、再删除**。反过来的话会拿**闭包里的旧 `nodes`**
       *    去 `applyNodeChanges` ⇒ 把刚删掉的节点又"复活"回来。
       *    （`zustand` 的 `set` 是同步的 ⇒ `removeNodes` 读到的已是 `setGraph` 之后的状态。）
       */
      const removed: string[] = [];
      const rest: NodeChange<RFCanvasNode>[] = [];
      for (const c of changes) {
        if (c.type === 'remove') removed.push(c.id);
        else rest.push(c);
      }

      if (rest.length > 0) {
        // ⚠️ 用**刚读到的 `current`**（不是 React 闭包）—— 见本回调开头的注释
        const next = applyNodeChanges(rest, current as unknown as RFCanvasNode[]);
        // ★ 只改节点（**不再带 `edges`**）—— 否则会拿旧边覆盖掉刚发生的边变更
        setNodes(next as unknown as CanvasNode[]);
      }
      if (removed.length > 0) {
        // remove 的 commit 由 `removeNodes` 内部完成（key 同为 `'delete'`）⇒ 此处**不重复 commit**
        removeNodes(removed);
      }
    },
    [setNodes, removeNodes, storeApi],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      /**
       * ★ 与源一致（`shared.js:26880-26889`）：
       *   ① **删边也要 `commit('delete')`** —— 否则删边**不可撤销**（原实现漏了）
       *   ② 从 **store 读当前 `edges`**，不用 React 闭包（闭包是上次渲染的快照）
       *   ③ 只写 `edges`（**不动 `nodes`**）
       */
      if (changes.some((c) => c.type === 'remove')) commit('delete');
      const current = storeApi.getState().edges;
      // ⚠️ xyflow 的 applyEdgeChanges 返回 `Edge[]`（type 是 `string|undefined`），
      //    而我们的 `CanvasEdge.type` 收窄为 `'interactive'` ⇒ 边界处做一次断言
      //    （结构等价，只是字面量宽度不同）
      setEdges(applyEdgeChanges(changes, current) as CanvasEdge[]);
    },
    [commit, setEdges, storeApi],
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

  /**
   * ★ 建节点浮层（原 `_Component42.jsx:561-583` 的 `st` / 节点右键菜单）
   *
   * ⚠️ **边点击有 220ms 防抖**（原 `He.current = setTimeout(..., 220)`）——
   *    因为拖动画布/框选时也会触发 `onEdgeClick`，不防抖会误弹。
   */
  const createTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEdgeClick = useCallback(
    (_e: React.MouseEvent, edge: CanvasEdge) => {
      if (createTimer.current) clearTimeout(createTimer.current);
      createTimer.current = setTimeout(() => {
        setCreatePanel({
          mode: 'edge',
          x: _e.clientX,
          y: _e.clientY,
          edgeId: edge.id,
          sourceId: edge.source,
          targetId: edge.target,
        });
      }, EDGE_CLICK_DEBOUNCE_MS);
    },
    [],
  );

  /** 节点右键 → 「引用该节点生成」（原 `node-ctx-menu` 的入口；多选时带上全部选中项） */
  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: { id: string }) => {
      e.preventDefault();
      const selected = storeApi
        .getState()
        .nodes.filter((n) => n.selected)
        .map((n) => n.id);
      const sourceIds = selected.includes(node.id) ? selected : [node.id];
      setCreatePanel({
        mode: 'node',
        x: e.clientX,
        y: e.clientY,
        flowPos: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        sourceIds,
      });
    },
    [screenToFlowPosition, storeApi],
  );

  // 卸载时清掉未触发的防抖（不留下悬空定时器 —— 原则 4 的"不自启常驻定时器"）
  useEffect(
    () => () => {
      if (createTimer.current) clearTimeout(createTimer.current);
    },
    [],
  );

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
        // ★ 建节点入口（原 `st` 的边点击 + `node-ctx-menu` 的节点右键）
        onEdgeClick={onEdgeClick}
        onNodeContextMenu={onNodeContextMenu}
        // ★ 与源一致（`_Component42.jsx:1444`）：原版**显式设了两个删除键**。
        //   不设的话 xyflow 默认只有 `Backspace` ⇒ `Delete` 键删不掉节点（实测差距）
        deleteKeyCode={['Backspace', 'Delete']}
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

      {/* ★ 选择工具条（原 `.sel-toolbar`）—— 成组的入口（`groupSelected` 此前没有调用方） */}
      <SelectionToolbar />

      {/* ★ 建节点浮层（原 `create-panel`）—— 8 类节点此前只有 2 类能建出来，这是补上的入口 */}
      {createPanel && <CreatePanel state={createPanel} onClose={() => setCreatePanel(null)} />}

      {/* ★ 「按关键词拆分」弹窗（原 `splitDirect` 末尾的 `fitViewAction` 由这里承担 —— 视图能力归 ui） */}
      {splitModal && (
        <SplitKeywordModal
          sourceNodeId={splitModal.sourceNodeId}
          onClose={closeSplitKeywordModal}
          onSplit={(ids) => void fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2 })}
        />
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
