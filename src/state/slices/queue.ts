/**
 * 发送队列 slice（③ 独立成片 —— 见 `docs/11` §5.3）
 *
 * ★ **它为什么独立成片**：`settings.ts` 的头注释已经预告过「`accountConcurrency` 会撞 25 字段上限」
 *   ⇒ 队列自己一片（`sendQueue` + `accountConcurrency`），与「设置族」不混。
 *
 * ★ ★ **本片只有"写"的能力，没有"想"的能力**：所有判断（能不能入队 / 能不能派发 /
 *   失败了怎么办）都在 `core/rules/sendQueue*.ts`（**已测，共 84 条单测**）；
 *   这里只做「把规划结果落到 store」+「浅合并」。
 *
 * 依据（**逐行回源**）：
 *   - `sendQueue: { items: [], paused: false }` 30436-30439
 *   - `setSendQueue` 30440-30449（★ **浅合并**：`{...旧, ...新}`）
 *   - `accountConcurrency: 1` + `setAccountConcurrency` 30450-30456（`floor`、`>= 1`、否则 **1**）
 *   - `Wu`（整体写 items）41844-41852 / `wr`（改一项）41853-41866
 *
 * ⚠️ 原则 1：**只有 state 能写 store**。
 */

import { DEFAULT_ACCOUNT_CONCURRENCY } from '@/constants';
import type { QueueItem } from '@/core/rules/sendQueuePlan';
import type { QueueItemPatch } from '@/core/rules/sendQueueOps';

/** 队列状态（原 `state.sendQueue`） */
export interface SendQueueState {
  items: QueueItem[];
  /** 暂停闩（原 `paused`）—— ⚠️ 与控制器里的 `_i` **成对**，见控制器注释 */
  paused: boolean;
}

/**
 * 一条「排队追问」进度（原 `queueProgress[itemId] = {...r, at}`）—— ★ `TD-16-103`
 *
 * `kind` / `text` 正是 `core/rules/genProgress.resolveGenProgress` 第三参要的两个字段
 * （`GenReplyLite`），面板直接把它喂进「成片行」。
 */
export interface QueueProgressEntry {
  /** 助手回复分类（`core/rules/replyKind.classifyReply` 的 `kind`） */
  kind?: string;
  /** 给用户看的一句话（源 `st[kind]` 的映射文案；`kind === 'other'` 时是回复原文截断） */
  text?: string;
  /** 已追问次数（源 `pings`）—— 追问循环用它过节奏闸 */
  pings?: number;
  /** 上次追问时刻（源 `askedAt`）—— 追问循环用它算间隔 */
  askedAt?: number;
  /** 写入时刻（**由 store 盖**，源 `Date.now()` ⇒ 本仓注入时钟） */
  at: number;
}

/** 写入参数（`at` 不允许外部给 —— 恒由 `setQueueProgress` 盖） */
export type QueueProgressPatch = Omit<QueueProgressEntry, 'at'>;

export interface QueueSlice {
  sendQueue: SendQueueState;
  /**
   * 每账号并发上限（原 `accountConcurrency`，默认 **1**）
   * ⚠️ 语义是「**同一账号同一时刻只处理一个任务**」（原面板 `title` 的原话）
   */
  accountConcurrency: number;
  /** 浅合并（原 `setSendQueue`）—— 非对象入参**直接忽略** */
  setSendQueue: (patch: Partial<SendQueueState>) => void;
  /** 整体替换 items（原 `Wu`） */
  setQueueItems: (items: QueueItem[]) => void;
  /** 改**一项**（原 `wr`）—— 找不到该 id ⇒ **原样不动**（不抛） */
  updateQueueItem: (id: string, patch: QueueItemPatch) => void;
  /** 设并发上限（原 `setAccountConcurrency`） */
  setAccountConcurrency: (n: unknown) => void;

