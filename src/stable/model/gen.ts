/**
 * AI 生成模型（API 通道 / provider）—— ★ 冻结契约（**值形状**不可改）
 * 依据：docs/04-AI协议版.md 单元 4 + docs/05-配置契约层.md §五
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

/** API 任务（原 `apj-<base36>-<seq>`） */
export interface ApiJob {
  id: string;
  status: ApiJobStatus;
  kind: 'image' | 'video';
  providerId?: string;
  error?: string;
  [k: string]: unknown;
}

/** provider 元信息（渲染层只读；密钥明文永不过桥） */
export interface ApiProviderMeta {
  id: string;
  name: string;
  capabilities: readonly string[];
  enabled?: boolean;
  /** 是否已配置密钥（脱敏） */
  hasKey?: boolean;
  /** 形如 `sk-****7890` */
  keyHint?: string;
  hasSecret?: boolean;
  domains?: string[];
}

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
}

/** 生成轮询终止原因（原 `DR` 36335+） */
export const GEN_END_REASONS = ['settled', 'no-real-image', 'timeout', 'already-finished', 'manual'] as const;
export type GenEndReason = (typeof GEN_END_REASONS)[number];
