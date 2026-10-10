/**
 * state 出口
 * 依据：docs/11 §二 §5
 */

export { createAppStore, type AppState, type AppStore, type AppStoreHook } from './store';
export { StoreProvider, usePorts, useStore, useGen } from './context';
export type { GenController } from './generate';
export type { UiSlice, BannerError } from './slices/ui';
export type { GlobalSlice, SaveError } from './slices/global';
export type { CanvasSlice, CanvasSnapshot, CanvasSliceDeps } from './slices/canvas';
export { takeSnapshot } from './slices/canvas';
