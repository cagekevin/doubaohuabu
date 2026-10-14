import { asRecord } from '@/lib/object';
/**
 * 节点整齐排列（对齐 / 等间距 / 智能网格）—— **纯函数**（★ 必测）
 *
 * 依据（**逐行回源**）：`arrangeNodes` shared.js:31650-31844。
 *
 * ★ **为什么这一层必须纯**：它全是几何（绝对坐标 → 包围盒 → 新坐标 → 换回相对坐标），
 *   而 `commit('arrange')`（撤销快照）与 `set` 是 state 的事（原则 1）⇒ 这里只**返回新节点数组**。
 *
 * ⚠️ **复用 `group.ts` 的两个几何助手**（判据 C1）：本模块的 `o(w)`/`a(w)` 与
 *   `groupSelectedNodes` 里的 `s(x)`/`o(x)` **逐字相同**（`width ?? measured.width ?? 200`
 *   与「只加一层父偏移」）⇒ 直接 import `groupBoxOf` / `absolutePositionOf`，不复制第二份。
 */

import { absolutePositionOf, groupBoxOf, type GroupNodeLike } from './group';

/**
 * 排列模式（原 `n`：`_Component42.jsx:1508-1553` 的菜单项，与 `arrangeNodes` 的分支一一对应）
 *
 * ⚠️ 顺序与源版菜单一致：`smart` → 水平 `left`/`hcenter`/`right`/`hdist` → 垂直 `top`/`vcenter`/`bottom`/`vdist`。
 */
export type ArrangeMode =
  | 'smart'
  | 'left'
  | 'hcenter'
  | 'right'
  | 'hdist'
  | 'top'
  | 'vcenter'
  | 'bottom'
  | 'vdist';

/** 本模块只读边的这两端（按结构收 —— `CanvasEdge` 是更宽的联合） */
export interface ArrangeEdgeLike {
  source: string;
  target: string;
}

export type ArrangeResult<T extends GroupNodeLike = GroupNodeLike> =
  | { ok: true; nodes: T[]; count: number }
  | { ok: false; reason: 'need-2' | 'unknown-mode' };

/** 一个被排列节点的**绝对**几何（原 `l` 的元素） */
interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 计算排列后的节点数组（原 `arrangeNodes` 31650-31844）
 *
 * ⚠️ **入参 `mode` 故意放宽成 `string`**（原版是 JS，无类型）：这样 `unknown-mode` 这条守卫
 *   **是活的、可测的**（调用方传进来一个不认识的模式）。类型安全留在**调用边界**（`state` 的
 *   `arrangeNodes(mode: ArrangeMode)`）—— 不必为"永远走不到的分支"写假断言。
 *
 * @returns 成功 ⇒ `{ok:true, nodes, count}`（`nodes` 里**未选中的节点保持原引用**）；
 *          少于 2 个非组节点 ⇒ `need-2`；模式不认识 ⇒ `unknown-mode`。
 */
export function planArrange<T extends GroupNodeLike>(
  nodes: readonly T[],
  edges: readonly ArrangeEdgeLike[],
  mode: string,
): ArrangeResult<T> {
  // ① 取 `selected && type !== 'group'`（组不参与排列）；少于 2 个 ⇒ need-2（原 31652-31660）
  const picked = nodes.filter((n) => n.selected && n.type !== 'group');
  if (picked.length < 2) return { ok: false, reason: 'need-2' };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boxes: Box[] = picked.map((n) => {
    const { w, h } = groupBoxOf(n);
    const p = absolutePositionOf(n, byId);
    return { id: n.id, x: p.x, y: p.y, w, h };
  });

  // ② 包围盒（原 31703-31722）
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const box = {
    minX,
    minY,
    maxX,
    maxY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };

  // ③ 新坐标（**绝对**）—— `place` 即原版的 `m(id, x, y)`（原 31723-31729）
  const positions: Record<string, { x: number; y: number }> = {};
  const place = (id: string, x: number, y: number): void => {
    positions[id] = { x, y };
  };

  if (mode === 'smart') {
    // 原 31730-31768：列数 = `round(sqrt(节点数 × 宽高比))`；**顺序**先按选中集内部的边
    // （源→靶，边序）、再把没连边的按选中顺序追加在后面
    const n = boxes.length;
    const cols = Math.max(1, Math.round(Math.sqrt((n * box.w) / (box.h || 1)) || 1));
    const rows = Math.ceil(n / cols);
    const cellW = box.w / cols;
    const cellH = box.h / rows;
    const ids = new Set(picked.map((x) => x.id));
    const inner = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const order: string[] = [];
    const seen = new Set<string>();
    for (const e of inner) {
      if (!seen.has(e.source)) {
        order.push(e.source);
        seen.add(e.source);
      }
      if (!seen.has(e.target)) {
        order.push(e.target);
        seen.add(e.target);
      }
    }
    for (const x of picked) {
      if (!seen.has(x.id)) {
        order.push(x.id);
        seen.add(x.id);
      }
    }
    order
      .map((id) => boxes.find((b) => b.id === id))
      .filter((b): b is Box => b !== undefined)
      .forEach((b, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        place(b.id, box.minX + col * cellW + (cellW - b.w) / 2, box.minY + row * cellH + (cellH - b.h) / 2);
      });
  } else if (mode === 'left' || mode === 'right' || mode === 'hcenter') {
    for (const b of boxes) {
      const x = mode === 'left' ? box.minX : mode === 'right' ? box.maxX - b.w : box.cx - b.w / 2;
      place(b.id, x, b.y);
    }
  } else if (mode === 'top' || mode === 'bottom' || mode === 'vcenter') {
    for (const b of boxes) {
      const y = mode === 'top' ? box.minY : mode === 'bottom' ? box.maxY - b.h : box.cy - b.h / 2;
      place(b.id, b.x, y);
    }
  } else if (mode === 'hdist') {
    // 原 31779-31791：按 x 升序；间距 = `max((包围盒宽 - Σ宽) / (个数-1), 0)`（**不足则压成 0**）
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    const total = sorted.reduce((s, b) => s + b.w, 0);
    const gap = Math.max((box.w - total) / (sorted.length - 1), 0);
    let cursor = box.minX;
    for (const b of sorted) {
      place(b.id, cursor, b.y);
      cursor += b.w + gap;
    }
  } else if (mode === 'vdist') {
    // 原 31792-31804：同上，改 y 与高
    const sorted = [...boxes].sort((a, b) => a.y - b.y);
    const total = sorted.reduce((s, b) => s + b.h, 0);
    const gap = Math.max((box.h - total) / (sorted.length - 1), 0);
    let cursor = box.minY;
    for (const b of sorted) {
      place(b.id, b.x, cursor);
      cursor += b.h + gap;
    }
  } else {
    return { ok: false, reason: 'unknown-mode' };
  }

  // ④ 落回节点：**带 `parentId` 的换回相对坐标**（原 31813-31837）—— 未命中的节点原样返回
  const next: T[] = nodes.map((node) => {
    const v = positions[node.id];
    if (!v) return node;
    if (!node.parentId) return { ...node, position: { x: v.x, y: v.y } };
    const parent = byId.get(node.parentId);
    const px = parent?.position.x || 0;
    const py = parent?.position.y || 0;
    return { ...node, position: { x: v.x - px, y: v.y - py } };
  });

  return { ok: true, nodes: next, count: picked.length };
}

