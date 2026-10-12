/**
 * 图规则：连线环检测 + referenceOrder 维护（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：
 *   - 环检测 `r$`  —— shared.js:24079-24105
 *   - 连线处理     —— shared.js:26980-27015（`onConnect` 里的纯逻辑部分）
 *   - 文案         —— 「这样连会形成循环引用，已阻止」（27000 附近）
 *
 * ⚠️ 关键语义（**只对 text→text 生效**）：
 *   `r$` 先判 `source`/`target` 是否都是 `text`，不是则**直接放行**（不查环）。
 *   ⇒ 素材/视频/生成节点之间的连线**不做环检测**（原实现如此）。
 */

import type { CanvasNode } from '@/stable/model/node';
import type { CanvasEdge } from '@/stable/model/project';
import { err, ok, type Result } from '@/core/model/result';
// ⚠️ 文本归一（原 `Vk(In(...))`）—— `d3` 的正文清洗与提示词组装共用同一套
import { stripHtml } from '@/lib/text';
import { stripGeneratedArtifacts } from './prompt';
import { CIRCULAR_REF_MESSAGE } from '@/constants/text';

/** 一条待添加的连线 */
export interface ConnectRequest {
  source: string;
  target: string;
}

/** 一条关联文本（原 `d3` 的产物元素） */
export interface LinkedText {
  id: string;
  label: string;
  text: string;
}

/**
 * 收集**指向某节点的关联文本**（原 `d3` 41179-41228）
 *
 * ★ **它是什么**：把「连到本节点的文本框」的正文按顺序收集起来 ——
 *   `jS` 靠它把多个文本框拼成最终提示词（原 `sR`），也是「文本 → 文生视频」这条常见流的实现。
 *
 * 顺序规则（**顺序即语义**）：
 *   ① 取 `edges` 里 `target === nodeId` 的**入边**；
 *   ② 若目标节点的 `data.referenceOrder` 是非空数组 ⇒ 按**源节点在其中出现的下标**排序
 *      （不在里面的记为 `1e9` ⇒ 排到最后）；没有 `referenceOrder` ⇒ 保持 `edges` 的原序；
 *   ③ 源节点**必须是 `text`**（其它类型忽略）；
 *   ④ 正文取 `data.text || data.prompt`，过 `stripHtml` + 去生成痕迹后 trim，**空的丢弃**；
 *   ⑤ 按 `id` **去重**（保留首个）。
 *
 * ⚠️ 与源一致：`referenceOrder` 只影响**排序**，不参与过滤 —— 没连边的文本节点不会被收集。
 */
export function collectLinkedTexts(
  nodeId: string,
  nodes: readonly { id: string; type: string; data?: unknown }[] = [],
  edges: readonly { source: string; target: string }[] = [],
): LinkedText[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = (edges || []).filter((e) => e.target === nodeId);

  const target = byId.get(nodeId);
  const data = (target?.data ?? {}) as Record<string, unknown>;
  const order = Array.isArray(data.referenceOrder) ? (data.referenceOrder as unknown[]) : null;

  let ordered = incoming;
  if (order && order.length) {
    const rank = new Map(order.map((id, i) => [String(id), i]));
    ordered = [...incoming].sort(
      (a, b) => (rank.get(a.source) ?? 1_000_000_000) - (rank.get(b.source) ?? 1_000_000_000),
    );
  }

  const out: LinkedText[] = [];
  for (const e of ordered) {
    const src = byId.get(e.source);
    if (!src || src.type !== 'text') continue;
    const sd = (src.data ?? {}) as Record<string, unknown>;
    const raw = typeof sd.text === 'string' ? sd.text : typeof sd.prompt === 'string' ? sd.prompt : '';
    const body = stripGeneratedArtifacts(stripHtml(raw).trim());
    if (!body) continue;
    out.push({
      id: src.id,
      label: (typeof sd.label === 'string' ? sd.label : typeof sd.name === 'string' ? sd.name : '') || '',
      text: body,
    });
  }

  // ⑤ 按 id 去重（保留首个）—— 原版用 `Set` 的 `add` 返回值做 filter
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

/** 参与「边上插入」定位所需的最小节点形状（只读） */
export interface PositionedNode {
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

/**
 * 在一条边上插入节点时的**落点**（原 `lt` `_Component42.jsx:543-560`）
 *
 * 算法（**逐字对齐**）：
 *   ① 取 `source` / `target` 的**中心**（`position + (width || 200)/2`, `position + (height || 180)/2`）
 *   ② 两端中心取**中点**
 *   ③ 减去新节点自身尺寸的一半 ⇒ 新节点**居中落在中点**
 *
 * ⚠️ 与源一致的两个兜底：任一端**找不到** ⇒ 返回 `{x:0,y:0}`；
 *    节点**没有 width/height** ⇒ 用 `200×180`（源里就是这个魔法值）。
 * ⚠️ 源版只对 `width`/`height`（ReactFlow 量出来的尺寸）取兜底，**不看** `data.w/h`。
 */
export function edgeInsertPosition(
  source: PositionedNode | null | undefined,
  target: PositionedNode | null | undefined,
  size: { w: number; h: number },
): { x: number; y: number } {
  if (!source || !target) return { x: 0, y: 0 };
  const scx = source.position.x + (source.width ?? 200) / 2;
  const scy = source.position.y + (source.height ?? 180) / 2;
  const tcx = target.position.x + (target.width ?? 200) / 2;
  const tcy = target.position.y + (target.height ?? 180) / 2;
  return {
    x: (scx + tcx) / 2 - size.w / 2,
    y: (scy + tcy) / 2 - size.h / 2,
  };
}

/**
 * 环检测（原 `r$` 24079-24105）
 *
 * @returns `true` = 添加 `source → target` **会**成环（应拒绝）
 *
 * 算法：从 `target` 出发沿已有 text→text 边做 DFS；**若能回到 `source`** ⇒ 成环。
 */
export function detectCycle(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  source: string,
  target: string,
): boolean {
  if (!source || !target) return false;
  // 自环
  if (source === target) return true;

  const typeById: Record<string, string> = {};
  for (const n of nodes) typeById[n.id] = n.type;

  // ★ 只对 text→text 查环（原实现如此）
  if (typeById[source] !== 'text' || typeById[target] !== 'text') return false;

  // 只收 text→text 边
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (typeById[e.source] === 'text' && typeById[e.target] === 'text') {
      const list = adj.get(e.source);
      if (list) list.push(e.target);
      else adj.set(e.source, [e.target]);
    }
  }

  const seen = new Set<string>();
  const stack: string[] = [target];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === source) return true;
    if (!seen.has(cur)) {
      seen.add(cur);
      for (const next of adj.get(cur) ?? []) stack.push(next);
    }
  }
  return false;
}

