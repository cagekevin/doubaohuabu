/**
 * URL 规范化（无状态 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：
 *   - `Si` shared.js:25815-25832 —— 去 `search`/`hash`、host 小写、去末尾 `/`
 *   - `Od` shared.js:36307 —— 去签名参数
 *   - `RR` shared.js:36323 —— 过滤 svg / 头像 / 过小图
 *
 * 用途：抓取去重时**同一张图的不同签名 URL 必须归一成同一个 key**（否则永远判不出重复）
 *
 * ⚠️ 阈值**不再内联**（2026-10-10，TD-12-1）：原实现硬编码 `200` / `4096`，
 *    与 `constants/dedupe.ts` 的 `MIN_IMAGE_SIDE` / `MIN_IMAGE_BYTES` 是**同一真相的两份**。
 *    现从 SSOT 导入（`lib` 与 `constants` 同为 L0，同层可依赖）。
 */

import { MIN_IMAGE_BYTES, MIN_IMAGE_SIDE } from '@/constants/dedupe';

/** 签名类查询参数（抓取 URL 里常见，去掉后才是"同一张图"） */
const SIGNATURE_PARAMS = [
  'sign',
  'signature',
  'token',
  'auth',
  'expires',
  'expire',
  'x-expires',
  'x-signature',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-date',
  'x-amz-expires',
  'x-amz-signedheaders',
  'se',
  'sp',
  'sv',
  'sr',
  'st',
  'ossaccesskeyid',
  'x-oss-signature',
  'x-oss-expires',
  'image_process',
  'x-image-process',
];

/**
 * 规范化 URL（原 `Si` 25815）
 * `blob:` / `data:` 原样返回
 */
export function normalizeUrl(url: unknown): string {
  if (typeof url !== 'string' || !url) return '';
  if (/^(blob:|data:)/i.test(url)) return url;
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return url;
    u.search = '';
    u.hash = '';
    u.host = u.host.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * 去签名参数（原 `Od` 36307）
 * 与 `normalizeUrl` 的区别：**保留其它 query**，只摘掉签名类参数
 */
export function stripSignature(url: unknown): string {
  if (typeof url !== 'string' || !url) return '';
  if (/^(blob:|data:)/i.test(url)) return url;
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return url;
    for (const p of SIGNATURE_PARAMS) u.searchParams.delete(p);
    // 顺带把 host 小写 + 去末尾斜杠（与原实现一致的方向）
    u.host = u.host.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return url;
  }
}

/** 头像/UI 资源的路径特征（原 `RR` 36323） */
const AVATAR_LIKE = /(avatar|profile|userpic|head(?:er)?[-_]?icon|logo|icon|sprite|placeholder)/i;

export interface UrlFilterOptions {
  /** 长边下限（px），默认 200 —— 由调用方传入尺寸 */
  minSide?: number;
  /** 文件大小下限（bytes），默认 4096 */
  minBytes?: number;
}

/**
 * 过滤无效图（原 `RR` 36323）
 *
 * @returns `true` = **应丢弃**
 */
export function shouldDiscardImage(
  url: string,
  size?: { w?: number; h?: number; bytes?: number },
  opts: UrlFilterOptions = {},
): boolean {
  // ⚠️ 默认值来自 SSOT（`constants/dedupe.ts`），不在此内联 —— TD-12-1
  const minSide = opts.minSide ?? MIN_IMAGE_SIDE;
  const minBytes = opts.minBytes ?? MIN_IMAGE_BYTES;

  if (!url) return true;
  // svg 一律丢弃（矢量图不参与去重/落盘）
  if (/\.svg(?:$|\?)/i.test(url) || /^data:image\/svg/i.test(url)) return true;
  if (AVATAR_LIKE.test(url)) return true;

  if (size) {
    const { w = 0, h = 0, bytes } = size;
    if (w > 0 && h > 0 && Math.max(w, h) < minSide) return true;
    if (typeof bytes === 'number' && bytes > 0 && bytes < minBytes) return true;
  }
  return false;
}

/** 从 URL 末段取文件名（原 `kR` 36036）；取不到则返回 `null` */
export function fileNameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : null;
  } catch {
    return null;
  }
}
