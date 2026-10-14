/**
 * AI 生成模型（API 通道 / provider）—— ★ 冻结契约（**值形状**不可改）
 * 依据：docs/过程.md 单元 4 + docs/05-配置契约层.md §五
 * 归属说明：数据形状属 `stable`（L1）—— 见 `./node.ts` 头部说明
 */

/** API 任务状态机（原 `job-manager.js:4-5`） */
export const API_JOB_STATUSES = [
  'queued',
  'submitting',
  'running',
  'downloading',
  'done',
  'failed',
  'cancelled',
] as const;
export type ApiJobStatus = (typeof API_JOB_STATUSES)[number];

/** 未完成状态（重启时清理，见 `stable/migrations/resetStaleJobs`） */
export const STALE_JOB_STATUSES: readonly ApiJobStatus[] = ['queued', 'submitting', 'running'];

/**
 * API 任务错误（原 `job-manager.js:392`：`{kind, message, advice?}`）
 * ⚠️ 是**对象**，不是字符串（原 `ApiJobLite.error?: string` 是错的）
 */
export interface ApiJobError {
  /** 分类（`quota` / `auth` / `fallback` / …） */
  kind?: string;
  message: string;
  /** 处置建议（后端给的话术） */
  advice?: string;
}

/** 单条生成结果（原 `publicSnapshot().results[]`） */
export interface ApiJobResult {
  type: 'image' | 'video';
  /** 图片：dataUrl */
  dataUrl?: string;
  /** 视频：url */
  url?: string;
  [k: string]: unknown;
}

/** 尝试记录（渲染层回写 `genHistory` 用；**不含密钥**） */
export interface ApiJobAttempt {
  id: string;
  [k: string]: unknown;
}

/**
 * API 任务事件 / 快照（★ 后端 `job-manager.js:57-76` 的 `publicSnapshot` **逐字**）
 *
 * ⚠️ **字段名是 `jobId`，不是 `id`** —— 这曾是一个**真 bug**：
 *    原 `core/ports` 的 `ApiJobLite` 声明成 `id`，而 `upsertApiJob` 按 `id` 去重
 *    ⇒ 真实事件里 `id === undefined` ⇒ **所有任务塌进同一条记录**（订阅等于失效）。
 *    本形状取代 `ApiJobLite`（重复定义 + 字段名错），已登记项据此收口。
 *
 * ⚠️ `error` 是**对象**（`{kind, message, advice?}`），不是字符串。
 */
export interface ApiJobEvent {
  jobId: string;
  providerId?: string;
  providerName?: string;
  kind: 'image' | 'video';
  /** 发起时的节点 id（**可空** —— 无节点来源的任务落资源库） */
  nodeId: string | null;
  status: ApiJobStatus;
  progress?: number;
  error: ApiJobError | null;
  attempt: ApiJobAttempt | null;
  results: ApiJobResult[];
  params: Record<string, unknown>;
  prompt: string;
  taskId: string | null;
  createdAt: number;
  finishedAt: number | null;
  /** 是否走了兜底 provider（原 `job._usedFallback`） */
  usedFallback: boolean;
}

/**
 * `ApiJobEvent` 的类型谓词 —— ★ **推送边界的唯一收窄入口**
 *
 * ★ 为什么在这里：**形状与谓词同源**（同 `core/model/license.ts` 的 `isLicenseStatusKind`）。
 * ⚠️ 推送载荷来自后端、属**不可信输入** —— 拉取侧（invoke 返回值）已统一走 `checkOk`/`need`
 *    fail-closed；推送侧若不收窄，形状漂移会**静默变成 `undefined`**（`TD-04-12`）。
 * ⚠️ 只判**恒带且可判**的字段（`jobId` / `kind` / `status` / `results`）；可选字段不参与，
 *    不冒充必需。
 */
