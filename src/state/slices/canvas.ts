/**
 * Canvas slice（② 子树共享：只在画布子树内 —— docs/11 §5.1）
 *
 * ⚠️ 原则 1：只有 state 能写 store
 * ⚠️ 撤销/重做的**纯逻辑**在 `core/rules/undo.ts`（已测 W5）；本文件只做接线 + 注入时钟
 * ⚠️ **快照时机 = 变更之前**（统一约定，见 `core/rules/undo.ts` 头部说明）
 */

import type { CanvasNode, NodeType } from '@/stable/model/node';
import type { CanvasEdge, LibraryItem, Preset } from '@/stable/model/project';
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
// ★ API 任务事件的落点（原 `applyApiJobEvent` 写 store 的那几件事）—— **本片的片段**
//   （与 `materialBatch.ts` 同法：`canvas.ts` 代码行已到 `max-lines` 上限〔⚠️ 该规则已于 2026-10-11 关闭〕）
import { createApiLandingActions, type ApiLandingActions } from './apiLanding';
// ⚠️ `按配方重跑` 反建出来的文本框默认名（SSOT，不内联中文）
import { VIDEO_NODE_TEXT } from '@/constants/text';
import type { LovartGalleries } from '@/core/rules/lovartGallery';
import { screenshotNodePlacement } from '@/core/rules/capture';
import { groupSelectedNodes, ungroupNodes as ungroupPure } from '@/core/rules/group';
import { planArrange, planSelectedGrid, type ArrangeMode } from '@/core/rules/arrange';
import { splitAuto, splitByKeywords, type SplitFailReason, type SplitPart } from '@/core/rules/splitText';
import { planSplitWithPreset, type SplitPresetFailReason } from '@/core/rules/splitPreset';
import { isGraphPreset } from '@/core/rules/preset';
import { SPLIT_NODE_GAP, SPLIT_NODE_HEIGHT, SPLIT_NODE_WIDTH } from '@/constants';
import { recipeTextNodePosition, RECIPE_TEXT_FALLBACKS, snapToGrid } from '@/core/rules/recipe';
import { findMaterialNodeByLibId, type MaterialAddInput } from '@/core/rules/materialNode';
import { planMaterialRename, resolveMaterialLibId } from '@/core/rules/materialRename';
import { replaceRefId } from '@/core/rules/refs';
import { selectVersionPatch, setVersionPosterPatch } from '@/core/rules/genHistory';

/**
 * 拆分出来的文本节点的 `data`（原两条拆分路径**各写一份**的那个字面量）
 *
 * ★ **2026-10-12 收口（判据 C1）**：源在 `splitDirect` 与 `splitApplyPreset:28761-28767`
 *   各写了一份语义相同的 `data`（后者多写 `aspectRatio:'16:9'` / `duration:7`）⇒
 *   本仓**只留这一份** —— 于是"按关键词拆"与"按预设拆"产出的节点**必然同形**。
 */
const splitTextData = (part: SplitPart): CanvasNode['data'] =>
  ({
    ...defaultNodeData('text'),
    label: part.title,
    text: part.content,
    linkOrder: [],
  }) as CanvasNode['data'];

/**
 * 画布默认值 → 文本节点的 `data` 覆盖（原 `29440-29442` / `29486-29488` 那两个三目）
 *
 * ⚠️ 只映射本仓 `TextNodeData` **确有**的字段：源还叠一个 `model: canvasDefaults.model || null`，
 *   而本仓文本节点**没有 `model` 字段**（见 `core/model/defaults.ts` 的 `NODE_DEFAULTS.text`）——
 *   那属"文本节点带生成参数"整条功能，**不在这里擅自加字段**（铁律 2）。
 * ⚠️ 空值（`''` / `0`）⇒ **不写**：让 `NODE_DEFAULTS.text` 的静态默认（`16:9` / `7`）生效 ——
 *   与源的 `|| '16:9'`（falsy ⇒ 落默认）**等价**。
 */
function textDefaultsPatch(d: { ratio: string; duration: number }): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (d.ratio) patch.aspectRatio = d.ratio;
  if (d.duration) patch.duration = d.duration;
  return patch;
}


