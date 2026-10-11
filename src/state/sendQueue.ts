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
import { QUEUE_PING_FIRST_MS } from '@/constants';
import { REPLY_SENTINEL, classifyReply } from '@/core/rules/replyKind';
import { queuePingText, shouldPingQueueProgress } from '@/core/rules/queuePing';
import { log } from '@/lib/log';
import { makeId } from '@/core/rules/project';
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
import type { Ports, StoragePort } from '@/core/ports';
import { LS_SENDQUEUE_POS } from '@/stable/contracts/keys';
import { PERSIST } from './persistKeys';

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
  /**
   * 读回面板位置（原 `U3` 42570-42585）—— 解析失败 / 字段不是有限数 ⇒ `null`
   *
   * ⚠️ 归本控制器是因为**读盘要走端口**：`ui` 不得持 `Ports`（TD-16-8）。
   *    位置**不进 store** —— 它不是画布状态，只是这个面板的显示偏好。
   */
  readPanelPos(): { x: number; y: number } | null;
  /** 记住面板位置（原 `Pp`）—— 写失败**不影响使用**，只影响「下次记住位置」 */
  writePanelPos(pos: { x: number; y: number }): void;
}

/**
 * 读回面板位置（原 `U3` 42570-42585）—— 解析失败 / 字段不是有限数 ⇒ `null`
 *
 * ⚠️ **保留「字段必须是有限数」的校验**：端口只负责取值，坏形状得自己挡。
 * ★ 2026-10-11 从 `ui/panels/SendQueuePanel.tsx` **原样迁移**（那里曾让 `ui` 持 `StoragePort`）。
 */
function readPanelPos(storage: StoragePort): { x: number; y: number } | null {
  const r = PERSIST[LS_SENDQUEUE_POS].read(storage);
  // ★ TD-06-1：三态 —— `missing`（没存过）/ `corrupt`（坏了）都当"没有位置"
  //   （这是**面板位置**，丢了无害；且它不在 `persist` 的写回清单里 ⇒ 无覆盖风险）
  if (r.kind !== 'ok') return null;
  const v = r.value as { x?: unknown; y?: unknown } | null;
  if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x as number, y: v.y as number };
  return null;
}

