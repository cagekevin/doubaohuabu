/**
 * 「生成确认」链的**页内半**（原 `kt` 用到的 `Hd`/`A0`/`lD`/`j0`/`Zl`）
 *
 * 依据（**逐行回源**）：`_Component43.jsx:1738-2052`（`kt` 的 5 处 `ze(...)` 调用）
 *   · `Hd`（`shared.js:37494`）读「已提交 / 正在生成」计数
 *   · `A0`（`:37519`）读「请先确认再生成视频」计数
 *   · `lD`（`:37223`）点回复消息内联的「确认生成」按钮
 *   · `j0`（`:37252`）读输入框内容
 *   · `Zl`（= 本仓 `buildClickSendScript`）点发送
 *
 * ⚠️ 原则 6：本文件**只说"卡在哪一步"**（`ComposerSendOutcome.stage`），
 *    **不自造用户可见文案** —— 文案由 `state/autoConfirm` 从 `constants/text.ts` 取。
 * ⚠️ 循环 / 计时 / 落 store **不在这里**（那是 `state/autoConfirm` 的事，判据 A1）。
 * ⚠️ 每个方法都假定调用方**已持有该账号的后台页租约**（且是"续用当前页"的那种）。
 */
import type { HostPort } from '@/core/ports/host.port';
import type {
  ClickConfirmReading,
  ComposerSendOutcome,
  ComposerTextReading,
  ImageQuestionContext,
  ReplyCountReading,
  SitePort,
} from '@/core/ports/site.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { sleep } from '@/lib/async';
import { BACKEND_PAGE_TEXT } from '@/constants/text';
import {
  GEN_CONFIRM_INPUT_SETTLE_MS,
  GEN_CONFIRM_SEND_RETRIES,
  GEN_CONFIRM_SEND_RETRY_MS,
} from '@/constants';
import { withInputLock } from '../shared/inputLock';
import { runProbe } from '../shared/waits';
import { viewOfContext, type WebviewElement } from '../shared/webview';
import {
  CLICK_CONFIRM_BUTTON_SCRIPT,
  GEN_CONFIRM_REQUEST_COUNT_SCRIPT,
  GEN_SUBMITTED_COUNT_SCRIPT,
  INPUT_FOCUS_SCRIPT,
  READ_COMPOSER_TEXT_SCRIPT,
  buildClickSendScript,
} from './scripts';

function safeId(view: WebviewElement): number {
  try {
    const id = view.getWebContentsId?.();
    return typeof id === 'number' && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

/**
 * 「把 `text` 填进输入框并点发送」（原 `kt` 的 `copyTextToClipboard` → `Qe` → `Zl`）
 *
 * ⚠️ **不复用 `./fillText`**：那条链是**提问链**的填法（验证用 `Ql` **读长度**，且带 setter 回落）；
 *   源这里用的是 `j0`（**读内容并逐字比对**）+ 三次点发送 —— 是**另一条**流程
 *   （判据 C1 管的是"同一形态"，这两条不是同一形态）。
 */
async function sendComposer(
  host: HostPort,
  ctx: ImageQuestionContext,
  text: string,
): Promise<ComposerSendOutcome> {
  const view = viewOfContext(ctx);
  if (!view) return { ok: false, stage: 'no-view' };
  const wcId = ctx.webContentsId || safeId(view);

  // ① 写剪贴板（原 `const ie = await window.api.copyTextToClipboard(qe)`）
  const wrote = await host.clipboard.writeText(text);
  if (!wrote.ok) return { ok: false, stage: 'clipboard', detail: wrote.message };

  // ② 聚焦 ＋ 粘贴（原 `await Qe(ae)`）
  try {
    await runProbe(view, INPUT_FOCUS_SCRIPT);
    if (!wcId) return { ok: false, stage: 'paste', detail: BACKEND_PAGE_TEXT.webContentsIdMissing };
    const pasted = await withInputLock(view, () => host.clipboard.pasteToWebview(wcId));
    if (!pasted.ok) return { ok: false, stage: 'paste', detail: pasted.message };
  } catch (e: unknown) {
    return { ok: false, stage: 'paste', detail: toMessage(e) };
  }

  // ③ 校验（原 `j0` 的 `confirm-input-verify`）—— **逐字**比对（脚本已归一空白）
  await sleep(GEN_CONFIRM_INPUT_SETTLE_MS);
  const read = await runProbe<ComposerTextReading>(view, READ_COMPOSER_TEXT_SCRIPT);
  if (!read.ok || read.value?.text !== text) {
    return {
      ok: false,
      stage: 'mismatch',
      detail: read.ok ? read.value?.text : read.error,
    };
  }

  // ④ 点发送（原 `Zl`，**重试 3 次**，第 N 次前退避 `N * 800ms`）
  let lastError = '';
  for (let i = 0; i < GEN_CONFIRM_SEND_RETRIES; i += 1) {
    if (i > 0) await sleep(i * GEN_CONFIRM_SEND_RETRY_MS);
    const click = await runProbe<{ ok?: boolean; error?: string }>(view, buildClickSendScript());
    if (click.ok && click.value?.ok) return { ok: true };
    lastError = click.ok ? (click.value?.error ?? '') : click.error;
  }
  return { ok: false, stage: 'click', detail: lastError || undefined };
}

/** 造 `SitePort.genConfirm`（只有豆包 / Dola 注册它） */
export function createDoubaoGenConfirm(host: HostPort): NonNullable<SitePort['genConfirm']> {
  /** 取 view → 跑脚本 → 包成 `Result`（找不到 view ⇒ `page-error`，**原文保留**） */
  const probeOf = async <T>(
    ctx: ImageQuestionContext,
    script: string,
  ): Promise<Result<T>> => {
    const view = viewOfContext(ctx);
    if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
    const r = await runProbe<T>(view, script);
    return r.ok ? ok(r.value) : err('page-error', r.error);
  };

  return {
    probeSubmitted: (ctx) => probeOf<ReplyCountReading>(ctx, GEN_SUBMITTED_COUNT_SCRIPT),
    probeConfirmRequest: (ctx) => probeOf<ReplyCountReading>(ctx, GEN_CONFIRM_REQUEST_COUNT_SCRIPT),
    clickConfirm: (ctx) => probeOf<ClickConfirmReading>(ctx, CLICK_CONFIRM_BUTTON_SCRIPT),
    readComposer: (ctx) => probeOf<ComposerTextReading>(ctx, READ_COMPOSER_TEXT_SCRIPT),
    sendComposer: (ctx, text) => sendComposer(host, ctx, text),
  };
}
