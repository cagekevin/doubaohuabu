/**
 * 文本节点的「已连接素材」与拖拽排序（原 `CL.jsx` 的 `w` / `v` / 拖拽回写）—— ★ 纯函数，必测
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `w`（连入的素材节点） | `CL.jsx:85-133` | 只认**入边**（`e.target === 本节点`）且源节点 `type === 'material'`；**按 id 去重** |
 *   | `v`（显示顺序） | `CL.jsx:110-124` | 有 `materialIds` ⇒ 按它排序（**不在表里的排最后**，排名取 `999`）；否则保持连接顺序 |
 *   | 拖拽回写 | `CL.jsx:480-486` | `splice` 移出再插入 ⇒ 写成 `materialIds` |
 *
 * ⚠️ 原则 4：纯函数，不碰宿主 / 不读时间 / 不随机。
 */

/** 连边（只要 `source`/`target` —— 与 `downloadNode.collectDownloadTargets` 同款最小视图） */
export interface EdgeRef {
  source: string;
  target: string;
}

/**
 * 素材节点的最小视图（本规则只读 `data` 里的几个字段）
 *
 * ⚠️ 形状与 `downloadNode.DownloadSourceNode` **同款**（`data?: Record<string, unknown> | null`）——
 *    不能写成 `{ label?: …; name?: …; dataUrl?: … }`：那是**全可选**类型，TS 的**弱类型检查**会
 *    对 `AccountNodeData` 之类"无公共属性"的节点报错 ⇒ `CanvasNode[]` 传不进来。
 */
export interface MaterialRefNode {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 连入某节点的**素材节点**（原 `w`）
 *
 * ⚠️ 与源一致三条：只认**入边**（`target === nodeId`）· 只认 `type === 'material'` · **按 id 去重**。
 * ⚠️ 注意与 `downloadNode.collectDownloadTargets` 的差异：那个**不去重**（源就是不去重），
 *    这个**去重**（源有 `Set`）—— 两条各自逐字对各自的源，**不要合并**。
 */
export function collectLinkedMaterials(
  nodes: readonly MaterialRefNode[],
  edges: readonly EdgeRef[],
  nodeId: string,
): MaterialRefNode[] {
  return collectInputs(nodes, edges, nodeId, 'material');
}

/**
 * 连入某节点的**输入节点**（原 `Hu`，`shared.js:40969`）—— 只认入边 + **按 id 去重**；
 * `type` 缺省 = **不限类型**。
 *
 * ⚠️ `collectLinkedMaterials`（原 `CL.jsx` 的 `w`）与它**共用这一处实现** —— 二者只差一个 `type` 过滤，
 *    不写两份（原则 8 三振出局）。
 * ⚠️ **`downloadNode.collectDownloadTargets` 仍独立**：它**不去重**、且要求 `data.url` —— 逐字对的是
 *    另一个源（`WL.jsx`），**不合并**。
 */
export function collectInputs(
  nodes: readonly MaterialRefNode[],
  edges: readonly EdgeRef[],
  nodeId: string,
  type?: string,
): MaterialRefNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const out: MaterialRefNode[] = [];
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    const n = byId.get(e.source);
    if (!n || seen.has(n.id)) continue;
    if (type !== undefined && n.type !== type) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

/** 「已连接 N 个输入」的 N（原 `Hu(e,…).length`）—— 文生视频节点的 meta 用 */
export function countInputs(
  nodes: readonly MaterialRefNode[],
  edges: readonly EdgeRef[],
  nodeId: string,
): number {
  return collectInputs(nodes, edges, nodeId).length;
}

/** 缩略图的显示名（原 `Se.label || we.rawName`；本仓取 `data.label || data.name`） */
export function materialLabelOf(n: MaterialRefNode): string {
  return str(n.data?.label) || str(n.data?.name);
}

/** 缩略图地址（原 `Se.dataUrl`）—— 空串表示**素材缺失**（源 `missing`） */
export function materialDataUrlOf(n: MaterialRefNode): string {
  return str(n.data?.dataUrl);
}

/**
 * 按 `materialIds` 排序（原 `v`，`CL.jsx:110-124`）
 *
 * ⚠️ 与源逐字一致：**不在表里的排最后**（排名常量就是 `999`）；`materialIds` 为空 ⇒ **原样返回**
 *    （= 保持连接顺序）。
 */
export function orderByMaterialIds<T extends { id: string }>(
  items: readonly T[],
  materialIds: readonly string[],
): T[] {
  if (materialIds.length === 0) return [...items];
  const rank = new Map(materialIds.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}

/** 拖拽重排（原 `CL.jsx:480-486` 的 `splice`）：把 `from` 项移出、插到 `to` 位 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const moved = next[from];
  if (moved === undefined) return next;
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
