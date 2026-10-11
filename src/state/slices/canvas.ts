/**
 * Canvas slice（② 子树共享：只在画布子树内 —— docs/11 §5.1）
 *
 * ⚠️ 原则 1：只有 state 能写 store
 * ⚠️ 撤销/重做的**纯逻辑**在 `core/rules/undo.ts`（已测 W5）；本文件只做接线 + 注入时钟
 * ⚠️ **快照时机 = 变更之前**（统一约定，见 `core/rules/undo.ts` 头部说明）
 */

import type { CanvasNode, NodeType } from '@/stable/model/node';
import type { CanvasEdge, LibraryItem } from '@/stable/model/project';
import {
  commitSnapshot,
  initialUndoStack,
  redo as redoStack,
  undo as undoStack,
  type UndoStack,
} from '@/core/rules/undo';
import {
  applyConnection,
  detachConnection,
  edgeInsertPosition,
  type ConnectRequest,
} from '@/core/rules/graph';
import { makeLibraryId, makeNodeId } from '@/core/rules/project';
import { defaultNodeData, nodeCreateSize } from '@/core/model/defaults';
import { buildMaterialBatch, type MaterialBatchInput } from './materialBatch';
// ⚠️ `按配方重跑` 反建出来的文本框默认名（SSOT，不内联中文）
import { VIDEO_NODE_TEXT } from '@/constants/text';
import type { LovartGalleries } from '@/core/rules/lovartGallery';
import { screenshotNodePlacement, type ScreenshotAnchorLike } from '@/core/rules/capture';
import {
  groupSelectedNodes,
  ungroupNodes as ungroupPure,
  type GroupNodeLike,
} from '@/core/rules/group';
import { planArrange, type ArrangeMode } from '@/core/rules/arrange';
import { splitAuto, splitByKeywords, type SplitFailReason } from '@/core/rules/splitText';
import { SPLIT_NODE_GAP, SPLIT_NODE_HEIGHT, SPLIT_NODE_WIDTH } from '@/constants';
import {
  recipeTextNodePosition,
  RECIPE_TEXT_FALLBACKS,
  type RecipeAnchorLike,
} from '@/core/rules/recipe';
import {
  planMaterialRename,
  type MaterialNodeLike,
  type RenamableLibraryItem,
} from '@/core/rules/materialRename';
import type { CanvasEdge as Edge } from '@/stable/model/project';

/** 被快照的状态（原 `Td` = `structuredClone({nodes,edges,library})`） */
export interface CanvasSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  library: LibraryItem[];
}

/** 快照深拷贝（原 `Td` 26745） */
export const takeSnapshot = (s: CanvasSnapshot): CanvasSnapshot =>
  structuredClone({ nodes: s.nodes, edges: s.edges, library: s.library });

/** slice 需要的注入依赖（时钟来自 `ClockPort`） */
export interface CanvasSliceDeps {
  now(): number;
  /** 新边的 id 生成（副作用，由 state 注入） */
  makeEdge(conn: ConnectRequest): Edge;
  /**
   * 把一张图**落成本地引用**（原 `Tn` 22578-22596）—— ⚠️ **不纯**（内部走
   * `MediaPort.saveImageSync`，是个**同步 IPC**）⇒ 由 `bootstrap` 注入，`core` 不碰宿主。
   * ⚠️ 与 `GallerySliceDeps.normalizeImage` 是**同一个东西**（同一处注入实现）。
   */
  persistImage(dataUrl: string): string;
}

export interface CanvasSlice {
  // ── state ──
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  library: LibraryItem[];
  /** 吸附开关（工程级，随 ProjectData 持久化） */
  snap: boolean;
  /** 撤销栈（原 `past`/`future`/`_lastCommit`） */
  undo: UndoStack<CanvasSnapshot>;

