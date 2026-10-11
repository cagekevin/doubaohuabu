/**
 * 批量发送的**目标清单与顺序**（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**，两个函数在源里相邻：41551 与 41574）：
 *   - `v3` shared.js:41551-41573 —— 节点的**显示名**
 *   - `$p` shared.js:41574-41610 —— 批量目标 + **按画布视觉顺序**排
 *   - `y3` shared.js:41550 = 120 —— 行归并容差（px）
 *
 * ★ **为什么顺序重要**（源版的设计意图）：用户是按画布上**从上到下、每行从左到右**
 *   布置节点的，批量发送的顺序必须与这个**视觉阅读顺序**一致 —— 否则"第 3 个失败"
 *   与用户看到的第 3 个不是同一个。
 *
 * ⚠️ 只收 `text` / `genvideo` 两类（源版硬编码的两类"要发送的节点"）。
 * ⚠️ 原则 4：不碰时间/随机；`stripHtml` 是无状态工具（`lib`，L0）。
 */

import type { CanvasNode } from '@/stable/model/node';
import { GEN_VIDEO_LABEL, TEXT_NODE_LABEL } from '@/stable/model/node';
import { stripHtml } from '@/lib/text';

/**
 * 行归并容差（px，原 `y3` = 120）
 *
 * ⚠️ 语义：`|y1 - y2| <= 120` 视为**同一行**。改这个值会改变批量顺序 ⇒ 属行为常量。
 */
export const BATCH_ROW_TOLERANCE = 120;

/** 可批量发送的节点类型（原 `$p` 的 `type === 'text' || type === 'genvideo'`） */
export const BATCH_SENDABLE_TYPES: readonly string[] = ['text', 'genvideo'];

/** 显示名的截断长度（原 `v3` 的 `slice(0, 18)`） */
const NAME_MAX = 18;

/**
 * 节点的显示名（原 `v3` 41551）
 *
 * 四级（**顺序即语义**，逐字对齐）：
 *   ① `data.label || data.name` 且**不等于** `文生视频` ⇒ 直接用（`String()` 归一）
 *   ② `genvideo` ⇒ 取 `data.text` 的归一文本前 18 字；空 ⇒ `文生视频`
 *   ③ 只剩 `label === '文生视频'` 的情况 ⇒ 仍返回它（源版这里有个**看起来冗余**的分支）
 *   ④ 其余（文本节点）⇒ `data.text` 归一前 18 字；空 ⇒ `文本框`
 *
 * ⚠️ 归一用的是 `stripHtml`（原 `In` 24036：**解 HTML 实体 + 剥标签**，最多 10 轮）——
 *    因为 `data.text` 里可能带 `@[...]` 引用与富文本残留。
 */
/**
 * 「能给出显示名」的节点形状（`TD-16-104`）。
 *
 * 调用方 `core/usecases/sendQueue` 传的本来就是 `CanvasNode`，却在这一层被擦成 `unknown`
 * ⇒ 下游只能靠 `as` ＋ `?? ''` 各自兜。现在按**真实可读字段**声明。
 *
 * ⚠️ 三字段**各自可选**是**类型层的真相**（`VideoNodeData` 没有 `name`/`text`；
 *    `AccountNodeData` 三个都没有），**不是**"数据可能缺失" —— 故下面的 `?? ''` 是必要的，
 *    它兜的是「**这个节点类型没有这个字段**」，不是「字段丢了」。
 */
export interface NameableNode {
  type: string;
  /** ⚠️ `& Record<string, unknown>` 不是装饰：`NodeDataBase` 带索引签名（`[k: string]: unknown`），
   *  而 TS 对"所有属性都可选"的目标类型有**弱类型检测**（源须至少有一个共同属性）——
   *  不加它，`AccountNodeData`（三字段都没有）会被拒。 */
  data: { label?: string; name?: string; text?: string } & Record<string, unknown>;
}

export function nodeDisplayName(node: NameableNode): string {
  const data = node.data;
  const raw = data.label || data.name;

  // ①
  if (raw && raw !== GEN_VIDEO_LABEL) return String(raw);

  // ②
  if (node.type === 'genvideo') {
    const text = stripHtml(data.text ?? '').trim();
    return text ? text.slice(0, NAME_MAX) : GEN_VIDEO_LABEL;
  }

  // ③（`raw === GEN_VIDEO_LABEL` 的兜底：源版就是原样返回它）
  if (raw) return String(raw);

  // ④
  const text = stripHtml(data.text ?? '').trim();
  return text ? text.slice(0, NAME_MAX) : TEXT_NODE_LABEL;
}

/** 一个批量发送目标（原 `$p` 的元素：`{nodeId, x, y, name}`） */
export interface BatchTarget {
  nodeId: string;
  x: number;
  y: number;
  name: string;
}

/**
 * 收集批量目标并**按视觉顺序**排好（原 `$p` 41574）
 *
 * 算法（**三步，顺序即语义**）：
 *   ① 取 `text`/`genvideo` 节点 → `{nodeId, x, y, name}`
 *   ② 先按 `y` 再按 `x` 全排序
 *   ③ 按 `y` **归并成行**（容差 `BATCH_ROW_TOLERANCE`），每行内按 `x` 排序，再按行扁平化
 *
 * ⚠️ 第 ③ 步的"行"是**按首次出现的 y 顺序**累积的（不重新按 y 排序）——
 *    因为第 ② 步已经排过，所以等价；照抄这个结构以免引入顺序差异。
 */
export function orderBatchTargets(
  nodes: readonly (NameableNode & { id: string; position: { x: number; y: number } })[],
): BatchTarget[] {
  const items: BatchTarget[] = [];
  for (const n of nodes) {
    if (!BATCH_SENDABLE_TYPES.includes(n.type)) continue;
    items.push({
      nodeId: n.id,
      x: n.position.x || 0,
      y: n.position.y || 0,
      name: nodeDisplayName(n),
    });
  }

  items.sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: Array<{ y: number; items: BatchTarget[] }> = [];
  for (const it of items) {
    const row = rows.find((r) => Math.abs(it.y - r.y) <= BATCH_ROW_TOLERANCE);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);

  return rows.flatMap((r) => r.items);
}

/** 便捷：直接从 `CanvasNode[]` 取 —— `CanvasNode` **本就满足** `orderBatchTargets` 的入参形状
 *  （`TD-16-104`：原先那层手工投影是为绕开 `data: unknown` 而存在的，收窄后已多余） */
export const orderBatchTargetsOf = (nodes: readonly CanvasNode[]): BatchTarget[] =>
  orderBatchTargets(nodes);
