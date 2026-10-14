// ============================================================
// API 接入 · 中转聚合适配器（geeknow 系，对标改造方案 Stage B / §3.2 P1）
// ------------------------------------------------------------
// 一个 Key 打通十几款模型（图片 gpt-image-2 / nano-banana / seedream；
// 视频 seedance-1-5 / seedance-2 / omni-video / manxue 等），是性价比最高的通道。
//
// 协议形态来源：公开 OpenAI 兼容图片接口 + 中转站通用的「提交→轮询」视频任务模型
// （Vidu/Kling/Ark 均有公开文档）。**路径以逆向字符串为准、baseUrl 用户可改**，
// 平台改版不至于整体失效。不搬运任何第三方混淆代码/文案资产。
//
// 图片三形态（按模型族路由，与逆向的 generateImage 分发器同构）：
//   1) generations  ：gpt-image / nano-banana 且无本地参考图 → POST {base}/images/generations（JSON）
//   2) edits-json    ：seedream / doubao / 即梦 / seedance → POST {base}/images/edits（JSON，参考图内联 image[]）
//   3) multipart     ：gpt-image + 本地/内联参考图 → POST {base}/images/edits（multipart image[] 多文件）
//   远程参考图走 multipart 不便下载 → 退回 generations 形态（best-effort）。
// 视频：POST {base}/video/generateVideo（异步）→ GET {base}/video/getVideoStatus 轮询；
//       taskICode=SUCCESS/FAILURE + failReason；支持首/尾帧与参考图（frameSupport）。
//
// 解析函数全部纯函数（body 进 / 结构出），tests/ 用 fixture 驱动；multipart 仅在
// 主进程（有 fs）且确有本地参考图时才会读盘。
// ============================================================
const fs = require('fs');
const path = require('path');

// ---- 模型族正则（路由依据）----
const RE_GENERATIONS = /^(gpt-image|nano-banana)/i;          // OpenAI 兼容 generations
const RE_EDITS_JSON = /seedream|doubao|即梦|seedance/i;       // 豆包系 JSON edits

// ---- 图片尺寸映射（按族）----
const SIZE_MAP_GENERATIONS = {
  '1536x1152': '1536x1152', '1152x1536': '1152x1536',
  '1920x1080': '1920x1080', '1080x1920': '1080x1920'
};
const SIZE_MAP_EDITS = {
  '2560x1440': '2560x1440', '1440x2560': '1440x2560',
  '2496x1664': '2496x1664', '1664x2496': '1664x2496', '3024x1296': '3024x1296'
};

function normalizeBase(base, fallback) {
  const b = (base || fallback || '').replace(/\/+$/, '');
  return b || fallback;
}

function imageFamily(model, refPaths) {
  if (RE_EDITS_JSON.test(model || '')) return 'edits-json';
  if (RE_GENERATIONS.test(model || '')) {
    const refs = refPaths || [];
    // 本地路径或 data: 内联 → multipart；远程 URL → 退回 generations（best-effort）
    const hasLocal = refs.some((r) => r && (r.startsWith('data:') || path.isAbsolute(r)));
    return hasLocal ? 'multipart' : 'generations';
  }
  return 'generations';
}

