/**
 * 更换素材纯层单测 —— 原 `replaceMaterialWithLib` shared.js:27682-27724
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { planMaterialReplaceWithLib } from '../materialReplace';
import type { MaterialNodeLike, RenamableLibraryItem } from '../materialRename';

const matNode = (id: string, data: Record<string, unknown> = {}): MaterialNodeLike => ({
  id,
  type: 'material',
  data: { name: id, dataUrl: `img://${id}.png`, ...data },
});

const textNode = (id: string, data: Record<string, unknown> = {}): MaterialNodeLike => ({
  id,
  type: 'text',
  data: { text: '', materialIds: [], ...data },
});

const lib = (id: string, dataUrl: string, name = id): RenamableLibraryItem => ({ id, name, dataUrl });

/**
 * 窄化助手 —— **失败就抛**（`Result` 是判别联合，不窄化读不到 `.value`）
 *
 * 多数用例是逐条 `if (!r.ok) throw …`；有一条用例有**三处连续断言** ⇒ 抽这一行。
 */
const planOf = (input: Parameters<typeof planMaterialReplaceWithLib>[0]) => {
  const r = planMaterialReplaceWithLib(input);
  if (!r.ok) throw new Error(`应当成功，实得 reason=${r.reason}`);
  return r.value;
};
// ⚠️ 窄化助手由**用例内部**自备（见「新名四级回落」那条的局部 `planOf`）——
//    此处不再放模块级副本（避免两份）。

