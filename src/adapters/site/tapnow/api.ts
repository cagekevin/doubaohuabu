/**
 * Tapnow 接口调用（原 `Ok` 33272-33327 · `Uk` 33328-33353 · `Yl` 33401-33420）
 *
 * ⚠️ 本模块**不直接调 `window.api`**（`TD-05-1`：站点层不得直调宿主）——
 *    它只用 `<webview>.executeJavaScript` 走**页内** fetch。
 *    原版 `fP` 里那句 `window.api.lovartScanFrames(...)` 属**越权**，落到 `./index.ts` 时
 *    必须改经**注入的 `HostPort`**（`host.media.scanFrames`）。
 *
 * ⚠️ **错误分类（`Result.reason`）的取值原则**：`message` 一律**原文透传**；
 *    `reason` 只做**保守归类**（超时→`page-timeout`、缺号→`no-account`、其余→`page-error`），
 *    **不自造「HTTP 状态码 → 分类」映射**（那是编造信息）——状态码进 `cause` 留给用例层判。
 */

import { TAPNOW_API_TIMEOUT_MS, TAPNOW_HREF_TIMEOUT_MS } from '@/constants';
import { TAPNOW_TEXT } from '@/constants/text';
import { err, ok, type Result } from '@/core/model/result';
import { withTimeout } from '@/lib/async';
import { isRecord } from '@/lib/object';
import { canvasIdFromHref } from '@/core/rules/scanChain';
import { findWebview, type WebviewAccountRef } from '../shared/webview';
import { tapnowFetchScript } from './scripts';

/** 账号定位（`Xn` 的定位键） */
export type TapnowAccountRef = WebviewAccountRef;

/** 列表数量夹取区间（原 `Uk`：`Math.max(1, Math.min(n || 20, 50))`） */
const LIMIT_MIN = 1;
const LIMIT_MAX = 50;
const LIMIT_DEFAULT = 20;

/** 画布列表项（原 `Uk` 的映射结果） */
export interface TapnowCanvas {
  id: string;
  name: string;
  previewImage: string;
  updatedAt: number;
}

/** 页内 `fetch` 的返回形状（原 `lP` 33232） */
interface PageFetchResult {
  ok: boolean;
  status: number;
  text?: string;
  error?: string;
}



/** 页内 fetch 结果判定（同上，用谓词） */
function isPageFetchResult(v: unknown): v is PageFetchResult {
  return isRecord(v) && typeof v.ok === 'boolean' && typeof v.status === 'number';
}

/** 安全取字符串 */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** 安全取有限数字 */
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * 调 Tapnow 页内接口（原 `Ok` 33272）
 *
 * 5 种失败态（与源一一对应）：缺账号 · 页面没开 · webview 未就绪 · 超时 · HTTP 非 2xx · 非 JSON
 */
export async function tapnowApi(
  account: TapnowAccountRef | null | undefined,
  path: string,
): Promise<Result<unknown>> {
  if (!account?.id) return err('no-account', TAPNOW_TEXT.missingAccount);

  const view = findWebview(account);
  if (!view) return err('page-error', TAPNOW_TEXT.pageNotFound);
  if (typeof view.executeJavaScript !== 'function') {
    return err('page-error', TAPNOW_TEXT.webviewNotReady);
  }

  const r = await withTimeout(
    view.executeJavaScript(tapnowFetchScript(path), true),
    TAPNOW_API_TIMEOUT_MS,
    TAPNOW_TEXT.apiLabel,
  );

  if (!r.ok) {
    return r.kind === 'timeout'
      ? err('page-timeout', TAPNOW_TEXT.apiTimeout, r.error)
      : err('page-error', r.error);
  }

  const res = r.value;
  if (!isPageFetchResult(res)) return err('page-error', TAPNOW_TEXT.apiAbnormal);
  if (res.error) return err('page-error', res.error);
  if (!res.ok) {
    const status = res.status || 0;
    return err('page-error', `接口返回 ${status}${res.error ? '：' + res.error : ''}`, { status });
  }

  // ⚠️ 显式判「到底有没有返回体」（`TD-16-104`）：原先写 `JSON.parse(res.text ?? '')`
  //   ⇒ 把「页面没给 text」错报成「返回不是 JSON」（**失败分类说错**）。
  if (typeof res.text !== 'string') return err('page-error', TAPNOW_TEXT.apiAbnormal);
  try {
    return ok(JSON.parse(res.text));
  } catch (e: unknown) {
    return err('page-error', TAPNOW_TEXT.badJson, e);
  }
}

/**
 * 拉画布列表（原 `Uk` 33328）
 *
 * ⚠️ 与源一致：`limit` 夹在 **1..50**；`id` 为空的条目**被滤掉**；
 *    `name` 回落链是 `name → title → '未命名画布'`。
 */