  // ── actions ──
  setGraph: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  /**
   * ★ **只改节点**（不动 `edges`）
   *
   * ⚠️ 为什么要它（既有缺陷，2026-10-10 修）：`CanvasHost` 的 `onNodesChange` / `onEdgesChange`
   *   原本都调 `setGraph(新的那一半, **闭包里的另一半**)` ⇒ 两个回调会**互相用旧值覆盖对方**。
   *   实测后果：删节点后 ReactFlow 报「边变更」，`onEdgesChange` 拿**旧的 `nodes`** 把刚删的
   *   节点**复活**，随后再次删除 ⇒ 撤销栈被压入 `{2 节点, 0 边}` 的坏快照（Ctrl+Z 后**边回不来**）。
   * ⇒ 拆成两个只改自己那一半的 action，**结构上不可能**再互相覆盖（与 `setLibrary` 对称）。
   */
  setNodes: (nodes: CanvasNode[]) => void;
  /** ★ **只改边**（不动 `nodes`）—— 理由同上 */
  setEdges: (edges: CanvasEdge[]) => void;
  setLibrary: (library: LibraryItem[]) => void;
  setSnap: (snap: boolean) => void;

  /**
   * 提交快照（原 `commit`）—— ⚠️ **必须在变更之前调用**
   * 同 key 且 <800ms 合并；栈上限 80
   */
  commit: (key: string) => void;
  undoAction: () => void;
  redoAction: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /**
   * 添加连线（原 `onConnect`）—— 内含环检测 + `referenceOrder` 维护
   * @returns 被拒时的提示文案；成功返回 `null`
   */
  connect: (conn: ConnectRequest) => string | null;
  /** 删除连线（并清理 `referenceOrder`） */
  disconnect: (edge: CanvasEdge) => void;

