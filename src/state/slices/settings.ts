/**
 * Settings slice（① 全局共享 —— 见 `docs/11` §5.1 / `docs/16` §1.8）
 *
 * **为什么从 `global` 拆出来**（判据 C2 / `docs/11` §5.3）：
 *   `global` 原 14 字段；本清单还要加 `license` / `scanHistory` / `lovartGalleries` /
 *   `lastSentAccountId` / `accountConcurrency` / `presets` ⇒ **必然超 25 字段上限**
 *   ⇒ 按**共享范围**再分（「API 配置族」自成一片）。
 *
 * ⚠️ 原则 1：只有 state 能写 store；本片**只做编排**，不含业务规则（组装报文/解析 provider 都在 core/rules）
 * ⚠️ 原则 5（SSOT）：默认并发引用 `constants`，不在本文件写魔法数
 *
 * ⚠️ **形状来源说明（如实记录）**：`apiProvidersMeta` / `apiJobs` 存的是**宿主线上形状**
 *    （`ApiProviderMetaLite` / `ApiJobLite`，见 `core/ports/host.port.ts`）；
 *    而 `stable/model/gen.ts` 另有**冻结形状** `ApiProviderMeta` / `ApiJob`（`status` 收窄为 `ApiJobStatus`）。
 *    两者**当前是重复定义**（`ApiJobLite.status: string` 无法赋给 `ApiJobStatus`）⇒ 已登记待收口，
 *    不在 M8 里顺手改端口（避免扩大改动面）。
 */

import type { ApiJobLite, ApiProviderMetaLite } from '@/core/ports';
import type { ApiSetup, ApiUsage } from '@/stable/model/gen';
import { DEFAULT_API_CONCURRENCY } from '@/constants';

export interface SettingsSlice {
  // ── state ──
  /** provider 元信息（**脱敏**：只有 `hasKey`/`keyHint`，密钥明文永不过桥） */
  apiProvidersMeta: ApiProviderMetaLite[];
  /** 配置原文（宿主返回什么就是什么 —— 判据 D1：适配器不解释，state 也不解释） */
  apiConfigs: unknown;
  /** 通道选择（图 / 视频 / 兜底 provider + 并发） */
  apiSetup: ApiSetup;
  /** 任务快照（★ 由 `state/subscriptions.ts` 的 `onJobEvent` 订阅写入） */
  apiJobs: ApiJobLite[];
  /** 用量（按本地日期 `YYYY-MM-DD`） */
  apiUsage: ApiUsage;

  // ── actions（只编排，不做业务）──
  setApiProviders: (list: ApiProviderMetaLite[]) => void;
  setApiConfigs: (configs: unknown) => void;
  setApiSetup: (setup: ApiSetup) => void;
  setApiJobs: (jobs: ApiJobLite[]) => void;
  /** ★ 事件回灌用：按 `id` 覆盖或追加（订阅是**唯一写入点**，见 `state/subscriptions.ts`） */
  upsertApiJob: (job: ApiJobLite) => void;
  setApiUsage: (usage: ApiUsage) => void;
}

/** 默认 `apiSetup`（并发来自 SSOT `constants`） */
export function defaultApiSetup(): ApiSetup {
  return {
    imageProviderId: null,
    videoProviderId: null,
    fallbackProviderId: null,
    concurrency: DEFAULT_API_CONCURRENCY,
  };
}

export function createSettingsSlice(
  set: (partial: Partial<SettingsSlice>) => void,
  get: () => SettingsSlice,
): SettingsSlice {
  return {
    apiProvidersMeta: [],
    apiConfigs: null,
    apiSetup: defaultApiSetup(),
    apiJobs: [],
    apiUsage: {},

    setApiProviders: (apiProvidersMeta) => set({ apiProvidersMeta }),
    setApiConfigs: (apiConfigs) => set({ apiConfigs }),
    setApiSetup: (apiSetup) => set({ apiSetup }),
    setApiJobs: (apiJobs) => set({ apiJobs }),

    upsertApiJob: (job) => {
      const cur = get().apiJobs;
      const i = cur.findIndex((j) => j.id === job.id);
      set({ apiJobs: i >= 0 ? cur.map((j) => (j.id === job.id ? job : j)) : [...cur, job] });
    },

    setApiUsage: (apiUsage) => set({ apiUsage }),
  };
}
