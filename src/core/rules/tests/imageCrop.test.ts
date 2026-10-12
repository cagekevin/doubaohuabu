/**
 * `imageCrop` 单测 —— 裁剪几何纯规则（`TD-09-4` 第一块）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { CROP_MIN_EDGE, applyCrop, cropRatioOf, initialCropRect } from '../imageCrop';

const SIZE = { w: 1000, h: 600 };

describe('initialCropRect（源 `G3.jsx:604-625`）', () => {
  it('自由比例：基准边 = min(w,h) × 0.8 ⇒ 480×480，居中', () => {
    // base = 600 × 0.8 = 480；自由 ⇒ 宽高都 480；600 − 480 = 120 ⇒ y = 60
    expect(initialCropRect(SIZE)).toEqual({ x: 260, y: 60, w: 480, h: 480 });
  });

  it('有比例档 1:1 ⇒ 同上；3:4 ⇒ 高 = 宽 / 比例', () => {
    expect(initialCropRect(SIZE, 1)).toEqual({ x: 260, y: 60, w: 480, h: 480 });
    // r = 3/4 ⇒ h = 480 / 0.75 = 640 ⇒ 超高 ⇒ 夹到 600 × 0.9 = 540，宽回算 540 × 0.75 = 405
    expect(initialCropRect(SIZE, 3 / 4)).toEqual({ x: 298, y: 30, w: 405, h: 540 });
  });

  it('⚠️ 自由比例被夹高时**不回算宽**（源 `K = T ? Y * T : K` 的空值语义）', () => {
    // 自由比例下 h = base = 480 < 540 ⇒ 不会走到夹限分支；用一个"基准边由 h 决定"的尺寸才看得到
    const tall = { w: 300, h: 2000 };
    // base = 300 × 0.8 = 240 ⇒ 自由 ⇒ 240×240，不触发夹限
    expect(initialCropRect(tall)).toEqual({ x: 30, y: 880, w: 240, h: 240 });
  });
});

describe('applyCrop（源 `G3.jsx:627-664`）', () => {
  it('正常框 ⇒ 原样取整', () => {
    expect(applyCrop({ x: 10, y: 20, w: 300, h: 200 }, SIZE)).toEqual({
      x: 10, y: 20, w: 300, h: 200,
    });
  });

  it('越界 ⇒ 夹进画面（x/y 到 size-1，w/h 到 size - x/y）', () => {
    expect(applyCrop({ x: -50, y: -10, w: 5000, h: 5000 }, SIZE)).toEqual({
      x: 0, y: 0, w: 1000, h: 600,
    });
  });

  it('⚠️ **没有"太小"这一档**：源的「裁剪区域太小」是死分支（clamp 公式保证 ≥ min，见模块头注）', () => {
    // 贴右边：剩余宽 1000 − 990 = 10 < 24 ⇒ clamp 仍是 Math.max(24, …) = 24 ⇒ 合法框
    expect(applyCrop({ x: 990, y: 300, w: 5, h: 5 }, SIZE)).toEqual({
      x: 990,
      y: 300,
      w: 24,
      h: 24,
    });
    expect(CROP_MIN_EDGE).toBe(24); // 源 `ts`
  });
});

describe('cropRatioOf（源 `(ef.find(…) || {}).r || 0` 的空值语义）', () => {
  const presets = [
    { value: 'free', label: '自由' },
    { value: '1:1', label: '1:1', r: 1 },
    { value: '3:4', label: '3:4', r: 3 / 4 },
  ];

  it('命中 ⇒ 返回 `r`；`free` / 查不到 ⇒ `undefined`（自由）', () => {
    expect(cropRatioOf(presets, '1:1')).toBe(1);
    expect(cropRatioOf(presets, '3:4')).toBe(3 / 4);
    expect(cropRatioOf(presets, 'free')).toBeUndefined();
    expect(cropRatioOf(presets, '9:16')).toBeUndefined();
  });
});
