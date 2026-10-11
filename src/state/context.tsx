/**
 * store 的 React 接入（Context + hooks）
 *
 * 依据：技能 `vercel-composition-patterns` 的 `state-decouple-implementation`
 *   —— **Provider 是唯一知道 state 怎么管的地方**；组件只经 hook 访问
 *
 * 注意：本文件在 `state/`（L4），**不得** import `ui/`（L5）—— 见 .dependency-cruiser.cjs
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { AppState, AppStore } from './store';
import type { GenController } from './generate';
import type { AnalyzeController } from './analyze';
import type { AccountOpsController } from './accountOps';
import type { BatchSendController } from './batchSend';
import type { SendQueueController } from './sendQueue';
import type { CaptureController } from './capture';
import type { LicenseOpsController } from './licenseOps';
import type { HostOpsController } from './hostOps';
import type { ProjectOpsController } from './projectOps';
import type { ApiOpsController } from './apiOps';

const StoreContext = createContext<AppStore | null>(null);
const GenContext = createContext<GenController | null>(null);
const AnalyzeContext = createContext<AnalyzeController | null>(null);
const AccountOpsContext = createContext<AccountOpsController | null>(null);
const BatchSendContext = createContext<BatchSendController | null>(null);
const SendQueueContext = createContext<SendQueueController | null>(null);
const CaptureContext = createContext<CaptureController | null>(null);
const LicenseOpsContext = createContext<LicenseOpsController | null>(null);
const HostOpsContext = createContext<HostOpsController | null>(null);
const ProjectOpsContext = createContext<ProjectOpsController | null>(null);
const ApiOpsContext = createContext<ApiOpsController | null>(null);

export function StoreProvider({
  store,
  gen,
  analyze,
  accountOps,
  batchSend,
  sendQueue,
  capture,
  licenseOps,
  hostOps,
  projectOps,
  apiOps,
  children,
}: {
  store: AppStore;
  /** 生成控制器（**state 层唯一把结果写进 store 的地方**） */
  gen: GenController;
  /** 提示词分析控制器（同法 —— 组件不得直接调 `core/usecases`） */
  analyze: AnalyzeController;
  /** 账号操作控制器（新增 / 删除 —— 删除要先清会话，故不能只靠 store action） */
  accountOps: AccountOpsController;
  /** 批量发送控制器（装 `prepare`/`transport` —— 否则 `runBatchSend` 没有装配方） */
  batchSend: BatchSendController;
  /** 发送队列控制器（泵 + 逐项操作） */
  sendQueue: SendQueueController;
  /** 截图控制器（节点元素 → 宿主截图 → 素材节点） */
  capture: CaptureController;
  /** 授权控制器（激活页 / 授权门 —— 组件不得经 `usePorts()` 直调 `host.license.*`） */
  licenseOps: LicenseOpsController;
  /** 宿主能力控制器（拖出文件 / 剪贴板 —— 组件不得经 `usePorts()` 直调端口，TD-16-8） */
  hostOps: HostOpsController;
  /** 工程操作控制器（导入工程 —— 组件不得直接调 `core/usecases`） */
  projectOps: ProjectOpsController;
  /** API 配置控制器（provider / 密钥 / 测试连接 —— 组件不得直调 `window.api`） */
  apiOps: ApiOpsController;
  children: ReactNode;
}) {
  return (
    <StoreContext.Provider value={store}>
      <GenContext.Provider value={gen}>
        <AnalyzeContext.Provider value={analyze}>
          <AccountOpsContext.Provider value={accountOps}>
            <BatchSendContext.Provider value={batchSend}>
              <SendQueueContext.Provider value={sendQueue}>
                <CaptureContext.Provider value={capture}>
                  <LicenseOpsContext.Provider value={licenseOps}>
                    <HostOpsContext.Provider value={hostOps}>
                      <ProjectOpsContext.Provider value={projectOps}>
                        <ApiOpsContext.Provider value={apiOps}>{children}</ApiOpsContext.Provider>
                      </ProjectOpsContext.Provider>
                    </HostOpsContext.Provider>
                  </LicenseOpsContext.Provider>
                </CaptureContext.Provider>
              </SendQueueContext.Provider>
            </BatchSendContext.Provider>
          </AccountOpsContext.Provider>
        </AnalyzeContext.Provider>
      </GenContext.Provider>
    </StoreContext.Provider>
  );
}

