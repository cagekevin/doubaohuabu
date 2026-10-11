/**
 * 「整卡点击 vs 拖动」判定单测（原 `YL.jsx:112-125` 的 `x`/`k`）
 *
 * ⚠️ 断言**逐值对源**（曼哈顿距离 `> 6` 才算拖动）—— 不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { isCardClick } from '../cardClick';

describe('isCardClick（原 `k`，`YL.jsx:119-125`）', () => {
  it('★ 没记到起点 ⇒ 开（源的 `!re` 支）', () => {
    expect(isCardClick(null, { x: 100, y: 100 })).toBe(true);
  });

  it('原地点击 / 位移 ≤ 6px ⇒ 开', () => {
    expect(isCardClick({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
    expect(isCardClick({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true); // 恰好 6
    expect(isCardClick({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(true); // 曼哈顿 6
  });

  it('★ 曼哈顿距离 > 6 ⇒ 不开（当拖动）', () => {
    expect(isCardClick({ x: 10, y: 10 }, { x: 17, y: 10 })).toBe(false); // 7
    expect(isCardClick({ x: 10, y: 10 }, { x: 10, y: 17 })).toBe(false);
    expect(isCardClick({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(false); // 曼哈顿 7
    expect(isCardClick({ x: 10, y: 10 }, { x: 100, y: 100 })).toBe(false);
  });

  it('★ 方向无关（绝对值）：向左上拖也判拖动', () => {
    expect(isCardClick({ x: 100, y: 100 }, { x: 93, y: 100 })).toBe(false);
    expect(isCardClick({ x: 100, y: 100 }, { x: 100, y: 93 })).toBe(false);
  });
});