/** 连线的处理结果 */
export interface ConnectOutcome {
  /** 更新后的节点（仅 `target.data.referenceOrder` 变化） */
  nodes: CanvasNode[];
  /** 要新增的边 */
  edge: CanvasEdge;
}

/**
 * 处理一条新连线（原 `onConnect` 的纯逻辑部分 26980-27015）
 *
 * 步骤：
 *   1. 找 `target` 节点
 *   2. 若 source/target **都是 text** → 查环；成环 ⇒ 返回错误（调用方弹 toast）
 *   3. 若 `target.data.referenceOrder` 不含 source → 追加
 *   4. 返回新边
 *
 * ⚠️ 不可变：不改入参
 * ⚠️ `createEdge` 由调用方注入（需要 id 生成，属副作用）
 */
export function applyConnection(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  conn: ConnectRequest,
  createEdge: (conn: ConnectRequest) => CanvasEdge,
): Result<ConnectOutcome> {
  const target = nodes.find((n) => n.id === conn.target);
  const source = nodes.find((n) => n.id === conn.source);

  if (!target || !source) {
    return err('unknown', `连线端点不存在：source=${conn.source} target=${conn.target}`);
  }

  // 两个都是 text 才查环
  if (source.type === 'text' && target.type === 'text') {
    if (detectCycle(nodes, edges, conn.source, conn.target)) {
      // ★ 文案来自 constants（SSOT），规则层不硬编码
      return err('unknown', CIRCULAR_REF_MESSAGE);
    }

    const existing = Array.isArray(target.data.referenceOrder) ? target.data.referenceOrder : [];
    if (!existing.includes(conn.source)) {
      const nextOrder = [...existing, conn.source];
      const nextNodes = nodes.map((n) =>
        n.id === conn.target
          ? ({ ...n, data: { ...n.data, referenceOrder: nextOrder } } as CanvasNode)
          : n,
      );
      return ok({ nodes: nextNodes, edge: createEdge(conn) });
    }
    // 已存在 → 只加边，不动 referenceOrder
    return ok({ nodes: [...nodes], edge: createEdge(conn) });
  }

  return ok({ nodes: [...nodes], edge: createEdge(conn) });
}

/**
 * 移除一条边后，清理 `referenceOrder`（原实现未显式处理；这里补上以免残留悬空引用）
 *
 * ⚠️ 这是**行为增强**，非原实现等价物 —— 已记入 `09-校验记录` 的差异说明。
 */
