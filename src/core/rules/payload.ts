/**
 * 报文构造（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：
 *   - `PL` shared.js:40361-40410 —— 图片报文（`source: 'canvas-image-gen'`）
 *   - `TL` shared.js:40318-40360 —— 视频报文（`source: 'canvas-text-node'`）
 *   - `$L` shared.js:40236-40317 —— 账号节点报文（`source: 'canvas-account-node'`）
 *
 * ⚠️ 原则 4：`core` **不得用 `Date.now()`** ⇒ `timestamp` 由外部注入（`ClockPort`）
 * ⚠️ 协议形状（`apiVersion` / `action` / `source` / 字段名）是**冻结契约**（跨进程），不得改
 */

import { composeImagePrompt, composeVideoPrompt } from './prompt';

/** 发送来源（原实现三种；跨进程契约，不得改名） */
export const SEND_SOURCES = ['canvas-image-gen', 'canvas-text-node', 'canvas-account-node'] as const;
export type SendSource = (typeof SEND_SOURCES)[number];

/** 报文里的账号摘要（**不是完整 Account** —— 只传跨进程需要的三个字段） */
export interface PayloadAccount {
  id: string;
  name: string;
  /** 缺省 `'persist:doubao'`（原实现如此） */
  partition?: string | null;
}

/** 跨进程报文的公共外形（`apiVersion: '1.0'`） */
export interface SendPayload<C extends Record<string, unknown>> {
  apiVersion: '1.0';
  action: 'account_node_send';
  /** ISO 8601（由外部注入的时间生成） */
  timestamp: string;
  account: { id: string; name: string; partition: string };
  content: C & {
    text: string;
    images: unknown[];
    texts: unknown[];
    params: Record<string, unknown>;
    /** ⚠️ 图片/视频报文恒为 `true`；账号节点报文由调用方决定（原 `$L` 的 `s`） */
    autoSend: boolean;
  };
  source: SendSource;
  sourceNodeId: string | null;
  /** 图片/视频报文恒为 `true`；账号节点报文由调用方决定 */
  autoSend: boolean;
}

const DEFAULT_PARTITION = 'persist:doubao';

function accountOf(a: PayloadAccount): { id: string; name: string; partition: string } {
  return { id: a.id, name: a.name, partition: a.partition || DEFAULT_PARTITION };
}

/** 图片报文（原 `PL`） */
export function buildImagePayload(input: {
  account: PayloadAccount;
  text?: unknown;
  stylePrefix?: unknown;
  ratio?: unknown;
  count?: unknown;
  model?: unknown;
  resolution?: unknown;
  images?: unknown[];
  sourceNodeId?: string | null;
  now: number;
}): SendPayload<{ imageParams: { count: number; model: string | null; resolution: string | null } }> {
  const text = composeImagePrompt({
    text: input.text,
    stylePrefix: input.stylePrefix,
    ratio: input.ratio,
    count: input.count,
    model: input.model,
    resolution: input.resolution,
  });

  // 与 `PL` 一致：把已夹取的参数**再回填**到 imageParams（供后端读，不重新解析正文）
  const count = Math.max(1, Math.min(4, (Number(input.count) | 0) || 1));
  const model = String(input.model ?? '').trim();
  const resolution = /^(1K|2K|4K)$/.test(String(input.resolution ?? '').trim())
    ? String(input.resolution).trim()
    : '';

  return {
    apiVersion: '1.0',
    action: 'account_node_send',
    timestamp: new Date(input.now).toISOString(),
    account: accountOf(input.account),
    content: {
      text,
      images: Array.isArray(input.images) ? input.images : [],
      texts: [],
      params: {},
      imageParams: { count, model: model || null, resolution: resolution || null },
      autoSend: true,
    },
    source: 'canvas-image-gen',
    sourceNodeId: input.sourceNodeId ?? null,
    autoSend: true,
  };
}

/** 视频报文（原 `TL`） */
export function buildVideoPayload(input: {
  account: PayloadAccount;
  text?: unknown;
  model?: unknown;
  duration?: unknown;
  ratio?: unknown;
  images?: unknown[];
  sourceNodeId?: string | null;
  stylePrefix?: unknown;
  now: number;
}): SendPayload<{ genParams: { duration: number | null; model: string | null } }> {
  const text = composeVideoPrompt({
    text: input.text,
    model: input.model,
    duration: input.duration,
    ratio: input.ratio,
    stylePrefix: input.stylePrefix,
  });

  const duration = Number(input.duration);
  const model = String(input.model ?? '');

  return {
    apiVersion: '1.0',
    action: 'account_node_send',
    timestamp: new Date(input.now).toISOString(),
    account: accountOf(input.account),
    content: {
      text,
      images: Array.isArray(input.images) ? input.images : [],
      texts: [],
      params: {},
      // 原 `TL`：`Number(r) || null`（0/NaN → null）
      genParams: { duration: duration || null, model: model || null },
      autoSend: true,
    },
    source: 'canvas-text-node',
    sourceNodeId: input.sourceNodeId ?? null,
    autoSend: true,
  };
}

/** 账号节点报文（原 `$L`）—— 多段文案换行合并；无文案时用兜底句 */
export function buildAccountNodePayload(input: {
  account: PayloadAccount;
  /** 已解析（`@` 引用已替换）的文案段 */
  texts?: string[];
  images?: unknown[];
  params?: Record<string, unknown>;
  autoSend?: boolean;
  sourceNodeId?: string | null;
  now: number;
}): SendPayload<Record<string, unknown>> {
  const texts = (input.texts ?? []).map((t) => String(t ?? '').trim()).filter(Boolean);
  const images = Array.isArray(input.images) ? input.images : [];

  // 原 `$L`：无文案 → `请参考以下 N 张素材图片进行创作。`
  const text = texts.length > 0 ? texts.join('\n') : `请参考以下 ${images.length} 张素材图片进行创作。`;

  return {
    apiVersion: '1.0',
    action: 'account_node_send',
    timestamp: new Date(input.now).toISOString(),
    account: accountOf(input.account),
    content: {
      text,
      images,
      texts,
      params: input.params ?? {},
      autoSend: input.autoSend !== false,
    },
    source: 'canvas-account-node',
    sourceNodeId: input.sourceNodeId ?? null,
    autoSend: input.autoSend !== false,
  };
}
