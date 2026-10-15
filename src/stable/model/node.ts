/**
 * 节点模型（8 类判别联合）—— ★ 冻结契约（**值形状**不可改）
 *
 * 归属：`11` §六「契约边界表」把「**值形状**」列为冻结项 ⇒ 数据形状属 `stable`（L1），不属 `core`（L2）
 *   （放 `core` 会造出 `stable/migrations → core/model` 的**反向依赖**）。
 *
 * 依据：docs/过程.md §0.2（逐条对照还原源码行号）
 * ⚠️ 字段名**冻结**（老数据兼容，docs/08 W2）。新增字段可以，**改名不行**。
 */

import type { ApiJobAttempt, VideoApiJob } from './gen';
import type { Recipe } from './recipe';

export interface XY {
  x: number;
  y: number;
}

/**
 * 生成历史在节点 `data` 上的**键名**（原 `shared.js:25512` 的 `const Fs = 'genHistory'`）
 * ⚠️ 是冻结键名（旧工程数据里就是这个字面量）⇒ SSOT 只此一处。
 */
export const GEN_HISTORY_KEY = 'genHistory';

/**
 * 提示词分析状态（节点 `data.analyzePrompt`）—— 原 `gS`/`yS` 往节点里写的那个对象
 *
 * ★ **为什么放 `stable/model`**：它是**写进节点数据的冻结形状**（原版逐处
 *   `updateNodeData(id, {analyzePrompt: {...}})`），与 `GenHistory` 同类 ⇒ 真源在契约层；
 *   `core/rules|usecases` 只**引用**它。
 *   （2026-10-10 之前它只以 `AnalyzePatch` 之名存在于 `core/usecases/analyzePrompt.ts`，
 *   于是 UI 读 `data.analyzePrompt` 只能拿到 `unknown`。）
 *
 * ⚠️ 带索引签名：源版在**各分支里展开旧值**（`{...o, …}`）⇒ 会有额外字段（如 `partial`），
 *    必须能原样带过去。
 */
export interface AnalyzePromptState {
  status: 'analyzing' | 'revising' | 'done' | 'error';
  /** 写入时刻 */
  at: number;
  /** 阶段文案（`analyzing` / `revising` 期间） */
  phase?: string | null;
  /** 兜底信息（源 `yS` 的 catch 里显式清掉） */
  partial?: unknown;
  /** 失败原文（**已按源版加前缀**，如 `分析失败：…`） */
  error?: string | null;
  ok?: boolean;
  zh_prompt?: string;
  en_prompt?: string;
  json_prompt?: unknown;
  raw?: string;
  /** 执行账号（源版每次写状态都带上这仨） */
  accountId?: string;
  accountName?: string;
  accountType?: string;
  [k: string]: unknown;
}

/**
 * 生成历史（版本选择，原 31068 `selVer`）
 * ★ `attempts` 的元素形状真源 = `ApiJobAttempt`（构造器 `core/rules/genHistory.makeGenAttempt`）
 */
export interface GenHistory {
  v: 1;
  attempts: ApiJobAttempt[];
}

/** 文生图单条结果（原 27264-27272） */
export interface ImageGenResult {
  dataUrl: string;
  source: string;
  accountName: string;
  genKey: string;
  ts: number;
  ratio: string;
  /** ≤80 字 */
  prompt: string;
  params: unknown;
}

/**
 * 所有节点 `data` 的公共底座
 *
 * ⚠️ **索引签名是刻意的**，两个理由：
 *   1. **老数据兼容**：旧工程可能带我们不知道的字段（`docs/08` W2），契约上必须允许
 *   2. **框架要求**：`@xyflow/react` 的 `Node<T>` 约束 `T extends Record<string, unknown>`
 *
 * ★ **字段级不变量的「运行时校验」**：`core/rules/node.ts` 的 `validateNode` / `validateNodes`
 *    由 `bootstrap/hydrate.ts:26` 在**加载后对全部节点**跑体检（2.5 步）。
 */
export interface NodeDataBase {
  [k: string]: unknown;
}

/** 节点统一外形 */
interface NodeBase {
  /** 前缀：`t`文本 / `m`素材 / `vid`视频 / `gv`文生视频 / `ig`文生图 / `a`账号 / `e`边 / `grp`组 */
  id: string;
  position: XY;
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
  selected?: boolean;
  /**
   * **xyflow 的运行期量测尺寸**（框架写，本仓只读）
   *
   * ⚠️ 它**确实在本仓节点对象上**：`ui/canvas/CanvasHost.onNodesChange` 用
   *   `applyNodeChanges(...)` 的结果**整表回写** store（那处 `as unknown as CanvasNode[]` 就是这个第三方边界）。
   *   ⇒ 与 `selected` / `zIndex` / `extent` / `parentId` 同级：都是框架概念，但都在我们的节点对象上。
   * ⚠️ **`width`/`height` 优先于它**（源 `o`/`N` 的兜底链逐级降级）；纯函数若只想读量测值，
   *    仍各自声明自己的最小入参（那是**函数入参形状**，不是本字段的第二份）。
   */
  measured?: { width?: number; height?: number };
  /** 组内节点才有 */
  parentId?: string;
  /** 组内节点才有（限制在父节点内） */
  extent?: 'parent' | [[number, number], [number, number]];
  zIndex?: number;
}

