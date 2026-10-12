/**
 * 豆包 / Dola 的「发送后监测」4 个页内探测（原 `_Component43.jsx:2638-2700` 的 `watchSendReply`）
 *
 * 依据（**逐字回源**）：
 *   | 方法 | 源脚本 | 语义 |
 *   |---|---|---|
 *   | `probeGenAck` | `dD` `shared.js:37544-37576` | 「已接单」回复**计数**（增量判定用） |
 *   | `probeWaitTime` | `fD` `37577-37616` | 解析「预计等待 N 分钟/秒」 |
 *   | `probeReplyNotice` | `pD` `37617-37651` | 按 `REPLY_NOTICE_RULES` 计数 |
 *   | `probeQuotaUsage` | `hD` `37652-37734` | 额度预警 |
 *
 * ⚠️ 脚本封装在 `./scripts.ts`，本文件只做「找 webview → 跑脚本 → 判形状」。
 * ⚠️ **原则 6 的一处有意偏离（留痕）**：源版 4 个 helper（`ae`/`we`/`Se`/`$`）全是
 *   `try { … } catch {}` + `return null`（**静默吞**，连日志都没有）⇒ 本实现把脚本自己的
 *   `error` 字段**如实转成 `err`**，由调用方决定"这一轮跳过"还是"结束监测"。
 * ⚠️ 4 个脚本都是**只读**（`document.body.innerText`）⇒ 不违反站点层零注入。
 */

import type {
  GenAckReading,
  ImageQuestionContext,
  QuotaUsageReading,
  ReplyNoticeReading,
  SitePort,
  WaitTimeReading,
} from '@/core/ports/site.port';
import { err, ok, type Result } from '@/core/model/result';
import { BACKEND_PAGE_TEXT } from '@/constants/text';
import { viewOfContext } from '../shared/webview';
import { runProbe } from '../shared/waits';
import { QUOTA_USAGE_SCRIPT, REPLY_NOTICE_SCRIPT, SEND_REPLY_ACK_SCRIPT, WAIT_TIME_SCRIPT } from './scripts';

/** 4 个脚本的 `catch` 分支都会带一个 `error` 字段（源逐字如此） */
interface ScriptError {
  error?: string;
}

/**
 * 「跑脚本 → 判形状」的公共体（判据 C1：4 个方法同一形态，抽一处）
 *
 * 两种失败都要**如实上报**（原则 6）：
 *   ① 脚本没跑起来（`runProbe` 失败 ⇒ 执行/超时）；
 *   ② 脚本**自己** `catch` 到的错（它把 `error` 放在结果里，不是 reject）。
 */
async function probeScript<T extends ScriptError>(
  ctx: ImageQuestionContext,
  script: string,
): Promise<Result<T>> {
  const view = viewOfContext(ctx);
  if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
  const r = await runProbe<T>(view, script);
  if (!r.ok) return err('page-error', r.error);
  const v = r.value;
  if (typeof v?.error === 'string' && v.error) return err('page-error', v.error);
  return ok(v);
}

/** `dD` 的返回形状 */
type GenAckScript = ScriptError & { count?: number; text?: string };
/** `fD` 的返回形状 */
type WaitTimeScript = ScriptError & { hit?: boolean; minutes?: number; seconds?: number; text?: string };
/** `pD` 的返回形状 */
type ReplyNoticeScript = ScriptError & {
  counts?: Record<string, number>;
  samples?: Record<string, string>;
};
/** `hD` 的返回形状 */
type QuotaUsageScript = ScriptError & {
  lowCount?: number;
  consume?: number | null;
  remain?: number | null;
  reason?: string;
  sample?: string;
};

/** 构造 `SitePort.probeGenAck` 的实现（原 `ae` 用的 `dD`） */
export function createDoubaoProbeGenAck(): NonNullable<SitePort['probeGenAck']> {
  return async (ctx) => {
    const r = await probeScript<GenAckScript>(ctx, SEND_REPLY_ACK_SCRIPT);
    if (!r.ok) return r;
    const v = r.value;
    // `dD` 恒返回 `count`（连 catch 分支也给 0）⇒ 不是数字 = 脚本坏了，明确报错
    if (typeof v.count !== 'number') return err('page-error', BACKEND_PAGE_TEXT.probeBadShape);
    return ok({ count: v.count, text: typeof v.text === 'string' ? v.text : '' } satisfies GenAckReading);
  };
}

/** 构造 `SitePort.probeWaitTime` 的实现（原 `$` 用的 `fD`） */
export function createDoubaoProbeWaitTime(): NonNullable<SitePort['probeWaitTime']> {
  return async (ctx) => {
    const r = await probeScript<WaitTimeScript>(ctx, WAIT_TIME_SCRIPT);
    if (!r.ok) return r;
    const v = r.value;
    // 源 `$` 只认 `W.hit && W.seconds > 0`；其余一律当"本轮没读到"
    if (v.hit !== true || typeof v.seconds !== 'number' || !(v.seconds > 0)) {
      return ok({ hit: false } satisfies WaitTimeReading);
    }
    return ok({
      hit: true,
      minutes: typeof v.minutes === 'number' ? v.minutes : Math.round((v.seconds / 60) * 10) / 10,
      seconds: v.seconds,
      text: typeof v.text === 'string' ? v.text : '',
    } satisfies WaitTimeReading);
  };
}

/** 构造 `SitePort.probeReplyNotice` 的实现（原 `we` 用的 `pD`） */
export function createDoubaoProbeReplyNotice(): NonNullable<SitePort['probeReplyNotice']> {
  return async (ctx) => {
    const r = await probeScript<ReplyNoticeScript>(ctx, REPLY_NOTICE_SCRIPT);
    if (!r.ok) return r;
    const v = r.value;
    // 源 `we` 只认 `W.counts` 是对象；否则当"本轮没读到"
    if (!v.counts || typeof v.counts !== 'object') {
      return ok({ counts: {}, samples: {} } satisfies ReplyNoticeReading);
    }
    return ok({
      counts: v.counts,
      samples: v.samples && typeof v.samples === 'object' ? v.samples : {},
    } satisfies ReplyNoticeReading);
  };
}

/** 构造 `SitePort.probeQuotaUsage` 的实现（原 `Se` 用的 `hD`） */
export function createDoubaoProbeQuotaUsage(): NonNullable<SitePort['probeQuotaUsage']> {
  return async (ctx) => {
    const r = await probeScript<QuotaUsageScript>(ctx, QUOTA_USAGE_SCRIPT);
    if (!r.ok) return r;
    const v = r.value;
    // 源 `Se` 只认 `W.hit` 是布尔；否则当"本轮没读到"
    if (typeof v.lowCount !== 'number') {
      return ok({
        lowCount: 0,
        consume: null,
        remain: null,
        reason: '',
        sample: '',
      } satisfies QuotaUsageReading);
    }
    return ok({
      lowCount: v.lowCount,
      consume: typeof v.consume === 'number' ? v.consume : null,
      remain: typeof v.remain === 'number' ? v.remain : null,
      reason: typeof v.reason === 'string' ? v.reason : '',
      sample: typeof v.sample === 'string' ? v.sample : '',
    } satisfies QuotaUsageReading);
  };
}