/** 参考图 → dataUrl（JSON 形态用） */
function refToDataUrl(refPath) {
  if (/^https?:\/\//i.test(refPath)) return refPath; // 远程透传
  if (refPath.startsWith('data:')) return refPath;
  const buf = fs.readFileSync(refPath);
  const ext = (path.extname(refPath) || '.png').slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** 构造 multipart/form-data（本地/内联参考图读成文件项） */
function buildMultipart(fields, fileItems) {
  const boundary = '----GeeknowRelayBoundary' + Math.random().toString(36).slice(2, 10);
  const chunks = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`, 'utf-8'));
  }
  for (const f of fileItems) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.name}"\r\nContent-Type: ${f.mime}\r\n\r\n`, 'utf-8'));
    chunks.push(f.data);
    chunks.push(Buffer.from('\r\n', 'utf-8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** 本地/内联参考图 → multipart 文件项（远程不下载，跳过） */
function refsToMultipartFiles(refPaths) {
  const out = [];
  for (const r of refPaths || []) {
    let data = null, name = 'image.png', mime = 'image/png';
    if (r.startsWith('data:')) {
      const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(r);
      if (m) { mime = m[1]; data = Buffer.from(m[2], 'base64'); name = `image.${mime.split('/')[1]}`; }
    } else if (/^(https?:\/\/)/i.test(r)) {
      continue; // 远程不下载，跳过
    } else {
      const ext = (path.extname(r) || '.png').slice(1).toLowerCase();
      mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      data = fs.readFileSync(r);
      name = path.basename(r);
    }
    if (data) out.push({ field: 'image', name, mime, data });
  }
  return out;
}

// ---- 图片三种形态构造器 ----
function buildGenerations(base, headers, model, prompt, params) {
  const size = SIZE_MAP_GENERATIONS[params.size] || '1536x1152';
  const body = { model, prompt, n: 1, size };
  return {
    url: `${base}/images/generations`,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function buildEditsJson(base, headers, model, prompt, params, refPaths) {
  const size = SIZE_MAP_EDITS[params.size] || '2560x1440';
  const body = { model, prompt, size, image: (refPaths || []).map(refToDataUrl) };
  return {
    url: `${base}/images/edits`,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function buildMultipartEdits(base, headers, model, prompt, refPaths) {
  const fields = { model, prompt };
  const files = refsToMultipartFiles(refPaths);
  const { body, contentType } = buildMultipart(fields, files);
  return { url: `${base}/images/edits`, headers: { ...headers, 'Content-Type': contentType }, body };
}

// ---- 视频构造器 ----
function buildVideo(base, headers, config, params, prompt, refPaths) {
  const model = (params && params.model) || config.model || 'doubao-seedance-1-5';
  const body = { model, prompt };
  if (params) {
    if (params.duration) body.duration = params.duration;
    if (params.ratio) body.ratio = params.ratio;
    if (params.resolution) body.resolution = params.resolution;
    if (params.first_frame_url) body.first_frame_url = params.first_frame_url;
    if (params.last_frame_url) body.last_frame_url = params.last_frame_url;
  }
  // 参考图（本地/内联 → dataUrl；远程透传）兜底进 reference_image_urls
  const refs = (refPaths || []).map((r) => (/^https?:\/\//i.test(r) || r.startsWith('data:') ? r : (() => { try { return refToDataUrl(r); } catch (_) { return null; } })()));
  const cleanRefs = refs.filter(Boolean);
  if (cleanRefs.length) body.reference_image_urls = cleanRefs;
  return {
    url: `${base}/video/generateVideo`,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

// ---- 解析：提交 ----
function parseSubmit(body) {
  const b = body || {};
  // 视频异步：taskICode SUCCESS/FAILURE + 任务号（字段名各中转站略有差异，全部兜底）
  const taskId = b.taskId || (b.data && (b.data.taskId || b.data.id)) || b.id || b.taskICodeId || b.task_id;
  if (taskId) return { taskId: String(taskId) };
  // 图片同步：data 数组（gpt-image generations / seedream edits 可能同步返回）
  const dataArr = Array.isArray(b.data) ? b.data : (Array.isArray(b.images) ? b.images : null);
  if (dataArr) {
    const results = dataArr
      .map((d) => {
        if (!(d && (d.url || d.b64_json))) return null;
        const r = { url: d.url, type: 'image', mime: d.mime || 'image/jpeg' };
        if (d.b64_json) r.b64 = d.b64_json;
        return r;
      })
      .filter(Boolean);
    if (results.length) return { results };
  }
  return {};
}

// ---- 解析：轮询（视频任务态）----
function parsePoll(body) {
  const b = body || {};
  const code = String(b.taskICode != null ? b.taskICode : (b.status || '')).toUpperCase();
  if (code === 'SUCCESS' || code === 'SUCCEEDED' || code === 'DONE' || code === 'COMPLETED') {
    const url = b.videoUrl || (b.data && (b.data.videoUrl || b.data.url)) || b.url || b.video_url;
    if (!url) return { status: 'failed', error: { kind: 'bad_response', message: '任务成功但未返回视频地址' } };
    return { status: 'succeeded', results: [{ type: 'video', url }] };
  }
  if (code === 'FAILURE' || code === 'FAILED' || code === 'ERROR') {
    const msg = b.failReason || b.errorMessage || (b.error && (b.error.message || b.error)) || '任务失败';
    return { status: 'failed', error: { kind: 'business', message: String(msg) } };
  }
  // running / queued / 未知 → 运行中
  const progress = typeof b.progress === 'number' ? b.progress : undefined;
  return progress != null ? { status: 'running', progress } : { status: 'running' };
}

/** @type {import('../types').ProviderAdapter} */
const adapter = {
  id: 'geeknow-relay',
  name: '中转聚合（geeknow / manju / grsai）',
  capabilities: ['video', 'image'],
  domains: ['https://www.geeknow.top/v1', 'https://api.manjuapi.com/v1', 'https://grsaiapi.com/v1'],
  auth: { type: 'bearer', keyFields: ['apiKey'] },
  transientErrorHints: require('./_shared').TRANSIENT_ERROR_HINTS,
  quotaHints: [
    { re: /生成(?:额度)?未扣除|额度未扣除/, kind: 'quota_not_deducted', advice: '任务未计费，可直接重试' },
    { re: /没额度|需要开通标准套餐|今日视频没额度|今日图片没额度|额度(?:已)?用完/, kind: 'quota_exhausted', advice: '额度已用完或套餐不足，请充值/开通后重试' }
  ],
  frameSupport: { first: true, last: true, refs: 'reference_image_urls' },
  defaults: {
    baseUrl: 'https://www.geeknow.top/v1',
    model: 'gpt-image-2',
    params: { size: '1536x1152', duration: 5, ratio: '16:9', resolution: '1080p', watermark: 'off' }
  },
  paramSchema: [
    { key: 'model', label: '模型 ID', type: 'text', default: 'gpt-image-2' },
    {
      key: 'size', label: '图片尺寸（图生图/文生图）', type: 'select', default: '1536x1152',
      options: Object.keys(SIZE_MAP_GENERATIONS).concat(Object.keys(SIZE_MAP_EDITS))
        .filter((v, i, a) => a.indexOf(v) === i).map((v) => ({ value: v, label: v }))
    },
    { key: 'duration', label: '视频时长（秒）', type: 'select', default: 5, options: [5, 10, 15].map((v) => ({ value: v, label: `${v}s` })) },
    { key: 'ratio', label: '视频比例', type: 'select', default: '16:9', options: ['16:9', '9:16', '1:1', '4:3', '3:4'].map((v) => ({ value: v, label: v })) },
    { key: 'resolution', label: '视频分辨率', type: 'select', default: '1080p', options: ['480p', '720p', '1080p', '4K'].map((v) => ({ value: v, label: v })) },
    { key: 'watermark', label: '水印', type: 'select', default: 'off', options: [{ value: 'off', label: '不加水印' }, { value: 'on', label: '加水印' }] }
  ],

  buildSubmit({ config, kind, params, prompt, refPaths }) {
    const base = normalizeBase(config.baseUrl, this.defaults.baseUrl);
    const headers = { Authorization: `Bearer ${config.apiKey || ''}` };
    if (kind === 'video') return buildVideo(base, headers, config, params, prompt, refPaths);
    // 图片：按模型族路由三形态
    const model = (params && params.model) || config.model || this.defaults.model;
    const fam = imageFamily(model, refPaths);
    if (fam === 'edits-json') return buildEditsJson(base, headers, model, prompt, params, refPaths);
    if (fam === 'multipart') return buildMultipartEdits(base, headers, model, prompt, refPaths);
    return buildGenerations(base, headers, model, prompt, params);
  },

  parseSubmit,
  buildPoll({ config, taskId }) {
    const base = normalizeBase(config.baseUrl, this.defaults.baseUrl);
    return {
      url: `${base}/video/getVideoStatus?taskId=${encodeURIComponent(taskId)}`,
      headers: { Authorization: `Bearer ${config.apiKey || ''}` }
    };
  },
  parsePoll,

  async testConnection({ config, fetchImpl }) {
    const { requestJson } = require('../http');
    const base = normalizeBase(config.baseUrl, this.defaults.baseUrl);
    const r = await requestJson(fetchImpl, `${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey || ''}` },
      body: JSON.stringify({ model: '__ping__', prompt: 'ping', n: 1, size: '1536x1152' }),
      timeoutMs: 15000
    });
    if (r.status === 401 || r.status === 403) return { ok: false, message: `密钥无效或无权限（HTTP ${r.status}）` };
    if (r.status === 0) return { ok: false, message: r.error === 'timeout' ? '连接超时' : '网络不可达' };
    return { ok: true, message: `连接成功（HTTP ${r.status}）` };
  }
};

module.exports = adapter;
