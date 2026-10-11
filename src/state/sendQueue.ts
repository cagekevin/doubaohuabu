/**
 * 发送队列控制器（★ 装配层）—— 原 `TS`（42078-42320）+ `z3.jsx` 的**动作半**
 *
 * ★★ **它是什么**：把**已测的四块纯逻辑**接起来跑 ——
 *   `sendQueuePlan`（入队：防重复）→ `sendQueueOps`（取消/重试/清空）→
 *   `sendQueueDispatch`（谁先跑、用哪个账号）→ `sendQueueSettle`（跑完变什么）。
 *   本文件**只做编排**（取快照 → 调纯函数 → 落 store），**一条判断都不自己写**。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 泵的节流 | `M3` 42033 | `clearTimeout` + **50ms** ⇒ 同一帧里的多次触发只跑一次 |
 *   | 泵主体 | `TS.ls()` 42090 | 先算并发基线 ⇒ 建"在跑计数"⇒ 取候选（`waiting` + `notBefore` 已到，按 `order`）|
 *   | 取消/重试/清空 | `C3`/`E3`/`A3` | **全部已落成纯函数**（`sendQueueOps`） |
 *   | 暂停/恢复 | `j3`/`_3` 41993 | 模块闩 `_i` **与** store 的 `paused` 同时置位 |
 *   | 代次闸 | `Tp` | `stop()` 时 +1 ⇒ 在途结果作废（原 42203） |
 *   | 重试上限 | `k3` 41831 | 默认 **2** |
 *   | 指纹缓存 | `IS` 41869 | `nodeId → {fp, at}`（模块级 Map ⇒ 收进闭包） |
 *
 * ⚠️ **两处注入**（原则 1/4）：`prepare`/`transport` 来自 `createSendPipeline`
 *   （**与批量发送共用同一套**）；`now` 来自 `ports.clock`。
 * ⚠️ **`paused` 有两个**（源版也是）：控制器里的 `halted`（**当前这轮立刻停**）
 *   与 store 的 `sendQueue.paused`（**UI 显示**）—— 两者必须一起改，否则 UI 会说谎。
 */

import { SEND_QUEUE_TEXT } from '@/constants/text';
import { isAccountUsable } from '@/stable/model/account';
import { busyIdsOf, isAccountBusy } from '@/core/rules/accountBusy';
import { resolveSendAccountForChain } from '@/core/usecases/sendToSite';
import { sendOneNode, type SendOneResult } from '@/core/usecases/sendQueue';
import {
  planEnqueue,
  queueFingerprint,
  nodeTextOf,
  type EnqueueInput,
  type QueueItem,
} from '@/core/rules/sendQueuePlan';
import type { Cancel } from '@/core/ports/clock.port';
import { clearFinishedQueue, planCancel, planRetry, resolveSendMode } from '@/core/rules/sendQueueOps';
import { planQueueDispatch, type DispatchDecision, type PickAutoResult } from '@/core/rules/sendQueueDispatch';
import { planQueueSettlement } from '@/core/rules/sendQueueSettle';
import { createSendPipeline } from './batchSend';
import type { AppStore } from './store';
import type { Ports } from '@/core/ports';

/** 泵的节流窗口（ms）—— 原 `M3` 42038 的 `50` */
const PUMP_THROTTLE_MS = 50;
/** 自动重试上限（原 `k3` 41831 的 `2`） */
export const QUEUE_MAX_RETRY = 2;

export interface SendQueueController {
  /** 入队（原 `$S`）—— `skipped` 非零时会 toast「跳过 N 个…」 */
  enqueue(inputs: readonly EnqueueInput[], opts?: { replace?: boolean; force?: boolean; excludeAccountIds?: readonly string[] }): { added: number; skipped: number };
  /** 取消一项（原 `C3`）—— 不可取消时**静默返回**（源版返回 `false`） */
  cancel(itemId: string): void;
  /** 重试一项（原 `E3`）—— 不可重试时**静默返回** */
  retry(itemId: string): void;
  /** 清掉已结束的项（原 `A3` —— 保留 `waiting`/`sending`） */
  clearFinished(): void;
  pause(): void;
  resume(): void;
  /** 启动泵（幂等；`bootstrap` 时调一次即可） */
  start(): void;
  /** 停泵并把代次 +1（在途结果作废） */
  stop(): void;
}

/**
 * 把画布节点收成「指纹只需的最小视图」
 *
 * ⚠️ **为什么需要这一层**：`CanvasNode` 是 8 类节点的联合，而 `QueuePlanNodeLike` 只认
 *   `{id, data.text?}` —— 联合成员（如 `MaterialNodeData`）的 `data` 里**没有 `text`**，
 *   结构上不兼容。硬转 `as` 会让类型系统闭嘴但**读起来像在骗它**；
 *   这里**显式取一次**，把"我们只看这两个字段"写在代码里（多类节点共用一条发送链的前提）。
 */
function nodesForFingerprint(
  nodes: readonly { id: string; data?: unknown }[],
): readonly { id: string; data?: { text?: unknown } | null }[] {
  return nodes.map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    return { id: n.id, data: { text: d.text } };
  });
}

