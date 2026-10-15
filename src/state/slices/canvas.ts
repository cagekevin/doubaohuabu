/**
 * Canvas slice（② 子树共享：只在画布子树内 —— docs/11 §5.1）
 *
 * ⚠️ 原则 1：只有 state 能写 store
 * ⚠️ 撤销/重做的**纯逻辑**在 `core/rules/undo.ts`（已测 W5）；本文件只做接线 + 注入时钟
 * ⚠️ **快照时机 = 变更之前**（统一约定，见 `core/rules/undo.ts` 头部说明）
 */

import type { CanvasNode, NodeDataOf, NodeType, TextNode } from '@/stable/model/node';
// ★ 节点默认标签的真源（`TD-16-150`：本文件原内联 `'文生图'` 作重命名前缀兜底）
import { GEN_IMAGE_LABEL } from '@/stable/model/node';
import type { CanvasEdge, LibraryItem, Preset, VideoShare } from '@/stable/model/project';
import type { OperationLogEvent } from '@/core/ports/host.port';
import {
  commitSnapshot,
  initialUndoStack,
  redo as redoStack,
  shouldRecordOperation,
  undo as undoStack,
  type UndoStack,
} from '@/core/rules/undo';
import {
  applyConnection,
  edgeInsertPosition,
  planConnectBatch,
  planConnectManyToTarget,
  type ConnectRequest,
} from '@/core/rules/graph';
import { makeId, makeLibraryId, makeNodeId } from '@/core/rules/project';
import { defaultNodeData, inheritGenNodeData, nodeCreateSize } from '@/core/model/defaults';
import { buildMaterialBatch, type MaterialBatchInput } from './materialBatch';
// ★ API 任务事件的落点（原 `applyApiJobEvent` 写 store 的那几件事）—— **本片的片段**
//   （与 `materialBatch.ts` 同法：`canvas.ts` 代码行已到 `max-lines` 上限〔⚠️ 该规则已于 2026-10-11 关闭〕）
import { createApiLandingActions, type ApiLandingActions } from './apiLanding';
// ⚠️ `按配方重跑` 反建出来的文本框默认名（SSOT，不内联中文）
import { VIDEO_NODE_TEXT, type ToastLevel } from '@/constants/text';
import type { LovartGalleries } from '@/core/rules/lovartGallery';
import type {
  ImageGenDeliveredKeys,
  ImageGenFeedItem,
  ImageGenKeyNodes,
  ImageGenKeyParams,
  ImageGenKeyTargets,
} from '@/core/rules/imageGenKey';
import { SCREENSHOT_NODE_SIZE, screenshotNodePlacement } from '@/core/rules/capture';
import { groupSelectedNodes, releaseDeletedGroupChildren, ungroupNodes as ungroupPure } from '@/core/rules/group';
import { planArrange, planSelectedGrid, type ArrangeMode } from '@/core/rules/arrange';
import { splitAuto, splitByKeywords, type SplitFailReason, type SplitPart } from '@/core/rules/splitText';
import { planSplitWithPreset, type SplitPresetFailReason } from '@/core/rules/splitPreset';
import { isGraphPreset } from '@/core/rules/preset';
import { SPLIT_NODE_GAP, SPLIT_NODE_HEIGHT, SPLIT_NODE_WIDTH } from '@/constants';
import { recipeTextNodePosition, RECIPE_TEXT_FALLBACKS, snapToGrid } from '@/core/rules/recipe';
import type { Recipe } from '@/stable/model/recipe';
import { findMaterialNodeByLibId, type MaterialAddInput } from '@/core/rules/materialNode';
import { planMaterialRename, resolveMaterialLibId } from '@/core/rules/materialRename';
import { planMaterialReplaceWithLib } from '@/core/rules/materialReplace';
import { planLibraryRename, planLibraryReplace } from '@/core/rules/libraryEdit';
import { replaceRefId } from '@/core/rules/refs';
import { selectVersionPatch, setVersionPosterPatch } from '@/core/rules/genHistory';
import { genImageCurrentUrl } from '@/core/rules/genImage';

/**
 * 拆分出来的文本节点的 `data`（原两条拆分路径**各写一份**的那个字面量）
 *
 * ★ **2026-10-12 收口（判据 C1）**：源在 `splitDirect` 与 `splitApplyPreset:28761-28767`
 *   各写了一份语义相同的 `data`（后者多写 `aspectRatio:'16:9'` / `duration:7` —— **源的旧值**）⇒
 *   本仓**只留这一份**（比例/时长走 `NODE_DEFAULTS.text` 的当前默认）——
 *   于是"按关键词拆"与"按预设拆"产出的节点**必然同形**。
 * ⚠️ 出参按 `NodeDataOf<'text'>`（**不是** `CanvasNode['data']` 那个擦宽的联合）⇒ 造出的节点仍是
 *   `CanvasNode` 的**那个成员**，写回 store 不必收窄。
 */
const splitTextData = (part: SplitPart): NodeDataOf<'text'> => ({
  ...defaultNodeData('text'),
  label: part.title,
  text: part.content,
  linkOrder: [],
});

