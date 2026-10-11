/**
 * usecase · 批量发送队列（原 `x3` shared.js:41615-41822）与**单节点发送**（原 `PS` 42354-42447）
 *
 * ★ **为什么两个一起落**：`docs/16` §1.6 把两者归到 `sendQueue.ts`；它们共用同一套
 *   「准备（`jS`）→ 传输（`Bu`）→ 失败释放占用 → 写节点发送态」骨架。
 *
 * ⚠️ **为什么没把两者抽成一个函数（判据 C1 的例外，有意）**：逐行比对后差异是**行为**不是风格 ——
 *   · `PS` 先写 `排队发送中…`、会写 `recipe`（`setNodeRecipe`）、成功后有 toast、
 *     返回**富结果**（`{ok, reason, note, accountId, accountName}`）；
 *   · `x3` 有 `onProgress` 分流、**防重复发送**守卫、`no-account` → 决策、失败 → 决策。
 *   抽成一个函数需要 5 个行为开关 ⇒ 比保留两份更难读。**两份都逐字对齐源版**。
 *
 * ⚠️ 原则 1：本文件**不写 store** —— 节点发送态 / recipe / 占用释放全走**注入回调**
 *   （`setState` / `setRecipe` / `releaseAccount`），`set()` 发生在 `state/**`。
 * ⚠️ `prepare`（原 `jS`）与 `transport`（原 `Bu`）都**注入** —— 源版 `x3` 的 `sendFn`
 *   本来就是参数（`sendFn: o`，默认 `Bu`）。
 */

import type { CanvasNode } from '@/stable/model/node';
import type { Account } from '@/stable/model/account';
import { err, ok, type Result } from '@/core/model/result';
import { classifyFailure } from '@/core/rules/failure';
import { orderBatchTargetsOf, type BatchTarget } from '@/core/rules/batchTargets';
import { BATCH_TEXT } from '@/constants/text';

// ─────────────────────────── 注入的函数契约（对应源 `jS` / `Bu`）───────────────────────────

/** 单节点「准备发送」的产物（原 `jS` 返回的 `{account, operation, recipe}`） */
export interface PreparedSend {
  account: Account;
  /** 待发送的报文（**不透明** —— 组装细节各站点自己知道） */
  operation: unknown;
  /** 要写进节点的 recipe（原 `recipe`；`PS` 会 `setNodeRecipe`） */
  recipe?: unknown;
}

export interface PrepareSendOptions {
  /** 排除这些账号（源 `x3` 没传；`PS` 传 `excludeAccountIds`） */
  excludeAccountIds?: readonly string[];
  /** 强制指定账号（源 `PS` 传 `accountId`） */
  forceAccountId?: string | null;
}

/**
 * 准备一次发送（原 `jS` 41229）
 * ⚠️ **失败时 `reason` 就是源版的 `stage`**（`x3` 要拿它判 `'no-account'`）
 */
export type PrepareSendFn = (nodeId: string, opts: PrepareSendOptions) => Result<PreparedSend>;

/** 传输结果（原 `Bu` 的返回里我们只关心这几个字段） */
export interface TransportOutcome {
  ok: boolean;
  reason?: string;
  note?: string;
  /** 幂等键（源 `Bu` 用它避免重复会话） */
  sessionId?: string;
}

/** 传输进度（源 `Bu` 的 `onProgress` 事件：`{type:'success'|'error'|...}`） */
export interface TransportProgress {
  type: string;
  note?: string;
}

/** 把报文发出去（原 `Bu` 40411：可重试的传输壳） */
export type TransportFn = (
  operation: unknown,
  opts?: { onProgress?: (e: TransportProgress) => void },
) => Promise<Result<TransportOutcome>>;

// ─────────────────────────── 节点发送态（原 `setNodeSendState` 的形状）───────────────────────────

export const BATCH_ITEM_STATUSES = ['waiting', 'sending', 'success', 'error', 'skipped'] as const;
export type BatchItemStatus = (typeof BATCH_ITEM_STATUSES)[number];

export interface NodeSendState {
  nodeId: string;
  status: BatchItemStatus;
  msg: string;
  accountId?: string;
  accountName?: string;
}

/** 批量进度回调（原 `onNodeState`）—— 比 `NodeSendState` 多 `name/index/total` */
export interface BatchNodeState extends NodeSendState {
  name: string;
  index: number;
  total: number;
}

