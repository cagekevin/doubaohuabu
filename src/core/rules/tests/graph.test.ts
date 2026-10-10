/**
 * 图规则单测 —— 对应 docs/08-验证用例.md **W6**（连线环检测）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { applyConnection, detachConnection, detectCycle } from '../graph';
import type { CanvasEdge } from '@/stable/model/project';
import type { CanvasNode } from '@/stable/model/node';
import { CIRCULAR_REF_MESSAGE } from '@/constants/text';

/** 造一个 text 节点 */
const textNode = (id: string, referenceOrder: string[] = []): CanvasNode =>
  ({
    id,
    type: 'text',
    position: { x: 0, y: 0 },
    data: { text: id, aspectRatio: '16:9', duration: 7, linkOrder: [], referenceOrder, materialIds: [], styleIds: [] },
  }) as CanvasNode;

/** 造一个 material 节点 */
const matNode = (id: string): CanvasNode =>
  ({ id, type: 'material', position: { x: 0, y: 0 }, data: { name: id, dataUrl: `img://${id}.png` } }) as CanvasNode;

let seq = 0;
const makeEdge = (c: { source: string; target: string }): CanvasEdge => ({
  id: `e_${++seq}`,
  source: c.source,
  target: c.target,
  type: 'interactive',
});

describe('W6 · detectCycle（原 `r$`）', () => {
  it('空 source/target → false', () => {
    expect(detectCycle([textNode('a')], [], '', 'a')).toBe(false);
    expect(detectCycle([textNode('a')], [], 'a', '')).toBe(false);
  });

  it('★ 自环 → true', () => {
    expect(detectCycle([textNode('a')], [], 'a', 'a')).toBe(true);
  });

  it('★ 只有 text→text 才查环；其它类型直接放行', () => {
    const nodes = [textNode('a'), matNode('m')];
    // a → m：不是 text→text ⇒ 不查环
    expect(detectCycle(nodes, [], 'a', 'm')).toBe(false);
    expect(detectCycle(nodes, [], 'm', 'a')).toBe(false);
    // m → m：自环但 m 不是 text ⇒ 前面的 `source === target` 已返回 true
    expect(detectCycle(nodes, [], 'm', 'm')).toBe(true);
  });

  it('A→B 已存在，再连 B→A ⇒ 成环', () => {
    const nodes = [textNode('A'), textNode('B')];
    const edges: CanvasEdge[] = [{ id: 'e1', source: 'A', target: 'B', type: 'interactive' }];
    expect(detectCycle(nodes, edges, 'B', 'A')).toBe(true);
  });

  it('A→B→C 已存在，连 C→A ⇒ 成环（多跳）', () => {
    const nodes = [textNode('A'), textNode('B'), textNode('C')];
    const edges: CanvasEdge[] = [
      { id: 'e1', source: 'A', target: 'B', type: 'interactive' },
      { id: 'e2', source: 'B', target: 'C', type: 'interactive' },
    ];
    expect(detectCycle(nodes, edges, 'C', 'A')).toBe(true);
    // 反向不成环
    expect(detectCycle(nodes, edges, 'A', 'C')).toBe(false);
  });

  it('菱形（A→B, A→C, B→D, C→D）连 D→A ⇒ 成环', () => {
    const nodes = ['A', 'B', 'C', 'D'].map((i) => textNode(i));
    const edges: CanvasEdge[] = [
      { id: 'e1', source: 'A', target: 'B', type: 'interactive' },
      { id: 'e2', source: 'A', target: 'C', type: 'interactive' },
      { id: 'e3', source: 'B', target: 'D', type: 'interactive' },
      { id: 'e4', source: 'C', target: 'D', type: 'interactive' },
    ];
    expect(detectCycle(nodes, edges, 'D', 'A')).toBe(true);
    expect(detectCycle(nodes, edges, 'A', 'D')).toBe(false);
  });

  it('text→text 边里混入非 text 边时，非 text 边不参与遍历', () => {
    const nodes = [textNode('A'), textNode('B'), matNode('M')];
    // A→M 存在（不参与），M→B 存在（不参与）
    const edges: CanvasEdge[] = [
      { id: 'e1', source: 'A', target: 'M', type: 'interactive' },
      { id: 'e2', source: 'M', target: 'B', type: 'interactive' },
    ];
    // 若无视这些边，B 到不了 A ⇒ 不成环
    expect(detectCycle(nodes, edges, 'B', 'A')).toBe(false);
  });
});

describe('W6 · applyConnection', () => {
  it('★ A→B 接受：B.referenceOrder 含 A，A 不含 B', () => {
    const nodes = [textNode('A'), textNode('B')];
    const res = applyConnection(nodes, [], { source: 'A', target: 'B' }, makeEdge);

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const a = res.value.nodes.find((n) => n.id === 'A') as { data: { referenceOrder: string[] } };
    const b = res.value.nodes.find((n) => n.id === 'B') as { data: { referenceOrder: string[] } };
    expect(b.data.referenceOrder).toEqual(['A']);
    expect(a.data.referenceOrder).toEqual([]);
    expect(res.value.edge.source).toBe('A');
    expect(res.value.edge.target).toBe('B');
  });

  it('★ B→A 被拒：message = 「这样连会形成循环引用，已阻止」', () => {
    const nodes = [textNode('A'), textNode('B', ['A'])];
    const edges: CanvasEdge[] = [{ id: 'e1', source: 'A', target: 'B', type: 'interactive' }];
    const res = applyConnection(nodes, edges, { source: 'B', target: 'A' }, makeEdge);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toBe(CIRCULAR_REF_MESSAGE);
  });

  it('重复连线不重复写 referenceOrder', () => {
    const nodes = [textNode('A'), textNode('B', ['A'])];
    const res = applyConnection(nodes, [], { source: 'A', target: 'B' }, makeEdge);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b = res.value.nodes.find((n) => n.id === 'B') as { data: { referenceOrder: string[] } };
    expect(b.data.referenceOrder).toEqual(['A']);
  });

  it('非 text 目标不写 referenceOrder', () => {
    const nodes = [textNode('A'), matNode('M')];
    const res = applyConnection(nodes, [], { source: 'A', target: 'M' }, makeEdge);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const m = res.value.nodes.find((n) => n.id === 'M') as unknown as { data: Record<string, unknown> };
    expect('referenceOrder' in m.data).toBe(false);
  });

  it('端点不存在 → 返回错误（原样描述）', () => {
    const res = applyConnection([textNode('A')], [], { source: 'A', target: 'ZZZ' }, makeEdge);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain('ZZZ');
  });

  it('不可变：不改入参', () => {
    const nodes = [textNode('A'), textNode('B')];
    const before = JSON.stringify(nodes);
    applyConnection(nodes, [], { source: 'A', target: 'B' }, makeEdge);
    expect(JSON.stringify(nodes)).toBe(before);
  });
});

describe('detachConnection（删除边时清理 referenceOrder）', () => {
  it('删边后 target 的 referenceOrder 移除 source', () => {
    const nodes = [textNode('A'), textNode('B', ['A'])];
    const edge: CanvasEdge = { id: 'e1', source: 'A', target: 'B', type: 'interactive' };
    const out = detachConnection(nodes, [edge], edge);

    expect(out.edges).toHaveLength(0);
    const b = out.nodes.find((n) => n.id === 'B') as { data: { referenceOrder: string[] } };
    expect(b.data.referenceOrder).toEqual([]);
  });
});
