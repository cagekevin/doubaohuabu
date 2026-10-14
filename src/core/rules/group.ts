/**
 * 组节点（成组 / 取消组）—— **纯函数**（★ 必测）
 *
 * 依据（**逐行回源**）：
 *   - `groupSelectedNodes` shared.js:31497-31608
 *   - `ungroupNodes` shared.js:31610-31651
 *
 * ★ **为什么这一层必须纯**：两个动作都在改**节点几何**（算包围盒、父子坐标换算），
 *   而 `commit(...)`（撤销快照）与 `set` 是 state 的事（原则 1）⇒ 这里只**返回新节点数组**。
 *   源版把它们写在一个 action 里（`t().commit('group')` 就夹在中间）。
 *
 * 几何常量（原 31554-31556 内联）：组头高 `d = 34` · 内边距 `f = 18` ·
 * 最小尺寸 **200×140** · 子节点默认盒 **200×180**（原 `s(x)` 的两级兜底）。
 *
 * ★ **节点类型泛型化**：入参只要求 `GroupNodeLike`（结构子集），**出参与入参同型** ——
 *   传 `CanvasNode[]` 就出 `CanvasNode[]`。这样调用方**不需要**回写 store 前再收窄，
 *   也就不用断言（「节点是 8 类判别联合」的真源 = `stable/model/node.ts`）。
 *   新造的组节点按真源 `GroupNode` 声明，它本就是那个联合的成员 ⇒ 出参里加它不会擦宽。
 */

import type { GroupNode } from '@/stable/model/node';

/**
 * 组内节点的**默认盒尺寸**（原 `s(x)`：`width ?? measured.width ?? 200`）
 *
 * ⚠️ **`TD-02-8` 复核结论（2026-10-12）：它与 `core/model/defaults` 的创建兜底 `200×180`
 *   **不是同一条规则**，**不许合并** —— 本源是 `s(x)`（`shared.js:31508-31513`，**三级**兜底
 *   含 `measured`），而那两处源出 `lt`（`_Component42.jsx:543-560`，**二级** `width || 200`）。
 *   三者取值巧合相同、角色与层级都不同；合并＝造耦合。详见 `defaults.ts` 的对照表。
 */
const DEFAULT_BOX = { w: 200, h: 180 } as const;
/** 组头高度（原 31554 的 `d`） */
export const GROUP_HEADER_H = 34;
/** 组内边距（原 31555 的 `f`） */
export const GROUP_PADDING = 18;
/** 组容器最小尺寸（原 31556） */
export const GROUP_MIN_W = 200;
export const GROUP_MIN_H = 140;

/** 本模块只读节点的这几个字段（按结构收 —— `CanvasNode` 是联合类型） */
export interface GroupNodeLike {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  selected?: boolean;
  parentId?: string;
  /** ReactFlow 量出来的实际尺寸（未显式给 `width` 时的二级兜底） */
  measured?: { width?: number; height?: number };
  zIndex?: number;
  /** 组内节点才有（限制在父节点内）—— 从组里摘出时要**去掉**这个键 */
  extent?: unknown;
  data?: Record<string, unknown>;
}

/** 节点盒尺寸（原 `s(x)`） */
export function groupBoxOf(node: GroupNodeLike): { w: number; h: number } {
  return {
    w: node.width ?? node.measured?.width ?? DEFAULT_BOX.w,
    h: node.height ?? node.measured?.height ?? DEFAULT_BOX.h,
  };
}

/**
 * 节点的**绝对坐标**（原 `o(x)` 31514-31530）
 *
 * ⚠️ **只加一层父偏移**（不递归）—— 源版就是 `find(parentId)` 后直接相加；
 *   组里再套组（嵌套）本实现与源版一样**不支持**。
 */
export function absolutePositionOf(
  node: GroupNodeLike,
  byId: ReadonlyMap<string, GroupNodeLike>,
): { x: number; y: number } {
  const x = node.position.x || 0;
  const y = node.position.y || 0;
  if (!node.parentId) return { x, y };
  const parent = byId.get(node.parentId);
  if (!parent) return { x, y };
  return { x: x + (parent.position.x || 0), y: y + (parent.position.y || 0) };
}