/** 决策请求（原 `onDecision({nodeId,name,msg,remaining})`） */
export interface BatchDecision {
  nodeId: string;
  name: string;
  msg: string;
  /** 后面还剩几个（源版 `h - x`） */
  remaining: number;
}

/** 决策回答：`'abort'` ⇒ **闩住**（后续节点全 `skipped`）；其余值继续 */
export type BatchDecisionAnswer = 'abort' | string;

export interface BatchCallbacks {
  onNodeState?: (e: BatchNodeState) => void;
  onDecision?: (e: BatchDecision) => Promise<BatchDecisionAnswer> | BatchDecisionAnswer;
  shouldAbort?: () => boolean;
  onSummary?: (s: BatchSummary) => void;
}

export interface BatchResultItem {
  nodeId: string;
  name: string;
  status: BatchItemStatus;
  msg: string;
  accountId?: string;
  accountName?: string;
}

export interface BatchSummary {
  results: BatchResultItem[];
  total: number;
  aborted: boolean;
}

export interface RunBatchSendInput {
  /** 要发的节点 id（源 `nodeIds`） */
  nodeIds: readonly string[];
  /** 画布节点（只读）—— 用 `orderBatchTargetsOf` 定**视觉顺序** */
  nodes: readonly CanvasNode[];
  /** 该节点当前是否已在发送中（源 `nodeSendStates[id].status === 'sending'`） */
  isSending: (nodeId: string) => boolean;
  /** 注入：准备（原 `jS`） */
  prepare: PrepareSendFn;
  /** 注入：传输（原 `Bu`） */
  transport: TransportFn;
  /** 释放账号占用（原 `releaseAccountBusy`） */
  releaseAccount: (accountId: string) => void;
}

/**
 * 批量互斥闩（原模块级 `ec` + `w3()`）
 *
 * ⚠️ 这是**刻意的模块级状态**（源版就是模块级 `let ec = false`）——
 *    它不是"业务状态"（不进 store），而是"同一个进程里只允许一个批量在跑"的进程级闩。
 */
let batchRunning = false;

/** 是否有批量正在跑（原 `w3` 41612） */
export function isBatchSendRunning(): boolean {
  return batchRunning;
}

type Answer = { kind: 'abort' } | { kind: 'continue' };

/** 统一处理决策回调（原版是 `(await n(p)) === 'abort'` 逐处内联） */
async function askDecision(
  cb: BatchCallbacks,
  d: BatchDecision,
): Promise<Answer> {
  if (!cb.onDecision) return { kind: 'continue' };
  const a = await cb.onDecision(d);
  return a === 'abort' ? { kind: 'abort' } : { kind: 'continue' };
}

/**
 * 批量发送（原 `x3` 41615）
 *
 * 逐节点流程（**顺序即语义**）：
 *   ① 互斥闩被占 ⇒ `err('busy', BATCH_TEXT.busy)`
 *   ② 取 `text`/`genvideo` 且**在 `nodeIds` 里**的节点，按**视觉顺序**排；
 *      `nodeIds` 里但画布上已没有的 ⇒ 收尾时记 `skipped '节点已不存在'`
 *   ③ 逐个：
 *      · 已闩（前面的决策答了 abort）或 `shouldAbort()` ⇒ `skipped '已中止，未发送'`（**不发送**）
 *      · 该节点已在发送中 ⇒ `error '该节点正在发送中，已跳过（防止重复发送）'`
 *      · `waiting '等待中'` → `prepare`
 *      · 准备失败 ⇒ `error`；若 `reason === 'no-account'` ⇒ **问决策**（答 abort ⇒ 闩住）
 *      · 成功 ⇒ `sending '正在发送至 X…'` → `transport(op, {onProgress})`
 *        - `ok` ⇒ `success '已发送至 X'`
 *        - `reason === 'busy'` ⇒ 释放占用 + `error '正在发送中，请稍候再试'`
 *        - 其余 ⇒ 释放占用 + `error (note || reason || '发送失败')`
 *        - 抛出 ⇒ 释放占用 + `error (message || '发送异常')`
 *      · 写节点态 → 收进结果 → 通知
 *      · 若 `error` ⇒ **问决策**（消息按 `classifyFailure` 加标签，`unknown` 不加）
 *   ④ 汇总 → `onSummary` → 返回 `{results,total,aborted}`
 *   ★ `finally` 释放互斥闩（**任何路径都不能把闩留住**）
 */
