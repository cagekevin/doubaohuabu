/**
 * 时间工具单测 —— 回源 `pR`(35735-35757)
 *
 * 原则 7：只测纯逻辑（本文件在 `lib/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  formatClockTime,
  formatDateTimeMinute,
  formatLocalDate,
  formatMonthDayMinute,
  formatRelativeTime,
  toIsoTimestamp,
  parseSiteTimestamp,
} from '../time';

describe('parseSiteTimestamp（原 `pR` 35735）', () => {
  it('null / undefined → NaN', () => {
    expect(parseSiteTimestamp(null)).toBeNaN();
    expect(parseSiteTimestamp(undefined)).toBeNaN();
  });

  it('★ 秒 vs 毫秒：< 1e12 视为**秒**（×1000），≥ 1e12 视为**毫秒**', () => {
    expect(parseSiteTimestamp(1700000000)).toBe(1700000000000);
    expect(parseSiteTimestamp(1700000000000)).toBe(1700000000000);
    expect(parseSiteTimestamp('1700000000')).toBe(1700000000000);
  });

  it('★ 边界：恰好 1e12 视为毫秒', () => {
    expect(parseSiteTimestamp(1000000000000)).toBe(1000000000000);
    expect(parseSiteTimestamp(999999999999)).toBe(999999999999000);
  });

  it('★ 非正数 → NaN（源码 `t > 0` 才有效）', () => {
    expect(parseSiteTimestamp(0)).toBeNaN();
    expect(parseSiteTimestamp(-1)).toBeNaN();
  });

  it('非数字字符串 → 按日期串解析', () => {
    expect(parseSiteTimestamp('2026-10-10T00:00:00Z')).toBe(Date.parse('2026-10-10T00:00:00Z'));
    expect(parseSiteTimestamp('not a date')).toBeNaN();
    expect(parseSiteTimestamp({})).toBeNaN();
  });
});

/**
 * ⚠️ 断言策略说明（为什么这里不写死字面量）：
 *    本函数是**本地时区**语义（与源 `toLocaleTimeString` 一致）⇒ 写死 `"12:34:56"`
 *    会让测试依赖跑测机器的 TZ。故断言**格式**与**可推算的增量关系**。
 */
