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
