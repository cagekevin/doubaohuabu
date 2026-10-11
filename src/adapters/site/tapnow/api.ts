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
import { findWebview, type WebviewAccountRef } from '../shared/webview';
import { tapnowFetchScript } from './scripts';

/** 账号定位（`Xn` 用到的三字段） */
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

/** 画布 id 的路径正则（原 `Yl` 33401 内联） */
const CANVAS_ID_PATH_RE = /^\/canvas\/([0-9a-f-]{8,})/i;

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
  if (!href) return '';
  try {
    const m = (new URL(href).pathname || '').match(CANVAS_ID_PATH_RE);
    return m?.[1] ?? '';
  } catch (e: unknown) {
    // ⚠️ 与源一致：URL 非法 ⇒ 空串（语义即"认不出"）
    void e;
    return '';
  }
}