describe('formatClockTime（原 `toLocaleTimeString("zh-CN", { hour12: false })`）', () => {
  const T0 = Date.UTC(2026, 9, 10, 12, 34, 56);

  it('形态恒为 HH:MM:SS（两位补零）', () => {
    expect(formatClockTime(T0)).toMatch(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
  });

  it('★ 秒级递增严格 +1 秒（可推算 ⇒ 不是"仅验不崩"）', () => {
    const a = formatClockTime(T0).split(':').map(Number);
    const b = formatClockTime(T0 + 1000).split(':').map(Number);
    const secA = a[0]! * 3600 + a[1]! * 60 + a[2]!;
    const secB = b[0]! * 3600 + b[1]! * 60 + b[2]!;
    expect(secB - secA).toBe(1);
  });

  it('★ 跨小时进位正确（同一时区下 3661 秒的差就是 1h1m1s）', () => {
    const a = formatClockTime(T0);
    const b = formatClockTime(T0 + 3_661_000);
    const toSec = (s: string): number => {
      const [h, m, sec] = s.split(':').map(Number);
      return h! * 3600 + m! * 60 + sec!;
    };
    // 允许跨午夜（模 86400）
    expect(((toSec(b) - toSec(a)) % 86400 + 86400) % 86400).toBe(3661);
  });

  it('0 点补零（不是 "0:00:00"）', () => {
    expect(formatClockTime(0)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

/**
 * ⚠️ 同上：`formatDateTimeMinute` 也是**本地时区**语义 ⇒ 不写死字面量，
 *    只断言**形态**与**可推算的增量关系**（跨分/跨时/跨日都能推）。
 */
describe('formatDateTimeMinute（原 `l0` 34180）', () => {
  const T0 = Date.UTC(2026, 9, 10, 12, 34, 56);

  it('★ 空 / 0 / 非法 ⇒ 空串（源版 `if (!e) return ""` + `isNaN` 兜底）', () => {
    expect(formatDateTimeMinute(undefined)).toBe('');
    expect(formatDateTimeMinute(null)).toBe('');
    expect(formatDateTimeMinute(0)).toBe('');
    expect(formatDateTimeMinute(NaN)).toBe('');
  });

  it('形态恒为 YYYY-MM-DD HH:mm（两位补零）', () => {
    expect(formatDateTimeMinute(T0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('★ 分钟级递增严格 +1 分钟（可推算 ⇒ 不是"仅验不崩"）', () => {
    const toMin = (s: string): number => {
      const [d, t] = s.split(' ');
      const [y, mo, da] = (d ?? '').split('-').map(Number);
      const [h, mi] = (t ?? '').split(':').map(Number);
      return Date.UTC(y ?? 0, (mo ?? 1) - 1, da ?? 1, h ?? 0, mi ?? 0) / 60000;
    };
    expect(toMin(formatDateTimeMinute(T0 + 60_000)) - toMin(formatDateTimeMinute(T0))).toBe(1);
  });

  it('★ 跨日进位正确（+1 天的分钟差 = 1440）', () => {
    const toMin = (s: string): number => {
      const [d, t] = s.split(' ');
      const [y, mo, da] = (d ?? '').split('-').map(Number);
      const [h, mi] = (t ?? '').split(':').map(Number);
      return Date.UTC(y ?? 0, (mo ?? 1) - 1, da ?? 1, h ?? 0, mi ?? 0) / 60000;
    };
    expect(toMin(formatDateTimeMinute(T0 + 86_400_000)) - toMin(formatDateTimeMinute(T0))).toBe(1440);
  });
});
describe('formatLocalDate（原 `_Component46.jsx:32-38`；后端 `config-store.todayKey` 同形）', () => {
  // ⚠️ 不写死字面量：它是**本地时区**语义，写死会让测试依赖跑测机器的 TZ
  const ms = Date.UTC(2026, 9, 11, 12, 34, 56);
  const p = (n: number): string => String(n).padStart(2, '0');

  it('形如 `YYYY-MM-DD`，且与本地日期字段逐位一致', () => {
    const d = new Date(ms);
    expect(formatLocalDate(ms)).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    expect(formatLocalDate(ms)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('★ 与 `formatDateTimeMinute` 的**日期部分**一致（同一套本地字段 ⇒ 两处不会各算一套）', () => {
    expect(formatLocalDate(ms)).toBe(formatDateTimeMinute(ms).slice(0, 10));
  });

  it('非法时间 ⇒ 空串（不编一个「今天」）', () => {
    expect(formatLocalDate(NaN)).toBe('');
  });
});

describe('formatMonthDayMinute（原 `YL.jsx:460-470` 的 `te`）', () => {
  // ⚠️ 同 `formatLocalDate`：**本地时区**语义 ⇒ 期望值由本地字段推出，不写死字面量
  const ms = Date.UTC(2026, 9, 11, 12, 34, 56);
  const p = (n: number): string => String(n).padStart(2, '0');

  it('形如 `MM-DD HH:mm`，且与本地字段逐位一致（★ **不带年份**）', () => {
    const d = new Date(ms);
    expect(formatMonthDayMinute(ms)).toBe(
      `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
    );
    expect(formatMonthDayMinute(ms)).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
    // ★ 反证：与 `formatDateTimeMinute`（带年份）**不是**同一个串，但**是**它的后缀
    expect(formatMonthDayMinute(ms)).not.toBe(formatDateTimeMinute(ms));
    expect(formatDateTimeMinute(ms).endsWith(formatMonthDayMinute(ms))).toBe(true);
  });

  it('空 / `0` / 非法 ⇒ 空串', () => {
    expect(formatMonthDayMinute()).toBe('');
    expect(formatMonthDayMinute(null)).toBe('');
    expect(formatMonthDayMinute(0)).toBe('');
    expect(formatMonthDayMinute(NaN)).toBe('');
  });
});

describe('toIsoTimestamp（`TD-16-109` 收口的原语）', () => {
  it('纪元毫秒 ⇒ UTC ISO 串（与 `new Date(ms).toISOString()` 逐字等价）', () => {
    expect(toIsoTimestamp(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(toIsoTimestamp(1_760_236_800_000)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('⚠️ 它是 **UTC**（不是本地时区）—— 本地时区请用 `formatDateTimeMinute`', () => {
    // 同一时刻：ISO 恒为 UTC 的 `00:00`，而本地格式化会带时区偏移
    expect(toIsoTimestamp(0)).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('formatRelativeTime（原 `UP` 34366-34385）', () => {
  const NOW = new Date(2026, 0, 20, 12, 0, 0).getTime();

  it('★ 五档：刚刚 / 分钟 / 小时 / 天 / 日期', () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('刚刚'); // < 1 分钟
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5 分钟前');
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 小时前');
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe('2 天前');
  });

  it('★ 各档都是 `Math.floor`（**逐级取整**：59.9 分钟仍是「59 分钟前」）', () => {
    expect(formatRelativeTime(NOW - (59 * 60_000 + 59_000), NOW)).toBe('59 分钟前');
    expect(formatRelativeTime(NOW - 23 * 3_600_000 - 3_599_000, NOW)).toBe('23 小时前');
    // ⚠️ 逐级取整 vs 各自除毫秒：29 天 23 小时 ⇒ 仍是「29 天前」（不是 30 天）
    expect(formatRelativeTime(NOW - (29 * 86_400_000 + 23 * 3_600_000), NOW)).toBe('29 天前');
  });

  it('★ **>= 30 天** ⇒ `YYYY-MM-DD`（本地时区、月日补零）', () => {
    const ts = new Date(2026, 0, 5, 12, 0, 0).getTime();
    expect(formatRelativeTime(ts, ts + 31 * 86_400_000)).toMatch(/^2026-01-05$/);
  });

  it('⚠️ `ts` 在**未来** ⇒ 差值为负 ⇒ 落进「刚刚」（源版如此，照抄）', () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe('刚刚');
  });
});
