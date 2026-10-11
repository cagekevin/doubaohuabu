/**
 * API 通道配置控制器（★ 装配层）—— 把 `core/usecases/apiConfig` 接到 UI
 *
 * | 能力 | 用例 | 原入口 |
 * |---|---|---|
 * | 读 provider 元信息 + 配置 | `usecases/apiConfig.loadApiProviders` | `_Component46` 挂载 effect + `refreshApiConfig` |
 * | 读通道设置 + 用量 | `usecases/apiConfig.loadApiSetup` | 同上 |
 * | 保存通道设置 | `saveApiSetup` | 面板的三个下拉 + 并发输入 |
 * | 保存 provider 配置 / 密钥 / Secret | `saveProviderConfig` / `saveProviderKey` / `saveProviderSecret` | `_Component46.jsx:100/109/118/175` **直调 `window.api`** |
 * | 测试连接 | `testProvider` | `_Component46.jsx:149` **直调 `window.api`** |
 *
 * ★ **为什么需要它**：`ui` **不得直调 `window.api.apiConfig*` / `apiConfigTest`**
 *   —— 那是铁律② 违规（视图直调宿主）。本控制器就是把这些调用**纳入
 *   `ui → state → usecases → ports`** 的那道口子；没有它，面板只能继续碰 `window.api`。
 *   ⇒ 与 `hostOps` / `projectOps` 同法：**端口只在这里取一次**，`ui` 拿不到 `Ports`。
 *
 * ⚠️ 原则 1：本控制器**不写 store** —— 读用 `getState()`，写只经 store 的**具名 action**。
 * ⚠️ 原则 6：用例失败 `message` **原样**进 toast / 错误横幅（本层只加**包装**文案，不改写原因）。
 * ⚠️ 原则 5：文案全在 `constants/text.ts` 的 `API_SETTINGS_TEXT`。
 * ⚠️ **与源版的一处如实差异**：源 `showToast` 的默认时长是 **2600ms**，本仓 `pushToast` 是 **3000ms**
 *   （`TOAST_DURATION_MS`）⇒ 本控制器不传时长，沿用本仓默认（已登记，见轮次文件）。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import type { ApiProviderMeta, ApiSetup } from '@/stable/model/gen';
import {
  loadApiProviders,
  loadApiSetup,
  saveApiSetup as runSaveApiSetup,
  saveProviderConfig,
  saveProviderKey,
  saveProviderSecret,
  testProvider,
} from '@/core/usecases/apiConfig';
import { API_SETTINGS_TEXT } from '@/constants/text';
import { API_TOAST_ERROR_MS } from '@/constants';

/** 面板上**一张 provider 卡片的草稿**（原 `_Component46` 的 `c[S.id]`，组件局部 state） */
export interface ProviderDraft {
  baseUrl: string;
  model: string;
  params: Record<string, unknown>;
  /** 新密钥（**空 ⇒ 不改**；原 `keyInput`） */
  keyInput: string;
  /** 新 Secret（**空 ⇒ 不改**；原 `secretInput`） */
  secretInput: string;
}

/** 保存某 provider 的入参（草稿 + 它的 id） */
export interface SaveProviderInput extends ProviderDraft {
  providerId: string;
}

/** 测试连接的结果（原 `.api-test-result` 的 `{ok, message}`） */
export interface ProviderTestResult {
  ok: boolean;
  message: string;
}

export interface ApiOpsController {
  /** 面板挂载时拉一次：provider + 配置 + 通道设置 + 用量（原 `loadApiSetup` + `refreshApiConfig`） */
  load(): Promise<void>;
  /** 只刷 provider 配置（原 `refreshApiConfig`；保存 / 切换启用后调用） */
  refreshConfig(): Promise<void>;
  /** 保存通道设置（原 `saveApiSetup` 30594-30623） */
  saveSetup(patch: Partial<ApiSetup>): Promise<void>;
  /**
   * 保存某 provider 的草稿（`baseUrl` / `model` / `params`）+ 可选密钥 / Secret
   * （原 `_Component46.jsx:96-144` 的 `k`）—— 成功 / 失败**都发 toast**
   * @returns 配置本体是否保存成功（密钥失败**不阻断**，与源一致：它只拼进提示）
   */
  saveProvider(input: SaveProviderInput): Promise<boolean>;
  /** 切换启用（原 `_Component46.jsx:173-181` 的 `C`） */
  toggleEnabled(providerId: string, enabled: boolean): Promise<void>;
  /**
   * 测试连接（原 `_Component46.jsx:148-158` 的 `apiConfigTest`）
   *
   * ⚠️ **它只探测，不保存** —— 源版 `N` 的顺序是 `await k(S)`（保存，带 toast）**再**探测；
   *    「先保存」由调用方（面板）负责，与本控制器保持**同一分工**（否则会保存两次 = 两条 toast）。
   * @returns 就地显示的结果（面板渲染 `.api-test-result`）
   */
  test(providerId: string): Promise<ProviderTestResult>;
}

