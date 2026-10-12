/**
 * 节点不变量单测 —— 对应 docs/08-验证用例.md **W13**（节点类型完整性，8 类）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { validateNode, validateNodes } from '../node';
import { defaultNodeData, NODE_DEFAULTS } from '@/core/model/defaults';
import type { CanvasNode, NodeType } from '@/stable/model/node';

/** 8 类节点全集（真源 = `NODE_DEFAULTS` 的键；与 `core/rules/node.ts` 的必填表同一集合） */
const ALL_TYPES = Object.keys(NODE_DEFAULTS) as NodeType[];

const make = (id: string, type: NodeType): CanvasNode =>
  ({ id, type, position: { x: 1, y: 2 }, data: defaultNodeData(type) }) as CanvasNode;

describe('W13 · 8 类节点全集', () => {
  it('★ 恰好 8 类，与原实现 nodeTypes 一致', () => {
    expect(ALL_TYPES.slice().sort()).toEqual(
      ['account', 'download', 'genvideo', 'group', 'imggen', 'material', 'text', 'video'].sort(),
    );
  });

  it.each(ALL_TYPES)('%s 类：用默认值构造 → 无问题', (type) => {
    const issues = validateNode(make('n1', type));
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });
});

describe('W13 · 不变量校验', () => {
  it('未知类型 → 报错', () => {
    const bad = { id: 'x', type: 'puretext', position: { x: 0, y: 0 }, data: {} } as unknown as CanvasNode;
    const issues = validateNode(bad);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('puretext');
  });

  it('id 为空 → 报错', () => {
    const n = make('', 'text');
    expect(validateNode(n).some((i) => i.field === 'id')).toBe(true);
  });

  it('position 缺失或坐标非数值 → 报错', () => {
    const n = { ...make('n1', 'text'), position: { x: 'a', y: null } } as unknown as CanvasNode;
    expect(validateNode(n).some((i) => i.field === 'position')).toBe(true);
  });

  it('data 缺失 → 报错', () => {
    const n = { id: 'n1', type: 'text', position: { x: 0, y: 0 } } as unknown as CanvasNode;
    expect(validateNode(n).some((i) => i.field === 'data')).toBe(true);
  });

  it('text 缺 duration（数字） → 报错，且定位到 data.duration', () => {
    const n = make('n1', 'text');
    (n.data as { duration?: unknown }).duration = '7';
    const issues = validateNode(n);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('data.duration');
  });

  it('imggen 的 results 不是数组 → 报错', () => {
    const n = make('n1', 'imggen');
    (n.data as { results?: unknown }).results = null;
    expect(validateNode(n).some((i) => i.field === 'data.results')).toBe(true);
  });

  it('批量校验汇总所有节点的问题', () => {
    const nodes = [make('a', 'text'), { ...make('b', 'text'), position: undefined } as unknown as CanvasNode];
    const issues = validateNodes(nodes);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.nodeId).toBe('b');
  });
});
