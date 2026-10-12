/**
 * 豆包 / Dola 的「附原图 + 提问 + 等回复」（原 `hS` + `mS` 的组合）
 *
 * 依据（**逐行回源抄录**）：
 *   - `MD` shared.js:38948-38978 —— 填文本（**剪贴板优先，setter 回落**）
 *   - `mS` shared.js:38990-39043 —— 点发送（3 次）+ 轮询读回复（50×3s）
 *   - `hS` shared.js:38893-38947 —— 附参考图（在 `site/shared/attachImage.ts`）
 *
 * ⚠️ 选择器全在 `./scripts.ts`（不外泄）；`input-lock` 只在「粘贴」那一步用（原 `dS`）
 * ⚠️ 宿主能力一律经 `HostPort`（TD-05-1）
 * ⚠️ **不开自动轮询**：这里的轮询只在**本函数调用期间**存在，返回即停（`docs/10` #4）
 * ⚠️ 失败一律返 `Result`（`docs/10` #6）
 *
 * ★ **一处有意偏离（已留痕）**：源版 `mS` 的"回复稳定"判定是**坏的** ——
 *   `u = h.text; h.text === u ? d += 1 : …`（`39026-39027`）里 `u` 是**刚赋值的同一个值**，
 *   故 `h.text === u` **恒真** ⇒ `d` 每轮都被重置成 `1`、**永远到不了 `d >= 2`**
 *   ⇒ 实际行为是「**每轮都跑满 50 次 = 150 秒**」。
 *   本实现按**意图**做（连续 `ASK_REPLY_STABLE_READS` 次读数相同即停），
 *   返回值不变（都是最后一次读到的文本），只把无意义的 150 秒等待去掉。
 */

import type { HostPort } from '@/core/ports/host.port';
import type { ImageQuestionContext, SitePort, WatermarkThreadOutcome, WatermarkVideo } from '@/core/ports/site.port';
import { err, ok, type Result } from '@/core/model/result';
import { ANALYZE_TEXT } from '@/constants/text';
import { sleep } from '@/lib/async';
import { log } from '@/lib/log';
import {
  ASK_IMAGE_SETTLE_MS,
  ASK_REPLY_MAX_POLLS,
  ASK_REPLY_POLL_MS,
  ASK_REPLY_STABLE_READS,
  ASK_SEND_CLICK_ATTEMPTS,
  ASK_SEND_CLICK_RETRY_MS,
  FILL_TEXT_SETTLE_MS,
} from '@/constants';
import { buildReplyReadOptions } from '@/core/rules/analyzePrompt';
import { withInputLock } from '../shared/inputLock';
import { attachImageToWebview } from '../shared/attachImage';
import { findWebview, type WebviewElement } from '../shared/webview';
import { runProbe } from '../shared/waits';
import { WATERMARK_FREE_BY_THREAD, WATERMARK_FREE_BY_VID } from './scripts';
import {
  INPUT_FOCUS_SCRIPT,
  MESSAGE_BASELINE_SCRIPT,
  READ_INPUT_STATE_SCRIPT,
  buildClickSendScript,
  buildReplyReadScript,
  buildSetInputScript,
  type MessageBaselineResult,
} from './scripts';



/** 读输入框状态（原 `Ql`） */
interface InputState {
  found?: boolean;
  valueLen?: number;
  focused?: boolean;
}

/** 写输入框结果（原 `AD`） */
interface SetInputResult {
  ok?: boolean;
  len?: number;
  reason?: string;
}

/** 点击发送结果（与 `Zl` 同形） */
interface ClickResult {
  ok?: boolean;
  clicked?: boolean;
  error?: string;
}

/** 读回复结果（原 `_D`） */
interface ReplyRead {
  ok?: boolean;
  text?: string;
  reason?: string;
}

/**
 * 把文本填进输入框（原 `MD` 38948）
 *
 * 两档（**顺序即语义**）：
 *   ① **剪贴板**：`writeText` → `withInputLock(pasteToWebview)` → 静置 600ms → 读 `valueLen > 0` 即成功
 *   ② **setter 回落**：直接写 `value`（React 受控组件走原型 setter）+ 补发 `input` 事件
 *
 * ⚠️ 源版在①失败时**不记账**（直接进②），最终失败统一给 `'提示词填入失败'` —— 照抄。
 */
