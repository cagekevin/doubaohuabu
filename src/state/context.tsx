/**
 * store 的 React 接入（Context + hooks）
 *
 * 依据：技能 `vercel-composition-patterns` 的 `state-decouple-implementation`
 *   —— **Provider 是唯一知道 state 怎么管的地方**；组件只经 hook 访问
 *
 * 注意：本文件在 `state/`（L4），**不得** import `ui/`（L5）—— 见 .dependency-cruiser.cjs
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useStore as useZustandStore } from 'zustand';
import type { Ports } from '@/core/ports';
import type { AppState, AppStore } from './store';
import type { GenController } from './generate';

const StoreContext = createContext<AppStore | null>(null);
const GenContext = createContext<GenController | null>(null);

export function StoreProvider({
  store,
  gen,
  children,
}: {
  store: AppStore;
  /** 生成控制器（**state 层唯一把结果写进 store 的地方**） */
  gen: GenController;
  children: ReactNode;
}) {
  return (
    <StoreContext.Provider value={store}>
      <GenContext.Provider value={gen}>{children}</GenContext.Provider>
    </StoreContext.Provider>
  );
}

/** 取生成控制器（组件**不得**直接调 `core/usecases`） */
export function useGen(): GenController {
  const g = useContext(GenContext);
  if (!g) throw new Error('useGen 必须在 <StoreProvider> 内使用');
  return g;
}

function useAppStore(): AppStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore / usePorts 必须在 <StoreProvider> 内使用');
  return s;
}

/** 订阅 store 的某个切片（**必须传 selector**，避免全量订阅导致全树重渲） */
export function useStore<T>(selector: (s: AppState) => T): T {
  const { useStore: zustandStore } = useAppStore();
  return useZustandStore(zustandStore, selector);
}

/** 取注入的端口（供 usecases 调用；组件**不得**直接调 `window.api`） */
export function usePorts(): Ports {
  return useAppStore().ports;
}

/**
 * 取 store 的**非订阅式读取入口**（`getState`）—— 原版里那个 `t()` 的对应物
 *
 * ⚠️ **用途**：事件回调里要读「**当前**值」时（如 ReactFlow 的 `onNodesChange` / `onEdgesChange`）。
 *    用 `useStore(selector)` 拿到的是**上次渲染的快照**；一次渲染周期内若回调被调用多次
 *    （ReactFlow 会批量派发变更），后一次就会用旧值**覆盖**前一次的结果。
 *    实测后果：删节点后紧接着的「边变更」会把刚删的节点**复活**，撤销栈被压入坏快照。
 *
 * ⚠️ 与 `useStore` 的区别：**不订阅** ⇒ 读取不会引起重渲。
 *    ⇒ **不要**在渲染里用它取「要显示的值」（那样界面不会更新）。
 */
export function useStoreApi(): AppStore['useStore'] {
  return useAppStore().useStore;
}
