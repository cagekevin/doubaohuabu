/**
 * 选中节点**网格排布**单测（原 `arrangeSelectedNodes` 的纯半，`shared.js:29635-29694`）
 *
 * ⚠️ 断言**逐值对源**（锚点 / 列数 / 列距 / 尺寸兜底链）—— 不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { planSelectedGrid, type ArrangeSizeLike } from '../arrange';

/** 造一个节点（只给用得上的字段） */
const n = (id: string, x: number, y: number, o: Record<string, unknown> = {}): ArrangeSizeLike =>
  ({
    id,
    position: { x, y },
    ...o,
  }) as unknown as ArrangeSizeLike;

describe('planSelectedGrid（原 `arrangeSelectedNodes` 的纯半）', () => {
  it('★ 选中**少于 2 个** ⇒ `null`（源直接 return，什么都不做）', () => {
    expect(planSelectedGrid([n('a', 0, 0, { selected: true })])).toBeNull();
    expect(planSelectedGrid([n('a', 0, 0)])).toBeNull();
    expect(planSelectedGrid([])).toBeNull();
  });

  it('★ 组内子节点（`parentId`）**不参与**，跟父走（锚点取参与者）', () => {
    const plan = planSelectedGrid([
      n('g', 100, 50, { selected: true }),
      n('c', 0, 0, { selected: true, parentId: 'g' }),
      n('b', 900, 900, { selected: true }),
    ])!;
    expect([...plan.keys()].sort()).toEqual(['b', 'g']);
    expect(plan.get('g')).toEqual({ x: 100, y: 50 }); // 锚点 = 参与者的 min(x)/min(y)
  });

  it('★ 列数 = ceil(sqrt(n))；列距 = 最宽 + gap、行距 = 最高 + gap', () => {
    // 3 个 200×160、gap 16 ⇒ 列数 2、列距 216、行距 176
    const plan = planSelectedGrid(
      [
        n('a', 0, 0, { selected: true, width: 200, height: 160 }),
        n('b', 500, 500, { selected: true, width: 200, height: 160 }),
        n('c', 900, 900, { selected: true, width: 200, height: 160 }),
      ],
      16,
    )!;
    expect(plan.get('a')).toEqual({ x: 0, y: 0 });
    expect(plan.get('b')).toEqual({ x: 216, y: 0 }); // 第 2 列
    expect(plan.get('c')).toEqual({ x: 0, y: 176 }); // 换行
  });

  it('★ 尺寸兜底链：`measured → width → style → data.w → 200/160`（逐字对源 `o`）', () => {
    const plan = planSelectedGrid(
      [
        n('m', 0, 0, { selected: true, measured: { width: 300, height: 300 } }),
        n('s', 500, 500, { selected: true, style: { width: 260, height: 240 } }),
        n('d', 900, 900, { selected: true, data: { w: 240, h: 220 } }),
        n('f', 1300, 1300, { selected: true }),
      ],
      16,
    )!;
    // 最宽 = 300（measured）、最高 = 300 ⇒ 列距 316、行距 316
    expect(plan.get('m')).toEqual({ x: 0, y: 0 });
    expect(plan.get('s')).toEqual({ x: 316, y: 0 });
    expect(plan.get('d')).toEqual({ x: 0, y: 316 });
    expect(plan.get('f')).toEqual({ x: 316, y: 316 });
  });
});
