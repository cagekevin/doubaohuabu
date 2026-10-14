/**
 * Tapnow 页面类型判定（原 `n0` 33119-33139 + `Dk` 33113 + `$s` 33108）
 *
 * 用途：抓取 / 发送前先判「用户当前停在哪种页」——
 *   **画布页**（可抓）· **首页/广场**（不可抓，要提示去打开画布页）· **其他**。
 *
 * ⚠️ **归属（判据 A1）**：**路径规则**是 Tapnow 的 ⇒ **留本目录**；
 *    而**主机名归属**是渲染侧共用的判据（值 = `constants/siteHosts`、判定 = `core/rules/siteHost`）
 *    ⇒ 本文件**只引用，不自持主机名正则**（`TD-05-12`：域名字面量不许在适配器里再写一份）。
 */

// ★ **枚举真源已收口**（原 `$s` 33108 与 Lovart 的 `Sn` 22637 是**同一枚举**）：与 `SCAN_PHASES` /
//   `SCAN_SCOPES` 同法搬到 `core/rules/scanChain.ts` —— 本文件**不再自持副本**（判据 C1：第 3 处到点）。
import { PAGE_KINDS, type PageKind } from '@/core/rules/scanChain';
// ★ **归属判定真源**（渲染侧唯一；值在 `constants/siteHosts`）
import { isHostOfSite } from '@/core/rules/siteHost';

/** 画布页路径（原 `n0` 内联）—— `/canvas/<8+ 位十六进制/横线>` */
const CANVAS_PATH_RE = /^\/canvas\/[0-9a-f-]{8,}/i;
/** 首页 / 广场类路径（原 `n0` 内联） */
const FEED_PATH_RE = /^\/(home|community|discover|explore|templates|gallery|pricing|assets|app-store)/i;

/**
 * 判定页面类型（原 `n0` 33119）
 *
 * **顺序即语义**：
 *   非字符串 / 非 Tapnow 域 / URL 解析失败 ⇒ 一律 `other`
 *   → 画布路径 ⇒ `canvas`
 *   → 根路径（`/` 或空）或广场类路径 ⇒ `feed`
 *   → 其余 ⇒ `other`
 */
export function tapnowPageKind(href: unknown): PageKind {
  if (!href || typeof href !== 'string') return PAGE_KINDS.OTHER;
  try {
    const url = new URL(href);
    if (!isHostOfSite(url.hostname, 'tapnow')) return PAGE_KINDS.OTHER;
    const path = url.pathname || '';
    if (CANVAS_PATH_RE.test(path)) return PAGE_KINDS.CANVAS;
    if (/^\/?$/.test(path) || FEED_PATH_RE.test(path)) return PAGE_KINDS.FEED;
    return PAGE_KINDS.OTHER;
  } catch (e: unknown) {
    // ⚠️ 与源一致：URL 非法（如相对地址）⇒ `other`（不是致命错误，语义即"认不出"）
    void e;
    return PAGE_KINDS.OTHER;
  }
}
