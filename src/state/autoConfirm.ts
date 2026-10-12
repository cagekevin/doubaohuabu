/**
 * 「生成确认」控制器 —— ★ `nodeNotices` 的 `generation-confirm` **唯一生产者**
 *
 * 依据（**逐行回源**）：`_Component43.jsx:1738-2052`（`kt` / `autoConfirm`）。
 *
 * ★★ **它解决什么**：豆包 / Dola 后台收到生成请求后，有时**不直接开工**，而是先回一句
 *   「确认后我再开始生成视频」——必须再点一次内联按钮（或回一句确认语）它才开始。
 *   这条链在发送成功后**独立**跑一个循环盯它。**没有它，用户看到的就是"发了但永远不出片"。**
 *
 * ★ **为什么循环住在这里（而不是 usecase）**：
 *   循环最长跑 50 分钟（源 `Date.now() - _e < 3000000`）且要**跨全程持租约** ——
 *   而本仓 `withBackendPage` 保证「`run` 返回即释放」⇒ 循环不能借发送链那条租约。
 *   ⇒ 本文件**自己申请一条独立租约**（源 `kt` 的 `vr(Q, {…, leaseTtlMs: 900000})` 同款，
 *   **不给 `targetUrl`** ⇒ 只等就绪、**不导航**，续用当前会话页），并自己落 store。
 *
 * ⚠️ 原则 1：只有本文件写 store（写的是**具名 action**）。
 * ⚠️ 原则 6：页面探测失败**如实记日志**（源多处 `catch{}` 静默吞），**不因此终止**。
 * ⚠️ **未落（如实挂账）**：源在这里还调 `A(Q)` ＝ `Uu.hold(accountId)`（任务注册表，消费者是
 *   **发送浮层** `dv-send-overlay`，属 `plan/03` 批 6）—— 本批**不落**（判据 B5：不留"落了但没人调"）。
 *   存活判据 `T()` **不依赖**它 ⇒ 功能不受影响。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import type { ImageQuestionContext, ReplyCountReading, SitePort } from '@/core/ports/site.port';
import { detectNewReply, didEnterChatPage } from '@/core/rules/genConfirm';
import { GEN_CONFIRM_TEXT } from '@/constants/text';
import {
  GEN_CONFIRM_ACK_WAIT_MS,
  GEN_CONFIRM_ACTION_DELAY_MS,
  GEN_CONFIRM_BASELINE_RETRIES,
  GEN_CONFIRM_BASELINE_RETRY_MS,
  GEN_CONFIRM_INPUT_POLL_MS,
  GEN_CONFIRM_INPUT_RETRIES,
  GEN_CONFIRM_LEASE_TTL_MS,
  GEN_CONFIRM_MAX_MS,
  GEN_CONFIRM_POLL_MS,
  GEN_CONFIRM_READY_TIMEOUT_MS,
  GEN_CONFIRM_SETTLE_MS,
} from '@/constants';
import { sleep } from '@/lib/async';
import { log } from '@/lib/log';

/** 起一轮自动确认的输入（原 `kt` 的 `ve` 参数对象） */
export interface AutoConfirmInput {
  /** 本次发送所在的节点（通知 / 计时器挂它；原 `me`） */
  nodeId: string | null;
  /** 本次发送用的账号（原 `Q`） */
  accountId: string;
  /** 「请先确认再生成视频」的**发送前**计数（原 `ve.baselineCount`） */
  baselineCount: number;
  /** 「已提交 / 正在生成」的**发送前**计数（原 `ve.submitBaselineCount`） */
  submitBaselineCount: number;
  /** 发送前的页面地址（原 `ve.beforeUrl`）—— 判「刚跳进 `/chat/` ⇒ 基线归零」 */
  beforeUrl: string;
  /** 本轮发送的原始正文（原 `ve.ownText`）—— 排除自触发 */
  ownText: string;
  /** 发送链那条租约（原 `ve.runtimeLeaseId`）—— 自己申请失败时**兜底** */
  runtimeLeaseId: string | null;
}

export interface AutoConfirmController {
  /**
   * **发送前**读两条基线（原 `sendPayload:2845-2861` 的 `detect-gen-confirm-base` / `detect-gen-submit-base`）
   *
   * ⚠️ 必须在 `site.send` **之前**读：发送之后「已提交」回复可能已出现 ⇒ 基线会把它吞掉。
   * @returns `null` = 两条里有任何一条**没拿到有效读数**（源据此**暂停自动确认**并挂 warn 通知）
   */
  readBaselines(ctx: ImageQuestionContext): Promise<{ confirm: number; submit: number } | null>;
  /** 起一轮（**同一 onceKey 已在跑 ⇒ 跳过**，原 `Vd`）；**fire-and-forget**（源不 await） */
  start(input: AutoConfirmInput): void;
  /** 停掉某节点的自动确认（节点被删 / 用户手动停） */
  stop(nodeId: string): void;
}

