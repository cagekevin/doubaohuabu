/**
 * API 配置用例单测
 *
 * 覆盖：**每个操作都原样转发端口结果**（成功与失败都要转出去）。
 * ⚠️ 这里的价值不是"转发对不对"这么浅 —— 而是锁住**铁律② 的口子**：
 *    `_Component46.jsx` 原先直调 `window.api.apiConfigSet*` / `apiConfigTest`；
 *    本层存在 ⇒ UI 不必再碰宿主。断言"调用确实经端口走"，防止将来又被绕过。
 */

import { describe, expect, it } from 'vitest';
import {
  loadApiProviders,
  loadApiSetup,
  saveApiSetup,
  saveProviderConfig,
  saveProviderKey,
  saveProviderSecret,
  testProvider,
  type ApiConfigDeps,
} from '../apiConfig';
import { ok, err } from '@/core/model/result';
import type { ApiPort } from '@/core/ports/host.port';

/** 记录调用的假端口（**只测编排**，原则 7） */
function makeDeps(over: Partial<ApiPort> = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const api: ApiPort = {
    providersList: async () => ok([]),
    configGet: async () => ok({ providers: [], configs: {} }),
    configSet: async (id, patch) => {
      calls.push(['configSet', id, patch]);
      return ok({ config: { id } });
    },
    configSetKey: async (id, key) => {
      calls.push(['configSetKey', id, key]);
      return ok({ keyHint: 'sk-****7890' });
    },
    configSetSecret: async (id, key) => {
      calls.push(['configSetSecret', id, key]);
      return ok({ hasSecret: true });
    },
    configTest: async (id) => {
      calls.push(['configTest', id]);
      return ok({ message: '通' });
    },
    jobSubmit: async () => ok({ jobId: 'j' }),
    jobBatch: async () => ok({ jobIds: [], errors: [], total: 0 }),
    jobCancel: async (jobId) => {
      calls.push(['jobCancel', jobId]);
      return ok({ status: 'cancelled' });
    },
    jobList: async () => ok([]),
    setupGet: async () => ok({ setup: { imageProviderId: null, videoProviderId: null, fallbackProviderId: null, concurrency: 3 }, usage: {} }),
    setupSet: async (patch) => {
      calls.push(['setupSet', patch]);
      return ok({ setup: { imageProviderId: 'p1', videoProviderId: null, fallbackProviderId: null, concurrency: 2 } });
    },
    onJobEvent: () => () => undefined,
    ...over,
  };
  const deps: ApiConfigDeps = { api };
  return { deps, calls };
}

describe('apiConfig · 读', () => {
  it('loadApiProviders 走 `configGet`（一次拿 providers + configs）', async () => {
    const { deps } = makeDeps();
    expect(await loadApiProviders(deps)).toEqual(ok({ providers: [], configs: {} }));
  });

  it('loadApiSetup 走 `setupGet`', async () => {
    const { deps } = makeDeps();
    const r = await loadApiSetup(deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.setup.concurrency).toBe(3);
  });

});

describe('apiConfig · 写（原 UI 直调宿主的那几处）', () => {
  it('saveApiSetup 转发补丁并回灌后端 setup', async () => {
    const { deps, calls } = makeDeps();
    const r = await saveApiSetup(deps, { concurrency: 2 });
    expect(calls).toEqual([['setupSet', { concurrency: 2 }]]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.setup.imageProviderId).toBe('p1');
  });

  it('saveProviderConfig / Key / Secret 各自走对应端口方法', async () => {
    const { deps, calls } = makeDeps();
    await saveProviderConfig(deps, 'vidu', { baseUrl: 'x' });
    await saveProviderKey(deps, 'vidu', 'sk-1234567890');
    await saveProviderSecret(deps, 'kling', 'secret');
    expect(calls).toEqual([
      ['configSet', 'vidu', { baseUrl: 'x' }],
      ['configSetKey', 'vidu', 'sk-1234567890'],
      ['configSetSecret', 'kling', 'secret'],
    ]);
  });

  it('testProvider 转发结果', async () => {
    const { deps } = makeDeps();
    expect(await testProvider(deps, 'vidu')).toEqual(ok({ message: '通' }));
  });

});

describe('apiConfig · 原则 6（失败原样转发，不吞不改）', () => {
  it('每个操作都把后端的原始 message 转出去', async () => {
    const fail = err('unknown', '未知服务商 vidu');
    const { deps } = makeDeps({
      configSet: async () => fail,
      configSetKey: async () => fail,
      configSetSecret: async () => fail,
      configTest: async () => err('unknown', '该服务商不支持测试连接'),
      jobCancel: async () => err('unknown', '任务不存在'),
      setupSet: async () => fail,
      setupGet: async () => fail,
      configGet: async () => fail,
      jobList: async () => fail,
    });

    expect(await saveProviderConfig(deps, 'x', {})).toEqual(fail);
    expect(await saveProviderKey(deps, 'x', 'k')).toEqual(fail);
    expect(await saveProviderSecret(deps, 'x', 'k')).toEqual(fail);
    expect(await saveApiSetup(deps, {})).toEqual(fail);
    expect(await loadApiSetup(deps)).toEqual(fail);
    expect(await loadApiProviders(deps)).toEqual(fail);
    expect(await testProvider(deps, 'x')).toEqual(err('unknown', '该服务商不支持测试连接'));
  });
});