export function createSendQueueController(store: AppStore, ports: Ports): SendQueueController {
  // ★ 与批量发送**共用同一套**发送管道（判据 C1：不写第二份 `prepare`）
  const pipeline = createSendPipeline(store, ports);

  /** 指纹缓存（原模块级 `Map IS`）—— 入队时写、结算成功时更新 */
  const fingerprints = new Map<string, { fp: string; at: number }>();
  /** 泵在跑（原 `Do`） */
  let pumping = false;
  /** 暂停闩（原 `_i`） */
  let halted = false;
  /** 代次（原 `Tp`）：`stop()` 时 +1 ⇒ 在途结果被 `planQueueSettlement` 丢弃 */
  let generation = 0;
  /** 节流句柄（原 `or`） */
  /**
   * 节流定时器
   * ★ **2026-10-11 修正**：原先是**裸 `setTimeout`** —— 而本控制器手上就有 `ports.clock`
   *   （同一个文件里 `now()` 就是用它）⇒ 走时钟端口才能**被虚拟时钟驱动**（测试/确定性复现）。
   *   `Cancel` 是本仓既有的取消形态（`state/persist.ts` 同款）。
   */
  let timer: Cancel | null = null;
  /** 是否已启动（原 `Do` 的"允许自触发"那一半） */
  let active = false;
  let seq = 0;

  const s = () => store.useStore.getState();
  const now = () => ports.clock.now();
  const itemOf = (id: string): QueueItem | undefined => s().sendQueue.items.find((x) => x.id === id);

  /**
   * 从池里挑一个空闲账号（原 `Ei({excludeIds, ...opts})`）
   *
   * ⚠️ **与源版的一处实现差异（留痕）**：源版 `Ei` 把 `excludeIds` **在池内过滤**；
   *   本实现借 `resolveSendAccountForChain`（它已覆盖 `auto` / `auto:group:` / `auto:<type>`
   *   + 忙表 + 池策略），再**事后**看挑出来的那个是否在排除表里 —— 若在，就报 `all-busy`
   *   （调用方对两者的处置相同：**写 note、这一轮不派发**）。
   *   行为等价，代价是"唯一空闲的那个恰好被排除"时会多等一轮。
   */
  const pickAuto = (
    opts: { groupId?: string; type?: string },
    exclude: readonly string[],
  ): PickAutoResult => {
    const st = s();
    const synth = opts.groupId ? `auto:group:${opts.groupId}` : opts.type ? `auto:${opts.type}` : 'auto';
    const r = resolveSendAccountForChain({
      accounts: st.accounts,
      sites: ports.sites,
      sendAccount: synth,
      busy: busyIdsOf(st.accountBusy, now()),
      strategy: st.poolStrategy,
    });
    if (!r.ok) return { reason: r.reason };
    if (exclude.includes(r.choice.account.id)) return { reason: 'all-busy' };
    return { accountId: r.choice.account.id, name: r.choice.account.name };
  };

  /** 跑一项：`sendOneNode` → `planQueueSettlement` → 落 store（原 42195-42294 的 `(async () => …)()`） */
  const runItem = async (d: DispatchDecision, gen: number): Promise<void> => {
    let outcome: SendOneResult | null = null;
    let failure: { message?: string } | null = null;
    try {
      outcome = await sendOneNode({
        nodeId: itemOf(d.itemId)?.nodeId ?? '',
        // ★ 账号已由 `planQueueDispatch` 定好 ⇒ **强制指定**，不让它再选一次
        forceAccountId: d.accountId,
        excludeAccountIds: itemOf(d.itemId)?.excludeAccountIds ?? [],
        prepare: pipeline.prepare,
        transport: pipeline.transport,
        // ⚠️ 带 `itemId` ⇒ 只释放**本项**占的那个（与 `reserve` 的 `itemId` 对上）
        releaseAccount: (accountId) => {
          s().releaseAccount(accountId, { itemId: d.itemId });
        },
        setState: (e) => {
          s().setNodeSendState(e.nodeId, e);
        },
      });
    } catch (e) {
      failure = e as { message?: string };
    }

    const cur = itemOf(d.itemId);
    if (!cur) return;

    const plan = planQueueSettlement({
      item: cur,
      outcome,
      error: failure,
      now: now(),
      generation: gen,
      currentGeneration: generation,
      isCancelled: cur.status === 'cancelled',
      maxRetry: QUEUE_MAX_RETRY,
    });

    // ⚠️ `discard` 时 `patch` 是**空对象** ⇒ 不写（源版那两个分支只释放、不回写）
    if (Object.keys(plan.patch).length) s().updateQueueItem(d.itemId, plan.patch);
    for (const id of plan.releaseAccountIds) {
      s().releaseAccount(id, { itemId: d.itemId });
    }
    if (plan.recordFingerprint) {
      const fp = queueFingerprint(nodeTextOf(nodesForFingerprint(s().nodes), cur.nodeId));
      if (fp) fingerprints.set(cur.nodeId, { fp, at: now() });
    }
    // 原 `.finally` 里的 `M3()`：跑完一项就再触发一次泵（节流兜住）
    schedule();
  };

  /** 一轮调度（原 `TS.ls()` 的调度半） */
  const pump = async (): Promise<void> => {
    if (pumping) return;
    pumping = true;
    const gen = generation;
    try {
      const st = s();
      const plan = planQueueDispatch({
        items: st.sendQueue.items,
        now: now(),
        concurrency: st.accountConcurrency,
        // ⚠️ 两个暂停源都要看：控制器闩（立刻停）+ store（UI 显示）
        paused: halted || st.sendQueue.paused,
        // 原 `$3`：把节点的 `sendAccount` 解析成"分配模式"
        modeOf: (nodeId) => {
          const n = st.nodes.find((x) => x.id === nodeId);
          const d = (n?.data ?? {}) as Record<string, unknown>;
          return resolveSendMode(d.sendAccount);
        },
        // 原 42133：`(N.status || '已登录') !== '已登录'`（本工程的 `isAccountUsable` 就是它）
        isUsable: (accountId) => {
          const a = st.accounts.find((x) => x.id === accountId);
          return !!a && isAccountUsable(a);
        },
        // 原 42142：`N.id in accountBusy || Hk(N.id)`
        isBusy: (accountId) => isAccountBusy(st.accountBusy, accountId, now()),
        accountNameOf: (accountId) => st.accounts.find((x) => x.id === accountId)?.name ?? '',
        pickAuto,
        // 原 `Fi(m, {itemId, nodeId})` —— 当场占住（拿不到就跳过这一项）
        reserve: (accountId, itemId) =>
          s().holdAccount(accountId, { itemId, nodeId: itemOf(itemId)?.nodeId ?? null }),
      });

      for (const n of plan.notes) s().updateQueueItem(n.itemId, { note: n.note });
      for (const d of plan.dispatch) {
        s().updateQueueItem(d.itemId, d.patch);
        // ⚠️ **不 await** —— 一项在跑不该挡住同轮的其它项（源版就是并发起的）
        void runItem(d, gen);
      }
    } finally {
      pumping = false;
    }
  };

  /** 节流触发（原 `M3` 42033-42042：`clearTimeout` + `setTimeout(ls, 50)`） */
  const schedule = (): void => {
    if (!active) return;
    if (timer) timer();
    timer = ports.clock.setTimeout(() => {
      timer = null;
      void pump();
    }, PUMP_THROTTLE_MS);
  };

  return {
    enqueue: (inputs, opts = {}) => {
      const st = s();
      const plan = planEnqueue({
        nodes: nodesForFingerprint(st.nodes),
        current: st.sendQueue.items,
        incoming: inputs,
        fingerprints,
        now: now(),
        idFactory: () => `sq_${now().toString(36)}_${++seq}`,
        ...(opts.replace === undefined ? {} : { replace: opts.replace }),
        ...(opts.force === undefined ? {} : { force: opts.force }),
        ...(opts.excludeAccountIds === undefined ? {} : { excludeAccountIds: opts.excludeAccountIds }),
      });
      s().setQueueItems(plan.items);
      if (plan.skipped.length) {
        // 原 41920-41924：`showToast(..., 'info')`
        s().pushToast(SEND_QUEUE_TEXT.skipToast(plan.skipped.length), undefined, 'info');
      }
      schedule();
      return { added: plan.added.length, skipped: plan.skipped.length };
    },

    cancel: (itemId) => {
      const it = itemOf(itemId);
      if (!it) return;
      const plan = planCancel(it, now());
      if (!plan) return;
      s().updateQueueItem(itemId, plan.patch);
      if (plan.releaseAccountId) s().releaseAccount(plan.releaseAccountId, { itemId });
      schedule();
    },

    retry: (itemId) => {
      const it = itemOf(itemId);
      if (!it) return;
      const plan = planRetry(it, now());
      if (!plan) return;
      s().updateQueueItem(itemId, plan.patch);
      if (plan.releaseAccountId) s().releaseAccount(plan.releaseAccountId, { itemId });
      // ⚠️ 重试把 `notBefore` 设成了"未来" ⇒ 这一轮不会立刻跑，但**要让泵知道有新东西**
      schedule();
    },

    clearFinished: () => {
      s().setQueueItems(clearFinishedQueue(s().sendQueue.items));
    },

    pause: () => {
      halted = true;
      // ⚠️ 与源一致：闩 + store **一起**置位（只改一个 ⇒ UI 会说谎或泵不会停）
      s().setSendQueue({ paused: true });
    },

    resume: () => {
      halted = false;
      s().setSendQueue({ paused: false });
      schedule();
    },

    start: () => {
      active = true;
      // 恢复"上一次会话留下的暂停态"（源版 `TS` 开头也会把 `_i` 清掉）
      halted = s().sendQueue.paused;
      schedule();
    },

    stop: () => {
      active = false;
      // ★ 代次 +1 ⇒ **在途结果全部作废**（原 42203：派发时记的 `y !== Tp` 就丢弃）
      generation += 1;
      if (timer) {
        timer();
        timer = null;
      }
    },
  };
}
