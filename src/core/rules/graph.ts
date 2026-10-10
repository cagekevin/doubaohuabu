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
import { CIRCULAR_REF_MESSAGE } from '@/constants/text';

/** 一条待添加的连线 */
export interface ConnectRequest {
  source: string;
  target: string;
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