import { buildClipboard, planPaste, type ClipboardPayload } from '@/core/rules/clipboard';
import { asRecord } from '@/lib/object';
import type { CanvasEdge as Edge } from '@/stable/model/project';

/**
 * ★ **`TD-02-17` 确证必要的唯一断言**（散在 4 个调用点会漂）
 *
 * 纯层的出参被**擦宽**成 `*Like[]`（它们只声明了结构子集，如 `GroupNodeLike` / `MaterialNodeLike`），
 * 回写 store 前必须收窄回 `CanvasNode[]`。
 * ⚠️ **为什么是 `as unknown as` 而不是泛型**：泛型化要改 `core/rules/group.ts` 的 3 个纯函数签名
 *    + `GroupResult` / `UngroupResult` 两个结果类型（另立批次）；此处先把 **4 处收成 1 处**
 *    （判据 C1：同一断言不写四份）。
 * ⚠️ 这不是"Lite 接口与 stable 双轨"问题 —— `NodeDataBase` 本就有索引签名，**入参方向无需断言**
 *    （2026-10-11 实测：全仓 20 处里 **15 处是多余的**，已删）。
 */
const asCanvasNodes = (nodes: readonly unknown[]): CanvasNode[] => nodes as unknown as CanvasNode[];

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
   * 把一张**内联 base64 图**落成本地 `img://` 引用（原 `Tn` 22578-22596）—— 其余
   * （`img://` / 远程 / 空）**原样返回**（⚠️ 2026-10-11 回源纠错：判据是「是不是内联 base64」，
   * 不是「是不是远程」—— 见 `stable/protocols/img.ts` 的 `isInlineImage`）。
   * ⚠️ **不纯**（内部走 `MediaPort.saveImageSync`，是个**同步 IPC**）⇒ 由 `bootstrap` 注入。
   * ⚠️ 与 `GallerySliceDeps.normalizeImage` 是**同一个东西**（同一处注入实现）。
   */
  persistImage(dataUrl: string): string;
}

