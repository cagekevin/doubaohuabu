/**
 * 账号节点（`type: 'account'`）的**输入收集**（★ 纯函数，必测）—— 原 `RL` shared.js:40531-40680
 *
 * ★★ **它是什么**：账号节点是**「填表」节点** —— 把**上游**（沿入边可达）的文本框与
 *    `@` 引用素材汇总起来，一次性塞进该账号的对话框（原 `OL.jsx:498-501` 的按钮 `title`：
 *    「同步比例/时长/模型，并把文本框与素材填入所选账号对话框（**不触发发送**）」）。
 *    可选 `autoSend` 会连发送一起做（原 `OL.jsx:348` 的 `autoClicked`）。
 *
 * ★ **为什么要移植它**：`buildAccountNodePayload`（原 `$L`）**只有测试调用、零运行时消费者**，
 *   而 `OL.jsx` 的 `x = RL(state, nodeId)` 正是 `$L` 的**入参来源** —— 少了它，
 *   `$L` 永远拿不到 `{texts, materials, params}`。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 上游闭包 | `40537-40546` | 从本节点沿**入边反向**收集**全部祖先**（不是只有直接前驱） |
 *   | 拓扑排序 | `40547-40587` | Kahn；入度 0 的按**节点在 `nodes` 数组里的下标**排（≈ 视觉顺序）；**有环的残余追加在末尾** |
 *   | 引用编号 | `40591-40599` | 全局递增计数器（**跨所有上游文本共用一个编号空间**） |
 *   | 素材解析 | `40588-40623` | 先查资源库，再查 `material` 节点（形状与 `resolveRefMaterial` 的①②级一致，但**只有这两级**） |
 *   | texts | `40624-40645` | 只取 `text` 节点；每条的正文过 `resolveReferences`（原 `Qc`）；带上该节点的 `aspectRatio`/`duration`/`model` 默认值 |
 *   | materials | `40646-40657` | **来源于上游文本里的 `@` 引用**（不是连线上的素材节点）；按编号排序 |
 *   | params | `40658-40673` | 逐条 texts 取**首个非空**的 `aspectRatio`/`duration`/`model` |
 *   | total | `40678` | `materials.length + texts.length`（**`OL.jsx:302` 用它判「未连接文本框或素材」**） |
 *
 * ⚠️ 与 `collectLinkedTexts`（原 `d3`）**不是一回事**：那个只看**直接入边**、且不含引用素材。
 */

import type { LibraryItem } from '@/stable/model/project';
import { parseRefChips, refsToReferenceLabels } from './refs';
import { stripHtml } from '@/lib/text';

/** 上游文本的一条（原 `RL` 的 `y` 元素） */
export interface AccountNodeText {
  id: string;
  /** **原文**（含 `@[id|名]` 标记）—— `$L` 会再解析一次（原 `$L` 的 `n.forEach(d => In(d.rawText))`） */
  rawText: string;
  /** 已把引用解析成 `参考图N` 的正文 */
  text: string;
  aspectRatio: string;
  duration: number;
  model: string;
  /** `refId → 全局编号`（供 `$L` 用） */
  refMap: Record<string, number>;
}

/** 一条被引用到的素材（原 `RL` 的 `b` 元素） */
export interface AccountNodeMaterial {
  id: string;
  label: string;
  dataUrl: string;
  /** 全局编号（1 起）—— 素材列表按它排序 */
  refIndex: number;
}

export interface AccountNodeInputs {
  materials: AccountNodeMaterial[];
  texts: AccountNodeText[];
  /** 各文本的**首个非空**参数（原 40658-40673） */
  params: { aspectRatio: string | null; duration: number | null; model: string | null };
  /** `materials.length + texts.length`（原 40678） */
  total: number;
}