/** 文本节点（原 28593-28611） */
export interface TextNodeData extends NodeDataBase {
  label?: string;
  text: string;
  /** 默认 `NODE_DEFAULT_RATIO_LABEL`（`'4:3'`，`constants/models.ts`）—— 见 `NODE_DEFAULTS.text` */
  aspectRatio: string;
  /** 默认 7 */
  duration: number;
  linkOrder: string[];
  /** `@` 引用顺序（text→text 连线时写入） */
  referenceOrder: string[];
  materialIds: string[];
  model?: string;
  /** `'auto'` | accountId */
  sendAccount?: string;
  styleIds: string[];
}
export type TextNode = NodeBase & { type: 'text'; data: TextNodeData };

/** 素材节点（原 28345-28351） */
export interface MaterialNodeData extends NodeDataBase {
  label?: string;
  name: string;
  /** dataUrl 或 `img://` 引用 */
  dataUrl: string;
  libId?: string;
  natW?: number;
  natH?: number;
  w?: number;
  h?: number;
  sourceVideoId?: string;
  sourceTime?: number;
  /**
   * 提示词分析结果（原 `fL.jsx:26` 的 `t.analyzePrompt`；由 `gS`/`yS` 写入）
   *
   * ★ **2026-10-10 补**：素材节点**也有**这套分析（源版「分析提示词」浮动按钮在
   *   素材节点与生成节点上是**同一套**，见 `ui/nodes/AnalyzePrompt.tsx`）——
   *   此前只在 `GenImageNodeData` 上类型化过，这里漏了 ⇒ UI 读它只能拿到 `unknown`。
   */
  analyzePrompt?: AnalyzePromptState;
}
export type MaterialNode = NodeBase & { type: 'material'; data: MaterialNodeData };

/** 视频节点（原 28277-28302） */
export interface VideoNodeData extends NodeDataBase {
  label: '视频';
  vid?: string;
  url: string;
  width?: number;
  height?: number;
  duration?: number;
  poster?: string;
  accountId?: string;
  accountName?: string;
  /**
   * 网格锚点 = 源节点 id（网格新建时写 `String(源节点 id)`；无源 ⇒ `''` —— `apiLanding` 的唯一写点）
   * ⚠️ 读取链是 `gridAnchor || sourceNodeId`（源 `fR` / `d0`）：旧数据可能只带后者
   */
  gridAnchor?: string;
  /** 网格槽位（非负整数；网格新建时写入——`apiLanding` 的唯一写点） */
  gridSlot?: number;
  /** 网格坐标快照（判「该网格成员是否要跟着新行高重排」用） */
  gridPos?: XY;
  /** 旧数据里的来源节点 id（新写入走 `gridAnchor`） */
  sourceNodeId?: string;
  /** 生成配方（形状真源 = `./recipe` 的 `Recipe`；由 `apiLanding` 从 `nodeRecipes` 拷入） */
  recipe?: Recipe;
  sourceLabel?: string;
  genHistory?: GenHistory;
}
export type VideoNode = NodeBase & { type: 'video'; data: VideoNodeData };

/**
 * **节点默认标签**（既是数据默认值，也是批量列表里的兜底显示名）
 * ⚠️ 原版 `v3` 41551 直接内联这两个字符串 —— 提为具名常量（原则 5），
 *    与下面两个节点的 `label` 字段**同源**。
 */
export const GEN_VIDEO_LABEL = '文生视频';
/**
 * 文生图节点的默认标签 —— ★ **2026-10-14 补齐（`TD-16-150`）**：
 * 它与 `GEN_VIDEO_LABEL` 本是**一对**（两个节点的 `label` 字段各用一个），
 * 但原先只有 video 这半提成了常量，image 那半留在 `GenImageNodeData.label` 的**类型字面量**里
 * ⇒ `core/model/defaults` / `core/rules/prompt` / `state/slices/canvas` 三处又各内联一遍 `'文生图'`。
 */
export const GEN_IMAGE_LABEL = '文生图';
/** 文本节点兜底显示名（原 `v3` 的 `'文本框'`） */
export const TEXT_NODE_LABEL = '文本框';

