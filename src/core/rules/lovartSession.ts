/**
 * Lovart 会话条（真实 Chrome 集成）的**纯判据**（★ 必测）
 *
 * 依据（**逐行回源** `_Component25.jsx:341-380`）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 打开态 | `:54-56` 的 `N` | `idle` / `opening` / `open`（带 `alreadyOpen`）/ `error`（带 `error` + `message`） |
 *   | 同步态 | `:57` 的 `S` | `null` / `syncing` / `error`（带 `message`） |
 *   | 提示行 | `:366` | 五档三目（`open` 里再分 `alreadyOpen`） |
 *   | 三键禁用 | `:369` / `:372` / `:375` | `opening‖open` · `syncing` · `status !== 'open'` |
 *   | 同步键文案 | `:373` | `syncing ? '同步中…' : '同步会话到画布'` |
 *   | 两处错误行 | `:379` / `:380` | 同步错误（前缀 `同步失败：`）· 打开错误（错误码表 → `message` → `打开失败`） |
 *
 * ⚠️ **零宿主依赖**（纯字符串 / 布尔）⇒ 归 `core/rules`（§6.5 原则 7：只测纯逻辑）；
 *    状态**持有**在 UI 的 `useState`（源同），本模块只做**判定**。
 */

import { LOVART_SESSION_TEXT } from '@/constants/text';

/** 打开态（原 `N.status`） */
export type LovartOpenStatus = 'idle' | 'opening' | 'open' | 'error';

/** 打开态快照（原 `_Component25` 的 `N`） */
export interface LovartOpenState {
  status: LovartOpenStatus;
  /** 窗口本来就开着（原 `alreadyOpen`）—— 只在 `status === 'open'` 时有意义 */
  alreadyOpen?: boolean;
  /** 失败时的**后端错误码**（原 `error`）—— 查 `LOVART_SESSION_TEXT.openError` */
  error?: string;
  /** 失败时的后端原文（原 `message`） */
  message?: string;
}

/** 同步态快照（原 `S`；`null` = 还没同步过、也无错） */
export interface LovartSyncState {
  status: 'syncing' | 'error';
  message?: string;
}

/** 后端错误码 → 文案；未知码 ⇒ `null`（交给调用方回落 `message` / 兜底，源同） */
export function lovartOpenErrorOf(code: string | undefined): string | null {
  if (!code) return null;
  const table: Record<string, string> = LOVART_SESSION_TEXT.openError;
  return table[code] ?? null;
}

/** 提示行（源 `:366`）—— 五档，`open` 再分 `alreadyOpen` */
export function lovartHint(state: LovartOpenState): string {
  const t = LOVART_SESSION_TEXT.hint;
  if (state.status === 'open') return state.alreadyOpen ? t.alreadyOpen : t.opened;
  if (state.status === 'opening') return t.opening;
  if (state.status === 'error') return t.openFailed;
  return t.idle;
}

/** 「在真实 Chrome 登录」是否禁用（源 `:369`：`status === 'opening' || status === 'open'`） */
export function lovartOpenDisabled(state: LovartOpenState): boolean {
  return state.status === 'opening' || state.status === 'open';
}

/** 「同步会话到画布」是否禁用（源 `:372`：`sync?.status === 'syncing'`） */
export function lovartSyncDisabled(sync: LovartSyncState | null): boolean {
  return sync?.status === 'syncing';
}

/** 「关闭 Chrome」是否禁用（源 `:375`：`status !== 'open'`） */
export function lovartCloseDisabled(state: LovartOpenState): boolean {
  return state.status !== 'open';
}

/** 同步键文案（源 `:373`） */
export function lovartSyncLabel(sync: LovartSyncState | null): string {
  return sync?.status === 'syncing' ? LOVART_SESSION_TEXT.syncing : LOVART_SESSION_TEXT.sync;
}

/** 同步错误行（源 `:379`）—— `null` = **不渲染**（源是 `? … : null`） */
export function lovartSyncErrorText(sync: LovartSyncState | null): string | null {
  if (sync?.status !== 'error') return null;
  return `${LOVART_SESSION_TEXT.syncFailedPrefix}${sync.message ?? ''}`;
}

/**
 * 打开错误行（源 `:380`：`xD[N.error] || N.message || '打开失败'`）—— `null` = **不渲染**
 *
 * ⚠️ 三级：**错误码表** → 后端原文 → 兜底文案（顺序即优先级，源同）。
 */
export function lovartOpenErrorText(state: LovartOpenState): string | null {
  if (state.status !== 'error') return null;
  return (
    lovartOpenErrorOf(state.error) ?? state.message ?? LOVART_SESSION_TEXT.openFailedFallback
  );
}
