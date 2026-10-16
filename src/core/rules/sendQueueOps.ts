/**
 * 发送队列的**逐项操作**（★ 纯函数，必测）—— 原 `C3`(41930) / `E3`(41966) / `A3`(42011)
 * / `I3`(42016) / `$3`(42043)
 *
 * ★★ **这一层的共同形态**：每个操作**先判"能不能做"**，能做就返回**要写进那一项的新字段**
 *   （外加"要不要释放某账号的占用"），**不能做就返回 `null`** —— 于是调用方
 *   （`state`/面板）拿到的是一份**可判的意图**，而不是一堆"先查再改"的散落判断。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `planCancel` | `C3` 41930 | `waiting`/`sending` 可取消（**note 不同**），其余 ⇒ `null`；可取消时**要释放占用** |
 *   | `planRetry` | `E3` 41966 | `sending`/`waiting`/`success` **不可**重试；其余 ⇒ 重置为 `waiting` 且 **`attempt+1`** |
 *   | `clearFinishedQueue` | `A3` 42011 | ⚠️ 名字叫"清空"，实际是**只留 `waiting`/`sending`** |
 *   | `queueStats` | `I3` 42016 | `{total, waiting, sending, success, failed, cancelled}` |
 *   | `resolveSendMode` | `$3` 42043 | `sendAccount` 串 → `{mode:'auto'\|'fixed', …}` |
 *
 * ⚠️ **时间注入**：`planRetry` 里源版**内联 `Date.now()`**（原则 4 违规）⇒ 这里收 `now`。
 */

import type { QueueItem } from './sendQueuePlan';

/**
 * 要写进队列项的新字段（`planCancel`/`planRetry`/派发/结算的产物）
 * ⚠️ `status` 可选：**"丢弃"结算**返回的是**空 patch**（什么都不写），此时没有状态可言。
 */
export interface QueueItemPatch {
  status?: string;
  finishedAt?: number | null;
  startedAt?: number | null;
  note?: string;
  attempt?: number;
  accountId?: string | null;
  accountName?: string;
  order?: number;
  notBefore?: number | null;
  /** 换号重试时要更新的排除表（原 `excludeAccountIds`） */
  excludeAccountIds?: string[];
}

/** 一次操作的可执行意图 */
export interface QueueOpPlan {
  patch: QueueItemPatch;
  /** 非空 ⇒ 调用方**必须**去释放这个账号的占用（`itemId` 用队列项自己的 id） */
  releaseAccountId: string | null;
}

/**
 * 取消一项（原 `C3` 41930-41965）
 *
 * ⚠️ 与源逐字一致：
 *   · `waiting` ⇒ note **`已取消`**；`sending` ⇒ note **`已取消（发送中）`**（两句不同）
 *   · 两者都带 `finishedAt`
 *   · **有 `accountId` 才**返回 `releaseAccountId`（没分配过就没有占用可放）
 *   · 其余状态（`success`/`error`/`cancelled`…）⇒ **`null`（不可取消）**
 */
export function planCancel(item: QueueItem, now: number): QueueOpPlan | null {
  if (item.status !== 'waiting' && item.status !== 'sending') return null;
  return {
    patch: {
      status: 'cancelled',
      finishedAt: now,
      note: item.status === 'waiting' ? '已取消' : '已取消（发送中）',
    },
    releaseAccountId: item.accountId || null,
  };
}

/**
 * 重试一项（原 `E3` 41966-41992）
 *
 * ⚠️ 与源逐字一致：
 *   · **`sending` / `waiting` / `success` 都不可重试** ⇒ `null`（正在跑的不能重入、成功的不必重试）
 *   · 重置**九个字段**：`status:'waiting'`、**`attempt + 1`**、三个时刻清空、`note` 清空、
 *     账号清空、**`order` 换成新的 `now`**（⇒ 重试的项**排到队尾**）
 *   · 先**释放原账号占用**（如果分配过）
 */
export function planRetry(item: QueueItem, now: number): QueueOpPlan | null {
  if (item.status === 'sending' || item.status === 'waiting' || item.status === 'success') return null;
  return {
    patch: {
      status: 'waiting',
      attempt: (item.attempt || 0) + 1,
      startedAt: null,
      finishedAt: null,
      note: '',
      accountId: null,
      accountName: '',
      order: now,
      notBefore: null,
    },
    releaseAccountId: item.accountId || null,
  };
}

/**
 * 这一项是否**还在跑**（`waiting` / `sending`）
 *
 * ★ **唯一真源**：判"在跑"只此一处 —— 清空已完成（`clearFinishedQueue`）与
 *   队列面板的「进行中 / 已完成」分组都调它（别各自再写一遍 `=== 'waiting' || === 'sending'`）。
 * ⚠️ 判据出处：源版两处各写一遍字面量（`A3` 42011-42015 与 `z3.jsx:222` 的 `U`），语义相同。
 */