/** 取生成控制器（组件**不得**直接调 `core/usecases`） */
export function useGen(): GenController {
  const g = useContext(GenContext);
  if (!g) throw new Error('useGen 必须在 <StoreProvider> 内使用');
  return g;
}

/** 取提示词分析控制器（组件**不得**直接调 `core/usecases`） */
export function useAnalyze(): AnalyzeController {
  const a = useContext(AnalyzeContext);
  if (!a) throw new Error('useAnalyze 必须在 <StoreProvider> 内使用');
  return a;
}

/** 取账号操作控制器（组件**不得**直接调 `core/usecases`） */
export function useAccountOps(): AccountOpsController {
  const a = useContext(AccountOpsContext);
  if (!a) throw new Error('useAccountOps 必须在 <StoreProvider> 内使用');
  return a;
}

/** 取批量发送控制器（组件**不得**直接调 `core/usecases`） */
export function useBatchSend(): BatchSendController {
  const b = useContext(BatchSendContext);
  if (!b) throw new Error('useBatchSend 必须在 <StoreProvider> 内使用');
  return b;
}

/** 取发送队列控制器（组件**不得**直接调 `core/usecases`） */
export function useSendQueue(): SendQueueController {
  const q = useContext(SendQueueContext);
  if (!q) throw new Error('useSendQueue 必须在 <StoreProvider> 内使用');
  return q;
}

function useAppStore(): AppStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore 必须在 <StoreProvider> 内使用');
  return s;
}

/** 订阅 store 的某个切片（**必须传 selector**，避免全量订阅导致全树重渲） */
export function useStore<T>(selector: (s: AppState) => T): T {
  const { useStore: boundStore } = useAppStore();
  // ★ 以「绑定 hook」形态直接调用（`zustand` 的 `create()` 返回值本身就是 hook）。
  //   不再走 `useZustandStore(api, selector)` —— 那要求入参是**完整** `StoreApi`（含 `setState`），
  //   而 `AppStoreHook` 已**结构上摘掉 `setState`**（原则 1 的结构承载）。
  return boundStore(selector);
}

/*
 * ★ **2026-10-11 已删除 `usePorts`**（收窄 `ui` 可用面，TD-16-8）：
 *   `ui` 需要的那部分 `HostPort` 面（文件 / 媒体 / 剪贴板）已**全部**收进 `hostOps` 控制器
 *   （见 `state/hostOps.ts`）⇒ 本文件**不再对外暴露 `Ports`** —— `ui` **结构上**就拿不到它。
 *   ⚠️ 这才是"结构上不可能"：胜过再加一条 grep 型闸（后者只防新增、且会追在形态后面跑）。
 */

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

/** 取截图控制器（组件**不得**直接调 `core/usecases`） */
export function useCapture(): CaptureController {
  const c = useContext(CaptureContext);
  if (!c) throw new Error('useCapture 必须在 <StoreProvider> 内使用');
  return c;
}

/**
 * 取授权控制器（组件**不得**经 `usePorts()` 直调 `host.license.*` —— 铁律 2 / TD-16-8）
 *
 * ⚠️ 它**不落 store**：授权状态由调用方（页面）自己持有 —— 见 `licenseOps.ts` 文件头。
 */
export function useLicenseOps(): LicenseOpsController {
  const l = useContext(LicenseOpsContext);
  if (!l) throw new Error('useLicenseOps 必须在 <StoreProvider> 内使用');
  return l;
}

/**
 * 取宿主能力控制器（组件**不得**经 `usePorts()` 直调端口 —— 铁律 2 / TD-16-8）
 *
 * ⚠️ 它**不落 store**（一次性副作用 / 显示偏好）—— 见 `hostOps.ts` 文件头。
 */
export function useHostOps(): HostOpsController {
  const h = useContext(HostOpsContext);
  if (!h) throw new Error('useHostOps 必须在 <StoreProvider> 内使用');
  return h;
}

/** 取工程操作控制器（组件**不得**直接调 `core/usecases`） */
export function useProjectOps(): ProjectOpsController {
  const p = useContext(ProjectOpsContext);
  if (!p) throw new Error('useProjectOps 必须在 <StoreProvider> 内使用');
  return p;
}

/** 取 API 配置控制器（组件**不得**直调 `window.api.apiConfig*` —— 铁律 2 / 原 `_Component46` 的违规点） */
export function useApiOps(): ApiOpsController {
  const a = useContext(ApiOpsContext);
  if (!a) throw new Error('useApiOps 必须在 <StoreProvider> 内使用');
  return a;
}