  /** ★ 建文本节点（原「双击画布创建文本框」）—— 返回新节点 id */
  addTextNode: (position: { x: number; y: number }) => string;
  /**
   * ★ 建**任意类型**的节点（原 `_Component42.jsx` 的 `ye` 分派到的 `$`/`be`/`ie`/`Ne`/`$e` 的**建节点半**）
   *
   * ⚠️ 2026-10-10 补：此前只有 `addTextNode`/`addMaterialNode` ⇒ **8 类节点只有 2 类能建出来**
   *    （文生图 / 文生视频 / 账号 / 下载 / 组 **零入口**）⇒ `GenPanel` 实际不可达。这是**未登记的断链**。
   *
   * 数据来自 `NODE_DEFAULTS`（8 类齐备）；`patch` 用于覆盖/补充（如 `accountId` / `folder` / `libId`）。
   * @returns 新节点 id
   */
  addNode: (type: NodeType, position: { x: number; y: number }, patch?: Record<string, unknown>) => string;
  /**
   * ★ 在一条边上**插入**节点（原 `mode:'edge'`，`_Component42.jsx:783-794`）
   *
   * 语义（**逐字对齐**）：算两端中心的中点落点 → 建节点 → **删掉原边** → 补 `source→new` 与 `new→target`。
   *
   * ⚠️ 这里**不走** `connect()` 的环检测：性质上 `source→new→target` 是原 `source→target` 的细分，
   *    **不可能**引入新环（源版 `w(...)` 也是直接连）。
   * @returns 新节点 id；**边或端点不存在 ⇒ `null`**（原版会静默失败，这里让调用方可判）
   */
  /**
   * ★ **素材节点改名**（原 `renameMaterialNode` shared.js:27549-27625）
   *
   * ★★ 要点是**多址一起改**：资源库同名项 + **所有指向同一来源的素材节点**
   *   （同一个 `libId`，或两边都没 `libId` 而 `dataUrl` 相同）—— 否则"同一个素材会有两个名字"。
   *
   * ⚠️ 撤销 key 是 **`rename-${nodeId}`**（原 27570）⇒ 改 A 再改 B 是**两步撤销**。
   * ⚠️ 源版还会同步 `lovartGalleries`（27571-27590）——**该字段本工程未落地**，
   *   这一支**不实现也不假装**（见 `core/rules/materialRename.ts` 的跳过说明）。
   * ⚠️ 空名/找不到节点 ⇒ **什么都不做**（源版同）。
   */
  renameMaterialNode: (nodeId: string, name: string) => void;
  /**
   * ★ **建截图素材节点**（原 `addScreenshotMaterial` shared.js:28312-28352）
   *
   * 几何：放在**视频右侧一列**（`x + 宽 + 40`）、每张下移 **26px**、**最多叠 8 层**
   * （纯层 `screenshotNodePlacement`）。`label` 缺省「截图」。
   * ⚠️ 源版还把新节点的 `width/height` 设成 **220×180**，而本工程的 `addNode` 不接受节点级尺寸
   *   ⇒ 用该类型的默认尺寸（**观感差异一处，不假装**）。
   * @returns 新素材节点 id；`dataUrl` 为空 / 找不到源视频 ⇒ `null`
   */
  addScreenshotMaterial: (input: {
    sourceVideoId: string;
    dataUrl: string;
    label?: string;
    sourceTime?: number;
  }) => string | null;
  /**
   * ★ **按配方重跑**（原 `addTextNodeFromRecipe` shared.js:29450-29494）
   *
   * ★ 它**不是"再跑一次"**，而是**用一条配方反建一个文本框** —— 把配方里的
   *   提示词/模型/时长/比例填进新节点，落在**锚点节点正下方**（`x` 不变、`y` 加高度 + 40）。
   * ⚠️ 撤销 key 用源版那个 `'graph-add'`（由 `addNode` 统一给，不另立一个）。
   * ⚠️ 与源一致：**没有锚点 ⇒ `{120,120}`**；`snap` 为真 ⇒ 吸附到 20 网格。
   * @returns 新文本框的 id
   */
  addTextNodeFromRecipe: (input: {
    prompt?: string;
    model?: string;
    duration?: number;
    ratio?: string;
    styleId?: string;
    anchorNodeId?: string;
    name?: string;
  }) => string;
  /**
   * ★ **成组**（原 `groupSelectedNodes` shared.js:31497）：把选中的（**非组**）节点收进新组
   *
   * ⚠️ 少于 2 个 ⇒ `{ok:false, reason:'need-2'}`（源版同）。
   * ⚠️ 撤销 key 用源版那两个字面量 `'group'` / `'ungroup'`（原 `commit('group')` / `commit('ungroup')`）。
   */
  groupSelected: () => { ok: boolean; groupId?: string; reason?: string };
  /** ★ **取消组**（原 `ungroupNodes` 31610）：释放成员、只删容器 */
  ungroupNodes: (groupId: string) => void;
  /**
   * ★ **整齐排列**（原 `arrangeNodes` shared.js:31650-31844）
   *
   * 九种模式（源版菜单 `_Component42.jsx:1506-1555`）：`smart`（智能网格）+
   * 水平 `left`/`hcenter`/`right`/`hdist` + 垂直 `top`/`vcenter`/`bottom`/`vdist`。
   * 几何全在**已测**的 `core/rules/arrange.ts`（`planArrange`）。
   * ⚠️ 少于 2 个非组节点 ⇒ `{ok:false, reason:'need-2'}`（源版同）。
   * ⚠️ 撤销 key 用源版那个字面量 **`'arrange'`**（原 `commit('arrange')` 31811）。
   */
  arrangeNodes: (mode: ArrangeMode) => { ok: boolean; mode?: ArrangeMode; count?: number; reason?: string };
  /**
   * ★ **清空画布**（原 `clear` shared.js:29704-29710）
   *
   * ⚠️ 只清 `nodes` / `edges` —— **不动 `library`**（源版同）。
   * ⚠️ 撤销 key 用源版那个字面量 **`'delete'`**（原 `commit('delete')`）。
   */
  clearCanvas: () => void;
  /**
   * ★ **按关键词拆分文本节点**（原 `splitDirect` shared.js:28552-28645）
   *
   * 顺序（**逐行对源**）：
   *   ① 取源节点（不在 ⇒ `node-missing`）
   *   ② 有关键词 ⇒ `splitByKeywords`；没有 ⇒ `splitAuto`（原 `l ? Ty(a,r) : $y(a)`）
   *   ③ **片段数 < 2 ⇒ 不拆**（`no-keyword` / `not-splittable`）
   *   ④ `commit('graph-add')` → 建 N 个文本框（**纵向堆叠**，同一 `x`）→ **串联成链**
   *   ⑤ 删掉源节点与它的边，接上新节点与新链边
   *
   * ⚠️ 与源的两处如实差异：
   *   **(a)** 源版在末尾调 `fitViewAction(newIds)`（视图能力）—— 本工程**不把视图能力塞进 store**
   *       ⇒ 由 **UI**（`CanvasHost` 的 `useReactFlow().fitView`）拿 `newIds` 自己调；
   *   **(b)** 源版把结果写进 `splitFeedback` 并让按钮显示 `✓ 已拆分` —— 本工程用 **toast**
   *       （而且源版那档 `✓ 已拆分` **不可达**：源节点已被删、`TextNode` 已卸载）。
   * @returns `newIds` = 新节点 id（顺序即片段顺序），供 UI 定位视图
   */
  splitTextNode: (
    nodeId: string,
    keywords: readonly string[],
  ) => { ok: boolean; count?: number; newIds?: string[]; reason?: SplitFailReason };
  insertNodeOnEdge: (
    edgeId: string,
    type: NodeType,
    patch?: Record<string, unknown>,
  ) => string | null;
  /** ★ 建素材节点（原「从资源库拖入」）—— 返回新节点 id */
  addMaterialNode: (
    item: { id: string; name: string; dataUrl: string; w?: number; h?: number; natW?: number; natH?: number },
    position: { x: number; y: number },
  ) => string;
  /**
   * ★ **批量把素材加进画布**（原 `addMaterialsBatch` shared.js:29084-29242）
   *
   * 顺序（**逐行对源**）：
   *   ① 排**居中网格**（纯层 `planMaterialGrid`；`snap` 为真时落点吸附 20 网格）
   *   ② 逐张：**`data:` 图先落盘外置**（`deps.persistImage`，原 `Tn`）
   *   ③ library **按 `dataUrl` 去重** —— 已有库条目直接复用；若该条目**已在画布上**，连节点也复用（跳过）
   *   ④ 建素材节点（含新库条目）
   *
   * ⚠️ 与源的两处如实差异：**(a)** 源版末尾调 `fitViewAction(newIds)` —— 视图能力**不塞进 store**，
   *    由 UI 自己调；**(b)** `autoPlace`（读 `nodes` 算落点）保留（`_Component26` 用），
   *    但**画廊只传 `{gap, scale}`**（与源 `_Component23/24` 一致）。
   * @returns 新节点 id（**顺序即入参顺序**）；已在画布上的那张返回**既有节点 id**
   */
  addMaterialsBatch: (
    items: readonly MaterialBatchInput[],
    opts?: { cols?: number; gap?: number; scale?: number; autoPlace?: boolean },
  ) => string[];
  /** ★ 删除节点（连带删除其相关边与 `referenceOrder` 引用） */
  removeNodes: (ids: readonly string[]) => void;
  /** 更新单个节点的 `data`（局部合并） */
  patchNodeData: (id: string, patch: Record<string, unknown>) => void;
}

