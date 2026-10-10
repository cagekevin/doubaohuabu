/**
 * state 出口
 * 依据：docs/11 §二 §5
 */

export { createAppStore, type AppState, type AppStore, type AppStoreHook } from './store';
export { StoreProvider, usePorts, useStore, useGen, useStoreApi } from './context';
export type { GenController } from './generate';
export type { UiSlice, BannerError } from './slices/ui';
export type { GlobalSlice, SaveError } from './slices/global';
export type { CanvasSlice, CanvasSnapshot, CanvasSliceDeps } from './slices/canvas';
export { takeSnapshot } from './slices/canvas';
/** ★ 新增（M8）：API 配置族独立成片（判据 C2） */
export { createSettingsSlice, defaultApiSetup, type SettingsSlice } from './slices/settings';
/** ★ 新增（M8）：宿主事件订阅的**唯一写入点**（判据 D2） */
export { createSubscriptions, type Subscriptions } from './subscriptions';
/** ★ 新增（M8）：20 键的读写映射（**结构穷尽**，替代 `keys-coverage` 闸；用 `LS_*` 常量下标取值） */
export { PERSIST } from './persistKeys';