async function fillText(
  host: HostPort,
  view: WebviewElement,
  webContentsId: number,
  text: string,
): Promise<Result<void>> {
  // ① 先聚焦（原 `MD` 38949 的 `On(e, Ap)`）—— 失败不致命（下面还有 setter 那条路）
  await runProbe(view, INPUT_FOCUS_SCRIPT);

  const wrote = await host.clipboard.writeText(text);
  if (wrote.ok && webContentsId) {
    // ⚠️ 粘贴包在 input-lock 里（原 `MD` 38953 的 `dS`）
    await withInputLock(view, async () => {
      await host.clipboard.pasteToWebview(webContentsId);
    });
    await sleep(FILL_TEXT_SETTLE_MS);
    const state = await runProbe<InputState>(view, READ_INPUT_STATE_SCRIPT);
    if (state.ok && state.value && (state.value.valueLen ?? 0) > 0) return ok(undefined);
  }

  // ② setter 回落（原 `MD` 38966）
  const set = await runProbe<SetInputResult>(view, buildSetInputScript(text));
  if (set.ok && set.value?.ok && (set.value.len ?? 0) > 0) return ok(undefined);
  return err('unknown', ANALYZE_TEXT.fillTextFailed);
}

/**
 * 填指令 → 点发送 → 等回复（原 `mS` 38990）
 *
 * @returns 回复**原文**（`{ok:true, text}`）；失败按源版三句文案分类
 */
export async function askAndWaitReply(
  host: HostPort,
  view: WebviewElement,
  webContentsId: number,
  instruction: string,
): Promise<Result<{ text: string }>> {
  // ① 填文本
  const filled = await fillText(host, view, webContentsId, instruction);
  if (!filled.ok) return err('unknown', filled.message, filled.cause);

  // ② 读「发送前的消息基线」（原 `mS` 39000-39001）
  //   ⚠️ 失败**不阻断**（源设计 = best-effort：拿不到基线就当空），但必须**留痕** ——
  //      否则「脚本崩」与「页面确实没有旧消息」不可分辨（TD-16-106）。
  const baselineProbe = await runProbe<MessageBaselineResult>(view, MESSAGE_BASELINE_SCRIPT);
  const baselineResult: MessageBaselineResult = baselineProbe.ok
    ? baselineProbe.value
    : { ok: false, error: baselineProbe.error };
  const baseline = baselineResult.ok ? baselineResult.list : [];
  if (!baselineResult.ok) {
    // 读者 = 开发者（走 `lib/log` 唯一入口）
    log.warn(
      '[askAndWaitReply] 消息基线读取失败（本轮按空基线继续，旧回复可能被误判为新回复）:',
      baselineResult.error,
    );
  }

  // ③ 点发送（重试 3 次，间隔 800ms；原 `mS` 39003-39016）
  let clicked = false;
  for (let i = 0; i < ASK_SEND_CLICK_ATTEMPTS; i += 1) {
    const click = await runProbe<ClickResult>(view, buildClickSendScript());
    if (click.ok && click.value?.ok && click.value.clicked) {
      clicked = true;
      break;
    }
    await sleep(ASK_SEND_CLICK_RETRY_MS);
  }
  if (!clicked) return err('send-stuck', ANALYZE_TEXT.sendButtonMissing);

  // ④ 轮询读回复（原 `mS` 39017-39031）
  const readScript = buildReplyReadScript(buildReplyReadOptions(instruction, baseline));
  let last = '';
  let stable = 0;
  let got = false;

  for (let i = 0; i < ASK_REPLY_MAX_POLLS; i += 1) {
    await sleep(ASK_REPLY_POLL_MS);
    const probe = await runProbe<ReplyRead>(view, readScript);
    const text = probe.ok && probe.value?.ok && typeof probe.value.text === 'string' ? probe.value.text : '';
    if (!text) {
      // 还没出现（或脚本报 no-reply-block）⇒ 稳定计数归零
      stable = 0;
      continue;
    }
    got = true;
    if (text === last) stable += 1;
    else stable = 0;
    last = text;
    if (stable + 1 >= ASK_REPLY_STABLE_READS) break;
  }

  if (!got || !last) return err('page-timeout', ANALYZE_TEXT.replyMissing);
  return ok({ text: last });
}

/** 取该账号的后台 `<webview>`（三级回落，找不到返 `null`） */
const viewOfAccount = (ctx: ImageQuestionContext): WebviewElement | null =>
  findWebview({
    id: ctx.account.id,
    partition: ctx.account.partition,
    type: ctx.account.type,
  });