export function isApiJobEvent(v: unknown): v is ApiJobEvent {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.jobId === 'string' &&
    (r.kind === 'image' || r.kind === 'video') &&
    typeof r.status === 'string' &&
    Array.isArray(r.results)
  );
}

/** 批量提交结果（原 `job-manager.js:443-462` 的 `submitBatch`） */
export interface ApiBatchResult {
  /** 与 `matrix` 逐位对应；提交失败处为 `null` */
  jobIds: Array<string | null>;
  /** 与 `jobIds` 逐位对应；成功处为 `null` */
  errors: Array<string | null>;
  total: number;
}

/**
 * provider 动态表单字段（原 `api/types.js` 的 `ParamField`；后端 `registry.js:31` **逐字**下发）
 *
 * ★ **schema 驱动**：新增一个服务商 = 一个 provider 文件 + 一行注册，**零 UI 代码**
 *   （设置页 / 生成面板都按这张表渲染）。
 */
export interface ParamField {
  /** 参数键（写入 `config.params` / 提交 `params`） */
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  /** `type: 'select'` 的可选项 */
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  default?: unknown;
}

/**
 * provider 元信息（渲染层只读；密钥明文永不过桥）
 *
 * ⚠️ **只有元信息**：元信息口（`registry.js:27` 的 `listProvidersMeta`）**只回**
 *    `id/name/capabilities/paramSchema/defaults/domains` —— `enabled` / `hasKey` / `keyHint` / `hasSecret`
 *    是**配置**字段（后端 `config-store.js:141` 的 `publicOf` 才给），归 `ApiProviderConfig`；
 *    写进本类型 = 类型撒谎（真实宿主**永远不给**那四个）。
 */
export interface ApiProviderMeta {
  id: string;
  name: string;
  capabilities: readonly string[];
  /** ★ schema 驱动表单（原 `paramSchema`） */
  paramSchema?: ParamField[];
  /** 默认配置（`baseUrl` / `model` 等；用户未覆盖时用） */
  defaults?: Record<string, unknown>;
  /** 公开端点地址（可下发） */
  domains?: string[];
}

/**
 * provider 的**配置**（后端 `config-store.js:141` 的 `publicOf` **逐字**）
 *
 * ⚠️ 脱敏：只有 `hasKey` / `keyHint` / `hasSecret`；**密钥明文永不过桥**。
 */
export interface ApiProviderConfig {
  id: string;
  enabled: boolean;
  baseUrl: string;
  model: string;
  params: Record<string, unknown>;
  hasKey: boolean;
  /** 形如 `sk-****7890`；无密钥 ⇒ 空串 */
  keyHint: string;
  hasSecret: boolean;
}

/** `api-config:get` 的 `configs` —— **按 `providerId` 索引**（原 `{[id]: publicOf(adapter)}`） */
export type ApiConfigMap = Record<string, ApiProviderConfig>;

/** API 配置（`apiSetupGet`） */
export interface ApiSetup {
  imageProviderId: string | null;
  videoProviderId: string | null;
  fallbackProviderId: string | null;
  /** 默认 DEFAULT_API_CONCURRENCY = 3 */
  concurrency: number;
}

/** 用量（按本地日期 `YYYY-MM-DD`） */
export interface ApiUsage {
  [date: string]: { image: number; video: number };
}

/** 生成结果（网页通道 / API 通道统一产出） */
export interface GenResult {
  /** `img://` 或 `vid://` 引用 */
  ref: string;
  source: 'api' | 'doubao' | 'dola';
  accountName: string;
  genKey: string;
  ts: number;
  ratio: string;
  /** ≤80 字 */
  prompt: string;
  params: unknown;
  /** 视频才有 */
  poster?: string;
  /**
   * 原图原始尺寸（原 `DR` 的项带 `natW`/`natH`，`shared.js:36524-36525`）
   * ⚠️ 量不到 ⇒ `0`（源 `D.natW || 0`）；`addImageGenResult` 用 `natW && natH` 判「有才写库」
   */
  natW?: number;
  natH?: number;
}


