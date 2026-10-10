/**
 * 组装容器（★ 唯一知道「用哪个 adapter」的地方）
 *
 * 依据：docs/11 §3.2 + 技能 `vercel-composition-patterns` 的 `state-context-interface`
 *
 * ⚠️ 这是**唯一**允许 import 全部层的地方（见 .dependency-cruiser.cjs）
 * ⚠️ 端口注入到 **state / usecases**，**不是 core**（core/rules 是纯函数，不需要注入）
 */

import type { Ports } from '@/core/ports';
import { createAppStore, type AppStore } from '@/state';
import { createPersistController, type PersistController } from '@/state/persist';
import { createSystemClock } from '@/adapters/clock/system';
import { createLocalStorage } from '@/adapters/storage/local';
import { createMockHost } from '@/adapters/host/mock';
import { createElectronHost } from '@/adapters/host/electron';
import { createSiteRegistry } from '@/adapters/site/registry';
import { hydrate, type HydrateResult } from './hydrate';
import { createGenController, type GenController } from '@/state/generate';
import { createSubscriptions, type Subscriptions } from '@/state/subscriptions';

/** 是否运行在 Electron 宿主里（有 `window.api` 即真实宿主） */
export function hasElectronHost(): boolean {
  return typeof window !== 'undefined' && typeof (window as { api?: unknown }).api === 'object';
}

/**
 * 组装端口
 *
 * ★ **真实宿主优先**：在 Electron 里用 `adapters/host/electron`（唯一接触 `window.api` 的地方），
 *   否则回落 `adapters/host/mock`（纯浏览器可开发，docs/11 §二）。
 */
export function createPorts(): Ports {
  // ⚠️ 站点适配器**注入 HostPort**（不得直调 window.api —— TD-05-1）
  const host = hasElectronHost() ? createElectronHost() : createMockHost();
  return {
    host,
    // ★ 站点注册表（doubao / dola / lovart）；未实现的站点**缺项** ⇒ 调用方报明确错误
    sites: createSiteRegistry(host),
    storage: createLocalStorage(),
    clock: createSystemClock(),
  };
}

export interface Container {
  store: AppStore;
  ports: Ports;
  /** 生成控制器（state 层） */
  gen: GenController;
  /**
   * 启动加载（读键 + **启动归位** + 灌 store）
   * ⚠️ 注释更正（2026-10-10）：原写「+ 5 条迁移」—— 4 条已按 TD-16-2 删除，
   *    现只剩图片外置（落盘时跑）与 `resetStaleJobs`（每次启动跑）。
   */
  hydrate(): HydrateResult;
  /** 持久化调度器（防抖 600ms + beforeunload） */
  persist: PersistController;
  /** ★ 宿主事件订阅（**唯一写入点** —— 判据 D2） */
  subscriptions: Subscriptions;
}

export function createContainer(): Container {
  const ports = createPorts();
  const store = createAppStore(ports);
  const { host, storage, clock } = ports;

  const persist = createPersistController({
    clock,
    persist: {
      storage,
      migrationCtx: {
        saveImage: (dataUrl) => host.media.saveImageSync(dataUrl),
        now: () => clock.now(),
      },
      saveBackup: (json) => host.project.saveBackup(json),
      saveSnapshot: (p) => host.project.saveSnapshot(p),
      logOperation: (e) => host.project.logOperation(e),
    },
    readState: () => {
      const s = store.useStore.getState();
      return {
        projects: s.projects,
        activeId: s.activeId,
        // ★ 账号族（`docs/14` §2 ⭐：原实现只读不写 ⇒ 账号增删改刷新即丢）
        accounts: s.accounts,
        groups: s.groups,
        proxyPool: s.proxyPool,
        poolStrategy: s.poolStrategy,
      };
    },
    // 原则 6：错误原样写入 saveError（不改写 message）
    onError: (message) => store.useStore.setState({ saveError: { message, at: clock.now() } }),
    onOk: () => store.useStore.setState({ saveError: null }),
  });

  // ★ 把 persist 接到 store：**只有"该存的数据"变了才安排落盘**
  //   （不订阅 toast/selectedCount 这类纯 UI 状态 —— 避免无意义写盘）
  const pick = (s: ReturnType<typeof store.useStore.getState>) => [
    s.projects,
    s.activeId,
    s.nodes,
    s.edges,
    s.library,
    // ★ 账号族：变了也要安排落盘（否则账号增删改不落盘 —— `docs/14` §2 ⭐）
    s.accounts,
    s.groups,
    s.proxyPool,
    s.poolStrategy,
  ];
  let last = pick(store.useStore.getState());
  store.useStore.subscribe((s) => {
    const cur = pick(s);
    if (cur.some((v, i) => v !== last[i])) {
      last = cur;
      persist.schedule('auto');
    }
  });

  // ★ 宿主事件订阅（唯一写入点）：`onApiJobEvent` → `settings.upsertApiJob`
  //   —— 原实现适配器早就暴露了订阅，但 state 侧无人订阅 ⇒ API 任务结果回不来（docs/14 §4）
  const subscriptions = createSubscriptions(store, ports);

  return {
    store,
    ports,
    gen: createGenController(store, ports),
    hydrate: () => hydrate(store, ports),
    persist,
    subscriptions,
  };
}
