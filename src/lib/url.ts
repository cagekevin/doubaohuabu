/**
 * URL 规范化（无状态 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：
 *   - `Si` shared.js:25815-25832 —— 去 `search`/`hash`、host 小写、去末尾 `/`
 *   - `Od` shared.js:36307 —— 去签名参数（**去重键**；出片轮询用，见 `core/rules/resultScan`）
 *
 * 用途：抓取去重时**同一张图的不同签名 URL 必须归一成同一个 key**（否则永远判不出重复）
 */

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

