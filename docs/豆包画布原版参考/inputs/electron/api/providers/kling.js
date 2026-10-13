// ============================================================
// API 接入 · 可灵（Kling）官方直连适配器（Stage E · 对标改造方案 §3.4 E）
// ------------------------------------------------------------
// 接口口径（Kling 开放平台，2026-09 复核）：
//   鉴权：JWT（HS256）由 access_key(iss) + secret_key(签名) 自签，
//        payload { iss, exp=now+1800, nbf=now-5 }，Authorization: Bearer {jwt}
//   文生视频：POST {base}/videos/text2video
//   图生视频：POST {base}/videos/image2video（body.image + 可选 image_tail 尾帧）
//   万物生视频：POST {base}/videos/omni-video
//   提交响应：{ code:0, data:{ task_id }, message }
//   轮询    ：GET  {base}/videos/{endpoint}/{task_id}
//             → { code:0, data:{ task_status, task_result:{ videos:[{url}] }, task_status_msg } }
//            task_status: "submitted" | "processing" | "succeed" | "failed"
// 解析函数全部是纯函数（body 进 / 结构出），tests/ 用 fixture 直接驱动。
// 原创实现，不搬运任何第三方混淆代码/文案资产。
// ============================================================
const crypto = require('crypto');

const BASE = 'https://api.klingai.com/v1';

function normalizeBase(base, fallback) {
  return (base || fallback || '').replace(/\/+$/, '');
}

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 纯函数：可灵 JWT 签名（HS256）。
 * @param {string} accessKey  access_key（作为 payload.iss）
 * @param {string} secretKey  secret_key（HMAC 密钥）
 * @param {number} [expSec=1800] token 有效期（秒）
 * @returns {string} `header.payload.signature`
 */
