import { describe, expect, it } from 'vitest';
import {
  collectInputs,
  collectLinkedMaterials,
  countInputs,
  materialDataUrlOf,
  materialLabelOf,
  moveItem,
  orderByMaterialIds,
  type MaterialRefNode,
} from '../linkedMaterials';

const mat = (id: string, label = id, dataUrl = `img://${id}`): MaterialRefNode => ({
  id,
  type: 'material',
  data: { label, dataUrl },
});

const E = (source: string, target: string) => ({ source, target });

describe('collectLinkedMaterials（原 `w`）', () => {
  it('只认**入边**（`target === 本节点`）', () => {
    const nodes = [mat('m1'), mat('m2')];
    // m1 连入 t1；m2 从 t1 连出（出边不算）
    expect(collectLinkedMaterials(nodes, [E('m1', 't1'), E('t1', 'm2')], 't1').map((n) => n.id)).toEqual(['m1']);
  });

  it('只认 `type === "material"`（文本/视频节点不算）', () => {
    const nodes: MaterialRefNode[] = [mat('m1'), { id: 'v1', type: 'video', data: {} }];
    expect(collectLinkedMaterials(nodes, [E('m1', 't1'), E('v1', 't1')], 't1').map((n) => n.id)).toEqual(['m1']);
  });

  it('★ **按 id 去重**（源有 `Set`）—— 同一条边出现两次只算一个', () => {
    const nodes = [mat('m1')];
    expect(collectLinkedMaterials(nodes, [E('m1', 't1'), E('m1', 't1')], 't1')).toHaveLength(1);
  });

  it('源节点不存在（悬挂边）⇒ 跳过，不抛', () => {
    expect(collectLinkedMaterials([mat('m1')], [E('ghost', 't1')], 't1')).toEqual([]);
  });
});

describe('collectInputs / countInputs（原 `Hu` —— 「已连接 N 个输入」）', () => {
  const nodes: MaterialRefNode[] = [
    mat('m1'),
    { id: 'v1', type: 'video', data: {} },
    { id: 't9', type: 'text', data: {} },
  ];

  it('★ 不限类型（文本/视频也算）—— 与 `collectLinkedMaterials` 的唯一差别', () => {
    expect(collectInputs(nodes, [E('m1', 'g1'), E('v1', 'g1'), E('t9', 'g1')], 'g1').map((n) => n.id)).toEqual([
      'm1',
      'v1',
      't9',
    ]);
  });

  it('仍只认**入边**（出边不算）', () => {
    expect(countInputs(nodes, [E('g1', 'm1')], 'g1')).toBe(0);
  });

  it('**按 id 去重**（同源两条边只算一个）', () => {
    expect(countInputs(nodes, [E('m1', 'g1'), E('m1', 'g1')], 'g1')).toBe(1);
    expect(countInputs(nodes, [E('m1', 'g1'), E('v1', 'g1')], 'g1')).toBe(2);
  });
});

describe('materialLabelOf / materialDataUrlOf', () => {
  it('label 优先，回落 name', () => {
    expect(materialLabelOf(mat('m1', '甲'))).toBe('甲');
    expect(materialLabelOf({ id: 'x', type: 'material', data: { name: '乙' } })).toBe('乙');
    expect(materialLabelOf({ id: 'x', type: 'material', data: {} })).toBe('');
  });

  it('没有 dataUrl ⇒ 空串（= 素材缺失）', () => {
    expect(materialDataUrlOf({ id: 'x', type: 'material', data: {} })).toBe('');
  });
});

describe('orderByMaterialIds（原 `v`）', () => {
  const items = [mat('a'), mat('b'), mat('c')];

  it('空表 ⇒ **原样返回**（保持连接顺序）', () => {
    expect(orderByMaterialIds(items, []).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('按表排序', () => {
    expect(orderByMaterialIds(items, ['c', 'a', 'b']).map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });

  it('★ **不在表里的排最后**（排名常量 999），且表里没有的项保持相对顺序', () => {
    expect(orderByMaterialIds(items, ['c']).map((n) => n.id)).toEqual(['c', 'a', 'b']);
    expect(orderByMaterialIds(items, ['b']).map((n) => n.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('moveItem（原拖拽回写）', () => {
  it('移出再插入', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('`from === to` ⇒ 不变', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('越界 ⇒ 返回浅拷贝原数组（不抛、不改原数组）', () => {
    const src = ['a', 'b'];
    expect(moveItem(src, 9, 0)).toEqual(['a', 'b']);
    expect(src).toEqual(['a', 'b']);
  });
});
