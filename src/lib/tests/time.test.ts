/**
 * 时间工具单测 —— 回源 `pR`(35735-35757)
 *
 * 原则 7：只测纯逻辑（本文件在 `lib/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { formatClockTime, parseSiteTimestamp } from '../time';

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
