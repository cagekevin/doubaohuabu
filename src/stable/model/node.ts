/**
 * 节点模型（8 类判别联合）—— ★ 冻结契约（**值形状**不可改）
 *
 * 归属说明（2026-10-10 修正）：`11` §六「契约边界表」明确把「**值形状**」列为冻结项
 *   ⇒ 数据形状属 `stable`（L1），不属 `core`（L2）。
 *   原先放在 `core/model` 导致 `stable/migrations → core/model` **反向依赖**，已修正。
 *
 * 依据：docs/03-人类版.md §0.2（逐条对照还原源码行号）
 * ⚠️ 字段名**冻结**（老数据兼容，docs/08 W2）。新增字段可以，**改名不行**。
 */

export interface XY {
  x: number;
  y: number;
}

/** 生成历史（版本选择，原 31068 `selVer`） */
export interface GenHistory {
  v: 1;
  attempts: unknown[];
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
 * 字段级别的**不变量**由 `core/rules/node.ts` 在**运行时**校验（有单测覆盖）。
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
  /** 默认 `'16:9'` */
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
  gridAnchor?: unknown;
  gridSlot?: unknown;
  gridPos?: unknown;
  recipe?: unknown;
  sourceLabel?: string;
  genHistory?: GenHistory;
}
export type VideoNode = NodeBase & { type: 'video'; data: VideoNodeData };

/** 文生视频节点（原 29519-29531） */
export interface GenVideoNodeData extends NodeDataBase {
  label: '文生视频';
  text: string;
  /** 默认 `'16:9'` */
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
  apiJob?: unknown;
  _pendingAttempt?: unknown;
  _pendingAttempts?: unknown;
}
export type GenVideoNode = NodeBase & { type: 'genvideo'; data: GenVideoNodeData };

/** 文生图节点（原 29559-29575） */
export interface GenImageNodeData extends NodeDataBase {
  label: '文生图';
  text: string;
  /** 默认 `'1:1'` */
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
   * 素材分析提示词（**真实样本里存在，原 `docs/03` 未记**）
   *
   * ⚠️ 取自 `tests/fixtures/real-sample/doubao-projects.txt` 的 `ig_mv1ras1w_2` 节点 ——
   *    判据是**真实数据**，不是文档（铁律 3：描述只是线索）。
   */
  analyzePrompt?: string;
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
