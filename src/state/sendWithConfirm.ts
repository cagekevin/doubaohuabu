/**
 * 「发送 ＋ 生成确认」的**共享实现** —— 源 `sendPayload` 的**发送半**
 * （`_Component43.jsx:2838`（`Ge` 粗筛）＋ `:2846-2861`（读基线）＋ `:2865-3005`（发送后写尝试 ＋ 起确认））。
 *
 * ★★ **为什么必须共享**：源里这一整套（读基线 → `Be` 发送 → 写 `_pendingAttempt` → 起生成确认）
 *   是**同一个函数** `sendPayload`，三个来源共用。本仓有三条发送路 ——
 *   ① `core/usecases/generate` 的 `sendViaWeb`（GenPanel 文生图 / 文生视频）
 *   ② `state/batchSend` 的 `transport`（批量发送 ＋ 发送队列，**两者共用**）
 *   ③ `state/accountOps` 的 `sendAccountNode`（账号节点「填入」）
 *   —— 三者**必须做同一套**；分开写必然漏（本仓实测：① ② 此前**整条没接**，
 *   表现就是"发了但后台要确认、没人点 ⇒ 永远不出片"）。
 *
 * ⚠️ 原则 1：只有 `state` 写 store（本文件属 `state/**`）。
 * ⚠️ 原则 6：失败**原样转发**；基线读不到 ⇒ **如实挂 warn 通知**（源 `:2988-2996`），不静默。
 */

import type { Ports } from '@/core/ports';
import type { SendResult } from '@/core/ports/site.port';
import { err, type Result } from '@/core/model/result';
import type { Account } from '@/stable/model/account';
import type { SiteSendPayload } from '@/core/rules/payload';
import { needsGenerationConfirm } from '@/core/rules/genConfirm';
import { BACKEND_LOAD_TIMEOUT_MS } from '@/constants';
import { BACKEND_PAGE_TEXT, GEN_CONFIRM_TEXT } from '@/constants/text';
import { log } from '@/lib/log';
import type { AppStore } from './store';
import type { AutoConfirmController } from './autoConfirm';
import type { PendingAttemptController } from './pendingAttempt';

export interface SendConfirmDeps {
  store: AppStore;
  ports: Ports;
  /** ★ **单例**（它自己持有 running / onceKey 两张表）—— 由 `container` 注入 */
  autoConfirm: AutoConfirmController;
  /** 待归属尝试写入器（原 `sendPayload` 的两处写入）—— 缺 ⇒ 不写（由调用方负责） */
  pendingAttempt?: PendingAttemptController;
}

/** 「要不要确认 ＋ 发送前的两条基线」（源 `Ge` ＋ `sendPayload:2846-2861`） */
export interface ConfirmBaseline {
  /** 发送前的页面地址（原 `ve.beforeUrl`）—— 判「刚跳进 `/chat/` ⇒ 基线归零」 */
  beforeUrl: string;
  /** ★ `null` = 两条基线有一条没读到 ⇒ 源**暂停自动确认**（只挂 warn） */
  baseline: { confirm: number; submit: number } | null;
}

/**
 * **发送前**：这条发送要不要确认（源 `Ge`）＋ 读两条基线（源 `:2846-2861`）
 *
 * @returns `null` = **本条不需要确认**（站点没有 `genConfirm` 能力 / 粗筛不过）⇒ 调用方跳过
 *   ⚠️ 站点能力那一道是**本仓显式加的**：源靠"只有豆包系会走到这里"隐含；本仓不问就会在
 *      没有该能力的站点上白读一趟、然后挂一句**假 warn**（"未取得有效回复基线"）。
 */
export async function prepareConfirm(
  deps: SendConfirmDeps,
  input: { account: Account; payload: SiteSendPayload },
): Promise<ConfirmBaseline | null> {
  if (!deps.ports.sites[input.account.type]?.genConfirm) return null;

  const needs = needsGenerationConfirm({
    autoSend: input.payload.autoSend,
    // ★ 源 `!Q.imageParams`：本仓 `SiteSendPayload` 不带该字段 ⇒ 用**同源标记**
    //   （`PL` 是唯一产 `imageParams` 的报文 ⇒ `source === 'canvas-image-gen'`）
    isImageGen: input.payload.source === 'canvas-image-gen',
    imageCount: input.payload.images.length,
    params: input.payload.params,
    genParams: input.payload.genParams,
    text: input.payload.text,
  });
  if (!needs) return null;

  // ⚠️ **必须在发送之前读**（源 `:2846-2861`）：发送之后「已提交」回复可能已经出现 ⇒ 基线会把它吞掉
  const href = deps.ports.backendPage.hrefOf(input.account);
  const idRes = deps.ports.backendPage.webContentsIdOf(input.account);
  const baseline = idRes.ok
    ? await deps.autoConfirm.readBaselines({ account: input.account, webContentsId: idRes.value })
    : null;
  return { beforeUrl: href.ok ? href.value : '', baseline };
}

