/**
 * 画布「复制 / 粘贴节点」（原 `copyNodes` / `pasteNodes`，`shared.js:32041-32236`）
 *
 * 依据（**逐行回源抄录**）：
 *   | 件 | 源 | 行 | 语义 |
 *   | - | - | - | - |
 *   | `collectCopyIds` | `copyNodes` 前半 | 32042-32063 | 选中节点 + **其子孙**（`parentId` 闭包） |
 *   | `buildClipboard` | `copyNodes` 后半 | 32064-32073 | 深拷贝节点 + **只留两端都在选中的边** |
 *   | `planPaste` | `pasteNodes` | 32075-32235 | 重编 id / 位置 / 引用重写 / 反选既有 |
 *
 * ⚠️ **四个逐字细节**（都是"看着像 bug 但源如此"）：
 *   ① **新 id 只分三档前缀**：`material → m` / `text → t` / **其余一律 `a`**
 *      （源 `Pt(v.type === 'material' ? 'm' : v.type === 'text' ? 't' : 'a')`）——
 *      所以粘贴出来的 `imggen` / `genvideo` 节点**挂着 `a_` 前缀**。逐字保留。
 *   ② **子节点不参与偏移**：有 `parentId` 且父也在剪贴板里 ⇒ 位置原样（父已经整体平移过了）；
 *      否则 `+dx/+dy`。
 *   ③ **粘贴位置**：给了落点 ⇒ 让剪贴板**外接框中心**落到落点；没给 ⇒ **固定 `+50/+50`**。
 *   ④ **既有节点全部反选**：源把 `r.nodes` 统统 `selected: false` 后再拼上新节点（新节点 `selected: true`）。
 *
 * ⚠️ **新边的 `style` / `markerEnd` 不在这里**：源在 `pasteNodes` 里**硬编码**
 *    `stroke: '#6366f1'` + `arrowclosed`（`32219-32228`）—— 本仓由 `state` 注入的 `deps.makeEdge`
 *    统一给（**同一个真源**，见 `state/store.ts` 的 `EDGE_STYLE`/`EDGE_MARKER`）⇒ 这里只产出
 *    `{source, target}` **对**，让调用方走既有工厂（既不重复魔法色值，也保证与新连线的观感一致）。
 *
 * 归属：纯数据变换（无 `window` / 时间 / 随机 —— id 由调用方注入）⇒ `core`（原则 4）。
 */

import { asRecord } from '@/lib/object';
import { createRefChipRe } from './refs';
import type { CanvasEdge } from '@/stable/model/project';
import type { CanvasNode } from '@/stable/model/node';

/** 剪贴板载荷（原 `clipboard`：`{nodes, edges}`） */
export interface ClipboardPayload {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** 粘贴时新 id 的**三档**类别（原 `Pt` 的三个实参 —— 见文件头 ⚠️①） */
export type PasteIdKind = 'material' | 'text' | 'account';

/** 节点绝对位置（含 `parentId` 相对偏移；原 `d`，`32105-32117`） */
function absolutePosition(
  node: CanvasNode,
  clipboardById: Map<string, CanvasNode>,
  existing: readonly CanvasNode[],
): { x: number; y: number } {
  if (!node.parentId) return { x: node.position.x, y: node.position.y };
  const parent = clipboardById.get(node.parentId) ?? existing.find((n) => n.id === node.parentId);
  if (!parent) return { x: node.position.x, y: node.position.y };
  const p = absolutePosition(parent, clipboardById, existing);
  return { x: p.x + node.position.x, y: p.y + node.position.y };
}

/**
 * 复制范围：**选中的节点 + 其子孙**（原 `copyNodes` 的 `while (a)` 闭包，`32049-32063`）
 *
 * 源用一个"跑到不再变大为止"的循环展开 `parentId` 后代（**不假设树深**）。
 *
 * @returns 节点 id（顺序 = 先选中的、再按发现顺序补后代）；**没有选中 ⇒ 空数组**
 */
export function collectCopyIds(nodes: readonly CanvasNode[]): string[] {
  const selected = nodes.filter((n) => n.selected);
  const ids = new Set(selected.map((n) => n.id));
  const out: string[] = selected.map((n) => n.id);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        out.push(n.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * 复制载荷（原 `copyNodes` 的写侧，`32064-32073`）
 *
 * @returns `null` = **没有选中任何节点**（源此时**直接 `return`，不覆盖已有剪贴板**）
 */
export function buildClipboard(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): ClipboardPayload | null {
  const ids = new Set(collectCopyIds(nodes));
  if (ids.size === 0) return null;
  return {
    nodes: structuredClone(nodes.filter((n) => ids.has(n.id))),
    // ⚠️ 只留**两端都在选中集合里**的边（原 `s.has(u.source) && s.has(u.target)`）
    edges: structuredClone(edges.filter((e) => ids.has(e.source) && ids.has(e.target))),
  };
}

/** `planPaste` 的产物 */
export interface PastePlan {
  /** **完整的**新 `nodes` 数组（既有节点已反选 + 粘贴节点 `selected: true`） */
  nodes: CanvasNode[];
  /** 新边（只有两端都在剪贴板里的那些）—— 交给调用方走既有 `makeEdge` 工厂 */
  edgePairs: Array<{ source: string; target: string }>;
}

/**
 * 粘贴计划（原 `pasteNodes`，`32075-32235`）
 *
 * @param input.position 落点（画布坐标）；`null` ⇒ 用源的固定 `+50/+50` 偏移
 * @param input.nextNodeId 新节点 id 工厂（**按三档**调用 —— 见文件头 ⚠️①）
 * @returns `null` = 剪贴板空（源直接 `return`，**不 commit**）
 */
export function planPaste(input: {
  clipboard: ClipboardPayload;
  nodes: readonly CanvasNode[];
  position: { x: number; y: number } | null;
  nextNodeId: (kind: PasteIdKind) => string;
}): PastePlan | null {
  const { clipboard, nodes, position, nextNodeId } = input;
  if (!clipboard.nodes || clipboard.nodes.length === 0) return null;

  // ① 老 id → 新 id
  const idMap: Record<string, string> = {};
  for (const n of clipboard.nodes) {
    const kind: PasteIdKind = n.type === 'material' ? 'material' : n.type === 'text' ? 'text' : 'account';
    idMap[n.id] = nextNodeId(kind);
  }
  const clipboardById = new Map(clipboard.nodes.map((n) => [n.id, n]));

  // ② 偏移（原 `32118-32139`）
  let dx = 50;
  let dy = 50;
  if (position) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of clipboard.nodes) {
      const a = absolutePosition(n, clipboardById, nodes);
      // ⚠️ 源这里是 `C.width || C.measured?.width || 200` —— `measured` 是 **xyflow 的运行时量测**，
      //    本仓的 `CanvasNode`（stable 模型）**不带它**；而建节点时 `width`/`height` **必被写入**
      //    （见 `state/slices/canvas.addNode`）⇒ 只用 `width ?? 200` 即等价。
      const w = n.width ?? 200;
      const h = n.height ?? 180;
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x + w);
      minY = Math.min(minY, a.y);
      maxY = Math.max(maxY, a.y + h);
    }
    dx = position.x - (minX + maxX) / 2;
    dy = position.y - (minY + maxY) / 2;
  }

