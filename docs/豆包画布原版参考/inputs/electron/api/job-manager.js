// ============================================================
// API 接入 · 任务引擎（状态机 + 轮询 + 重试 + 结果规整）
// ------------------------------------------------------------
// 状态流：queued → submitting → running → downloading → done
//                                     ↘ failed / cancelled（任一环节可终态）
// 重试矩阵（方案 §5）：
//   401/403 鉴权、400/422 参数 → 不重试直接失败；
//   429 / 5xx / 网络 → 指数退避重试 ×3（2s/8s/30s）；
//   轮询阶段业务失败（服务商明确 failed）→ 不重试（防烧钱）；
//   轮询网络失败连续 5 次 → 判失败。
// 引擎 v2 新增（对标改造方案 §3.1，不动状态机骨架）：
//   · 多域名健康切换：adapter.domains 声明，提交网络失败 → 当前域冷却 5min 切备域；
//   · 额度信号：quotaHints 命中 → 终态 kind='quota'+advice，不重试（防白等/重复扣费）；
//   · 瞬态错误提示：adapter.transientErrorHints 命中 → 即使 HTTP 层非重试类也视为可重试；
//   · 日志/错误脱敏：进 job.error（会过 IPC 桥）的消息统一 redactText。
// 可注入依赖（fetchImpl / transports / sleep / now）→ node:test 直接驱动全状态机。
// ============================================================
const { requestJsonWithFallback, classifyHttpError } = require('./http');
const { createDomainRota } = require('./domains');
const { matchQuotaHint, quotaMessage } = require('./quota');
const { redactText } = require('./redact');

const DEFAULT_TIMEOUT = { image: 3 * 60 * 1000, video: 20 * 60 * 1000 };
const POLL_BASE_MS = 5000;
const POLL_CAP_MS = 15000;
const POLL_FACTOR = 1.3;
const POLL_MAX_NET_FAILURES = 5;
const SUBMIT_RETRY_DELAYS = [2000, 8000, 30000];
const DOWNLOAD_RETRY_DELAYS = [1500, 4000, 10000];
const CONCURRENT_PER_PROVIDER = 3;

