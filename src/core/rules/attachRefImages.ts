/**
 * 发送管线 Phase 2（附图）的**纯判据**
 *
 * 依据（**逐行回源抄录**，源 `_Component43.jsx` 的 `Be`）：
 *   - 参考图去重键 `vD` `shared.js:38638-38642`
 *   - 去重循环 `:822-843`
 *   - 附件增量判定（CDP 确认 `:918-923` · 剪贴板确认 `:979-984` · 按键补充 `:991-995` · 2b `:1036-1045`）
 *
 * ⚠️ 本文件**零副作用**（不碰 DOM / 不取时间 / 不发 IPC）—— 全部循环与 `sleep` 在
 *    `adapters/site/shared/attachImage.ts`（那里的编排**顺序即语义**，别搬进来）。
 */

/** 一张参考图（源 `Be` 里的 `Z` / `K` 元素形状） */
export interface RefImageLike {
  dataUrl?: unknown;
  label?: unknown;
}

/** 去重后的一张（源 `K.push({...Z[st], _fp: dt, _origIndex: st})`） */
export interface DedupedRefImage {
  dataUrl: string;
  label: string;
  /** 去重键（源 `_fp`，来自 `vD`） */
  fp: string;
  /** 在原数组里的下标（源 `_origIndex`） */
  origIndex: number;
}

/**
 * 参考图去重键（原 `vD`，`shared.js:38638-38642`）
 *
 * ```js
 * const t = (e.dataUrl || '').substring(0, 80);
 * const n = (e.label || '').trim();
 * return `${t}::${n}`;
 * ```
 * ⚠️ **只取 `dataUrl` 前 80 字**（源如此 —— 大 base64 全量比较没必要，且前缀已足够区分）
 */
export function referenceImageKey(img: RefImageLike | null | undefined): string {
  const dataUrl = typeof img?.dataUrl === 'string' ? img.dataUrl : '';
  const label = typeof img?.label === 'string' ? img.label.trim() : '';
  return `${dataUrl.substring(0, 80)}::${label}`;
}

export interface DedupeResult {
  list: DedupedRefImage[];
  /** 被去掉的重复张数（源 `de`） */
  dropped: number;
  /** 被去掉的项（含它重复于哪一项）—— 源只在日志里体现，本仓给结构化结果便于上报 */
  droppedAt: Array<{ index: number; dupOf: number }>;
}

/**
 * 参考图去重（原 `:824-840`）
 *
 * 源逐字：**首次出现保留**（`Y[dt]` 记的是它在 `K` 里的下标），后续同键**跳过并计数**。
 * ⚠️ 键表 `Y` 是普通对象（`{}`），源的 `Y.hasOwnProperty(dt)` 用它判重 ⇒ 本仓用 `Map`（同语义、无原型污染）。
 */
export function dedupeReferenceImages(
  images: readonly RefImageLike[],
): DedupeResult {
  const list: DedupedRefImage[] = [];
  const seen = new Map<string, number>();
  const droppedAt: Array<{ index: number; dupOf: number }> = [];

  for (let i = 0; i < images.length; i += 1) {
    const img = images[i] as RefImageLike;
    const fp = referenceImageKey(img);
    const dup = seen.get(fp);
    if (dup !== undefined) {
      droppedAt.push({ index: i, dupOf: dup });
      continue;
    }
    seen.set(fp, list.length);
    list.push({
      dataUrl: typeof img?.dataUrl === 'string' ? img.dataUrl : '',
      label: typeof img?.label === 'string' ? img.label : '',
      fp,
      origIndex: i,
    });
  }

  return { list, dropped: droppedAt.length, droppedAt };
}

/**
 * CDP 主通路是否**已确认到齐**（原 `:920` 的 `if (rt >= K.length) break`）
 *
 * @param delta 探测到的增量（`attachImgCount - 基数`）
 * @param expected 去重后的张数
 */
export function cdpConfirmed(delta: number, expected: number): boolean {
  return delta >= expected;
}

/**
 * 剪贴板逐张的**本次新增**（原 `:980` 的 `bt = attachImgCount - Te - we`）
 *
 * ⚠️ 减两次：`before`（粘贴前基数）与 `already`（**已确认**的新增累计）—— 源就是
 *    `attachImgCount - Te - we`，漏掉 `we` 会把"上一张已计入的"重复算进来。
 */
export function clipboardDelta(count: number, before: number, already: number): number {
  return count - before - already;
}

/**
 * Phase 2b 重试里对「附件**总计**」的比较（原 `:1038-1039` 的 `mt = $t - Te; if (mt > we)`）
 *
 * ⚠️ 与 `clipboardDelta` **不是一回事**：2b 比的是**总计**（不减 `already`），且要求**严格大于**。
 *    源两处写法不同是既成事实，别"统一"掉。
 */
export function retryImproved(count: number, before: number, already: number): boolean {
  return count - before > already;
}
