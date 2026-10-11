/**
 * 节点整齐排列单测（原 `arrangeNodes` shared.js:31650-31844）
 *
 * 断言红线：**实现一变必红** —— 九种模式的坐标公式、包围盒、`smart` 的**列数与排序**、
 * 等间距的"不足压 0"、以及**带 `parentId` 的节点换回相对坐标**。
 *
 * ★ 最值钱的两条：`smart` 的排序（**选中集内部的边**优先，未连边的追加）与
 *   「组内成员按绝对坐标算、落回时减父偏移」—— 后者写错会让组里的节点飞到别处。
 */

import { describe, expect, it } from 'vitest';
import { planArrange, type ArrangeMode } from '../arrange';
import type { GroupNodeLike } from '../group';

const node = (id: string, x: number, y: number, extra: Partial<GroupNodeLike> = {}): GroupNodeLike => ({
  id,
  type: 'text',
  position: { x, y },
  selected: true,
  ...extra,
});

const pos = (nodes: GroupNodeLike[], id: string): { x: number; y: number } =>
  nodes.find((n) => n.id === id)!.position;

const arrange = (
  nodes: GroupNodeLike[],
  mode: ArrangeMode,
  edges: { source: string; target: string }[] = [],
): GroupNodeLike[] => {
  const r = planArrange(nodes, edges, mode);
  if (!r.ok) throw new Error(`应当成功：${r.reason}`);
  return r.nodes;
};

describe('planArrange · 守卫', () => {
  it('少于 2 个非组节点 ⇒ need-2（选中 0 / 1 个都一样）', () => {
    expect(planArrange([], [], 'left')).toEqual({ ok: false, reason: 'need-2' });
    expect(planArrange([node('a', 0, 0)], [], 'left')).toEqual({ ok: false, reason: 'need-2' });
  });

  it('★ 组节点**不计入**（选中 1 个普通 + 1 个组 ⇒ 仍 need-2）', () => {
    expect(planArrange([node('a', 0, 0), node('g', 0, 0, { type: 'group' })], [], 'left')).toEqual({
      ok: false,
      reason: 'need-2',
    });
  });

  it('不认识的模式 ⇒ unknown-mode（入参故意放宽成 string，这条守卫是**活的**）', () => {
    expect(planArrange([node('a', 0, 0), node('b', 1, 1)], [], 'bogus')).toEqual({
      ok: false,
      reason: 'unknown-mode',
    });
  });

  it('成功时返回**实际参与排列的节点数**（不含组与未选中）', () => {
    const r = planArrange([node('a', 0, 0), node('b', 1, 1), node('g', 0, 0, { type: 'group' })], [], 'left');
    expect(r).toMatchObject({ ok: true, count: 2 });
  });
});

describe('planArrange · 对齐', () => {
  // 两个默认盒（200×180）节点：包围盒 x[0,300] y[0,230]，中心 (150,115)
  const two = (): GroupNodeLike[] => [node('a', 0, 0), node('b', 100, 50)];

  it('left ⇒ 全部贴 `minX`，y 不变', () => {
    const r = arrange(two(), 'left');
    expect(pos(r, 'a')).toEqual({ x: 0, y: 0 });
    expect(pos(r, 'b')).toEqual({ x: 0, y: 50 });
  });

  it('right ⇒ 右边缘对齐 `maxX`（`x = maxX - w`）', () => {
    const r = arrange(two(), 'right');
    expect(pos(r, 'a')).toEqual({ x: 100, y: 0 });
    expect(pos(r, 'b')).toEqual({ x: 100, y: 50 });
  });

  it('hcenter ⇒ 水平居中（`x = cx - w/2`）', () => {
    const r = arrange(two(), 'hcenter');
    expect(pos(r, 'a')).toEqual({ x: 50, y: 0 });
    expect(pos(r, 'b')).toEqual({ x: 50, y: 50 });
  });

  it('top ⇒ 全部贴 `minY`，x 不变', () => {
    const r = arrange(two(), 'top');
    expect(pos(r, 'a')).toEqual({ x: 0, y: 0 });
    expect(pos(r, 'b')).toEqual({ x: 100, y: 0 });
  });

  it('bottom ⇒ 底边缘对齐 `maxY`（`y = maxY - h`）', () => {
    const r = arrange(two(), 'bottom');
    expect(pos(r, 'a')).toEqual({ x: 0, y: 50 });
    expect(pos(r, 'b')).toEqual({ x: 100, y: 50 });
  });

  it('vcenter ⇒ 垂直居中（`y = cy - h/2`）', () => {
    const r = arrange(two(), 'vcenter');
    expect(pos(r, 'a')).toEqual({ x: 0, y: 25 });
    expect(pos(r, 'b')).toEqual({ x: 100, y: 25 });
  });
});

