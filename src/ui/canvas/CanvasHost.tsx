/**
 * 画布宿主（原 `_Component39` / `_Component42` 体系的画布部分）
 *
 * 依据：docs/过程.md §1
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

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import type { CanvasEdge } from '@/stable/model/project';
import type { CanvasNode } from '@/stable/model/node';
import { useCapture, useHostOps, useStore, useStoreApi } from '@/state';
import { nodeTypes } from '@/ui/nodes';
import { BatchSendPanel } from '@/ui/panels/BatchSendPanel';
import { GenPanel } from '@/ui/panels/GenPanel';
import { FaceMaskPanel } from '@/ui/panels/FaceMaskPanel';
import type { RFCanvasNode } from '@/ui/nodes/types';
import { InteractiveEdge } from '@/ui/edges/InteractiveEdge';
import { playChime } from '@/lib/chime';
import { log } from '@/lib/log';
import { fitMaterialSize } from '@/core/rules/materialGrid';
import { readImageFile, readTextFile, stripExtension } from '@/lib/readDroppedFile';
import { formatClockTime } from '@/lib/time';
import { DRAG_MIME_MATERIAL, EDGE_CLICK_DEBOUNCE_MS, GRID_OPACITY, GRID_SIZE, MAX_ZOOM, MIN_ZOOM } from '@/constants';
import { CANVAS_TEXT } from '@/constants/text';
import { CreatePanel, type CreatePanelState } from './CreatePanel';
import { GroupConnectHandle } from './GroupConnectHandle';
import { MaterialPickerModal } from './MaterialPickerModal';
import { SelectionToolbar } from './SelectionToolbar';
import { NodeContextMenu, type NodeContextMenuState } from './NodeContextMenu';
import { NodePresetModal } from './NodePresetModal';
import { buildClipboard, type ClipboardPayload } from '@/core/rules/clipboard';
import { SplitKeywordModal } from '@/ui/nodes/SplitKeywordModal';
import { SplitPresetPickerModal } from '@/ui/nodes/SplitPresetPickerModal';
import styles from './CanvasHost.module.css';
import shared from '@/ui/common/shared.module.css';

const edgeTypes = { interactive: InteractiveEdge };

/**
 * ★ 图片编辑器（原 `G3.jsx`，1087 行）—— **动态导入（`lazy`）**（`docs/过程.md` §2.2 定稿，判据 **M3**）：
 *   重组件拆 chunk、不进主 bundle，只在用户点「编辑图片」时才拉。
 */