/**
 * 画布默认值 → 文本节点的 `data` 覆盖（原 `29440-29442` / `29486-29488` 那两个三目）
 *
 * ⚠️ 只映射本仓 `TextNodeData` **确有**的字段：源还叠一个 `model: canvasDefaults.model || null`，
 *   而本仓文本节点**没有 `model` 字段**（见 `core/model/defaults.ts` 的 `NODE_DEFAULTS.text`）——
 *   那属"文本节点带生成参数"整条功能，**不在这里擅自加字段**（铁律 2）。
 * ⚠️ 空值（`''` / `0`）⇒ **不写**：让 `NODE_DEFAULTS.text` 的静态默认
 *   （`aspectRatio: '4:3'` / `duration: 7`）生效 —— 与源的 `|| '16:9'`（falsy ⇒ 落默认）**同序**。
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

/** 被快照的状态（原 `Td` = `structuredClone({nodes,edges,library})`） */
export interface CanvasSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  library: LibraryItem[];
}

/** 快照深拷贝（原 `Td` 26745） */
export const takeSnapshot = (s: CanvasSnapshot): CanvasSnapshot =>
  structuredClone({ nodes: s.nodes, edges: s.edges, library: s.library });

/**
 * 「换图 / 重命名」生成新名的**后缀**（原 `${c}·已编辑`）
 *
 * ★ **2026-10-14 收口（`TD-16-149`）**：本文件原**两处**各写一遍 `` `${prefix}·已编辑` ``
 *   （换素材图 · 换生成图）—— 同一命名规则 ⇒ 一处声明。
 * ⚠️ 它是**后缀片段**（离开前缀没有意义），不是独立文案 ⇒ 住本文件而不进 `constants`。
 */
const EDITED_SUFFIX = '·已编辑';

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
  /**
   * ★ **操作日志**（原 `commit` 尾部的 `window.api.logProjectOperation`，`shared.js:26912-26928`）
   *
   * ⚠️ `type` = **撤销 key**（用户操作种类，如 `'delete'` / `'library'` / `'replace-mat-<id>'`），
   *   缺省 `'edit'`（源 `type: n || 'edit'`）。
   * ⚠️ 「当前工程有没有保存路径」的守卫与 `projectId` 由**注入方**补（见 `bootstrap/container`）——
   *   源是在 `commit` 里现读 store；本仓把这两件交给注入实现，slice 只给 `type` 与画布规模。
   */
  logOperation?(e: Omit<OperationLogEvent, 'projectId'>): void;
  /**
   * ★ **提示**（原 `showToast`）—— 写的是 `ui` 片的 `toasts`（跨片 ⇒ 注入，判据 D1）
   *
   * ⚠️ 消费者：`apiLanding.addImageGenResult` 的「文生图已完成 / 收图中」（原 `:27445-27447`）。
   */
  pushToast(message: string, duration?: number, level?: ToastLevel): void;
  /**
   * ★ **释放账号占用**（原 `releaseAccountBusy`）—— 写的是 `global` 片的 `accountBusy`（跨片 ⇒ 注入）
   *
   * ⚠️ 消费者：`apiLanding.addImageGenResult` 的「收满即释放」（原 `:27440-27444`）。
   */
  releaseAccount(accountId: string): void;
  /**
   * ★ **「视频 `url` 已写入」的收尾** —— 立刻把直链落成本地 `vid://`（`state/localizeOps`）。
   *
   * ⚠️ **为什么由注入给**：slice 拿不到 `ports`（原则 1）；落盘要经 `MediaPort.saveVideoFromUrl`
   *    ⇒ 与 `persistImage` 同法（同一处注入实现，见 `state/store.ts`）。
   * ⚠️ **为什么必须有**：源是**内建**在 `addVideoNode` 里的（`shared.js:28140` 的 genvideo 支 ·
   *    `:28308` 的网格支），不是"让每个调用方自己记得调" —— 直链会过期 / 需要 referer，
   *    漏一处就是**静默不落盘**（用户看到的地址迟早失效）。
   */
  localizeVideoNode(nodeId: string): void;
}

