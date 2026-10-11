/**
 * 素材网格布局纯层单测（原 `addMaterialsBatch` 的布局半 shared.js:29088-29163）
 *
 * 断言红线（**实现一变必红**）：`fitMaterialSize` 的**长边压制 + `+64`**、
 * `planMaterialGrid` 的**列宽/行高取最大**与**居中偏移**、`autoPlaceCenter` 的**最右/最上**、
 * `isBigGalleryItem` 的**三个或条件**。
 */

import { describe, expect, it } from 'vitest';
import {
  autoPlaceCenter,
  fitMaterialSize,
  isBigGalleryItem,
  planMaterialGrid,
} from '../materialGrid';

describe('fitMaterialSize（原 29091-29106 的 l）', () => {
  it('★ 宽 ≥ 高且宽超上限 ⇒ 宽压到 260、高按比例缩，最后 **+64**', () => {
    expect(fitMaterialSize(400, 300)).toEqual({ w: 260, h: 195 + 64 });
  });

  it('★ 高 > 上限 ⇒ 高压到 260、宽按比例缩', () => {
    expect(fitMaterialSize(300, 400)).toEqual({ w: 195, h: 260 + 64 });
  });

  it('两边都不超上限 ⇒ 原样，仅 **+64**', () => {
    expect(fitMaterialSize(100, 100)).toEqual({ w: 100, h: 100 + 64 });
    // ⚠️ 恰好等于上限**不算**超（源版是 `>`）
    expect(fitMaterialSize(260, 260)).toEqual({ w: 260, h: 260 + 64 });
  });

  it('缺 `natW`/`natH` ⇒ 兜底 200×160', () => {
    expect(fitMaterialSize(undefined, undefined)).toEqual({ w: 200, h: 160 + 64 });
  });

  it('`scale` 放大上限（原 `(r.scale||1) * 260`）', () => {
    expect(fitMaterialSize(520, 260, 2)).toEqual({ w: 520, h: 260 + 64 });
  });
});

describe('planMaterialGrid（原 29088-29160）', () => {
  it('★ 空数组 ⇒ 空计划（宽高 0，cols/rows 0）', () => {
    expect(planMaterialGrid([])).toEqual({ placements: [], cols: 0, rows: 0, width: 0, height: 0 });
  });

  it('★ 单张：以 `(0,0)` 为中心（即左上角在负半区）', () => {
    const plan = planMaterialGrid([{ natW: 100, natH: 100 }]);
    expect(plan.cols).toBe(1);
    expect(plan.rows).toBe(1);
    expect(plan.width).toBe(100);
    expect(plan.height).toBe(164);
    expect(plan.placements).toEqual([{ x: -50, y: -82, w: 100, h: 164 }]);
  });

  it('★ 4 张 100×100：2×2、列宽 100、间距 24、整张居中', () => {
    const items = Array.from({ length: 4 }, () => ({ natW: 100, natH: 100 }));
    const plan = planMaterialGrid(items);
    expect(plan.cols).toBe(2);
    expect(plan.rows).toBe(2);
    expect(plan.width).toBe(100 + 24 + 100); // 224
    expect(plan.height).toBe(164 + 24 + 164); // 352
    // left = -112 / top = -176
    expect(plan.placements.map((p) => [p.x, p.y])).toEqual([
      [-112, -176],
      [12, -176],
      [-112, 12],
      [12, 12],
    ]);
  });

  it('★ **列宽取列内最大 / 行高取行内最大**（参差尺寸也左对齐 + 顶对齐）', () => {
    const items = [
      { natW: 200, natH: 100 }, // {200, 164}
      { natW: 100, natH: 100 }, // {100, 164}
      { natW: 100, natH: 300 }, // 高 300 > 260 ⇒ {87, 260+64=324}
      { natW: 300, natH: 100 }, // 宽 300 > 260 ⇒ {260, 87+64=151}
    ];
    const plan = planMaterialGrid(items);
    expect(plan.cols).toBe(2);
    expect(plan.rows).toBe(2);
    // 列宽：col0 = max(200, 87) = 200；col1 = max(100, 260) = 260
    expect(plan.width).toBe(200 + 24 + 260);
    // 行高：row0 = max(164, 164) = 164；row1 = max(324, 151) = 324
    expect(plan.height).toBe(164 + 24 + 324);
    const left = -plan.width / 2;
    const top = -plan.height / 2;
    expect(plan.placements[2]).toEqual({ x: left, y: top + 188, w: 87, h: 324 });
    expect(plan.placements[3]).toEqual({ x: left + 224, y: top + 188, w: 260, h: 151 });
  });

  it('`centerOn` 平移整张网格（原 `b = v - h/2`）', () => {
    const plan = planMaterialGrid([{ natW: 100, natH: 100 }], { centerOn: { x: 1000, y: 500 } });
    expect(plan.placements[0]).toEqual({ x: 950, y: 418, w: 100, h: 164 });
  });

  it('`snap` 为真 ⇒ 落点吸附到 20 网格（原 `mr`）', () => {
    const plan = planMaterialGrid([{ natW: 100, natH: 100 }], { snap: true });
    // 原始 (-50,-82) ⇒ round(-2.5)*20 = -40（JS 对 .5 向 +∞ 取整）、round(-4.1)*20 = -80
    expect(plan.placements[0]).toMatchObject({ x: -40, y: -80 });
  });

  it('`cols` 显式给出 ⇒ 用它（不给才 `ceil(sqrt(n))`）', () => {
    const items = Array.from({ length: 6 }, () => ({ natW: 100, natH: 100 }));
    expect(planMaterialGrid(items).cols).toBe(3); // ceil(sqrt(6)) = 3
    expect(planMaterialGrid(items, { cols: 2 }).cols).toBe(2);
    expect(planMaterialGrid(items, { cols: 2 }).rows).toBe(3);
  });
});

describe('autoPlaceCenter（原 29134-29157）', () => {
  it('没有节点 ⇒ `(0,0)`', () => {
    expect(autoPlaceCenter([], 24, 224, 352)).toEqual({ x: 0, y: 0 });
  });

  it('★ 落点在**最右边界右侧**、**最上边界向下**', () => {
    // 右边界 = 100 + 200 = 300；最上 = 50
    expect(autoPlaceCenter([{ position: { x: 100, y: 50 }, width: 200 }], 24, 224, 352)).toEqual({
      x: 300 + 48 + 112,
      y: 50 + 176,
    });
  });

  it('★ 缺 `width` ⇒ 按 220 算（源版 `D.width || 220`）', () => {
    expect(autoPlaceCenter([{ position: { x: 0, y: 0 } }], 24, 224, 352)).toEqual({ x: 220 + 48 + 112, y: 0 + 176 });
  });
});

describe('isBigGalleryItem（原 i0 34157）', () => {
  it('★ 三个条件是**或**：体积 > 10 MB / 任一边 ≥ 4096', () => {
    expect(isBigGalleryItem({ sizeBytes: 10485760 })).toBe(false); // 不 > ⇒ 不算
    expect(isBigGalleryItem({ sizeBytes: 10485761 })).toBe(true);
    expect(isBigGalleryItem({ natW: 4096 })).toBe(true);
    expect(isBigGalleryItem({ natH: 4095 })).toBe(false);
    expect(isBigGalleryItem({ natW: 100, natH: 100, sizeBytes: 100 })).toBe(false);
  });

  it('空值 ⇒ false', () => {
    expect(isBigGalleryItem(null)).toBe(false);
    expect(isBigGalleryItem(undefined)).toBe(false);
    expect(isBigGalleryItem({})).toBe(false);
  });
});
