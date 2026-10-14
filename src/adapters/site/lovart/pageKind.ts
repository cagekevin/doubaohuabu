/**
 * Lovart 页面类型判定（原 `_d` 22642-22662 ＋ `Sn` 22637）
 *
 * 用途：抓取 / 发送前先判「用户当前停在哪种页」——
 *   **画布页**（可抓）· **首页 / 广场**（不可抓，要提示去打开画布页）· **其他**。
 *
 * ⚠️ **归属（判据 A1）**：**路径规则**是 Lovart 的 ⇒ **留本目录**；
 *    而**主机名归属**是渲染侧共用的判据（值 = `constants/siteHosts`、判定 = `core/rules/siteHost`）
 *    ⇒ 本文件**只引用，不自持主机名正则**（`TD-05-12`：自带正则就会漏掉**边界**，
 *    那时 `evillovart.ai` 也会被判成 Lovart）。
 * ⚠️ 源里还有一份**简化版**（`hp` 内联，`:22675-22693`）：同样判域与 `/canvas`，但**不判 `feed`**
 *    ⇒ 两者差异只在"非画布时给不给得出 feed"。本文件照**完整版 `_d`**（抓取侧要 `feed` 才提示得准）。
 */

// ★ **枚举真源已收口**（原 `Sn` 22637 与 Tapnow 的 `$s` 33108 是**同一枚举**）：与 `SCAN_PHASES` /
//   `SCAN_SCOPES` 同法放在 `core/rules/scanChain.ts` —— 本文件**不自持副本**（判据 C1：第 3 处到点）。
import { PAGE_KINDS, type PageKind } from '@/core/rules/scanChain';
// ★ **归属判定真源**（渲染侧唯一；值在 `constants/siteHosts`）
import { isHostOfSite } from '@/core/rules/siteHost';

/** 画布页路径（原 `_d` 内联） */
const CANVAS_PATH_RE = /\/canvas(\/|\?|$)/i;
/** 首页 / 广场类路径（原 `_d` 内联的白名单） */
const FEED_PATH_RE =
  /^\/(home|plaza|for-you|trending|explore|templates|gallery|asset|assets|pricing|pricing-plans)/i;

/**
 * 判定页面类型（原 `_d` 22642）
 *
 * **顺序即语义**：
 *   非字符串 / 非 Lovart 域 / URL 解析失败 ⇒ 一律 `other`
 *   → `/canvas…` 或带 `projectId` 查询 ⇒ `canvas`
 *   → 根路径（`/` 或空）或广场类路径 ⇒ `feed`
 *   → 其余 ⇒ `other`
 */
export function lovartPageKind(href: unknown): PageKind {
  if (!href || typeof href !== 'string') return PAGE_KINDS.OTHER;
  try {
    const url = new URL(href);
    if (!isHostOfSite(url.hostname, 'lovart')) return PAGE_KINDS.OTHER;
    const path = url.pathname || '';
    if (CANVAS_PATH_RE.test(path) || url.searchParams.has('projectId')) return PAGE_KINDS.CANVAS;
    if (/^\/?$/.test(path) || FEED_PATH_RE.test(path)) return PAGE_KINDS.FEED;
    return PAGE_KINDS.OTHER;
  } catch (e: unknown) {
    // ⚠️ 与源一致：URL 非法（如相对地址）⇒ `other`（不是致命错误，语义即"认不出"）
    void e;
    return PAGE_KINDS.OTHER;
  }
}
