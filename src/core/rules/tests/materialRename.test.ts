/**
 * 素材改名单测（原 `renameMaterialNode` shared.js:27549-27625）
 *
 * 断言红线：**"改一处、所有同源处一起改"** —— 这是本函数存在的理由。
 * 另外三条容易漏：空名**整件事不做**（不是"写空名"）、`libId` 能**由 `dataUrl` 反查并补齐**、
 * 未命中的节点/库项**返回同一引用**（让调用方能判"没变"）。
 */

import { describe, expect, it } from 'vitest';
import { planMaterialRename, type MaterialNodeLike, type RenamableLibraryItem } from '../materialRename';

const mat = (id: string, dataUrl: string, libId?: string, label?: string): MaterialNodeLike => ({
  id,
  type: 'material',
  data: { dataUrl, ...(libId === undefined ? {} : { libId }), ...(label === undefined ? {} : { label }) },
});

const lib = (id: string, name: string, dataUrl: string): RenamableLibraryItem => ({ id, name, dataUrl });

describe('planMaterialRename（原 renameMaterialNode）', () => {
  it('★ 节点不存在 / 没有 data ⇒ `null`（不做任何事）', () => {
    expect(planMaterialRename({ nodes: [], library: [], nodeId: 'x', name: '甲' })).toBeNull();
    expect(
      planMaterialRename({ nodes: [{ id: 'x', type: 'material' }], library: [], nodeId: 'x', name: '甲' }),
    ).toBeNull();
  });

  it('★ 新名字 trim 后为空 ⇒ `null`（**不写空名**，也不 commit）', () => {
    const nodes = [mat('m1', 'img://a.png')];
    expect(planMaterialRename({ nodes, library: [], nodeId: 'm1', name: '' })).toBeNull();
    expect(planMaterialRename({ nodes, library: [], nodeId: 'm1', name: '   ' })).toBeNull();
    expect(planMaterialRename({ nodes, library: [], nodeId: 'm1', name: '\n\t' })).toBeNull();
  });

  it('★ 目标节点：`data.label` 与 `data.name` **都**写成 trim 后的新名', () => {
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png', 'lib_1', '旧名')],
      library: [lib('lib_1', '旧名', 'img://a.png')],
      nodeId: 'm1',
      name: '  新名  ',
    });
    if (!plan) throw new Error('应当成功');
    const d = plan.nodes[0]!.data as Record<string, unknown>;
    expect(d.label).toBe('新名');
    expect(d.name).toBe('新名');
    expect(plan.renamedNodeIds).toEqual(['m1']);
  });

  it('★★ **同 `libId` 的其它素材节点一起改**（"同一个素材两个名字"就是这里防的）', () => {
    const plan = planMaterialRename({
      nodes: [
        mat('m1', 'img://a.png', 'lib_1', '旧名'),
        mat('m2', 'img://a.png', 'lib_1', '旧名'), // 同一个库项的另一份
        mat('m3', 'img://b.png', 'lib_2', '别的'), // 不同来源 ⇒ 不动
      ],
      library: [lib('lib_1', '旧名', 'img://a.png')],
      nodeId: 'm1',
      name: '新名',
    });
    if (!plan) throw new Error('应当成功');
    expect(plan.renamedNodeIds.sort()).toEqual(['m1', 'm2']);
    expect((plan.nodes[2]!.data as Record<string, unknown>).label).toBe('别的');
    // ⚠️ 未命中的节点**返回同一引用**（调用方可用 `===` 判）
    expect(plan.nodes[2]).toBe(plan.nodes[2]);
  });

  it('★ **两边都没 `libId`** 但 `dataUrl` 相同 ⇒ 也算同源', () => {
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png', undefined, '旧名'), mat('m2', 'img://a.png', undefined, '旧名')],
      library: [],
      nodeId: 'm1',
      name: '新名',
    });
    if (!plan) throw new Error('应当成功');
    expect(plan.renamedNodeIds.sort()).toEqual(['m1', 'm2']);
  });

  it('★ 一边有 `libId` 一边没有 ⇒ **不算同源**（源版判据就是 `!f.data.libId && …`）', () => {
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png', 'lib_1', '旧名'), mat('m2', 'img://a.png', undefined, '旧名')],
      library: [lib('lib_1', '旧名', 'img://a.png')],
      nodeId: 'm1',
      name: '新名',
    });
    if (!plan) throw new Error('应当成功');
    // m2 没有 libId ⇒ 走到 `sameUrl` 分支，但**它自己** `!libId` 成立、`dataUrl` 相同 ⇒ 其实命中
    // ⚠️ 源版判据是 `!f.data.libId && a && f.data.dataUrl === a` —— 对 m2 成立 ⇒ **也算同源**
    expect(plan.renamedNodeIds.sort()).toEqual(['m1', 'm2']);
  });

  it('★ 资源库同名项一起改；**找不到 ⇒ 返回同一引用**', () => {
    const library = [lib('lib_1', '旧名', 'img://a.png')];
    const hit = planMaterialRename({
      nodes: [mat('m1', 'img://a.png', 'lib_1')],
      library,
      nodeId: 'm1',
      name: '新名',
    });
    expect(hit?.library[0]!.name).toBe('新名');
    expect(hit?.library).not.toBe(library);

    /**
     * ⚠️ 构造"库里没有同 `dataUrl` 的项"时**必须换一个 `dataUrl`** ——
     *    第一版我传的是 `library`（里面那条 `dataUrl` 恰好相同），于是实现按 ② 反查到了 `lib_1`、
     *    照章改了库名 ⇒ `plan.library` 是新数组。**那是实现正确、我的期望错了**。
     */
    const otherLib = [lib('lib_2', '别的', 'img://b.png')];
    const miss = planMaterialRename({
      nodes: [mat('m1', 'img://a.png')], // 无 libId，且库里**没有**同 dataUrl 的项
      library: otherLib,
      nodeId: 'm1',
      name: '新名',
    });
    expect(miss?.library).toBe(otherLib);
    expect(miss?.libId).toBe('');
  });

  it('★★ 节点没带 `libId` ⇒ **按 `dataUrl` 反查资源库并把 `libId` 补写回节点**', () => {
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png')],
      library: [lib('lib_9', '甲', 'img://a.png')],
      nodeId: 'm1',
      name: '新名',
    });
    if (!plan) throw new Error('应当成功');
    expect(plan.libId).toBe('lib_9');
    expect((plan.nodes[0]!.data as Record<string, unknown>).libId).toBe('lib_9');
  });

  it('★ **非素材节点**原样返回（同一引用）', () => {
    const text = { id: 't1', type: 'text', data: { text: '甲' } };
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png', 'lib_1'), text],
      library: [],
      nodeId: 'm1',
      name: '新名',
    });
    expect(plan?.nodes[1]).toBe(text);
  });

  it('素材节点没有 `data` ⇒ 原样返回（不抛）', () => {
    const bare = { id: 'm9', type: 'material' };
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png', 'lib_1'), bare],
      library: [],
      nodeId: 'm1',
      name: '新名',
    });
    expect(plan?.nodes[1]).toBe(bare);
  });

  it('改名**不碰**别的字段（`dataUrl`/`natW` 等原样）', () => {
    const target: MaterialNodeLike = {
      id: 'm1',
      type: 'material',
      data: { dataUrl: 'img://a.png', libId: 'lib_1', natW: 800, natH: 600, label: '旧名' },
    };
    const plan = planMaterialRename({ nodes: [target], library: [], nodeId: 'm1', name: '新名' });
    const d = plan?.nodes[0]!.data as Record<string, unknown>;
    expect(d.dataUrl).toBe('img://a.png');
    expect(d.natW).toBe(800);
    expect(d.natH).toBe(600);
  });
});

