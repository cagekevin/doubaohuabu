/**
 * 遮脸纯逻辑单测（参数规范化 + 几何 + 格子尺寸）
 *
 * 依据：`em` 25478-25490 / `nL.jsx` 25-38 / `ZD` 39840-39856
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { clamp, expandFaceRect, maskCellSize, normalizeFaceMaskOpts } from '../facemask';
import { FACE_MASK_DEFAULTS, FACE_MASK_EFFECTS } from '@/constants/facemask';

describe('normalizeFaceMaskOpts（原 `em`）', () => {
  it('★ 空/非法输入 → 全默认', () => {
    expect(normalizeFaceMaskOpts(null)).toEqual({
      effect: 'mosaic',
      strength: 1,
      pad: 0.12,
      opacity: 1,
    });
    expect(normalizeFaceMaskOpts('nope')).toEqual({
      effect: 'mosaic',
      strength: 1,
      pad: 0.12,
      opacity: 1,
    });
  });

  it('★ 4 种效果全部接受', () => {
    for (const e of FACE_MASK_EFFECTS) {
      expect(normalizeFaceMaskOpts({ effect: e }).effect).toBe(e);
    }
  });

  it('★ 非法 effect → 回落 mosaic', () => {
    expect(normalizeFaceMaskOpts({ effect: 'pixelate' }).effect).toBe('mosaic');
    expect(normalizeFaceMaskOpts({ effect: 123 }).effect).toBe('mosaic');
  });

  it('★ strength 夹到 [0.4, 3]', () => {
    expect(normalizeFaceMaskOpts({ strength: 0.1 }).strength).toBe(0.4);
    expect(normalizeFaceMaskOpts({ strength: 99 }).strength).toBe(3);
    expect(normalizeFaceMaskOpts({ strength: 1.7 }).strength).toBe(1.7);
  });

  it('★ pad 夹到 [0, 0.6]', () => {
    expect(normalizeFaceMaskOpts({ pad: -1 }).pad).toBe(0);
    expect(normalizeFaceMaskOpts({ pad: 5 }).pad).toBe(0.6);
    expect(normalizeFaceMaskOpts({ pad: 0.3 }).pad).toBe(0.3);
  });

  it('★ 非有限数 → 回落默认（不是夹到边界）', () => {
    expect(normalizeFaceMaskOpts({ strength: NaN }).strength).toBe(1);
    expect(normalizeFaceMaskOpts({ strength: Infinity }).strength).toBe(1);
    expect(normalizeFaceMaskOpts({ pad: NaN }).pad).toBe(0.12);
    expect(normalizeFaceMaskOpts({ strength: 'abc' }).strength).toBe(1);
  });

  it('字符串数字能被 Number() 接受（与源码一致）', () => {
    expect(normalizeFaceMaskOpts({ strength: '2' }).strength).toBe(2);
  });

  it('默认值本身满足范围', () => {
    const d = normalizeFaceMaskOpts({ ...FACE_MASK_DEFAULTS });
    expect(d).toEqual({ effect: 'mosaic', strength: 1, pad: 0.12, opacity: 1 });
  });
});

describe('clamp（原 `Ly`）', () => {
  it('下界 / 上界 / 中间', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('expandFaceRect（原 `nL.jsx` 25-38）', () => {
  const face = { nx: 0.4, ny: 0.4, nw: 0.2, nh: 0.2 }; // 100×100 图 → 20×20 框

  it('★ 无 pad → 等于人脸框本身', () => {
    const r = expandFaceRect(face, 0, 100, 100)!;
    expect(r).toEqual({ x: 40, y: 40, w: 20, h: 20 });
  });

  it('★ pad 0.12 → 按框宽高的 12% 各边外扩', () => {
    const r = expandFaceRect(face, 0.12, 100, 100)!;
    // padX = 20*0.12 = 2.4
    expect(r.x).toBeCloseTo(40 - 2.4);
    expect(r.y).toBeCloseTo(40 - 2.4);
    expect(r.w).toBeCloseTo(20 + 2.4 * 2);
    expect(r.h).toBeCloseTo(20 + 2.4 * 2);
  });

  it('★ 贴边时被夹在图像内（左上）', () => {
    const r = expandFaceRect({ nx: 0, ny: 0, nw: 0.2, nh: 0.2 }, 0.5, 100, 100)!;
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w).toBeCloseTo(20 + 20 * 0.5 * 2); // 不越界
  });

  it('★ 右下贴边时宽度被夹到剩余空间', () => {
    const r = expandFaceRect({ nx: 0.8, ny: 0.8, nw: 0.2, nh: 0.2 }, 0.5, 100, 100)!;
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });

  it('★ 无效人脸框 → null（源码 `!t.nw || !t.nh` 直接抛错）', () => {
    expect(expandFaceRect({ nx: 0, ny: 0, nw: 0, nh: 0.2 }, 0.1, 100, 100)).toBeNull();
    expect(expandFaceRect({ nx: 0, ny: 0, nw: 0.2, nh: 0 }, 0.1, 100, 100)).toBeNull();
  });

  it('★ 图像尺寸为 0 → null（源码抛「图片尺寸无效」）', () => {
    expect(expandFaceRect(face, 0.1, 0, 100)).toBeNull();
    expect(expandFaceRect(face, 0.1, 100, 0)).toBeNull();
  });

  it('框完全在图像外 → 面积 0 → null', () => {
    expect(expandFaceRect({ nx: 2, ny: 2, nw: 0.2, nh: 0.2 }, 0, 100, 100)).toBeNull();
  });
});

describe('maskCellSize（原 `ZD` 39840-39856）', () => {
  it('★ mosaic：max(6, min(w,h) * 0.07 * strength)', () => {
    expect(maskCellSize('mosaic', 200, 300, 1)).toBeCloseTo(14); // 200*0.07
    expect(maskCellSize('mosaic', 50, 50, 1)).toBe(6); // 3.5 → 下限 6
    expect(maskCellSize('mosaic', 200, 200, 2)).toBeCloseTo(28);
  });

  it('★ blur：max(4, min(w,h) * 0.06 * strength)', () => {
    expect(maskCellSize('blur', 200, 200, 1)).toBeCloseTo(12);
    expect(maskCellSize('blur', 50, 50, 1)).toBe(4);
  });

  it('★ dots/grid：max(10, round(min(w,h) * 0.09 * strength))', () => {
    expect(maskCellSize('dots', 200, 200, 1)).toBe(18);
    expect(maskCellSize('grid', 200, 200, 1)).toBe(18);
    expect(maskCellSize('dots', 50, 50, 1)).toBe(10);
    // 取整：200*0.09*1.1 = 19.8 → 20
    expect(maskCellSize('dots', 200, 200, 1.1)).toBe(20);
  });

  it('★ 用**短边**（min(w,h)），不是面积或长边', () => {
    expect(maskCellSize('mosaic', 400, 100, 1)).toBeCloseTo(7); // 100*0.07
  });

  it('strength 越大格子越大（单调）', () => {
    const a = maskCellSize('mosaic', 500, 500, 0.4);
    const b = maskCellSize('mosaic', 500, 500, 3);
    expect(b).toBeGreaterThan(a);
  });
});