/** 读数的规范形（原 `ze` 的 `_execError` 判定：拿不到 `count` ⇒ **无效**） */
function validCount(r: ReplyCountReading | null | undefined): { count: number; text: string } | null {
  if (!r || r.error || typeof r.count !== 'number') return null;
  return { count: r.count, text: typeof r.text === 'string' ? r.text : '' };
}

export function createAutoConfirm(store: AppStore, ports: Ports): AutoConfirmController {
  /** 节点 → 取消函数（同一节点只许一条链） */
  const running = new Map<string, () => void>();
  /** 正在跑的 onceKey（原模块级 `Vd`）—— 防同一条租约被重复触发 */
  const triggered = new Set<string>();

  const genOf = (accountId: string): { gen: NonNullable<SitePort['genConfirm']> } | null => {
    const s = store.useStore.getState();
    const account = s.accounts.find((a) => a.id === accountId);
    const gen = account ? ports.sites[account.type]?.genConfirm : undefined;
    return gen ? { gen } : null;
  };

  /** 读两条基线（原 `sendPayload:2845-2861`）—— **最多 2 轮**，间隔 800ms，两条都有效才早收 */
  const readBaselines = async (
    ctx: ImageQuestionContext,
  ): Promise<{ confirm: number; submit: number } | null> => {
    const gen = ports.sites[ctx.account.type]?.genConfirm;
    if (!gen) return null;
    let confirm: { count: number; text: string } | null = null;
    let submit: { count: number; text: string } | null = null;
    for (let i = 0; i < GEN_CONFIRM_BASELINE_RETRIES; i += 1) {
      if (i > 0) await sleep(GEN_CONFIRM_BASELINE_RETRY_MS);
      const [c, s] = await Promise.all([
        gen.probeConfirmRequest(ctx).then((r) => (r.ok ? validCount(r.value) : null)),
        gen.probeSubmitted(ctx).then((r) => (r.ok ? validCount(r.value) : null)),
      ]);
      confirm = c;
      submit = s;
      if (c && s) break;
    }
    if (!confirm || !submit) return null;
    return { confirm: confirm.count, submit: submit.count };
  };

  const run = async (input: AutoConfirmInput, cancelled: () => boolean): Promise<void> => {
    const account = store.useStore.getState().accounts.find((a) => a.id === input.accountId);
    if (!account) return;
    const gen = ports.sites[account.type]?.genConfirm;
    if (!gen) return;

    // ── ① 自己的独立租约（原 `vr(Q, {jobId, purpose, timeoutMs, leaseTtlMs})`）──
    let ownLeaseId: string | null = null;
    try {
      const prepared = await ports.backendPage.prepareForSend(account, {
        jobId: `auto-confirm:${input.nodeId ?? ''}`,
        purpose: 'auto-confirm',
        timeoutMs: GEN_CONFIRM_READY_TIMEOUT_MS,
        leaseTtlMs: GEN_CONFIRM_LEASE_TTL_MS,
      });
      if (prepared.ok) ownLeaseId = prepared.value.leaseId;
      else
        log.warn(
          `[autoConfirm] 账号=${input.accountId} 申请独立租约失败：${prepared.message} → 回落 runtimeLeaseId`,
        );
    } catch (e: unknown) {
      log.warn('[autoConfirm] 申请独立租约抛出：', e);
    }

    // ── ② onceKey 去重（原 `He` + `Vd`）──
    const onceKey = ownLeaseId || input.runtimeLeaseId || `${input.accountId}|${input.nodeId ?? 'none'}`;
    if (triggered.has(onceKey)) {
      log.info(`[autoConfirm] 账号=${input.accountId} 已在自动确认周期中（${onceKey}）→ 跳过重复触发`);
      if (ownLeaseId) ports.backendPage.release(ownLeaseId, 'auto-confirm-duplicate');
      return;
    }
    triggered.add(onceKey);

    /** 存活判据（原 `T()`）：自己的租约没了看兜底那条；两条都没有 ⇒ 视为存活（源同） */
    const alive = (): boolean => {
      if (cancelled()) return false;
      if (ownLeaseId) return ports.backendPage.isAlive(ownLeaseId);
      if (!input.runtimeLeaseId) return true;
      return ports.backendPage.isAlive(input.runtimeLeaseId);
    };
    /** 页内读数的上下文（每次现取，页面可能刚被换过） */
    const ctxOf = (): ImageQuestionContext | null => {
      const idRes = ports.backendPage.webContentsIdOf(account);
      return idRes.ok ? { account, webContentsId: idRes.value } : null;
    };

    // 跨轮状态（原 `K` / `Y` / `we` / `de` / `st`）
    let confirmBaseline = input.baselineCount;
    let submitBaseline = input.submitBaselineCount;
    let urlResetted = false;
    let submitted = false;
    let beforeUrl = input.beforeUrl;

    /** 页面跳进 `/chat/` ⇒ **基线归零**（原 `ge()`，`:1785-1795`） */
    const syncUrl = (): void => {
      const r = ports.backendPage.hrefOf(account);
      const current = r.ok ? r.value : '';
      if (didEnterChatPage({ beforeUrl, currentUrl: current, alreadyDone: urlResetted })) {
        confirmBaseline = 0;
        submitBaseline = 0;
        urlResetted = true;
      }
      if (current) beforeUrl = current;
    };

    /** 「已提交」探测（原 `dt()`，`:1866-1893`）—— 命中即把 pending 计时转正 */
    const detectSubmitted = async (ctx: ImageQuestionContext): Promise<boolean> => {
      const r = await gen.probeSubmitted(ctx);
      // ⚠️ **防空转**（与源的一处有意差异）：源每轮都真发一趟页内脚本（天然有节流）；
      //    本仓探针在"视图没了"时**立刻返失败** ⇒ 不睡就会在 `waitAck` 里空转满 90s。
      if (!r.ok) await sleep(GEN_CONFIRM_POLL_MS);
      syncUrl();
      const out = detectNewReply({
        reading: r.ok ? validCount(r.value) : null,
        baseline: submitBaseline,
        ownText: input.ownText,
      });
      submitBaseline = out.baseline;
      if (!out.hit) return false;
      submitted = true;
      log.info(`[autoConfirm] 探测到本轮「已提交」回复 → 节点=${input.nodeId ?? '无'}`);
      if (input.nodeId) {
        const s = store.useStore.getState();
        if (s.nodePendingTimers[input.nodeId] != null) {
          s.setNodeTimer(input.nodeId, ports.clock.now());
          s.removeNodePendingTimer(input.nodeId);
        }
      }
      confirmingNotice(null);
      return true;
    };

    /** 写「后台等待生成确认」warn（原 `Le`，`:1797-1811`）—— 已有**别的 code** 的通知 ⇒ 不动 */
    function warnNotice(text: string): void {
      if (!input.nodeId || !alive()) return;
      const s = store.useStore.getState();
      const existing = s.nodeNotices[input.nodeId];
      if (existing && existing.code !== 'generation-confirm') return;
      s.setNodeNotice(input.nodeId, {
        level: 'warn',
        code: 'generation-confirm',
        accountId: input.accountId,
        title: GEN_CONFIRM_TEXT.titleWaiting,
        text,
      });
    }

    /** 写/清「正在确认后台生成」info（原 `Ge`，`:1813-1831`）—— `null` ⇒ 清 */
    function confirmingNotice(text: string | null): void {
      if (!input.nodeId || !alive()) return;
      const s = store.useStore.getState();
      const existing = s.nodeNotices[input.nodeId];
      if (existing && existing.code !== 'generation-confirm') return;
      if (text) {
        s.setNodeNotice(input.nodeId, {
          level: 'info',
          code: 'generation-confirm',
          accountId: input.accountId,
          title: GEN_CONFIRM_TEXT.titleConfirming,
          text,
        });
        return;
      }
      if (existing?.accountId === input.accountId) s.clearNodeNotice(input.nodeId);
    }

    /** 动作之后等「已提交」回执（原 `while (T() && Date.now() - Ne < 90000 && !(await dt())) {}`） */
    const waitAck = async (ctx: ImageQuestionContext): Promise<void> => {
      await sleep(GEN_CONFIRM_SETTLE_MS);
      const until = ports.clock.now() + GEN_CONFIRM_ACK_WAIT_MS;
      while (alive() && ports.clock.now() < until) {
        if (await detectSubmitted(ctx)) return;
      }
    };

    const startedAt = ports.clock.now();
    try {
      // ── ③ 探测循环（原 `:1895-1916`）──
      let hit = false;
      while (alive() && ports.clock.now() - startedAt < GEN_CONFIRM_MAX_MS) {
        await sleep(GEN_CONFIRM_POLL_MS);
        if (!alive()) break;
        const ctx = ctxOf();
        if (!ctx) break;

        if (await detectSubmitted(ctx)) return;

        const r = await gen.probeConfirmRequest(ctx);
        const reading = r.ok ? validCount(r.value) : null;
        // ⚠️ 源把 `ge()` 放在"读数**有效**"分支里（`dt` 里则是无条件）—— 照抄这个不对称
        if (reading) syncUrl();
        const out = detectNewReply({
          reading,
          baseline: confirmBaseline,
          ownText: input.ownText,
        });
        confirmBaseline = out.baseline;
        if (out.hit) {
          hit = true;
          break;
        }
      }

      if (!hit) {
        const stillAlive = alive();
        log.info(
          `[autoConfirm] 账号=${input.accountId} 探测结束 detected=false alive=${stillAlive} 耗时=${ports.clock.now() - startedAt}ms`,
        );
        if (stillAlive) warnNotice(GEN_CONFIRM_TEXT.detectTimeout);
        return;
      }

      // ── ④ 命中「要确认」：冷静 2s → 先试内联按钮，再试自动回复确认语（原 `:1922-2030`）──
      confirmingNotice(GEN_CONFIRM_TEXT.confirmRequired);
      await sleep(GEN_CONFIRM_ACTION_DELAY_MS);
      if (!alive()) return;
      const ctx = ctxOf();
      if (!ctx) return;

      const clicked = await gen.clickConfirm(ctx);
      if (clicked.ok && clicked.value?.clicked) {
        log.info(
          `[autoConfirm] 账号=${input.accountId} 已点击内联确认按钮「${clicked.value.label ?? ''}」`,
        );
        await waitAck(ctx);
        if (alive() && !submitted) warnNotice(GEN_CONFIRM_TEXT.clickedNoAck);
        return;
      }
      log.info(`[autoConfirm] 账号=${input.accountId} 无内联按钮 → 自动回复确认语`);

      // ① 输入框必须**空**（原 `j0` 的 `confirm-input-before`；最多 3 次 × 500ms）
      let before = await gen.readComposer(ctx);
      for (
        let i = 0;
        i < GEN_CONFIRM_INPUT_RETRIES && alive() && (!before.ok || !before.value?.found || !!before.value?.text);
        i += 1
      ) {
        await sleep(GEN_CONFIRM_INPUT_POLL_MS);
        before = await gen.readComposer(ctx);
      }
      if (!alive()) return;
      if (!before.ok || !before.value?.found || before.value?.error || before.value?.text) {
        warnNotice(GEN_CONFIRM_TEXT.composerNotEmpty);
        return;
      }

      // ② 填确认语 + 点发送（原 `copyTextToClipboard` + `Qe` + `Zl`）
      const sent = await gen.sendComposer(ctx, GEN_CONFIRM_TEXT.confirmReply);
      if (!sent.ok) {
        const text =
          sent.stage === 'clipboard'
            ? GEN_CONFIRM_TEXT.clipboardFail
            : sent.stage === 'mismatch'
              ? GEN_CONFIRM_TEXT.inputMismatch
              : GEN_CONFIRM_TEXT.sendFail;
        log.warn(
          `[autoConfirm] 账号=${input.accountId} 自动回复失败（stage=${sent.stage}）：${sent.detail ?? ''}`,
        );
        warnNotice(text);
        return;
      }
      await waitAck(ctx);
      if (alive() && !submitted) warnNotice(GEN_CONFIRM_TEXT.repliedNoAck);
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      log.warn('[autoConfirm] 自动确认异常：', e);
      warnNotice(GEN_CONFIRM_TEXT.exception(detail));
    } finally {
      triggered.delete(onceKey);
      if (ownLeaseId) ports.backendPage.release(ownLeaseId, 'auto-confirm-done');
    }
  };

  /** 停掉某节点的自动确认（节点被删 / 用户手动停） */
  const stop = (nodeId: string): void => {
    const cancel = running.get(nodeId);
    if (!cancel) return;
    cancel();
    running.delete(nodeId);
  };

  return {
    readBaselines,
    start(input) {
      if (!input.nodeId) {
        log.info('[autoConfirm] 无 sourceNodeId ⇒ 跳过自动确认');
        return;
      }
      if (!genOf(input.accountId)) return;
      // ⚠️ 抽局部量：`input.nodeId` 是可变对象属性，闭包里类型收窄会丢
      const nodeId = input.nodeId;
      // 同一节点已在跑 ⇒ 先停旧的（与 `sendWatch.start` 同规则）
      stop(nodeId);
      let stopped = false;
      const cancel = (): void => {
        stopped = true;
      };
      running.set(nodeId, cancel);
      void run(input, () => stopped).finally(() => {
        // ⚠️ 只在"还是我这一条"时才删（否则会误删后来者）
        if (running.get(nodeId) === cancel) running.delete(nodeId);
      });
    },
    stop,
  };
}
