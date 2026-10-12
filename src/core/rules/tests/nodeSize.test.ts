import { describe, expect, it } from 'vitest';
import {
  NODE_AREA_FIXED_BASE_SIZE,
  computeSizeSync,
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