describe('planArrange · 等间距', () => {
  it('hdist ⇒ 按 x 升序铺开；间距不足则**压成 0**', () => {
    // 三个 100×100 的节点叠在 x=0 ⇒ 包围盒宽 100 < Σ宽 300 ⇒ gap = 0
    const nodes = [
      node('a', 0, 0, { width: 100, height: 100 }),
      node('b', 0, 10, { width: 100, height: 100 }),
      node('c', 0, 20, { width: 100, height: 100 }),
    ];
    const r = arrange(nodes, 'hdist');
    expect(pos(r, 'a')).toEqual({ x: 0, y: 0 });
    expect(pos(r, 'b')).toEqual({ x: 100, y: 10 });
    expect(pos(r, 'c')).toEqual({ x: 200, y: 20 });
  });

  it('hdist ⇒ 有富余时按等间距分摊', () => {
    // a 在 0、b 在 500，各宽 100 ⇒ 包围盒宽 600、Σ宽 200 ⇒ gap = 400（保持 500 不变）
    const nodes = [node('a', 0, 0, { width: 100, height: 100 }), node('b', 500, 0, { width: 100, height: 100 })];
    const r = arrange(nodes, 'hdist');
    expect(pos(r, 'a')).toEqual({ x: 0, y: 0 });
    expect(pos(r, 'b')).toEqual({ x: 500, y: 0 });
  });

  it('vdist ⇒ 按 y 升序铺开', () => {
    const nodes = [node('a', 0, 0, { width: 100, height: 100 }), node('b', 0, 0, { width: 100, height: 100 })];
    const r = arrange(nodes, 'vdist');
    expect(pos(r, 'a')).toEqual({ x: 0, y: 0 });
    expect(pos(r, 'b')).toEqual({ x: 0, y: 100 });
  });
});

describe('planArrange · smart（智能网格）', () => {
  it('列数 = `round(sqrt(节点数 × 宽高比))`，格内居中', () => {
    // 两个 200×180：包围盒 300×180 ⇒ cols = round(sqrt(2×300/180)) = 2、rows = 1
    // cellW = 150、cellH = 180 ⇒ x = 0/150 + (150-200)/2 = -25 / 125；y = 0
    const r = arrange([node('a', 0, 0), node('b', 100, 0)], 'smart');
    expect(pos(r, 'a')).toEqual({ x: -25, y: 0 });
    expect(pos(r, 'b')).toEqual({ x: 125, y: 0 });
  });

  it('★ 排序：**选中集内部的边**（源→靶）优先，未连边的按选中顺序追加', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 0), node('c', 0, 0)];
    const r = arrange(nodes, 'smart', [{ source: 'a', target: 'c' }]);
    // order = [a, c, b]；包围盒 200×180 ⇒ cols = round(sqrt(3×200/180)) = 2、rows = 2
    // cellW = 100、cellH = 90 ⇒ a/c 在第一行、b 在第二行
    expect(pos(r, 'a')).toEqual({ x: -50, y: -45 });
    expect(pos(r, 'c')).toEqual({ x: 50, y: -45 });
    expect(pos(r, 'b')).toEqual({ x: -50, y: 45 });
  });

  it('与选中集**外部**的边不参与排序（退回选中顺序）', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 0), node('out', 999, 999, { selected: false })];
    const r = arrange(nodes, 'smart', [{ source: 'a', target: 'out' }]);
    // 包围盒 200×180 ⇒ cols = round(sqrt(2×200/180)) = 1、rows = 2；cellW = 200、cellH = 90
    expect(pos(r, 'a')).toEqual({ x: 0, y: -45 });
    expect(pos(r, 'b')).toEqual({ x: 0, y: 45 });
  });
});

describe('planArrange · 组内成员（相对坐标）', () => {
  it('★ 带 `parentId` 的节点：按**绝对坐标**参与计算，落回时**减去父偏移**', () => {
    const parent = node('g', 1000, 500, { type: 'group', selected: false });
    const c1 = node('c1', 10, 20, { parentId: 'g' }); // 绝对 (1010, 520)
    const c2 = node('c2', 50, 300, { parentId: 'g' }); // 绝对 (1050, 800)
    const r = arrange([parent, c1, c2], 'left');
    // 绝对 minX = 1010 ⇒ 两者都贴 1010 ⇒ 相对 x = 10；y 不变
    expect(pos(r, 'c1')).toEqual({ x: 10, y: 20 });
    expect(pos(r, 'c2')).toEqual({ x: 10, y: 300 });
  });

  it('父节点与未选中节点**原样不动**（同一引用）', () => {
    const parent = node('g', 1000, 500, { type: 'group', selected: false });
    const outsider = node('out', 7, 7, { selected: false });
    const c1 = node('c1', 10, 20, { parentId: 'g' });
    const c2 = node('c2', 50, 300, { parentId: 'g' });
    const r = arrange([parent, c1, c2, outsider], 'left');
    expect(r.find((n) => n.id === 'g')).toBe(parent);
    expect(r.find((n) => n.id === 'out')).toBe(outsider);
  });
});
