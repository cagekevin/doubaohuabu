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

import type { QueueItem } from '@/core/rules/sendQueuePlan';
import type { QueueItemPatch } from '@/core/rules/sendQueueOps';

/** 队列状态（原 `state.sendQueue`） */
export interface SendQueueState {
  items: QueueItem[];
  /** 暂停闩（原 `paused`）—— ⚠️ 与控制器里的 `_i` **成对**，见控制器注释 */
  paused: boolean;
}

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
}

/**
 * @param now 时钟（**本片暂时没用它**，留着与其它 slice 的签名一致；
 *   ⚠️ 队列的时间戳一律由 `core/rules` 的规划函数算出后**作为 patch 传进来** —— 那是原则 4 的落点）
 */
export const createQueueSlice =
  (_now: () => number) =>
  (
    set: (partial: Partial<QueueSlice>) => void,
    get: () => QueueSlice,
  ): QueueSlice => ({
    sendQueue: { items: [], paused: false },
    accountConcurrency: 1,

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
      set({ accountConcurrency: Number.isFinite(r) && r >= 1 ? Math.floor(r) : 1 });
    },
  });
