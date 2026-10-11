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

export type ArrangeResult =
  | { ok: true; nodes: GroupNodeLike[]; count: number }
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
export function planArrange(
  nodes: readonly GroupNodeLike[],
  edges: readonly ArrangeEdgeLike[],
  mode: string,
): ArrangeResult {
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
  const next = nodes.map((node) => {
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