export function createCanvasSlice(
  set: (partial: Partial<CanvasSlice>) => void,
  /**
   * ⚠️ **`get()` 的返回类型要与它实际读到的跨片字段相交** —— 运行期它就是**整个 store**，
   *   只是切片工厂的类型只看得到自己那片。本切片要读 `lovartGalleries`（素材改名时同步改名，
   *   原 27571-27604）⇒ 在这里显式声明（**同层 state → state，允许方向**），
   *   比在调用处写一个"看起来像在骗类型系统"的 `as` 要好。
   */
  get: () => CanvasSlice & { lovartGalleries?: LovartGalleries; purgeLovartGallery?: (id: string) => void },
  deps: CanvasSliceDeps,
): CanvasSlice {
  /** 节点 id 序号（原 Pt 的计数） */
  let nodeSeq = 0;

  /** 取当前可快照的三元组 */
  const current = (): CanvasSnapshot => {
    const s = get();
    return { nodes: s.nodes, edges: s.edges, library: s.library };
  };

  return {
    nodes: [],
    edges: [],
    library: [],
    snap: true,
    undo: initialUndoStack<CanvasSnapshot>(),

    setGraph: (nodes, edges) => set({ nodes, edges }),
    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),
    setLibrary: (library) => set({ library }),
    setSnap: (snap) => set({ snap }),

    commit: (key) => {
      const s = get();
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), key, deps.now()) });
    },

    undoAction: () => {
      const s = get();
      const out = undoStack(s.undo, takeSnapshot(current()));
      if (!out) return;
      set({
        nodes: out.restored.nodes,
        edges: out.restored.edges,
        library: out.restored.library,
        undo: out.stack,
      });
    },

    redoAction: () => {
      const s = get();
      const out = redoStack(s.undo, takeSnapshot(current()));
      if (!out) return;
      set({
        nodes: out.restored.nodes,
        edges: out.restored.edges,
        library: out.restored.library,
        undo: out.stack,
      });
    },

    canUndo: () => get().undo.past.length > 0,
    canRedo: () => get().undo.future.length > 0,

    connect: (conn) => {
      const s = get();
      const res = applyConnection(s.nodes, s.edges, conn, deps.makeEdge);
      if (!res.ok) {
        // ★ 原则 6：错误原样返回（文案来自 core/rules 的常量，未改写）
        return res.message;
      }
      // 变更前 commit（统一约定）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({ nodes: res.value.nodes, edges: [...s.edges, res.value.edge] });
      return null;
    },

    disconnect: (edge) => {
      const s = get();
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-delete', deps.now()) });
      const out = detachConnection(s.nodes, s.edges, edge);
      set({ nodes: out.nodes, edges: out.edges });
    },

    addNode: (type, position, patch) => {
      const s = get();
      const id = makeNodeId(type, deps.now(), ++nodeSeq);
      const node = {
        id,
        type,
        position,
        data: { ...defaultNodeData(type), ...patch },
      } as CanvasNode;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({ nodes: [...s.nodes, node] });
      return id;
    },

    // ⚠️ 下面两个是 `addNode` 的**薄封装**（判据 C1：原先各写一份几乎相同的建节点体）
    addTextNode: (position) => get().addNode('text', position),

    addMaterialNode: (item, position) =>
      get().addNode('material', position, {
        name: item.name,
        dataUrl: item.dataUrl,
        libId: item.id,
        ...(item.w != null ? { w: item.w } : {}),
        ...(item.h != null ? { h: item.h } : {}),
        ...(item.natW != null ? { natW: item.natW } : {}),
        ...(item.natH != null ? { natH: item.natH } : {}),
      }),

    addMaterialsBatch: (items, opts = {}) => {
      if (!Array.isArray(items) || items.length === 0) return [];
      const s = get();
      // ⚠️ 主体在 `./materialBatch.ts`（判据 C1 + `max-lines`）—— 本处只做「读 → 算 → 写」
      const r = buildMaterialBatch({ nodes: s.nodes, library: s.library, snap: s.snap }, items, opts, {
        persistImage: deps.persistImage,
        nextNodeId: () => makeNodeId('material', deps.now(), ++nodeSeq),
        nextLibId: () => makeLibraryId(deps.now(), ++nodeSeq),
      });
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({
        nodes: [...s.nodes, ...r.newNodes],
        library: r.newLib.length > 0 ? [...s.library, ...r.newLib] : s.library,
      });
      return r.newIds;
    },

    addScreenshotMaterial: (input) => {
      const s = get();
      if (!input.dataUrl) return null;
      const anchor = s.nodes.find((n) => n.id === input.sourceVideoId);
      if (!anchor) return null;
      // 该视频**已产出**的截图数（源 28330-28332：按 `data.sourceVideoId` 数）
      const count = s.nodes.filter(
        (n) => n.type === 'material' && (n.data as { sourceVideoId?: string }).sourceVideoId === input.sourceVideoId,
      ).length;
      const pos = screenshotNodePlacement(anchor as unknown as ScreenshotAnchorLike, count);
      return get().addNode('material', pos, {
        label: input.label || '截图',
        dataUrl: input.dataUrl,
        sourceVideoId: input.sourceVideoId,
        ...(input.sourceTime === undefined ? {} : { sourceTime: input.sourceTime }),
      });
    },

    addTextNodeFromRecipe: (input) => {
      const s = get();
      const anchor = input.anchorNodeId ? s.nodes.find((n) => n.id === input.anchorNodeId) : undefined;
      const pos = recipeTextNodePosition((anchor ?? null) as unknown as RecipeAnchorLike | null, s.snap);
      // ⚠️ 借 `addNode`（它已带 id 生成 + 撤销快照 + 默认数据）—— 不另写一份建节点体（判据 C1）
      return get().addNode('text', pos, {
        label: input.name || VIDEO_NODE_TEXT.rerunLabel,
        text: input.prompt || '',
        ...(input.model ? { model: input.model } : {}),
        // ⚠️ 源版的兜底是 `|| 默认值 || 7` / `|| 默认值 || '16:9'`（原 29485-29486）
        duration: input.duration || RECIPE_TEXT_FALLBACKS.duration,
        aspectRatio: input.ratio || RECIPE_TEXT_FALLBACKS.ratio,
        styleIds: input.styleId ? [input.styleId] : [],
        linkOrder: [],
      });
    },

    renameMaterialNode: (nodeId, name) => {
      const s = get();
      const plan = planMaterialRename({
        nodes: s.nodes as unknown as MaterialNodeLike[],
        library: s.library as unknown as RenamableLibraryItem[],
        nodeId,
        name,
        // ★ 顺带同步 Lovart 画廊里的同名条目（原 27571-27604）—— 此前这里是**明确跳过的**
        galleries: s.lovartGalleries ?? {},
      });
      // ⚠️ **空名 ⇒ 不 commit**（否则会往撤销栈塞一步"什么都没变"）
      if (!plan) return;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), `rename-${nodeId}`, deps.now()) });
      set({
        nodes: plan.nodes as unknown as CanvasNode[],
        library: plan.library as typeof s.library,
        // ⚠️ 只有纯层真的改了才带这个字段（`undefined` ⇒ 不动画廊）
        ...(plan.galleries === undefined ? {} : { lovartGalleries: plan.galleries }),
      });
    },

    groupSelected: () => {
      const s = get();
      // 组序号：**已有组数 + 1**（原 31560-31562）
      const labelIndex = s.nodes.filter((n) => n.type === 'group').length + 1;
      const r = groupSelectedNodes(
        s.nodes as unknown as GroupNodeLike[],
        () => makeNodeId('group', deps.now(), ++nodeSeq),
        labelIndex,
      );
      if (!r.ok) return { ok: false, reason: r.reason };
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'group', deps.now()) });
      set({ nodes: r.nodes as unknown as CanvasNode[] });
      return { ok: true, groupId: r.groupId };
    },

    ungroupNodes: (groupId) => {
      const s = get();
      const r = ungroupPure(s.nodes as unknown as GroupNodeLike[], groupId);
      if (!r.ok) return;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'ungroup', deps.now()) });
      set({ nodes: r.nodes as unknown as CanvasNode[] });
    },

    arrangeNodes: (mode) => {
      const s = get();
      const r = planArrange(s.nodes as unknown as GroupNodeLike[], s.edges, mode);
      if (!r.ok) return { ok: false, reason: r.reason };
      // 变更前 commit（统一约定；key 用源版那个字面量）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'arrange', deps.now()) });
      set({ nodes: r.nodes as unknown as CanvasNode[] });
      return { ok: true, mode, count: r.count };
    },

    clearCanvas: () => {
      // 源版：先 `commit('delete')` 再清空（变更前快照，统一约定）
      get().commit('delete');
      set({ nodes: [], edges: [] });
    },

    splitTextNode: (nodeId, keywords) => {
      const s = get();
      const src = s.nodes.find((n) => n.id === nodeId);
      if (!src) return { ok: false, reason: 'node-missing' };

      const text = typeof src.data.text === 'string' ? src.data.text : '';
      const hasKeywords = Array.isArray(keywords) && keywords.length > 0;
      const parts = hasKeywords ? splitByKeywords(text, keywords) : splitAuto(text);
      if (parts.length < 2) return { ok: false, reason: hasKeywords ? 'no-keyword' : 'not-splittable' };

      const base = src.position;
      const newIds: string[] = [];
      const created = parts.map((part, i) => {
        const id = makeNodeId('text', deps.now(), ++nodeSeq);
        newIds.push(id);
        return {
          id,
          type: 'text',
          // 原 28595-28596：同一 `x`，`y` 按 `i × (高 + 间距)` 往下排
          position: { x: base.x, y: base.y + i * (SPLIT_NODE_HEIGHT + SPLIT_NODE_GAP) },
          width: SPLIT_NODE_WIDTH,
          style: { width: SPLIT_NODE_WIDTH, height: SPLIT_NODE_HEIGHT },
          selected: true,
          data: { ...defaultNodeData('text'), label: part.title, text: part.content, linkOrder: [] },
        } as CanvasNode;
      });

      // 原 28614-28622：新节点**按顺序串成一条链**
      const chain: CanvasEdge[] = [];
      for (let i = 0; i < newIds.length - 1; i++) {
        chain.push(deps.makeEdge({ source: newIds[i] as string, target: newIds[i + 1] as string }));
      }

      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({
        nodes: [...s.nodes.filter((n) => n.id !== nodeId), ...created],
        edges: [...s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId), ...chain],
      });
      return { ok: true, count: parts.length, newIds };
    },

    insertNodeOnEdge: (edgeId, type, patch) => {
      const s = get();
      const edge = s.edges.find((e) => e.id === edgeId);
      if (!edge) return null;
      const source = s.nodes.find((n) => n.id === edge.source);
      const target = s.nodes.find((n) => n.id === edge.target);
      if (!source || !target) return null;

      const size = nodeCreateSize(type);
      const id = makeNodeId(type, deps.now(), ++nodeSeq);
      const node = {
        id,
        type,
        // 原 `lt(sourceId, targetId, {w,h})`：两端中心取中点，再减去新节点自身的一半（居中落点）
        position: edgeInsertPosition(source, target, size),
        width: size.w,
        height: size.h,
        data: { ...defaultNodeData(type), ...patch },
      } as CanvasNode;

      // ★ 删原边 + 补两条（原 `v(edgeId)` + `w({source, target:new})` + `w({source:new, target})`）
      const kept = s.edges.filter((e) => e.id !== edgeId);
      const edges = [
        ...kept,
        deps.makeEdge({ source: edge.source, target: id }),
        deps.makeEdge({ source: id, target: edge.target }),
      ];

      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({ nodes: [...s.nodes, node], edges });
      return id;
    },

    removeNodes: (ids) => {
      const s = get();
      const kill = new Set(ids);
      if (kill.size === 0) return;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'delete', deps.now()) });

      // ① 删边（源或目标被删）
      const edges = s.edges.filter((e) => !kill.has(e.source) && !kill.has(e.target));
      // ② 清理幸存节点里对已删节点的 `referenceOrder` 引用
      const nodes = s.nodes
        .filter((n) => !kill.has(n.id))
        .map((n) => {
          if (n.type !== 'text') return n;
          const order = n.data.referenceOrder ?? [];
          const next = order.filter((rid) => !kill.has(rid));
          return next.length === order.length ? n : ({ ...n, data: { ...n.data, referenceOrder: next } } as CanvasNode);
        });

      set({ nodes, edges });
    },

    patchNodeData: (id, patch) => {
      const s = get();
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-edit', deps.now()) });
      set({
        nodes: s.nodes.map((n) =>
          n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as CanvasNode) : n,
        ),
      });
    },
  };
}
