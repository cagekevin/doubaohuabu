/**
 * `window.api` 的取用与 `Result` 收口（**独立模块，避免循环依赖**）
 *
 * ⚠️ 为什么不放在 `./index`：`index.ts` 会 import `project/session/api`，
 *    而它们都需要 `getHostApi` ⇒ 若从 `./index` 取会形成**循环**（depcruise `no-circular` 会拦）。
 */

import { err, ok, toMessage, type Result } from '@/core/model/result';
import { COMMON_TEXT, HOST_TEXT } from '@/constants/text';
import type { SendFailKind } from '@/constants/failure';
import { asRecord, isRecord } from '@/lib/object';
import type { HostApi } from './window-api';

/** 宿主缺失时的明确错误（**不返回假成功**）—— 文案真源 = `HOST_TEXT.apiMissing`（本处只转发） */
export const HOST_MISSING = HOST_TEXT.apiMissing;

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

/**
 * 载荷守卫（`TD-04-10` 母体的收口点）—— **入参已是"判定成功"的那个对象**
 *
 * ⚠️ **为什么需要它**：此前 `normalize` / `checkOk` 的末尾都是 `ok(raw as T)` ——
 *   即把 `unknown` **谎报**成调用方声明的任意形状。后端字段改名/漂移 ⇒ 前端读到 `undefined`
 *   **静默**得到错数据（已发生症状 ≥7 笔：`{size}` vs `{bytes}` 恒 0 · `{code}` vs
 *   `{machineCode}` 恒空串 · `ApiJobLite.id` vs `jobId` 订阅失效 …）。
 * ⇒ 现在调用方可传一个守卫；**不通过 ⇒ 如实 `err`**（文案点名缺哪个字段），不再 `as T` 蒙过去。
 *
 * ⚠️ **分工不变（别混用）**：`normalize` 是 fail-open 通道、`checkOk` 是 fail-closed 通道，
 *   守卫只是给两者**各加一层业务字段校验**，不改变它们各自的 `ok` 判定语义。
 */
export type PayloadGuard = (payload: Record<string, unknown>) => boolean;

/** `normalize` 的可选参数：`guard` 业务字段守卫 · `field` 违约文案里点名的字段 */
export interface BoundaryOpts {
  guard?: PayloadGuard;
  /** 违约文案点名的字段（默认 `payload`） */
  field?: string;
}

/** 把宿主返回的 `{ok:false,error}` 形态也归一成 `Result` */
export function normalize<T>(raw: unknown, opts: BoundaryOpts = {}): Result<T> {
  if (raw && typeof raw === 'object') {
    const r = asRecord(raw);
    if (r.ok === false) {
      // ★ 与 `checkOk` 同口径：优先 `message`（用户可读原文），退回 `error`（码）—— TD-13-15
      const m = r.message;
      return err(
        'unknown',
        typeof m === 'string' && m
          ? m
          : typeof r.error === 'string'
            ? r.error
            : JSON.stringify(r.error ?? ''),
      );
    }
  }
  // ★ `TD-04-10`：过了 `ok` 判定还要过**业务字段**守卫（缺字段 ⇒ 如实报错，不 `as T`）
  // ⚠️ 本行**必须**保留 `raw && typeof raw === 'object'`（**不能**换 `isRecord`）：
  //    它让**数组**原样进守卫；换成 `isRecord` 会把数组挡在外面 ⇒「以守卫为准」的通道语义就变了。
  if (opts.guard && !(raw && typeof raw === 'object' && opts.guard(raw as Record<string, unknown>))) {
    return err('unknown', COMMON_TEXT.boundaryViolation(opts.field ?? 'payload'));
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
 *     `reveal-path`（`main.js`）·
 *     `project-storage-reveal`（`main.js`）· `lovart-scan.js` · `clear-browser-cache`（`main.js`）。
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
    guard,
    field,
  }: { reason?: SendFailKind; fallback?: string; guard?: PayloadGuard; field?: string } = {},
): Result<T> {
  // ⚠️ `isRecord` 与原来的「非空 + `typeof === 'object'`」**等价**：数组两种写法都在这一步报同一个
  //    `boundaryViolation('ok')`（数组没有布尔 `ok`）
  if (!isRecord(raw)) return err(reason, COMMON_TEXT.boundaryViolation('ok'));
  const v = raw;
  if (typeof v.ok !== 'boolean') return err(reason, COMMON_TEXT.boundaryViolation('ok'));
  if (v.ok !== true) {
    // ★ 后端两种错误形态：`{error:'码'}`（码即文案）与 `{error:'码', message:'用户可读原文'}`
    //   ⇒ **优先 `message`（原文）**，退回 `error`（码），再退回 `fallback`（TD-13-15）
    const m = v.message;
    const msg =
      typeof m === 'string' && m ? m : typeof v.error === 'string' && v.error ? v.error : fallback;
    return err(reason, msg);
  }
  // ★ `TD-04-10`：`ok:true` 之后再过一层**业务字段**守卫（后端把 `machineCode` 改名成 `code`
  //   这类漂移，在此**当场报错**，而不是让调用方 `typeof … === 'string' ? … : ''` 静默兜成空值）
  if (guard && !guard(v)) {
    return err(reason, COMMON_TEXT.boundaryViolation(field ?? 'payload'));
  }
  return ok(raw as T);
}

// ⚠️ 已删除 `requireHostApi()`（2026-10-10）
//    它的注释写着「用于 `send`/`sendSync` 这类**无法返回 Result** 的调用」——
//    这个假设是**错的**：`Result<T>` 是**同步**判别联合，`sendSync` 完全可以返它。
//    该假设是母体（端口契约「声明成功却会抛」）的源头，且它本身 0 调用（死导出）。
//    正确做法：会失败的端口方法**一律声明 `Result`**，不用"抛 + 调用点兜"。