export async function tapnowListCanvases(
  account: TapnowAccountRef | null | undefined,
  limit: number = LIMIT_DEFAULT,
): Promise<Result<TapnowCanvas[]>> {
  const n = Math.max(LIMIT_MIN, Math.min(Number(limit) || LIMIT_DEFAULT, LIMIT_MAX));
  const path =
    `/api/canvas/v1/canvases?limit=${n}` +
    '&sort_by=updated_at&sort_order=desc&type=canvas&parent_filter=root_only';

  const r = await tapnowApi(account, path);
  if (!r.ok) return r;

  const payload = isRecord(r.value) ? r.value : {};
  const data = isRecord(payload.data) ? payload.data : {};
  const raw = Array.isArray(data.canvases) ? data.canvases : [];

  return ok(
    raw
      .map((item) => {
        const c: Record<string, unknown> = isRecord(item) ? item : {};
        return {
          id: str(c.id),
          name: str(c.name) || str(c.title) || TAPNOW_TEXT.unnamedCanvas,
          previewImage: str(c.preview_image) || str(c.previewImage),
          updatedAt: num(c.updated_at) || num(c.updatedAt),
        };
      })
      .filter((c) => !!c.id),
  );
}

/**
 * 读当前页面地址（原 `Yl` 33401 的前半）
 *
 * ⚠️ 与源一致：**任何失败都返回空串**（视图缺失 / 超时 / 非字符串）
 *    —— 语义即"读不到地址"，调用方据此走"页面没开"分支。
 */
export async function tapnowCurrentHref(
  account: TapnowAccountRef | null | undefined,
): Promise<string> {
  const view = findWebview(account);
  if (!view || typeof view.executeJavaScript !== 'function') return '';

  const r = await withTimeout(
    view.executeJavaScript('location.href', true),
    TAPNOW_HREF_TIMEOUT_MS,
    TAPNOW_TEXT.hrefLabel,
  );
  return r.ok && typeof r.value === 'string' ? r.value : '';
}

/**
 * 读当前画布 id（原 `Yl` 33401）
 *
 * ⚠️ 与源一致：URL 非法（如相对地址）或路径不匹配 ⇒ 空串（语义即"认不出画布"）。
 * ⚠️ href 的读取**只有 `tapnowCurrentHref` 一处**（SSOT），本函数只负责"从地址里切 id"。
 */
export async function tapnowCurrentCanvasId(
  account: TapnowAccountRef | null | undefined,
): Promise<string> {
  const href = await tapnowCurrentHref(account);
  // ⚠️ 切法归 `core/rules/scanChain.canvasIdFromHref`（源里这形状有三处 ⇒ 收口一份）
  return canvasIdFromHref(href);
}

// ── 画布节点 API（原 `qc` 33400 + 它的 4 个收集助手 `aP`/`Ci`/`ao`/`Gc` 33114-33195）──────────
// ⚠️ 这一段是 **Tapnow 专属**（域名 / 路径 / 参数名都是它的）⇒ 按判据 A1 留在本目录（不进 `core/rules`）。

/** 允许的图片域（原 `Dk` + `nP`，`:33114`）：Tapnow 自家域 **或** 它的 OSS CDN */
const TAPNOW_DOMAIN_RE = /(^|\.)(tapnow\.media|tapnow\.art)$/i;
const TAPNOW_OSS_RE = /(^|\.)oss-cn-[a-z0-9-]+\.aliyuncs\.com$/i;
/** 上传接口路径（原 `rP`，`:33115`）—— 这是 Tapnow 图片最可靠的形状特征 */
const UPLOAD_PATH_RE =
  /\/api\/(?:conversation\/storage\/uploads|community\/files)\/[0-9a-f]{8}-[0-9a-f-]{4,}/i;
/** 一眼即废（原 `sP`，`:33116`）：资产 / logo / 广告 / 追踪 … */
const JUNK_URL_RE =
  /(fe-assets|tap_logo|tapnow-brand-logo|\/campaign\/|campaign\/covers|plugin-icons|\/assets\/|agent-motion|motion-|loading-|brainstorm-icon|home-app-|favicon|sprite|placeholder|spinner|blank|1x1|pixel|skeleton|qrcode|googleads|doubleclick|facebook|bing|yandex|pinterest|analytics|conversion|adsct|gtm|clarity|sentry|tiktok|reddit|twitter|stripe|line-scdn|daumcdn|kakaocdn|pstatic|naver)/i;