  // ── 排队追问进度（原 `queueProgress` 30436 附近的 `31240` 段）★ `TD-16-103` 的生产者坑位 ──
  /**
   * 后台进度回显（原 `A.queueProgress`）—— 键 = **队列项 id**，值 = 该次追问的产物
   *
   * ★ **谁写**：队列泵的**「排队追问」轮询**（源 `_Component43.jsx:2200-2266`）——
   *   追问页面 → 用 `classifyReply`（源 `WR`）分类助手回复 → `setQueueProgress(itemId, {kind, text, …})`。
   * ★ **谁读**：`ui/panels/SendQueuePanel` 的「成片行」第三参（源 `z3.jsx:13`）。
   */
  queueProgress: Record<string, QueueProgressEntry>;
  /**
   * 合并写一条（原 `setQueueProgress(n, r)`）—— 键为空 ⇒ **原样不动**（不抛）；
   * 写入时**盖 `at` 时间戳**（源 `Date.now()` ⇒ 本仓注入时钟，原则 4）。
   */
  setQueueProgress: (key: string, patch: QueueProgressPatch) => void;
  /** 删一条（原 `clearQueueProgress(n)`）—— 键为空或**不在表里** ⇒ 原样不动 */
  clearQueueProgress: (key: string) => void;
}

/**
 * @param now 时钟 —— ★ 2026-10-11（`TD-16-103`）**它终于有消费者了**：`setQueueProgress` 写入时
 *   盖 `at`（源写 `Date.now()` ⇒ 本仓注入，原则 4）。
 *   ⚠️ 其余队列时间戳仍一律由 `core/rules` 的规划函数算出后**作为 patch 传进来**。
 */
export const createQueueSlice =
  (_now: () => number) =>
  (
    set: (partial: Partial<QueueSlice>) => void,
    get: () => QueueSlice,
  ): QueueSlice => ({
    sendQueue: { items: [], paused: false },
    accountConcurrency: DEFAULT_ACCOUNT_CONCURRENCY,

    setSendQueue: (patch) => {
      // 原 30441：`if (!!n && typeof n == 'object')` —— 非对象直接忽略
      if (!patch || typeof patch !== 'object') return;
      set({ sendQueue: { ...(get().sendQueue || { items: [], paused: false }), ...patch } });
    },

    setQueueItems: (items) => {
      const s = get().sendQueue || { items: [], paused: false };
      set({ sendQueue: { ...s, items } });
    },

    updateQueueItem: (id, patch) => {
      const s = get().sendQueue;
      // 原 41854-41864：`map` 里逐项比 id，其余原样返回（**不新建数组里的其它对象**）
      const items = s.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
      set({ sendQueue: { ...s, items } });
    },

    setAccountConcurrency: (n) => {
      // 原 30452-30455：`Number.isFinite(r) && r >= 1 ? Math.floor(r) : 1`
      const r = Number(n);
      set({ accountConcurrency: Number.isFinite(r) && r >= 1 ? Math.floor(r) : DEFAULT_ACCOUNT_CONCURRENCY });
    },

    // ── 排队追问进度（原 `31240` / `31241-31254` / `31255-31267`）★ `TD-16-103` ──
    queueProgress: {},

    setQueueProgress: (key, patch) => {
      // 原 31242-31244：`if (!n) return;`
      if (!key) return;
      const s = { ...get().queueProgress };
      // 原 31247-31250：`s[n] = { ...(r || {}), at: Date.now() }` —— `at` 由**注入的时钟**给（原则 4）
      s[key] = { ...(patch || {}), at: _now() };
      set({ queueProgress: s });
    },

    clearQueueProgress: (key) => {
      // 原 31257-31259：`if (!n || !(n in t().queueProgress)) return;` —— 不在表里**不动**（不新建对象）
      if (!key || !(key in get().queueProgress)) return;
      const s = { ...get().queueProgress };
      delete s[key];
      set({ queueProgress: s });
    },
  });
