/**
 * 发送队列的**结果结算**（★ 纯函数，必测）—— 原 `TS` 的**执行半** 42195-42285
 *
 * ★★ **它回答的是"这一次发送跑完之后，那一项要变成什么"**：
 *   ① **丢弃**（代次变了 / 已被取消）—— 不回写状态，只释放占用；
 *   ② **成功** —— 写 `success` + 记**指纹**（供防重复）；
 *   ③ **放弃** —— 写 `failed` + 把分类标签前缀到原因上；
 *   ④ **等重试** —— 写回 `waiting` + **指数退避** `notBefore = now + 2000 × 第几次` + **换号时把它加进排除表（最多留 3 个）**。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 代次闸 | 42203-42209 | 派发时记的 `y = Tp` 与当前 `Tp` 不同 ⇒ **丢弃**（队列被重置过，这次结果已无意义） |
 *   | 取消闸 | 42210-42216 | 该项**当前**已是 `cancelled` ⇒ 丢弃 |
 *   | 成功回写 | 42220-42235 | 四个字段取 `结果 \|\| 原值`，**`notBefore` 清空**；成功后**记指纹** |
 *   | 判据 `C` | 42219 | 有异常 ⇒ `x.message \|\| '发送异常'`；否则 ⇒ `结果.note \|\| 结果.reason \|\| '发送失败'` |
 *   | 放弃 | 42243-42260 | `note`：**标签与原因相同时不重复前缀**；释放两个账号（自己 + 结果里的另一个） |
 *   | 重试 | 42261-42284 | 退避、排除表 `slice(-3)`、`order` 换新；同样释放 |
 *
 * ⚠️ **决策本身不在这里**：`decideFailAction`（原 `g3`）**早已落地**（`core/rules/failure.ts`，
 *   连同 `classifyFailure` 与原 `f3`/`p3`/`h3` 三张表）⇒ 本模块只负责**把它翻成"那一项的新字段"**。
 * ⚠️ **时间注入**：源版内联 `Date.now()`（原则 4 违规）⇒ 这里收 `now`。
 */

import { SEND_QUEUE_TEXT } from '@/constants/text';
import { FAILURE_MAX_RETRY } from '@/constants';
import { decideFailAction } from './failure';
import type { QueueItem } from './sendQueuePlan';
import type { QueueItemPatch } from './sendQueueOps';

/** 重试退避的基数（ms）—— 原 `S3` 41832 的 `2000` */
export const RETRY_BACKOFF_BASE_MS = 2000;
/** 换号重试时"别再给我这个号"的排除表**上限**（原 42263 的 `slice(-3)`） */
export const EXCLUDE_KEEP = 3;

/** 一次发送的结果（原 `sendOne` 的返回里本模块用到的部分） */
export interface SendOutcomeLike {
  ok?: boolean;
  /** ⚠️ 允许 `null` —— `SendOneResult`（`sendOneNode` 的返回）就是 `string \| null` */
  accountId?: string | null;
  accountName?: string;
  note?: string;
  reason?: string;
}

/** 结算计划 */
export interface SettlementPlan {
  /** `discard` ⇒ **什么都不写**（只释放占用）；其余三种各有 patch */
  action: 'discard' | 'success' | 'failed' | 'retry';
  /** 要写进该项的字段（`discard` 时为空对象） */
  patch: QueueItemPatch;
  /** 要释放的账号（**可能两个**：本次用的 + 结果里另一个） */
  releaseAccountIds: string[];
  /** `success` 时**要记指纹**（原 42229-42235） */
  recordFingerprint: boolean;
}

/**
 * 结算一项（原 `TS` 42203-42285）
 *
 * @param item 派发时的那份快照（`v`）
 * @param outcome `sendOne` 的返回（`null` 表示抛异常前的空值）
 * @param error 抛出的异常（有它 ⇒ 判据取 `error.message`）
 * @param generation 派发时的代次（`y`）
 * @param currentGeneration 当前代次（`Tp`）
 * @param isCancelled 该项**当前**是否已被取消（原 `f(v.id)`）
 */
export function planQueueSettlement(input: {
  item: QueueItem;
  outcome: SendOutcomeLike | null;
  error?: { message?: string } | null;
  now: number;
  generation: number;
  currentGeneration: number;
  isCancelled: boolean;
  maxRetry?: number;
}): SettlementPlan {
  const { item: v, outcome: b, error: x, now } = input;
  const used = v.accountId || null;

  /** 两种丢弃共用的释放（原 42204-42207 / 42211-42214） */
  const discard = (): SettlementPlan => ({
    action: 'discard',
    patch: {},
    releaseAccountIds: used ? [used] : [],
    recordFingerprint: false,
  });

  // ① 代次闸 / ② 取消闸
  if (input.generation !== input.currentGeneration) return discard();
  if (input.isCancelled) return discard();

  // 判据（原 42219）
  const reason = x
    ? x.message || SEND_QUEUE_TEXT.settle.exception
    : (b && (b.note || b.reason)) || SEND_QUEUE_TEXT.settle.failed;

  const resultAccount = b?.accountId || used;

  if (b && b.ok) {
    return {
      action: 'success',
      patch: {
        status: 'success',
        finishedAt: now,
        accountId: b.accountId || v.accountId,
        accountName: b.accountName || v.accountName,
        note: b.note || '',
        notBefore: null,
      },
      releaseAccountIds: used ? [used] : [],
      recordFingerprint: true,
    };
  }

  // ③/④ 失败 ⇒ 交给已落的决策件（原 `g3`）
  const attempt = (v.attempt || 0) + 1;
  const maxRetry = input.maxRetry ?? FAILURE_MAX_RETRY;
  const decision = decideFailAction(reason, attempt, maxRetry);

  /** 两个账号都要释放：本次用的 + 结果里那个（不同才加）—— 原 42252-42260 */
  const release = (): string[] => {
    const ids = used ? [used] : [];
    if (resultAccount && resultAccount !== used) ids.push(resultAccount);
    return ids;
  };

  if (decision.action === 'give-up') {
    return {
      action: 'failed',
      patch: {
        status: 'failed',
        finishedAt: now,
        accountId: resultAccount || v.accountId,
        accountName: b?.accountName || v.accountName,
        // ⚠️ 标签与原因**相同**时不重复前缀（原 42249）
        note: decision.label === reason ? reason : SEND_QUEUE_TEXT.settle.labelPrefix(decision.label, reason),
        notBefore: null,
      },
      releaseAccountIds: release(),
      recordFingerprint: false,
    };
  }

  // 换号重试：把结果里的那个账号记进排除表
  const switching = decision.action === 'retry-switch' && !!resultAccount;
  const exclude = switching
    ? [...(v.excludeAccountIds || []), resultAccount].slice(-EXCLUDE_KEEP)
    : v.excludeAccountIds || [];

  return {
    action: 'retry',
    patch: {
      status: 'waiting',
      startedAt: null,
      finishedAt: null,
      accountId: switching ? null : v.accountId,
      accountName: switching ? '' : v.accountName,
      excludeAccountIds: exclude,
      note: SEND_QUEUE_TEXT.settle.retryNote(decision.label, attempt, maxRetry),
      order: now,
      // ★ 退避：`2000 × 第几次`（原 42273）
      notBefore: now + RETRY_BACKOFF_BASE_MS * attempt,
    },
    releaseAccountIds: release(),
    recordFingerprint: false,
  };
}