  // ③ 生成新节点（原 `32140-32164`）—— 只覆盖 `CanvasNode` **已有**的字段 ⇒ 仍是联合成员，无需断言
  const pasted: CanvasNode[] = clipboard.nodes.map((n) => {
    const mappedParent = n.parentId ? idMap[n.parentId] : undefined;
    const child = !!mappedParent;
    return {
      ...n,
      id: idMap[n.id] as string,
      selected: true,
      parentId: child ? mappedParent : n.parentId || undefined,
      position: child
        ? { x: n.position.x, y: n.position.y }
        : { x: n.position.x + dx, y: n.position.y + dy },
    };
  });

  // ④ 正文 `@[老id|名]` 与 `materialIds` 重写（原 `32165-32203`）
  const patched: CanvasNode[] = pasted.map((node) => {
    if (node.type !== 'text') return node;
    // ⚠️ 字段按 `unknown` 读（载荷来自旧工程 / 外部）⇒ 走唯一落点 `asRecord`（`lib/object`），不写断言
    const data = asRecord(node.data);
    const patch: Record<string, unknown> = {};
    if (typeof data.text === 'string' && data.text) {
      // ★ **2026-10-12 越权修正**：内联正则 → 委托 canonical `createRefChipRe()`（原 `U0`）
      const next = data.text.replace(createRefChipRe(), (whole, id: string, name: string) => {
        const mapped = idMap[id];
        return mapped ? `@[${mapped}|${name}]` : whole;
      });
      if (next !== data.text) patch.text = next;
    }
    if (Array.isArray(data.materialIds)) {
      const ids: unknown[] = data.materialIds;
      const next = ids.map((k) => idMap[String(k)] ?? k);
      if (next.some((k, j) => k !== ids[j])) patch.materialIds = next;
    }
    if (Object.keys(patch).length === 0) return node;
    return { ...node, data: { ...node.data, ...patch } };
  });

  // ⑤ 既有节点**全部反选**（原 `32204-32209`）
  const deselected = nodes.map((n) => (n.selected ? ({ ...n, selected: false } as CanvasNode) : n));

  // ⑥ 内部边 → `{source, target}` 对（原 `32210-32233`；`id`/`style`/`markerEnd` 交给调用方工厂）
  //    ⚠️ 用**局部量**收窄（`filter` 后再 `as` 会把「判过」与「取值」拆成两处）
  const edgePairs: Array<{ source: string; target: string }> = [];
  for (const e of clipboard.edges) {
    const source = idMap[e.source];
    const target = idMap[e.target];
    if (source && target) edgePairs.push({ source, target });
  }

  return { nodes: [...deselected, ...patched], edgePairs };
}
