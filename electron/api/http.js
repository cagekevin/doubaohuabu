// ============================================================
// API 接入 · HTTP 帮手（薄封装，可注入 fetch 供测试）
// ------------------------------------------------------------
// 主进程全局 fetch（Electron 44 = Node 22，undici 实现）足够用；
// AbortController 做超时；错误统一结构化，供 job-manager 的重试矩阵判定。
// ============================================================

/**
 * 发 JSON 请求并解析 JSON 响应。
 * @param {Function} fetchImpl  测试注入点（默认 global fetch）
 * @returns {Promise<{ok:boolean, status:number, body:object, text:string}>}
 *   网络层失败 → { ok:false, status:0, error:'network' }（body 为空对象）
 */
async function requestJson(fetchImpl, url, { method = 'GET', headers = {}, body = '', timeoutMs = 30000 } = {}) {
  const f = fetchImpl || global.fetch;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;
  if (ctl) {
    timer = setTimeout(() => ctl.abort(), timeoutMs);
  }
  try {
    const res = await f(url, {
      method,
      headers,
      ...(body ? { body } : {}),
      ...(ctl ? { signal: ctl.signal } : {})
    });
    const text = await res.text();
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch (_) { parsed = {}; }
    return { ok: res.ok, status: res.status, body: parsed, text };
  } catch (err) {
    const aborted = ctl && (err && (err.name === 'AbortError' || String(err.message || '').includes('abort')));
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
 * @param {Function|Function[]} fetchImpls 单个或数组；null/空 → global fetch
 * @returns {Promise<{ok:boolean, status:number, body:object, text:string, via?:number}>}
 *   via = 实际成功的栈下标（诊断用）
 */
async function requestJsonWithFallback(fetchImpls, url, opts) {
  const list = (Array.isArray(fetchImpls) ? fetchImpls : [fetchImpls]).filter(Boolean);
  if (!list.length) return requestJson(null, url, opts);
  let last = null;
  for (let i = 0; i < list.length; i++) {
    const res = await requestJson(list[i], url, opts);
    if (res.ok || res.status !== 0) return { ...res, via: i };
    last = res; // 网络层失败 → 试下一栈
  }
  return { ...last, via: list.length - 1 };
}

/**
 * HTTP 状态 → 错误分类（重试矩阵的判定依据，见方案 §5）。
 * @returns {{kind:string, retryable:boolean}}
 */
function classifyHttpError(status) {
  if (status === 401 || status === 403) return { kind: 'auth', retryable: false };
  if (status === 400 || status === 422) return { kind: 'bad_request', retryable: false };
  if (status === 429) return { kind: 'rate_limit', retryable: true };
  if (status >= 500) return { kind: 'server', retryable: true };
  if (status === 0) return { kind: 'network', retryable: true };
  return { kind: 'http', retryable: false };
}

module.exports = { requestJson, requestJsonWithFallback, classifyHttpError };
