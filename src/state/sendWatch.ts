/**
 * 「发送后监测」控制器 —— ★ `nodeNotices` / `nodeWaitTimes` 的**唯一生产消费者**
 *
 * 依据（**逐行回源**）：`_Component43.jsx:2638-2700` 的 `watchSendReply`（它是 `gt` 的尾巴，
 *   由发送链在 `:3010` 触发）+ `:2366-2372` 的建基线 + `:2650-2672` 的轮询体。
 *
 * ★★ **为什么循环住在这里（而不是 usecase）**：
 *   循环要**跨 180s 持租约**（源 `gt` 复用发送时的 `runtimeLeaseId`），而本仓的租约由
 *   `withBackendPage` 保证「`run` 返回即释放」⇒ 循环必须住在 `run` **里面**。
 *   若把循环做进 usecase，它就得**回调 state 去写 store**（倒置 + 违反原则 1）。
 *   ⇒ 分工：`core/usecases/probeSendRound` 做**一轮**（纯编排）；本文件做**循环 + 落 store**。
 *
 * ⚠️ **原则 1**：只有本文件写 store（`setNodeNotice` / `setNodeWaitTime` 两个 action）。
 * ⚠️ **原则 6**：探测失败**如实记日志**（源版 4 个 helper 是 `catch{}` 静默吞）——
 *   页面在导航中会短暂失败，故**不因此终止**整条监测，但**必须留痕**。
 * ⚠️ **与源的一处结构性差异（留痕）**：源复用发送时的租约；本仓发送用例返回时已释放租约
 *   ⇒ 监测**自己申请一条**（`purpose: 'result-watch'`）。代价：账号在监测期间**被占用**
 *   （与源一致 —— 源那条租约同样活到监测结束）。
 * ⚠️ **换号重发未落**（原 `be` → 递归 `gt`）：额度类命中**只通知、不终止、不写 `nodeSwitches`**
 *   （见 `core/rules/sendWatch.reduceWatchRound` 的头注）⇒ `switch-status` 三块 UI 仍缺生产者。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import { withBackendPage, type SendToSiteDeps } from '@/core/usecases/sendToSite';
import { probeSendRound } from '@/core/usecases/probeSendRound';
import {
  isSendEffective,
  reduceWatchRound,
  seedWatchState,
  type WatchEffects,
  type WatchState,
} from '@/core/rules/sendWatch';
import {
  QUOTA_CONSUME_WARN,
  QUOTA_REMAIN_WARN,
  SEND_WATCH_LOG_EVERY,
  SEND_WATCH_POLL_MS,
  SEND_WATCH_WINDOW_MS,
} from '@/constants/sendWatch';
import { sleep } from '@/lib/async';
import { log } from '@/lib/log';

/** 起一轮监测的输入 */
export interface SendWatchInput {
  /** 本次发送所在的节点（通知 / 倒计时都挂它） */
  nodeId: string;
  /** 本次发送用的账号（源 `gt` 的 `Q`） */
  accountId: string;
  /** 本次发送的原文（源 `ve.ownText`；页内脚本已按输入框排除，这里只留档） */
  ownText?: string;
}

export interface SendWatchController {
  /** 起一轮监测（源 `gt` 尾部的 `watchSendReply`）；同一节点已在监测 ⇒ **先停旧的**再起 */
  start(input: SendWatchInput): void;
  /** 停掉某节点的监测（节点被删 / 用户手动停） */
  stop(nodeId: string): void;
  /** 该节点是否正在监测 */
  isWatching(nodeId: string): boolean;
}

