/**
 * 发送队列的**分发决策**（★ 纯函数，必测）—— 原 `TS`（42078+）的调度半
 *
 * ★★ **它是队列的"谁先跑、用哪个账号"那一步** —— 源版把它写在 `ls()` 这个闭包里
 *   （一边判一边 `wr()` 改 store），本实现把它提成**一次性的纯决策**：
 *   输入快照 → 输出「要派发的项」+「要回写的等待原因」，由 `state` 落地。
 *
 * 依据（**逐行回源**，`TS` 的 `ls()` 42090-42180）：
 *   | 步 | 源 | 语义 |
 *   |---|---|---|
 *   | 并发基线 | 42093 | `concurrency` 参数 ⇒ store 的 `accountConcurrency` ⇒ `1` |
 *   | 在跑计数 | 42096-42102 | `status === 'sending'` 的项**按 `accountId` 计数**（没有账号的记 `'__unknown__'`） |
 *   | 候选 | 42109-42113 | `waiting` 且 **`notBefore` 已到**（或为空），按 **`order` 升序** |
 *   | 暂停闩 | 42115-42117 | 一旦置位 ⇒ **立刻 `break`**（不是 `continue` —— 后面的项一个都不跑） |
 *   | 固定账号 | 42127-42154 | 不存在/未登录 ⇒ 写 note 跳过；正忙 ⇒ 写 note 跳过；否则用它 |
 *   | 池分配 | 42155-42169 | 交给注入的"挑一个空闲账号"；挑不到 ⇒ 按**有无 scope**（`groupId`/`type`）写**四种之一**的 note |
 *   | 试占用 | 42174-42179 | 拿不到占用 ⇒ 跳过（**不写 note**） |
 *   | 已分配账号的并发 | 42120-42123 | 该项**已有** `accountId` 时若该账号已达上限 ⇒ 跳过 |
 *
 * ⚠️ **两处依赖被显式注入**（原则 1/4）：
 *   · `modeOf`（原 `$3`）—— 已落的 `resolveSendMode` 由调用方接上；
 *   · `pickAuto`（原 `Ei`）—— "从池里挑一个空闲账号"是**另一套子系统**（账号池/占用表），
 *     本模块只**要求**它返回 `{accountId,name}` 或 `{reason}` 或 `null`。
 * ⚠️ **`reserve` 是纯谓词而不是副作用**：源版 `Fi()` 会**当场占住**该账号；
 *   本实现先问"能不能占"、由调用方在拿到决策后**逐个**落地。
 *   并发上限**不因此失效** —— 本模块内部维护与源版同样的 `d[m]` 计数（42180）。
 * ⚠️ **时间注入**：源版内联 `Date.now()`（原则 4 违规）⇒ 这里收 `now`。
 */

import { SEND_QUEUE_TEXT } from '@/constants/text';
import type { QueueItem } from './sendQueuePlan';
// ⚠️ `QueueItemPatch` 住在 `sendQueueOps`（那边先定义的）
import type { QueueItemPatch, SendMode } from './sendQueueOps';

/** 池挑账号的结果（原 `Ei` 的返回形状里本模块用到的部分） */
export type PickAutoResult =
  | { accountId: string; name: string }
  | { reason: string }
  | null;

/** 一条派发决策 */
export interface DispatchDecision {
  itemId: string;
  accountId: string;
  accountName: string;
  /** 落到该项上的字段（原 42187-42192：`status:'sending'` + `startedAt` + **`attempt+1`** + 账号） */
  patch: QueueItemPatch;
  /** 该项**原来没有账号**、由本次池分配出来的（便于调用方记指纹等） */
  pickedFromPool: boolean;
}

/** 一条"等待原因"回写（原 `wr(id, {note})`） */
export interface DispatchNote {
  itemId: string;
  note: string;
}

export interface DispatchPlan {
  dispatch: DispatchDecision[];
  /** 只包含**原因变了**的项（源版每次都先比 `h.note !== S` 再写 —— 照抄） */
  notes: DispatchNote[];
  /** 是否因为暂停闩而提前中止 */
  paused: boolean;
}

/**
 * 规划一次派发（原 `TS` 的 `ls()` 42090-42192 的调度半）
 *
 * @param items 队列快照
 * @param now 当前时刻（**注入**）
 * @param concurrency 每账号并发上限（源版 `t` ⇒ store 的 `accountConcurrency` ⇒ `1`）
 * @param paused 暂停闩（原 `_i`）
 * @param reserve 试占用（原 `Fi`）—— `false` ⇒ 跳过该项且**不写 note**
 */
