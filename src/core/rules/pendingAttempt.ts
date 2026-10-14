/**
 * 「待归属尝试」（`_pendingAttempt` / `_pendingAttempts`）—— **纯规则**
 *
 * 依据（**逐行回源抄录**，源 `_Component43.jsx` 的 `sendPayload`）：
 *   - 会话 id 提取 `N0` shared.js:36757-36767
 *   - 成功分支 `:2865-2913`（`edit` 快照 `$e` `:2883-2890` · 尝试 `:2891-2903` · 落点 `:2907-2913`）
 *   - 失败分支 `:2921-2942`
 *
 * ★ **它是什么**：一次发送成功后，把「这条消息属于哪个账号 / 哪次会话 / 提交了什么」记在
 *   **节点**上；出片（CDP 视频回流 / 拉取结果）时由 `state/videoLanding` 取出来当 `genHistory` 的
 *   那一条尝试，取完清掉。⇒ **没有写入方 ⇒ CDP 落回来的视频永远没有出片记录、也没有配方**。
 *
 * ⚠️ 本文件**零 store 依赖**（纯决策）；落 store 由 `state/pendingAttempt.ts` 负责。
 * ⚠️ 原则 4：`id` / `at` 由调用方注入（源 `Fc` 自己取 `Date.now()`）。
 */

import { asRecord } from '@/lib/object';
import { makeGenAttempt, type GenAttemptInput } from './genHistory';

/** 提示词入库前的截断（原 `:2899` / `:2928` 的 `.slice(0, 2000)`） */
export const ATTEMPT_PROMPT_MAX = 2000;

/**
 * 账号名兜底（原 `:2869` 的 `tt ? 'dola' : '豆包'`；`tt` = 账号类型是 dola）
 *
 * ⚠️ **入参是站点类型，不是调用方算好的布尔**（2026-10-14 收口）：原签名收 `isDola: boolean`
 *    ⇒ `state` 那侧得写 `account?.type === 'dola'` —— **站点名判断跑到了 `state`**（不该在那里）。
 *    「账号类型的领域判断」本来就住 `core/rules`（红线边界见 `SitePort.autoWatch?` 的说明）
 *    ⇒ 判断收回本函数，调用方只**如实传类型**。
 */
export function accountNameFallback(type: string | undefined): string {
  return type === 'dola' ? 'dola' : '豆包';
}

/**
 * 会话 id 提取（原 `N0`，`shared.js:36757-36767`）
 *
 * ```js
 * if (!e) return null;
 * const t = String(e).match(/\/chat\/([A-Za-z0-9_-]+)/);
 * return t ? t[1] : null;
 * ```
 * ⚠️ 整个 href 上匹配（**不限 hostname**）—— 源如此，照抄。
 */
export function conversationIdFromUrl(url: unknown): string | null {
  if (!url) return null;
  const m = /\/chat\/([A-Za-z0-9_-]+)/.exec(String(url));
  return m ? (m[1] as string) : null;
}

/**
 * 成功分支的 `edit` 快照（原 `:2883-2890` 的 `$e`）
 *
 * ⚠️ 逐字对齐的四个兜底：`text` 空串 · 其余 `null` · `styleIds` 非数组 ⇒ `[]`（**拷贝**一份）。
 */
export function pendingAttemptEdit(nodeData: unknown): Record<string, unknown> {
  const d = asRecord(nodeData);
  return {
    text: (typeof d.text === 'string' ? d.text : '') || '',
    aspectRatio: d.aspectRatio || null,
    duration: d.duration || null,
    model: d.model || null,
    sendAccount: d.sendAccount || null,
    styleIds: Array.isArray(d.styleIds) ? [...d.styleIds] : [],
  };
}

/** 成功分支的 `params` 三元组（原 `:2894-2898` 的 `ye ? {model,duration,ratio} : null`） */
export function pendingAttemptParams(
  payloadParams: unknown,
): Record<string, unknown> | null {
  if (!payloadParams) return null;
  const p = asRecord(payloadParams);
  return { model: p.model, duration: p.duration, ratio: p.aspectRatio };
}

/** 提示词截断（原 `:2899` / `:2928`） */
export function attemptPromptOf(text: unknown): string {
  return (text ? String(text) : '').slice(0, ATTEMPT_PROMPT_MAX);
}

export interface PendingAttemptInput {
  /** 原 `O$()`（本仓注入） */
  id: string;
  /** 原 `Date.now()`（本仓注入） */
  at: number;
  accountId: string;
  /** 原 `ie`（`account.name || (dola ? 'dola' : '豆包')`） */
  accountName: string;
  /** 原 `Q.text` */
  prompt: unknown;
  /** 原 `Q.params`（只有成功分支用） */
  payloadParams?: unknown;
  /** 原 `N0(webview.getURL())`（只有成功分支用） */
  conversationId?: string | null;
  /** 节点当前 `data`（取 `edit` 快照 —— 只有成功分支用） */
  nodeData?: unknown;
}

/**
 * **成功**那条尝试（原 `:2891-2903`）
 *
 * 形状差异（逐字对齐源）：成功带 `params` / `edit` / `conversationId`，`status:'pending'`、`note:''`。
 */
export function sentAttemptOf(input: PendingAttemptInput): Record<string, unknown> {
  const attempt: GenAttemptInput = {
    id: input.id,
    at: input.at,
    accountId: input.accountId,
    accountName: input.accountName,
    params: pendingAttemptParams(input.payloadParams),
    prompt: attemptPromptOf(input.prompt),
    edit: pendingAttemptEdit(input.nodeData),
    conversationId: input.conversationId ?? null,
    status: 'pending',
  };
  return makeGenAttempt(attempt);
}

/**
 * **失败**那条尝试（原 `:2925-2931`）
 *
 * ⚠️ 与成功那条**不是同一组字段**：失败**不带** `params` / `edit` / `conversationId`（源就没传）。
 */
export function failedAttemptOf(
  input: Omit<PendingAttemptInput, 'payloadParams' | 'conversationId' | 'nodeData'> & {
    /** 原 `ge.note || ge.reason || ''` */
    note: string;
  },
): Record<string, unknown> {
  const attempt: GenAttemptInput = {
    id: input.id,
    at: input.at,
    accountId: input.accountId,
    accountName: input.accountName,
    prompt: attemptPromptOf(input.prompt),
    status: 'failed',
    note: input.note,
  };
  return makeGenAttempt(attempt);
}

/**
 * 写进节点 `data` 的补丁（原 `:2907-2913` 成功 / `:2935-2941` 失败 —— 两处**逐字同形**）
 *
 * ```js
 * const Fe = (nodes.find(W => W.id === me) || {}).data || {};
 * updateNodeData(me, {
 *   _pendingAttempt: at,
 *   _pendingAttempts: { ...(Fe._pendingAttempts || {}), [ve]: at }
 * });
 * ```
 * ⚠️ **两个键恒写**（不因已有值而省略）；`_pendingAttempts` 是**按账号**分槽（同节点多账号各一条）。
 */
export function pendingAttemptPatch(
  nodeData: unknown,
  accountId: string,
  attempt: Record<string, unknown>,
): Record<string, unknown> {
  const d = asRecord(nodeData);
  const prev = asRecord(d._pendingAttempts);
  return {
    _pendingAttempt: attempt,
    _pendingAttempts: { ...prev, [accountId]: attempt },
  };
}