export interface CanvasSlice extends ApiLandingActions {
  // ── state ──
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  library: LibraryItem[];
  /** 吸附开关（工程级，随 ProjectData 持久化） */
  snap: boolean;
  /**
   * ★ **成片落地提示音开关**（原 `soundEnabled`，`shared.js:26761`）
   *
   * ⚠️ 与源同：**默认 `true`**，且源里**唯一的写方** `setSoundEnabled()` **只写 `true`**
   *    （`shared.js:27965-27969`，是个空动作）⇒ 实际是个**常量**。本仓**不落那个 action**
   *    （判据 B5：无人调），只保留这个**被读**的字段。
   * ⚠️ 它**不在** `ProjectData` 里（源那一段初始化里 `snap` 是**工程级**、而 `soundEnabled`
   *    没有对应的 localStorage 键 ⇒ **内存态**、随进程重启回 `true`）。
   */
  soundEnabled: boolean;
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
   * ⚠️ 源版还会同步 `lovartGalleries`（27571-27590）。★ **2026-10-11 更正（TD-07-5）**：
   *   该字段**早已落地**，且 `core/rules/materialRename.ts` 的**纯层已支持**这一支（吃 `input.galleries`）
   *   —— 实现里**已传** `galleries: s.lovartGalleries ?? {}` 并把 `plan.galleries` 写回（见下方 action）。
   * ⚠️ 空名/找不到节点 ⇒ **什么都不做**（源版同）。
   */
  renameMaterialNode: (nodeId: string, name: string) => void;
  /**
   * ★ **换掉素材节点的图片**（原 `replaceMaterialImage`，`shared.js:27626-27681`）
   *
   * 源逐条：① 建**新库条目**（`favorite:false`）② 把画布上所有指向**旧 libId**的引用改指新 id
   * （`Gy` = 本仓 `replaceRefId`）③ 目标节点换 `dataUrl/libId/name/label/natW/natH`
   * ④ **宽高比变了**（> 2%）且节点有宽 ⇒ 按新比例重设高度（下限 **120**）。
   *
   * ⚠️ **落盘由本 action 做**：源是在调用方（`iL.jsx:122` 的 `Tn`）先把 `data:` 图外置成
   *    `img://` 再传进来；本仓的宿主能力在 `state`（`deps.persistImage`，原 `Tn`）⇒ 收进来一处做。
   * @param dataUrl 新图（**可为 `data:` 原始串** —— 会被外置）
   * @returns `false` = 没做（节点不存在 / 非素材 / 空图 / 外置失败）—— 调用方据此提示
   */
  replaceMaterialImage: (
    nodeId: string,
    dataUrl: string,
    opts?: { name?: string; w?: number; h?: number },
  ) => boolean;
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
   * ⚠️ 撤销 key 用源版那个字面量 **`'arrange'`**（原 `commit('arrange')` shared.js:31811；与 `arrangeSelectedNodes` 的 `'graph-arrange'` **不同 key**）。
   */
  arrangeNodes: (mode: ArrangeMode) => { ok: boolean; mode?: ArrangeMode; count?: number; reason?: string };
  /**
   * ★ **整理所选节点**（原 `arrangeSelectedNodes`，`shared.js:29635-29694`）—— 右键菜单的「自动排列」
   *
   * ⚠️ 与 `arrangeNodes(mode)`（9 个对齐/分布模式）**不是同一件事**：源里这是**另写的网格排布**
   *   （列数 `ceil(sqrt(n))`、锚在选中节点的 `min(x)/min(y)`），纯半在 `core/rules/arrange.planSelectedGrid`。
   * ⚠️ 选中**少于 2 个** ⇒ **什么都不做**（源直接 `return`）；组内子节点不参与（跟父走）。
   */
  arrangeSelectedNodes: (opts?: { gap?: number }) => { ok: boolean; count?: number };
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
  /**
   * ★ **拆分并套用节点预设**（原 `splitApplyPreset`，`shared.js:28646-28905`）—— **2026-10-12 落**
   *
   * 纯算法在 `core/rules/splitPreset.planSplitWithPreset`（入口节点判定 / 每份重建 / 引用重写 / 三类边）。
   * 本 action 只做三件事：**取状态 → 跑纯规则 → 落库**（与 `splitTextNode` 同法，含撤销快照）。
   * ⚠️ 失败原因比 `splitTextNode` **多三档**（`preset-missing` / `preset-empty`）。
   */
  splitApplyPreset: (
    nodeId: string,
    presetId: string,
    keywords: readonly string[],
  ) => { ok: boolean; count?: number; newIds?: string[]; reason?: SplitPresetFailReason };
  insertNodeOnEdge: (
    edgeId: string,
    type: NodeType,
    patch?: Record<string, unknown>,
    /**
     * ★ **2026-10-11**：显式落点（**新节点的中心**，flow 坐标）。
     *
     * 源有**两个**入口都走这条路：`mode:'edge'`（边点击 → 建节点浮层，落点是**两端中点**）
     * 与 **边的悬停气泡**（`B3.jsx:101-104`，落点是**指针处**：`addText({x: D.x - W0.w/2, …})`）。
     * 不给 ⇒ 中点（原行为）。
     */
    center?: { x: number; y: number },
  ) => string | null;
  /**
   * ★ **建素材节点 / 复用已有素材节点**（原 `addMaterial`，`shared.js:28979-29054`）
   *
   * ★ **2026-10-11 按源重写**：此前它是 `addNode` 的薄封装，**漏了源的两段** ——
   *   ① **复用分支**（命中同源 `libId` 且画布上已有该素材 ⇒ **移动它**，`commit('graph-move')`，不建新的）；
   *   ② 图**不在资源库里**时顺手**补一条库条目**（原 29026-29036）。
   * ⚠️ 没有 ① 时，「拖入同一个素材两次」会建出**两个同 `libId` 的节点** ——
   *    而改名逻辑（`planMaterialRename`）假定"同一个素材只有一个节点"。
   *
   * @param node 原 `n`：`{name, dataUrl, libId?, natW?, natH?}`
   * @param position 落点（`snap` 开则吸附到 20 网格）
   * @param size 节点级尺寸（缺 ⇒ `nodeCreateSize('material')` 的 `200×180`，源 29021-29022）
   * @returns 新节点 id **或**被复用的那个既有节点 id
   */
  addMaterialNode: (
    node: MaterialAddInput,
    position: { x: number; y: number },
    size?: { w: number; h: number },
  ) => string;
  /**
   * ★ **拖入素材 ⇒ 保证画布上有它的节点**（原 `ensureMaterialNode`，`shared.js:29055-29083`）
   *
   * 先探「画布上是否已有同源素材节点」，再把落点交给 `addMaterialNode`：
   *   命中 ⇒ 落点 = `opts.position ?? 既有节点位置`（**原地或移到落点**）。
   * @returns `{id, reused}` —— `reused` = **本来就在画布上**（调用方据此提示「已移到落点」）
   */
  ensureMaterialNode: (
    libId: string,
    opts?: { position?: { x: number; y: number }; size?: { w: number; h: number } },
  ) => { id: string | null; reused: boolean };
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
    opts?: { cols?: number; gap?: number; scale?: number; autoPlace?: boolean; placements?: readonly { x: number; y: number; w: number; h: number }[] },
  ) => string[];
  /**
   * ★ 把一批「拖进来 / 粘贴进来」的图**建成素材节点**（原 `addMaterialFromDrop`，`shared.js:28908-28978`）
   *
   * 与 `addMaterialsBatch` **同一个算法**（`buildMaterialBatch`），只差**落点来源**：
   * 这里第 `i` 张落在 `position + i*stagger`（原 28933-28935），`snap` 开则吸附（原 `mr`）。
   * @returns 新节点 id（**顺序即入参顺序**；画布上已有同图的返回**既有节点 id**）
   */
  addMaterialFromDrop: (
    items: readonly { name?: string; dataUrl?: string; natW?: number; natH?: number; size: { w: number; h: number } }[],
    position: { x: number; y: number },
    stagger: { x: number; y: number },
  ) => string[];
  /** ★ 删除节点（连带删除其相关边与 `referenceOrder` 引用） */
  removeNodes: (ids: readonly string[]) => void;
  /**
   * ★ **删除单条边**（原 `removeEdge`，`shared.js:27046-27053`）
   *
   * 源：`commit('delete')` + `edges.filter(r => r.id !== n)` —— 与「按删除键删边」走的是
   * **同一个撤销 key**（`'delete'`，见 `CanvasHost.onEdgesChange` 的同一约定）。
   * ⚠️ 只动 `edges`，**不碰 `nodes`**（与源同）。
   */
  removeEdge: (id: string) => void;
  /** 更新单个节点的 `data`（局部合并） */
  patchNodeData: (id: string, patch: Record<string, unknown>) => void;
  /**
   * ★ **节点剪贴板**（原 `clipboard`，`shared.js:32068-32073`）
   *
   * ⚠️ **内存态**（源亦不落盘，不在 `ProjectData` 里）；`null` = 还没复制过。
   * ⚠️ 它同时是**粘贴分支的判据**：`Ctrl+V` 时若「有剪贴板 **且** 系统剪贴板自复制后没变过」
   *    才粘节点（源 `V.current < ke.current`，见 `ui/canvas/CanvasHost`）。
   */
  clipboard: ClipboardPayload | null;
  /** 复制选中节点（原 `copyNodes`）—— ⚠️ **无选中 ⇒ 什么都不做**（源 `if (r.length === 0) return;`，不覆盖已有剪贴板） */
  copyNodes: () => void;
  /** 粘贴节点（原 `pasteNodes`）—— `position` = 画布落点；`null` ⇒ 源那套固定 `+50/+50` */
  pasteNodes: (position: { x: number; y: number } | null) => void;
  /**
   * ★ **只选中给定的这些节点**（源用 `onNodesChange` 的 `select` 变更表达）
   *
   * 源（`_Component42.jsx:761-771` / `818-828`，建完节点后）：
   * `onNodesChange(nodes.map(n => ({ type: 'select', id: n.id, selected: n.id === B })))`
   * —— 即**只留新节点选中、其余全取消**。
   * ⚠️ **不 commit**：源里选中态也不进撤销栈（`onNodesChange` 只对 `remove` 建快照）。
   */
  selectOnly: (ids: readonly string[]) => void;
  /**
   * ★ **切换历史版本**（原 `selectVersion`，`shared.js:31068-31140`）
   *
   * 纯半在 `core/rules/genHistory.selectVersionPatch`（本动作只做「找节点 + 应用」）。
   * ⚠️ 撤销 key 走 `patchNodeData` 的 `'graph-edit'` —— 与源的 `commit('graph-edit')` **同一个**。
   * ⚠️ 与源一致：节点不存在 / 下标越界 ⇒ **什么都不做**（`return false`）。
   */
  selectVersion: (id: string, index: number) => void;
  /**
   * ★ **给某条尝试补上海报**（原 `setGenvideoVersionPoster`，`shared.js:31141-31198`）
   *
   * 纯半在 `core/rules/genHistory.setVersionPosterPatch`。
   * 用途 = 历史版本弹层打开时给「还没有海报」的历次出片**懒生成**（`lib/videoPoster.ts`）。
   */
  setGenvideoVersionPoster: (id: string, attemptId: string | null, poster: string) => void;
}

