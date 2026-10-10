/**
 * 发送防重（★ 纯函数，必测）
 *
 * 依据（**逐条回源抄录**）：
 *   - `N3` shared.js:41835 —— 防重窗口 `90000`（90 秒）
 *   - `AS` shared.js:41866-41868 —— 内容指纹 = `In(text)` → 去全部空白 → 取前 **200** 字
 *   - `$S` shared.js:41876-41929 —— 入队时跳过「90 秒内内容相同」的节点
 *     （源码判定式：`!force && d && f && f.fp === d && now - f.at < N3`）
 *
 * ⚠️ 本模块只做**判定**（纯函数）；建队列条目 / 写 store / 弹 toast 归 `core/usecases` + `state`（原则 1）。
 * ⚠️ `now` 由调用方注入（原则 4：本模块不碰 `Date.now`）。
 */

import { SEND_DEDUP_MS } from '@/constants';
import { stripHtml } from '@/lib/text';

/**
 * 内容指纹（原 `AS` 41866）
 * ⚠️ 顺序不可换：先 `stripHtml`（去 HTML/实体），**再**去全部空白，**最后**截 200 字
 *    —— 若先去空白，HTML 标签里的空格会被吃掉导致标签拼接，剥离结果就不同了。
 */
export function contentFingerprint(text: unknown): string {
  return stripHtml(String(text ?? '')).replace(/\s+/g, '').slice(0, 200);
}

/** 上次发送记录（原 `IS` 的 value 形状 `{fp, at}`） */
export interface LastSentRecord {
  /** 内容指纹（`contentFingerprint` 的产物） */
  fp: string;
  /** 记录时间（ms） */
  at: number;
}

/**
 * 是否应跳过本次入队（原 `$S` 的判定半）
 *
 * 源码条件逐项对应：`force` → 不跳；指纹为空 → 不跳；无历史 → 不跳；
 * 指纹相同 **且** 距上次记录 `< windowMs` → 跳。
 */
export function shouldSkipResend(
  fingerprint: string,
  last: LastSentRecord | null | undefined,
  now: number,
  opts: { force?: boolean; windowMs?: number } = {},
): boolean {
  if (opts.force) return false;
  if (!fingerprint || !last) return false;
  const windowMs = opts.windowMs ?? SEND_DEDUP_MS;
  return last.fp === fingerprint && now - last.at < windowMs;
}
