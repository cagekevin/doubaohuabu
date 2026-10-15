// ============================================================
// API 接入 · HTTP 帮手（薄封装，可注入 fetch 供测试）
// ------------------------------------------------------------
// 主进程全局 fetch（Electron 44 = Node 22，undici 实现）足够用；
// AbortController 做超时；错误统一结构化，供 job-manager 的重试矩阵判定。
// ============================================================

import type { FetchLike } from './types';

/** JSON 请求的结果（**失败也返回**，由调用方按 `ok` / `status` 判） */
export interface JsonResult {
  ok: boolean;
  /** 0 = 网络层失败（不可达 / 超时 / DNS） */
  status: number;
  /**
   * 解析出的 JSON —— **形状未知**，故是 `unknown`：
   * ⛔ 不写成 `object`／`Record<…>`（那等于替调用方谎报形状，本仓最贵的 bug 类就是它）。
   */
  body: unknown;
  /** 响应原文（回调给服务商自己的解析函数） */
  text: string;
  /** 只在网络层失败时出现：`timeout`（主动中止）/ `network`（不可达等） */
  error?: 'timeout' | 'network';
}

export interface JsonRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/**
 * 发 JSON 请求并解析 JSON 响应。
 *
 * @param fetchImpl 测试注入点（`null` ⇒ 走运行时默认 fetch）
 *   网络层失败 → `{ ok:false, status:0, error:'timeout'|'network' }`（`body` 为空对象）
 */
async function requestJson(fetchImpl: FetchLike | null, url: string, { method = 'GET', headers = {}, body = '', timeoutMs = 30000 }: JsonRequestOptions = {}): Promise<JsonResult> {
  const f = fetchImpl ?? globalThis.fetch;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (ctl) {
    timer = setTimeout(() => ctl.abort(), timeoutMs);
  }
  try {
    const res = await f(url, {
      method,
      headers,
      ...(body ? { body } : {}),
      ...(ctl ? { signal: ctl.signal } : {}),
    });
    const text = await res.text();
    let parsed: unknown = {};
    try {
      parsed = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      parsed = {};
    }
    return { ok: res.ok, status: res.status, body: parsed, text };
  } catch (err) {
    // ⚠️ 收窄到 Error：原实现读 `err.message`，非 Error 的抛出物本来也就取不到 message（等价）
    const aborted = ctl !== null && err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
    return { ok: false, status: 0, body: {}, text: '', error: aborted ? 'timeout' : 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 传输双栈（引擎 v2）：按顺序尝试多个传输栈（fetch 实现）。
 * 只有「网络层失败」（status 0：不可达 / 超时 / DNS）才降级下一栈 ——
 * HTTP 层错误（4xx/5xx）说明栈本身通了，直接返回让上层按状态码处理。
 * 生产环境传入 [net.fetch, global.fetch]（Chromium 栈吃系统代理，undici 栈兜底）。
 *
 * @param fetchImpls 单个或数组；null/空 → global fetch
 *   `via` = 实际成功的栈下标（诊断用）
 */
async function requestJsonWithFallback(
  fetchImpls: FetchLike | FetchLike[] | null | undefined,
  url: string,
  opts?: JsonRequestOptions,
): Promise<JsonResult & { via?: number }> {
  const list = (Array.isArray(fetchImpls) ? fetchImpls : [fetchImpls]).filter((f): f is FetchLike => Boolean(f));
  const first = list[0];
  if (first === undefined) return requestJson(null, url, opts);

  let last = await requestJson(first, url, opts);
  if (last.ok || last.status !== 0) return { ...last, via: 0 };
  for (let i = 1; i < list.length; i++) {
    // 网络层失败 → 试下一栈
    last = await requestJson(list[i] ?? null, url, opts);
    if (last.ok || last.status !== 0) return { ...last, via: i };
  }
  return { ...last, via: list.length - 1 };
}

/** HTTP 状态 → 错误分类口径（重试矩阵的判定依据，见方案 §5） */
export type HttpErrorKind = 'auth' | 'bad_request' | 'rate_limit' | 'server' | 'network' | 'http';

/** HTTP 状态 → 错误分类（重试矩阵的判定依据，见方案 §5） */
function classifyHttpError(status: number): { kind: HttpErrorKind; retryable: boolean } {
  if (status === 401 || status === 403) return { kind: 'auth', retryable: false };
  if (status === 400 || status === 422) return { kind: 'bad_request', retryable: false };
  if (status === 429) return { kind: 'rate_limit', retryable: true };
  if (status >= 500) return { kind: 'server', retryable: true };
  if (status === 0) return { kind: 'network', retryable: true };
  return { kind: 'http', retryable: false };
}

export { requestJson, requestJsonWithFallback, classifyHttpError };
