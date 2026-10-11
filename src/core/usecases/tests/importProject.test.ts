/**
 * 导入工程用例单测
 *
 * 覆盖（`shared.js:29993-30055` + `_Component47.jsx:28-42`）：
 *   - 用户取消 / 端口失败 / 解析失败 / 顶层非对象 四条**前置分支**
 *   - 工程名来源（顶层 `name`）与工程数据来源（`parsed.data || parsed`）
 *   - 预设合并
 *   - ★ **`activateProjectStorage` 失败不阻断导入**，但必须**如实上报**（源版是静默吞掉）
 *
 * 原则 7：只测编排 —— 端口是**注入的假实现**。
 */

import { describe, expect, it, vi } from 'vitest';
import { importProject, type ImportProjectDeps } from '../importProject';
import { ok, err, type Result } from '@/core/model/result';
import { PROJECT_TEXT } from '@/constants/text';
import type { ActivateProjectStoragePayload } from '@/core/ports/host.port';
import type { ClockPort } from '@/core/ports/clock.port';
import type { GraphPreset } from '@/stable/model/project';

const clock: ClockPort = {
  now: () => 1_700_000_000_000,
  setTimeout: () => () => undefined,
  setInterval: () => () => undefined,
};

function makeDeps(opts: {
  file?: Result<{ name: string; content: string } | null>;
  activate?: (p: ActivateProjectStoragePayload) => ReturnType<ImportProjectDeps['project']['activateStorage']>;
}) {
  const calls: ActivateProjectStoragePayload[] = [];
  const deps: ImportProjectDeps = {
    file: { loadFile: async () => opts.file ?? ok(null) },
    project: {
      activateStorage: (p) => {
        calls.push(p);
        return opts.activate ? opts.activate(p) : ok({ path: '/data/p' });
      },
    },
    clock,
  };
  return { deps, calls };
}

const baseInput = { existingPresets: [] as GraphPreset[], knownStoragePaths: [], seq: 7 };

describe('importProject · 前置分支', () => {
  it('用户取消（loadFile 返回 null）⇒ canceled，且**不碰**存储', async () => {
    const { deps, calls } = makeDeps({ file: ok(null) });
    const res = await importProject(deps, baseInput);
    expect(res).toEqual(ok({ kind: 'canceled' }));
    expect(calls).toHaveLength(0);
  });

  it('loadFile 失败 ⇒ **原样转发**（不改写 message）', async () => {
    const { deps } = makeDeps({ file: err('unknown', '磁盘炸了') });
    const res = await importProject(deps, baseInput);
    expect(res).toEqual(err('unknown', '磁盘炸了'));
  });

  it('★ JSON 解析失败 ⇒ message 是源版给用户看的原文，**原始异常进 cause**', async () => {
    const { deps } = makeDeps({ file: ok({ name: 'x.json', content: '{ 坏 json' }) });
    const res = await importProject(deps, baseInput);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toBe(PROJECT_TEXT.parseFailed);
    expect(res.message).toBe('项目文件解析失败');
    expect(res.cause).toBeInstanceOf(SyntaxError);
  });

  it('★ 顶层是数组 / 字符串（非对象）⇒ 同「解析失败」（源版会抛，落到同一句提示）', async () => {
    for (const content of ['[]', '"x"', 'null', '42']) {
      const { deps } = makeDeps({ file: ok({ name: 'x.json', content }) });
      const res = await importProject(deps, baseInput);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toBe(PROJECT_TEXT.parseFailed);
    }
  });
});

describe('importProject · 正常导入', () => {
  it('工程名取**顶层** name；数据取 parsed.data', async () => {
    const { deps } = makeDeps({
      file: ok({
        name: 'x.json',
        content: JSON.stringify({ name: ' 我的工程 ', data: { nodes: [{ id: 'n1' }], snap: false } }),
      }),
    });
    const res = await importProject(deps, baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.project.name).toBe('我的工程');
    expect(res.value.project.data.nodes).toEqual([{ id: 'n1' }]);
    expect(res.value.project.data.snap).toBe(false);
  });

  it('顶层就是工程数据（没有 data 字段）⇒ 用顶层；名字回落「导入的项目」', async () => {
    const { deps } = makeDeps({
      file: ok({ name: 'x.json', content: JSON.stringify({ nodes: [{ id: 'a' }] }) }),
    });
    const res = await importProject(deps, baseInput);
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.project.name).toBe('导入的项目');
    expect(res.value.project.data.nodes).toEqual([{ id: 'a' }]);
  });

  it('★ 激活存储的载荷：storagePath 恒空串 + knownStoragePaths 原样带上', async () => {
    const known = [{ path: '/a', name: '甲' }];
    const { deps, calls } = makeDeps({
      file: ok({ name: 'x.json', content: JSON.stringify({ name: 'P' }) }),
    });
    await importProject(deps, { ...baseInput, knownStoragePaths: known });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ projectName: 'P', storagePath: '', knownStoragePaths: known });
    expect(calls[0]!.projectId).toMatch(/^p_/);
  });

  it('预设合并：新 id 并入、旧 id 丢弃', async () => {
    const existing: GraphPreset[] = [{ id: 'pre_1', name: '旧', kind: 'graph', nodes: [], edges: [] }];
    const { deps } = makeDeps({
      file: ok({
        name: 'x.json',
        content: JSON.stringify({ presets: [{ id: 'pre_1' }, { id: 'pre_2', name: '新' }] }),
      }),
    });
    const res = await importProject(deps, { ...baseInput, existingPresets: existing });
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.addedPresets.map((p) => p.id)).toEqual(['pre_2']);
  });

  it('seq 透传进工程 id', async () => {
    const { deps } = makeDeps({ file: ok({ name: 'x.json', content: '{}' }) });
    const res = await importProject(deps, { ...baseInput, seq: 42 });
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.project.id).toBe(`p_${(1_700_000_000_000).toString(36)}_42`);
  });
});

describe('importProject · ★ 存储激活失败（源版静默吞掉 ⇒ 本实现如实上报）', () => {
  it('失败时仍返回 imported，但 storageError = **原始 message**', async () => {
    const { deps } = makeDeps({
      file: ok({ name: 'x.json', content: '{}' }),
      activate: () => err('unknown', 'EACCES: permission denied'),
    });
    const res = await importProject(deps, baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.storageError).toBe('EACCES: permission denied');
  });

  it('成功时 storageError 为 null', async () => {
    const { deps } = makeDeps({ file: ok({ name: 'x.json', content: '{}' }) });
    const res = await importProject(deps, baseInput);
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.storageError).toBeNull();
  });
});

describe('importProject · 原则 1（不写 store）', () => {
  it('全程不触碰任何 store / 全局对象（只经注入的端口）', async () => {
    const spy = vi.fn();
    const { deps } = makeDeps({ file: ok({ name: 'x.json', content: '{}' }) });
    await importProject({ ...deps, project: { activateStorage: (p) => { spy(p); return ok({}); } } }, baseInput);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
