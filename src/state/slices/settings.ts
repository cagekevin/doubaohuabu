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
 * ★ **2026-10-10 形状收口**：原先这里用的是 `core/ports` 的「线上形状副本」
 *   （`ApiProviderMetaLite` / `ApiJobLite`），与后端**实测不符** ——
 *   最要命的是 `ApiJobLite.id` 而后端事件字段名是 **`jobId`**
 *   ⇒ `upsertApiJob` 按 `id` 去重时拿到 `undefined`，**所有任务塌进同一条记录**。
 *   现统一用 `stable/model/gen.ts` 的冻结形状（`ApiProviderMeta` / `ApiJobEvent` / `ApiSetup` / `ApiUsage`）。
 *
 * ⚠️ `apiJobs` 是**按 jobId 索引的映射**（原版 `{[jobId]: snapshot}`）—— 不是数组。
 *    数组形态没法在"同一任务多次状态推送"下原地覆盖。
 */

import type {
  ApiConfigMap,
  ApiJobEvent,
  ApiProviderMeta,
  ApiSetup,
  ApiUsage,
} from '@/stable/model/gen';
import { DEFAULT_API_CONCURRENCY } from '@/constants';

export interface SettingsSlice {
  // ── state ──
  /** provider 元信息（**脱敏**：只有 `hasKey`/`keyHint`，密钥明文永不过桥） */
  apiProvidersMeta: ApiProviderMeta[];
  /**
   * provider 配置（**按 `providerId` 索引**；后端 `config-store.publicOf` 的脱敏形状）
   *
   * ⚠️ **2026-10-11 定形**：此前是 `unknown`（"宿主返回什么就是什么"）—— 但 API 设置面板要读
   *    `enabled` / `baseUrl` / `keyHint` … ⇒ 用 `unknown` 就得在 UI 里 `as` 断言（TD-08-1 反模式）。
   *    形状真源 = `stable/model/gen.ts` 的 `ApiConfigMap`（逐字对 `publicOf`）。
   */
  apiConfigs: ApiConfigMap;
  /** 通道选择（图 / 视频 / 兜底 provider + 并发） */
  apiSetup: ApiSetup;
  /** 任务快照（★ 由 `state/subscriptions.ts` 的 `onJobEvent` 订阅写入；键 = `jobId`） */
  apiJobs: Record<string, ApiJobEvent>;
  /** 用量（按本地日期 `YYYY-MM-DD`） */
  apiUsage: ApiUsage;

  // ── actions（只编排，不做业务）──
  setApiProviders: (list: ApiProviderMeta[]) => void;
  setApiConfigs: (configs: ApiConfigMap) => void;
  setApiSetup: (setup: ApiSetup) => void;
  setApiJobs: (jobs: Record<string, ApiJobEvent>) => void;
  /** ★ 事件回灌用：按 `jobId` 覆盖或追加（订阅是**唯一写入点**，见 `state/subscriptions.ts`） */
  upsertApiJob: (job: ApiJobEvent) => void;
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
    apiConfigs: {},
    apiSetup: defaultApiSetup(),
    apiJobs: {},
    apiUsage: {},

    setApiProviders: (apiProvidersMeta) => set({ apiProvidersMeta }),
    setApiConfigs: (apiConfigs) => set({ apiConfigs }),
    setApiSetup: (apiSetup) => set({ apiSetup }),
    setApiJobs: (apiJobs) => set({ apiJobs }),

    upsertApiJob: (job) => {
      // ★ 键是 `jobId`（后端事件字段名）—— 用 `id` 会让所有任务塌成一条
      set({ apiJobs: { ...get().apiJobs, [job.jobId]: job } });
    },

    setApiUsage: (apiUsage) => set({ apiUsage }),
  };
}
