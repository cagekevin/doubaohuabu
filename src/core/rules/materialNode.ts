/**
 * 素材节点的「**同源**」判定（原 `Ms`，`shared.js:24117-24132`）
 *
 * 源（逐行抄录）：
 * ```js
 * function Ms(e, t) {
 *   const n = e && e.data || {};
 *   if (n.libId) return n.libId;
 *   const r = n.dataUrl || n.poster || '';
 *   if (!r) return '';
 *   const s = (t || []).find(o => o.dataUrl && o.dataUrl === r);
 *   return s ? s.id : '';
 * }
 * ```
 *
 * 用途（**三处**都靠它判「画布上这张图 = 资源库哪一条」）：
 *   · `addMaterial` / `addMaterialsBatch` / `addMaterialFromDrop` —— 命中就**复用**已有素材节点，不重复建；
 *   · `ensureMaterialNode` —— 拖入时的复用探测；
 *   · （`renameMaterialNode` 另有一套内联判据，**不含 `poster`** ⇒ 各自逐字对各自的源，**不合并**。）
 *
 * ⚠️ **`poster` 也参与反查**：视频节点是 `dataUrl`，而**生成节点**的图在 `poster` 里 —— 源把两者
 *    串在一条 `||` 链上，逐字保留。
 */

import { asRecord } from '@/lib/object';


/** 判定所需的节点最小形状 */
export interface LibIdNodeLike {
  type?: string;
  data?: unknown;
}

/** 判定所需的库条目最小形状 */
export interface LibIdLibraryItem {
  id: string;
  dataUrl?: string;
}

/**
 * `addMaterial` 的入参（原 `addMaterial(n, r, s)` 的 `n`，`shared.js:28979`）
 *
 * ⚠️ 与 `LibIdLibraryItem` **不同**：这里是「要建/复用的那个素材」的**描述**
 *   （`libId` 可空 ⇒ 由 `dataUrl` 反查补上），不是资源库里的既有条目。
 */
export interface MaterialAddInput {
  /** 素材名（原 `n.name`） */
  name?: string;
  /** 图地址（`data:` 或 `img://`；走 `persistImage` 落盘） */
  dataUrl?: string;
  /** 已知的资源库条目 id（原 `n.libId`） */
  libId?: string;
  /** 原始宽（建库条目时用，原 `n.natW`） */
  natW?: number;
  /** 原始高（建库条目时用，原 `n.natH`） */
  natH?: number;
}

/** 取字符串（`unknown` 先收敛） */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');


/**
 * 该节点**同源**的资源库条目 id（原 `Ms`）
 *
 * @returns 节点自己的 `data.libId` 优先；否则用 `dataUrl`（**或 `poster`**）反查资源库；
 *   都没有 ⇒ **空串**（不是 `null` —— 源就是空串，调用方按 falsy 判）
 */
export function materialLibId(
  node: LibIdNodeLike | null | undefined,
  library: readonly LibIdLibraryItem[],
): string {
  // ⚠️ `data` 是**各节点自己的形状**（`TextNodeData` / `MaterialNodeData` / …）⇒ 走 `asRecord` 收敛，
  //    避免为了读三个字段而给每个节点类型加联合成员。
  const d = asRecord(node?.data);
  const own = str(d.libId);
  if (own) return own;
  const url = str(d.dataUrl) || str(d.poster);
  if (!url) return '';
  const hit = library.find((l) => l.dataUrl && l.dataUrl === url);
  return hit ? hit.id : '';
}

/**
 * 画布上**已经**有这个库条目的素材节点吗（原 `nodes.find(u => u.type === 'material' && Ms(u, library) === libId)`）
 *
 * @returns 命中的**第一个**素材节点（源取第一个 —— 因为"同一个素材只应有一个节点"正是这条判据在维护）
 */
export function findMaterialNodeByLibId<T extends LibIdNodeLike & { id: string }>(
  nodes: readonly T[],
  library: readonly LibIdLibraryItem[],
  libId: string,
): T | undefined {
  // ⚠️ 泛型形如 `CanvasNode`（各节点自己的 `data` 形状）⇒ 约束里 `data?: unknown`
  if (!libId) return undefined;
  return nodes.find((n) => n.type === 'material' && materialLibId(n, library) === libId);
}
