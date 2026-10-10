/**
 * 许可有效期展示（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：`H3` shared.js:42609-42623
 *
 * ⚠️ 文案**逐字对齐原版**（SSOT 在 `constants/text.ts` 的 `LICENSE_TEXT`）：
 *    `已过期` / `永久` / `剩余约 N 天` / `剩余约 N 小时`
 *    ★ 2026-10-10 修正：`LICENSE_TEXT` 原先写 `永久授权` / `剩余 N 天` / `剩余 N 小时`
 *      —— 而 `永久授权` 在**原版全仓 0 命中**（已 `grep` 核实），另两处漏了「约」字
 *      ⇒ 属**行为不等价**，已按源修正（单测锁死字面量，防再漂移）。
 *
 * ⚠️ 阈值（与原实现一致）：
 *    · `left <= 0` ⇒ `已过期`
 *    · `floor(left / 86400000) >= 36500`（= 100 年）⇒ `永久`
 *    · `>= 1 天` ⇒ 报天；否则报小时且**至少 1 小时**（`Math.max(h, 1)` —— 剩 5 分钟也显示「剩余约 1 小时」）
 *
 * ⚠️ 时间一律由调用方注入（原则 4：本模块不碰 `Date.now`）。
 */

import { LICENSE_TEXT } from '@/constants/text';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
/** 「永久」阈值（天）—— 原实现写死 `36500` */
const PERPETUAL_DAYS = 36500;

/**
 * 是否已过期（原 `H3` 42611 的 `if (t <= 0)` 分支**单独抽出**，供启动校验用）
 *
 * ⚠️ **判据只有这一处**：`formatLicenseRemaining` 也调它，不另写一遍 `left <= 0`
 *    （避免同一规则两份表达式 —— 改一处漏一处的经典来源）。
 */
export function isLicenseExpired(expireAt: number, now: number): boolean {
  return expireAt - now <= 0;
}

/** 有效期文案（原 `H3` 42609） */
export function formatLicenseRemaining(expireAt: number, now: number): string {
  if (isLicenseExpired(expireAt, now)) return LICENSE_TEXT.expired;

  const left = expireAt - now;
  const days = Math.floor(left / DAY_MS);
  if (days >= PERPETUAL_DAYS) return LICENSE_TEXT.permanent;
  if (days >= 1) return LICENSE_TEXT.remainingDays(days);

  return LICENSE_TEXT.remainingHours(Math.max(Math.floor(left / HOUR_MS), 1));
}
