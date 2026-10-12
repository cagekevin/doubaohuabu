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
 * ⚠️ **不开自动轮询**：这里的轮询只在**本函数调用期间**存在，返回即停（`docs/过程.md` #4）
 * ⚠️ 失败一律返 `Result`（`docs/过程.md` #6）
 *
 * ★ **一处有意偏离（已留痕）**：源版 `mS` 的"回复稳定"判定是**坏的** ——
 *   `u = h.text; h.text === u ? d += 1 : …`（`39026-39027`）里 `u` 是**刚赋值的同一个值**，
 *   故 `h.text === u` **恒真** ⇒ `d` 每轮都被重置成 `1`、**永远到不了 `d >= 2`**
 *   ⇒ 实际行为是「**每轮都跑满 50 次 = 150 秒**」。
 *   本实现按**意图**做（连续 `ASK_REPLY_STABLE_READS` 次读数相同即停），
 *   返回值不变（都是最后一次读到的文本），只把无意义的 150 秒等待去掉。
 */

import type { HostPort } from '@/core/ports/host.port';
import type { SitePort, WatermarkThreadOutcome, WatermarkVideo } from '@/core/ports/site.port';
import { err, ok, type Result } from '@/core/model/result';
import { ANALYZE_TEXT, BACKEND_PAGE_TEXT } from '@/constants/text';
import { sleep } from '@/lib/async';
import { log } from '@/lib/log';
import {
  ASK_IMAGE_SETTLE_MS,
  ASK_REPLY_MAX_POLLS,
  ASK_REPLY_POLL_MS,
  ASK_REPLY_STABLE_READS,
  ASK_SEND_CLICK_ATTEMPTS,
  ASK_SEND_CLICK_RETRY_MS,
} from '@/constants';
import { buildReplyReadOptions } from '@/core/rules/analyzePrompt';
import { attachImageToWebview } from '../shared/attachImage';
import { viewOfContext, type WebviewElement } from '../shared/webview';
import { navigateAndWait, runProbe } from '../shared/waits';
// ★ 「文本填入」与发送链**共用一份**（判据 C1）—— 见该文件头注
import { fillText } from './fillText';
import { WATERMARK_FREE_BY_THREAD, WATERMARK_FREE_BY_VID } from './scripts';
import {
  MESSAGE_BASELINE_SCRIPT,
  buildClickSendScript,
  buildReplyReadScript,
  type MessageBaselineResult,
} from './scripts';



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

/**
 * 构造 `SitePort.askWithImage` 的实现（原 `gS`/`yS` 里 `hS` + `mS` 那两段）
 *
 * 顺序（**顺序即语义**）：附参考图 → 静置 1200ms → 填指令 → 点发送 → 等回复
 */
export function createDoubaoAskWithImage(
  host: HostPort,
): NonNullable<SitePort['askWithImage']> {
  return async (ctx, imageUrl, instruction) => {
    const view = viewOfContext(ctx);
    if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);

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
    const view = viewOfContext(ctx);
    if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
    return askAndWaitReply(host, view, ctx.webContentsId, instruction);
  };
}

/** 页内脚本的成功返回（原 `mD` 返回 `{ok:true,url,…}`） */
type WatermarkVidScriptResult = WatermarkVideo & { ok: true };
/** 页内脚本的失败返回（原 `mD` 返回 `{ok:false,error}`） */
type WatermarkVidScriptFail = { ok: false; error: string; note?: string };

/**
 * 无水印拉取的**前置页**（原 `Bd`，`shared.js:36772`）
 *
 * ⚠️ **为什么必须先站过去**：源注释明写「homepage API 在 `/chat/` 页返回空数据」
 *    （`_Component43.jsx:1500`）⇒ 不站过去，三步链第一步就拿到空数据（拉取恒失败）。
 *    而 `withBackendPage` 会把后台页导航到 `site.chatUrl`（`/chat/`）⇒ **这一步不能省**。
 */
const AISPACE_URL = 'https://www.doubao.com/samantha/aispace/';
const AISPACE_RE = /\/samantha\/aispace/;
/** 站过去之后的静置（源 `await new Promise(T => setTimeout(T, 1500))`，`:2106-2108`） */
const AISPACE_SETTLE_MS = 1500;

/**
 * 把 webview 站到 aispace 页上（原 `es(qe, Bd)`）—— 返回**还原函数**；站不过去 ⇒ `null`
 *
 * ⚠️ 还原目标是**导航前的地址**，而源版写死还原到 `La`（`/chat/`，`shared.js:36756`）——
 *    `withBackendPage` 已把页面导航到 `site.chatUrl`，正常路径下两者**同一个值**；
 *    用"原地址"更准，也免掉在站点适配器里再写一份 chat URL（那是 `SitePort.chatUrl` 的事）。
 * ⚠️ 已在 aispace 页 ⇒ **不导航也不还原**（源同判：`if (!/\/samantha\/aispace/.test(url))`）。
 */