function writePanelPos(storage: StoragePort, pos: { x: number; y: number }): void {
  try {
    PERSIST[LS_SENDQUEUE_POS].write(storage, pos);
  } catch {
    // catch-ok: 存不进去（配额 / 隐私模式）不影响使用，只影响「下次记住位置」。
    // ★ **TD-07-3 结清（2026-10-11，回源）**：此处**刻意保持静默**（不加日志），三条依据 ——
    //   ① **逐字对源**：原版 `z3.jsx:153-156` / `:172-175` 就是
    //      `try { localStorage.setItem(Pp, JSON.stringify(…)) } catch {}`（**空 catch**，源版也不打日志）；
    //   ② **原则 6 已合规**：本块带 `catch-ok:` 理由（该规则的两条出口之一即"标注理由"）；
    //   ③ **后果无害**：丢的只是"面板位置"（下次开在默认位）⇒ **不值得为它偏离源版**。
    //   ⚠️ 下轮**不要再把它当"待留痕"重开** —— 结论在此，依据是源版代码。
  }
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
   * ★ **必须用 `ports.clock`** —— 裸 `setTimeout` 不可测（原则 4）
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
   * 把队列**已占住**的那个账号组装成「已定选择」（账号 ＋ 站点）—— ★ **`TD-03-18`**
   *
   * ⚠️ **⛔ 不往下传 `forceAccountId`**：`prepare` 从不读它 ⇒ 它会自己再选一次号；
   *   被占住的账号在忙表里 ⇒ 第二次会**跳过它另选一个**。现在把整个归属交下去，只有**一套选号**。
   * ⚠️ 账号或站点查不到 ⇒ `null`（`prepare` 会回落走池选号 —— 那是 `runBatchSend` 的正常路径）。
   */
  const forcedChoiceOf = (accountId: string) => {
    const a = s().accounts.find((x) => x.id === accountId);
    const site = a ? ports.sites[a.type] : undefined;
    return a && site ? { account: a, site } : null;
  };

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

  /**
   * 「排队追问」—— ★ `TD-16-103` 的**生产者**（源 `_Component43.jsx:2190-2266` 的页面动作半）
   *
   * 发送成功后**到点问页面一句**：`REPLY_SENTINEL`（`现在有视频在生成吗` —— 源 `aD` 里写进
   * 输入框的就是它），把助手回复过 `classifyReply`（源 `WR`）分类，经 `queuePingText`（源 `st`）
   * 翻成一句话，写进 `store.queueProgress[itemId]` —— 那是发送队列面板「成片行」的**第三参**。
   *
   * ⚠️ **与源的一处如实差异（留痕）**：源把这段挂在 item 的异步流里**长跑一个 while 循环**
   *   （初等 5s ⇒ 每轮 1.5s，直到出片或 `zR`=50min）。但源 `Cp = 1` ⇒ **那个循环只会追问一次**，
   *   余下 50 分钟纯属空转等出片。本仓**不在调度流里空转**（会占住泵）⇒ 改为**到点一次性调度**。
   *   两边**可观察行为相同**：一次发送 ⇒ 一条 `queueProgress`。
   * ⚠️ 因为不再长跑，源传给节奏闸的 `finished` / `generating` 两参在本仓**恒 false**（不观察）。
   *   后果被 `resolveGenProgress` 的**分支序**挡住：③「本轮 attempts 已有终态」**优先于** ④「按 `kind`」
   *   ⇒ 即便这 60 秒里已经出片，成片行显示的仍是③的「已完成」，不会被这次追问的 `kind` 带偏。
   * ⚠️ **不走 `withBackendPage`**（`usecases/sendToSite.ts`）：那个壳会 `holdAccount`，而账号**此刻
   *   正由本 item 持有**（`reserve` 占的号）⇒ 再占必然 `hold-failed`，追问永远发不出去。
   *   这里只借后台页（`prepareForSend` + `finally release`），账号归属不动。
   */
  const runQueuePing = async (input: {
    itemId: string;
    accountId: string;
    /** 发出时刻（源 `ackedAt`）—— 节奏闸的首次基准 */
    ackedAt: number;
    gen: number;
  }): Promise<void> => {
    // 已 `stop()` / 换代 ⇒ 丢弃（与结算 `planQueueSettlement` 同纪律）
    if (generation !== input.gen) return;

    const st = s();
    const account = st.accounts.find((a) => a.id === input.accountId);
    // 项还在队列里才有意义（被清掉/移除 ⇒ 无事可做）
    if (!account || !itemOf(input.itemId)) return;

    const prev = st.queueProgress[input.itemId];
    const pings = prev?.pings ?? 0;
    // 节奏闸（源 `GR`）：首次满 60s、次数达上限（`Cp = 1`）⇒ 不再问
    if (!shouldPingQueueProgress({ pings, ackedAt: input.ackedAt, now: now() })) return;

    const site = ports.sites[account.type];
    const ping = site?.pingQueueProgress;
    if (!site || !ping || !site.chatUrl) {
      // 站点没这条链 ⇒ **明确跳过并留痕**（不回落、不静默；原则 6）
      log.warn('[sendQueue] 该站点不支持排队追问，跳过：', account.type);
      s().clearQueueProgress(input.itemId);
      return;
    }

    const prepared = await ports.backendPage.prepareForSend(account, {
      targetUrl: site.chatUrl,
      jobId: `queue-ping:${input.itemId}`,
      purpose: 'queue-ping',
    });
    if (!prepared.ok) {
      log.warn('[sendQueue] 排队追问：后台页未就绪，跳过：', prepared.message);
      s().clearQueueProgress(input.itemId);
      return;
    }

    try {
      const askedAt = now();
      const reply = await ping(
        { account, webContentsId: prepared.value.webContentsId },
        REPLY_SENTINEL,
      );
      if (!reply.ok) {
        log.warn('[sendQueue] 排队追问失败（按无进度处理）：', reply.message);
        s().clearQueueProgress(input.itemId);
        return;
      }
      // 源 `setQueueProgress(_e, {kind, pings, askedAt, text})` —— `at` 由 store 盖
      const kind = classifyReply(reply.value.text).kind;
      s().setQueueProgress(input.itemId, {
        kind,
        text: queuePingText(kind, reply.value.text),
        pings: pings + 1,
        askedAt,
      });
    } finally {
      ports.backendPage.release(prepared.value.leaseId, 'done');
    }
  };

  /** 跑一项：`sendOneNode` → `planQueueSettlement` → 落 store（原 42195-42294 的 `(async () => …)()`） */
  const runItem = async (d: DispatchDecision, gen: number): Promise<void> => {
    let outcome: SendOneResult | null = null;
    let failure: { message?: string } | null = null;
    try {
      outcome = await sendOneNode({
        nodeId: itemOf(d.itemId)?.nodeId ?? '',
        // ★ `TD-03-18`：把**队列已占住的那个账号**整体交下去（账号 ＋ 站点）——
        //   `prepare` 不再选第二次（原 `forceAccountId` 是幽灵参数，实现侧从不读它）
        forced: forcedChoiceOf(d.accountId),
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
    // ★ `TD-16-103`：**发出去了** ⇒ 到点安排一次「排队追问」（源在同一异步流里长跑循环，见 `runQueuePing`）
    if (outcome?.ok && d.accountId) {
      const ackedAt = now();
      const genAtSend = gen;
      ports.clock.setTimeout(() => {
        void runQueuePing({ itemId: d.itemId, accountId: d.accountId, ackedAt, gen: genAtSend });
      }, QUEUE_PING_FIRST_MS);
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
        // ★ **2026-10-12 越权收口**：原在此自拼 `sq_…` —— 改委托唯一工厂（规范只在 `core/rules/project`）
        idFactory: () => makeId('queueItem', now(), ++seq),
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

    readPanelPos: () => readPanelPos(ports.storage),
    writePanelPos: (pos) => writePanelPos(ports.storage, pos),
  };
}