describe('planMaterialReplaceWithLib（原 `replaceMaterialWithLib` 27682-27724）', () => {
  const library = [lib('m1', 'img://m1.png')];
  const node = matNode('n1', { libId: 'm1' });

  it('★ 守卫四条：节点不在 / 非素材 / 无 data / 条目无图 ⇒ bad-input', () => {
    const item = { id: 'm2', name: '新图', dataUrl: 'img://m2.png', w: 10, h: 20 };
    const bad = { ok: false, reason: 'bad-input', message: '更换素材：节点不是素材节点或未选择图片' };
    expect(planMaterialReplaceWithLib({ nodes: [node], library, nodeId: 'nope', item })).toEqual(bad);
    expect(planMaterialReplaceWithLib({ nodes: [textNode('t1')], library, nodeId: 't1', item })).toEqual(bad);
    const noData: MaterialNodeLike = { id: 'n1', type: 'material' };
    expect(planMaterialReplaceWithLib({ nodes: [noData], library, nodeId: 'n1', item })).toEqual(bad);
    expect(
      planMaterialReplaceWithLib({ nodes: [node], library, nodeId: 'n1', item: { dataUrl: '' } }),
    ).toEqual(bad);
    expect(planMaterialReplaceWithLib({ nodes: [node], library, nodeId: 'n1', item: null })).toEqual(bad);
  });

  it('★ 目标节点换 dataUrl/libId/name/label/natW/natH', () => {
    const r = planMaterialReplaceWithLib({
      nodes: [node],
      library,
      nodeId: 'n1',
      item: { id: 'm2', name: '新图', dataUrl: 'img://m2.png', w: 800, h: 600 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const patched = r.value.nodes.find((n) => n.id === 'n1');
    expect(patched?.data).toMatchObject({
      dataUrl: 'img://m2.png',
      libId: 'm2',
      name: '新图',
      label: '新图',
      natW: 800,
      natH: 600,
    });
  });

  it('★ 引用改指（原 `Gy`）：`@[旧id|名]` 与 `materialIds` 一起改', () => {
    const nodes = [
      node,
      textNode('t1', { text: '看图 @[m1|m1] 谢谢', materialIds: ['m1'] }),
      textNode('t2', { text: '无关 @[other|x]', materialIds: ['other'] }),
    ];
    const r = planMaterialReplaceWithLib({
      nodes,
      library,
      nodeId: 'n1',
      item: { id: 'm2', name: '新图', dataUrl: 'img://m2.png' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t1 = r.value.nodes.find((n) => n.id === 't1');
    expect(t1?.data?.text).toBe('看图 @[m2|新图] 谢谢');
    expect(t1?.data?.materialIds).toEqual(['m2']);
    // 没引用旧 id 的节点**原样不动**（同一引用）
    const t2 = r.value.nodes.find((n) => n.id === 't2');
    expect(t2?.data?.text).toBe('无关 @[other|x]');
    expect(t2?.data?.materialIds).toEqual(['other']);
  });

  it('★ 一处都没改 ⇒ 用原节点数组（源 `c || l`）', () => {
    const nodes = [node, textNode('t1', { text: '没有引用' })];
    const r = planMaterialReplaceWithLib({
      nodes,
      library,
      nodeId: 'n1',
      item: { id: 'm2', name: '新图', dataUrl: 'img://m2.png' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t1 = r.value.nodes.find((n) => n.id === 't1');
    expect(t1?.data?.text).toBe('没有引用');
    // 目标节点仍然换了图
    expect(r.value.nodes.find((n) => n.id === 'n1')?.data?.dataUrl).toBe('img://m2.png');
  });

  it('★ 新名四级回落：item.name → data.name → data.label → 素材', () => {
    const base = { nodes: [matNode('n1', { libId: 'm1', name: '', label: '' })], library, nodeId: 'n1' };
    const item = { id: 'm2', dataUrl: 'img://m2.png' };
    expect(planOf({ ...base, item }).name).toBe('素材');
    expect(planOf({ ...base, item: { ...item, name: '条目名' } }).name).toBe('条目名');
    // 节点自己有 name（item 无名）⇒ 用节点的
    expect(
      planOf({
        nodes: [matNode('n1', { libId: 'm1', name: '节点名' })],
        library,
        nodeId: 'n1',
        item,
      }).name,
    ).toBe('节点名');
    // 节点无 name 有 label ⇒ 用 label
    expect(
      planOf({
        nodes: [matNode('n1', { libId: 'm1', name: '', label: '标签名' })],
        library,
        nodeId: 'n1',
        item,
      }).name,
    ).toBe('标签名');
  });

  it('★ natW/natH 不保留旧值：`item.w || 0`', () => {
    const nodes = [matNode('n1', { libId: 'm1', natW: 999, natH: 999 })];
    const r = planMaterialReplaceWithLib({
      nodes,
      library,
      nodeId: 'n1',
      item: { id: 'm2', name: 'x', dataUrl: 'img://m2.png' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nodes[0]?.data?.natW).toBe(0);
    expect(r.value.nodes[0]?.data?.natH).toBe(0);
  });

  it('★ 从文件选来的条目没有 id ⇒ libId 为 undefined、引用不改', () => {
    const nodes = [node, textNode('t1', { text: '@[m1|m1]', materialIds: ['m1'] })];
    const r = planMaterialReplaceWithLib({
      nodes,
      library,
      nodeId: 'n1',
      // 源 `DT.jsx:21-26`：文件分支写死 400/300
      item: { name: '文件图', dataUrl: 'img://file.png', w: 400, h: 300 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nextId).toBeUndefined();
    expect('libId' in (r.value.nodes[0]?.data ?? {})).toBe(true);
    expect(r.value.nodes[0]?.data?.libId).toBeUndefined();
    // 无新 id ⇒ 引用原样
    expect(r.value.nodes.find((n) => n.id === 't1')?.data?.text).toBe('@[m1|m1]');
    expect(r.value.nodes[0]?.data?.natW).toBe(400);
  });

  it('★ prevLibId 按 dataUrl 反查（节点自己没带 libId 时，原 `Ms`）', () => {
    const nodes = [matNode('n1', { libId: '' })];
    const r = planMaterialReplaceWithLib({
      nodes,
      library: [lib('m1', 'img://n1.png')],
      nodeId: 'n1',
      item: { id: 'm2', name: 'x', dataUrl: 'img://m2.png' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.prevLibId).toBe('m1');
  });

  it('★ 非素材节点即使 id 命中也不被 patch', () => {
    const nodes = [matNode('n1', { libId: 'm1' }), textNode('t1')];
    const r = planMaterialReplaceWithLib({
      nodes,
      library,
      nodeId: 'n1',
      item: { id: 'm2', name: 'x', dataUrl: 'img://m2.png' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nodes.find((n) => n.id === 't1')?.data?.dataUrl).toBeUndefined();
  });
});
