/**
 * usecase · 「发送后监测」的**一轮探测**（原 `_Component43.jsx:2650-2658` 的 4 次调用）
 *
 * 依据（**逐字回源**）：`watchSendReply` 每 2s 依次跑 4 个页内脚本 ——
 *   `ae('detect-gen-ack')` · `$('detect-wait-time')` · `Ne('detect-quota-usage')` · `ye('detect-reply-notice')`。
 *
 * ★ **为什么是"一轮"而不是"整个循环"**（职责边界）：
 *   循环要**跨 180s 持租约**（源 `gt` 复用发送时的 `runtimeLeaseId`），而租约在本仓由
 *   `withBackendPage` 保证「`run` 返回即释放」⇒ 循环必须住在 `run` **里面**。
 *   若把循环做进本文件，usecase 就得**回调 state 去写 store**（倒置 + 违反原则 1）。
 *   ⇒ 本文件只做**一轮**（纯编排、不写 store、不读时间），循环归 `state/sendWatch.ts`。
 *
 * ⚠️ **一轮里各探测"跑不跑"由调用方决定**（源有"等待时长/额度只跑一次"的闩）：
 *   `skip` 里的项直接不发那次调用（省一次页内脚本往返）。
 * ⚠️ 站点**缺**某项能力（`SitePort` 的可选成员）⇒ 读数里**没有那个键**（不是 `null`、不报错）——
 *   与源"helper 拿不到就 `null`"同语义，但**不吞真错误**：`err` 会被如实放进 `errors`。
 */

import type { Account } from '@/stable/model/account';
import type {
  GenAckReading,
  ImageQuestionContext,
  QuotaUsageReading,
  ReplyNoticeReading,
  SitePort,
  WaitTimeReading,
} from '@/core/ports/site.port';
import type { WatchReading } from '@/core/rules/sendWatch';
import { err, ok, type Result } from '@/core/model/result';
import { SEND_TEXT } from '@/constants/text';

/** 本轮的租约上下文（由 `withBackendPage` 的 `run` 回调给） */
export interface ProbeRoundContext {
  account: Account;
  site: SitePort;
  webContentsId: number;
}

/** 本轮要跳过哪些探测（源的两个"只跑一次"闩） */
export interface ProbeRoundSkip {
  /** 等待时长已解析过 ⇒ 不再跑（源 `Re`） */
  waitTime?: boolean;
  /** 额度已预警过 ⇒ 不再跑（源 `Me`） */
  quota?: boolean;
}

/** 一轮的产物：读数 + **逐项失败原文**（原则 6：不静默吞） */
export interface ProbeRoundOutcome {
  reading: WatchReading;
  /**
   * 逐项失败（键 = 探测名，值 = **原始错误原文**）
   *
   * ⚠️ 与源的一处**有意偏离（留痕）**：源 4 个 helper 都是 `try{…}catch{}` + `return null`
   *   （**静默吞**，连日志都没有）⇒ 本仓把失败**如实交出来**，由调用方决定"这一轮跳过"
   *   还是"结束监测"（页面在导航中时确实会短暂失败，不该因此杀掉整条监测）。
   */
  errors: Record<string, string>;
}

/**
 * 跑一轮（4 个探测，**顺序即语义**：与源一致）
 *
 * @returns 恒 `ok` —— 单项失败进 `errors`（整轮不该因为一个探测失败就报废）；
 *   **只有**"站点连一个监测能力都没有"才 `err`（那是装配错误，不是运行时抖动）。
 */
export async function probeSendRound(
  ctx: ProbeRoundContext,
  skip: ProbeRoundSkip = {},
): Promise<Result<ProbeRoundOutcome>> {
  const site = ctx.site;
  const hasAny = !!(site.probeGenAck || site.probeWaitTime || site.probeQuotaUsage || site.probeReplyNotice);
  if (!hasAny) {
    return err('unknown', SEND_TEXT.noCapability(site.kind, '「发送后监测」'));
  }

  const pageCtx: ImageQuestionContext = {
    account: ctx.account,
    webContentsId: ctx.webContentsId,
  };
  const reading: WatchReading = {};
  const errors: Record<string, string> = {};

  // ① 「已接单」计数（原 2650）
  if (site.probeGenAck) {
    const r = await site.probeGenAck(pageCtx);
    if (r.ok) reading.ack = r.value satisfies GenAckReading;
    else errors.genAck = r.message;
  }

  // ② 预计等待时长（原 2651；`Re` 闩由调用方给）
  if (!skip.waitTime && site.probeWaitTime) {
    const r = await site.probeWaitTime(pageCtx);
    if (r.ok) reading.waitTime = r.value satisfies WaitTimeReading;
    else errors.waitTime = r.message;
  }

  // ③ 额度用量（原 2652；`Me` 闩由调用方给）
  if (!skip.quota && site.probeQuotaUsage) {
    const r = await site.probeQuotaUsage(pageCtx);
    if (r.ok) reading.quota = r.value satisfies QuotaUsageReading;
    else errors.quota = r.message;
  }

  // ④ 回复通知（原 2658）
  if (site.probeReplyNotice) {
    const r = await site.probeReplyNotice(pageCtx);
    if (r.ok) reading.notices = r.value satisfies ReplyNoticeReading;
    else errors.notices = r.message;
  }

  return ok({ reading, errors });
}
