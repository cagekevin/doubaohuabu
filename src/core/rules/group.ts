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
 */

/** 组内节点的**默认盒尺寸**（原 `s(x)`：`width ?? measured.width ?? 200`） */
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

export type GroupResult =
  | { ok: true; nodes: GroupNodeLike[]; groupId: string; count: number }
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
 * @param idFactory 造新组 id（原 `Pt('grp')` —— 时间/序号由 state 注入，原则 4）
 * @param labelIndex 新组序号（原 `已有组数 + 1`）
 */
export function groupSelectedNodes(
  nodes: readonly GroupNodeLike[],
  idFactory: () => string,
  labelIndex: number,
): GroupResult {
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

  const groupNode: GroupNodeLike = {
    id: groupId,
    type: 'group',
    position: { x: originX, y: originY },
    width: Math.max(GROUP_MIN_W, maxX - minX + f * 2),
    height: Math.max(GROUP_MIN_H, maxY - minY + d + f * 2),
    selected: true,
    zIndex: -1001,
    data: { label: `组 ${labelIndex}` },
  };

  const rest = nodes.map((n) => {
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

export type UngroupResult =
  | { ok: true; nodes: GroupNodeLike[] }
  | { ok: false; reason: 'no-group' };

/**
 * 取消组：释放成员、只删容器（原 `ungroupNodes` 31610-31651）
 *
 * ① 目标必须是 `type === 'group'`，否则 `{ok:false, reason:'no-group'}`
 * ② 删掉组节点本身
 * ③ 成员：**去掉 `parentId` 与 `extent`**、`selected: true`、**`position` 换回绝对坐标**
 * ④ 非成员**原样不动**
 */
export function ungroupNodes(nodes: readonly GroupNodeLike[], groupId: string): UngroupResult {
  const target = nodes.find((n) => n.id === groupId && n.type === 'group');
  if (!target) return { ok: false, reason: 'no-group' };

  const ox = target.position.x || 0;
  const oy = target.position.y || 0;

  const next = nodes
    .filter((n) => n.id !== groupId)
    .map((n) => {
      if (n.parentId !== groupId) return n;
      const { parentId: _p, extent: _e, ...rest } = n as GroupNodeLike & { extent?: string };
      return {
        ...rest,
        selected: true,
        position: { x: (n.position.x || 0) + ox, y: (n.position.y || 0) + oy },
      } as GroupNodeLike;
    });

  return { ok: true, nodes: next };
}
