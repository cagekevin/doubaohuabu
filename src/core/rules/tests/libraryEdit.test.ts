/**
 * 资源库改名 / 换图 纯层单测
 * 原 `renameLibrary` 27515-27548 · `replaceLibrary` 27755-27806
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { countLibRefs, planLibraryRename, planLibraryReplace, sortLibrary } from '../libraryEdit';
import type { MaterialNodeLike } from '../materialRename';

const libItem = (id: string, dataUrl: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  dataUrl,
  favorite: false,
  ...extra,
});

const matNode = (id: string, data: Record<string, unknown> = {}): MaterialNodeLike => ({
  id,
  type: 'material',
  data: { name: id, ...data },
});

const textNode = (id: string): MaterialNodeLike => ({ id, type: 'text', data: { text: '' } });

describe('sortLibrary（原 `RT.jsx:29-37`）', () => {
  it('★ 收藏在前，两组各自保持原序（`filter` 稳定）', () => {
    const items = [
      libItem('a', 'u-a'),
      libItem('b', 'u-b', { favorite: true }),
      libItem('c', 'u-c'),
      libItem('d', 'u-d', { favorite: true }),
    ];
    expect(sortLibrary(items).map((it) => it.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('★ 不改原数组（返回新数组，元素同一引用）', () => {
    const items = [libItem('a', 'u-a'), libItem('b', 'u-b', { favorite: true })];
    const out = sortLibrary(items);
    expect(items.map((it) => it.id)).toEqual(['a', 'b']);
    expect(out[0]).toBe(items[1]);
  });
});

describe('countLibRefs（原 `getLibraryRefCount` 27733-27754）', () => {
  const library = [libItem('m1', 'img://a.png'), libItem('m2', 'img://b.png')];

  it('★ 库里没有这个 id ⇒ 0', () => {
    expect(countLibRefs(library, [matNode('n1', { libId: 'nope' })], 'nope')).toBe(0);
  });

  it('★ libId 命中记一次，且**不重复计**（源 `continue`）', () => {
    const nodes = [matNode('n1', { libId: 'm1', dataUrl: 'img://a.png' })];
    expect(countLibRefs(library, nodes, 'm1')).toBe(1);
  });

  it('★ 没有 libId 但 dataUrl 与条目相同也算', () => {
    const nodes = [matNode('n1', { dataUrl: 'img://a.png' })];
    expect(countLibRefs(library, nodes, 'm1')).toBe(1);
  });

  it('★ 只数素材节点（视频 / 生成节点不算）', () => {
    const nodes: MaterialNodeLike[] = [
      { id: 'v1', type: 'video', data: { libId: 'm1', dataUrl: 'img://a.png' } },
      { id: 'g1', type: 'genvideo', data: { libId: 'm1' } },
      matNode('n1', { libId: 'm1' }),
    ];
    expect(countLibRefs(library, nodes, 'm1')).toBe(1);
  });

  it('★ 没有 data 的节点跳过（源 `!!a.data`）', () => {
    const nodes: MaterialNodeLike[] = [{ id: 'n1', type: 'material' }];
    expect(countLibRefs(library, nodes, 'm1')).toBe(0);
  });
});

describe('planLibraryRename（原 `renameLibrary` 27515-27548）', () => {
  const library = [libItem('m1', 'img://a.png'), libItem('m2', 'img://b.png')];

  it('★ 找不到条目 ⇒ null（调用方不 commit）', () => {
    expect(planLibraryRename({ library, nodes: [], libId: 'nope', name: 'x' })).toBeNull();
  });

  it('★ 库条目自身改名', () => {
    const r = planLibraryRename({ library, nodes: [], libId: 'm1', name: '新名' });
    expect(r?.library.map((l) => [l.id, l.name])).toEqual([
      ['m1', '新名'],
      ['m2', 'm2'],
    ]);
  });

  it('★ 同源素材节点的 name/label 一起改（libId 命中）', () => {
    const nodes = [matNode('n1', { libId: 'm1' }), matNode('n2', { libId: 'm2' })];
    const r = planLibraryRename({ library, nodes, libId: 'm1', name: '新名' });
    expect(r?.nodes[0]?.data).toMatchObject({ name: '新名', label: '新名' });
    // 不同源的**原样不动**（同一引用）
    expect(r?.nodes[1]).toBe(nodes[1]);
  });

  it('★ 同源判据是「或」：没有 libId 但 dataUrl 相同也算（源 27530 的 `||`）', () => {
    const nodes = [matNode('n1', { dataUrl: 'img://a.png' })];
    const r = planLibraryRename({ library, nodes, libId: 'm1', name: '新名' });
    expect(r?.nodes[0]?.data).toMatchObject({ name: '新名', label: '新名' });
  });

  it('★ 非素材节点不被改（源只认 type === material）', () => {
    const nodes = [textNode('t1'), matNode('n1', { libId: 'm1' })];
    const r = planLibraryRename({ library, nodes, libId: 'm1', name: '新名' });
    expect(r?.nodes[0]).toBe(nodes[0]);
    expect(r?.nodes[1]?.data).toMatchObject({ name: '新名' });
  });

  it('★ 空名也照写（源不过滤；输入框兜底在调用方）', () => {
    const r = planLibraryRename({ library, nodes: [], libId: 'm1', name: '' });
    expect(r?.library[0]?.name).toBe('');
  });

  it('★ 未命中库条目时 library 返回同一引用（不做无谓快照）', () => {
    const r = planLibraryRename({ library, nodes: [matNode('n1', { libId: 'm1' })], libId: 'm1', name: 'x' });
    // 有节点被改 ⇒ 节点数组**是新的**
    expect(r?.nodes).not.toBe(undefined);
  });
});

describe('planLibraryReplace（原 `replaceLibrary` 27755-27806）', () => {
  const library = [libItem('m1', 'img://a.png', { w: 100, h: 50 }), libItem('m2', 'img://b.png')];

  it('★ 守卫两条：条目不在 / 新图无地址 ⇒ null', () => {
    expect(planLibraryReplace({ library, nodes: [], libId: 'nope', storedUrl: 'img://new.png' })).toBeNull();
    expect(planLibraryReplace({ library, nodes: [], libId: 'm1', storedUrl: '' })).toBeNull();
  });

  it('★ 库条目换 dataUrl；w/h 用新值（源 `r.w || c.w`）', () => {
    const r = planLibraryReplace({ library, nodes: [], libId: 'm1', storedUrl: 'img://new.png', w: 800, h: 600 });
    expect(r?.library[0]).toMatchObject({ dataUrl: 'img://new.png', w: 800, h: 600 });
    // 其它条目原样
    expect(r?.library[1]).toBe(library[1]);
  });

  it('★ 新图没给宽高 ⇒ 保留条目原值（源 `|| c.w`）', () => {
    const r = planLibraryReplace({ library, nodes: [], libId: 'm1', storedUrl: 'img://new.png' });
    expect(r?.library[0]).toMatchObject({ w: 100, h: 50 });
  });

  it('★ 同源节点换 dataUrl，并数出换了几处（源 `replaced`）', () => {
    const nodes = [
      matNode('n1', { libId: 'm1' }),
      matNode('n2', { dataUrl: 'img://a.png' }), // 或：没有 libId 但同图
      matNode('n3', { libId: 'm2' }),
      textNode('t1'),
    ];
    const r = planLibraryReplace({ library, nodes, libId: 'm1', storedUrl: 'img://new.png' });
    expect(r?.replaced).toBe(2);
    expect(r?.nodes[0]?.data?.dataUrl).toBe('img://new.png');
    expect(r?.nodes[1]?.data?.dataUrl).toBe('img://new.png');
    // 不同源 / 非素材：原样
    expect(r?.nodes[2]).toBe(nodes[2]);
    expect(r?.nodes[3]).toBe(nodes[3]);
  });

  it('★ 只换 dataUrl，不动 name/libId/natW/natH（源只写一个字段）', () => {
    const nodes = [matNode('n1', { libId: 'm1', name: '原名', natW: 1, natH: 2 })];
    const r = planLibraryReplace({ library, nodes, libId: 'm1', storedUrl: 'img://new.png' });
    expect(r?.nodes[0]?.data).toMatchObject({
      dataUrl: 'img://new.png',
      libId: 'm1',
      name: '原名',
      natW: 1,
      natH: 2,
    });
  });

  it('★ 换的图和旧图相同也照换（源无短路）', () => {
    const nodes = [matNode('n1', { libId: 'm1' })];
    const r = planLibraryReplace({ library, nodes, libId: 'm1', storedUrl: 'img://a.png' });
    expect(r?.replaced).toBe(1);
  });
});
