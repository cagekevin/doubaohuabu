/**
 * UI slice（① 全局共享 —— 见 docs/11 §5.1）
 *
 * ⚠️ 原则 1：**只有 state 能写 store**。usecases / adapters 只能返回结果，由本层写入。
 * ⚠️ 原则 5（SSOT）：错误**文案映射**在 `constants/failure.ts`，本层**只存"当前有哪些错误"**。
 *    （这是 docs/11 §6.5 审计越权 4 的修正）
 * ⚠️ §5.3：单 slice ≤300 行 / ≤25 字段 —— 超了就按共享范围再分
 */

import type { BackendErrorKind } from '@/constants/failure';
import type { ToastLevel } from '@/constants/text';
// ⚠️ 形状真源在用例层（`sendQueue.ts`）—— state 依赖 core 是允许方向
import type { NodeSendState } from '@/core/usecases/sendQueue';
import { LS_NEWIMAGES_CURRENT_ONLY, LS_NEWIMAGES_FOLDED } from '@/stable/contracts/keys';

/** 默认 toast 时长（ms） */
const TOAST_DURATION_MS = 3000;

/**
 * 本片负责持久化的**布尔开关**（原 `zd(key,'0') === '1'` / `Fd(key, v?'1':'0')`）
 *
 * ⚠️ 只列**本片真的用**的键（判据 B5：不留没人读的开关）—— 故不在此列的有两个：
 *    · `doubao-newimages-autocap` —— ★ **按裁定不接**：它开关的是**自动轮询抓取**，而
 *      `docs/10` #11 + `electron/main.js:2749` 明确「默认关闭…每 3 秒执行页面脚本会被判机器人」
 *      ⇒ 本项目**不开**（面板上那个按钮保留可见但**禁用**，`title` 说明是项目决定）。
 *    · `doubao-view-head-collapsed` —— 后台视图头部折叠，本工程还没有那个头部控件。
 */
export type UiFlagKey = typeof LS_NEWIMAGES_FOLDED | typeof LS_NEWIMAGES_CURRENT_ONLY;

/** 本片的注入（`state` 不碰 `localStorage` —— 键的读写在 `persistKeys` 的唯一落点上） */
export interface UiSliceDeps {
  now: () => number;
  /** 读一个开关（原 `zd(key, '0') === '1'`；缺省 ⇒ false） */
  readFlag: (key: UiFlagKey) => boolean;
  /** 写一个开关（原 `Fd(key, v ? '1' : '0')`） */
  writeFlag: (key: UiFlagKey, value: boolean) => void;
}

/**
 * Toast 数据形状（★ 由 state 拥有 —— 数据在 state；`ui/common/ToastHost` 只 import 类型）
 * 依据：docs/11 §6.5 原则 1「谁拥有状态谁写」+ 分层（state 不得依赖 ui）
 */
export interface ToastItem {
  id: string;
  message: string;
  /** 毫秒；0 = 不自动消失 */
  duration: number;
  /**
   * 语气（原 `showToast(text, 'info' | 'warn' | 'err')`）
   *
   * ★ **2026-10-10 补**：此前只有 `message` + `duration` ⇒ 源版按 info / warn / err
   *   分级的提示**全用同一个样式**（`analyzePrompt` / 批量发送 / 额度异常这些都带语气）。
   * ⚠️ 等级联合的真源在 `constants/text.ts`（core 不得向上依赖 state）。
   */
  level: ToastLevel;
}

/** 横幅错误（★ 保留原始 message —— 原则 6：错误不可被掩盖） */
export interface BannerError {
  id: string;
  kind: BackendErrorKind;
  /** ★ 原始错误原文，不得改写 */
  message: string;
}

export interface UiSlice {
  // ── state ──
  toasts: ToastItem[];
  backendErrors: BannerError[];
  /** 画布选中数（工具条用） */
  selectedCount: number;
  /**
   * 当前**显示**在后台视图里的账号（原 `_Component43` 的 `o`）
   *
   * 原版同一个时刻只让一个账号的 `<webview>` 可见（其余 `dv-wv-hidden`），
   * 用户就是在那个可见页面里登录。`null` ⇒ 全隐藏（只跑后台任务、不给人看）。
   */
  activeAccountId: string | null;
  /**
   * ★ **「按关键词拆分」弹窗**（原 `splitKeywordModal` shared.js:26776 / 28535-28546）
   *
   * ⚠️ **为什么它住 store 而不是组件局部 state**：弹窗由**画布节点内**的按钮打开，
   *    但必须由**画布宿主**（`CanvasHost.Inner`）渲染 —— 因为拆分会**删掉源节点**
   *    （渲染在节点里的弹窗会随之卸载），且节点在 ReactFlow 的**变换容器**内
   *    （`position: fixed` 的浮层会被 transform 带偏）。源版也正是这么放的。
   */
  splitKeywordModal: { sourceNodeId: string } | null;
  openSplitKeywordModal: (sourceNodeId: string) => void;
  closeSplitKeywordModal: () => void;