async function gotoAispacePage(view: WebviewElement): Promise<(() => void) | null> {
  const before = view.getURL?.() ?? '';
  if (AISPACE_RE.test(before)) return () => undefined;
  const navigated = await navigateAndWait(view, AISPACE_URL);
  if (!navigated) return null;
  await sleep(AISPACE_SETTLE_MS);
  return () => {
    void navigateAndWait(view, before);
  };
}

/**
 * 构造 `SitePort.fetchWatermarkFree` 的实现（原 `_Component43` 的 `xt` 里 `mD` 页内脚本）
 *
 * ⚠️ 脚本封装在 `./scripts.ts`（`WATERMARK_FREE_BY_VID`），本方法只做「找 webview → 站到
 *    aispace → 执行 → 判 ok → 还原」。
 * ⚠️ 不用 `runProbe` 的 `timeoutMs`：`mD` 是**同步 XHR 三步链**（homepage→node_info→download），
 *    耗时不可预期，给超时反而会截断正常拉取（源版也没有超时）。
 * ⚠️ 站不到 aispace 页 ⇒ **明确失败**（源版不检查、直接跑脚本 ⇒ 只会得到含糊的 `empty-response`）。
 */
export function createDoubaoFetchWatermarkFree(): NonNullable<SitePort['fetchWatermarkFree']> {
  return async (ctx, vid) => {
    const view = viewOfContext(ctx);
    if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
    const restore = await gotoAispacePage(view);
    if (!restore) return err('page-timeout', BACKEND_PAGE_TEXT.aispaceNavFailed);
    try {
      const r = await runProbe<WatermarkVidScriptResult | WatermarkVidScriptFail>(
        view,
        `(${WATERMARK_FREE_BY_VID})(${JSON.stringify(vid)})`,
      );
      if (!r.ok) return err('page-error', r.error);
      if (!r.value.ok) return err('page-error', r.value.error);
      return ok(r.value);
    } finally {
      restore();
    }
  };
}

/** 构造 `SitePort.fetchWatermarkFreeByThread` 的实现（原 `resolveThreadAndFetch` 里 `gD` 页内脚本） */
export function createDoubaoFetchWatermarkFreeByThread(): NonNullable<SitePort['fetchWatermarkFreeByThread']> {
  return async (ctx, threadId) => {
    const view = viewOfContext(ctx);
    if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
    // 源 `resolveThreadAndFetch` 同法先站到 aispace（`_Component43.jsx:3098-3118`）
    const restore = await gotoAispacePage(view);
    if (!restore) return err('page-timeout', BACKEND_PAGE_TEXT.aispaceNavFailed);
    try {
      const r = await runProbe<WatermarkThreadOutcome>(
        view,
        `(${WATERMARK_FREE_BY_THREAD})(${JSON.stringify(threadId)})`,
      );
      if (!r.ok) return err('page-error', r.error);
      return ok(r.value);
    } finally {
      restore();
    }
  };
}

/**
 * 检测会话期的「站过 aispace」还原函数（**按账号记**）—— 收尾由 `leaveDetectPage` 触发
 *
 * ⚠️ **为什么要有它**：整个发送后检测（可跑 50 分钟）**只站一次** aispace；逐轮「站过去又站回来」
 *   会 4s 一次抖动（源只在 `finally` 里站回去 —— `_Component43.jsx:1730-1736`）。
 */
const detectRestores = new Map<string, () => void>();

/**
 * 构造 `SitePort.detectVideos` 的实现（原 `it` 的取数段：`Y.getWebContentsId()` ＋
 *   `window.api.detectVideos(Me, Array.from(b.current))`，`_Component43.jsx:1561-1590`）
 *
 * ⚠️ 取数本身在**宿主主进程**（`electron/main.js:2224` 的 `detect-videos`）；本适配器只负责
 *   「站到 aispace 页 → 交 `webContentsId` 与已见键 → 转发 `Result`」。
 */
export function createDoubaoDetectVideos(host: HostPort): NonNullable<SitePort['detectVideos']> {
  return async (ctx, seenKeys) => {
    const view = viewOfContext(ctx);
    if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
    const id = ctx.webContentsId;
    if (!id) return err('page-error', BACKEND_PAGE_TEXT.webContentsIdMissing);

    // ① **只在必要时**站到 aispace（整个检测会话只站一次）
    if (!detectRestores.has(ctx.account.id) && !AISPACE_RE.test(view.getURL?.() ?? '')) {
      const restore = await gotoAispacePage(view);
      if (!restore) return err('page-timeout', BACKEND_PAGE_TEXT.aispaceNavFailed);
      detectRestores.set(ctx.account.id, restore);
    }

    // ② 取数（宿主主进程在 webview 里跑只读脚本 —— 零注入）
    return host.media.detectVideos(id, seenKeys);
  };
}

/** 检测结束 ⇒ 把页面站回去（原 `it` 的 `finally` 里 `es(de, La)`，`_Component43.jsx:1730-1736`） */
export function createDoubaoLeaveDetectPage(): NonNullable<SitePort['leaveDetectPage']> {
  return (ctx) => {
    const restore = detectRestores.get(ctx.account.id);
    if (!restore) return;
    detectRestores.delete(ctx.account.id);
    restore();
  };
}