export function createCanvasSlice(
  set: (partial: Partial<CanvasSlice>) => void,
  /**
   * ⚠️ **`get()` 的返回类型要与它实际读到的跨片字段相交** —— 运行期它就是**整个 store**，
   *   只是切片工厂的类型只看得到自己那片。本切片要读 `lovartGalleries`（素材改名时同步改名，
   *   原 27571-27604）⇒ 在这里显式声明（**同层 state → state，允许方向**），
   *   比在调用处写一个"看起来像在骗类型系统"的 `as` 要好。
   */
  get: () => CanvasSlice & {
    lovartGalleries?: LovartGalleries;
    purgeLovartGallery?: (id: string) => void;
    /**
     * ★ **2026-10-12（`TD-16-…`）**：`splitApplyPreset` 要按 id 找**节点图预设**
     *   （原 `o.presets.find(...)`，`shared.js:28662`）—— 而 `presets` 住 `global` 片
     *   ⇒ 与上面 `lovartGalleries` **同法**在这里显式声明（同层 state → state，允许方向）。
     */
    presets?: Preset[];
    /**
     * ★ **2026-10-12**：`addNode` 建**文本节点**时要吃「画布默认值」
     *   （原 `29440-29442` / `29486-29488` 的 `canvasDefaults.ratio || '16:9'` 那三目）
     *   —— 它住 `ui` 片 ⇒ 与 `lovartGalleries`/`presets` **同法**在这里显式声明。
     */
    canvasDefaults?: { model: string; duration: number; ratio: string };
  },
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
    soundEnabled: true,
    clipboard: null,
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
        // ★ 2026-10-12：**文本节点吃画布默认值**（源 `29440-29442`：建框时 `aspectRatio/duration/model` 三目）
        //   —— `patch` 在最后 ⇒ 显式传参仍然优先（与源的 `r || canvasDefaults…` 同序）
        data: {
          ...defaultNodeData(type),
          ...(type === 'text' && s.canvasDefaults ? textDefaultsPatch(s.canvasDefaults) : {}),
          ...patch,
        },
      } as CanvasNode;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({ nodes: [...s.nodes, node] });
      return id;
    },

    // ⚠️ 下面两个是 `addNode` 的**薄封装**（判据 C1：原先各写一份几乎相同的建节点体）
    addTextNode: (position) => get().addNode('text', position),

    addMaterialNode: (input, position, size) => {
      const s = get();
      const library = s.library;
      // ① 落盘外置（原 `Tn`）+ ② 资源库里同图的那条（原 `l`）
      const dataUrl = input.dataUrl ? deps.persistImage(input.dataUrl) : '';
      const sameImage = dataUrl ? library.find((l) => l.dataUrl === dataUrl) : undefined;
      // ③ 同源 id（原 `c = n.libId || (l ? l.id : '')`）
      const libId = input.libId || (sameImage ? sameImage.id : '');

      // ④ ★ 复用分支（原 28986-29017）：命中 ⇒ **移动既有节点**，不建新的
      if (libId) {
        const existing = findMaterialNodeByLibId(s.nodes, library, libId);
        if (existing) {
          const moved: Record<string, unknown> = {};
          if (position) moved.position = s.snap ? snapToGrid(position) : position;
          if (size && size.w != null && size.h != null) {
            moved.width = size.w;
            moved.height = size.h;
          }
          if (Object.keys(moved).length > 0) {
            set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-move', deps.now()) });
            set({
              nodes: s.nodes.map((n) => (n.id === existing.id ? ({ ...n, ...moved } as CanvasNode) : n)),
            });
          }
          return existing.id;
        }
      }

      // ⑤ 建新节点（原 29018-29052）
      const id = makeNodeId('material', deps.now(), ++nodeSeq);
      const fallback = nodeCreateSize('material'); // 源 29021-29022 的 `?? 200` / `?? 180`
      const w = size?.w ?? fallback.w;
      const h = size?.h ?? fallback.h;
      // 原 `h = l && l.name || n.name`
      const name = (sameImage && sameImage.name) || input.name || '';
      // 原 29024-29036：图不在资源库里 ⇒ 顺手补一条库条目
      let entry: LibraryItem | null = null;
      let finalLibId = libId;
      if (!finalLibId && dataUrl) {
        entry = {
          id: makeLibraryId(deps.now(), ++nodeSeq),
          name: input.name || '',
          dataUrl,
          w: input.natW || w,
          h: input.natH || h,
          favorite: false,
        } as LibraryItem;
        finalLibId = entry.id;
      }
      const node = {
        id,
        type: 'material',
        position: s.snap ? snapToGrid(position) : position,
        width: w,
        height: h,
        data: { ...defaultNodeData('material'), label: name, name, dataUrl, libId: finalLibId || null },
      } as CanvasNode;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({ nodes: [...s.nodes, node], library: entry ? [...library, entry] : library });
      return id;
    },

    ensureMaterialNode: (libId, opts = {}) => {
      const s = get();
      const item = s.library.find((l) => l.id === libId);
      // 原 29061-29065：库里没有这条 ⇒ 一律不做（`{id: null, reused: false}`）
      if (!item) return { id: null, reused: false };
      const existing = findMaterialNodeByLibId(s.nodes, s.library, libId);
      // 原 29069：显式落点 > 既有节点位置 > 原点
      const position = opts.position ?? existing?.position ?? { x: 0, y: 0 };
      return {
        id: get().addMaterialNode(
          { name: item.name, dataUrl: item.dataUrl, libId: item.id, natW: item.w, natH: item.h },
          position,
          opts.size,
        ),
        reused: !!existing,
      };
    },

    addMaterialFromDrop: (items, position, stagger) => {
      if (!Array.isArray(items) || items.length === 0) return [];
      const s = get();
      // 原 28933-28936：第 i 张 = `position + i*stagger`，`snap` 开则吸附到 20 网格
      const placements = items.map((it, i) => {
        const raw = { x: position.x + i * stagger.x, y: position.y + i * stagger.y };
        const p = s.snap ? snapToGrid(raw) : raw;
        return { x: p.x, y: p.y, w: it.size.w, h: it.size.h };
      });
      const r = buildMaterialBatch({ nodes: s.nodes, library: s.library, snap: s.snap }, items, { placements }, {
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

    addMaterialsBatch: (items, opts = {}) => {
      if (!Array.isArray(items) || items.length === 0) return [];
      const s = get();
      // ⚠️ 主体在 `./materialBatch.ts`（判据 C1 + `max-lines`〔该规则 2026-10-11 已关闭〕）—— 本处只做「读 → 算 → 写」
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
      const pos = screenshotNodePlacement(anchor, count);
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
      const pos = recipeTextNodePosition((anchor ?? null), s.snap);
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

    replaceMaterialImage: (nodeId, dataUrl, opts = {}) => {
      const s = get();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node || node.type !== 'material' || !node.data || !dataUrl) return false;

      // ① 先外置（原 `Tn`，在 `iL` 里做）—— 失败 ⇒ 什么都不动，交给调用方提示
      const stored = deps.persistImage(dataUrl);
      if (!stored) return false;

      // ② 撤销快照（原 `commit(\`replace-img-${n}\`)`）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), `replace-img-${nodeId}`, deps.now()) });

      const d = node.data as Record<string, unknown>;
      const prefix = (typeof d.name === 'string' && d.name) || (typeof d.label === 'string' && d.label) || '素材';
      const name = (opts.name ?? '').trim() || `${prefix}·已编辑`;
      const libId = makeLibraryId(deps.now(), ++nodeSeq);
      const w = opts.w || Number(d.natW) || 0;
      const h = opts.h || Number(d.natH) || 0;
      const ratio = w && h ? w / h : 0;
      const prevRatio = Number(d.natW) && Number(d.natH) ? Number(d.natW) / Number(d.natH) : 0;
      // ④ 宽高比变了（> 2%）且节点有宽 ⇒ 重设高度（下限 120，源的两条魔法数）
      const resize =
        ratio > 0 && prevRatio > 0 && Math.abs(ratio - prevRatio) / prevRatio > 0.02 && node.width
          ? { width: node.width, height: Math.max(120, Math.round(node.width / ratio)) }
          : {};

      // ③ 引用改指新 id（原 `Gy`）—— 返回 `null` = 一处都没改 ⇒ 用原数组
      const prevLibId = resolveMaterialLibId(node, s.library);
      const rewired = replaceRefId(s.nodes, { prevId: prevLibId, nextId: libId, nextName: name }) ?? s.nodes;

      set({
        library: [
          ...s.library,
          { id: libId, name, dataUrl: stored, w, h, favorite: false } as LibraryItem,
        ],
        // ⚠️ `as CanvasNode`：`data` 摊开后 TS 会把判别联合**拓宽**（与同文件其他处同法）
        nodes: rewired.map((n) =>
          n.id === nodeId
            ? ({
                ...n,
                ...resize,
                data: {
                  ...n.data,
                  dataUrl: stored,
                  libId,
                  name,
                  label: name,
                  natW: w || (n.data as Record<string, unknown>).natW,
                  natH: h || (n.data as Record<string, unknown>).natH,
                },
              } as CanvasNode)
            : n,
        ),
      });
      return true;
    },

    renameMaterialNode: (nodeId, name) => {
      const s = get();
      const plan = planMaterialRename({
        nodes: s.nodes,
        library: s.library,
        nodeId,
        name,
        // ★ 顺带同步 Lovart 画廊里的同名条目（原 27571-27604）—— 此前这里是**明确跳过的**
        galleries: s.lovartGalleries ?? {},
      });
      // ⚠️ **空名 ⇒ 不 commit**（否则会往撤销栈塞一步"什么都没变"）
      if (!plan) return;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), `rename-${nodeId}`, deps.now()) });
      set({
        nodes: asCanvasNodes(plan.nodes),
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
        s.nodes,
        () => makeNodeId('group', deps.now(), ++nodeSeq),
        labelIndex,
      );
      if (!r.ok) return { ok: false, reason: r.reason };
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'group', deps.now()) });
      set({ nodes: asCanvasNodes(r.nodes) });
      return { ok: true, groupId: r.groupId };
    },

    ungroupNodes: (groupId) => {
      const s = get();
      const r = ungroupPure(s.nodes, groupId);
      if (!r.ok) return;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'ungroup', deps.now()) });
      set({ nodes: asCanvasNodes(r.nodes) });
    },

    arrangeNodes: (mode) => {
      const s = get();
      const r = planArrange(s.nodes, s.edges, mode);
      if (!r.ok) return { ok: false, reason: r.reason };
      // 变更前 commit（统一约定；key 用源版那个字面量 **`'arrange'`**，原 `commit('arrange')` shared.js:31811）
      // ⚠️ 与 `arrangeSelectedNodes` 的 `'graph-arrange'`（shared.js:29645）是**两个不同的 key** ——
      //   两个动作在源里就是两段独立实现，不共用撤销键（2026-10-11 曾错改成本 key，已回退）。
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'arrange', deps.now()) });
      set({ nodes: asCanvasNodes(r.nodes) });
      return { ok: true, mode, count: r.count };
    },

    arrangeSelectedNodes: (opts) => {
      const s = get();
      const plan = planSelectedGrid(s.nodes, opts?.gap ?? 16);
      if (!plan) return { ok: false }; // 源：`if (s.length < 2) return;`
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-arrange', deps.now()) });
      set({
        nodes: s.nodes.map((n) => {
          const pos = plan.get(n.id);
          return pos ? ({ ...n, position: { x: pos.x, y: pos.y } } as CanvasNode) : n;
        }),
      });
      return { ok: true, count: plan.size };
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
          data: splitTextData(part),
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

    splitApplyPreset: (nodeId, presetId, keywords) => {
      const s = get();
      const src = s.nodes.find((n) => n.id === nodeId);
      if (!src) return { ok: false, reason: 'node-missing' };

      const preset = s.presets?.find((p) => p.id === presetId);
      const planned = planSplitWithPreset({
        source: src,
        // ⚠️ 只把**图预设**交给规则；`kind` 的判据留在规则里（源 28665 同一处），这里不复制第二遍
        preset: preset && isGraphPreset(preset) ? preset : undefined,
        keywords,
        newTextData: splitTextData,
        nextNodeId: (type) => makeNodeId(type, deps.now(), ++nodeSeq),
        makeEdge: (e) => deps.makeEdge(e),
      });
      if (!planned.ok) return { ok: false, reason: planned.reason };

      const { nodes: added, edges: addedEdges, count, newIds } = planned.plan;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({
        nodes: [...s.nodes.filter((n) => n.id !== nodeId), ...added],
        edges: [...s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId), ...addedEdges],
      });
      return { ok: true, count, newIds };
    },

    insertNodeOnEdge: (edgeId, type, patch, center) => {
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
        // ★ 显式落点（悬停气泡那条路）也是「**中心** - 自身一半」—— 原 `B3.jsx:101-104`
        position: center
          ? { x: center.x - size.w / 2, y: center.y - size.h / 2 }
          : edgeInsertPosition(source, target, size),
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

    copyNodes: () => {
      const s = get();
      const clip = buildClipboard(s.nodes, s.edges);
      // 源：`if (r.length === 0) return;` —— 没选中就**不覆盖**剪贴板
      if (!clip) return;
      set({ clipboard: clip });
    },

    pasteNodes: (position) => {
      const s = get();
      if (!s.clipboard) return;
      const plan = planPaste({
        clipboard: s.clipboard,
        nodes: s.nodes,
        position,
        // 源 `Pt('m' | 't' | 'a')` —— **只三档**（见 `core/rules/clipboard` 头注 ⚠️①）
        nextNodeId: (kind) => makeNodeId(kind, deps.now(), ++nodeSeq),
      });
      if (!plan) return;
      // 变更前 commit（与 `connect`/`splitTextNode` 同一约定；源的 key 也是 `'graph-add'`）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({
        nodes: plan.nodes,
        // ⚠️ 新边走既有 `deps.makeEdge` 工厂（源在 `pasteNodes` 里**硬编码**了同一套
        //    `style`/`markerEnd`，见 `core/rules/clipboard` 头注）⇒ 不重复那份魔法色值
        edges: [...s.edges, ...plan.edgePairs.map((p) => deps.makeEdge(p))],
      });
    },

    removeEdge: (id) => {
      // 源：先 `commit('delete')`，再按**提交后**的状态过滤（`t().edges`）
      get().commit('delete');
      set({ edges: get().edges.filter((e) => e.id !== id) });
    },

    selectOnly: (ids) => {
      const s = get();
      const keep = new Set(ids);
      // 逐字：全量映射 + 只改 `selected`（未变的返回**同一引用**，避免无谓重渲染）
      set({
        nodes: s.nodes.map((n) =>
          n.selected === keep.has(n.id) ? n : ({ ...n, selected: keep.has(n.id) } as CanvasNode),
        ),
      });
    },

    selectVersion: (id, index) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node) return;
      const patch = selectVersionPatch(asRecord(node.data), index);
      if (!patch) return;
      get().patchNodeData(id, patch);
    },

    setGenvideoVersionPoster: (id, attemptId, poster) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node) return;
      const patch = setVersionPosterPatch(asRecord(node.data), attemptId, poster);
      if (!patch) return;
      get().patchNodeData(id, patch);
    },

    // ★ API 任务事件的落点（`addToLibrary` / `attachImageResultToNode` / `attachVideoResultToNode`）
    //   —— 主体在 `./apiLanding.ts`（同片片段；`canvas.ts` 已到 `max-lines` 上限〔该规则 2026-10-11 已关闭〕）
    ...createApiLandingActions(set, get, {
      now: () => deps.now(),
      persistImage: deps.persistImage,
      nextLibraryId: () => makeLibraryId(deps.now(), ++nodeSeq),
    }),
  };
}