  // ── 「出新图」面板的持久化开关（原 `_Component26` 的 `f` / `m` 两个 `useState` + `Fd`）──
  /**
   * 折叠态（原 `f`，键 `doubao-newimages-folded`）
   * ⚠️ 与源一致：**初始化时读盘**（`zd(v0,'0')==='1'`），切换时**立即写盘**（`Fd`）——
   *    不经防抖落盘（它不在 `PersistSnapshot` 里；源版也是直接 `localStorage`）。
   */
  newImagesFolded: boolean;
  /** 只留本画布（原 `m`，键 `doubao-newimages-current-only`） */
  newImagesCurrentOnly: boolean;
  setNewImagesFolded: (value: boolean) => void;
  setNewImagesCurrentOnly: (value: boolean) => void;

  // ── actions（只做编排，不做业务）──
  /**
   * 推一条 toast
   * @param level 语气（默认 `'info'`）—— **加在第三位**，保证既有 `pushToast(msg)` /
   *   `pushToast(msg, 5000)` 调用**零改动**（向后兼容）
   */
  pushToast: (message: string, duration?: number, level?: ToastLevel) => void;
  dismissToast: (id: string) => void;
  /** 上报后端错误（原始 message 必须原样传入） */
  pushBackendError: (kind: BackendErrorKind, message: string) => void;
  dismissBackendError: (id: string) => void;
  clearBackendErrors: () => void;
  setSelectedCount: (n: number) => void;
  setActiveAccountId: (id: string | null) => void;
  /**
   * ★ **节点的发送状态**（原 `nodeSendStates[id]`）
   *
   * 两个用处（与源一致）：① 节点上显示状态圆点；② `x3` 的**防重复发送**守卫
   * （`input.isSending(nodeId)` ⇒ `该节点正在发送中，已跳过（防止重复发送）`）。
   * ⚠️ 不持久化（源版也不落盘）—— 重启即清空。
   */
  nodeSendStates: Record<string, NodeSendState>;
  setNodeSendState: (nodeId: string, patch: Omit<NodeSendState, 'nodeId'>) => void;
  /**
   * ★ **清掉**某节点的发送状态（原 `clearNodeSendState`，`OL.jsx:194-196`）
   *
   * ⚠️ 为什么需要"清"而不是"写一个 idle"：源版 `OL.jsx:197-207` 的 `S()` 助手在
   *   `status === 'idle' || !msg` 时走的是 **`C(e)` 删除** —— 于是节点上**没有这条记录**，
   *   与「有一条 `status:'idle'` 的记录」在展示上不同（后者会让状态圆点常驻）。
   */
  clearNodeSendState: (nodeId: string) => void;
}

/** 用注入的时钟生成 id（避免在 store 里直接调 Date.now —— 原则 4 的延伸） */
export function createUiSlice(deps: UiSliceDeps) {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${deps.now().toString(36)}-${++seq}`;

  return (set: (partial: Partial<UiSlice>) => void, get: () => UiSlice): UiSlice => ({
    toasts: [],
    backendErrors: [],
    selectedCount: 0,
    activeAccountId: null,
    splitKeywordModal: null,
    nodeSendStates: {},
    // ★ 初值**读盘**（原 `_Component26.jsx:30-45` 的 `zd(v0/w0, '0') === '1'`）
    newImagesFolded: deps.readFlag(LS_NEWIMAGES_FOLDED),
    newImagesCurrentOnly: deps.readFlag(LS_NEWIMAGES_CURRENT_ONLY),

    pushToast: (message, duration = TOAST_DURATION_MS, level = 'info') => {
      set({ toasts: [...get().toasts, { id: nextId('toast'), message, duration, level }] });
    },

    dismissToast: (id) => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },

    pushBackendError: (kind, message) => {
      // ⚠️ 去重：同 kind + 同 message 不重复堆叠
      const exists = get().backendErrors.some((e) => e.kind === kind && e.message === message);
      if (exists) return;
      set({ backendErrors: [...get().backendErrors, { id: nextId('err'), kind, message }] });
    },

    dismissBackendError: (id) => {
      set({ backendErrors: get().backendErrors.filter((e) => e.id !== id) });
    },

    clearBackendErrors: () => set({ backendErrors: [] }),

    setSelectedCount: (n) => set({ selectedCount: n }),
    setActiveAccountId: (activeAccountId) => set({ activeAccountId }),

    openSplitKeywordModal: (sourceNodeId) => set({ splitKeywordModal: { sourceNodeId } }),
    closeSplitKeywordModal: () => set({ splitKeywordModal: null }),

    setNewImagesFolded: (value) => {
      // ⚠️ 与源一致：**先写盘再改状态**（原 `p(le => { Fd(v0, …); return te; })`）
      deps.writeFlag(LS_NEWIMAGES_FOLDED, value);
      set({ newImagesFolded: value });
    },
    setNewImagesCurrentOnly: (value) => {
      deps.writeFlag(LS_NEWIMAGES_CURRENT_ONLY, value);
      set({ newImagesCurrentOnly: value });
    },

    setNodeSendState: (nodeId, patch) => {
      set({ nodeSendStates: { ...get().nodeSendStates, [nodeId]: { nodeId, ...patch } } });
    },

    clearNodeSendState: (nodeId) => {
      const next = { ...get().nodeSendStates };
      delete next[nodeId];
      set({ nodeSendStates: next });
    },
  });
}
