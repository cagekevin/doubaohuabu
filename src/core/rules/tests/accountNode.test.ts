/**
 * 账号节点输入收集单测（原 `RL` shared.js:40531-40680）
 *
 * 断言红线：**实现一变必红** —— 闭包是**传递的**、拓扑序里"入度 0 按 `nodes` 下标排"、
 * 引用编号**跨所有文本共用一个计数器**、`params` 取**首个非空** —— 这四处最容易写错。
 */

import { describe, expect, it } from 'vitest';
import { collectAccountNodeInputs, collectUpstreamOrder } from '../accountNode';
import type { LibraryItem } from '@/stable/model/project';

const text = (id: string, t: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'text',
  data: { text: t, ...extra },
});
const other = (id: string, type = 'material', data: Record<string, unknown> = {}) => ({ id, type, data });

describe('collectUpstreamOrder（原 RL 40537-40587）', () => {
  it('★ 闭包是**传递的**（沿入边一直往上，不是只有直接前驱）', () => {
    // a → b → c（目标），另有 x → b
    const nodes = [text('a', 'A'), text('b', 'B'), text('c', 'C'), text('x', 'X')];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'x', target: 'b' },
      { source: 'b', target: 'c' },
    ];
    const order = collectUpstreamOrder('c', nodes, edges);
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'x']));
    // 拓扑：b 必须在 a/x 之后（有依赖顺序）
    expect(order.indexOf('b')).toBeGreaterThan(order.indexOf('a'));
    expect(order.indexOf('b')).toBeGreaterThan(order.indexOf('x'));
  });

  it('★ 入度为 0 的那批按 **`nodes` 数组下标** 排（≈ 视觉顺序，不是字母序）', () => {
    const nodes = [text('z', 'Z'), text('m', 'M'), text('target', 'T')];
    const edges = [
      { source: 'z', target: 'target' },
      { source: 'm', target: 'target' },
    ];
    // z 在下标 0、m 在下标 1 ⇒ 先 z 后 m（若按字母序会是 m 先）
    expect(collectUpstreamOrder('target', nodes, edges)).toEqual(['z', 'm']);
  });

  it('★ 有环 ⇒ **不丢节点**（残余按原顺序追加到末尾）', () => {
    const nodes = [text('a', 'A'), text('b', 'B'), text('out', 'O')];
    // a ↔ b 成环，且 a → out
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
      { source: 'a', target: 'out' },
    ];
    const order = collectUpstreamOrder('out', nodes, edges);
    expect(new Set(order)).toEqual(new Set(['a', 'b']));
    expect(order).toHaveLength(2);
  });

  it('没有入边 ⇒ 空数组', () => {
    expect(collectUpstreamOrder('t', [text('t', 'T')], [])).toEqual([]);
  });

  it('**出边不算上游**（只看入边）', () => {
    const nodes = [text('t', 'T'), text('down', 'D')];
    expect(collectUpstreamOrder('t', nodes, [{ source: 't', target: 'down' }])).toEqual([]);
  });
});

