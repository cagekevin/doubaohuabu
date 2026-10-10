/**
 * ApiPort 的 Electron 实现（第三方 provider）
 *
 * ⚠️ 密钥明文**永不过桥**：`apiConfigSetKey` 只单向送入；读取只回 `keyHint`（脱敏）
 * ⚠️ W1：`onApiJobEvent` 是订阅，**必须取取消函数**
 */

import type {
  ApiJobLite,
  ApiPort,
  ApiProviderMetaLite,
  ApiSetupLite,
} from '@/core/ports/host.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { getHostApi, HOST_MISSING } from './host-api';

/** 统一包一层 Result（原则 6：原文透传） */
async function call<T>(fn: (api: NonNullable<ReturnType<typeof getHostApi>>) => Promise<unknown>): Promise<Result<T>> {
  const api = getHostApi();
  if (!api) return err('unknown', HOST_MISSING);
  try {
    return ok((await fn(api)) as T);
  } catch (e) {
    return err('unknown', toMessage(e), e);
  }
}

export function createElectronApiPort(): ApiPort {
  return {
    providersList: async () => {
      const r = await call<ApiProviderMetaLite[]>((api) => api.apiProvidersList());
      if (!r.ok) return r;
      return ok(Array.isArray(r.value) ? r.value : []);
    },

    configGet: async () => call<unknown>((api) => api.apiConfigGet()),

    configSet: async (providerId: string, patch: unknown) => {
      const r = await call<unknown>((api) => api.apiConfigSet(providerId, patch));
      return r.ok ? ok(undefined) : r;
    },

    configSetKey: async (providerId: string, key: string) => {
      const r = await call<unknown>((api) => api.apiConfigSetKey(providerId, key));
      return r.ok ? ok(undefined) : r;
    },

    configSetSecret: async (providerId: string, key: string) => {
      const r = await call<unknown>((api) => api.apiConfigSetSecret(providerId, key));
      return r.ok ? ok(undefined) : r;
    },

    configTest: async (providerId: string) => {
      const r = await call<{ message?: string }>((api) => api.apiConfigTest(providerId));
      return r;
    },

    jobSubmit: async (payload: unknown) => {
      const r = await call<ApiJobLite>((api) => api.apiJobSubmit(payload));
      return r;
    },

    jobBatch: async (basePayload: unknown, matrix: unknown) => {
      const r = await call<ApiJobLite[]>((api) => api.apiJobBatch(basePayload, matrix));
      if (!r.ok) return r;
      return ok(Array.isArray(r.value) ? r.value : []);
    },

    jobCancel: async (jobId: string) => {
      const r = await call<unknown>((api) => api.apiJobCancel(jobId));
      return r.ok ? ok(undefined) : r;
    },

    jobList: async () => {
      const r = await call<ApiJobLite[]>((api) => api.apiJobList());
      if (!r.ok) return r;
      return ok(Array.isArray(r.value) ? r.value : []);
    },

    setupGet: async () => {
      const r = await call<Partial<ApiSetupLite>>((api) => api.apiSetupGet());
      if (!r.ok) return r;
      return ok<ApiSetupLite>({
        imageProviderId: r.value.imageProviderId ?? null,
        videoProviderId: r.value.videoProviderId ?? null,
        fallbackProviderId: r.value.fallbackProviderId ?? null,
        concurrency: r.value.concurrency ?? 3,
      });
    },

    setupSet: async (patch: Partial<ApiSetupLite>) => {
      const r = await call<unknown>((api) => api.apiSetupSet(patch));
      return r.ok ? ok(undefined) : r;
    },

    /** ★ 订阅：取取消函数并返回（W1） */
    onJobEvent: (cb) => {
      const api = getHostApi();
      if (!api) return () => undefined;
      const off = api.onApiJobEvent((payload) => cb(payload as ApiJobLite));
      return typeof off === 'function' ? off : () => undefined;
    },
  };
}