/** 图片扩展名（原 `oP`，`:33118`） */
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic|heif)(\?|#|$)/i;
/** 要剥掉的参数名（原 `Lk`，`:33117`）—— Tapnow 的 CDN 变体 / OSS 处理参数 */
const VARIANT_PARAMS = ['variant_name', 'x-oss-process'];

/** 画布节点里的一张图（原 `qc` 的输出元素） */
export interface TapnowCanvasImage {
  url: string;
  /** 去查询串的规范化 url（原 `Vc`）—— 组内**去重键**，也用于与"已在库"比对 */
  key: string;
  canvasId: string;
  canvasName: string;
}

/**
 * 剥掉 CDN 变体参数（原 `ao` 33172）—— **只删命中的那几个**，没删到就原样返回
 * ⚠️ 与 `lib/url.stripSignature`（原 `Od`）**参数表不同**（那是签名参数、这是一组 CDN 参数）
 *   ⇒ **不合并**（合并会把两边的表混成一份，任一边改都影响两边）。
 */
export function stripVariantParams(url: string): string {
  try {
    const u = new URL(url);
    let removed = false;
    for (const key of Array.from(u.searchParams.keys())) {
      if (VARIANT_PARAMS.includes(key)) {
        u.searchParams.delete(key);
        removed = true;
      }
    }
    return removed ? u.toString() : url;
  } catch (e: unknown) {
    void e;
    return url;
  }
}

/** 归一键（原 `Vc` 33159）：`origin + pathname`（砍掉查询串）；URL 非法 ⇒ 砍 `?` 后的原文 */
export function canvasImageKey(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch (e: unknown) {
    void e;
    return String(url || '').split('?')[0] ?? '';
  }
}

/**
 * 该 url 是否算"画布里的图"（原 `Ci` 33148）
 *
 * 逐条：非空字符串 · 排除 `blob:`/`data:` · 不命中广告/资产黑名单 · **域名**必须是 Tapnow 或它的 OSS
 * · 路径是上传接口形状 **或** 带图片扩展名。
 */
export function isUsableCanvasImageUrl(url: string): boolean {
  if (!url || /^(blob|data):/i.test(url) || JUNK_URL_RE.test(url)) return false;
  try {
    const u = new URL(url);
    if (!TAPNOW_DOMAIN_RE.test(u.hostname) && !TAPNOW_OSS_RE.test(u.hostname)) return false;
    return UPLOAD_PATH_RE.test(u.pathname) || IMAGE_EXT_RE.test(u.pathname);
  } catch (e: unknown) {
    void e;
    return false;
  }
}

/**
 * 从一个**任意 JSON 值**里递归收集图片 url（原 `Gc` 33192）
 *
 * ⚠️ 与源一致的三条闸：**深度 > 8 停**（防环/深树）· 结果**上限 500 条** · 字符串才判（其余递归）。
 * ⚠️ 收集时不改 url（源在这里就 `ao(...)` 剥过参数，本函数同法）。
 */
function collectCanvasImageUrls(value: unknown, out: string[], depth = 0): string[] {
  if (out.length >= 500 || depth > 8 || value == null) return out;
  if (typeof value === 'string') {
    if (isUsableCanvasImageUrl(value)) out.push(stripVariantParams(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (out.length >= 500) break;
      collectCanvasImageUrls(item, out, depth + 1);
    }
    return out;
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      if (out.length >= 500) break;
      collectCanvasImageUrls(value[key], out, depth + 1);
    }
  }
  return out;
}

/**
 * 读一个画布的节点图（原 `qc` 33354-33400）
 *
 * 顺序（逐字）：`/api/canvas/v1/canvases/<id>?with_nodes=true&with_connections=true` → `data.canvas`
 *   → `preview_image`（`includePreview !== false` 时）＋ `cover_set` ＋ `nodes` 递归收集
 *   → 按 `origin+pathname` **去重**（同图多条候选只留第一条）。
 *
 * @returns `name` = 画布名（源用于图片命名前缀）· `images` = 去重后的图
 * ⚠️ 失败**原样透传** `tapnowApi` 的 `Result`（含状态码造成的 `接口返回 401` 原文 —— 原则 6）。
 */
export async function tapnowCanvasNodes(
  account: TapnowAccountRef | null | undefined,
  canvasId: string,
  opts: { includePreview?: boolean } = {},
): Promise<Result<{ name: string; images: TapnowCanvasImage[] }>> {
  const path = `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}?with_nodes=true&with_connections=true`;
  const r = await tapnowApi(account, path);
  if (!r.ok) return r;

  const payload = isRecord(r.value) ? r.value : {};
  const data = isRecord(payload.data) ? payload.data : {};
  const canvas = isRecord(data.canvas) ? data.canvas : {};
  const name = str(canvas.name);

  const collected: string[] = [];
  if (opts.includePreview !== false) {
    if (typeof canvas.preview_image === 'string' && isUsableCanvasImageUrl(canvas.preview_image)) {
      collected.push(stripVariantParams(canvas.preview_image));
    }
    collectCanvasImageUrls(canvas.cover_set, collected, 0);
  }
  collectCanvasImageUrls(canvas.nodes, collected, 0);

  const byKey = new Map<string, TapnowCanvasImage>();
  for (const url of collected) {
    const key = canvasImageKey(url);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, { url, key, canvasId, canvasName: name });
  }
  return ok({ name, images: Array.from(byKey.values()) });
}
