/**
 * 项目存储用例单测
 *
 * 覆盖（`_Component42.jsx:284-345` + `shared.js` 四处 `activateProjectStorage`）：
 *   - `buildStoragePayload` 的组装（`storagePath || ''` + `knownStoragePaths`）
 *   - 选择路径的**四种结果**：成功 / 取消 / 后端 `ok:false` / 成功但没给 path
 *   - 打开目录、占用统计的**原样转发**
 *
 * 原则 7：只测编排 —— 端口是注入的假实现。
 */

import { describe, expect, it } from 'vitest';
import {
  activateProjectStorage,
  buildStoragePayload,
  pickProjectStorage,
  projectStorageUsage,
  revealProjectStorage,
  type ProjectStorageDeps,
} from '../projectStorage';
import { ok, err } from '@/core/model/result';
import type { Project } from '@/stable/model/project';

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p_1',
  name: '甲',
  updatedAt: 0,
  data: { nodes: [], edges: [], library: [], snap: true, videoShares: [] },
  ...over,
});

function makeDeps(over: Partial<ProjectStorageDeps['project']> = {}) {
  const deps: ProjectStorageDeps = {
    project: {
      activateStorage: () => ok({ path: '/root' }),
      pickStorage: async () => ok({ canceled: true }),
      revealStorage: async () => ok({}),
      getStorageSize: async () => ok({ bytes: 0, files: 0, partial: false }),
      ...over,
    },
  };
  return deps;
}

describe('buildStoragePayload（原版四处重复的组装）', () => {
  it('storagePath 缺省 ⇒ 空串（= 用应用默认目录）', () => {
    const p = buildStoragePayload(project(), [project()]);
    expect(p.storagePath).toBe('');
    expect(p.projectId).toBe('p_1');
    expect(p.projectName).toBe('甲');
  });

  it('knownStoragePaths 只含**有 path** 的工程', () => {
    const p = buildStoragePayload(project({ id: 'p_2', name: '乙', storagePath: '/b' }), [
      project(),
      project({ id: 'p_2', name: '乙', storagePath: '/b' }),
    ]);
    expect(p.storagePath).toBe('/b');
    expect(p.knownStoragePaths).toEqual([{ path: '/b', name: '乙' }]);
  });
});

describe('activateProjectStorage', () => {
  it('同步转发端口结果', () => {
    const deps = makeDeps({ activateStorage: () => ok({ path: '/x' }) });
    expect(activateProjectStorage(deps, project(), [])).toEqual(ok({ path: '/x' }));
  });

  it('失败**原样转发**（不吞错 —— 源版 createProject/importProject 是 try{}catch{}）', () => {
    const deps = makeDeps({ activateStorage: () => err('unknown', 'no_window') });
    expect(activateProjectStorage(deps, project(), [])).toEqual(err('unknown', 'no_window'));
  });
});

describe('pickProjectStorage（原 _Component42.jsx:284-331）', () => {
  it('★ 载荷必须带整个 project（后端靠它迁移资源 + 写快照）', async () => {
    let seen: unknown;
    const p = project({ storagePath: '/old' });
    const deps = makeDeps({
      pickStorage: async (payload) => {
        seen = payload;
        return ok({ path: '/new', migrated: { images: 2, videos: 1 } });
      },
    });
    const res = await pickProjectStorage(deps, p, [p]);
    expect(res).toEqual(ok({ kind: 'picked', path: '/new', migrated: { images: 2, videos: 1 } }));
    expect(seen).toMatchObject({ projectId: 'p_1', projectName: '甲', storagePath: '/old', project: p });
  });

  it('用户取消 ⇒ canceled（不是错误）', async () => {
    const deps = makeDeps({ pickStorage: async () => ok({ canceled: true }) });
    expect(await pickProjectStorage(deps, project(), [])).toEqual(ok({ kind: 'canceled' }));
  });

  it('★ 后端 ok:false ⇒ 转发错误（适配器已修：原先会吞成成功）', async () => {
    const deps = makeDeps({ pickStorage: async () => err('unknown', 'path_not_allowed') });
    expect(await pickProjectStorage(deps, project(), [])).toEqual(err('unknown', 'path_not_allowed'));
  });

  it('成功但没给 path ⇒ 视为未选中（**不编造路径**）', async () => {
    const deps = makeDeps({ pickStorage: async () => ok({}) });
    expect(await pickProjectStorage(deps, project(), [])).toEqual(ok({ kind: 'canceled' }));
  });

  it('migrated 缺省 ⇒ 空对象（不是 undefined）', async () => {
    const deps = makeDeps({ pickStorage: async () => ok({ path: '/new' }) });
    expect(await pickProjectStorage(deps, project(), [])).toEqual(
      ok({ kind: 'picked', path: '/new', migrated: {} }),
    );
  });
});

describe('revealProjectStorage / projectStorageUsage', () => {
  it('打开目录原样转发（含后端 error 串）', async () => {
    const deps = makeDeps({ revealStorage: async () => err('unknown', '项目保存路径不存在') });
    expect(await revealProjectStorage(deps, '/x')).toEqual(err('unknown', '项目保存路径不存在'));
  });

  it('★ 占用统计转发 `{bytes, files, partial}`（适配器已修：原先读错字段恒为 0）', async () => {
    const deps = makeDeps({
      getStorageSize: async () => ok({ bytes: 2048, files: 3, partial: true }),
    });
    expect(await projectStorageUsage(deps, '/x')).toEqual(ok({ bytes: 2048, files: 3, partial: true }));
  });
});