/**
 * **发送后**：起自动确认（源 `:2985-3005`）
 *
 * ⚠️ 判据 `ge.ok && ge.autoClicked && Ge`（源 `:2985`）—— **只填不点**（`autoClicked=false`）不起。
 * ⚠️ 基线没读到 ⇒ **暂停自动确认**并挂 warn（源 `:2988-2996`）—— 不猜、不误发。
 */
export function startConfirmAfterSend(
  deps: SendConfirmDeps,
  input: {
    account: Account;
    payload: SiteSendPayload;
    /** 源 `sendPayload` 的第三个入参 `me`（真节点 id）—— 通知 / 计时挂它 */
    nodeId: string | null;
    /** `prepareConfirm` 的产物；`null` ⇒ 本条**不需要**确认 */
    prepped: ConfirmBaseline | null;
    sent: Result<SendResult>;
    /**
     * 发送链那条租约（原 `ve.runtimeLeaseId`）—— 只有 `accountOps`（走 `withBackendPage`）有；
     * 另两条路没有 ⇒ 传 `null`，由 `autoConfirm` **自申请一条**。
     */
    runtimeLeaseId?: string | null;
  },
): void {
  const prepped = input.prepped;
  if (!prepped) return;
  if (!input.sent.ok || !input.sent.value.autoClicked) return;
  if (!input.nodeId) return; // 源 `kt` 要节点（挂通知 / 计时）

  if (!prepped.baseline) {
    // 源 `:2988-2996`：基线没取到 ⇒ 暂停自动确认（避免误发），只挂 warn 通知
    log.warn(`[sendConfirm] 账号=${input.account.id} 发送前未取得有效回复基线 → 暂停自动确认`);
    deps.store.useStore.getState().setNodeNotice(input.nodeId, {
      level: 'warn',
      code: 'generation-confirm',
      accountId: input.account.id,
      title: GEN_CONFIRM_TEXT.titleWaiting,
      text: GEN_CONFIRM_TEXT.noBaseline,
    });
    return;
  }

  // ⚠️ **fire-and-forget**（源 `kt(...)` 不 await）—— 它自己申请独立租约、跑完自释放
  deps.autoConfirm.start({
    accountId: input.account.id,
    nodeId: input.nodeId,
    baselineCount: prepped.baseline.confirm,
    submitBaselineCount: prepped.baseline.submit,
    beforeUrl: prepped.beforeUrl,
    ownText: input.payload.text,
    runtimeLeaseId: input.runtimeLeaseId ?? null,
  });
}

/**
 * ★★ **三条发送路共用**的「发送 ＋ 确认」（源 `sendPayload` 的发送半）
 *
 * 顺序（**逐条对源**）：
 *   ① **备好后台页**（源 `vr`，`:2727-2738`）—— 申请租约 ⇒ 页面保持挂载 ＋ 等就绪 ＋ **不导航**；
 *      **失败即返回**（源硬闸 `:2732`）
 *   ② `prepareConfirm`（读基线 —— **必须在发送前**）
 *   ③ `send()`（真正的 `site.send`）
 *   ④ 写 `_pendingAttempt`（源 `Be` 返回后**立刻**写：成功 `:2907-2913` / 失败 `:2935-2941`）
 *   ⑤ `startConfirmAfterSend`（源 `:2985-3005`）
 *   ⑥ `finally` 释放租约
 *      ⚠️ **有意偏离源（留痕）**：源**成功**时不释放（`:3009` 把 `Z` 交给 `gt` CDP 待归属队列），
 *         **失败**才释放（`:3015 rn(Z,'send-failed')`）。本仓**没有** CDP 待归属队列这条消费者
 *         （结果通道走 `postSendDetect`）⇒ 立即释放无消费者可破坏；而「自动确认」**自申请独立租约**
 *         （`autoConfirm.ts:126`）⇒ 也不依赖这条。⇒ 立即释放**安全**，且合 M4「作用域即配对」。
 */