/** provider 名（提示文案要用；找不到 ⇒ 回落 id —— 不编造名字） */
const nameOf = (meta: readonly ApiProviderMeta[], id: string): string =>
  meta.find((p) => p.id === id)?.name ?? id;

export function createApiOps(store: AppStore, ports: Ports): ApiOpsController {
  const deps = { api: ports.host.api };

  /** 读 provider 元信息 + 配置（两者是**同一个后端调用**） */
  const refreshConfig = async (): Promise<void> => {
    const s = store.useStore.getState();
    const r = await loadApiProviders(deps);
    if (!r.ok) {
      // ★ 源版 `loadApiSetup` 是 `try{}catch{}` **全吞** ⇒ 本层如实上报（原则 6）
      s.pushBackendError('unknown', r.message);
      return;
    }
    s.setApiProviders(r.value.providers);
    s.setApiConfigs(r.value.configs);
  };

  const saveProvider = async (input: SaveProviderInput): Promise<boolean> => {
    const s = store.useStore.getState();
    const name = nameOf(s.apiProvidersMeta, input.providerId);

    // ① 配置本体（baseUrl / model / params）
    const cfg = await saveProviderConfig(deps, input.providerId, {
      baseUrl: input.baseUrl,
      model: input.model,
      params: input.params,
    });
    if (!cfg.ok) {
      // 源版这里是 `catch { showToast('保存失败：' + message) }` —— 同一句话、同一条路
      s.pushToast(API_SETTINGS_TEXT.saveFailed(cfg.message), API_TOAST_ERROR_MS, 'error');
      return false;
    }

    // ② 密钥 / Secret（**非空才送**；单个失败**不阻断**，只拼进提示 —— 源 107-125）
    let note = '';
    const key = input.keyInput.trim();
    if (key) {
      const r = await saveProviderKey(deps, input.providerId, key);
      note += r.ok ? API_SETTINGS_TEXT.keySaved : API_SETTINGS_TEXT.keySaveFailed(r.message);
    }
    const secret = input.secretInput.trim();
    if (secret) {
      const r = await saveProviderSecret(deps, input.providerId, secret);
      note += r.ok ? API_SETTINGS_TEXT.secretSavedNote : API_SETTINGS_TEXT.secretSaveFailed(r.message);
    }

    // ③ 回灌（源 126：`await a()` —— 保存后刷新配置，让 keyHint / hasSecret 立即可见）
    await refreshConfig();
    s.pushToast(API_SETTINGS_TEXT.saved(name, note), undefined, 'success');
    return true;
  };

  return {
    load: async () => {
      const s = store.useStore.getState();
      await refreshConfig();
      const r = await loadApiSetup(deps);
      if (!r.ok) {
        s.pushBackendError('unknown', r.message);
        return;
      }
      s.setApiSetup(r.value.setup);
      s.setApiUsage(r.value.usage);
    },

    refreshConfig,

    saveSetup: async (patch) => {
      const s = store.useStore.getState();
      const r = await runSaveApiSetup(deps, patch);
      if (!r.ok) {
        s.pushBackendError('unknown', r.message);
        return;
      }
      s.setApiSetup(r.value.setup);
    },

    saveProvider,

    toggleEnabled: async (providerId, enabled) => {
      const s = store.useStore.getState();
      // 源 175-180：只送 `{enabled}` 一个补丁，再刷新
      const r = await saveProviderConfig(deps, providerId, { enabled });
      if (!r.ok) {
        s.pushBackendError('unknown', r.message);
        return;
      }
      await refreshConfig();
    },

    test: async (providerId) => {
      const r = await testProvider(deps, providerId);
      if (!r.ok) return { ok: false, message: r.message };
      // 源：成功时显示后端给的 message（没有 ⇒ 空串，不编「成功」）
      return { ok: true, message: r.value.message ?? '' };
    },
  };
}
