/**
 * `window.api` 的取用与 `Result` 收口（**独立模块，避免循环依赖**）
 *
 * ⚠️ 为什么不放在 `./index`：`index.ts` 会 import `project/session/api`，
 *    而它们都需要 `getHostApi` ⇒ 若从 `./index` 取会形成**循环**（depcruise `no-circular` 会拦）。
 */

import { err, ok, toMessage, type Result } from '@/core/model/result';
import type { HostApi } from './window-api';

/** 宿主缺失时的明确错误（**不返回假成功**） */
export const HOST_MISSING = 'window.api 不存在：当前不在 Electron 宿主中';

/** 取 `window.api`；不存在则返回 `null`（调用方转成 Result） */
export function getHostApi(): HostApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: HostApi }).api;
  return api && typeof api === 'object' ? api : null;
}

/** 包一层 `Result`（原则 6：把抛出物转成**原文**，不改写） */
export async function guard<T>(fn: (api: HostApi) => Promise<T> | T): Promise<Result<T>> {
  const api = getHostApi();
  if (!api) return err('unknown', HOST_MISSING);
  try {
    return ok(await fn(api));
  } catch (e) {
    return err('unknown', toMessage(e), e);
  }
}

/** 把宿主返回的 `{ok:false,error}` 形态也归一成 `Result` */
export function normalize<T>(raw: unknown): Result<T> {
  if (raw && typeof raw === 'object') {
    const r = raw as { ok?: unknown; error?: unknown };
    if (r.ok === false) {
      return err('unknown', typeof r.error === 'string' ? r.error : JSON.stringify(r.error ?? ''));
    }
  }
  return ok(raw as T);
}

// ⚠️ 已删除 `requireHostApi()`（2026-10-10）
//    它的注释写着「用于 `send`/`sendSync` 这类**无法返回 Result** 的调用」——
//    这个假设是**错的**：`Result<T>` 是**同步**判别联合，`sendSync` 完全可以返它。
//    该假设是母体（端口契约「声明成功却会抛」）的源头，且它本身 0 调用（死导出）。
//    正确做法：会失败的端口方法**一律声明 `Result`**，不用"抛 + 调用点兜"。