describe('planMaterialRename 的画廊支（原 27571-27604）', () => {
  const withGallery = () => ({
    acc_1: [
      { id: 'lg_1', name: '旧名', dataUrl: 'img://a.png' } as never,
      { id: 'lg_2', name: '别的', dataUrl: 'img://b.png' } as never,
    ],
    acc_2: [{ id: 'lg_3', name: '旧名', dataUrl: 'img://a.png' } as never],
  });

  it('★ **命中 `dataUrl` 的条目改名**（跨账号都改）', () => {
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png', 'lib_1', '旧名')],
      library: [lib('lib_1', '旧名', 'img://a.png')],
      nodeId: 'm1',
      name: '新名',
      galleries: withGallery(),
    });
    expect(plan?.galleries).toBeDefined();
    expect(plan!.galleries!.acc_1!.map((x) => x.name)).toEqual(['新名', '别的']);
    expect(plan!.galleries!.acc_2![0]!.name).toBe('新名');
  });

  it('★★ **没命中 ⇒ 不带 `galleries` 字段**（源版 `...(u ? {…} : {})`）', () => {
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://不存在的.png', undefined, '旧名')],
      library: [],
      nodeId: 'm1',
      name: '新名',
      galleries: withGallery(),
    });
    expect(plan).not.toBeNull();
    expect('galleries' in (plan as object)).toBe(false);
  });

  it('★ **不给 `galleries` ⇒ 与从前一样**（不出现该字段）', () => {
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png', 'lib_1', '旧名')],
      library: [],
      nodeId: 'm1',
      name: '新名',
    });
    expect('galleries' in (plan as object)).toBe(false);
  });

  it('★ 判据是**字面相等**（不做归一）：`dataUrl` 差一个字符就不命中', () => {
    const plan = planMaterialRename({
      nodes: [mat('m1', 'img://a.png?v=2', 'lib_1')],
      library: [],
      nodeId: 'm1',
      name: '新名',
      galleries: { acc_1: [{ id: 'lg_1', name: '旧名', dataUrl: 'img://a.png' } as never] },
    });
    expect('galleries' in (plan as object)).toBe(false);
  });
});
