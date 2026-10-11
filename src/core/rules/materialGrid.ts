/**
 * 素材批量落画布的**居中网格布局**（**纯函数**，★ 必测）—— 原 `addMaterialsBatch` 的布局半
 * （`shared.js:29084-29160`）
 *
 * ★ **它是什么**：把 N 张图排成 `cols × rows` 的网格 ——
 *   · 每张先**按长边 ≤ 260** 等比缩出显示尺寸，**高再加 64**（节点头部那一截）；
 *   · **列宽 = 该列内最大宽**、**行高 = 该行内最大高**（于是同一列左对齐、同一行顶对齐）；
 *   · 列/行之间加 `gap`；
 *   · 整张网格以 `centerOn` 为中心（原 `b = v - h/2` / `x = y - w/2`）。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `fitMaterialSize` | 29091-29106 的 `l` | 长边 ≤ `scale×260`；`+64` 头部 |
 *   | 列数 / 行数 | 29089-29090 | `cols = max(1, r.cols \|\| ceil(sqrt(n)))`、`rows = ceil(n/cols)` |
 *   | 列宽 / 行高 | 29112-29121 | 各自取**最大值** |
 *   | 列/行偏移 | 29122-29131 | 前缀和 + `gap` |
 *   | 居中 | 29159-29160 | 网格中心 = `centerOn` |
 *
 * ⚠️ **原则 4**：纯的 —— 不接触 window / Date.now。
 * ⚠️ `autoPlace`（按**已有节点**的右边界自动落点）**不在这里** —— 它要读 `nodes`，
 *    由 `state` 侧算好 `centerOn` 再传进来（见 `canvas.addMaterialsBatch`）。
 */

import {
  GALLERY_BIG_BYTES,
  GALLERY_BIG_SIDE,
  GALLERY_FALLBACK_H,
  GALLERY_FALLBACK_W,
  GALLERY_GRID_GAP,
  GALLERY_GRID_LONG_SIDE,
  GALLERY_NODE_HEADER_H,
} from '@/constants';
import { snapToGrid } from './recipe';

/** 待摆放的一张图（原 `n[j]` 只用到 `natW`/`natH`） */
export interface MaterialGridItem {
  natW?: number;
  natH?: number;
}

export interface MaterialGridOptions {
  /** 列数（不给 ⇒ `ceil(sqrt(n))`） */
  cols?: number;
  /** 间距（px，默认 24） */
  gap?: number;
  /** 缩放系数（默认 1） */
  scale?: number;
  /** 网格中心（原 `centerOn`）；不给 ⇒ `(0,0)` */
  centerOn?: { x: number; y: number };
  /** 吸附到 20 网格（原 `t().snap ? mr(H) : H`） */
  snap?: boolean;
}

/** 一张图的落点与尺寸（原 `O.w`/`O.h` —— **高已含 `+64`**） */
export interface MaterialPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MaterialGridPlan {
  placements: MaterialPlacement[];
  cols: number;
  rows: number;
  /** 网格总宽 / 总高 */
  width: number;
  height: number;
}

/**
 * 单张图的**显示尺寸**（原 29091-29106 的 `l`）
 *
 * 规则（**顺序即语义**）：
 *   · 起点是 `natW || 200` / `natH || 160`；
 *   · **宽 ≥ 高且宽 > 长边上限** ⇒ 宽压到上限、高按比例缩；
 *   · **否则（高 > 上限）** ⇒ 高压到上限、宽按比例缩；
 *   · **最后 `h + 64`**（节点头部）。
 */
export function fitMaterialSize(
  natW?: number,
  natH?: number,
  scale: number = 1,
): { w: number; h: number } {
  const cap = scale * GALLERY_GRID_LONG_SIDE;
  let w = natW || GALLERY_FALLBACK_W;
  let h = natH || GALLERY_FALLBACK_H;
  if (w >= h && w > cap) {
    h = Math.round((cap * h) / w);
    w = cap;
  } else if (h > cap) {
    w = Math.round((cap * w) / h);
    h = cap;
  }
  return { w, h: h + GALLERY_NODE_HEADER_H };
}

/**
 * 排一张居中网格（原 29088-29160）
 *
 * ⚠️ 与源一致：**空数组 ⇒ 空计划**（`cols`/`rows` 都是 0，宽高 0）。
 * ⚠️ 返回的 `placements[i]` 与入参 `items[i]` **一一对应**（顺序即语义）。
 */
