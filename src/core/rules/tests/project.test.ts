/**
 * 工程规则单测（★ 纯逻辑）
 *
 * 覆盖（**逐行对齐源实现**）：
 *   - `makeProjectId` / `createProject` —— `shared.js:29828-29875`
 *   - `renameProject` —— `shared.js:30056-30068`（★ 本次修正了「空名回落默认名」的不等价行为）
 *   - `setProjectStoragePath` —— `shared.js:30096-30113`
 *   - `readImportedProjectData` / `readImportedProjectName` / `mergeImportedPresets` —— `shared.js:29993-30055`
 *   - `knownStoragePathsOf` —— 源版**四处重复**的组装（判据 C1）
 *
 * 断言红线：**实现一变必红** —— 只断言源实现可推出的具体值，不断言「不崩」。
 */

import { describe, expect, it } from 'vitest';
import {
  IMPORTED_PROJECT_NAME,
  createProject,
  knownStoragePathsOf,
  makeProjectId,
  mergeImportedPresets,
  readImportedProjectData,
  readImportedProjectName,
  renameProject,
  setProjectStoragePath,
  shouldReactivateOnRename,
  activeIdAfterDelete,
  orderProjectsByUpdatedAt,
} from '../project';
import type { GraphPreset, PromptPreset, Project } from '@/stable/model/project';

const makeProject = (id: string, name: string, storagePath?: string): Project => ({
  id,
  name,
  updatedAt: 0,
  ...(storagePath === undefined ? {} : { storagePath }),
  data: { nodes: [], edges: [], library: [], snap: true, videoShares: [] },
});

const preset = (id: string): GraphPreset => ({ id, name: id, kind: 'graph', nodes: [], edges: [] });

describe('makeProjectId / createProject', () => {
  it('id 形如 p_<base36 时间>_<计数>（真实样本 p_mv1raqbo_1 同构）', () => {
    expect(makeProjectId(1_700_000_000_000, 1)).toBe(`p_${(1_700_000_000_000).toString(36)}_1`);
  });

  it('新工程默认名「未命名项目」+ 空画布 + 吸附开', () => {
    const p = createProject({ now: 1000, seq: 1 });
    expect(p.name).toBe('未命名项目');
    expect(p.updatedAt).toBe(1000);
    expect(p.storagePath).toBeUndefined();
    expect(p.data).toEqual({ nodes: [], edges: [], library: [], snap: true, videoShares: [] });
  });

  it('createProject 支持覆盖 data 与 storagePath（导入链路复用）', () => {
    const p = createProject({
      now: 5,
      seq: 2,
      name: '导入的项目',
      data: { snap: false },
      storagePath: '/tmp/x',
    });
    expect(p.name).toBe('导入的项目');
    expect(p.storagePath).toBe('/tmp/x');
    expect(p.data.snap).toBe(false);
    // 未覆盖的字段仍是空默认（`emptyProjectData` 合并）
    expect(p.data.nodes).toEqual([]);
  });
});