function signKlingJwt(accessKey, secretKey, expSec) {
  const exp = typeof expSec === 'number' ? expSec : 1800;
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: accessKey || '', exp: nowSec + exp, nbf: nowSec - 5 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sig = base64url(crypto.createHmac('sha256', secretKey || '').update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

function authHeader(accessKey, secretKey) {
  return { Authorization: `Bearer ${signKlingJwt(accessKey, secretKey, 1800)}` };
}

/** @type {import('../types').ProviderAdapter} */
const adapter = {
  id: 'kling',
  name: '可灵（Kling 官方直连 · JWT）',
  capabilities: ['video'],
  domains: [BASE],
  // 声明需要 access_key + secret_key；真实 JWT 在 buildSubmit/buildPoll 内自签，密钥明文永不过桥
  auth: { type: 'klingJwt', keyFields: ['apiKey', 'secretKey'] },
  transientErrorHints: /ECONNRESET|ECONNABORTED|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|UND_ERR/i,
  quotaHints: [
    { re: /余额不足|额度不足|quota|insufficient/i, kind: 'quota_exhausted', advice: '可灵额度/余额不足，请充值后重试' }
  ],
  frameSupport: { first: true, last: true, refs: 'image_tail' },
  defaults: {
    baseUrl: BASE,
    model: 'kling-v2-1',
    params: { model: 'kling-v2-1', duration: '5', ratio: '16:9', mode: 'standard', cfgScale: 0.5 }
  },
  paramSchema: [
    {
      key: 'model', label: '模型', type: 'select', default: 'kling-v2-1',
      options: ['kling-v2-master', 'kling-v2-6', 'kling-v2-1', 'kling-v1-5', 'kling-v1'].map((v) => ({ value: v, label: v }))
    },
    { key: 'duration', label: '时长（秒）', type: 'select', default: '5', options: ['5', '10'].map((v) => ({ value: v, label: `${v}s` })) },
    {
      key: 'ratio', label: '画面比例', type: 'select', default: '16:9',
      options: ['16:9', '9:16', '1:1'].map((v) => ({ value: v, label: v }))
    },
    {
      key: 'mode', label: '生成模式', type: 'select', default: 'standard',
      options: [{ value: 'standard', label: '标准' }, { value: 'professional', label: '专业' }]
    },
    { key: 'cfgScale', label: '自由度（cfg_scale）', type: 'number', default: 0.5, min: 0, max: 1 }
  ],

  buildSubmit({ config, kind, params, prompt, refPaths }) {
    const base = normalizeBase(config.baseUrl, BASE);
    const headers = { 'Content-Type': 'application/json', ...authHeader(config.apiKey, config.secretKey) };
    const modelName = (params && params.model) || config.model || this.defaults.model;
    const first = refPaths && refPaths[0];
    const last = refPaths && refPaths[1];

    const common = { model_name: modelName, prompt };
    if (params) {
      if (params.duration) common.duration = String(params.duration);
      if (params.ratio) common.aspect_ratio = params.ratio;
      if (params.mode) common.mode = params.mode;
      if (typeof params.cfgScale === 'number') common.cfg_scale = params.cfgScale;
      if (params.negativePrompt) common.negative_prompt = params.negativePrompt;
    }

    let endpoint;
    if (first && last) {
      endpoint = `${base}/videos/image2video`;
      Object.assign(common, { image: first, image_tail: last });
    } else if (first) {
      endpoint = `${base}/videos/image2video`;
      Object.assign(common, { image: first });
    } else {
      endpoint = `${base}/videos/text2video`;
    }

    // 引擎在 submit→poll 全程复用同一个 config 引用：把提交端点记到 config 上，
    // 轮询时 buildPoll 据此拼正确的 /videos/{endpoint}/{task_id}（可灵按类型分路径）。
    config._klingPoll = endpoint;
    return { url: endpoint, headers, body: JSON.stringify(common) };
  },

  parseSubmit(body) {
    const b = body || {};
    const taskId = b.data && (b.data.task_id != null ? b.data.task_id : null);
    if (taskId) return { taskId: String(taskId) };
    // code != 0 视为业务失败（HTTP 层通常已拦，这里兜底）
    if (b.code != null && b.code !== 0) {
      return { error: { kind: 'business', message: b.message || '提交失败' } };
    }
    return {};
  },

  buildPoll({ config, taskId }) {
    const base = normalizeBase(config.baseUrl, BASE);
    const endpoint = config._klingPoll || `${base}/videos/text2video`;
    return {
      url: `${endpoint}/${encodeURIComponent(taskId)}`,
      headers: { ...authHeader(config.apiKey, config.secretKey) }
    };
  },

  parsePoll(body) {
    const b = body || {};
    const d = b.data || {};
    const status = d.task_status || b.task_status;
    if (status === 'succeed') {
      const videos = (d.task_result && Array.isArray(d.task_result.videos)) ? d.task_result.videos : [];
      const urls = videos.map((v) => (v && (v.url || v.video_url))).filter(Boolean);
      if (!urls.length) {
        return { status: 'failed', error: { kind: 'bad_response', message: '任务成功但未返回视频地址' } };
      }
      return { status: 'succeeded', results: urls.map((u) => ({ type: 'video', url: u })) };
    }
    if (status === 'failed') {
      const msg = d.task_status_msg || b.message || '任务失败';
      return { status: 'failed', error: { kind: 'business', message: String(msg) } };
    }
    // submitted / processing / 未知 → 运行中
    return { status: 'running' };
  },

  async testConnection({ config, fetchImpl }) {
    const { requestJson } = require('../http');
    const base = normalizeBase(config.baseUrl, BASE);
    // 用 text2video 提交（必然参数缺失）探连通 + 鉴权：401/403 → 密钥/签名无效；
    // 400（参数错误）/ 200 → 鉴权+网络通；网络层失败 → 不可达。
    const r = await requestJson(fetchImpl, `${base}/videos/text2video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(config.apiKey, config.secretKey) },
      body: JSON.stringify({ model_name: '__ping__', prompt: 'ping' }),
      timeoutMs: 15000
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: `密钥无效或签名错误（HTTP ${r.status}）` };
    }
    if (r.status === 0) {
      return { ok: false, message: r.error === 'timeout' ? '连接超时' : '网络不可达' };
    }
    return { ok: true, message: `连接成功（HTTP ${r.status}）` };
  }
};

module.exports = adapter;
module.exports.signKlingJwt = signKlingJwt;
