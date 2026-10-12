/**
 * 存储体积格式化（原 `_Component42.jsx` 的 `Mt`）—— ★ 纯函数，必测（§6.5 原则 7）
 *
 * 依据（**逐行回源**，源在 `_Component42.jsx:215-235`）：
 *   | 量级 | 规则 |
 *   |---|---|
 *   | `< 1024` | `${n} B` —— **整数、无小数**（`n` 可是小数，源就是直接插值） |
 *   | KB / MB | `< 10` 两位小数 · `< 100` 一位小数 · 其余 **`Math.round` 取整** |
 *   | GB | `< 10` 两位小数 · 其余 **一位小数**（★ **GB 这档没有"取整"档** —— 与 KB/MB 不同） |
 *   | 非有限数 / 负数 / `null`·`undefined` | **空串**（源 `return ''`） |
 *
 * ⚠️ **它不是 `core/rules/downloadNode.ts` 的 `formatBytes`**：那套是「B 档整数 · KB/MB 一位小数 ·
 *    **无 GB 档**」，逐字对齐的是**下载节点**的源。两者各自对齐各自的源 ⇒ **不要合并**
 *    （合并必然让一边不再逐字对源）。
 * ⚠️ 原则 4：纯函数，不碰宿主。
 */

/**
 * 体积（bytes → 人类可读，原 `Mt`）
 *
 * ⚠️ **`TD-16-109` 复核结论（2026-10-12）：与 `core/rules/downloadNode.formatBytes`（源 `$e`）
 *   **是有意分叉，勿合并** —— 两者是**不同源函数**且规则不同：
 *   | | 本函数（源 `Mt`） | `downloadNode.formatBytes`（源 `$e`） |
 *   |---|---|---|
 *   | KB/MB 精度 | **动态**（<10 两位 · <100 一位 · 其余整数） | 恒 `toFixed(1)` |
 *   | GB 档 | **有** | **无**（再大也显示 MB） |
 *   | 非法输入 | `null/undefined/负数/NaN` ⇒ 空串 | `0`/`NaN` ⇒ 空串 |
 */
export function formatStorageSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(2) : kb < 100 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(2) : mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(2) : gb.toFixed(1)} GB`;
}
