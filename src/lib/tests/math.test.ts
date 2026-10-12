/**
 * `lib/math` 单测 —— `clamp`（上一轮建的）与 `toPercent`（`TD-16-109` 收口的原语）
 *
 * 原则 7：只测纯逻辑（本文件在 `lib/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { clamp, toPercent } from '../math';

describe('clamp（逐字等价 `Math.min(Math.max(v, min), max)`）', () => {
  it('界内原样 · 低于下界 ⇒ 下界 · 高于上界 ⇒ 上界', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('toPercent（0..1 比例 ⇒ 百分比整数）', () => {
  it('四舍五入到整数', () => {
    expect(toPercent(0.126)).toBe(13);
    expect(toPercent(0)).toBe(0);
    expect(toPercent(1)).toBe(100);
    expect(toPercent(0.004)).toBe(0);
  });

  it('⚠️ 只服务"比例 ⇒ 百分比"语义；进度条（done/total）是另一种语义，不归它', () => {
    // 对照：FaceMask 的 pad（0..1）用它；SendQueuePanel 的进度（带除零保护）不用它
    expect(toPercent(0.5)).toBe(50);
  });
});
