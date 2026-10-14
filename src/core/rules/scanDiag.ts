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

import { isRecord } from '@/lib/object';
import { GEN_CANVAS_EXPORT_MIN_SIDE } from '@/constants';
import { SCAN_DIAG_TEXT } from '@/constants/text';
import type { CanvasBox, ScanDiag } from '@/core/ports/site.port';

/**
 * `ScanDiag` 除 `canvases` 外的**数字字段清单**（唯一）
 *
 * `satisfies` 保证它**不多**（写错名字 ⇒ 编译不过）；「**不缺**」由 `normalizeScanDiag` 的返回处
 * 保证（少一个键，那个对象就不再是 `ScanDiag` ⇒ 编译不过）。
 */
const NUMBER_FIELDS = [
  'docCount',
  'iframeCount',
  'shadowCount',
  'imgTotal',
  'imgUsable',
  'perfImg',
  'canvasCount',
  'itemsRaw',
  'itemsKept',
] as const satisfies readonly Exclude<keyof ScanDiag, 'canvases'>[];
type NumberField = (typeof NUMBER_FIELDS)[number];

/**
 * 逐字段读那 9 个数（缺任一 / 非有限数 ⇒ `null` —— **不补默认值**，理由见 `normalizeScanDiag`）
 *
 * ⚠️ 收口处**一次断言**：校验**在**它之前（每个键都在循环里验过），TS 只是无法证明
 *    「循环已把每个键都填满」⇒ 这是唯一要跨的类型墙，**不是**用断言替代校验。
 */
function readNumberFields(rec: Record<string, unknown>): Record<NumberField, number> | null {
  const out: Partial<Record<NumberField, number>> = {};
  for (const k of NUMBER_FIELDS) {
    const n = rec[k];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out as Record<NumberField, number>;
}

/** 画布条目的四个数（原 `p.canvases` 的元素） */
function normalizeCanvasBox(value: unknown): CanvasBox | null {
  if (!isRecord(value)) return null;
  const { w, h, dw, dh } = value;
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
  if (!isRecord(value)) return null;
  const nums = readNumberFields(value);
  if (!nums) return null;
  if (!Array.isArray(value.canvases)) return null;
  const canvases: CanvasBox[] = [];
  for (const c of value.canvases) {
    const box = normalizeCanvasBox(c);
    if (!box) return null;
    canvases.push(box);
  }
  return { ...nums, canvases };
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
 */
export function formatScanDiag(diag: ScanDiag | null | undefined): string {
  if (!diag) return SCAN_DIAG_TEXT.noData;
  const t = SCAN_DIAG_TEXT;
  const parts: string[] = [];
  parts.push(t.doc(diag.docCount || 1));
  if (diag.iframeCount) parts.push(t.iframe(diag.iframeCount));
  if (diag.shadowCount) parts.push(t.shadowRoot(diag.shadowCount));
  parts.push(t.img(diag.imgTotal || 0, diag.imgUsable || 0));
  if (diag.perfImg) parts.push(t.network(diag.perfImg));
  if (diag.canvasCount) parts.push(t.canvas(diag.canvasCount));
  parts.push(t.candidates(diag.itemsRaw || 0, diag.itemsKept || 0));
  return parts.join(t.separator);
}