/**
 * 把成员从组里**摘出来**（原两处同一变换：`ungroupNodes` `31630-31638` ＋
 * `onNodesChange` 的删组支 `26861-26872`）
 *
 * 去掉 `parentId` 与 `extent`，并把**相对坐标**换回**绝对坐标**（加一层父偏移）。
 *
 * ⚠️ **不带 `selected`** —— 是否选中是**调用方各自的判据**：显式取消组 ⇒ `true`（源同）；
 *    删组释放 ⇒ **不动**（源在删除路径不设）。
 */
export function detachFromGroup<T extends GroupNodeLike>(node: T, group: GroupNodeLike): T {
  const next = {
    ...node,
    position: {
      x: (node.position.x || 0) + (group.position.x || 0),
      y: (node.position.y || 0) + (group.position.y || 0),
    },
  };
  delete next.parentId;
  delete next.extent;
  return next;
}

/**
 * 「选中的那个组」—— 供选择工具条决定是否显示「取消组」（原 `_Component42.jsx:112-129` 的 `H`）
 *
 * 规则（**逐字回源**）：取**所有选中节点**的 `parentId`；
 *   ① 没有选中节点、或**第一个**选中节点没有 `parentId` ⇒ `null`；
 *   ② 所有选中节点的 `parentId` **相同** ⇒ 该值；
 *   ③ 否则（分属不同的组）⇒ `null`。
 *
 * ⚠️ 于是「**选中组节点本身**」**不算**（组节点没有 `parentId`）—— 源版如此：工具条的
 *   「取消组」只在**选中组内成员**时出现；组自身那个按钮在 `GL.jsx:30`（`GroupNode`）。
 */
export function selectedGroupIdOf(nodes: readonly GroupNodeLike[]): string | null {
  const parents = nodes.filter((n) => n.selected).map((n) => n.parentId ?? null);
  const first = parents[0];
  if (!first) return null;
  return parents.every((p) => p === first) ? first : null;
}

export type GroupResult<T extends GroupNodeLike = GroupNodeLike> =
  | { ok: true; nodes: Array<T | GroupNode>; groupId: string; count: number }
  | { ok: false; reason: 'need-2' };

/**
 * 把**选中的节点**收进一个新组（原 `groupSelectedNodes` 31497-31608）
 *
 * ① 取 `selected && type !== 'group'`（**组不能套组**）；**少于 2 个 ⇒ `need-2`**
 * ② 用**绝对坐标**算包围盒；组几何 `x = minX - f`、`y = minY - d - f`、
 *    `w = max(200, 跨度 + 2f)`、`h = max(140, 跨度 + d + 2f)`
 * ③ 组节点：`zIndex = -1001`（在其它节点**之下**）、`selected: true`、`label = 组 ${已有组数+1}`
 * ④ 成员：`parentId`、`extent: 'parent'`、`selected: false`、**`position` 换成相对坐标**
 * ⑤ 同批选中的**非成员**（理论上只有组）⇒ **只取消选中**
 * ⑥ 组节点插入到**列表最前**（原版就是 `[{…组}, ...nodes]`）
 *
 * ⚠️ 出参 = **入参同型** ＋ 新造的 `GroupNode`（见文件头 ★）；`T` 是 `CanvasNode` 时二者合成它本身。
 *
 * @param idFactory 造新组 id（原 `Pt('grp')` —— 时间/序号由 state 注入，原则 4）
 * @param labelIndex 新组序号（原 `已有组数 + 1`）
 */