export function isActiveQueueStatus(status: string): boolean {
  return status === 'waiting' || status === 'sending';
}

/**
 * 清掉"已经结束"的项（原 `A3` 42011-42015）
 *
 * ⚠️ **函数名不叫"清空"**：源版 `A3` 看着像清空，实际是
 *   `filter(status === 'waiting' || status === 'sending')` ⇒ **保留在跑的**、删掉已结束的。
 *   （UI 上那个按钮大概写作"清空已完成"，故这里用 `clearFinishedQueue` 这个名字、
 *   而**注释里记下源版的名字**以免下次对不上。）
 */
export function clearFinishedQueue(items: readonly QueueItem[]): QueueItem[] {
  return items.filter((e) => isActiveQueueStatus(e.status));
}

/** 队列统计（原 `I3` 42016-42032） */
export interface QueueStats {
  total: number;
  waiting: number;
  sending: number;
  success: number;
  failed: number;
  cancelled: number;
}

/**
 * 统计各项数量（原 `I3`）
 *
 * ⚠️ 与源逐字一致：**只统计这五个具名档**（`if (t[n.status] != null)`）——
 *   于是 `error` 这类状态**不进任何档**（源版面板的"失败"档对应的是 `failed` 而非 `error`，
 *   而队列项的 `status` 用的是哪一套要看发送侧写的值）。`total` 是**全部项数**（含未归档的）。
 */
export function queueStats(items: readonly QueueItem[]): QueueStats {
  const s: QueueStats = { total: items.length, waiting: 0, sending: 0, success: 0, failed: 0, cancelled: 0 };
  // ⚠️ 只有这五个**具名档**会被计数（源版就是 `if (t[n.status] != null)`）
  const counted: readonly string[] = ['waiting', 'sending', 'success', 'failed', 'cancelled'];
  for (const it of items) {
    if (counted.includes(it.status)) s[it.status as (typeof counted)[number] as keyof QueueStats] += 1;
  }
  return s;
}

/** 账号分配模式（原 `$3` 的返回） */
export type SendMode =
  | { mode: 'auto'; opts: { groupId?: string; type?: string }; label: string }
  | { mode: 'fixed'; accountId: string; label: string };

/**
 * 把节点的 `sendAccount` 串解析成"分配模式"（原 `$3` 42043-42077）
 *
 * 四档（**逐字对齐**）：
 *   | `sendAccount` | 结果 |
 *   |---|---|
 *   | `auto:group:<gid>` | `{mode:'auto', opts:{groupId}, label:'所选分组'}` |
 *   | `auto:<type>` | `{mode:'auto', opts:{type}, label:'所选分组'}` |
 *   | 其它非 `auto` 串 | `{mode:'fixed', accountId, label:'所选账号'}` |
 *   | `auto`（或缺省） | `{mode:'auto', opts:{}, label:'账号池'}` |
 *
 * ⚠️ **源版的一处措辞不一致，照抄**：`auto:<type>` 那档的 `label` **也是「所选分组」**
 *   （它按类型选，说"分组"并不准）⇒ 本实现**原样保留**并在此注明 —— 改掉就是行为不等价。
 * ⚠️ 入参收**字符串**而不是节点：源版 `$3(nodeId)` 要先查节点，那是 `state` 的事。
 */

/**
 * `auto:group:` 与 `auto:<type>` 两档**共用**的 label（源版两处都写它 —— 见上方"措辞不一致"注：
 * `auto:<type>` 按类型选却说"分组"，**照源不改**）⇒ 一处声明，免得两处各写一份（`TD-16-149`）。
 */
const GROUP_MODE_LABEL = '所选分组';

export function resolveSendMode(sendAccount: unknown): SendMode {
  const n = typeof sendAccount === 'string' && sendAccount ? sendAccount : 'auto';
  if (n.startsWith('auto:group:')) {
    return { mode: 'auto', opts: { groupId: n.slice(11) }, label: GROUP_MODE_LABEL };
  }
  if (n.startsWith('auto:')) {
    return { mode: 'auto', opts: { type: n.slice(5) }, label: GROUP_MODE_LABEL };
  }
  if (n !== 'auto') {
    return { mode: 'fixed', accountId: n, label: '所选账号' };
  }
  return { mode: 'auto', opts: {}, label: '账号池' };
}

/**
 * 队列项是否"可以开始"（`notBefore` 未到 ⇒ 还不能跑）
 *
 * ⚠️ 这一条**源版没有单独的函数**（它在泵里内联判 `notBefore`）—— 本实现提出来是为了
 *   让泵的那部分也可测；语义与源一致：`notBefore == null` ⇒ 立即可跑。
 */
export function isReadyToStart(item: QueueItem, now: number): boolean {
  return item.status === 'waiting' && (item.notBefore == null || item.notBefore <= now);
}
