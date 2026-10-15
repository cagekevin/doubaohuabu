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

import fs from 'fs';
import path from 'path';
import { asRecord } from '../shape';
import { requestJson } from '../http';
import { TRANSIENT_ERROR_HINTS } from './_shared';
import type { AdapterWithDefaults, ProviderRunConfig, ResultItem, SubmitRequest } from '../types';

// ---- 模型族正则（路由依据）----
const RE_GENERATIONS = /^(gpt-image|nano-banana)/i; // OpenAI 兼容 generations
const RE_EDITS_JSON = /seedream|doubao|即梦|seedance/i; // 豆包系 JSON edits

// ---- 图片尺寸映射（按族）----
const SIZE_MAP_GENERATIONS: Record<string, string> = {
  '1536x1152': '1536x1152',
  '1152x1536': '1152x1536',
  '1920x1080': '1920x1080',
  '1080x1920': '1080x1920',
};
const SIZE_MAP_EDITS: Record<string, string> = {
  '2560x1440': '2560x1440',
  '1440x2560': '1440x2560',
  '2496x1664': '2496x1664',
  '1664x2496': '1664x2496',
  '3024x1296': '3024x1296',
};

function normalizeBase(base: string | undefined, fallback: string): string {
  const b = (base || fallback || '').replace(/\/+$/, '');
  return b || fallback;
}

/** 参数里的字符串取值（`params` 是 `Record<string, unknown>` ⇒ 索引前先收窄） */
function paramString(params: Record<string, unknown> | undefined, key: string): string {
  const v = params ? params[key] : undefined;
  return typeof v === 'string' ? v : '';
}