export async function runBatchSend(
  input: RunBatchSendInput,
  cb: BatchCallbacks = {},
): Promise<Result<BatchSummary>> {
  // ① 互斥（原 41624-41630）
  if (batchRunning) return err('busy', BATCH_TEXT.busy);

  batchRunning = true;
  const results: BatchResultItem[] = [];
  try {
    const wanted = new Set(input.nodeIds ?? []);
    const ordered: BatchTarget[] = orderBatchTargetsOf(input.nodes).filter((t) => wanted.has(t.nodeId));
    const missing = [...wanted].filter((id) => !ordered.some((t) => t.nodeId === id));
    const total = ordered.length;
    let aborted = false;

    const notify = (
      target: BatchTarget,
      index: number,
      patch: Pick<NodeSendState, 'status' | 'msg'> & Partial<Pick<NodeSendState, 'accountId' | 'accountName'>>,
    ): void => {
      cb.onNodeState?.({ nodeId: target.nodeId, name: target.name, index, total, ...patch });
    };

    for (let i = 0; i < ordered.length; i += 1) {
      const target = ordered[i] as BatchTarget;
      const index = i + 1;

      // ③·1 已闩 / 外部要求中止（原 41662-41675）—— `skipped` 也算进结果
      if (aborted || cb.shouldAbort?.()) {
        aborted = true;
        results.push({ nodeId: target.nodeId, name: target.name, status: 'skipped', msg: BATCH_TEXT.abortedSkipped });
        notify(target, index, { status: 'skipped', msg: BATCH_TEXT.abortedSkipped });
        continue;
      }

      // ③·2 防重复发送（原 41676-41690）
      if (input.isSending(target.nodeId)) {
        results.push({ nodeId: target.nodeId, name: target.name, status: 'error', msg: BATCH_TEXT.alreadySending });
        notify(target, index, { status: 'error', msg: BATCH_TEXT.alreadySending });
        continue;
      }

      notify(target, index, { status: 'waiting', msg: BATCH_TEXT.waiting });

      // ③·3 准备（原 41695-41716）
      const prepared = input.prepare(target.nodeId, {});
      if (!prepared.ok) {
        results.push({ nodeId: target.nodeId, name: target.name, status: 'error', msg: prepared.message });
        notify(target, index, { status: 'error', msg: prepared.message });
        // ⚠️ 只有 `no-account` 才问决策（源版就是这个判据）
        if (prepared.reason === 'no-account' && cb.onDecision) {
          const a = await askDecision(cb, {
            nodeId: target.nodeId,
            name: target.name,
            msg: prepared.message,
            remaining: total - index,
          });
          if (a.kind === 'abort') aborted = true;
        }
        continue;
      }
      const { account, operation } = prepared.value;

      notify(target, index, {
        status: 'sending',
        msg: BATCH_TEXT.sendingTo(account.name),
        accountName: account.name,
      });

      // ③·4 传输（原 41726-41773）
      let status: BatchItemStatus;
      let msg: string;
      try {
        const sent = await input.transport(operation, {
          onProgress: (e) => {
            if (e.type === 'success') {
              notify(target, index, { status: 'success', msg: BATCH_TEXT.sentTo(account.name), accountName: account.name });
            } else if (e.type === 'error') {
              notify(target, index, { status: 'error', msg: e.note || BATCH_TEXT.sendFailed, accountName: account.name });
            }
          },
        });
        if (sent.ok && sent.value.ok) {
          status = 'success';
          msg = BATCH_TEXT.sentTo(account.name);
        } else if (sent.ok && sent.value.reason === 'busy') {
          input.releaseAccount(account.id);
          status = 'error';
          msg = BATCH_TEXT.sendBusyRetry;
        } else {
          input.releaseAccount(account.id);
          status = 'error';
          msg = (sent.ok ? sent.value.note || sent.value.reason : sent.message) || BATCH_TEXT.sendFailed;
        }
      } catch (e: unknown) {
        // 源版把 `Bu` 也包在 try 里（虽然 `Bu` 自己吞）—— 保持同样的兜底
        input.releaseAccount(account.id);
        status = 'error';
        msg = e instanceof Error ? e.message : BATCH_TEXT.sendException;
      }

      // ③·5 写节点态 + 收结果（原 41774-41785）
      notify(target, index, {
        status,
        msg,
        accountId: account.id,
        accountName: account.name,
      });
      results.push({
        nodeId: target.nodeId,
        name: target.name,
        status,
        msg,
        accountId: account.id,
        accountName: account.name,
      });

      // ③·6 失败 ⇒ 决策（原 41786-41797）
      if (status === 'error' && cb.onDecision) {
        const info = classifyFailure(msg);
        const text = info.kind !== 'unknown' ? BATCH_TEXT.withLabel(info.label, msg) : msg;
        const a = await askDecision(cb, {
          nodeId: target.nodeId,
          name: target.name,
          msg: text,
          remaining: total - index,
        });
        if (a.kind === 'abort') aborted = true;
      }
    }

    // ④ 画布上已消失的 nodeIds（原 41799-41806）
    for (const id of missing) {
      results.push({ nodeId: id, name: id, status: 'skipped', msg: BATCH_TEXT.nodeMissing });
    }

    const summary: BatchSummary = { results, total: results.length, aborted };
    cb.onSummary?.(summary);
    return ok(summary);
  } finally {
    // ★ 任何路径都要放闩（原 41819-41821）
    batchRunning = false;
  }
}

