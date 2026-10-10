// ============================================================
// API 接入 · LLM 通道适配器（OpenAI 兼容 /chat/completions）（Stage F · §3.4 F）
// ------------------------------------------------------------
// 与「视频/图片生成通道」完全隔离：capabilities 仅 ['llm']，不进双通道选择器，
// 单独计费。用于提示词扩写 / 分镜脚本生成等文本能力（也可喂给批量出片做提示词矩阵）。
//   鉴权：Authorization: Bearer {apiKey}（与生成通道同形态）
//   同步：POST {base}/chat/completions → { choices:[{ message:{ content } }] }
// 解析函数全部是纯函数（body 进 / 结构出），tests/ 用 fixture 直接驱动。
// 原创实现，不搬运任何第三方混淆代码/文案资产。
// ============================================================

const BASE = 'https://api.openai.com/v1';

function normalizeBase(base, fallback) {
  return (base || fallback || '').replace(/\/+$/, '');
}

/** @type {import('../types').ProviderAdapter} */
const adapter = {
  id: 'llm-openai-compat',
  name: 'LLM（OpenAI 兼容 · 提示词/分镜）',
  capabilities: ['llm'],
  domains: [BASE],
  auth: { type: 'bearer', keyFields: ['apiKey'] },
  transientErrorHints: /ECONNRESET|ECONNABORTED|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|UND_ERR/i,
  quotaHints: [
    { re: /insufficient_quota|额度不足|quota|余额不足/i, kind: 'quota_exhausted', advice: 'LLM 额度/余额不足，请充值后重试' }
  ],
  defaults: {
    baseUrl: BASE,
    model: 'gpt-4o-mini',
    params: { model: 'gpt-4o-mini', temperature: 0.8, maxTokens: 1024 }
  },
  paramSchema: [
    { key: 'model', label: '模型', type: 'text', default: 'gpt-4o-mini' },
    { key: 'temperature', label: '创造性（temperature）', type: 'number', default: 0.8, min: 0, max: 2 },
    { key: 'maxTokens', label: '最大输出 token', type: 'number', default: 1024, min: 1, max: 8192 }
  ],

  buildSubmit({ config, kind, params, prompt }) {
    const base = normalizeBase(config.baseUrl, BASE);
    const model = (params && params.model) || config.model || this.defaults.model;
    const temperature = typeof (params && params.temperature) === 'number' ? params.temperature : 0.8;
    const maxTokens = typeof (params && params.maxTokens) === 'number' ? params.maxTokens : 1024;
    const body = {
      model,
      messages: [{ role: 'user', content: prompt || '' }],
      temperature,
      max_tokens: maxTokens
    };
    return {
      url: `${base}/chat/completions`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey || ''}` },
      body: JSON.stringify(body)
    };
  },

  parseSubmit(body) {
    const b = body || {};
    const text = b.choices && b.choices[0] && b.choices[0].message && b.choices[0].message.content;
    if (typeof text === 'string' && text.length) {
      return { results: [{ type: 'text', text }] };
    }
    // 错误形态（HTTP 200 + error）：{ error:{ message } }
    if (b.error && b.error.message) {
      return { error: { kind: 'business', message: b.error.message } };
    }
    return {};
  },

  parsePoll(body) {
    // LLM 同步返回，无需轮询；占位以满足契约（引擎仅 async 任务调用 buildPoll）
    return { status: 'running' };
  },

  async testConnection({ config, fetchImpl }) {
    const { requestJson } = require('../http');
    const base = normalizeBase(config.baseUrl, BASE);
    const r = await requestJson(fetchImpl, `${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey || ''}` },
      body: JSON.stringify({ model: '__ping__', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      timeoutMs: 15000
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: `密钥无效或无权限（HTTP ${r.status}）` };
    }
    if (r.status === 0) {
      return { ok: false, message: r.error === 'timeout' ? '连接超时' : '网络不可达' };
    }
    return { ok: true, message: `连接成功（HTTP ${r.status}）` };
  }
};

module.exports = adapter;
