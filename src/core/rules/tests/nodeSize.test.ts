import { describe, expect, it } from 'vitest';
import {
  NODE_AREA_FIXED_BASE_SIZE,
  computeSizeSync,
  fitVideoBox,
  parseAspect,
} from '../nodeSize';

describe('parseAspect', () => {
  it('解析 `宽:高`（含中文冒号）', () => {
    expect(parseAspect('16:9')).toBeCloseTo(16 / 9);
    expect(parseAspect('1:1')).toBe(1);
    expect(parseAspect('4：3')).toBeCloseTo(4 / 3);
  });

  it('`Auto` / 空 / 非法 ⇒ null（不干预尺寸）', () => {
    expect(parseAspect('Auto')).toBeNull();
    expect(parseAspect('')).toBeNull();
    expect(parseAspect(undefined)).toBeNull();
    expect(parseAspect(null)).toBeNull();
    expect(parseAspect('宽屏')).toBeNull();
  });
});

describe('computeSizeSync', () => {
  it('ratio=null ⇒ 默认尺寸（宽度沿用当前宽度）', () => {
    expect(computeSizeSync(null, { defaultHeight: 300 })).toEqual({ width: 420, height: 300 });
    expect(computeSizeSync(null, { currentWidth: 200, defaultHeight: 300 })).toEqual({
      width: 200,
      height: 300,
    });
  });

  it('width-fixed：宽固定，高 = 宽 ÷ 比例', () => {
    expect(computeSizeSync(2, { mode: 'width-fixed', currentWidth: 400 })).toEqual({
      width: 400,
      height: 200,
    });
  });

  it('area-fixed：面积固定（宽高比乘积守恒）', () => {
    const base = NODE_AREA_FIXED_BASE_SIZE;
    const { width, height } = computeSizeSync(16 / 9, { mode: 'area-fixed' });
    expect(width).toBe(Math.round(Math.sqrt(16 / 9) * base));
    expect(height).toBe(Math.round(base / Math.sqrt(16 / 9)));
  });
});

describe('fitVideoBox（原 `ct`，`BL.jsx:181-223`）', () => {
  it('★ 量不到真实像素（0 / NaN）⇒ null（源 `if (!kt || !xt) return`）', () => {
    expect(fitVideoBox(0, 0)).toBeNull();
    expect(fitVideoBox(1920, 0)).toBeNull();
    expect(fitVideoBox(Number.NaN, 1080)).toBeNull();
  });

  it('★ 横屏 16:9 ⇒ 基准宽 320、高 = round(320 ÷ ratio)', () => {
    expect(fitVideoBox(1920, 1080)).toEqual({ width: 320, height: 180 });
  });

  it('★ 竖屏 9:16 ⇒ 高触上限 460、宽按比例回收', () => {
    // ratio = 0.5625 ⇒ round(320 / 0.5625) = 569 > 460 ⇒ { 高: 460, 宽: round(460 × 0.5625) = 259 }
    expect(fitVideoBox(1080, 1920)).toEqual({ width: 259, height: 460 });
  });

  it('★ 容差 0.02：与 `data` 里**已存**的比例一致 ⇒ 不调（null）', () => {
    expect(fitVideoBox(1920, 1080, 1920, 1080)).toBeNull();
    expect(fitVideoBox(1920, 1080, 1280, 720)).toBeNull(); // 同比例（1.777…）
    // 差 > 2% ⇒ 调
    expect(fitVideoBox(1920, 1080, 1000, 1000)).toEqual({ width: 320, height: 180 });
  });

  it('★ `data` 缺真实像素 ⇒ **不比较**、直接算（源 `gt == null`）', () => {
    expect(fitVideoBox(1920, 1080, undefined, undefined)).toEqual({ width: 320, height: 180 });
    expect(fitVideoBox(1920, 1080, 1920, null)).toEqual({ width: 320, height: 180 });
  });
});
