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

import crypto from 'crypto';
import { asRecord } from '../shape';
import { requestJson } from '../http';
import { TRANSIENT_ERROR_HINTS } from './_shared';
import type { AdapterWithDefaults, ProviderRunConfig, ResultItem } from '../types';

const BASE = 'https://api.klingai.com/v1';

function normalizeBase(base: string | undefined, fallback: string): string {
  return (base || fallback || '').replace(/\/+$/, '');
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 纯函数：可灵 JWT 签名（HS256）。
 * @param accessKey access_key（作为 payload.iss）
 * @param secretKey secret_key（HMAC 密钥）
 * @param expSec    token 有效期（秒），默认 1800
 * @returns `header.payload.signature`
 */
function signKlingJwt(accessKey: string | undefined, secretKey: string | undefined, expSec?: number): string {
  const exp = typeof expSec === 'number' ? expSec : 1800;
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: accessKey || '', exp: nowSec + exp, nbf: nowSec - 5 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sig = base64url(crypto.createHmac('sha256', secretKey || '').update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

function authHeader(accessKey: string | undefined, secretKey: string | undefined): Record<string, string> {
  return { Authorization: `Bearer ${signKlingJwt(accessKey, secretKey, 1800)}` };
}

/** 提交体：`model_name` / `prompt` 必填，其余按参数与参考图逐条加（源里就是逐条 `common.x = …`） */
interface KlingSubmitBody {
  model_name: string;
  prompt: string;
  duration?: string;
  aspect_ratio?: unknown;
  mode?: unknown;
  cfg_scale?: number;
  negative_prompt?: unknown;
  image?: string;
  image_tail?: string;
}

/**
 * 引擎在 submit→poll 全程复用同一个 `config` **对象引用**，可灵借它捎带"提交走的哪个端点"
 * （轮询路径按类型分：`/videos/{text2video|image2video|omni-video}/{id}`）。
 * ⚠️ 这是**源行为**（借调用方对象带私有状态），本任务只是把它写进类型：
 *   `_klingPoll` 不属共享契约 ⇒ ⛔ 不塞进 `ProviderRunConfig`（那是全服务商共用的类型），
 *   就地用交叉类型标注这一处写入。**行为完全不变**（仍然是往同一个对象上挂一个字段）。
 */
type KlingRunConfig = ProviderRunConfig & { _klingPoll?: string };

const adapter = {
  id: 'kling',
  name: '可灵（Kling 官方直连 · JWT）',
  capabilities: ['video'],
  domains: [BASE],
  // 声明需要 access_key + secret_key；真实 JWT 在 buildSubmit/buildPoll 内自签，密钥明文永不过桥
  auth: { type: 'klingJwt', keyFields: ['apiKey', 'secretKey'] },
  transientErrorHints: TRANSIENT_ERROR_HINTS,
  quotaHints: [{ re: /余额不足|额度不足|quota|insufficient/i, kind: 'quota_exhausted', advice: '可灵额度/余额不足，请充值后重试' }],
  frameSupport: { first: true, last: true, refs: 'image_tail' },
  defaults: {
    baseUrl: BASE,
    model: 'kling-v2-1',
    params: { model: 'kling-v2-1', duration: '5', ratio: '16:9', mode: 'standard', cfgScale: 0.5 },
  },
  paramSchema: [
    {
      key: 'model',
      label: '模型',
      type: 'select',
      default: 'kling-v2-1',
      options: ['kling-v2-master', 'kling-v2-6', 'kling-v2-1', 'kling-v1-5', 'kling-v1'].map((v) => ({ value: v, label: v })),
    },
    { key: 'duration', label: '时长（秒）', type: 'select', default: '5', options: ['5', '10'].map((v) => ({ value: v, label: `${v}s` })) },
    {
      key: 'ratio',
      label: '画面比例',
      type: 'select',
      default: '16:9',
      options: ['16:9', '9:16', '1:1'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'mode',
      label: '生成模式',
      type: 'select',
      default: 'standard',
      options: [
        { value: 'standard', label: '标准' },
        { value: 'professional', label: '专业' },
      ],
    },
    { key: 'cfgScale', label: '自由度（cfg_scale）', type: 'number', default: 0.5, min: 0, max: 1 },
  ],

  buildSubmit({ config, params, prompt, refPaths }) {
    const base = normalizeBase(config.baseUrl, BASE);
    const headers = { 'Content-Type': 'application/json', ...authHeader(config.apiKey, config.secretKey) };
    const modelName = (params && typeof params['model'] === 'string' ? params['model'] : '') || config.model || this.defaults.model;
    const first = refPaths && refPaths[0];
    const last = refPaths && refPaths[1];

    const common: KlingSubmitBody = { model_name: modelName, prompt };
    if (params) {
      if (params['duration']) common.duration = String(params['duration']);
      if (params['ratio']) common.aspect_ratio = params['ratio'];
      if (params['mode']) common.mode = params['mode'];
      if (typeof params['cfgScale'] === 'number') common.cfg_scale = params['cfgScale'];
      if (params['negativePrompt']) common.negative_prompt = params['negativePrompt'];
    }

    let endpoint: string;
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
    (config as KlingRunConfig)._klingPoll = endpoint;
    return { url: endpoint, headers, body: JSON.stringify(common) };
  },

  parseSubmit(body) {
    const b = asRecord(body);
    const data = asRecord(b['data']);
    const taskId = data['task_id'] != null ? data['task_id'] : null;
    if (taskId) return { taskId: String(taskId) };
    // code != 0 视为业务失败（HTTP 层通常已拦，这里兜底）
    if (b['code'] != null && b['code'] !== 0) {
      return { error: { kind: 'business', message: b['message'] ? String(b['message']) : '提交失败' } };
    }
    return {};
  },

  buildPoll({ config, taskId }) {
    const base = normalizeBase(config.baseUrl, BASE);
    const endpoint = (config as KlingRunConfig)._klingPoll || `${base}/videos/text2video`;
    return {
      url: `${endpoint}/${encodeURIComponent(taskId)}`,
      headers: { ...authHeader(config.apiKey, config.secretKey) },
    };
  },

  parsePoll(body) {
    const b = asRecord(body);
    const d = asRecord(b['data']);
    const status = d['task_status'] || b['task_status'];
    if (status === 'succeed') {
      const result = asRecord(d['task_result']);
      const videos = Array.isArray(result['videos']) ? result['videos'] : [];
      const urls: string[] = [];
      for (const v of videos) {
        const item = asRecord(v);
        const u = item['url'] || item['video_url'];
        if (u) urls.push(String(u));
      }
      if (!urls.length) {
        return { status: 'failed' as const, error: { kind: 'bad_response', message: '任务成功但未返回视频地址' } };
      }
      const results: ResultItem[] = urls.map((u) => ({ type: 'video' as const, url: u }));
      return { status: 'succeeded' as const, results };
    }
    if (status === 'failed') {
      const msg = d['task_status_msg'] || b['message'] || '任务失败';
      return { status: 'failed' as const, error: { kind: 'business', message: String(msg) } };
    }
    // submitted / processing / 未知 → 运行中
    return { status: 'running' as const };
  },

  async testConnection({ config, fetchImpl }) {
    const base = normalizeBase(config.baseUrl, BASE);
    // 用 text2video 提交（必然参数缺失）探连通 + 鉴权：401/403 → 密钥/签名无效；
    // 400（参数错误）/ 200 → 鉴权+网络通；网络层失败 → 不可达。
    const r = await requestJson(fetchImpl, `${base}/videos/text2video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(config.apiKey, config.secretKey) },
      body: JSON.stringify({ model_name: '__ping__', prompt: 'ping' }),
      timeoutMs: 15000,
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: `密钥无效或签名错误（HTTP ${r.status}）` };
    }
    if (r.status === 0) {
      return { ok: false, message: r.error === 'timeout' ? '连接超时' : '网络不可达' };
    }
    return { ok: true, message: `连接成功（HTTP ${r.status}）` };
  },
} satisfies AdapterWithDefaults;

/**
 * ⚠️ 具名导出（源是 `module.exports = adapter` ＋ `module.exports.signKlingJwt = …` 的**双形态**）。
 * `signKlingJwt` 目前**全仓零消费者**（只有本文件内部用）—— 按"照抄源"**保留导出**、不删；
 * 它"该不该公开"与 `auth`/`frameSupport` 同族（登记在 日志 B2-b）。
 */
export { adapter, signKlingJwt };
