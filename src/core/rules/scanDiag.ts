/**
 * 抓取诊断的**纯判据**（★ 必测）
 *
 * 依据（**逐行回源**）：
 *   - `GT` `shared.js:32453-32477` —— 把 diag 拼成一行摘要（**本文件的主体**）
 *   - `hp` 的 `p` 对象 `:22663-23233` —— 诊断字段的**产生方**（在 `adapters/site/shared/scanScripts.ts`）
 *
 * ⚠️ 零宿主依赖（纯字符串 / 数字）⇒ 归 `core/rules`（§6.5 原则 7）。
 * ⚠️ 类型 `ScanDiag` 住 `core/ports/site.port.ts`（它是**跨页内脚本 → 端口 → 用例**的契约），
 *    本文件只**引用**（与 `core/rules/scanClean` 引用 `ScannedImage` 同法）。
 */

import { GEN_CANVAS_EXPORT_MIN_SIDE } from '@/constants';
import { SCAN_DIAG_TEXT } from '@/constants/text';
import type { CanvasBox, ScanDiag } from '@/core/ports/site.port';

const FIELDS = [
  'docCount',
  'iframeCount',
  'shadowCount',
  'imgTotal',
  'imgUsable',
  'canvasCount',
  'itemsRaw',
  'itemsKept',
] as const;

/** 画布条目的四个数（原 `p.canvases` 的元素） */
function normalizeCanvasBox(value: unknown): CanvasBox | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const { w, h, dw, dh } = r;
  if (typeof w !== 'number' || !Number.isFinite(w)) return null;
  if (typeof h !== 'number' || !Number.isFinite(h)) return null;
  if (typeof dw !== 'number' || !Number.isFinite(dw)) return null;
  if (typeof dh !== 'number' || !Number.isFinite(dh)) return null;
  return { w, h, dw, dh };
}

/**
 * 把不可信值收窄成 `ScanDiag`（页内脚本是**运行时数据**，形状不由 TS 保证）
 *
 * ⚠️ **缺任一字段 ⇒ `null`**（不补默认值 —— 补了就是把"没给"伪装成"是 0"，原则 6）
 * ⚠️ `canvases` 有一条不合法 ⇒ **整个诊断作废**（**不"跳过坏条目"**：那会把"页面给了 6 个、
 *    我只认 3 个"伪装成"页面就 3 个"）
 */
export function normalizeScanDiag(value: unknown): ScanDiag | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const k of FIELDS) {
    const n = rec[k];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    out[k] = n;
  }
  if (!Array.isArray(rec.canvases)) return null;
  const canvases: CanvasBox[] = [];
  for (const c of rec.canvases) {
    const box = normalizeCanvasBox(c);
    if (!box) return null;
    canvases.push(box);
  }
  return { ...(out as unknown as Omit<ScanDiag, 'canvases'>), canvases };
}

/**
 * **该不该导画布**（原 `wp:32611-32613` 的 canvas 门）
 *
 * 判据（逐条对源）：诊断里有画布（`canvasCount > 0`）∧ **至少一个**画布的
 *   「像素 / 布局」四个数里**最大的那个** `>= 200`。
 *
 * ⚠️ **不含 `pageKind === CANVAS` 那一档** —— 那是**站点专属**判定（`lovart/pageKind`），归适配器；
 *    本函数只判"诊断说这页值不值得导"。
 */
export function shouldExportCanvas(diag: ScanDiag | null | undefined): boolean {
  if (!diag || diag.canvasCount <= 0) return false;
  return diag.canvases.some(
    (c) => Math.max(c.w || 0, c.h || 0, c.dw || 0, c.dh || 0) >= GEN_CANVAS_EXPORT_MIN_SIDE,
  );
}

/**
 * 诊断摘要（原 `GT`，`:32453-32477`）—— 一行、` · ` 分隔
 *
 * 逐档对源（**顺序即语义**）：
 *   `文档 N`（恒有，缺则按 1）→ `iframe N`（有才出）→ `shadowRoot N`（有才出）→
 *   `img N（可用 M）`（恒有）→ `网络图 N`（有才出）→ `canvas N`（有才出）→
 *   `候选 N→M`（恒有）
 *
 * ⚠️ **源的第一档 `frame N 个` 本仓不落**：它读 `diag.frames`，而 `hp` **从不写**该字段
 *   ⇒ 源里那一档是**死分支**（详见 `ScanDiag` 的注释）。
 * ⚠️ **源的 `网络图 N` 一档本仓也不落**：本仓没有 perf 取图通道 ⇒ 没有可诚实上报的计数。
 */
export function formatScanDiag(diag: ScanDiag | null | undefined): string {
  if (!diag) return SCAN_DIAG_TEXT.noData;
  const t = SCAN_DIAG_TEXT;
  const parts: string[] = [];
  parts.push(t.doc(diag.docCount || 1));
  if (diag.iframeCount) parts.push(t.iframe(diag.iframeCount));
  if (diag.shadowCount) parts.push(t.shadowRoot(diag.shadowCount));
  parts.push(t.img(diag.imgTotal || 0, diag.imgUsable || 0));
  if (diag.canvasCount) parts.push(t.canvas(diag.canvasCount));
  parts.push(t.candidates(diag.itemsRaw || 0, diag.itemsKept || 0));
  return parts.join(t.separator);
}