export async function sendWithConfirm(
  deps: SendConfirmDeps,
  input: {
    account: Account;
    payload: SiteSendPayload;
    /** 真节点 id（原 `sendPayload` 的第三个入参 `me`） */
    nodeId: string | null;
    /** ★ 真正的发送（`site.send`）—— 由本函数在**读基线之后**调 */
    send: () => Promise<Result<SendResult>>;
    /**
     * 要不要写 `_pendingAttempt`。
     * ⚠️ 网页**文生图**那条传 `false`：源传的 `sourceNodeId` 是 `'imggen:' + key` ⇒
     *    `updateNodeData` 找不到节点 ⇒ **空写**（本仓那两处传的是真节点 id ⇒ 用本开关还原）。
     */
    writeAttempt?: boolean;
    /** 发送链那条租约（见 `startConfirmAfterSend`）—— 没有 ⇒ 省略（自申请） */
    runtimeLeaseId?: string | null;
  },
): Promise<Result<SendResult>> {
  // ★★ **备好后台页**（源 `sendPayload` 的 `vr(...)`，`:2727-2738`）—— 它同时办三件事：
  //    ① 取租约 ⇒ 该账号进「保持挂载」集合（`leasedAccounts` ⇒ `BackendView` 不卸载它）
  //    ② **等页面就绪**（轮询 ＋ 失败自动重载一次）
  //    ③ 拿 `webContentsId`
  // ⚠️ **不给 `targetUrl`** ⇒ **不导航**（续用当前会话页）—— 源 `vr` 本就如此
  //    （`backendPage.ts:381-392` 明写"只在给了 `targetUrl` 时才导航"）。
  // ⚠️ **它是「生成确认」的前置**：基线要在**发送前**读页内脚本 ⇒ 页面没就绪就读不到
  //    ⇒ `startConfirmAfterSend` 走"暂停确认"那条 ⇒ **整条确认链空转**。
  const prepared = await deps.ports.backendPage.prepareForSend(input.account, {
    // ★ 照源 `:2728`：`jobId: me || \`send:${Date.now()}\`` —— 有节点用节点 id，否则用时间戳
    jobId: input.nodeId ?? `send:${deps.ports.clock.now()}`,
    purpose: 'generation',
    timeoutMs: BACKEND_LOAD_TIMEOUT_MS,
  });
  if (!prepared.ok) {
    // ★★ **硬闸，照源**（`sendPayload:2732-2738`）：`vr` 失败 ⇒ **直接返回失败、不发送**。
    //    ⚠️ 页面没就绪就发 = 在坏页面上跑页内脚本（Phase1/2/3）⇒ 必失败，且可能造成**部分发送**
    //       （文本发出去了、图没附上）⇒ 更难诊断。**早失败**才是源的行为。
    //    ⚠️ 三路一致：`accountOps`（走 `withBackendPage`）同样是硬闸（原则 6：原样转发）。
    return err(prepared.reason, prepared.message || BACKEND_PAGE_TEXT.loadFailed, prepared.cause);
  }

  try {
    const prepped = await prepareConfirm(deps, { account: input.account, payload: input.payload });
    const sent = await input.send();

    // ★ 源在 `Be` 返回后**立刻**写「待归属尝试」（出片认领 + `conversationId`）
    if (input.writeAttempt !== false && input.nodeId && deps.pendingAttempt) {
      if (sent.ok) {
        await deps.pendingAttempt.recordSent({
          nodeId: input.nodeId,
          accountId: input.account.id,
          prompt: input.payload.text,
          payloadParams: input.payload.params,
        });
      } else {
        deps.pendingAttempt.recordFailed({
          nodeId: input.nodeId,
          accountId: input.account.id,
          prompt: input.payload.text,
          note: sent.message,
        });
      }
    }

    startConfirmAfterSend(deps, {
      account: input.account,
      payload: input.payload,
      nodeId: input.nodeId,
      prepped,
      sent,
      ...(input.runtimeLeaseId === undefined ? {} : { runtimeLeaseId: input.runtimeLeaseId }),
    });
    return sent;
  } finally {
    // 源 `:2916-2919` 的 `finally { Se(); … }` —— 租约**必释**（M4：作用域即配对）
    if (prepared.ok) deps.ports.backendPage.release(prepared.value.leaseId, 'done');
  }
}