// ─────────────────────────── 单节点发送（原 `PS` 42354）───────────────────────────

export interface SendOneInput {
  nodeId: string;
  /** 排除这些账号（源 `PS` 的 `excludeAccountIds`） */
  excludeAccountIds?: readonly string[];
  /** 强制指定账号（源 `PS` 的 `accountId`） */
  forceAccountId?: string | null;
  prepare: PrepareSendFn;
  transport: TransportFn;
  releaseAccount: (accountId: string) => void;
  /** 写节点发送态（原 `setNodeSendState`）；`PS` 每步都写 */
  setState: (e: NodeSendState) => void;
  /** 写 recipe（原 `setNodeRecipe`）；不给就跳过 */
  setRecipe?: (nodeId: string, recipe: unknown) => void;
  /** 成功后要不要 toast（源 `PS` 会） */
  onSent?: (account: Account) => void;
}

/** 单节点发送的结果（源 `PS` 的返回形状） */
export interface SendOneResult {
  ok: boolean;
  reason?: string;
  note?: string;
  accountId: string | null;
  accountName?: string;
}

/**
 * 发一个节点（原 `PS` 42354）—— 供**队列**逐条调用
 *
 * ⚠️ 与 `runBatchSend` 的三处差异（**照抄，不统一**）：
 *   ① 先写一次 `排队发送中…`
 *   ② 准备成功后写 `recipe`
 *   ③ 成功后有 `onSent`（源版是 toast）；失败**总是**释放占用
 */
export async function sendOneNode(input: SendOneInput): Promise<SendOneResult> {
  const { nodeId } = input;

  input.setState({ nodeId, status: 'sending', msg: BATCH_TEXT.queueing });

  const prepared = input.prepare(nodeId, {
    excludeAccountIds: input.excludeAccountIds,
    forceAccountId: input.forceAccountId ?? null,
  });
  if (!prepared.ok) {
    input.setState({
      nodeId,
      status: 'error',
      msg: prepared.message || prepared.reason || BATCH_TEXT.sendFailed,
    });
    return {
      ok: false,
      reason: prepared.reason,
      note: prepared.message,
      accountId: input.forceAccountId ?? null,
    };
  }

  const { account, operation, recipe } = prepared.value;
  if (recipe !== undefined) input.setRecipe?.(nodeId, recipe);

  input.setState({
    nodeId,
    status: 'sending',
    msg: BATCH_TEXT.sendingTo(account.name),
    accountId: account.id,
    accountName: account.name,
  });

  let sent: Result<TransportOutcome>;
  try {
    sent = await input.transport(operation);
  } catch (e: unknown) {
    input.releaseAccount(account.id);
    const msg = e instanceof Error ? e.message : BATCH_TEXT.sendException;
    input.setState({ nodeId, status: 'error', msg });
    return { ok: false, reason: 'exception', note: msg, accountId: account.id, accountName: account.name };
  }

  const success = sent.ok && sent.value.ok;
  if (success) {
    input.setState({
      nodeId,
      status: 'success',
      msg: BATCH_TEXT.sentTo(account.name),
      accountId: account.id,
      accountName: account.name,
    });
    input.onSent?.(account);
  } else {
    input.releaseAccount(account.id);
    const note = (sent.ok ? sent.value.note || sent.value.reason : sent.message) || BATCH_TEXT.sendFailed;
    input.setState({ nodeId, status: 'error', msg: note });
  }

  return {
    ok: success,
    reason: sent.ok ? sent.value.reason : sent.reason,
    note: sent.ok ? sent.value.note || sent.value.reason : sent.message,
    accountId: account.id,
    accountName: account.name,
  };
}
