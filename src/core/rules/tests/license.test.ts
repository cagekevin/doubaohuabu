/**
 * 许可有效期单测 —— 回源 `H3`(42609)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 * ⚠️ 本文件**锁死字面量**：`LICENSE_TEXT` 曾把 `永久` 误写成 `永久授权`、漏「约」字
 *    ⇒ 用断言防再漂移（行为不等价 = 缺陷，不是风格差异）。
 */

import { describe, expect, it } from 'vitest';
import { formatDateTime, formatLicenseRemaining, isLicenseExpired } from '../license';
import { LICENSE_TEXT } from '@/constants/text';

const DAY = 86400000;
const HOUR = 3600000;
const NOW = 1_700_000_000_000;

describe('formatLicenseRemaining（原 `H3`）', () => {
  it('已过期（left <= 0）', () => {
    expect(formatLicenseRemaining(NOW, NOW)).toBe('已过期');
    expect(formatLicenseRemaining(NOW - 1000, NOW)).toBe('已过期');
  });

  it('≥ 36500 天 → 永久', () => {
    expect(formatLicenseRemaining(NOW + 36500 * DAY, NOW)).toBe('永久');
    expect(formatLicenseRemaining(NOW + 40000 * DAY, NOW)).toBe('永久');
    // 边界：少一天就不是永久
    expect(formatLicenseRemaining(NOW + 36499 * DAY, NOW)).toBe('剩余约 36499 天');
  });

  it('≥ 1 天 → 报天', () => {
    expect(formatLicenseRemaining(NOW + DAY, NOW)).toBe('剩余约 1 天');
    expect(formatLicenseRemaining(NOW + 100 * DAY, NOW)).toBe('剩余约 100 天');
  });

  it('★ 边界：不足 1 天（`DAY - 1`）⇒ 落到小时分支（23 小时）', () => {
    expect(formatLicenseRemaining(NOW + DAY - 1, NOW)).toBe('剩余约 23 小时');
  });

  it('< 1 天 → 报小时，且**至少 1 小时**（原 `Math.max(h,1)`）', () => {
    expect(formatLicenseRemaining(NOW + 5 * HOUR, NOW)).toBe('剩余约 5 小时');
    expect(formatLicenseRemaining(NOW + 60 * 1000, NOW)).toBe('剩余约 1 小时');
    expect(formatLicenseRemaining(NOW + 1, NOW)).toBe('剩余约 1 小时');
  });
});

describe('isLicenseExpired', () => {
  it('与 formatLicenseRemaining 同判据（left <= 0）', () => {
    expect(isLicenseExpired(NOW, NOW)).toBe(true);
    expect(isLicenseExpired(NOW + 1, NOW)).toBe(false);
  });
});

describe('★ LICENSE_TEXT 字面量锁死（防与源漂移）', () => {
  it('与原版 `H3` 逐字一致', () => {
    expect(LICENSE_TEXT.expired).toBe('已过期');
    expect(LICENSE_TEXT.permanent).toBe('永久'); // 不是「永久授权」
    expect(LICENSE_TEXT.remainingDays(3)).toBe('剩余约 3 天'); // 有「约」
    expect(LICENSE_TEXT.remainingHours(2)).toBe('剩余约 2 小时'); // 有「约」
  });
});

describe('formatDateTime（原 `Zd` 42599）', () => {
  it('★ 格式 `YYYY-MM-DD HH:mm`，月/日/时/分**补零**', () => {
    // ⚠️ 用**本地时间**构造，避免时区把断言弄成 UTC 偏移
    expect(formatDateTime(new Date(2026, 0, 5, 9, 7).getTime())).toBe('2026-01-05 09:07');
    expect(formatDateTime(new Date(2026, 11, 31, 23, 59).getTime())).toBe('2026-12-31 23:59');
  });

  it('★ **秒与毫秒不显示**', () => {
    expect(formatDateTime(new Date(2026, 5, 1, 12, 30, 45, 999).getTime())).toBe('2026-06-01 12:30');
  });

  it('★ 不是数字 / 假值 ⇒ `—`（**不是空串**）', () => {
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(0)).toBe('—');
    expect(formatDateTime('2026-01-01')).toBe('—');
    expect(formatDateTime(NaN)).toBe('—');
  });
});
