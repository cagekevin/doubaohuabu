/**
 * Result 契约（★ 原则 6「错误透传」的载体）
 *
 * 依据：docs/11-架构与契约定稿.md §6.5 原则 6
 *
 * 铁律：
 *   - **生产者**（adapters / core/rules）产生错误，`message` 必须是**原始错误原文**
 *   - **消费者**（usecases / state / ui）**只能转发**，不得改写 / 吞掉 / 编造
 *   - 缺错误 ⇒ 去生产者那里补，**不得在前端造**
 */

import type { SendFailKind } from '@/constants/failure';

/** 成功 */
export interface Ok<T> {
  ok: true;
  value: T;
}

/** 失败 —— message 必须是原始错误原文 */
export interface Err {
  ok: false;
  /** 分类（来自 constants/failure.ts 的 kind 联合） */
  reason: SendFailKind;
  /** ★ 原始错误原文，**不得改写** */
  message: string;
  /** 可选：原始错误对象（用于上层再判断，例如 HTTP status） */
  cause?: unknown;
}

/** 统一结果类型 —— usecase / port 的返回值契约 */
export type Result<T> = Ok<T> | Err;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/**
 * 构造失败结果 —— **仅供生产者使用**。
 * 消费者不得调用（否则就是把「转发」变成「造错」）。
 */
export const err = (reason: SendFailKind, message: string, cause?: unknown): Err => ({
  ok: false,
  reason,
  message,
  ...(cause === undefined ? {} : { cause }),
});

/** 把任意抛出物转成原始 message（不加工、不美化） */
export const toMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