export function planQueueDispatch(input: {
  items: readonly QueueItem[];
  now: number;
  concurrency?: number;
  paused?: boolean;
  modeOf: (nodeId: string) => SendMode;
  /** 固定账号是否"已登录"（原 `(N.status || '已登录') !== '已登录'`） */
  isUsable?: (accountId: string) => boolean;
  /** 固定账号是否正忙（原 `N.id in accountBusy || Hk(N.id)`） */
  isBusy?: (accountId: string) => boolean;
  accountNameOf?: (accountId: string) => string;
  pickAuto: (opts: { groupId?: string; type?: string }, excludeAccountIds: readonly string[]) => PickAutoResult;
  reserve?: (accountId: string, itemId: string) => boolean;
}): DispatchPlan {
  const N = SEND_QUEUE_TEXT.dispatchNotes;
  const limit = Number.isFinite(Number(input.concurrency)) && Number(input.concurrency) > 0
    ? Number(input.concurrency)
    : 1;

  // 在跑计数（原 42096-42102）
  const running: Record<string, number> = {};
  for (const h of input.items) {
    if (h.status === 'sending') {
      const key = h.accountId || '__unknown__';
      running[key] = (running[key] || 0) + 1;
    }
  }

  // 候选：waiting 且 notBefore 已到，按 order 升序（原 42109-42113）
  const candidates = input.items
    .filter((h) => h.status === 'waiting' && (!h.notBefore || h.notBefore <= input.now))
    .slice()
    .sort((a, b) => a.order - b.order);

  const dispatch: DispatchDecision[] = [];
  const notes: DispatchNote[] = [];
  /** 只写"变了"的原因（原版每次都先比 `h.note !== S`） */
  const noteFor = (item: QueueItem, note: string): void => {
    if (item.note !== note) notes.push({ itemId: item.id, note });
  };

  let paused = false;
  for (const h of candidates) {
    if (input.paused) {
      // ⚠️ 源版是 **break** 不是 continue（42115-42117）
      paused = true;
      break;
    }

    let accountId = h.accountId || null;
    let accountName = h.accountName || '';
    let pickedFromPool = false;

    if (accountId) {
      // 该项已绑定过账号 ⇒ 只看并发（原 42120-42123）
      if ((running[accountId] || 0) >= limit) continue;
    } else {
      const mode = input.modeOf(h.nodeId);
      if (mode.mode === 'fixed') {
        const usable = input.isUsable ? input.isUsable(mode.accountId) : true;
        if (!usable) {
          noteFor(h, N.fixedUnavailable);
          continue;
        }
        if (input.isBusy && input.isBusy(mode.accountId)) {
          noteFor(h, N.fixedBusy);
          continue;
        }
        accountId = mode.accountId;
        accountName = input.accountNameOf ? input.accountNameOf(mode.accountId) : '';
      } else {
        const picked = input.pickAuto(mode.opts, h.excludeAccountIds);
        if (!picked || !('accountId' in picked)) {
          const scoped = !!mode.opts.groupId || !!mode.opts.type;
          const noAccount = !!picked && 'reason' in picked && picked.reason === 'no-account';
          noteFor(
            h,
            noAccount
              ? scoped
                ? N.scopeNoAccount
                : N.poolNoAccount
              : scoped
                ? N.scopeAllBusy
                : N.poolAllBusy,
          );
          continue;
        }
        accountId = picked.accountId;
        accountName = picked.name;
        pickedFromPool = true;
        /**
         * ★★ **池分配后必须自己复查一次并发**（源版没有这行）—— 原因是本轮的一处设计差异：
         *   源版 `Fi(m, …)`（42174）**当场把该账号写进忙表**，于是**下一次 `Ei`（池分配）
         *   不会再挑到同一账号** ⇒ 源版靠那个**副作用**保证了"同账号不超并发"，故它不用复查。
         *   本实现的 `reserve` 是**纯谓词**（副作用由调用方事后落地）⇒ 那层隐含保护消失，
         *   必须显式复查，否则 `concurrency=1` 时**同一账号会被派两项**。
         *   ⚠️ 这是**单测抓出来的**（"并发上限默认 1"那条一开就红），不是我事先想到的。
         */
        if ((running[accountId] || 0) >= limit) continue;
      }
    }

    // 试占用（原 42174-42179）—— 拿不到 ⇒ **跳过且不写 note**
    if (input.reserve && !input.reserve(accountId, h.id)) continue;

    running[accountId] = (running[accountId] || 0) + 1;
    dispatch.push({
      itemId: h.id,
      accountId,
      accountName,
      // 原 42187-42192
      patch: {
        status: 'sending',
        startedAt: input.now,
        attempt: (h.attempt || 0) + 1,
        accountId,
        accountName,
      },
      pickedFromPool,
    });
  }

  return { dispatch, notes, paused };
}
