/**
 * store 组装（zustand 5）
 *
 * 依据：docs/11 §二 / §5
 *   - 单一 store，按**共享范围**切 slice（不是按业务域）
 *   - `bootstrap/container.ts` 是**唯一**注入 ports 的地方
 *
 * ⚠️ 原则 1：**只有 state 能写 store**。usecases / adapters 只能返回 Result，由本层写入。
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { Ports } from '@/core/ports';
import { EDGE_MARKER, EDGE_STYLE } from '@/constants';
import { createCanvasSlice, type CanvasSlice } from './slices/canvas';
import { createGlobalSlice, type GlobalSlice } from './slices/global';
import { createUiSlice, type UiSlice } from './slices/ui';
import { createSettingsSlice, type SettingsSlice } from './slices/settings';

export type AppState = GlobalSlice & CanvasSlice & UiSlice & SettingsSlice;

/** zustand 的 store hook 类型 */
export type AppStoreHook = UseBoundStore<StoreApi<AppState>>;

export interface AppStore {
  /** 注入的端口（usecases 的依赖来源；state 自身不 import adapters —— 见 .dependency-cruiser.cjs） */
  readonly ports: Ports;
  readonly useStore: AppStoreHook;
}

/**
 * 创建应用 store
 * @param ports 由 `bootstrap/container.ts` 组装并注入
 */
export function createAppStore(ports: Ports): AppStore {
  /** 连线 id 序号（原实现用 `Pt('e')` 的计数；这里用闭包序号） */
  let edgeSeq = 0;

  const useStore = create<AppState>()((set, get) => {
    /**
     * slice 只拿到 set / get，拿不到 ports —— 端口只能经 usecase 使用（原则 1）
     *
     * ★ **画布 → 工程的镜像**（唯一的同步点）
     *   `nodes`/`edges`/`library` 是**画布的实时状态**，而 `projects[activeId].data` 才是
     *   **被持久化的真相**（`usecases/persistProject` 只写 `projects`）。
     *   若两者不同步 ⇒ 画布上的改动**刷新即丢**（W15 实测抓到）。
     *   放在这里而不是各 slice 里：**跨 slice 的一致性只该有一个同步点**。
     */
    const setPartial = (partial: Partial<AppState>) =>
      set((s) => {
        const touchesCanvas = 'nodes' in partial || 'edges' in partial || 'library' in partial;
        /**
         * ★ **同一批里换了 `activeId` ⇒ 绝不镜像**（`docs/14` §2 的 ⭐⭐ 数据损坏 bug）
         *
         * 不设这道闸的话：`setActiveId(newId)` 之后任何画布改动都会把**旧画布**
         * 写进**新工程** ⇒ 切项目即串数据。
         * 正解在 `slices/global.ts` 的 `openProject`（它**原子地**把新工程的画布数据带进来）；
         * 这里只是**兜底**，让"忘了带数据"也**不会**造成损坏。
         */
        const switchesProject = 'activeId' in partial && partial.activeId !== s.activeId;
        if (!touchesCanvas || !s.activeId || switchesProject) return partial as AppState;

        const nodes = partial.nodes ?? s.nodes;
        const edges = partial.edges ?? s.edges;
        const library = partial.library ?? s.library;
        return {
          ...partial,
          projects: s.projects.map((p) =>
            p.id === s.activeId ? { ...p, data: { ...p.data, nodes, edges, library } } : p,
          ),
        } as AppState;
      });
    const getState = () => get() as AppState;

    return {
      ...createGlobalSlice(setPartial, getState, { now: () => ports.clock.now() }),
      ...createCanvasSlice(setPartial, getState, {
        now: () => ports.clock.now(),
        makeEdge: (conn) => ({
          id: `e_${ports.clock.now().toString(36)}_${++edgeSeq}`,
          source: conn.source,
          target: conn.target,
          type: 'interactive',
          style: { ...EDGE_STYLE },
          markerEnd: { ...EDGE_MARKER },
        }),
      }),
      ...createUiSlice(() => ports.clock.now())(setPartial, getState),
      // ★ settings：API 配置族（判据 C2 —— `global` 超 25 字段即按共享范围再分）
      ...createSettingsSlice(setPartial, getState),
    };
  });

  return { ports, useStore };
}