export function planMaterialGrid(
  items: readonly MaterialGridItem[],
  opts: MaterialGridOptions = {},
): MaterialGridPlan {
  const n = items.length;
  if (n === 0) return { placements: [], cols: 0, rows: 0, width: 0, height: 0 };

  const cols = Math.max(1, opts.cols || Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const gap = opts.gap ?? GALLERY_GRID_GAP;
  const sizes = items.map((it) => fitMaterialSize(it.natW, it.natH, opts.scale ?? 1));

  // 列宽 = 列内最大宽；行高 = 行内最大高
  const colW = new Array<number>(cols).fill(0);
  sizes.forEach((sz, i) => {
    const c = i % cols;
    colW[c] = Math.max(colW[c] as number, sz.w);
  });
  const rowH = new Array<number>(rows).fill(0);
  sizes.forEach((sz, i) => {
    const r = Math.floor(i / cols);
    if (sz.h > (rowH[r] as number)) rowH[r] = sz.h;
  });

  // 列/行偏移（前缀和 + gap）
  const colX = new Array<number>(cols).fill(0);
  for (let c = 1; c < cols; c++) colX[c] = (colX[c - 1] as number) + (colW[c - 1] as number) + gap;
  const width = (colX[cols - 1] as number) + (colW[cols - 1] as number);
  const rowY = new Array<number>(rows).fill(0);
  for (let r = 1; r < rows; r++) rowY[r] = (rowY[r - 1] as number) + (rowH[r - 1] as number) + gap;
  const height = (rowY[rows - 1] as number) + (rowH[rows - 1] as number);

  const cx = opts.centerOn?.x ?? 0;
  const cy = opts.centerOn?.y ?? 0;
  const left = cx - width / 2;
  const top = cy - height / 2;

  const placements = sizes.map((sz, i) => {
    const raw = {
      x: left + (colX[i % cols] as number),
      y: top + (rowY[Math.floor(i / cols)] as number),
    };
    const pos = opts.snap ? snapToGrid(raw) : raw;
    return { x: pos.x, y: pos.y, w: sz.w, h: sz.h };
  });

  return { placements, cols, rows, width, height };
}

/**
 * `autoPlace` 的落点（原 29134-29157）—— **不压到已有节点上**
 *
 * 规则（**逐字对齐**）：
 *   · 没有节点 ⇒ `(0,0)`；
 *   · 否则取**最右边界**（`max(x + width)`，缺 `width` 按 **220**）与**最上边界**（`min(y)`），
 *     网格中心 = `(右边界 + gap×2 + 总宽/2, 上边界 + 总高/2)`。
 */
export function autoPlaceCenter(
  nodes: readonly { position?: { x?: number; y?: number } | null; width?: number | null }[],
  gap: number,
  gridWidth: number,
  gridHeight: number,
): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  let right = -Infinity;
  let top = Infinity;
  for (const node of nodes) {
    const x = node.position?.x || 0;
    const y = node.position?.y || 0;
    const w = node.width || 220;
    if (x + w > right) right = x + w;
    if (y < top) top = y;
  }
  const r = Number.isFinite(right) ? right : 0;
  const t = Number.isFinite(top) ? top : 0;
  return { x: r + gap * 2 + gridWidth / 2, y: t + gridHeight / 2 };
}

/**
 * 「大图」判据（原 `i0` 34157-34163）—— 命中 ⇒ 添加前**先弹确认**
 *
 * ⚠️ 与源一致：三个条件是**或**（体积 > 10 MB **或** 任一边 ≥ 4096）。
 */
export function isBigGalleryItem(
  item: { sizeBytes?: number; natW?: number; natH?: number } | null | undefined,
): boolean {
  if (!item) return false;
  return (
    (item.sizeBytes || 0) > GALLERY_BIG_BYTES ||
    (item.natW || 0) >= GALLERY_BIG_SIDE ||
    (item.natH || 0) >= GALLERY_BIG_SIDE
  );
}

/**
 * 尺寸文本（原 `ja` 34173-34179）—— 两者皆空 ⇒ 空串；否则 `W×H`，缺的那个用 `?`
 *
 * ⚠️ 与 `isBigGalleryItem` 同族（画廊条目的展示事实），故同住本模块 —— 画廊面板与
 *   lightbox 共用一处（判据 C1）。
 */
export function galleryItemDims(item: { natW?: number; natH?: number } | null | undefined): string {
  if (!item || (!item.natW && !item.natH)) return '';
  return `${item.natW || '?'}×${item.natH || '?'}`;
}
