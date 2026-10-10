// ============================================================
// API 接入 · 火山方舟（Volcengine Ark）适配器
// 即梦 Seedance（文/图生视频，异步轮询）+ Seedream（图片生成，同步）
// ------------------------------------------------------------
// 接口口径（2026-09）：
//   视频：POST {base}/contents/generations/tasks       → { id }
//         GET  {base}/contents/generations/tasks/{id}  → { status, content.video_url }
//   图片：POST {base}/images/generations               → { data: [{url}|{b64_json}] }（同步）
//   鉴权：Authorization: Bearer <API Key>
//   视频参数以文本尾缀 `--ratio/--duration/--resolution/--watermark` 传入。
// 解析函数全部是纯函数（body 进 / 结构出），tests/ 用 fixture 直接驱动。
// ============================================================
const fs = require('fs');
const path = require('path');

/** 参数尾缀：把 schema 参数拼成 Seedance 的文本指令（只在 video 用） */
function buildParamSuffix(params) {
  const p = params || {};
  const parts = [];
  if (p.resolution) parts.push(`--resolution ${p.resolution}`);
  if (p.ratio) parts.push(`--ratio ${p.ratio}`);
  if (p.duration) parts.push(`--duration ${p.duration}`);
  if (p.watermark === false || p.watermark === 'false' || p.watermark === 'off') parts.push('--watermark false');
  return parts.length ? ` ${parts.join(' ')}` : '';
}

/** 参考图 → Ark content.image_url 需要的 url（http 直链透传；本地文件转 base64 dataUrl） */
function refToImageUrl(refPath) {
  if (/^https?:\/\//i.test(refPath)) return refPath;
  if (/^img:\/\//i.test(refPath)) {
    // img:// 引用：job-manager 已在提交前解析成本地绝对路径，理论上到不了这；
    // 兜底按同目录 images/ 解析（与 main.js resolveImageRef 同规则）
    const name = refPath.slice('img://'.length).replace(/[\\/]/g, '');
    return fileToDataUrl(path.join('images', name));
  }
  if (refPath && refPath.startsWith('data:')) return refPath;
  return fileToDataUrl(refPath);
}

function fileToDataUrl(p) {
  const buf = fs.readFileSync(p);
  const ext = (path.extname(p) || '.png').slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** @type {import('../types').ProviderAdapter} */
const adapter = {
  id: 'volcengine-ark',
  name: '火山方舟（即梦 Seedance / Seedream）',
  capabilities: ['video', 'image'],
  defaults: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedance-1-0-pro-250528',
    params: { ratio: '16:9', duration: 5, resolution: '1080p', watermark: false }
  },
  paramSchema: [
    { key: 'model', label: '模型 ID', type: 'text', default: 'doubao-seedance-1-0-pro-250528' },
    {
      key: 'ratio', label: '画面比例', type: 'select', default: '16:9',
      options: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map((v) => ({ value: v, label: v }))
    },
    {
      key: 'duration', label: '时长（秒）', type: 'select', default: 5,
      options: [5, 10].map((v) => ({ value: v, label: `${v}s` }))
    },
    {
      key: 'resolution', label: '分辨率', type: 'select', default: '1080p',
      options: ['480p', '720p', '1080p'].map((v) => ({ value: v, label: v }))
    },
    {
      key: 'watermark', label: '水印', type: 'select', default: 'off',
      options: [{ value: 'off', label: '不加水印' }, { value: 'on', label: '加水印' }]
    }
  ],

  buildSubmit({ config, kind, params, prompt, refPaths }) {
    const base = (config.baseUrl || this.defaults.baseUrl).replace(/\/+$/, '');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey || ''}`
    };
    if (kind === 'video') {
      const model = (params && params.model) || config.model || this.defaults.model;
      const refs = (refPaths || []).map((p) => ({
        type: 'image_url',
        image_url: { url: refToImageUrl(p) }
      }));
      const body = {
        model,
        content: [{ type: 'text', text: `${prompt}${buildParamSuffix(params)}` }, ...refs]
      };
      return { url: `${base}/contents/generations/tasks`, headers, body: JSON.stringify(body) };
    }
    // image（Seedream，同步）：参考图走 image 字段（数组）
    const model = (params && params.imageModel) || config.model || 'doubao-seedream-4-0-250828';
    const body = {
      model,
      prompt,
      size: (params && params.size) || '2K',
      response_format: 'url',
      watermark: false,
      sequential_image_generation: 'disabled'
    };
    const refUrls = (refPaths || []).map(refToImageUrl);
    if (refUrls.length) body.image = refUrls;
    return { url: `${base}/images/generations`, headers, body: JSON.stringify(body) };
  },

  parseSubmit(body) {
    // 异步型（视频）：{ id, status }
    if (body && body.id) return { taskId: body.id };
    // 同步型（图片）：{ data: [{url}|{b64_json}] }
    if (body && Array.isArray(body.data)) {
      return {
        results: body.data
          .map((d) => (d && d.url ? { url: d.url, type: 'image' } : d && d.b64_json ? { b64: d.b64_json, type: 'image', mime: 'image/jpeg' } : null))
          .filter(Boolean)
      };
    }
    return {};
  },

  buildPoll({ config, taskId }) {
    const base = (config.baseUrl || this.defaults.baseUrl).replace(/\/+$/, '');
    return {
      url: `${base}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      headers: { Authorization: `Bearer ${config.apiKey || ''}` }
    };
  },

  parsePoll(body) {
    const st = body && body.status;
    if (st === 'succeeded') {
      const url = body.content && body.content.video_url;
      if (!url) return { status: 'failed', error: { kind: 'bad_response', message: '任务成功但未返回 video_url' } };
      return { status: 'succeeded', results: [{ type: 'video', url }] };
    }
    if (st === 'failed' || st === 'cancelled') {
      const msg = (body.error && body.error.message) || `任务${st === 'cancelled' ? '被取消' : '失败'}`;
      return { status: 'failed', error: { kind: 'business', message: msg } };
    }
    // queued / running / 未知 → 运行中
    return { status: 'running' };
  },

  /** 测试连接：拿密钥打一次「必然参数错误」的提交 —— 非 401/403 即视为鉴权+网络通 */
  async testConnection({ config, fetchImpl }) {
    const { requestJson } = require('../http');
    const base = (config.baseUrl || this.defaults.baseUrl).replace(/\/+$/, '');
    const r = await requestJson(fetchImpl, `${base}/contents/generations/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey || ''}` },
      body: JSON.stringify({ model: '__ping__', content: [{ type: 'text', text: 'ping' }] }),
      timeoutMs: 15000
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: `密钥无效或无权限（HTTP ${r.status}）` };
    }
    if (r.status === 0) {
      return { ok: false, message: r.error === 'timeout' ? '连接超时' : '网络不可达' };
    }
    // 400（参数错误）/ 200 / 其它 → 鉴权与网络都通了
    return { ok: true, message: `连接成功（HTTP ${r.status}）` };
  }
};

module.exports = adapter;
