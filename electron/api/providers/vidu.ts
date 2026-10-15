// ============================================================
// API 接入 · Vidu 官方直连适配器（Stage D · 对标改造方案 §3.4 D）
// ------------------------------------------------------------
// 接口口径（Vidu 公开 API，2026-09 复核）：
//   鉴权：Authorization: Token {api_key}        （注意是 Token，不是 Bearer）
//   文生视频：POST {base}/text2video             → { task_id, ... }
//   图生视频：POST {base}/img2video              → { task_id }（body.image = 首帧）
//   首尾帧  ：POST {base}/start-end2video        → { task_id }（body.images = [首帧, 尾帧]）
//   轮询    ：GET  {base}/tasks/{task_id}/creations
//             → { task_id, state, creations:[{id,url,cover_url}] }
//            state: "created" | "processing" | "success" | "failed"
//   参考图：支持 base64 dataUrl 或 http(s) 直链（images/image 字段）。
// 解析函数全部是纯函数（body 进 / 结构出），tests/ 用 fixture 直接驱动。
// 原创实现，不搬运任何第三方混淆代码/文案资产。
// ============================================================

import { asRecord } from '../shape';
import { requestJson } from '../http';
import { TRANSIENT_ERROR_HINTS } from './_shared';
import type { ProviderAdapter, ResultItem } from '../types';

const BASE = 'https://api.vidu.cn/ent/v2';

function normalizeBase(base: string | undefined, fallback: string): string {
  return (base || fallback || '').replace(/\/+$/, '');
}

/** 提交体：三种形态（文生 / 图生 / 首尾帧）共用这些键，按分支填 */
interface ViduSubmitBody {
  model: string;
  prompt: string;
  images?: string[];
  image?: string;
  duration?: number;
  ratio?: unknown;
}

const adapter = {
  id: 'vidu',
  name: 'Vidu（官方直连 · 含首尾帧）',
  capabilities: ['video'],
  domains: [BASE],
  // 鉴权形态仍是「密钥型」，但请求头用 Token（与 Bearer 区分，仅声明用途，真实头由 buildSubmit 生成）
  auth: { type: 'bearer', keyFields: ['apiKey'] },
  transientErrorHints: TRANSIENT_ERROR_HINTS,
  quotaHints: [{ re: /余额不足|额度不足|quota|insufficient/i, kind: 'quota_exhausted', advice: 'Vidu 额度/余额不足，请充值后重试' }],
  frameSupport: { first: true, last: true, refs: 'images' },
  defaults: {
    baseUrl: BASE,
    model: 'viduq3-turbo',
    params: { model: 'viduq3-turbo', duration: 4, ratio: '16:9' },
  },
  paramSchema: [
    {
      key: 'model',
      label: '模型',
      type: 'select',
      default: 'viduq3-turbo',
      options: ['viduq3-turbo', 'viduq3', 'viduq2-pro', 'viduq2', 'viduq1.5'].map((v) => ({ value: v, label: v })),
    },
    { key: 'duration', label: '时长（秒）', type: 'select', default: 4, options: [4, 8].map((v) => ({ value: v, label: `${v}s` })) },
    {
      key: 'ratio',
      label: '画面比例',
      type: 'select',
      default: '16:9',
      options: ['16:9', '9:16', '1:1'].map((v) => ({ value: v, label: v })),
    },
  ],

  buildSubmit({ config, params, prompt, refPaths }) {
    const base = normalizeBase(config.baseUrl, BASE);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Token ${config.apiKey || ''}`,
    };
    const model = (params && typeof params['model'] === 'string' ? params['model'] : '') || config.model || this.defaults.model;
    const first = refPaths && refPaths[0];
    const last = refPaths && refPaths[1];

    let endpoint: string;
    let body: ViduSubmitBody;
    if (first && last) {
      // 首尾帧：images = [首帧, 尾帧]
      endpoint = `${base}/start-end2video`;
      body = { model, prompt, images: [first, last] };
    } else if (first) {
      // 单参考图（图生视频）
      endpoint = `${base}/img2video`;
      body = { model, prompt, image: first };
    } else {
      // 纯文生视频
      endpoint = `${base}/text2video`;
      body = { model, prompt };
    }
    if (params) {
      if (params['duration']) body.duration = Number(params['duration']) || 4;
      if (params['ratio']) body.ratio = params['ratio'];
    }
    return { url: endpoint, headers, body: JSON.stringify(body) };
  },

  parseSubmit(body) {
    const b = asRecord(body);
    // 成功异步：{ task_id }
    const taskId = b['task_id'] != null ? b['task_id'] : b['id'] != null ? b['id'] : null;
    if (taskId) return { taskId: String(taskId) };
    // 业务错误（HTTP 200 + code 形态，兜底）：交给引擎归为 unknown 失败（不重复扣费安全）
    return {};
  },

  buildPoll({ config, taskId }) {
    const base = normalizeBase(config.baseUrl, BASE);
    return {
      url: `${base}/tasks/${encodeURIComponent(taskId)}/creations`,
      headers: { Authorization: `Token ${config.apiKey || ''}` },
    };
  },

  parsePoll(body) {
    const b = asRecord(body);
    const data = asRecord(b['data']);
    const state = b['state'] || data['state'];
    if (state === 'success') {
      const creations = Array.isArray(b['creations']) ? b['creations'] : Array.isArray(data['creations']) ? data['creations'] : [];
      const urls: string[] = [];
      for (const c of creations) {
        const item = asRecord(c);
        const u = item['url'] || item['video_url'];
        if (u) urls.push(String(u));
      }
      if (!urls.length) {
        return { status: 'failed' as const, error: { kind: 'bad_response', message: '任务成功但未返回视频地址' } };
      }
      const results: ResultItem[] = urls.map((u) => ({ type: 'video' as const, url: u }));
      return { status: 'succeeded' as const, results };
    }
    if (state === 'failed') {
      const msg = b['errmsg'] || b['message'] || data['errmsg'] || '任务失败';
      return { status: 'failed' as const, error: { kind: 'business', message: String(msg) } };
    }
    // created / processing / queued / 未知 → 运行中
    const progress = typeof b['progress'] === 'number' ? b['progress'] : undefined;
    return progress != null ? { status: 'running' as const, progress } : { status: 'running' as const };
  },

  async testConnection({ config, fetchImpl }) {
    const base = normalizeBase(config.baseUrl, BASE);
    // Vidu 无独立 ping 端点：用轮询入口（带假 taskId）探连通 + 鉴权；
    // 401/403 → 密钥无效；404（任务不存在）→ 鉴权+网络通；其余亦视为通。
    const r = await requestJson(fetchImpl, `${base}/tasks/__ping__/creations`, {
      method: 'GET',
      headers: { Authorization: `Token ${config.apiKey || ''}` },
      timeoutMs: 15000,
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: `密钥无效或无权限（HTTP ${r.status}）` };
    }
    if (r.status === 0) {
      return { ok: false, message: r.error === 'timeout' ? '连接超时' : '网络不可达' };
    }
    return { ok: true, message: `连接成功（HTTP ${r.status}）` };
  },
} satisfies ProviderAdapter;

// ⚠️ 具名导出（源是 `module.exports = adapter` 单值）；⛔ 不用 `export default`（本仓禁区）
export { adapter };