/** 路由依据：图片走哪一种形态 */
function imageFamily(model: string, refPaths: readonly string[] | undefined): 'edits-json' | 'multipart' | 'generations' {
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
function refToDataUrl(refPath: string): string {
  if (/^https?:\/\//i.test(refPath)) return refPath; // 远程透传
  if (refPath.startsWith('data:')) return refPath;
  const buf = fs.readFileSync(refPath);
  const ext = (path.extname(refPath) || '.png').slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** multipart 的一个文件项 */
interface MultipartFile {
  field: string;
  name: string;
  mime: string;
  data: Buffer;
}

/** 构造 multipart/form-data（本地/内联参考图读成文件项） */
function buildMultipart(fields: Record<string, unknown>, fileItems: MultipartFile[]): { body: Buffer; contentType: string } {
  const boundary = '----GeeknowRelayBoundary' + Math.random().toString(36).slice(2, 10);
  const chunks: Buffer[] = [];
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
function refsToMultipartFiles(refPaths: readonly string[] | undefined): MultipartFile[] {
  const out: MultipartFile[] = [];
  for (const r of refPaths || []) {
    let data: Buffer | null = null;
    let name = 'image.png';
    let mime = 'image/png';
    if (r.startsWith('data:')) {
      const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(r);
      if (m) {
        // 捕获组 1/2 由正则保证存在（不分捕获组可空）⇒ 这里用 `?? ` 只为类型收窄，不改变命中时的取值
        mime = m[1] ?? mime;
        data = Buffer.from(m[2] ?? '', 'base64');
        name = `image.${mime.split('/')[1]}`;
      }
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
function buildGenerations(base: string, headers: Record<string, string>, model: string, prompt: string, params: Record<string, unknown> | undefined): SubmitRequest {
  const size = SIZE_MAP_GENERATIONS[paramString(params, 'size')] || '1536x1152';
  const body = { model, prompt, n: 1, size };
  return {
    url: `${base}/images/generations`,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function buildEditsJson(
  base: string,
  headers: Record<string, string>,
  model: string,
  prompt: string,
  params: Record<string, unknown> | undefined,
  refPaths: readonly string[] | undefined,
): SubmitRequest {
  const size = SIZE_MAP_EDITS[paramString(params, 'size')] || '2560x1440';
  const body = { model, prompt, size, image: (refPaths || []).map((r) => refToDataUrl(r)) };
  return {
    url: `${base}/images/edits`,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function buildMultipartEdits(
  base: string,
  headers: Record<string, string>,
  model: string,
  prompt: string,
  refPaths: readonly string[] | undefined,
): SubmitRequest {
  const fields = { model, prompt };
  const files = refsToMultipartFiles(refPaths);
  const { body, contentType } = buildMultipart(fields, files);
  return { url: `${base}/images/edits`, headers: { ...headers, 'Content-Type': contentType }, body };
}

// ---- 视频构造器 ----
/** 视频请求体的**全部可选键**（源里是逐条 `body.x = …` ⇒ 声明成可选的显式形状，⛔ 不用索引签名） */
interface VideoBody {
  model: string;
  prompt: string;
  duration?: unknown;
  ratio?: unknown;
  resolution?: unknown;
  first_frame_url?: unknown;
  last_frame_url?: unknown;
  reference_image_urls?: string[];
}

function buildVideo(
  base: string,
  headers: Record<string, string>,
  config: ProviderRunConfig,
  params: Record<string, unknown> | undefined,
  prompt: string,
  refPaths: readonly string[] | undefined,
): SubmitRequest {
  const model = paramString(params, 'model') || config.model || 'doubao-seedance-1-5';
  const body: VideoBody = { model, prompt };
  if (params) {
    if (params['duration']) body.duration = params['duration'];
    if (params['ratio']) body.ratio = params['ratio'];
    if (params['resolution']) body.resolution = params['resolution'];
    if (params['first_frame_url']) body.first_frame_url = params['first_frame_url'];
    if (params['last_frame_url']) body.last_frame_url = params['last_frame_url'];
  }
  // 参考图（本地/内联 → dataUrl；远程透传）兜底进 reference_image_urls
  const refs = (refPaths || []).map((r) => {
    if (/^https?:\/\//i.test(r) || r.startsWith('data:')) return r;
    try {
      return refToDataUrl(r);
    } catch {
      return null;
    }
  });
  const cleanRefs = refs.filter((r): r is string => r !== null);
  if (cleanRefs.length) body.reference_image_urls = cleanRefs;
  return {
    url: `${base}/video/generateVideo`,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ---- 解析：提交 ----
function parseSubmit(body: unknown): { taskId?: string; results?: ResultItem[] } {
  const b = asRecord(body);
  const data = asRecord(b['data']);
  // 视频异步：taskICode SUCCESS/FAILURE + 任务号（字段名各中转站略有差异，全部兜底）
  const taskId = b['taskId'] || data['taskId'] || data['id'] || b['id'] || b['taskICodeId'] || b['task_id'];
  if (taskId) return { taskId: String(taskId) };
  // 图片同步：data 数组（gpt-image generations / seedream edits 可能同步返回）
  const dataArr = Array.isArray(b['data']) ? b['data'] : Array.isArray(b['images']) ? b['images'] : null;
  if (dataArr) {
    const results: ResultItem[] = [];
    for (const raw of dataArr) {
      const d = asRecord(raw);
      if (!(d['url'] || d['b64_json'])) continue;
      const r: ResultItem = { type: 'image', mime: d['mime'] ? String(d['mime']) : 'image/jpeg' };
      // 源写 `url: d.url`（可能显式 undefined，如 `d.url` 为 undefined 时）；`exactOptionalPropertyTypes` 不收
      // 显式 undefined ⇒ 改为"无 url 时不放这个键"。
      if (d['url']) r.url = String(d['url']);
      if (d['b64_json']) r.b64 = String(d['b64_json']);
      results.push(r);
    }
    if (results.length) return { results };
  }
  return {};
}

// ---- 解析：轮询（视频任务态）----
function parsePoll(body: unknown): { status: 'running' | 'succeeded' | 'failed'; progress?: number; results?: ResultItem[]; error?: { kind: string; message: string } } {
  const b = asRecord(body);
  const code = String(b['taskICode'] != null ? b['taskICode'] : b['status'] || '').toUpperCase();
  if (code === 'SUCCESS' || code === 'SUCCEEDED' || code === 'DONE' || code === 'COMPLETED') {
    const data = asRecord(b['data']);
    const url = b['videoUrl'] || data['videoUrl'] || data['url'] || b['url'] || b['video_url'];
    if (!url) return { status: 'failed', error: { kind: 'bad_response', message: '任务成功但未返回视频地址' } };
    return { status: 'succeeded', results: [{ type: 'video', url: String(url) }] };
  }
  if (code === 'FAILURE' || code === 'FAILED' || code === 'ERROR') {
    const errVal = b['error'];
    const msg = b['failReason'] || b['errorMessage'] || (errVal ? asRecord(errVal)['message'] || errVal : '任务失败');
    return { status: 'failed', error: { kind: 'business', message: String(msg) } };
  }
  // running / queued / 未知 → 运行中
  const progress = typeof b['progress'] === 'number' ? b['progress'] : undefined;
  return progress != null ? { status: 'running', progress } : { status: 'running' };
}

const adapter = {
  id: 'geeknow-relay',
  name: '中转聚合（geeknow / manju / grsai）',
  capabilities: ['video', 'image'],
  domains: ['https://www.geeknow.top/v1', 'https://api.manjuapi.com/v1', 'https://grsaiapi.com/v1'],
  auth: { type: 'bearer', keyFields: ['apiKey'] },
  transientErrorHints: TRANSIENT_ERROR_HINTS,
  quotaHints: [
    { re: /生成(?:额度)?未扣除|额度未扣除/, kind: 'quota_not_deducted', advice: '任务未计费，可直接重试' },
    { re: /没额度|需要开通标准套餐|今日视频没额度|今日图片没额度|额度(?:已)?用完/, kind: 'quota_exhausted', advice: '额度已用完或套餐不足，请充值/开通后重试' },
  ],
  frameSupport: { first: true, last: true, refs: 'reference_image_urls' },
  defaults: {
    baseUrl: 'https://www.geeknow.top/v1',
    model: 'gpt-image-2',
    params: { size: '1536x1152', duration: 5, ratio: '16:9', resolution: '1080p', watermark: 'off' },
  },
  paramSchema: [
    { key: 'model', label: '模型 ID', type: 'text', default: 'gpt-image-2' },
    {
      key: 'size',
      label: '图片尺寸（图生图/文生图）',
      type: 'select',
      default: '1536x1152',
      options: Object.keys(SIZE_MAP_GENERATIONS)
        .concat(Object.keys(SIZE_MAP_EDITS))
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((v) => ({ value: v, label: v })),
    },
    { key: 'duration', label: '视频时长（秒）', type: 'select', default: 5, options: [5, 10, 15].map((v) => ({ value: v, label: `${v}s` })) },
    { key: 'ratio', label: '视频比例', type: 'select', default: '16:9', options: ['16:9', '9:16', '1:1', '4:3', '3:4'].map((v) => ({ value: v, label: v })) },
    { key: 'resolution', label: '视频分辨率', type: 'select', default: '1080p', options: ['480p', '720p', '1080p', '4K'].map((v) => ({ value: v, label: v })) },
    {
      key: 'watermark',
      label: '水印',
      type: 'select',
      default: 'off',
      options: [
        { value: 'off', label: '不加水印' },
        { value: 'on', label: '加水印' },
      ],
    },
  ],

  buildSubmit({ config, kind, params, prompt, refPaths }) {
    const base = normalizeBase(config.baseUrl, this.defaults.baseUrl);
    const headers = { Authorization: `Bearer ${config.apiKey || ''}` };
    if (kind === 'video') return buildVideo(base, headers, config, params, prompt, refPaths);
    // 图片：按模型族路由三形态
    const model = paramString(params, 'model') || config.model || this.defaults.model;
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
      headers: { Authorization: `Bearer ${config.apiKey || ''}` },
    };
  },
  parsePoll,

  async testConnection({ config, fetchImpl }) {
    const base = normalizeBase(config.baseUrl, this.defaults.baseUrl);
    const r = await requestJson(fetchImpl, `${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey || ''}` },
      body: JSON.stringify({ model: '__ping__', prompt: 'ping', n: 1, size: '1536x1152' }),
      timeoutMs: 15000,
    });
    if (r.status === 401 || r.status === 403) return { ok: false, message: `密钥无效或无权限（HTTP ${r.status}）` };
    if (r.status === 0) return { ok: false, message: r.error === 'timeout' ? '连接超时' : '网络不可达' };
    return { ok: true, message: `连接成功（HTTP ${r.status}）` };
  },
} satisfies AdapterWithDefaults;

// ⚠️ 具名导出（源是 `module.exports = adapter` 单值）；⛔ 不用 `export default`（本仓禁区）
export { adapter };