function createJobManager(deps) {
  const {
    configStore,       // createConfigStore 产物
    registry,          // electron/api/registry.js
    onEvent,           // (snapshot) => void  每次状态变更推送
    fetchImpl = null,  // 测试注入
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = () => Date.now(),
    resolveRefPath = (p) => p, // img:// 引用 → 本地绝对路径（main.js 提供）
    fetchBytes = null, // 测试注入：url → {ok, bytes:Buffer, mime}（图片结果转 dataUrl 用）
    transports = null,      // 传输双栈：fetch 实现数组（生产 [net.fetch, global.fetch]）
    domainCooldownMs = null, // 测试注入：域名冷却时长（默认 5min）
    concurrency = null,     // 队列并发数（覆盖 CONCURRENT_PER_PROVIDER；由 setup.concurrency 注入）
    getFallbackProviderId = null // () => fallbackProviderId（主服务商额度/鉴权失败时兜底重开）
  } = deps || {};

  /** @type {Map<string, object>} */
  const jobs = new Map();
  let seq = 0;

  function newJobId() {
    seq += 1;
    return `apj-${now().toString(36)}-${seq}`;
  }

  function publicSnapshot(job) {
    return {
      jobId: job.jobId,
      providerId: job.providerId,
      providerName: job.providerName,
      kind: job.kind,
      nodeId: job.nodeId || null,
      status: job.status,
      progress: job.progress,
      error: job.error || null,
      attempt: job.attempt || null,       // 渲染层回写 genHistory 用（不含密钥）
      results: job.results || [],
      params: job.params || {},
      prompt: job.prompt || '',
      taskId: job.taskId || null,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt || null,
      usedFallback: !!job._usedFallback
    };
  }

  function emit(job) {
    if (onEvent) { try { onEvent(publicSnapshot(job)); } catch (_) { /* 推送失败不影响引擎 */ } }
  }

  function setStatus(job, status, patch) {
    job.status = status;
    if (patch && typeof patch === 'object') Object.assign(job, patch);
    emit(job);
  }

  // ---- 并发控制：同 provider 最多 _concurrency 个 running（可运行时调整）----
  let _concurrency = (typeof concurrency === 'number' && concurrency >= 1) ? Math.floor(concurrency) : CONCURRENT_PER_PROVIDER;
  function setConcurrency(n) {
    const v = Number(n);
    if (Number.isFinite(v) && v >= 1) _concurrency = Math.floor(v);
  }
  const runningCount = {}; // providerId → n
  function pump() {
    for (const job of jobs.values()) {
      if (job.status !== 'queued') continue;
      const n = runningCount[job.providerId] || 0;
      if (n >= _concurrency) continue;
      runningCount[job.providerId] = n + 1;
      setStatus(job, 'submitting');
      // 异步跑，不 await（pump 由 submit/cancel 触发）
      runJob(job)
        .catch(() => { /* runJob 内部已终态化 */ })
        .finally(() => {
          runningCount[job.providerId] = Math.max(0, (runningCount[job.providerId] || 1) - 1);
          pump(); // 空位出来了，看看还有没有排队的
        });
    }
  }

  /** 把错误统一成带 .apiError 的 Error（重试矩阵判定依据）；advice 可选（额度类建议文案） */
  function apiError(kind, message, status, retryable, advice) {
    const e = new Error(message);
    e.apiError = { kind, message, status: status || 0, retryable: !!retryable, ...(advice ? { advice } : {}) };
    return e;
  }

  // ---- 引擎 v2 · 多域名健康轮换（按 provider 共享，一个任务探明主域挂了，后续任务直接走备域）----
  /** @type {Map<string, ReturnType<createDomainRota>>} */
  const rotas = new Map();

  function effectiveDomains(adapter, configured) {
    const all = [];
    if (configured) all.push(configured);
    for (const d of (Array.isArray(adapter.domains) ? adapter.domains : [])) {
      if (d && !all.includes(d)) all.push(d);
    }
    return all;
  }

  /** 域名数 <2 → 不需要轮换（返回 null，引擎行为与 v1 完全一致） */
  function getRota(adapter, configured) {
    const all = effectiveDomains(adapter, configured);
    if (all.length < 2) return null;
    const key = `${adapter.id}|${all.join('\n')}`;
    let rota = rotas.get(key);
    if (!rota) {
      rota = createDomainRota(all, {
        now,
        ...(domainCooldownMs != null ? { cooldownMs: domainCooldownMs } : {})
      });
      rotas.set(key, rota);
    }
    return rota;
  }

  /** 传输双栈：transports 优先，退回单 fetchImpl（兼容旧测试注入） */
  function doRequest(url, opts) {
    const impls = Array.isArray(transports) && transports.length ? transports : [fetchImpl];
    return requestJsonWithFallback(impls, url, opts);
  }

  function httpFail(res, where, adapter) {
    const cls = classifyHttpError(res.status);
    const msg =
      (res.body && (res.body.error && (res.body.error.message || res.body.error)) && `HTTP ${res.status}: ${typeof res.body.error === 'string' ? res.body.error : res.body.error.message}`) ||
      (res.body && res.body.message && `HTTP ${res.status}: ${res.body.message}`) ||
      (res.status === 0
        ? (res.error === 'timeout' ? `${where}：连接超时` : `${where}：网络不可达`)
        : `${where}：HTTP ${res.status}`);
    let retryable = cls.retryable;
    // 瞬态错误提示：服务商报错文本里带 ECONNRESET/ETIMEDOUT 等网络族字样 → 视为可重试
    if (!retryable && adapter && adapter.transientErrorHints instanceof RegExp && adapter.transientErrorHints.test(msg)) {
      retryable = true;
    }
    return apiError(cls.kind, redactText(msg), res.status, retryable);
  }

  /** 通用重试：fn 抛出的错误带 retryable 才重试，退避 [2s,8s,30s] */
  async function withRetry(job, stage, fn, delays) {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (err) {
        const info = err && err.apiError;
        if (!info || !info.retryable || i >= delays.length) throw err;
        setStatus(job, job.status, { error: { kind: info.kind, message: `${stage}失败（${info.message}），自动重试 ${i + 1}/${delays.length}` } });
        await sleep(delays[i]);
      }
    }
  }

  // ---- 提交 ----
  async function doSubmit(job, adapter, config) {
    // 多域名：本次提交用轮换选出的域；轮询粘住同一个域（taskId 通常域内有效）
    const rota = getRota(adapter, config.baseUrl);
    const baseUrl = rota ? rota.pick() : config.baseUrl;
    if (rota) job._domain = baseUrl;
    const effectiveConfig = baseUrl && baseUrl !== config.baseUrl ? { ...config, baseUrl } : config;

    const req = adapter.buildSubmit({
      config: effectiveConfig,
      kind: job.kind,
      params: job.params,
      prompt: job.prompt,
      refPaths: job.refPaths
    });
    const res = await doRequest(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      timeoutMs: 30000
    });
    if (!res.ok) {
      // 网络层失败（status 0）→ 当前域进冷却，withRetry 的下一次提交自动换域
      if (res.status === 0 && rota) rota.reportFailure(baseUrl);
      throw httpFail(res, '提交任务', adapter);
    }
    if (rota) rota.reportSuccess(baseUrl);
    // 额度信号：命中 → 终态 quota + advice，不进重试矩阵（防白等/重复扣费）。
    // 放在 parseSubmit 之前：中转站常见「HTTP 200 + 文案报错」和「任务已提交但额度未扣除」两种形态都要拦。
    const qh = matchQuotaHint(adapter, res.text);
    if (qh) {
      const rawMsg =
        (res.body && (res.body.error && (res.body.error.message || res.body.error))) ||
        (res.body && res.body.message) || qh.matched;
      throw apiError('quota', quotaMessage(qh, typeof rawMsg === 'string' ? rawMsg : ''), res.status, false, qh.advice);
    }
    const parsed = adapter.parseSubmit(res.body) || {};
    if (parsed.taskId) {
      job.taskId = parsed.taskId;
      return { mode: 'async' };
    }
    if (Array.isArray(parsed.results) && parsed.results.length) {
      return { mode: 'sync', results: parsed.results };
    }
    throw apiError('bad_response', '提交成功但响应里既无任务号也无结果', res.status, false);
  }

  // ---- 轮询 ----
  async function doPoll(job, adapter, config) {
    if (typeof adapter.buildPoll !== 'function') {
      throw apiError('bad_response', '该服务商未提供轮询接口', 0, false);
    }
    let netFailures = 0;
    let k = 0;
    const startedAt = now();
    const timeoutMs =
      (config.timeoutSec && config.timeoutSec[job.kind] ? config.timeoutSec[job.kind] * 1000 : 0) ||
      DEFAULT_TIMEOUT[job.kind] || DEFAULT_TIMEOUT.video;

    while (true) {
      if (job.status === 'cancelled') throw apiError('cancelled', '任务已取消', 0, false);
      if (now() - startedAt > timeoutMs) {
        throw apiError('timeout', `任务超时（超过 ${Math.round(timeoutMs / 60000)} 分钟），任务号 ${job.taskId} 可去服务商控制台核查`, 0, false);
      }
      await sleep(Math.min(POLL_CAP_MS, Math.round(POLL_BASE_MS * Math.pow(POLL_FACTOR, k))));
      k += 1;
      // 轮询粘住提交时的域（taskId 通常域内有效，中途换域可能查无此任务）
      const pollConfig = job._domain && job._domain !== config.baseUrl ? { ...config, baseUrl: job._domain } : config;
      const p = adapter.buildPoll({ config: pollConfig, taskId: job.taskId });
      const res = await doRequest(p.url, { method: 'GET', headers: p.headers, timeoutMs: 20000 });
      if (!res.ok) {
        // HTTP 层错误文案也可能带额度信号（如 429 + 余额不足）→ 先查额度再分类
        const qhFail = matchQuotaHint(adapter, res.text);
        if (qhFail) {
          throw apiError('quota', quotaMessage(qhFail, ''), res.status, false, qhFail.advice);
        }
        const cls = classifyHttpError(res.status);
        // 鉴权/参数类轮询错误没有重试意义；网络类容忍连续 5 次
        if (res.status !== 0 && !cls.retryable) throw httpFail(res, '查询任务', adapter);
        netFailures += 1;
        if (netFailures >= POLL_MAX_NET_FAILURES) {
          throw apiError('network', `连续 ${netFailures} 次查询失败，任务号 ${job.taskId}`, 0, false);
        }
        continue;
      }
      netFailures = 0;
      const outcome = adapter.parsePoll(res.body) || { status: 'running' };
      if (outcome.status === 'succeeded') {
        if (!Array.isArray(outcome.results) || !outcome.results.length) {
          throw apiError('bad_response', '任务成功但未返回任何结果', res.status, false);
        }
        return outcome.results;
      }
      if (outcome.status === 'failed') {
        const e = outcome.error || {};
        // 业务失败先过额度文案库：中转站「额度未扣除/没额度」多以 failed 形态出现
        const qh = matchQuotaHint(adapter, (e.message || '') + ' ' + (res.text || ''));
        if (qh) {
          throw apiError('quota', quotaMessage(qh, e.message), res.status, false, qh.advice);
        }
        throw apiError(e.kind || 'business', e.message || '服务商返回任务失败', res.status, false);
      }
      setStatus(job, 'running', { progress: typeof outcome.progress === 'number' ? outcome.progress : job.progress });
    }
  }

  // ---- 结果规整：b64 → dataUrl；图片 url → 抓取成 dataUrl（视频保留远端直链，
  //      落盘本地化由渲染层现有 localizeNodeVideos 链路完成，不重复下载）----
  async function normalizeResult(job, item) {
    // LLM 文本结果：原样透传，不下载（与视频/图片通道隔离）
    if (item.type === 'text') return { type: 'text', text: item.text || '' };
    if (item.b64) {
      return { type: item.type || 'image', dataUrl: `data:${item.mime || 'image/jpeg'};base64,${item.b64}` };
    }
    if (!item.url) throw apiError('bad_response', '结果缺少 url', 0, false);
    if (item.type === 'video') return { type: 'video', url: item.url };
    // 图片远端直链 → 抓成 base64（URL 常为签名临时地址，直存会过期）
    const fetchOne = async () => {
      const f = fetchBytes || defaultFetchBytes;
      const r = await f(fetchImpl, item.url);
      if (!r.ok) throw apiError('network', `结果图片下载失败（HTTP ${r.status || '网络错误'}）`, r.status || 0, true);
      return { type: 'image', dataUrl: `data:${r.mime || 'image/jpeg'};base64,${r.bytes.toString('base64')}` };
    };
    return withRetry(job, '下载结果', fetchOne, DOWNLOAD_RETRY_DELAYS);
  }

  // 单次执行（不含兜底）：成功返回 { ok:true }；失败返回 { ok:false, kind, message, advice }；
  // 取消（cancelled）按成功处理，由调用方决定不重试。
  async function executeJob(job, adapter, config) {
    try {
      // 参考图 img:// → 本地路径（提交前解析，buildSubmit 只认 路径/http/dataUrl）
      job.refPaths = (job.refSources || []).map(resolveRefPath);

      const submitOut = await withRetry(job, '提交', () => doSubmit(job, adapter, config), SUBMIT_RETRY_DELAYS);

      let rawResults;
      if (submitOut.mode === 'sync') {
        rawResults = submitOut.results;
      } else {
        setStatus(job, 'running', { progress: 0 });
        rawResults = await doPoll(job, adapter, config);
      }

      setStatus(job, 'downloading', { progress: 100 });
      const results = [];
      for (const item of rawResults) {
        results.push(await normalizeResult(job, item));
      }
      job.results = results;
      job.finishedAt = now();
      setStatus(job, 'done', { progress: 100, error: null });
      return { ok: true };
    } catch (err) {
      const info = (err && err.apiError) || { kind: 'unknown', message: (err && err.message) || String(err) };
      if (info.kind === 'cancelled') {
        job.finishedAt = now();
        setStatus(job, 'cancelled', { error: null });
        return { ok: true };
      }
      return { ok: false, kind: info.kind, message: info.message, advice: info.advice };
    }
  }

  async function runJob(job) {
    const adapter = registry.getProvider(job.providerId);
    if (!adapter) { fail(job, 'config', `未知服务商 ${job.providerId}`); return; }
    const apiKey = configStore.getApiKey(adapter);
    const cfgRow = configStore.getProviderConfig(adapter);
    if (cfgRow.enabled === false) { fail(job, 'config', `服务商「${adapter.name}」已在设置中停用`); return; }
    if (!apiKey) { fail(job, 'config', '未配置 API 密钥，请先到「API 服务」设置'); return; }
    const secretKey = configStore.getSecretKey ? configStore.getSecretKey(adapter) : '';
    const config = { baseUrl: cfgRow.baseUrl, model: cfgRow.model, params: cfgRow.params, apiKey, secretKey };

    let res = await executeJob(job, adapter, config);

    // 主服务商「额度耗尽 / 鉴权失败」且配置了不同兜底服务商 → 自动换兜底重开一次
    if (!res.ok && (res.kind === 'quota' || res.kind === 'auth')) {
      const fbId = (typeof getFallbackProviderId === 'function' ? getFallbackProviderId() : null) || null;
      if (fbId && fbId !== job.providerId) {
        const fbAdapter = registry.getProvider(fbId);
        if (fbAdapter) {
          const fbKey = configStore.getApiKey(fbAdapter);
          const fbRow = configStore.getProviderConfig(fbAdapter);
          if (fbKey && fbRow.enabled !== false) {
            job._usedFallback = true;
            job._domain = null;   // 兜底服务商走自己的域名轮换
            job.taskId = null;    // 全新提交，重置轮询上下文
            job.providerId = fbId;
            job.providerName = fbAdapter.name;
            const fbSecret = configStore.getSecretKey ? configStore.getSecretKey(fbAdapter) : '';
            const fbConfig = { baseUrl: fbRow.baseUrl, model: fbRow.model, params: fbRow.params, apiKey: fbKey, secretKey: fbSecret };
            setStatus(job, 'submitting', {
              error: { kind: 'fallback', message: `主服务商「${adapter.name}」${res.kind === 'quota' ? '额度异常' : '鉴权失败'}，已自动切换兜底：${fbAdapter.name}` }
            });
            res = await executeJob(job, fbAdapter, fbConfig);
          }
        }
      }
    }

    if (!res.ok) {
      fail(job, res.kind, res.message, res.advice);
    }
  }

  function fail(job, kind, message, advice) {
    job.finishedAt = now();
    // 脱敏后才进 job.error（会经 IPC 桥给渲染层、写进 genHistory）
    setStatus(job, 'failed', { error: { kind, message: redactText(message), ...(advice ? { advice } : {}) } });
  }

  // ---- 对外 API ----

  /** 提交任务。payload 由 IPC 层校验后透传。返回 { ok, jobId } 或 { ok:false, error } */
  function submit(payload) {
    const { providerId, kind, prompt, params, nodeId, refSources, attempt } = payload || {};
    const adapter = registry.getProvider(providerId);
    if (!adapter) return { ok: false, error: `未知服务商 ${providerId}` };
    if (!adapter.capabilities || !adapter.capabilities.includes(kind)) {
      return { ok: false, error: `服务商「${adapter.name}」不支持 ${kind === 'video' ? '视频' : '图片'}生成` };
    }
    if (!String(prompt || '').trim()) return { ok: false, error: '提示词为空' };
    // 密钥缺失在提交时同步拒绝（而不是入队后才失败），用户当场就能看到提示
    if (!configStore.getApiKey(adapter)) {
      return { ok: false, error: '未配置 API 密钥，请先到「API 服务」设置' };
    }
    const job = {
      jobId: newJobId(),
      providerId,
      providerName: adapter.name,
      kind: kind === 'image' ? 'image' : 'video',
      prompt: String(prompt),
      params: { ...(params || {}) },
      nodeId: nodeId || null,
      refSources: Array.isArray(refSources) ? refSources.slice(0, 8) : [],
      attempt: attempt || null,
      status: 'queued',
      progress: 0,
      taskId: null,
      results: [],
      error: null,
      createdAt: now()
    };
    jobs.set(job.jobId, job);
    emit(job);
    pump();
    return { ok: true, jobId: job.jobId };
  }

  /**
   * 批量出片（Stage F）：把同一个基础请求按 matrix 展开成多个变体，逐个入队。
   * 复用 submit + pump 的并发控制（整体仍受 _concurrency 约束）。
   * @param {object} basePayload  { providerId, kind, prompt, params, nodeId, refSources, attempt }
   * @param {Array<{params?:object}>} matrix  每个元素覆盖 params（如不同 ratio/duration/model）
   * @returns {{ok:boolean, jobIds:(string|null)[], errors:string[], total:number}}
   */
  function submitBatch(basePayload, matrix) {
    const variants = Array.isArray(matrix) ? matrix : [];
    const jobIds = [];
    const errors = [];
    for (const v of variants) {
      // 变体可覆盖任意字段（如 attempt / nodeId）；params 做深层合并而非整覆盖
      const p = {
        ...(basePayload || {}),
        ...(v || {}),
        params: { ...((basePayload && basePayload.params) || {}), ...((v && v.params) ? v.params : {}) }
      };
      const r = submit(p);
      if (r.ok) { jobIds.push(r.jobId); errors.push(null); }
      else { jobIds.push(null); errors.push(r.error || '提交失败'); }
    }
    return { ok: true, jobIds, errors, total: variants.length };
  }

  function cancel(jobId) {
    const job = jobs.get(jobId);
    if (!job) return { ok: false, error: '任务不存在' };
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
      return { ok: true, status: job.status };
    }
    // queued / submitting / running / downloading → 置 cancelled，循环下一拍退出
    job.finishedAt = now();
    setStatus(job, 'cancelled', { error: null });
    return { ok: true, status: 'cancelled' };
  }

  function list() {
    return [...jobs.values()].map(publicSnapshot);
  }

  function get(jobId) {
    const job = jobs.get(jobId);
    return job ? publicSnapshot(job) : null;
  }

  return { submit, submitBatch, cancel, list, get, setConcurrency, _jobs: jobs };
}

/** 图片结果抓取（fetchBytes 的默认实现）：url → bytes，按响应头判 MIME */
async function defaultFetchBytes(fetchImpl, url) {
  const f = fetchImpl || global.fetch;
  try {
    const res = await f(url, { method: 'GET' });
    if (!res.ok) return { ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = String((res.headers && res.headers.get && res.headers.get('content-type')) || 'image/jpeg');
    const mime = ct.startsWith('image/') ? ct.split(';')[0] : 'image/jpeg';
    return { ok: true, status: res.status, bytes: buf, mime };
  } catch (_) {
    return { ok: false, status: 0 };
  }
}

module.exports = { createJobManager, defaultFetchBytes, POLL_BASE_MS, POLL_CAP_MS, POLL_MAX_NET_FAILURES };