export function detachConnection(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  edge: CanvasEdge,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nextEdges = edges.filter((e) => e.id !== edge.id);
  const nextNodes = nodes.map((n) => {
    if (n.id !== edge.target || n.type !== 'text') return n;
    const order = Array.isArray(n.data.referenceOrder) ? n.data.referenceOrder : [];
    if (!order.includes(edge.source)) return n;
    return {
      ...n,
      data: { ...n.data, referenceOrder: order.filter((id) => id !== edge.source) },
    } as CanvasNode;
  });
  return { nodes: nextNodes, edges: nextEdges };
}

// ─────────────────────────────────────────────────────────────────────────────
// 批量连线（原 `connectBatch` 27054-27069 · `connectManyToTarget` 27070-27094）
//
// 两个入口共用同一份「逐条造边 + 去重追加」内核算 —— 判据 C1：源里这两段的差异
// **只在守卫**（目标在不在 / 要不要剔自己），append 那半步逐字相同（都走 `Mr` + `yo`）。
// ─────────────────────────────────────────────────────────────────────────────

/** 批量连线的规划结果 */
export interface ConnectManyPlan {
  /** 要追加的边（**已去重**；可能为空） */
  edges: CanvasEdge[];
}

/**
 * 批量连线的公共内核（源 `Mr` + `yo`/`uA` 的 addEdge 语义）
 *
 * 逐条规则（**全部对源**）：
 *   ① `source`/`target` 任一为空 ⇒ **跳过该条**（源 `uA:17026`）；
 *   ② 已存在**同 source+target** 的边 ⇒ **跳过**（源 `cA:17019-17023` 的**无 handle** 形态
 *      —— 本仓 `CanvasEdge` 没有 handle 字段，故只比 source/target）；
 *   ③ 其余 ⇒ `createEdge({source, target})` 收进结果。
 *
 * ⚠️ **不查环**（源这两个函数走的是 `Mr` 裸工厂，不过 `onConnect` 的环检测）—— 照抄，
 *    不擅自"修"（群连线一次连一片，环检测的代价与语义都与单条不同）。
 * ⚠️ **不动 `referenceOrder`**（同上：那条链路只在 `onConnect` 里）。
 */
function planAppendEdges(
  edges: readonly CanvasEdge[],
  sourceIds: readonly string[],
  targetId: string,
  createEdge: (conn: ConnectRequest) => CanvasEdge,
): ConnectManyPlan {
  const existing = new Set(edges.map((e) => `${e.source}\u0000${e.target}`));
  const added: CanvasEdge[] = [];
  for (const source of sourceIds) {
    if (!source || !targetId) continue; // ①
    const key = `${source}\u0000${targetId}`;
    if (existing.has(key)) continue; // ②
    existing.add(key);
    added.push(createEdge({ source, target: targetId })); // ③
  }
  return { edges: added };
}

/**
 * **多选拖拽连线**（原 `connectBatch(n, r)` 27054-27069）—— `onConnect` 的多选 material 分支
 *
 * 与 `planConnectManyToTarget` 的**唯一差别**：本函数**不做任何守卫** ——
 * 不查目标在不在、不剔自己（源如此：调用方 `_Component42.jsx:638-650` 已先滤好）。
 * @param sourceIds 来源节点 id（调用方已保证非空、且不含 target）
 */
export function planConnectBatch(
  edges: readonly CanvasEdge[],
  sourceIds: readonly string[],
  targetId: string,
  createEdge: (conn: ConnectRequest) => CanvasEdge,
): ConnectManyPlan {
  return planAppendEdges(edges, sourceIds, targetId, createEdge);
}

/**
 * **群锚点批量连线**（原 `connectManyToTarget(n, r)` 27070-27094）—— `_Component37` 的两条落点
 *
 * 逐行对源：
 *   ① 目标节点**不在** `nodes` 里 ⇒ **整个不干**（源 `27071-27075` 的 early return）；
 *   ② 滤掉 `sourceIds` 里**等于目标**的（源 `27076-27078`；自环无意义）；
 *   ③ 滤完**空了** ⇒ 也不干（源 `27079` 的 `length !== 0` 守卫）；
 *   ④ 其余走公共内核逐条追加。
 * @returns `null` = 三条守卫任一命中（**什么都不做**，调用方据此不 commit）
 */
export function planConnectManyToTarget(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  sourceIds: readonly string[],
  targetId: string,
  createEdge: (conn: ConnectRequest) => CanvasEdge,
): ConnectManyPlan | null {
  // ① 目标必须在（源用 `t().nodes.find(...)`）
  if (!nodes.some((n) => n.id === targetId)) return null;
  // ② 剔自己（源 `filter(a => a !== r)`）
  const sources = (sourceIds || []).filter((id) => id !== targetId);
  // ③ 空 ⇒ 不干
  if (sources.length === 0) return null;
  return planAppendEdges(edges, sources, targetId, createEdge);
}