// ── 选中节点的**网格排布**（原 `arrangeSelectedNodes`，`shared.js:29635-29694`）──────────
//
// ⚠️ 与上面那组 9 个对齐/分布模式**不是同一件事**：源里右键菜单的「自动排列（整理所选节点）」
//    是**另写的一个网格排布**（列数 = `ceil(sqrt(n))`、列距 = 最宽 + gap、行距 = 最高 + gap、
//    锚在选中节点的**最小 x/y** 上），与本文件的 9 模式**共用不了** ⇒ 逐字另落（不合并）。

/** 一个节点的**量测尺寸**（原 `o`，`29646-29655`：`measured → width/height → style → data.w/h → 兜底`） */
export interface ArrangeSizeLike {
  id: string;
  selected?: boolean;
  parentId?: string | null;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  measured?: { width?: number | null; height?: number | null } | null;
  style?: { width?: unknown; height?: unknown } | null;
  /** ⚠️ 各节点自己的 `data` 形状 ⇒ 收敛成 `unknown`，在 `arrangeNodeSize` 里用 `asRecord` 取 */
  data?: unknown;
}

/** 量一个节点的尺寸（原 `o`，`29646-29655`，**顺序即兜底链**） */
export function arrangeNodeSize(w: ArrangeSizeLike): { w: number; h: number } {
  const d = asRecord(w.data);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const width =
    num(w.measured?.width ?? null) ?? num(w.width ?? null) ?? num(w.style?.width ?? null) ?? num(d.w ?? null) ?? 200;
  const height =
    num(w.measured?.height ?? null) ?? num(w.height ?? null) ?? num(w.style?.height ?? null) ?? num(d.h ?? null) ?? 160;
  return { w: width, h: height };
}

/** 网格排布计划：`节点 id → 新位置` */
export type SelectedGridPlan = Map<string, { x: number; y: number }>;

/**
 * 选中节点的**网格排布**计划（原 `arrangeSelectedNodes` 的纯半）
 *
 * 源（逐行）：
 *   `s = nodes.filter(w => w.selected && !w.parentId)`（⚠️ **组内子节点不参与**，跟父走）；
 *   `if (s.length < 2) return;`（**1 个或 0 个 ⇒ 不排**）；
 *   锚点 = 选中节点的 **`min(x)` / `min(y)`**；列数 = `ceil(sqrt(n))`；
 *   列距 = **最宽** + `gap`、行距 = **最高** + `gap`；
 *   第 `i` 个 ⇒ `x = minX + (i % cols) * 列距`、`y = minY + floor(i / cols) * 行距`。
 *
 * @returns `null` = **不排**（选中少于 2 个；源直接 `return`，什么都不做）
 */
export function planSelectedGrid(
  nodes: readonly ArrangeSizeLike[],
  gap = 16,
): SelectedGridPlan | null {
  const picked = nodes.filter((n) => n.selected && !n.parentId);
  if (picked.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxW = 0;
  let maxH = 0;
  for (const n of picked) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    const size = arrangeNodeSize(n);
    maxW = Math.max(maxW, size.w);
    maxH = Math.max(maxH, size.h);
  }
  const cols = Math.ceil(Math.sqrt(picked.length));
  const pitchX = maxW + gap;
  const pitchY = maxH + gap;
  const plan: SelectedGridPlan = new Map();
  picked.forEach((n, i) => {
    plan.set(n.id, { x: minX + (i % cols) * pitchX, y: minY + Math.floor(i / cols) * pitchY });
  });
  return plan;
}
