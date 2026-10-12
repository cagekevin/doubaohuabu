/**
 * state 出口
 * 依据：docs/11 §二 §5
 */

export { createAppStore, type AppState, type AppStore, type AppStoreHook, type AppStoreDeps } from './store';
export { StoreProvider, useStore, useGen, useAnalyze, useAccountOps, useBatchSend, useCapture, useSendQueue, useStoreApi, useLicenseOps, useHostOps, useProjectOps, useApiOps, usePullResult } from './context';
export type { GenController } from './generate';
export type { AnalyzeController } from './analyze';
export type { AccountOpsController } from './accountOps';
export type { BatchSendController } from './batchSend';
export type { SendQueueController } from './sendQueue';
export type { CaptureController } from './capture';
/**
 * ⚠️ 控制器**类型**不从本 barrel 再导出（`ui` 只经 `useXxxOps()` 拿**值**）—— 判据 B5：
 *    没人消费的导出就是死代码。`HostOpsController` / `ProjectOpsController` 此前在这里多导
 *    一份，而真消费者（`bootstrap/container.ts` · `state/context.tsx`）都直接从源文件取 ⇒ 已删。
 */
/** ★ 只导出**面板真的用**的两个类型（判据 B5：`ApiOpsController` / `SaveProviderInput` 无人消费 ⇒ 不导出） */
export type { ProviderDraft, ProviderTestResult } from './apiOps';
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