const ImageEditor = lazy(() => import('@/ui/panels/ImageEditor').then((m) => ({ default: m.ImageEditor })));

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
  /** ★ 多选拖拽批量连线（原 `connectBatch`）—— `onConnect` 的多选 material 分支用 */
  const connectBatch = useStore((s) => s.connectBatch);
  const undoAction = useStore((s) => s.undoAction);
  const redoAction = useStore((s) => s.redoAction);
  const pushToast = useStore((s) => s.pushToast);
  const pushBackendError = useStore((s) => s.pushBackendError);
  const library = useStore((s) => s.library);
  const addTextNode = useStore((s) => s.addTextNode);
  /** ★ 拖入素材 ⇒ 保证画布上有它的节点（原 `ensureMaterialNode`，`shared.js:29055-29083`） */
  const ensureMaterialNode = useStore((s) => s.ensureMaterialNode);
  /** ★ 建节点浮层（原 `Ae`）—— `null` = 不显示 */
  const [createPanel, setCreatePanel] = useState<CreatePanelState | null>(null);
  /** ★ 删除必须走它（见 `onNodesChange` 的注释） */
  const removeNodes = useStore((s) => s.removeNodes);
  /**
   * ★ 「按关键词拆分」弹窗（原 `splitKeywordModal`）—— **必须由本组件渲染**（见 `ui.ts` 的注释：
   *   拆分要删掉源节点，弹窗若住在节点里会随之卸载；且节点在变换容器内，浮层会被 transform 带偏）
   */
  const splitModal = useStore((s) => s.splitKeywordModal);
  /** ★ 「拆分并套用节点预设」（原 `splitPresetPicker`）—— 由**外壳**渲染（同 `splitModal`） */
  const splitPresetPicker = useStore((s) => s.splitPresetPicker);
  const closeSplitPresetPicker = useStore((s) => s.closeSplitPresetPicker);
  const closeSplitKeywordModal = useStore((s) => s.closeSplitKeywordModal);
  /**
   * ★ **遮脸参数面板**（原 `_Component40`）—— **与 `splitModal` 同法**：
   *   由**节点内**的人脸角标（双击）打开，却由**外壳**渲染（面板是视口级浮层，不属于任何节点）。
   */
  const faceMaskPanel = useStore((s) => s.faceMaskPanel);
  const closeFaceMaskPanel = useStore((s) => s.closeFaceMaskPanel);
  /**
   * ★ **图片编辑器**（原 `imageEditor`，`shared.js:31449`）—— 与 `splitModal`/`faceMaskPanel` 同法：
   *   由节点内「编辑图片」按钮打开，由外壳渲染（全屏模态浮层）。
   */
  const imageEditor = useStore((s) => s.imageEditor);
  const closeImageEditor = useStore((s) => s.closeImageEditor);
  const replaceMaterialImage = useStore((s) => s.replaceMaterialImage);
  const replaceImageGenImage = useStore((s) => s.replaceImageGenImage);

  const { fitView, screenToFlowPosition } = useReactFlow();
  /** 当前工程 id（原 `b`）—— 切项目后要自适应视图 */
  const activeId = useStore((s) => s.activeId);
  /** 网格吸附开关（原 `y`）—— 同时喂 `snapToGrid` 与批量排布（`state/slices/materialBatch`） */
  const snap = useStore((s) => s.snap);
  /** 删单条边（原 `v` = `removeEdge`）—— 供「边双击」用 */
  const removeEdge = useStore((s) => s.removeEdge);
  // ★ 宿主能力走控制器（`ui` 不持 `Ports` —— TD-16-8）
  const hostOps = useHostOps();
  const capture = useCapture();
  const selectOnly = useStore((s) => s.selectOnly);
  const addMaterialFromDrop = useStore((s) => s.addMaterialFromDrop);
  const addNode = useStore((s) => s.addNode);
  const patchNodeData = useStore((s) => s.patchNodeData);

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
       * 依据 `docs/过程.md` §2 的 ★ 缺口（原实现里 `removeNodes` **零调用**）：
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
        const next = applyNodeChanges(rest, current);
        // ★ 只改节点（**不再带 `edges`**）—— 否则会拿旧边覆盖掉刚发生的边变更
        // ★ **TD-02-17 确证必要的一处断言**：`applyNodeChanges` 返的是 `@xyflow/react` 自己的
        //   `Node[]`（**第三方类型**）⇒ 回写 store 必须收窄到本仓 `CanvasNode`。
        //   ⚠️ 这是**类型边界**（第三方 ↔ 本仓），**不是**"Lite 接口与 stable 双轨" ⇒ 断言是刻意的。
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

  /**
   * ★ 连线发起时记下的「源节点 + 当时选中的全部节点」（原 `Ge.current` + `Me`，`_Component42.jsx:621-631`）
   *
   * 源逐行：
   * ```js
   * const Me = useCallback((B, ue) => {
   *   const Oe = L.getState().nodes.filter(We => We.selected).map(We => We.id);
   *   Ge.current = { sourceId: ue.nodeId, selectedIds: Oe };
   * }, []);
   * ```
   * ⚠️ **内存态、不进 store**（源即如此）；一次拖拽结束（`onConnect`/`onConnectEnd`）后清空。
   */
  const connectStartRef = useRef<{ sourceId: string | null; selectedIds: string[] } | null>(null);

  /** ★ 连线：环检测在 state.connect 内（走 core/rules/graph） */
  /**
   * ★ `onConnect`（原 `Re`，`_Component42.jsx:632-654` 逐行回源）
   *
   * 源逐行：
   * ```js
   * const Re = B => {
   *   if (!B || !B.source || !B.target || B.source === B.target) return;
   *   const ue = Ge.current;                       // onConnectStart 记的
   *   const Oe = L.getState().nodes;
   *   if (ue && ue.selectedIds.length > 1) {       // ★ 发起时选了多个
   *     const We = B.target && B.target !== B.source ? B.target : B.source;
   *     const Ze = ue.selectedIds.filter(vt => {
   *       const Dt = Oe.find(St => St.id === vt);
   *       return Dt && Dt.type === 'material' && vt !== We;   // ★ 只要选中的 material
   *     });
   *     if (Ze.length > 1 && We) {                 // ★ 至少两个 material 才走批量
   *       L.getState().connectBatch(Ze, We);
   *       Ge.current = null;
   *       return;
   *     }
   *   }
   *   L.getState().onConnect(B);
   *   Ge.current = null;
   * };
   * ```
   * ⚠️ `Ze.length > 1` 是源的门槛：**只有一个** material 时反而走普通单连（不批量）。
   */
  const onConnect = useCallback(
    (conn: { source: string | null; target: string | null }) => {
      if (!conn.source || !conn.target || conn.source === conn.target) {
        connectStartRef.current = null;
        return;
      }
      const start = connectStartRef.current;
      const cur = storeApi.getState().nodes;
      if (start && start.selectedIds.length > 1) {
        const anchor = conn.target && conn.target !== conn.source ? conn.target : conn.source;
        const materials = start.selectedIds.filter((id) => {
          const n = cur.find((x) => x.id === id);
          return !!n && n.type === 'material' && id !== anchor;
        });
        if (materials.length > 1 && anchor) {
          connectBatch(materials, anchor);
          connectStartRef.current = null;
          return;
        }
      }
      const rejected = connect({ source: conn.source, target: conn.target });
      if (rejected) pushToast(rejected);
      connectStartRef.current = null;
    },
    [connect, connectBatch, pushToast, storeApi],
  );

  /**
   * ★ 连线**落到空白**（原 `G`，`_Component42.jsx:584-607` 逐行回源）
   *
   * 源逐行：
   * ```js
   * const G = (B, ue) => {
   *   if (ue.isValid) return;                       // 连上了就不开面板
   *   const Oe = ue.fromNode;
   *   const We = ue.fromHandle?.type || 'source';
   *   if (!Oe) return;
   *   nt({ x: B.clientX, y: B.clientY, sourceId: Oe.id, fromType: We, flowPos: O({x,y}) });
   * };
   * ```
   * ⚠️ 源这个形态**没有 mode 字段**（走 `ye` 的 `else` 分支）⇒ 本仓起名 `mode:'single'`。
   * ⚠️ `fromType` 决定**连线方向**（从源手柄发起 ⇒ 新节点接在下面；从目标手柄发起 ⇒ 反过来）。
   */
  const onConnectEnd = useCallback(
    (e: MouseEvent | TouchEvent, state: { isValid: boolean | null; fromNode: { id: string } | null; fromHandle?: { type?: string | null } | null }) => {
      if (state.isValid) return;
      const fromNode = state.fromNode;
      if (!fromNode) return;
      const fromType = (state.fromHandle?.type ?? 'source') === 'target' ? 'target' : 'source';
      // 源取的是**鼠标事件的 clientX/Y**（不是 `state.pointer`）
      const clientX = 'clientX' in e ? e.clientX : 0;
      const clientY = 'clientY' in e ? e.clientY : 0;
      setCreatePanel({
        mode: 'single',
        x: clientX,
        y: clientY,
        sourceId: fromNode.id,
        fromType,
        flowPos: screenToFlowPosition({ x: clientX, y: clientY }),
      });
    },
    [screenToFlowPosition],
  );

  /** ★ 连线开始（原 `Me`）—— 只记 ref，不碰 store */
  const onConnectStart = useCallback(
    (_e: MouseEvent | TouchEvent, params: { nodeId: string | null }) => {
      const ids = storeApi.getState().nodes.filter((n) => n.selected).map((n) => n.id);
      connectStartRef.current = { sourceId: params.nodeId, selectedIds: ids };
    },
    [storeApi],
  );

  /**
   * ★ 组连线锚点拖到空白（原 `xe`，`_Component42.jsx:608-620` 逐行）
   *
   * 源逐行：`nt({x, y, flowPos: screenToFlow({x,y}), mode:'group', sourceIds: B})`
   * —— 屏幕坐标定位浮层、flow 坐标定新节点落点（与其它三个入口同构）。
   */
  const onGroupConnectEnd = useCallback(
    (ids: string[], screen: { x: number; y: number }) => {
      setCreatePanel({
        mode: 'group',
        x: screen.x,
        y: screen.y,
        flowPos: screenToFlowPosition({ x: screen.x, y: screen.y }),
        sourceIds: ids,
      });
    },
    [screenToFlowPosition],
  );

  // ── 复制 / 粘贴节点（原 `_Component42.jsx:1178-1326`）────────────────────────────
  const copyNodes = useStore((s) => s.copyNodes);
  const pasteNodes = useStore((s) => s.pasteNodes);
  const hasClipboard = useStore((s) => s.clipboard !== null);
  /** 鼠标屏幕坐标（原 `$t`，`1183-1194`）—— 粘贴落点优先用它 */
  const mouseRef = useRef({ x: 0, y: 0 });
  /** 上次「复制节点」的时刻（原 `ke` + `pe()`，`155-156`） */
  const lastCopyAtRef = useRef(0);
  /** 上次「窗口失焦 / 系统剪贴板变化」的时刻（原 `V`，`1195-1207`） */
  const lastClipboardChangeRef = useRef(0);
  /** 画布外框（原 `bt`，`1178`）—— 判「鼠标在不在画布里」 */
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    // 原 `B`：**两处**都只做一件事 —— 记时间戳（`V.current = Date.now()`）
    const mark = (): void => {
      lastClipboardChangeRef.current = Date.now();
    };
    window.addEventListener('blur', mark);
    const off = hostOps.onClipboardImageChanged(mark);
    return () => {
      window.removeEventListener('blur', mark);
      off();
    };
  }, [hostOps]);

  /**
   * 粘贴落点（原 `mt`，`_Component42.jsx:1208-1232`）
   *
   * 源：鼠标在**画布矩形内** ⇒ `screenToFlowPosition(鼠标)`；否则 ⇒ **`{x:0,y:0}`**
   * （⚠️ 不是 `null` —— 「落在画布原点」是源的行为，逐字保留）。
   */
  const pastePosition = useCallback((): { x: number; y: number } => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const { x, y } = mouseRef.current;
    if (rect && rect.width > 0 && x && y && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return screenToFlowPosition({ x, y });
    }
    return { x: 0, y: 0 };
  }, [screenToFlowPosition]);

  /**
   * 把**系统剪贴板里的图**落成素材节点（原 `$n`，`_Component42.jsx:1246-1275`）
   *
   * 源顺序：`readClipboardImage()` → 没有 `dataUrl` ⇒ 返回 false ·
   * 宽高各兜底 `200/160` → 名字 = **文件名去扩展名后截 40 字**，没有文件名 ⇒ `粘贴图片 HH:MM:SS` ·
   * 落点 = 鼠标位置**减这张图的一半**。
   * @returns 是否真的建了节点（`false` ⇒ 调用方改走「粘贴节点」那条路，原 1314-1316）
   */
  const pasteClipboardImage = useCallback(
    async (pos: { x: number; y: number }): Promise<boolean> => {
      const r = await hostOps.readClipboardImage();
      if (!r.ok) {
        log.warn('[CanvasHost] 读系统剪贴板图片失败:', r.message);
        return false;
      }
      const img = r.value;
      if (!img || !img.dataUrl) return false;
      const natW = img.w || 200;
      const natH = img.h || 160;
      const size = fitMaterialSize(natW, natH);
      const name =
        (img.name ? stripExtension(img.name).slice(0, 40) : '') ||
        CANVAS_TEXT.pastedImageName(formatClockTime(Date.now()));
      addMaterialFromDrop([{ name, dataUrl: img.dataUrl, natW, natH, size }], {
        x: pos.x - size.w / 2,
        y: pos.y - size.h / 2,
      }, { x: 24, y: 24 });
      return true;
    },
    [hostOps, addMaterialFromDrop],
  );

  /**
   * ★ **`Ctrl/⌘+C` / `Ctrl/⌘+V` 复制 / 粘贴节点**（原 `_Component42.jsx:1276-1326` 的 keydown，**逐行回源**）
   *
   * 源（节选）：
   * ```js
   * const Oe = ue.target;
   * if (Oe && (Oe.isContentEditable || Oe.tagName === 'INPUT' || Oe.tagName === 'TEXTAREA')) return;  // ★ 输入框守卫
   * const Ze = ue.key.toLowerCase();
   * if (Ze === 's' && !ue.metaKey && !ue.ctrlKey && !ue.altKey) { ...选中 video ⇒ 逐个截图...; return; }
   * if (ue.metaKey || ue.ctrlKey) {
   *   if (Ze === 'c') { preventDefault(); stopPropagation(); pe(); copyNodes(); return; }
   *   if (Ze === 'v') {
   *     preventDefault(); stopPropagation();
   *     const vt = mt();
   *     if (!!clipboard && V.current < ke.current) { pasteNodes(vt); return; }   // ★ 系统剪贴板没变过 ⇒ 粘节点
   *     $n(vt).then(...);                                                        // 否则读**剪贴板图片**
   *     return;
   *   }
   * }
   * ```
   * ⚠️ 与源一致：**两条分支都 `preventDefault` + `stopPropagation`**（否则浏览器/宿主还会
   *    再处理一次，比如把 `Ctrl+V` 透给页面里的输入框）。
   * ✅ **`Ctrl+V` 的图片回落已落**（2026-10-11）：`pasteClipboardImage` 走 `hostOps.readClipboardImage`
   *    → `addMaterialFromDrop`（**TD-16-95 已结**）。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      const inEditor =
        t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (inEditor) return;
      const key = e.key.toLowerCase();
      // ★ `s`：选中 video 节点 ⇒ 逐个截图（原 `_Component42.jsx:1283-1296`，**在 mod 判断之前**）
      if (key === 's' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const ids = storeApi
          .getState()
          .nodes.filter((n) => n.selected && n.type === 'video')
          .map((n) => n.id);
        if (ids.length) {
          e.preventDefault();
          for (const id of ids) {
            void capture.captureNode(id).then((r) => {
              // ⚠️ 源是 `.catch(() => {})` **静默**（`Rk` 失败返回 `null`）—— 本实现**给提示**（原则 6）：
              //    否则用户按了 `s` 什么都没发生也不知道为什么
              if (!r.ok) pushToast(r.reason || CANVAS_TEXT.captureFailed, undefined, 'warn');
            });
          }
        }
        return;
      }
      if (!e.metaKey && !e.ctrlKey) return;
      if (key === 'c') {
        e.preventDefault();
        e.stopPropagation();
        lastCopyAtRef.current = Date.now(); // 原 `pe()`
        copyNodes();
        return;
      }
      if (key === 'v') {
        e.preventDefault();
        e.stopPropagation();
        const pos = pastePosition();
        if (hasClipboard && lastClipboardChangeRef.current < lastCopyAtRef.current) {
          pasteNodes(pos);
          return;
        }
        // 原 1313-1317：否则读**系统剪贴板里的图**；读不到图才回落「粘贴节点」
        void pasteClipboardImage(pos).then((done) => {
          if (!done && hasClipboard) pasteNodes(pos);
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyNodes, pasteNodes, hasClipboard, pastePosition, pasteClipboardImage, capture, pushToast, storeApi]);

  /**
   * 撤销 / 重做快捷键（原 `_Component48.jsx:32-54`，**逐行回源**）
   *
   * 源：
   * ```js
   * if (!y.metaKey && !y.ctrlKey) return;
   * const b = y.key.toLowerCase();
   * const x = y.target;
   * if ((x && (x.isContentEditable || x.tagName === 'INPUT' || x.tagName === 'TEXTAREA'))
   *     || (b !== 'z' && b !== 'y')) return;
   * y.preventDefault();
   * if (b === 'y' || (b === 'z' && y.shiftKey)) N.redo(); else N.undo();
   * ```
   * ★ **2026-10-11 补两处（此前本仓漏了，其中一处是真 bug）**：
   *   ① **输入框守卫** —— 在正文 / 输入框里按 `Ctrl+Z` **不得**撤销画布：那会**同时**毁掉
   *      用户正在编辑的文字，而且 `preventDefault` 还把**浏览器原生的文本撤销**一起吃掉
   *      ⇒ 表现为「编辑器里按撤销，画布塌了、字没回来」；
   *   ② **`Ctrl/⌘+Y` 也是重做**（此前只认 `Ctrl+Shift+Z`）。
   * ⚠️ 优先级逐字：`key === 'y' || (key === 'z' && shiftKey)` ⇒ 重做；否则撤销（**不判** shift）。
   * ⚠️ 源用 `x && x.tagName === …`（非元素 target ⇒ 不拦）；本仓用 `instanceof HTMLElement`
   *    **同义**且免断言（`document` 之类没有 `tagName`）。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      const t = e.target;
      const inEditor =
        t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (inEditor || (key !== 'z' && key !== 'y')) return;
      e.preventDefault();
      if (key === 'y' || (key === 'z' && e.shiftKey)) redoAction();
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

  /**
   * ★ **切项目后自适应**（原 `_Component42.jsx:500-515`）
   *
   * 源（逐行）：
   * ```js
   * useEffect(() => {
   *   if (!b) return;                                   // `b` = 当前工程 id
   *   const B = setTimeout(() => { try { D({ padding: 0.25, duration: 250 }); } catch {} }, 150);
   *   return () => clearTimeout(B);
   * }, [b, D]);
   * ```
   * ⚠️ **源那个 `catch {}` 是空吞**（ReactFlow 实例未就绪时会抛）—— 本实现把**同步抛**与
   *    **Promise 拒绝**两条路都留痕（原则 6），**不吞**；语义等价（失败就不 fit，不重试）。
   */
  useEffect(() => {
    if (!activeId) return;
    const t = window.setTimeout(() => {
      try {
        void fitView({ padding: 0.25, duration: 250 }).catch(warnFitViewFailed);
      } catch (err) {
        warnFitViewFailed(err);
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [activeId, fitView]);

  const empty = nodes.length === 0;
  /** 节点右键菜单（原 `Y`）—— 见 `NodeContextMenu.tsx` */
  const [nodeMenu, setNodeMenu] = useState<NodeContextMenuState | null>(null);
  /**
   * ★ 素材选择器（原 `_e`，`_Component42.jsx` 的 `useState(null)`）—— **2026-10-12 落**
   *
   * 源里它是一个**判别联合**（`{mode:'replace', nodeId}` / 建素材节点的几种形态）；
   * 本仓**只落 replace 一支**（创建素材节点那一支的宿主未落 ⇒ 不预支，判据 B5）。
   */
  const [materialPicker, setMaterialPicker] = useState<{ nodeId: string } | null>(null);
  /**
   * ★ 「保存为节点预设」的**载荷**（原 `ae`，`_Component42.jsx:1138-1155`）—— 住**宿主本地态**
   *   （源也是 `useState`：`we({ nodes: structuredClone(ue), edges: structuredClone(Oe) })`）。
   *   ⚠️ 快照计算复用 `core/rules/clipboard.buildClipboard` —— 与「复制」**同一份**语义
   *     （多选才带边，且只带**两端都在选中集合里**的边；单选 ⇒ 空边；没选中 ⇒ `null`）。
   */
  const [nodePresetPayload, setNodePresetPayload] = useState<ClipboardPayload | null>(null);
  /** 拖入悬停态（原 `K`）—— 亮起 `.drop-hint` 提示层 */
  const [dropActive, setDropActive] = useState(false);

  /** 提示音开关（原 `xt` = `soundEnabled`） */
  const soundEnabled = useStore((s) => s.soundEnabled);
  /** 上一帧的 `video` 节点数（原 `Nt`）—— 只在**变多**时响 */
  const lastVideoCount = useRef(0);

  /**
   * ★ **成片落地提示音**（原 `_Component42.jsx:435-443`，**逐行回源**）
   *
   * 源：
   * ```js
   * const B = r.filter(ue => ue.type === 'video').length;
   * if (xt && B > Nt.current) gt();
   * Nt.current = B;
   * ```
   * ⚠️ 判据是 **`video` 节点**（**不是** `genvideo`）—— 「成片落到画布」才响，逐字保留。
   * ⚠️ **源的既有行为（照实保留）**：`Nt` 初值 `0` ⇒ **打开一个含 `video` 节点的工程时会响一次**
   *    （切工程同理）。这是源的 quirk，**不擅自"修"**；要改说一声。
   */
  useEffect(() => {
    const count = nodes.filter((n) => n.type === 'video').length;
    if (soundEnabled && count > lastVideoCount.current) playChime();
    lastVideoCount.current = count;
  }, [nodes, soundEnabled]);

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

  /**
   * ★ **拖放入口**：资源库素材 / 图片文件 / `.md` 文件（原 `pa`，`_Component42.jsx:1337-1422`）
   *
   * 源的顺序（**逐行**）：`preventDefault` → 关 `.drop-hint` → 读**素材 MIME**（命中就处理完并 `return`）
   * → 否则把 `dataTransfer.files` 分成**图片**（`type` 以 `image/` 开头）与 **Markdown**
   * （`type === 'text/markdown'` 或文件名以 `.md`/`.markdown` 结尾）；两类都没有 ⇒ 直接 `return`。
   */
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDropActive(false);
      // ① 资源库里的素材（走 `ensureMaterialNode`：画布上已有同源节点就**移动**它）
      const libId = e.dataTransfer.getData(DRAG_MIME_MATERIAL);
      if (libId) {
        const item = library.find((it) => it.id === libId);
        if (!item) {
          // ★ 拖了不存在的素材 —— 明确上报（原则 6），不静默吞
          pushBackendError('unknown', CANVAS_TEXT.materialMissing(libId));
          return;
        }
        const res = ensureMaterialNode(libId, {
          position: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
          // 原 1350：`Vl(St.w, St.h)` —— 由库条目的原始尺寸算出节点级尺寸
          size: fitMaterialSize(item.w, item.h),
        });
        if (res.reused) pushToast(CANVAS_TEXT.materialReused(item.name), 2800, 'info');
        return;
      }
      // ② 文件（图片 / Markdown），原 1360-1420
      const files = Array.from(e.dataTransfer.files || []);
      const images = files.filter((f) => (f.type || '').startsWith('image/'));
      const mds = files.filter(
        (f) => (f.type || '') === 'text/markdown' || /\.(md|markdown)$/i.test(f.name || ''),
      );
      if (!images.length && !mds.length) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const stagger = { x: 24, y: 24 }; // 原 `Dt`
      if (images.length) {
        // 原 1379-1398：`Pu` 逐个读图 → 滤掉读不出来的 → 落点 = 鼠标位置**减第一张的一半**
        const read = (await Promise.all(images.map((f) => readImageFile(f))))
          .filter((i) => i.dataUrl)
          .map((i) => ({
            name: i.name,
            dataUrl: i.dataUrl,
            natW: i.natW,
            natH: i.natH,
            size: fitMaterialSize(i.natW, i.natH),
          }));
        const first = read[0];
        if (first) {
          addMaterialFromDrop(read, { x: flow.x - first.size.w / 2, y: flow.y - first.size.h / 2 }, stagger);
        }
      }
      if (mds.length) {
        // 原 1400-1420：先建文本节点（**标题 = 文件名去扩展名**）→ 再把正文写进去
        const read = await Promise.all(
          mds.map(async (f) => ({ name: stripExtension(f.name), text: await readTextFile(f) })),
        );
        const base = { x: flow.x - 140, y: flow.y - 75 }; // 原 1407-1409
        read.forEach((it, i) => {
          const nodeId = addNode('text', { x: base.x + i * stagger.x, y: base.y + i * stagger.y }, {
            label: it.name || CANVAS_TEXT.mdFallbackTitle,
          });
          if (nodeId) patchNodeData(nodeId, { text: it.text });
        });
      }
    },
    [
      library,
      ensureMaterialNode,
      addMaterialFromDrop,
      addNode,
      patchNodeData,
      screenToFlowPosition,
      pushBackendError,
      pushToast,
    ],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    // ★ 原 `_Component42.jsx:1327-1331` 的 `Yr`：**无条件** `preventDefault` + 提示层亮起
    //   （此前本仓只放行素材 MIME ⇒ 拖**文件**进来时浏览器直接拒绝）
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropActive(true);
  }, []);

  /** 离开提示层（原 `Qn`，`_Component42.jsx:1332-1336`：`currentTarget === target` 才收） */
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDropActive(false);
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

  /**
   * ★ **边双击 → 删边**（原 `dt`，`_Component42.jsx:576-583`）
   *
   * 源逐行：
   * ```js
   * const dt = useCallback((B, ue) => {
   *   if (He.current) { clearTimeout(He.current); He.current = null; }   // ★ 先**取消单击的 220ms 防抖**
   *   nt(null);          // 关掉「建节点」浮层
   *   v(ue.id);          // removeEdge
   * }, [v]);
   * ```
   * ⚠️ **关键在第一步**：不清那个防抖的话，双击会**先弹建节点浮层**（220ms 后）**再删边** ——
   *    这正是源把 `He.current` 提出来共享的原因。
   * ⚠️ 与源一致：**不** `stopPropagation`、**不** `preventDefault`（双击本身不改选中态）。
   * ⚠️ 前置已就绪：本刀之前刚把 `zoomOnDoubleClick={false}` 对齐（否则双击会被 xyflow 抢去缩放）。
   */
  const onEdgeDoubleClick = useCallback(
    (_e: React.MouseEvent, edge: CanvasEdge) => {
      if (createTimer.current) {
        clearTimeout(createTimer.current);
        createTimer.current = null;
      }
      setCreatePanel(null);
      removeEdge(edge.id);
    },
    [removeEdge],
  );

  /** 节点右键 → 「引用该节点生成」（原 `node-ctx-menu` 的入口；多选时带上全部选中项） */
  /**
   * ★ **空白处右键 → 建节点浮层**（原 `W`（pane）与 `uo`（画布容器），`_Component42.jsx:1027-1046` / `1423-1442`）
   *
   * 源的两个入口做的是**同一件事**，只有守卫宽度不同（`uo` 额外放过 `.node-ctx-menu` 与
   * `.create-panel`：点已开的面板本身不该再弹一个）⇒ 本仓**共用一个回调**、取守卫**并集**（判据 C1）。
   * 源逐行：`preventDefault()` → 取 `nodes.some(n => n.selected)`（= `hasSelection`）→
   * `nt({x: clientX, y: clientY, flowPos: screenToFlow(…), mode:'context', hasSelection})`。
   * ⚠️ 源用**原始类名**（`.create-panel`）做守卫；本仓 CSS Modules **类名被哈希**了
   * ⇒ 改用 `CreatePanel` 自带的 `data-testid`（同一含义，见 `CreatePanel.tsx`）。
   * ⚠️ `.node-ctx-menu` 那半**暂不落** —— 那张菜单本身还没实现（**TD-16-94**），
   *    等它落地时把这条守卫一起补上。
   */
  const onPaneContextMenu = useCallback(
    // ⚠️ ReactFlow 的 `onPaneContextMenu` 与 React 的 `onContextMenu` **事件类型不同**
    //   （前者收原生 `MouseEvent`，后者收 React 的合成事件）⇒ 这里取**并集**。
    (e: MouseEvent | React.MouseEvent) => {
      const target = e.target;
      if (
        target instanceof Element &&
        (target.closest('.react-flow__node') ||
          target.closest('[data-testid="create-panel"]') ||
          target.closest('[data-testid="node-ctx-menu"]'))
      ) {
        return;
      }
      e.preventDefault();
      setCreatePanel({
        mode: 'context',
        x: e.clientX,
        y: e.clientY,
        flowPos: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        hasSelection: storeApi.getState().nodes.some((n) => n.selected),
      });
    },
    [storeApi, screenToFlowPosition],
  );
  /**
   * ★ **节点右键**（原 `Ce`，`_Component42.jsx:1047-1069`）—— 开 **`node-ctx-menu`**（不是建节点浮层）
   *
   * 源逐行：`preventDefault()` + `stopPropagation()` → **未选中且当前选中 < 2 个** ⇒
   * `onNodesChange` 把它设为**唯一选中**（多选时保留多选）→ `de({x, y, nodeId, nodeType})` 开菜单。
   * ⚠️ **2026-10-11 更正（TD-16-94）**：此前本仓在这里开**建节点浮层**（`mode:'node'`）——
   *   源的节点右键**从来不开它**；那个浮层只属于「连线落到空白」（`G`，`onConnectEnd`）与
   *   「空白右键」（`mode:'context'`）两个入口。
   */
  const onNodeContextMenu = useCallback(
    // ⚠️ 只取右键那一项需要的字段（ReactFlow 传的是完整节点，这里按结构收）
    (e: React.MouseEvent, node: { id: string; type?: string; selected?: boolean }) => {
      e.preventDefault();
      e.stopPropagation();
      const st = storeApi.getState();
      const selectedCount = st.nodes.filter((n) => n.selected).length;
      if (!node.selected && selectedCount < 2) selectOnly([node.id]);
      setNodeMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, nodeType: node.type ?? '' });
    },
    [selectOnly, storeApi],
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
      ref={wrapRef}
      className={styles.wrap}
      onDoubleClickCapture={onDoubleClick}
      onContextMenu={onPaneContextMenu}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <ReactFlow<RFCanvasNode, CanvasEdge>
        className="xy-theme"
        // ⚠️ `stable/model` 的 `CanvasNode` 与 xyflow 的 `RFCanvasNode` 语义一致，
        //    仅框架约束不同（见 `ui/nodes/types.ts`）⇒ 边界处断言
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onConnect={onConnect}
        // ★ 连线开始/结束（原 `Me`/`G`）—— 多选 material 批量连 + 落空开建节点浮层
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        // ★ 建节点入口（原 `st` 的边点击 + `node-ctx-menu` 的节点右键）
        onEdgeClick={onEdgeClick}
        // ★ 边双击 → 删边（原 `dt`，`_Component42.jsx:576-583`）
        onEdgeDoubleClick={onEdgeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        // ★ 空白右键（源 `W`，`_Component42.jsx:1027-1046`）
        onPaneContextMenu={onPaneContextMenu}
        // ★ 与源一致（`_Component42.jsx:1444`）：原版**显式设了两个删除键**。
        //   不设的话 xyflow 默认只有 `Backspace` ⇒ `Delete` 键删不掉节点（实测差距）
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onlyRenderVisibleElements
        /*
         * ★ **2026-10-11 补齐（原 `_Component42.jsx:1444-1449` 的 props 全量对齐）**
         *
         * 逐字对源的这一批（此前只落了 `deleteKeyCode`/`minZoom`/`maxZoom`/`onlyRenderVisibleElements`）：
         *   `defaultEdgeType="interactive"` · `colorMode="light"` · `snapToGrid={snap}` ·
         *   `snapGrid={[20,20]}` · `selectionOnDrag={false}` · `panOnDrag` · `selectionMode=Partial` ·
         *   `zoomOnDoubleClick={false}` · `connectionRadius={60}` · `multiSelectionKeyCode={['Shift','Meta']}` ·
         *   `fitView` + `fitViewOptions={{padding:.25,duration:250}}` · `proOptions={{hideAttribution:false}}`
         *
         * ⚠️ `snapToGrid` 绑的是**工程级的 `snap` 开关**（源 `y` = store 的 `snap`）—— 它同时
         *    参与批量排布的网格对齐（`state/slices/materialBatch`），两处同一个真源。
         * ⚠️ `fitView` + `fitViewOptions` **与下面「字体就绪后 fitView」的 effect 并存** —— 源也是
         *    两者都有（prop 管首帧、effect 管字体/布局就绪后的二次对齐），**不合并**。
         * ⚠️ `proOptions.hideAttribution: false` = **显示** xyflow 的水印（源如此，逐字）。
         *    此前本仓写的是 `true`（隐藏）—— 本刀按源改回 `false`。
         * ⚠️ 源的 `defaultEdgeType="interactive"` **本仓不落**：① 当前 `@xyflow/react` 的
         *    `ReactFlowProps` **没有这个 prop**（v12 已移除，传了会报 TS 错）；② 本仓
         *    `CanvasEdge.type` **已收窄为字面量 `'interactive'`**（`stable/model/project.ts:16`），
         *    连线时由 `state/store` 显式写 `type: 'interactive'`（`store.ts:144`）
         *    ⇒ **结构上已保证**，该 prop 在本仓**冗余**。
         */
        colorMode="light"
        snapToGrid={snap}
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        selectionOnDrag={false}
        panOnDrag
        selectionMode={SelectionMode.Partial}
        zoomOnDoubleClick={false}
        connectionRadius={60}
        multiSelectionKeyCode={['Shift', 'Meta']}
        fitView
        fitViewOptions={{ padding: 0.25, duration: 250 }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Lines} gap={GRID_SIZE} size={1} style={{ opacity: GRID_OPACITY }} />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={(n) => MINIMAP_COLOR[n.type ?? ''] ?? 'var(--color-node-other)'} pannable zoomable />
        {/* ★ 组连线锚点（原 `_Component37`，`_Component42.jsx:1463`）—— 选中 ≥2 个节点才出现 */}
        <GroupConnectHandle onGroupConnectEnd={onGroupConnectEnd} />
      </ReactFlow>

      {/* ★ 生成面板（选中生成类节点时出现）—— 必须住在 `ReactFlowProvider` 内：
          它订阅 xyflow 的 `transform` 做锚点定位，放在 AppShell 里会因缺少 provider 抛
          「not used ReactFlowProvider as an ancestor」 */}
      <GenPanel />

      {/* ★ 批量发送触发条（原 `L3.jsx`，源在 `_Component42.jsx:1472` 渲染）——
          同因：它用 `useViewport()` + `getNodesBounds()` 算落点 ⇒ **必须**在 provider 内 */}
      <BatchSendPanel />

      {empty && (
        <div className={styles.emptyHint}>
          <div className={shared.emptyTitle}>{CANVAS_TEXT.emptyTitle}</div>
          <div>{CANVAS_TEXT.emptyHint}</div>
        </div>
      )}

      {/* ★ 选择工具条（原 `.sel-toolbar`）—— 成组的入口（`groupSelected` 此前没有调用方） */}
      {dropActive && <div className={styles.dropHint}>{CANVAS_TEXT.dropHint}</div>}

      {/* ★ 节点右键菜单（原 `node-ctx-menu`，`_Component42.jsx:1685-1726`）—— 6/6 项（见组件头注） */}
      {nodeMenu && (
        <NodeContextMenu
          state={nodeMenu}
          onClose={() => setNodeMenu(null)}
          // 源 `Te`：先记「刚复制」时刻再 `copyNodes()`（⇒ `Ctrl+V` 才粘得出来）
          onCopyNodes={() => {
            lastCopyAtRef.current = Date.now();
            copyNodes();
          }}
          // ★ 项 5「保存为节点预设」（原 `rt`）：抓选中子图快照 → 开模态（菜单随即卸载）
          onSaveAsPreset={() => {
            setNodeMenu(null);
            setNodePresetPayload(buildClipboard(nodes, edges));
          }}
          // ★ 项 2「更换素材」（原 `Ye`）：只记 nodeId → 开素材选择器（菜单随即卸载）
          onReplaceMaterial={() => {
            setNodeMenu(null);
            setMaterialPicker({ nodeId: nodeMenu.nodeId });
          }}
        />
      )}

      {/* ★ 素材选择器（原 `DT.jsx`，`_Component42.jsx:1681` 的 `{_e && <_cmp_DT …/>}`）—— 2026-10-12 落 */}
      {materialPicker && (
        <MaterialPickerModal nodeId={materialPicker.nodeId} onClose={() => setMaterialPicker(null)} />
      )}

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

      {/* ★ 「拆分并套用节点预设」弹窗（原 `_Component42.jsx:1816-1863`）—— 由拆分弹窗提交时开 */}
      {splitPresetPicker && (
        <SplitPresetPickerModal
          sourceNodeId={splitPresetPicker.sourceNodeId}
          keywords={splitPresetPicker.keywords}
          onClose={closeSplitPresetPicker}
          onSplit={(ids) => void fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2 })}
        />
      )}

      {/* ★ 「保存为节点预设」弹窗（原 `_Component42.jsx:1745-1773`）—— 载荷 = 选中子图快照 */}
      {nodePresetPayload && (
        <NodePresetModal
          payload={nodePresetPayload}
          onClose={() => setNodePresetPayload(null)}
        />
      )}

      {/* ★ 遮脸参数面板（原 `_Component40`）—— 视口级浮层，由外壳挂（同 `splitModal`） */}
      {faceMaskPanel && (
        <FaceMaskPanel
          nodeId={faceMaskPanel.nodeId}
          x={faceMaskPanel.x}
          y={faceMaskPanel.y}
          onClose={closeFaceMaskPanel}
        />
      )}

      {/* ★ 图片编辑器（原 `G3.jsx`，`_Component42.jsx:1727-1744`）—— lazy 动态导入（`docs/过程.md` M3） */}
      {imageEditor && (
        <Suspense fallback={null}>
          <ImageEditor
            imgRef={imageEditor.imgRef}
            label={imageEditor.label}
            onClose={closeImageEditor}
            onSaved={(dataUrl, size) => {
              const nodeId = imageEditor.nodeId;
              closeImageEditor();
              if (!dataUrl) return;
              // ★ 源 `_Component42.jsx:1736-1743`：按节点类型分派（imggen → 换当前图，否则 → 换素材图）
              const node = nodes.find((n) => n.id === nodeId);
              if (node && node.type === 'imggen') {
                replaceImageGenImage(nodeId, dataUrl, { w: size.w, h: size.h });
              } else {
                replaceMaterialImage(nodeId, dataUrl, { w: size.w, h: size.h });
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

/** 切项目后 `fitView` 失败 → 就地留痕（源是空 `catch {}`；原则 6） */
function warnFitViewFailed(err: unknown): void {
  log.warn('[CanvasHost] 切项目后 fitView 失败:', err);
}

export function CanvasHost() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
