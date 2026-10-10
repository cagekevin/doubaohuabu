/**
 * 时间工具单测 —— 回源 `pR`(35735-35757)
 *
 * 原则 7：只测纯逻辑（本文件在 `lib/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { parseSiteTimestamp } from '../time';

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