export interface CanvasSlice extends ApiLandingActions {
  // ── state ──
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  library: LibraryItem[];
  /**
   * ★ **图像生成提交参数表**（原 `imageGenKeyParams`，`shared.js:27170`）
   *
   * `genKey` / `jobId` → 提交参数。生产者 = `bindImageGenJobs`（API 通道）/ `bindImageGenKey`（网页通道）；
   * 结果到达时 `attachImageResultToNode` 查表回填 `params` 并删键。**内存态**（随出片即删，不进工程持久化）。
   */
  imageGenKeyParams: ImageGenKeyParams;
  /**
   * ★ **节点配方表**（原 `nodeRecipes`，`shared.js:30843-30857`）
   *
   * `源节点 id` → 该节点**最近一次发送**产出的配方（`oR` 的产物）。生产者 = `setNodeRecipe`
   * （发送时，原 `PS` 的 `:42385`）；消费者 = `addVideoNode` 的**落库展开**（原 `d0`，把配方
   * **拷进新视频节点**的 `data.recipe` —— 视频节点的「配方 chip / 复制配方 / 按配方重跑」读它）。
   * ⚠️ **内存态**（源亦然）：视频节点上那份**副本**才随工程走。
   */
  nodeRecipes: Record<string, Recipe>;
  /**
   * ★ **图像生成已交付计数**（原 `imageGenDeliveredKeys`，`shared.js:27226`）
   *
   * `genKey` → `{ts, target, got}`。网页通道 `bindImageGenKey` 初始化 `target`；
   * `addImageGenResult` 每次 `got+1` 并按 `got >= target` 判「收满」（去重）。
   * **内存态**（不进工程持久化）。
   */
  imageGenDeliveredKeys: ImageGenDeliveredKeys;
  /**
   * ★ **网页通道：`genKey → 节点 id`**（原 `imageGenKeyNode`，`shared.js:27168`）
   *
   * 生产者 = `bindImageGenKey`；消费者 = `addImageGenResult`（按 key 反查节点落图）。
   * **内存态**（不进工程持久化）。
   */
  imageGenKeyNode: ImageGenKeyNodes;
  /**
   * ★ **网页通道：`genKey → 期望张数`**（原 `imageGenKeyTarget`，`shared.js:27169`）
   *
   * 生产者 = `bindImageGenKey`；消费者 = `addImageGenResult` 的张数推导（原 `f`）。
   * **内存态**。
   */
  imageGenKeyTarget: ImageGenKeyTargets;
  /**
   * ★ **生成图片流**（原 `imageGenFeed`，`shared.js:27131`）
   *
   * 生产者 = `pushImageGenFeed`（`addImageGenResult` / `applyApiJobEvent`）；
   * 上限 `IMAGE_GEN_FEED_LIMIT`。**内存态**（仅 `pushImageGenFeed` 自读自去重）。
   */
  imageGenFeed: ImageGenFeedItem[];
  /**
   * ★ **无水印视频分享**（原 `videoShares`，`shared.js:27900-27939` 的 `addVideoShare` 写入）
   *
   * 随 `ProjectData` 持久化（`setPartial` 镜像进 `projects[activeId].data.videoShares`）。
   * ⚠️ 消费者 = 「无水印资源」面板（原 `SD.jsx`，未落 —— 见 `docs/过程.md` §2.3）。
   */
  videoShares: VideoShare[];
  addVideoShare: (input: Omit<VideoShare, 'id' | 'createdAt'>) => void;
  removeVideoShare: (id: string) => void;
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
  /**
   * ★ **只改节点**（不动 `edges`）
   *
   * ⚠️ 为什么要它：`CanvasHost` 的 `onNodesChange` / `onEdgesChange` 若**各自整图覆盖**
   *   （`set({ nodes, edges })`）⇒ 两个回调会**互相用旧值覆盖对方**。
   *   实测后果：删节点后 ReactFlow 报「边变更」，`onEdgesChange` 拿**旧的 `nodes`** 把刚删的
   *   节点**复活**，随后再次删除 ⇒ 撤销栈被压入 `{2 节点, 0 边}` 的坏快照（Ctrl+Z 后**边回不来**）。
   * ⇒ 拆成两个只改自己那一半的 action，**结构上不可能**再互相覆盖（与 `setLibrary` 对称）。
   */
  setNodes: (nodes: CanvasNode[]) => void;
  /** ★ **只改边**（不动 `nodes`）—— 理由同上 */
  setEdges: (edges: CanvasEdge[]) => void;
  setLibrary: (library: LibraryItem[]) => void;
  /**
   * ★ **资源库条目改名**（原 `renameLibrary`，`shared.js:27515-27548`）
   *
   * 消费者 = `ui/panels/LibraryPanel` 的**双击改名**（原 `RT.jsx:301-314` 的 `M`/`U`）。
   * 与素材节点改名（`renameMaterialNode`）**不是同一件事**：那个改**节点侧**的名字
   * （含画廊同步），本 action 改**库条目侧**的名字（同步所有同源素材节点）。
   *
   * ⚠️ 撤销 key = **`'library'`**（原 27517，与源一致；`renameMaterialNode` 是 `rename-<nodeId>`）。
   * ⚠️ 找不到条目 ⇒ **什么都不做、不 commit**（源 `if (s)` 守住）。
   * ⚠️ **空名也照写**（源不过滤；输入框那侧的「未命名」兜底在 UI，原 `RT.jsx:248`）。
   */
  renameLibrary: (libId: string, name: string) => void;
  /**
   * ★ **替换资源库条目的图**（原 `replaceLibrary`，`shared.js:27755-27806`）
   *
   * 消费者 = `ui/panels/LibraryPanel` 的右键「替换素材」（原 `RT.jsx:342-352` 的 `O`）。
   * 与「更换素材」（`replaceMaterialWithLib`）**不是同一件事**：那个是**换一个节点绑到哪张图**，
   * 本 action 是**换库条目自身的图**（同步所有引用它的节点）。
   *
   * 源逐行：守卫（条目在 + 新图有地址）→ 记旧图地址 → 新图**外置**（`Tn`）→
   * `commit('library')` → 库条目换 `dataUrl`（`w/h` 用新值或保留）→ 同源节点换 `dataUrl`。
   * ⚠️ **外置由本 action 做**（`deps.persistImage`，与 `replaceMaterialImage` 同法）——
   *    外置失败 ⇒ 什么都不动，交给调用方提示。
   * @returns 实际被换图的节点数（源 `replaced`）；`null` = 守卫没过或外置失败
   */
  replaceLibrary: (
    libId: string,
    image: { dataUrl: string; w?: number; h?: number },
  ) => number | null;
  setSnap: (snap: boolean) => void;

  /**
   * 提交快照（原 `commit`）—— ⚠️ **必须在变更之前调用**
   * 同 key 且 <800ms 合并；栈上限 80
   */
  commit: (key: string) => void;
  undoAction: () => void;
  redoAction: () => void;

