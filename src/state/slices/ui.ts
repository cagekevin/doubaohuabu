/**
 * UI slice（① 全局共享 —— 见 docs/11 §5.1）
 *
 * ⚠️ 原则 1：**只有 state 能写 store**。usecases / adapters 只能返回结果，由本层写入。
 * ⚠️ 原则 5（SSOT）：错误**文案映射**在 `constants/failure.ts`，本层**只存"当前有哪些错误"**。
 *    （这是 docs/11 §6.5 审计越权 4 的修正）
 * ⚠️ §5.3：单 slice ≤300 行 / ≤25 字段 —— 超了就按共享范围再分
 */

import type { BackendErrorKind } from '@/constants/failure';

/** 默认 toast 时长（ms） */
const TOAST_DURATION_MS = 3000;

/**
 * Toast 数据形状（★ 由 state 拥有 —— 数据在 state；`ui/common/ToastHost` 只 import 类型）
 * 依据：docs/11 §6.5 原则 1「谁拥有状态谁写」+ 分层（state 不得依赖 ui）
 */
export interface ToastItem {
  id: string;
  message: string;
  /** 毫秒；0 = 不自动消失 */
  duration: number;
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

  // ── actions（只做编排，不做业务）──
  pushToast: (message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
  /** 上报后端错误（原始 message 必须原样传入） */
  pushBackendError: (kind: BackendErrorKind, message: string) => void;
  dismissBackendError: (id: string) => void;
  clearBackendErrors: () => void;
  setSelectedCount: (n: number) => void;
}

/** 用注入的时钟生成 id（避免在 store 里直接调 Date.now —— 原则 4 的延伸） */
export function createUiSlice(now: () => number) {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${now().toString(36)}-${++seq}`;

  return (set: (partial: Partial<UiSlice>) => void, get: () => UiSlice): UiSlice => ({
    toasts: [],
    backendErrors: [],
    selectedCount: 0,

    pushToast: (message, duration = TOAST_DURATION_MS) => {
      set({ toasts: [...get().toasts, { id: nextId('toast'), message, duration }] });
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
  });
}