/** 文生视频节点（原 29519-29531） */
export interface GenVideoNodeData extends NodeDataBase {
  label: typeof GEN_VIDEO_LABEL;
  text: string;
  /** 默认 `NODE_DEFAULT_RATIO_LABEL`（`'4:3'`）—— 见 `NODE_DEFAULTS.genvideo` */
  aspectRatio: string;
  /** 默认 5 */
  duration: number;
  model?: string;
  /** 默认 `'auto'` */
  sendAccount: string;
  channel?: string;
  styleIds: string[];
  linkOrder: string[];
  genHistory?: GenHistory;
  selVer?: number;
  resultUrl?: string;
  resultPoster?: string;
  resultVid?: string;
  resultAt?: number;
  // ⚠️ 这里**没有** `generating` —— 它**只属 `imggen`**（见 `GenImageNodeData`）。
  //   `genvideo` 的生成态真源是 `core/rules/genVideo.genVideoWaiting`（由 `apiJob` / `_pendingAttempt` 推导）；
  //   真实样本 `doubao-projects.txt` 里 **2 个 `genvideo` 节点都不含该字段**。
  /** API 任务状态条（`applyApiJobEvent` 的 `nodePatch` / 批量落点写入；`core/rules/genVideo.apiJobLabel` 读） */
  apiJob?: VideoApiJob;
  /**
   * 提示词分析结果（原 `yS` 写入；`ZL.jsx` / `GenVideoNode` 读）
   *
   * ★ **与 `GenImageNodeData` / `MaterialNodeData` 同源**：源版「分析提示词」浮动按钮在
   *   **素材节点与生成节点**上是同一套，`state/analyze` 的 `revise` 也明确只对
   *   `imggen | genvideo` 工作 ⇒ `genvideo` 上**确实**会写这个键，漏声明则读它只能拿到 `unknown`。
   */
  analyzePrompt?: AnalyzePromptState;
  /** 本次会话的在途尝试（出片后清）—— 形状同 `genHistory.attempts` 的元素 */
  _pendingAttempt?: ApiJobAttempt;
  /** 按账号分槽的在途尝试（键 = `accountId`） */
  _pendingAttempts?: Record<string, ApiJobAttempt>;
}
export type GenVideoNode = NodeBase & { type: 'genvideo'; data: GenVideoNodeData };

/** 文生图节点（原 29559-29575） */
export interface GenImageNodeData extends NodeDataBase {
  label: typeof GEN_IMAGE_LABEL;
  text: string;
  /** 默认 `NODE_DEFAULT_RATIO_LABEL`（`'4:3'`）—— 见 `NODE_DEFAULTS.imggen` */
  aspectRatio: string;
  /** 默认 `'doubao'` */
  channel: string;
  /** 默认 `'auto'` */
  sendAccount: string;
  /** 默认 1 */
  imageCount: number;
  igModel?: string;
  /** 默认 `'2K'` */
  igResolution?: '1K' | '2K' | '4K';
  styleIds: string[];
  linkOrder: string[];
  results: ImageGenResult[];
  resultUrl?: string;
  dataUrl?: string;
  viewUrl?: string;
  generating?: boolean;
  /**
   * 提示词分析结果（原 `gS`/`yS` 写入；`ZL.jsx:158` 的 `l.analyzePrompt`）
   *
   * ★ **2026-10-10 修正（原声明为 `string`，是错的）**：真实样本
   *   `tests/fixtures/real-sample/doubao-projects.txt` 的 `ig_mv1ras1w_2` 节点里，
   *   该字段是**对象**：
   *   `"analyzePrompt":{"status":"done","ok":true,"zh_prompt":"可爱橘色条纹小橘猫…",…}`
   *   —— 与源码（`gS`/`yS` 逐处写 `{status, ok, zh_prompt, en_prompt, json_prompt, raw, at, …}`）
   *   **完全一致**。原注释声称"依据真实样本"却写成 `string`，属于**形状与证据不符**（已修）。
   */
  analyzePrompt?: AnalyzePromptState;
}
export type GenImageNode = NodeBase & { type: 'imggen'; data: GenImageNodeData };

/** 账号节点（原 29592-29594） */
export interface AccountNodeData extends NodeDataBase {
  accountId: string;
}
export type AccountNode = NodeBase & { type: 'account'; data: AccountNodeData };

/** 下载节点（原 29610-29612） */
export interface DownloadNodeData extends NodeDataBase {
  folder: string;
}
export type DownloadNode = NodeBase & { type: 'download'; data: DownloadNodeData };

/** 组节点（原 31577-31579，`zIndex = -1001`） */
export interface GroupNodeData extends NodeDataBase {
  label: string;
}
export type GroupNode = NodeBase & { type: 'group'; data: GroupNodeData };

/** 画布节点（8 类判别联合） */
export type CanvasNode =
  | TextNode
  | MaterialNode
  | VideoNode
  | GenVideoNode
  | GenImageNode
  | AccountNode
  | DownloadNode
  | GroupNode;

export type NodeType = CanvasNode['type'];
export type NodeDataOf<T extends NodeType> = Extract<CanvasNode, { type: T }>['data'];