export function createSendWatchController(store: AppStore, ports: Ports): SendWatchController {
  /** 节点 → 取消函数（同一节点**只许一条**监测链） */
  const running = new Map<string, () => void>();
  /**
   * 账号 → 上一轮监测留下的「已接单」计数（原模块级 `Wd`）
   *
   * ⚠️ 建基线时取「站点读数」与它的**较大者**（源 `Ge = Math.max(ge.count, Wd[Q] || 0)`）——
   *   否则同一账号连发两次时，上一轮的计数会把基线压低 ⇒ 本轮**立刻**误判成"已生效"。
   */
  const ackCounts = new Map<string, number>();

  /** 把一轮的产物落进 store（**唯一写点**） */
  const applyEffects = (nodeId: string, effects: WatchEffects): void => {
    const s = store.useStore.getState();
    for (const notice of effects.notices) s.setNodeNotice(nodeId, notice);
    if (effects.waitTime) {
      const w = effects.waitTime;
      s.setNodeWaitTime(nodeId, { minutes: w.minutes, seconds: w.seconds, text: w.text });
    }
  };

  const run = async (input: SendWatchInput, cancelled: () => boolean): Promise<void> => {
    const deps: SendToSiteDeps = {
      sites: ports.sites,
      backendPage: ports.backendPage,
      // ★ 占用 / 释放（原 `Fi` / `tn`）—— 真正的 `set` 在 state（与 `state/analyze.ts` 同法）
      holdAccount: (accountId, nodeId) =>
        store.useStore.getState().holdAccount(accountId, { itemId: null, nodeId }),
      releaseAccount: (accountId) => {
        store.useStore.getState().releaseAccount(accountId);
      },
    };

    const account = store.useStore.getState().accounts.find((a) => a.id === input.accountId);
    if (!account) return;

    const res = await withBackendPage(
      deps,
      {
        accounts: [account],
        // ★ 指定账号 ⇒ 不退级（源 `gt` 拿的就是发送时那个账号）
        sendAccount: account.id,
        chain: [account.type],
        jobId: `send-watch:${input.nodeId}`,
        purpose: 'result-watch',
        nodeId: input.nodeId,
      },
      async (bp) => {
        const ctx = {
          account: bp.account,
          site: bp.site,
          webContentsId: bp.page.webContentsId,
        };

        // ① 建基线（原 2366-2372）
        const base = await probeSendRound(ctx, {});
        if (!base.ok) {
          log.warn('[sendWatch] 建基线失败，监测未启动：', base.message);
          return { ok: false, reason: base.reason, message: base.message };
        }
        if (Object.keys(base.value.errors).length > 0) {
          log.warn('[sendWatch] 建基线时部分探测失败：', base.value.errors);
        }
        let state: WatchState = seedWatchState(
          base.value.reading,
          ackCounts.get(account.id) ?? 0,
        );
        if (base.value.reading.ack) {
          ackCounts.set(account.id, state.ackBaseline);
        }

        const startedAt = ports.clock.now();
        let rounds = 0;

        // ② 每 2s 一轮，窗口 180s（原 2640-2667）
        while (ports.clock.now() - startedAt < SEND_WATCH_WINDOW_MS) {
          if (cancelled()) break;
          await sleep(SEND_WATCH_POLL_MS);
          if (cancelled()) break;
          rounds += 1;

          const round = await probeSendRound(ctx, {
            // 源的两个"只跑一次"闩（`Re` / `Me`）
            waitTime: state.waitTimeDone,
            quota: state.quotaDone,
          });
          if (!round.ok) {
            log.warn('[sendWatch] 探测不可用，监测结束：', round.message);
            break;
          }
          if (Object.keys(round.value.errors).length > 0) {
            // ⚠️ 源版此处静默吞；本仓**如实记**，但不终止（页面导航中会短暂失败）
            log.warn('[sendWatch] 本轮部分探测失败：', round.value.errors);
          }

          const out = reduceWatchRound(
            state,
            round.value.reading,
            QUOTA_CONSUME_WARN,
            QUOTA_REMAIN_WARN,
          );
          state = out.state;
          applyEffects(input.nodeId, out.effects);

          // ③ 「本次发送已生效」（原 2669-2672 的 `W.count > Ge`）
          if (out.effects.ackCount != null) {
            const prev = ackCounts.get(account.id) ?? 0;
            if (isSendEffective({ count: out.effects.ackCount, text: '' }, prev)) {
              ackCounts.set(account.id, out.effects.ackCount);
              log.info(
                `[sendWatch] 节点=${input.nodeId} 探测到「已接单」回复 → 本次发送已生效（计数 ${out.effects.ackCount} > ${prev}）`,
              );
            }
          }

          if (out.stop) break;
          if (rounds % SEND_WATCH_LOG_EVERY === 0) {
            log.info(
              `[sendWatch] 节点=${input.nodeId} 监测中…（第 ${rounds} 轮，已 ${Math.round((ports.clock.now() - startedAt) / 1000)}s）`,
            );
          }
        }
        return { ok: true as const, value: undefined };
      },
    );

    if (!res.ok) log.warn('[sendWatch] 监测未能启动：', res.message);
  };

  const stop = (nodeId: string): void => {
    const cancel = running.get(nodeId);
    if (!cancel) return;
    cancel();
    running.delete(nodeId);
  };

  return {
    start(input) {
      stop(input.nodeId);
      let stopped = false;
      const cancel = (): void => {
        stopped = true;
      };
      running.set(input.nodeId, cancel);
      void run(input, () => stopped).finally(() => {
        // ⚠️ 只在"还是我这一条"时才删（否则会误删后来者）
        if (running.get(input.nodeId) === cancel) running.delete(input.nodeId);
      });
    },
    stop,
    isWatching(nodeId) {
      return running.has(nodeId);
    },
  };
}