/**
 * 构造 `SitePort.askWithImage` 的实现（原 `gS`/`yS` 里 `hS` + `mS` 那两段）
 *
 * 顺序（**顺序即语义**）：附参考图 → 静置 1200ms → 填指令 → 点发送 → 等回复
 */
export function createDoubaoAskWithImage(
  host: HostPort,
): NonNullable<SitePort['askWithImage']> {
  return async (ctx, imageUrl, instruction) => {
    const view = viewOfAccount(ctx);
    if (!view) return err('page-error', '该账号的 webview 未初始化');

    const attached = await attachImageToWebview({ clipboard: host.clipboard }, view, ctx.webContentsId, imageUrl);
    if (!attached.ok) return err(attached.reason, attached.message, attached.cause);

    await sleep(ASK_IMAGE_SETTLE_MS);
    return askAndWaitReply(host, view, ctx.webContentsId, instruction);
  };
}

/**
 * 构造 `SitePort.pingQueueProgress` 的实现（原 `_Component43.jsx:2200-2266` 的**页面动作半**）
 *
 * ★ **为什么直接复用 `askAndWaitReply`**（判据 C1）：源那三步 —— `ae('queue-ping-baseline')`
 *   → `ze(…,'queue-ping-fill')`（填 `aD`，而 `aD` 写进去的就是哨兵句 `lm`）
 *   → `ze(…,'queue-ping-send')` → `we()` 读回复 —— 与本仓「记基线 → 填字 → 点发送 → 读回复」
 *   **逐步同构**。差别只有「不带图」和「源的这一步只读一次」⇒ 那不是新能力，是**同一能力的一次短等待用法**
 *   ⇒ 不另抄一份页内编排。
 *
 * ⚠️ 失败一律原样转发（原则 6）；页面没就绪时报 `page-error`，由调用方决定是否留痕。
 */
export function createDoubaoPingQueueProgress(
  host: HostPort,
): NonNullable<SitePort['pingQueueProgress']> {
  return async (ctx, instruction) => {
    const view = viewOfAccount(ctx);
    if (!view) return err('page-error', '该账号的 webview 未初始化');
    return askAndWaitReply(host, view, ctx.webContentsId, instruction);
  };
}

/** 页内脚本的成功返回（原 `mD` 返回 `{ok:true,url,…}`） */
type WatermarkVidScriptResult = WatermarkVideo & { ok: true };
/** 页内脚本的失败返回（原 `mD` 返回 `{ok:false,error}`） */
type WatermarkVidScriptFail = { ok: false; error: string; note?: string };

/**
 * 构造 `SitePort.fetchWatermarkFree` 的实现（原 `_Component43` 的 `xt` 里 `mD` 页内脚本）
 *
 * ⚠️ 脚本封装在 `./scripts.ts`（`WATERMARK_FREE_BY_VID`），本方法只做「找 webview → 执行 → 判 ok」。
 * ⚠️ 不用 `runProbe` 的 `timeoutMs`：`mD` 是**同步 XHR 三步链**（homepage→node_info→download），
 *    耗时不可预期，给超时反而会截断正常拉取（源版也没有超时）。
 */
export function createDoubaoFetchWatermarkFree(): NonNullable<SitePort['fetchWatermarkFree']> {
  return async (ctx, vid) => {
    const view = viewOfAccount(ctx);
    if (!view) return err('page-error', '该账号的 webview 未初始化');
    const r = await runProbe<WatermarkVidScriptResult | WatermarkVidScriptFail>(
      view,
      `(${WATERMARK_FREE_BY_VID})(${JSON.stringify(vid)})`,
    );
    if (!r.ok) return err('page-error', r.error);
    if (!r.value.ok) return err('page-error', r.value.error);
    return ok(r.value);
  };
}

/** 构造 `SitePort.fetchWatermarkFreeByThread` 的实现（原 `resolveThreadAndFetch` 里 `gD` 页内脚本） */
export function createDoubaoFetchWatermarkFreeByThread(): NonNullable<SitePort['fetchWatermarkFreeByThread']> {
  return async (ctx, threadId) => {
    const view = viewOfAccount(ctx);
    if (!view) return err('page-error', '该账号的 webview 未初始化');
    const r = await runProbe<WatermarkThreadOutcome>(
      view,
      `(${WATERMARK_FREE_BY_THREAD})(${JSON.stringify(threadId)})`,
    );
    if (!r.ok) return err('page-error', r.error);
    return ok(r.value);
  };
}