/** 本模块只读节点的这几个字段（保持入参最小） */
interface NodeLike {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 上游闭包 + 拓扑序（原 `RL` 40537-40587）
 *
 * ⚠️ **闭包是传递的**（沿入边一直往上走），不是只有直接前驱 —— 与 `collectLinkedTexts` 不同。
 * ⚠️ 拓扑序里，**入度为 0 的那批按 `nodes` 数组下标排**（原 40560-40567 的 `u`）——
 *    那是"画布上的视觉顺序"，不是字母序。
 * ⚠️ 有环时：`f.length < a.length` ⇒ 把**没排进去的按原顺序追加**（原 40581-40587）——
 *    **不报错、不丢节点**（有环图的输入仍然全部参与收集）。
 */
export function collectUpstreamOrder(
  nodeId: string,
  nodes: readonly NodeLike[] = [],
  edges: readonly { source: string; target: string }[] = [],
): string[] {
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const e of edges || []) {
      if (e.target === cur && !seen.has(e.source)) {
        seen.add(e.source);
        stack.push(e.source);
      }
    }
  }
  const all = [...seen];

  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
  const inDegree = new Map(all.map((k) => [k, 0]));
  const next = new Map(all.map((k) => [k, [] as string[]]));
  for (const e of edges || []) {
    if (seen.has(e.source) && seen.has(e.target)) {
      next.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
  }

  const ready = all
    .filter((k) => inDegree.get(k) === 0)
    .sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
  const order: string[] = [];
  while (ready.length) {
    const k = ready.shift() as string;
    order.push(k);
    for (const c of (next.get(k) ?? []).slice().sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0))) {
      inDegree.set(c, (inDegree.get(c) ?? 0) - 1);
      if (inDegree.get(c) === 0) ready.push(c);
    }
  }
  if (order.length < all.length) {
    for (const k of all) if (!order.includes(k)) order.push(k);
  }
  return order;
}

/**
 * 收集账号节点的输入（原 `RL` 40531-40680）
 *
 * @param input.nodes / edges / library 都是只读快照（调用方从 store 取）
 */
export function collectAccountNodeInputs(input: {
  nodeId: string;
  nodes?: readonly NodeLike[];
  edges?: readonly { source: string; target: string }[];
  library?: readonly LibraryItem[];
}): AccountNodeInputs {
  const nodes = input.nodes ?? [];
  const edges = input.edges ?? [];
  const library = input.library ?? [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const libById = new Map(library.map((l) => [l.id, l]));

  const order = collectUpstreamOrder(input.nodeId, nodes, edges);

  // 原 40591-40599：**全局**引用编号（跨所有上游文本共用一个计数器）
  const refIndex = new Map<string, number>();
  let seq = 0;
  const assign = (id: string): number => {
    const hit = refIndex.get(id);
    if (hit !== undefined) return hit;
    seq += 1;
    refIndex.set(id, seq);
    return seq;
  };

  // 原 40588-40623：素材解析（**只有**资源库 + `material` 节点两级）
  const resolveMaterial = (id: string): AccountNodeMaterial => {
    const lib = libById.get(id);
    if (lib) return { id, label: lib.name || id, dataUrl: lib.dataUrl || '', refIndex: 0 };
    const n = byId.get(id);
    if (n && n.type === 'material' && n.data) {
      const d = n.data;
      return { id, label: str(d.label) || str(d.name) || id, dataUrl: str(d.dataUrl), refIndex: 0 };
    }
    return { id, label: id, dataUrl: '', refIndex: 0 };
  };

  const texts: AccountNodeText[] = [];
  for (const id of order) {
    const n = byId.get(id);
    const d = n?.data;
    if (!n || !d || n.type !== 'text') continue;

    const rawText = str(d.text);
    // 原 40628-40632：逐条把引用登记进**全局**编号表
    const parsed = parseRefChips(stripHtml(rawText));
    const refMap: Record<string, number> = {};
    for (const r of parsed.refs) refMap[r.id] = assign(r.id);
    const labelled = refsToReferenceLabels(parsed.text, parsed.refs);

    texts.push({
      id,
      rawText,
      text: labelled.body.trim(),
      aspectRatio: str(d.aspectRatio) || '16:9',
      duration: typeof d.duration === 'number' ? d.duration : 7,
      model: str(d.model) || 'seedance-2.0-mini',
      refMap,
    });
  }

  const materials: AccountNodeMaterial[] = [...refIndex.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id, n]) => ({ ...resolveMaterial(id), refIndex: n }));

  // 原 40658-40673：逐条取**首个非空**
  const params: AccountNodeInputs['params'] = { aspectRatio: null, duration: null, model: null };
  for (const t of texts) {
    if (params.aspectRatio == null && t.aspectRatio) params.aspectRatio = t.aspectRatio;
    if (params.duration == null && t.duration != null) params.duration = t.duration;
    if (params.model == null && t.model) params.model = t.model;
  }

  return { materials, texts, params, total: materials.length + texts.length };
}
