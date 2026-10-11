/**
 * 节点的**发送状态**显示（原 `CL.jsx:757-762` 的 `foot-send-status` / `head-send-status`）
 *
 * 依据（**逐行回源抄录**）：
 * ```jsx
 * {l && l.status && (
 *   <span className={`foot-send-status head-send-status foot-send-${l.status} nodrag nopan`}
 *         title={l.msg} onMouseDown={e => e.stopPropagation()}>
 *     {l.status === 'sending' ? '⏳ ' : l.status === 'success' ? '✓ ' : '⚠ '}
 *     {l.msg}
 *   </span>
 * )}
 * ```
 * 其中 `l` = `nodeSendStates[id]`（本仓 `state/slices/ui` 的 `NodeSendState`）。
 *
 * ⚠️ **源只分三档**：`sending` / `success` / **其余一律 `⚠`**（含 `waiting` / `skipped` / 未知）
 *    —— 逐字保留，**不**按 `BatchItemStatus` 的五态各配一个图标。
 *
 * 归属：纯映射（无 `window` / 时间 / 随机）⇒ `core`（原则 4）。
 */

import { NODE_EDIT_TEXT } from '@/constants/text';

/** 三档语气（决定 CSS 类；`sending` 档没有专属样式，故与 base 同形） */
export type SendStatusTone = 'sending' | 'success' | 'error';

export interface SendStatusView {
  /** 前缀图标（**含尾空格**，原字面量如此） */
  icon: string;
  /** 语气 → UI 侧映射成 `foot-send-{tone}` 类 */
  tone: SendStatusTone;
}

/**
 * 发送状态 → 图标 + 语气（原 `CL.jsx:757-762`）
 *
 * @param status `NodeSendState.status`；**空 / 未定义 ⇒ `null`**（源 `l && l.status` 为假 ⇒ 不渲染）
 */
export function sendStatusView(status: string | undefined): SendStatusView | null {
  if (!status) return null;
  if (status === 'sending') return { icon: NODE_EDIT_TEXT.sendSendingIcon, tone: 'sending' };
  if (status === 'success') return { icon: NODE_EDIT_TEXT.sendSuccessIcon, tone: 'success' };
  return { icon: NODE_EDIT_TEXT.sendErrorIcon, tone: 'error' };
}