  /**
   * 添加连线（原 `onConnect`）—— 内含环检测 + `referenceOrder` 维护
   * @returns 被拒时的提示文案；成功返回 `null`
   */
  connect: (conn: ConnectRequest) => string | null;
  /**
   * ★ **多选拖拽批量连线**（原 `connectBatch(n, r)` 27054-27069）
   *
   * 消费者 = `onConnect` 的**多选 material** 分支（原 `_Component42.jsx:638-650` 的 `Re`）：
   * 从多个选中节点拖线到同一个目标 ⇒ 只把**选中里的 material** 一次连过去。
   *
   * ⚠️ 与 `connect` 的差别（**照抄源，两路不同语义**）：
   *   ① **不查环**、**不动 `referenceOrder`**（源走裸边工厂 `Mr` + `yo`，不过 `onConnect`）；
   *   ② **不去重自身**（源不滤 `a !== r`）—— 调用方已先滤好；
   *   ③ 同 source+target 的**重复边跳过**（源 `yo`/addEdge 语义）。
   * ⚠️ 撤销 key 恒为 `'graph-add'`（源 27055），**空列表也 commit**（源如此）。
   */
  connectBatch: (sourceIds: readonly string[], targetId: string) => void;
  /**
   * ★ **群锚点批量连线**（原 `connectManyToTarget(n, r)` 27070-27094）
   *
   * 消费者 = 组连线锚点（原 `_Component37`）拖到**目标节点**上，以及建节点浮层
   * `mode:'group'` 建完新节点后（原 `$`/`be`/`ie`/`Ne`/`$e` 的 `sourceIds` 分支）。
   *
   * 三条守卫（**逐字对源**，任一命中 ⇒ 什么都不做、**不 commit**）：
   *   ① 目标节点不存在；② 滤掉源里**等于目标**的；③ 滤完为空。
   */
  connectManyToTarget: (sourceIds: readonly string[], targetId: string) => void;
  /** ★ 建文本节点（原「双击画布创建文本框」）—— 返回新节点 id */
  addTextNode: (position: { x: number; y: number }) => string;
  /**
   * ★ 建**任意类型**的节点（原 `_Component42.jsx` 的 `ye` 分派到的 `$`/`be`/`ie`/`Ne`/`$e` 的**建节点半**）
   *
   * ⚠️ 2026-10-10 补：此前只有 `addTextNode`/`addMaterialNode` ⇒ **8 类节点只有 2 类能建出来**
   *    （文生图 / 文生视频 / 账号 / 下载 / 组 **零入口**）⇒ `GenPanel` 实际不可达。这是**未登记的断链**。
   *
   * 数据来自 `NODE_DEFAULTS`（8 类齐备）；`patch` 用于覆盖/补充（如 `accountId` / `folder` / `libId`）。
   *
   * ★ **2026-10-12**：新增可选 `size` —— **不给** ⇒ 取 `nodeCreateSize(type)`（= **空节点**的
   *   默认框，比例 4:3，用户裁定）；**给了** ⇒ 用它（带内容的渠道：如「三帧→画布参考图」
   *   按视频比例算出来的框）。此前本函数**完全不写宽高**（由内容自适应）⇒ 各渠道建出来的框不一。
   * @returns 新节点 id
   */
  addNode: (
    type: NodeType,
    position: { x: number; y: number },
    patch?: Record<string, unknown>,
    size?: { w: number; h: number },
  ) => string;
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
   * ★ **换掉文生图节点的当前图**（原 `replaceImageGenImage`，`shared.js:27294-27351`）
   *
   * 源逐条：① 找**当前展示图** `l`（`viewUrl` 且在 `results` 里 ⇒ `viewUrl`，否则
   * `resultUrl` → `results[0].dataUrl`；找不到 ⇒ return）② commit(`replace-img-${n}`)
   * ③ 新名 = `opts.name.trim() || "${name||label||'文生图'}·已编辑"` ④ 外置 ⑤ 建库条目
   * （`addToLibrary`，**按 dataUrl 去重**）⑥ `results` 里命中 `l` 的那张换 `dataUrl` +
   * `resultUrl`/`viewUrl`/`dataUrl` 三字段都指向新图。
   *
   * ⚠️ 与 `replaceMaterialImage` 是**两套源、不合并**（前者建**素材**节点新图、后者改
   * **文生图**节点的 `results`；源里就是两个独立 action）。
   * @returns `false` = 没做（节点不在 / 非 imggen / 无 data / 空图 / 找不到当前图）
   */
  replaceImageGenImage: (
    nodeId: string,
    dataUrl: string,
    opts?: { name?: string; w?: number; h?: number },
  ) => boolean;
  /**
   * ★ **把素材节点的图换成资源库里的一张**（原 `replaceMaterialWithLib`，`shared.js:27682-27724`）
   *
   * 消费者 = 节点右键菜单「更换素材」（仅 material，原 `Ye` → `Z({mode:'replace', nodeId})`）
   * ＋ 素材选择器 `DT.jsx`（本仓 `ui/canvas/MaterialPickerModal.tsx`）。
   *
   * 与 `replaceMaterialImage` 的**分工**（**两套不同源、不合并**）：
   *   · 本 action：图**来自资源库/文件挑选**，只改**一个节点**的绑定 ＋ 把指向旧图的
   *     **文本引用**改指新图（原 `Gy`）—— 源 27682-27724
   *   · `replaceMaterialImage`：图是**新画出来的**（遮脸/编辑产物），要**建新库条目**、
   *     可能**重设节点高** —— 源 27626-27681
   *
   * ⚠️ 撤销 key = **`replace-mat-${nodeId}`**（原 27694，按节点分区）——
   *    与 `replaceMaterialImage` 的 `replace-img-${nodeId}` **不是同一个 key**。
   * ⚠️ **不查环、不动 referenceOrder**（本动作不建边）。
   * @returns `{ok:false, reason:'bad-input'}` = 守卫没过（节点不在 / 非素材 / 无 data / 条目无图）
   *   —— 调用方据此提示；**不 commit**（源的 commit 在守卫之后）
   */
  replaceMaterialWithLib: (
    nodeId: string,
    item: { id?: string; name?: string; dataUrl: string; w?: number; h?: number },
  ) => { ok: boolean; reason?: string };
  /**
   * ★ **建截图素材节点**（原 `addScreenshotMaterial` shared.js:28312-28352）
   *
   * 几何：放在**视频右侧一列**（`x + 宽 + 40`）、每张下移 **26px**、**最多叠 8 层**
   * （纯层 `screenshotNodePlacement`）。`label` 缺省「截图」。
   * 框 = **220×180**（源 `:28343-28344`，走 `SCREENSHOT_NODE_SIZE`）。
   * @returns 新素材节点 id；`dataUrl` 为空 / 找不到源视频 ⇒ `null`
   */
  addScreenshotMaterial: (input: {
    sourceVideoId: string;
    dataUrl: string;
    label?: string;
    sourceTime?: number;
  }) => string | null;
  /**
   * ★ **写 / 清节点配方**（原 `setNodeRecipe`，`shared.js:30844-30857`）
   *
   * 逐字：`!nodeId` ⇒ 什么都不做；`recipe` 为**真** ⇒ 设键，为**假** ⇒ 删键（同一 action 两用）。
   */
  setNodeRecipe: (nodeId: string, recipe: Recipe | null | undefined) => void;
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
  /** ★ 删除节点（连带删除其相关边与 `referenceOrder` 引用；删的是**组**时**释放成员**） */
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
   * ★ **写视频节点 `url` 的唯一入口**（原 `_Component43.jsx:3160`）—— 写完**立刻**落本地
   *
   * ⚠️ 用它而不是 `patchNodeData`：**调用方不需要知道"写完要本地化"**（直链会过期 / 需要 referer）。
   * ⚠️ 与 `patchNodeData` 并存不是"两个入口"：后者是**通用**补丁（版本切换 / 改名 / 选中 / 配方），
   *    只有本动作才表达「这是这条视频的直链」。
   */
  writeVideoUrl: (id: string, patch: Record<string, unknown>) => void;
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
     *   （原 `29440-29442` / `29486-29488` 的 `canvasDefaults.ratio || <默认比例>` 那三目；
     *   本仓的默认比例真源 = `NODE_DEFAULT_RATIO_LABEL`，现为 `'4:3'`）
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
    imageGenKeyParams: {},
    nodeRecipes: {},
    imageGenDeliveredKeys: {},
    imageGenKeyNode: {},
    imageGenKeyTarget: {},
    imageGenFeed: [],
    videoShares: [],
    snap: true,
    soundEnabled: true,
    clipboard: null,
    undo: initialUndoStack<CanvasSnapshot>(),

    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),
    setLibrary: (library) => set({ library }),

    /**
     * 资源库条目改名（原 `renameLibrary` 27515-27548）
     *
     * 源逐行：`commit('library')` → 找条目 → 条目 + **所有同源素材节点**的 `name/label` 一起改。
     * ⚠️ 源先 commit 再判空（`if (s)`）⇒ 空转也会进撤销栈 —— 本仓**先判空再 commit**
     *    （不做无谓快照，与 `renameMaterialNode` 同法）。
     */
    renameLibrary: (libId, name) => {
      const s = get();
      const plan = planLibraryRename({ library: s.library, nodes: s.nodes, libId, name });
      if (!plan) return;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'library', deps.now()) });
      set({
        library: plan.library,
        nodes: plan.nodes,
      });
    },

    /**
     * 替换资源库条目的图（原 `replaceLibrary` 27755-27806）
     *
     * 源逐行：守卫 → 记旧图地址 → `Tn(r.dataUrl)` 外置 → `commit('library')` →
     * 库条目换 `dataUrl`（`w/h` 新值或保留）→ 同源节点换 `dataUrl` → 数 `replaced`。
     * ⚠️ 外置（`deps.persistImage`）失败 ⇒ **什么都不动**（与 `replaceMaterialImage` 同法），
     *    返回 `null` 交给调用方提示。
     */
    replaceLibrary: (libId, image) => {
      const s = get();
      // ① 先外置（原 `Tn`，源在 action 里跑；失败 ⇒ 整个不做）
      const stored = deps.persistImage(image.dataUrl);
      if (!stored) return null;
      // ② 规划（守卫在纯层：条目必须在 + 有地址）
      const plan = planLibraryReplace({
        library: s.library,
        nodes: s.nodes,
        libId,
        storedUrl: stored,
        w: image.w,
        h: image.h,
      });
      if (!plan) return null;
      // ③ 变更前 commit（统一约定；key 用源版那个字面量 `'library'`）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'library', deps.now()) });
      set({
        library: plan.library,
        nodes: plan.nodes,
      });
      return plan.replaced;
    },

    setSnap: (snap) => set({ snap }),

    commit: (key) => {
      const s = get();
      const now = deps.now();
      // ⚠️ 源的合并守卫在压栈前 `return`（⇒ **跳过日志**）—— 与 `commitSnapshot` 内部同一判据
      const record = shouldRecordOperation(s.undo, key, now);
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), key, now) });
      if (!record) return;
      // 操作日志（原 26912-26928）：`type` = 撤销 key（空 ⇒ `'edit'`）；`detail` 用**提交前**的画布规模
      deps.logOperation?.({
        at: now,
        type: key || 'edit',
        detail: { nodes: s.nodes.length, edges: s.edges.length, library: s.library.length },
      });
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

    /**
     * 多选拖拽批量连线（原 `connectBatch` 27054-27069）
     *
     * 源逐行：`commit('graph-add')`（**无条件**，空列表也提交）→ reduce 逐条 `Mr` + `yo`。
     * ⚠️ 本仓把「造边 + 去重」收进纯层 `planConnectBatch`（判据 C1：与
     *    `connectManyToTarget` 共用同一份 append 内核），这里只做 commit + 落 store。
     */
    connectBatch: (sourceIds, targetId) => {
      const s = get();
      const plan = planConnectBatch(s.edges, sourceIds, targetId, deps.makeEdge);
      // 变更前 commit（统一约定）—— 与源一致：**无条件**（空列表也进撤销栈）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      if (plan.edges.length > 0) set({ edges: [...s.edges, ...plan.edges] });
    },

    /**
     * 群锚点批量连线（原 `connectManyToTarget` 27070-27094）
     *
     * 源逐行：目标不在 nodes ⇒ return → 滤自己 → 空 ⇒ return → `commit('graph-add')` → reduce。
     * ⚠️ 三条守卫都在纯层 `planConnectManyToTarget`（返回 `null` = 不干）；**守卫命中不 commit**
     *    （与源一致：源的 commit 在守卫之后）。
     */
    connectManyToTarget: (sourceIds, targetId) => {
      const s = get();
      const plan = planConnectManyToTarget(s.nodes, s.edges, sourceIds, targetId, deps.makeEdge);
      if (!plan) return;
      // 变更前 commit（统一约定）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      if (plan.edges.length > 0) set({ edges: [...s.edges, ...plan.edges] });
    },

    addNode: (type, position, patch, size) => {
      const s = get();
      const id = makeNodeId(type, deps.now(), ++nodeSeq);
      /**
       * ★★ **2026-10-12 补尺寸**：此前这里**不写 `width`/`height`** ⇒ 新节点由内容自适应撑开
       *   （空文本节点就是一条细缝、不同渠道建出来的框大小不一）。
       *   用户裁定「**4:3 指的是空的、里面什么都没有的时候的默认比例**」⇒ 与 `insertNodeOnEdge` 同法，
       *   **没显式给尺寸时**一律取 `nodeCreateSize(type)`（其比例由 `NODE_DEFAULT_RATIO` 保证）；
       *   带内容的渠道（如「三帧→画布参考图」按视频比例算出的框）**显式传 `size` 覆盖**。
       */
      const box = size ?? nodeCreateSize(type);
      const node = {
        id,
        type,
        position,
        width: box.w,
        height: box.h,
        // ★ 2026-10-12：**文本节点吃画布默认值**（源 `29440-29442`：建框时 `aspectRatio/duration/model` 三目）
        //   —— `patch` 在最后 ⇒ 显式传参仍然优先（与源的 `r || canvasDefaults…` 同序）
        data: {
          ...defaultNodeData(type),
          ...(type === 'text' && s.canvasDefaults ? textDefaultsPatch(s.canvasDefaults) : {}),
          // ★ 生成类节点**沿用画布上「上一个同类节点」的设置**（源 `addGenVideo` 29496 / `addGenImage` 29536；
          //   逐字：`u.X || 兜底`）—— `patch` 仍在最后 ⇒ 显式传参优先
          ...(type === 'genvideo' || type === 'imggen' ? inheritGenNodeData(type, s.nodes) : {}),
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
          // ⚠️ 只覆盖 `NodeBase` 上的**公共字段** ⇒ `{...n, ...moved}` 仍是原联合成员（不需要断言）
          const moved: Partial<Pick<CanvasNode, 'position' | 'width' | 'height'>> = {};
          if (position) moved.position = s.snap ? snapToGrid(position) : position;
          if (size && size.w != null && size.h != null) {
            moved.width = size.w;
            moved.height = size.h;
          }
          if (Object.keys(moved).length > 0) {
            set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-move', deps.now()) });
            set({
              nodes: s.nodes.map((n) => (n.id === existing.id ? { ...n, ...moved } : n)),
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
        (n) => n.type === 'material' && n.data.sourceVideoId === input.sourceVideoId,
      ).length;
      const pos = screenshotNodePlacement(anchor, count);
      return get().addNode(
        'material',
        pos,
        {
          label: input.label || '截图',
          dataUrl: input.dataUrl,
          sourceVideoId: input.sourceVideoId,
          ...(input.sourceTime === undefined ? {} : { sourceTime: input.sourceTime }),
        },
        // ★ 源 `:28343-28344` 把新节点框设成 **220×180**（`addNode` 的默认是「空节点」的 4:3，
        //   不传就会把截图塞进默认框 —— `TD-16-91`）
        { w: SCREENSHOT_NODE_SIZE.w, h: SCREENSHOT_NODE_SIZE.h },
      );
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
        // ⚠️ 源版的兜底是 `|| 默认值 || 7` / `|| 默认值 || '16:9'`（原 29485-29486）；
        //   本仓 `RECIPE_TEXT_FALLBACKS.ratio` 吃 `NODE_DEFAULT_RATIO_LABEL`（4:3）
        duration: input.duration || RECIPE_TEXT_FALLBACKS.duration,
        aspectRatio: input.ratio || RECIPE_TEXT_FALLBACKS.ratio,
        styleIds: input.styleId ? [input.styleId] : [],
        linkOrder: [],
      });
    },

    setNodeRecipe: (nodeId, recipe) => {
      // 原 `setNodeRecipe`（shared.js:30844-30857）：`!n` ⇒ 返；`r` 真 ⇒ 设键 / 假 ⇒ 删键
      if (!nodeId) return;
      const next = { ...(get().nodeRecipes || {}) };
      if (recipe) next[nodeId] = recipe;
      else delete next[nodeId];
      set({ nodeRecipes: next });
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

      // `node.data` 已是 `MaterialNodeData`（判别联合收窄）⇒ 直接用
      const d = node.data;
      const prefix = (typeof d.name === 'string' && d.name) || (typeof d.label === 'string' && d.label) || '素材';
      const name = (opts.name ?? '').trim() || `${prefix}${EDITED_SUFFIX}`;
      const libId = makeLibraryId(deps.now(), ++nodeSeq);
      /** 新图的**原始**尺寸（写进库条目与 `data.natW/natH`） */
      const w = opts.w || Number(d.natW) || 0;
      const h = opts.h || Number(d.natH) || 0;
      const ratio = w && h ? w / h : 0;
      const prevRatio = Number(d.natW) && Number(d.natH) ? Number(d.natW) / Number(d.natH) : 0;
      /*
       * ★ **换图 ⇒ 节点跟着新图的比例变**（源 29088 一带的 `resize`，**保留**）。
       *
       * ⚠️ **2026-10-12 用户裁定（原话）**：「**换图，图变了比例当然节点就变了**」——
       *   我一度把这一段删掉（理由写成"素材框恒定 4:3"）⇒ **删错了**，已恢复。
       * ★ 正确的口径：**「4:3」是节点**新建时的初始比例**（空节点、或刚落下来的那一张），
       *   **不是**给已有节点上的枷锁 —— 图换了、比例自然跟着换。
       * ⚠️ 阈值与下限逐字对源：比例变化 **> 2%** 且节点有宽才重设；高**下限 120**。
       */
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
                  natW: w || node.data.natW,
                  natH: h || node.data.natH,
                },
              } as CanvasNode)
            : n,
        ),
      });
      return true;
    },

    replaceImageGenImage: (nodeId, dataUrl, opts = {}) => {
      const s = get();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node || node.type !== 'imggen' || !node.data || !dataUrl) return false;

      // `node.data` 已是 `GenImageNodeData`（判别联合收窄）⇒ 直接用；`Array.isArray` 留给**脏数据**
      const d = node.data;
      // ① 找当前展示图（复用纯层 `genImageCurrentUrl`，判据 C1 —— 与 `GenImageNode` 同一判据）
      const currentUrl = genImageCurrentUrl({
        viewUrl: typeof d.viewUrl === 'string' ? d.viewUrl : undefined,
        resultUrl: typeof d.resultUrl === 'string' ? d.resultUrl : undefined,
        results: Array.isArray(d.results) ? d.results : [],
      });
      if (!currentUrl) return false;

      // ② 撤销快照（原 `commit(\`replace-img-${n}\`)`）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), `replace-img-${nodeId}`, deps.now()) });

      // ③ 新名（原 `${c}·已编辑`，`c` = `name || label || '文生图'`）
      const prefix = (typeof d.name === 'string' && d.name) || (typeof d.label === 'string' && d.label) || GEN_IMAGE_LABEL;
      const name = (opts.name ?? '').trim() || `${prefix}${EDITED_SUFFIX}`;

      // ④ 外置（原 `Tn(r)`；`persistImage` 幂等，失败原样返回入参）
      const stored = deps.persistImage(dataUrl);
      const w = opts.w || 0;
      const h = opts.h || 0;

      // ⑤ 建库条目（原 `addToLibrary` —— **按 dataUrl 去重**：已存在则不追加）
      const exists = s.library.some((item) => item.dataUrl === stored);
      const libId = makeLibraryId(deps.now(), ++nodeSeq);

      // ⑥ 更新节点：`results` 里命中当前图的那张换 `dataUrl` + 三字段指向新图
      const results = (Array.isArray(d.results) ? d.results : []).map((item) =>
        item.dataUrl === currentUrl ? { ...item, dataUrl: stored } : item,
      );

      set({
        ...(exists
          ? {}
          : {
              library: [
                ...s.library,
                { id: libId, name, dataUrl: stored, favorite: false, ...(w && h ? { w, h } : {}) } as LibraryItem,
              ],
            }),
        nodes: s.nodes.map((n) =>
          n.id === nodeId
            ? ({
                ...n,
                data: {
                  ...n.data,
                  results,
                  resultUrl: stored,
                  viewUrl: stored,
                  dataUrl: stored,
                },
              } as CanvasNode)
            : n,
        ),
      });
      return true;
    },

    /**
     * 换图（资源库/文件 → 素材节点）（原 `replaceMaterialWithLib` 27682-27724）
     *
     * 源逐行：守卫（节点在 / 是素材 / 有 data / 条目有图）→ `Ms` 解旧 libId →
     * 四级回落取名 → `commit(\`replace-mat-${n}\`)` → `Gy` 改指 →  patch 目标节点。
     * ⚠️ **guard 失败 ⇒ 不 commit**（源的 commit 在守卫之后）⇒ 直接返回，调用方提示。
     */
    replaceMaterialWithLib: (nodeId, item) => {
      const s = get();
      const plan = planMaterialReplaceWithLib({
        nodes: s.nodes,
        library: s.library,
        nodeId,
        item,
      });
      if (!plan.ok) return { ok: false, reason: plan.reason };
      // 变更前 commit（统一约定；key 用源版那个**按节点分区**的 `replace-mat-${nodeId}`）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), `replace-mat-${nodeId}`, deps.now()) });
      set({ nodes: plan.value.nodes });
      return { ok: true };
    },

    addVideoShare: (input) => {
      const s = get();
      // 去重（原 27911-27919：先按 `vid`、再按 `url`）—— 命中任一 ⇒ 什么都不做
      if (input.vid && s.videoShares.some((v) => v.vid === input.vid)) return;
      if (input.url && s.videoShares.some((v) => v.url === input.url)) return;
      set({
        videoShares: [
          { id: makeId('videoShare', deps.now(), ++nodeSeq), ...input, createdAt: deps.now() },
          ...s.videoShares,
        ].slice(0, 50),
      });
    },

    removeVideoShare: (id) => {
      set({ videoShares: get().videoShares.filter((v) => v.id !== id) });
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
        nodes: plan.nodes,
        library: plan.library,
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
      set({ nodes: r.nodes });
      return { ok: true, groupId: r.groupId };
    },

    ungroupNodes: (groupId) => {
      const s = get();
      const r = ungroupPure(s.nodes, groupId);
      if (!r.ok) return;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'ungroup', deps.now()) });
      set({ nodes: r.nodes });
    },

    arrangeNodes: (mode) => {
      const s = get();
      const r = planArrange(s.nodes, s.edges, mode);
      if (!r.ok) return { ok: false, reason: r.reason };
      // 变更前 commit（统一约定；key 用源版那个字面量 **`'arrange'`**，原 `commit('arrange')` shared.js:31811）
      // ⚠️ 与 `arrangeSelectedNodes` 的 `'graph-arrange'`（shared.js:29645）是**两个不同的 key** ——
      //   两个动作在源里就是两段独立实现，不共用撤销键（2026-10-11 曾错改成本 key，已回退）。
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'arrange', deps.now()) });
      set({ nodes: r.nodes });
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
          return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
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
      const created: TextNode[] = parts.map((part, i) => {
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
        };
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
      const survivors = s.nodes
        .filter((n) => !kill.has(n.id))
        .map((n) => {
          if (n.type !== 'text') return n;
          const order = n.data.referenceOrder ?? [];
          const next = order.filter((rid) => !kill.has(rid));
          return next.length === order.length ? n : ({ ...n, data: { ...n.data, referenceOrder: next } } as CanvasNode);
        });
      // ③ ★ 删掉的是**组** ⇒ **释放成员**（原 `onNodesChange` 的删组支，`shared.js:26848-26875`）——
      //   否则孩子留着悬空 `parentId`：相对坐标被当成绝对坐标 ⇒ 跳位 + 拖动/裁切异常。
      //   ⚠️ 判据用**变更前**的 `s.nodes`（被删的组已经不在 `survivors` 里了）。
      const nodes = releaseDeletedGroupChildren(survivors, s.nodes, kill);

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

    writeVideoUrl: (id, patch) => {
      // ★ 「写视频 `url`」的**唯一入口**：写 + **内建**本地化（源 `_Component43.jsx:3160`：
      //   `updateNodeData(...)` 之后立刻 `localizeNodeVideos(ee)`）—— 调用方不需要知道这件事。
      // ⚠️ 与 `patchNodeData` 的分工：后者是**通用**补丁（版本切换 / 改名 / 选中 / 配方…都不该触发落盘）。
      get().patchNodeData(id, patch);
      deps.localizeVideoNode(id);
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
          n.selected === keep.has(n.id) ? n : { ...n, selected: keep.has(n.id) },
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

    // ★ API 任务事件的落点（`addToLibrary` / `attachImageResultToNode` / `addVideoNode`）
    //   —— 主体在 `./apiLanding.ts`（同片片段；`canvas.ts` 已到 `max-lines` 上限〔该规则 2026-10-11 已关闭〕）
    ...createApiLandingActions(set, get, {
      now: () => deps.now(),
      persistImage: deps.persistImage,
      localizeVideoNode: deps.localizeVideoNode,
      nextLibraryId: () => makeLibraryId(deps.now(), ++nodeSeq),
      nextVideoNodeId: () => makeNodeId('video', deps.now(), ++nodeSeq),
      // 原 `Pt('ig')` —— 生成图片流的项 id（与 imggen 节点同前缀）
      nextFeedId: () => makeNodeId('imggen', deps.now(), ++nodeSeq),
      pushToast: deps.pushToast,
      releaseAccount: deps.releaseAccount,
    }),
  };
}
