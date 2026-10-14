/**
 * state 出口
 *
 * ★ **只导出真被 `@/state` 消费者取用的东西**（判据 B5：没人消费的导出就是死代码）——
 *   `ui` 只经 `useXxxOps()` 拿**值**；需要类型处（`bootstrap/container.ts` · `state/context.tsx`）
 *   一律从**源文件**取（`@/state/generate` · `./slices/ui` …）
 *   ⇒ 切片类型 / 控制器类型 / 未被取用的 action **一律不从本 barrel 再导出**（那是第二出口）。
 */

export { createAppStore, type AppStore } from './store';
export { StoreProvider, useStore, useGen, useAnalyze, useAccountOps, useBatchSend, useCapture, useSendQueue, useStoreApi, useLicenseOps, useHostOps, useProjectOps, useApiOps, usePullResult } from './context';
/** 面板真的用的两个类型（`ui/panels/ApiSettings`） */
export type { ProviderDraft, ProviderTestResult } from './apiOps';
/** 20 键的读写映射（**结构穷尽**；`bootstrap/hydrate` 用） */
export { PERSIST } from './persistKeys';
