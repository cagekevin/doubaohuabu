/**
 * `window.api` 的取用与 `Result` 收口（**独立模块，避免循环依赖**）
 *
 * ⚠️ 为什么不放在 `./index`：`index.ts` 会 import `project/session/api`，
 *    而它们都需要 `getHostApi` ⇒ 若从 `./index` 取会形成**循环**（depcruise `no-circular` 会拦）。
 */

import { err, ok, toMessage, type Result } from '@/core/model/result';
import { COMMON_TEXT } from '@/constants/text';
import type { SendFailKind } from '@/constants/failure';
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

/**
 * 宿主**恒带 `ok`** 通道的收口（★ **fail-closed** 侧 —— TD-04-5 / TD-16-74 / TD-04-7）
 *
 * ⚠️ **与 `normalize` 的分工（别混用）**：
 *   · `normalize` 是 `ok === false`（**fail-open**）—— 服务"后端**无 `ok` 裸返回**"的通道
 *     （`save-file` 返 `true`、`load-file` 返字符串 / `null`）；那里漏 `ok` 是**正常**的。
 *   · 本函数服务"后端**恒带 `ok`**"的通道 —— 下列 handler 的**每条 return 都带 `ok`**（已逐条回源核）：
 *     `reveal-path`（`main.js:1893`）· `show-in-folder`（`main.js:1262`）·
 *     `project-storage-reveal`（`main.js:408`）· `lovart-scan.js` · `clear-browser-cache`（`main.js:1201,1213`）。
 *     ⇒ 漏 `ok` / 非布尔即**契约违约**（`boundaryViolation`），**不得静默当成功**（原则 6）。
 *
 * @param reason 失败分类（默认 `unknown`；调用方有更准的分类时可覆盖）
 * @param fallback 后端说失败但没给 `error` 时的原文（默认 `COMMON_TEXT.unknownReason`）
 * @returns 成功 ⇒ `ok(原对象)`（调用方按自己的载荷形状取值）；失败 ⇒ `err`（**原文透传**）
 */
export function checkOk<T = Record<string, unknown>>(
  raw: unknown,
  {
    reason = 'unknown',
    fallback = COMMON_TEXT.unknownReason,
  }: { reason?: SendFailKind; fallback?: string } = {},
): Result<T> {
  if (!raw || typeof raw !== 'object') return err(reason, COMMON_TEXT.boundaryViolation('ok'));
  const v = raw as { ok?: unknown; error?: unknown };
  if (typeof v.ok !== 'boolean') return err(reason, COMMON_TEXT.boundaryViolation('ok'));
  if (v.ok !== true) {
    return err(reason, typeof v.error === 'string' ? v.error : fallback);
  }
  return ok(raw as T);
}

// ⚠️ 已删除 `requireHostApi()`（2026-10-10）
//    它的注释写着「用于 `send`/`sendSync` 这类**无法返回 Result** 的调用」——
//    这个假设是**错的**：`Result<T>` 是**同步**判别联合，`sendSync` 完全可以返它。
//    该假设是母体（端口契约「声明成功却会抛」）的源头，且它本身 0 调用（死导出）。
//    正确做法：会失败的端口方法**一律声明 `Result`**，不用"抛 + 调用点兜"。