describe('orderProjectsByUpdatedAt（原 `_Component47.jsx:25-27`）', () => {
  const withAt = (id: string, updatedAt: number): Project => ({
    ...makeProject(id, id),
    updatedAt,
  });

  it('★ 按 `updatedAt` **倒序**（最新的在最前）', () => {
    const list = [withAt('a', 100), withAt('b', 300), withAt('c', 200)];
    expect(orderProjectsByUpdatedAt(list).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('★ 返回**新数组**，不动入参（源也是 `[...e].sort`）', () => {
    const list = [withAt('a', 100), withAt('b', 200)];
    const out = orderProjectsByUpdatedAt(list);
    expect(out).not.toBe(list);
    expect(list.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('空列表 ⇒ 空', () => {
    expect(orderProjectsByUpdatedAt([])).toEqual([]);
  });
});

describe('renameProject（★ 空名保持原名 —— 与源一致）', () => {
  it('正常改名并触碰 updatedAt', () => {
    const p = renameProject(makeProject('p_1', '旧名'), '新名', 42);
    expect(p.name).toBe('新名');
    expect(p.updatedAt).toBe(42);
  });

  it('★ 空名 / 纯空白 ⇒ **保持原名**（不是回落「未命名项目」）', () => {
    expect(renameProject(makeProject('p_1', '旧名'), '', 1).name).toBe('旧名');
    expect(renameProject(makeProject('p_1', '旧名'), '   ', 1).name).toBe('旧名');
  });

  it('去掉首尾空白', () => {
    expect(renameProject(makeProject('p_1', '旧名'), '  新名  ', 1).name).toBe('新名');
  });
});

describe('setProjectStoragePath（原 30096-30113）', () => {
  it('trim 后写入', () => {
    const p = setProjectStoragePath(makeProject('p_1', 'a'), '  /data/p  ', 7);
    expect(p.storagePath).toBe('/data/p');
    expect(p.updatedAt).toBe(7);
  });

  it('★ 空串 / 纯空白 / 非字符串 ⇒ 字段变 `undefined`（「用默认目录」）', () => {
    expect(setProjectStoragePath(makeProject('p_1', 'a', '/old'), '', 1).storagePath).toBeUndefined();
    expect(setProjectStoragePath(makeProject('p_1', 'a', '/old'), '   ', 1).storagePath).toBeUndefined();
    expect(setProjectStoragePath(makeProject('p_1', 'a', '/old'), 42, 1).storagePath).toBeUndefined();
    expect(setProjectStoragePath(makeProject('p_1', 'a', '/old'), null, 1).storagePath).toBeUndefined();
  });
});

describe('readImportedProjectData（原 30001-30006）', () => {
  it('数组照收，非数组一律空数组', () => {
    const d = readImportedProjectData({
      nodes: [{ id: 'n1' }],
      edges: 'not-an-array',
      library: null,
    });
    expect(d.nodes).toEqual([{ id: 'n1' }]);
    expect(d.edges).toEqual([]);
    expect(d.library).toEqual([]);
  });

  it('snap 缺省 ⇒ true；显式 false 保留', () => {
    expect(readImportedProjectData({}).snap).toBe(true);
    expect(readImportedProjectData({ snap: false }).snap).toBe(false);
    // ⚠️ 非布尔值不塞进布尔字段（源版 `?? true` 会原样存下 `0`/`"yes"`）—— 有意偏离，见函数注释
    expect(readImportedProjectData({ snap: 'yes' }).snap).toBe(true);
  });

  it('videoShares 恒为空数组（源版导入不带该字段）', () => {
    expect(readImportedProjectData({ videoShares: [1, 2] }).videoShares).toEqual([]);
  });
});

describe('readImportedProjectName（原 `w.name || \'导入的项目\'`）', () => {
  it('有名字则 trim 后用', () => {
    expect(readImportedProjectName({ name: '  我的工程 ' })).toBe('我的工程');
  });

  it('缺省 / 空白 / 非字符串 ⇒ 默认「导入的项目」', () => {
    expect(readImportedProjectName({})).toBe(IMPORTED_PROJECT_NAME);
    expect(IMPORTED_PROJECT_NAME).toBe('导入的项目');
    expect(readImportedProjectName({ name: '   ' })).toBe('导入的项目');
    expect(readImportedProjectName({ name: 42 })).toBe('导入的项目');
  });
});

describe('mergeImportedPresets（原 30025-30040）', () => {
  it('只并入 id 不存在的新项', () => {
    const added = mergeImportedPresets([preset('pre_1')], [preset('pre_1'), preset('pre_2')]);
    expect(added.map((p) => p.id)).toEqual(['pre_2']);
  });

  it('★ 没有 id 的项被丢弃（源版无法判重 ⇒ 丢）', () => {
    expect(mergeImportedPresets([], [{ name: '无名' }])).toEqual([]);
    expect(mergeImportedPresets([], [{ id: '' }])).toEqual([]);
  });

  it('批内重复也去重（同一个 id 出现两次只并一个）', () => {
    expect(mergeImportedPresets([], [preset('pre_x'), preset('pre_x')]).map((p) => p.id)).toEqual(['pre_x']);
  });

  it('非数组 / 空数组 ⇒ 空结果（不抛）', () => {
    expect(mergeImportedPresets([], undefined)).toEqual([]);
    expect(mergeImportedPresets([], 'nope')).toEqual([]);
    expect(mergeImportedPresets([], [null, 1, 'x'])).toEqual([]);
  });

  it('★ 契约是**联合**（`Preset`）：提示词预设（**无 `kind`**）也照收 —— 2026-10-11 形状更正', () => {
    // ⚠️ 源 `doubao-presets` 数组**混装**两种：提示词预设（无 kind）+ 图预设（kind:'graph'）
    //    ⇒ 若把值形状写成 `GraphPreset[]`，这一条**根本传不进来**（旧类型的失真点）。
    const prompt: PromptPreset = { id: 'pre_p1', name: '我的提示词', content: '一只橘猫' };
    expect(mergeImportedPresets([], [prompt])).toEqual([prompt]);
    // 与图预设**同数组**判重（按 id，不分形状）
    expect(mergeImportedPresets([prompt], [prompt, preset('pre_g1')]).map((p) => p.id)).toEqual(['pre_g1']);
  });
});

describe('knownStoragePathsOf（原版四处重复的组装）', () => {
  it('丢掉没有 storagePath 的工程，只留 path/name', () => {
    const list = knownStoragePathsOf([
      makeProject('p_1', '甲', '/a'),
      makeProject('p_2', '乙'),
      makeProject('p_3', '丙', '/c'),
    ]);
    expect(list).toEqual([
      { path: '/a', name: '甲' },
      { path: '/c', name: '丙' },
    ]);
  });
});

describe('shouldReactivateOnRename（原 `renameProject` 30075 的 `id === activeId`）', () => {
  it('★ 只对**当前工程**重新激活（改名影响磁盘目录名与已知路径清单）', () => {
    expect(shouldReactivateOnRename('p_1', 'p_1')).toBe(true);
    expect(shouldReactivateOnRename('p_1', 'p_2')).toBe(false);
  });

  it('没有当前工程（`null`）⇒ 不激活', () => {
    expect(shouldReactivateOnRename('p_1', null)).toBe(false);
  });
});

describe('activeIdAfterDelete（原 `deleteProject` 30120 / 30123）', () => {
  it('★ 删的是**当前**工程 ⇒ `null`（回启动页，**不是**切到下一个）', () => {
    expect(activeIdAfterDelete('p_1', 'p_1')).toBeNull();
  });

  it('删的不是当前 ⇒ `activeId` 不变', () => {
    expect(activeIdAfterDelete('p_1', 'p_2')).toBe('p_1');
    expect(activeIdAfterDelete(null, 'p_2')).toBeNull();
  });
});