describe('collectAccountNodeInputs（原 RL 40531-40680）', () => {
  const lib: LibraryItem[] = [
    { id: 'lib_1', favorite: false, name: '素材甲', dataUrl: 'img://a.png' },
  ];

  it('★ 只收**上游的文本节点**（其它类型不算 texts）', () => {
    const nodes = [
      text('t1', '第一段'),
      other('m1', 'material', { dataUrl: 'img://m.png' }),
      { id: 'acct', type: 'account', data: {} },
    ];
    const edges = [
      { source: 't1', target: 'acct' },
      { source: 'm1', target: 'acct' },
    ];
    const out = collectAccountNodeInputs({ nodeId: 'acct', nodes, edges, library: lib });
    expect(out.texts.map((t) => t.id)).toEqual(['t1']);
    // ⚠️ 连线上的素材节点**不进 materials**（materials 只来自 `@` 引用）—— 源版如此
    expect(out.materials).toEqual([]);
  });

  it('★★ `materials` 来自上游文本里的 **`@` 引用**，按**全局首次出现顺序**编号', () => {
    const nodes = [
      text('t1', '看 @[lib_1|甲] 和 @[m_node|乙]'),
      other('m_node', 'material', { dataUrl: 'img://m.png', name: '乙' }),
      { id: 'acct', type: 'account', data: {} },
    ];
    const edges = [{ source: 't1', target: 'acct' }];
    const out = collectAccountNodeInputs({ nodeId: 'acct', nodes, edges, library: lib });
    expect(out.materials.map((m) => [m.id, m.refIndex, m.label])).toEqual([
      ['lib_1', 1, '素材甲'],
      ['m_node', 2, '乙'],
    ]);
  });

  it('★ 引用编号**跨多条文本共用一个计数器**（不是每条从 1 开始）', () => {
    const nodes = [
      text('t1', '@[lib_1|甲]'),
      text('t2', '@[lib_1|甲] @[m_node|乙]'),
      other('m_node', 'material', { dataUrl: 'img://m.png', name: '乙' }),
      { id: 'acct', type: 'account', data: {} },
    ];
    const edges = [
      { source: 't1', target: 'acct' },
      { source: 't2', target: 'acct' },
    ];
    const out = collectAccountNodeInputs({ nodeId: 'acct', nodes, edges, library: lib });
    // lib_1 在 t1 首次出现 ⇒ 1；m_node 在 t2 首次出现 ⇒ 2（**不是 1**）
    expect(out.materials.map((m) => [m.id, m.refIndex])).toEqual([
      ['lib_1', 1],
      ['m_node', 2],
    ]);
    // 每条文本的 refMap 也是那套**全局**编号
    expect(out.texts[0]!.refMap).toEqual({ lib_1: 1 });
    expect(out.texts[1]!.refMap).toEqual({ lib_1: 1, m_node: 2 });
  });

  it('★ 正文里的引用被解析成 `参考图N`', () => {
    const nodes = [text('t1', '看 @[lib_1|甲]'), { id: 'acct', type: 'account', data: {} }];
    const out = collectAccountNodeInputs({
      nodeId: 'acct',
      nodes,
      edges: [{ source: 't1', target: 'acct' }],
      library: lib,
    });
    expect(out.texts[0]!.text).toBe('看 参考图1');
    // `rawText` 保留原文（`$L` 会再解析一次）
    expect(out.texts[0]!.rawText).toBe('看 @[lib_1|甲]');
  });

  it('★ `params` 取**首个非空**（按拓扑序，不是"最后一条覆盖"）', () => {
    const nodes = [
      text('t1', 'A', { aspectRatio: '16:9', duration: 5, model: 'seedance-2.5' }),
      text('t2', 'B', { aspectRatio: '9:16', duration: 10, model: 'seedance-2.0' }),
      { id: 'acct', type: 'account', data: {} },
    ];
    const edges = [
      { source: 't1', target: 'acct' },
      { source: 't2', target: 'acct' },
    ];
    const out = collectAccountNodeInputs({ nodeId: 'acct', nodes, edges, library: lib });
    expect(out.params).toEqual({ aspectRatio: '16:9', duration: 5, model: 'seedance-2.5' });
  });

  it('★ 文本的默认值：`aspectRatio` 缺 ⇒ `16:9`；`duration` 缺 ⇒ **7**；`model` 缺 ⇒ `seedance-2.0-mini`', () => {
    const nodes = [text('t1', 'A'), { id: 'acct', type: 'account', data: {} }];
    const out = collectAccountNodeInputs({
      nodeId: 'acct',
      nodes,
      edges: [{ source: 't1', target: 'acct' }],
      library: lib,
    });
    expect(out.params).toEqual({ aspectRatio: '16:9', duration: 7, model: 'seedance-2.0-mini' });
  });

  it('★ `total = materials + texts`（源版用它判「未连接文本框或素材」）', () => {
    const nodes = [
      text('t1', '@[lib_1|甲]'),
      other('m_node', 'material', { dataUrl: 'img://m.png', name: '乙' }),
      text('t2', '@[m_node|乙]'),
      { id: 'acct', type: 'account', data: {} },
    ];
    const edges = [
      { source: 't1', target: 'acct' },
      { source: 't2', target: 'acct' },
    ];
    const out = collectAccountNodeInputs({ nodeId: 'acct', nodes, edges, library: lib });
    expect(out.texts).toHaveLength(2);
    expect(out.materials).toHaveLength(2);
    expect(out.total).toBe(4);
  });

  it('★ 什么都没有 ⇒ `total === 0`（调用方据此报「未连接文本框或素材」）', () => {
    const out = collectAccountNodeInputs({
      nodeId: 'acct',
      nodes: [{ id: 'acct', type: 'account', data: {} }],
      edges: [],
      library: lib,
    });
    expect(out.total).toBe(0);
    expect(out.params).toEqual({ aspectRatio: null, duration: null, model: null });
  });

  it('★ 空的 `@` 引用文本 ⇒ 仍算一条 text（`total` 含它），但正文为空串', () => {
    const nodes = [text('t1', '   '), { id: 'acct', type: 'account', data: {} }];
    const out = collectAccountNodeInputs({
      nodeId: 'acct',
      nodes,
      edges: [{ source: 't1', target: 'acct' }],
      library: lib,
    });
    expect(out.texts).toHaveLength(1);
    expect(out.texts[0]!.text).toBe('');
    expect(out.total).toBe(1);
  });

  it('引用指向**不存在**的素材 ⇒ label 回落成 id、`dataUrl` 为空（不抛）', () => {
    const nodes = [text('t1', '@[ghost|鬼]'), { id: 'acct', type: 'account', data: {} }];
    const out = collectAccountNodeInputs({
      nodeId: 'acct',
      nodes,
      edges: [{ source: 't1', target: 'acct' }],
      library: lib,
    });
    expect(out.materials[0]).toEqual({ id: 'ghost', label: 'ghost', dataUrl: '', refIndex: 1 });
  });
});