export function groupSelectedNodes<T extends GroupNodeLike>(
  nodes: readonly T[],
  idFactory: () => string,
  labelIndex: number,
): GroupResult<T> {
  const picked = nodes.filter((n) => n.selected && n.type !== 'group');
  if (picked.length < 2) return { ok: false, reason: 'need-2' };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of picked) {
    const { w, h } = groupBoxOf(n);
    const p = absolutePositionOf(n, byId);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + w);
    maxY = Math.max(maxY, p.y + h);
  }

  const f = GROUP_PADDING;
  const d = GROUP_HEADER_H;
  const originX = minX - f;
  const originY = minY - d - f;
  const groupId = idFactory();
  const members = new Set(picked.map((n) => n.id));

  const groupNode: GroupNode = {
    id: groupId,
    type: 'group',
    position: { x: originX, y: originY },
    width: Math.max(GROUP_MIN_W, maxX - minX + f * 2),
    height: Math.max(GROUP_MIN_H, maxY - minY + d + f * 2),
    selected: true,
    zIndex: -1001,
    data: { label: `组 ${labelIndex}` },
  };

  const rest: T[] = nodes.map((n) => {
    if (!members.has(n.id)) {
      // 原 31580-31590：不在组内的（含其它组）**只是取消选中**
      return n.selected ? { ...n, selected: false } : n;
    }
    const abs = absolutePositionOf(n, byId);
    return {
      ...n,
      parentId: groupId,
      extent: 'parent',
      selected: false,
      position: { x: abs.x - originX, y: abs.y - originY },
    };
  });

  return { ok: true, nodes: [groupNode, ...rest], groupId, count: picked.length };
}

export type UngroupResult<T extends GroupNodeLike = GroupNodeLike> =
  | { ok: true; nodes: T[] }
  | { ok: false; reason: 'no-group' };

/**
 * 取消组：释放成员、只删容器（原 `ungroupNodes` 31610-31651）
 *
 * ① 目标必须是 `type === 'group'`，否则 `{ok:false, reason:'no-group'}`
 * ② 删掉组节点本身
 * ③ 成员：**去掉 `parentId` 与 `extent`**、`selected: true`、**`position` 换回绝对坐标**
 * ④ 非成员**原样不动**
 */
export function ungroupNodes<T extends GroupNodeLike>(
  nodes: readonly T[],
  groupId: string,
): UngroupResult<T> {
  const target = nodes.find((n) => n.id === groupId && n.type === 'group');
  if (!target) return { ok: false, reason: 'no-group' };

  const next: T[] = nodes
    .filter((n) => n.id !== groupId)
    .map((n) => (n.parentId === groupId ? { ...detachFromGroup(n, target), selected: true } : n));

  return { ok: true, nodes: next };
}

/**
 * 删掉组节点时**释放它的成员**（原 `onNodesChange` 的删组支，`shared.js:26848-26875`）
 *
 * ★ **为什么必须有**：删除只把被删节点从数组里丢掉 ⇒ 成员会留着**悬空的 `parentId`**（父已不在）
 *   ＋ `extent: 'parent'` ⇒ ① 相对坐标被当成绝对坐标 ⇒ **视觉跳位**；
 *   ② ReactFlow 找不到父容器 ⇒ 拖动 / 裁切行为异常。
 *   源在删除之后把成员**摘出来并换回绝对坐标**（复用 `detachFromGroup`）。
 *
 * ⚠️ **只释放、不删孩子**（源同）· **不动 `selected`**（源在删除路径不设）。
 * ⚠️ 判据用**变更前**的节点表（`before`）—— 被删的组已经从 `nodes` 里没了。
 * ⚠️ 被删的**非组**节点不触发任何释放（源判据是 `type === 'group'`）。
 *
 * @param nodes       **已删掉被删节点之后**的节点表（源里的 `o`）
 * @param before      变更前的节点表（源里的 `s`：用来判"被删的哪些是组" ＋ 取组坐标）
 * @param removedIds  被删的节点 id
 */
export function releaseDeletedGroupChildren<T extends GroupNodeLike>(
  nodes: readonly T[],
  before: readonly GroupNodeLike[],
  removedIds: ReadonlySet<string>,
): T[] {
  const gone = new Map<string, GroupNodeLike>();
  for (const n of before) {
    if (removedIds.has(n.id) && n.type === 'group') gone.set(n.id, n);
  }
  if (gone.size === 0) return [...nodes];
  return nodes.map((n) => {
    const group = n.parentId ? gone.get(n.parentId) : undefined;
    return group ? detachFromGroup(n, group) : n;
  });
}
