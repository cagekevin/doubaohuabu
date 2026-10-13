/**
 * 成组 / 取消组单测（原 `groupSelectedNodes` 31497-31608 / `ungroupNodes` 31610-31651）
 *
 * 断言红线：**实现一变必红** —— 几何常量（`f=18` / `d=34` / 最小 200×140 / 默认盒 200×180）、
 * 绝对↔相对坐标的换算、`zIndex = -1001`、以及"组不参与成组"。
 * ★ 最有价值的一条：**成组 → 取消组 必须回到原坐标**（往返不变）。
 */

import { describe, expect, it } from 'vitest';
import {
  GROUP_HEADER_H,
  GROUP_MIN_H,
  GROUP_MIN_W,
  GROUP_PADDING,
  absolutePositionOf,
  groupBoxOf,
  groupSelectedNodes,
  releaseDeletedGroupChildren,
  selectedGroupIdOf,
  ungroupNodes,
  type GroupNodeLike,
} from '../group';

const node = (
  id: string,
  x: number,
  y: number,
  extra: Partial<GroupNodeLike> = {},
): GroupNodeLike => ({ id, type: 'text', position: { x, y }, ...extra });

describe('groupBoxOf（原 `s(x)` 31508）', () => {
  it('★ 三级兜底：`width` → `measured.width` → **200**', () => {
    expect(groupBoxOf(node('a', 0, 0, { width: 300, height: 400 }))).toEqual({ w: 300, h: 400 });
    expect(groupBoxOf(node('a', 0, 0, { measured: { width: 250, height: 150 } }))).toEqual({ w: 250, h: 150 });
    expect(groupBoxOf(node('a', 0, 0))).toEqual({ w: 200, h: 180 });
  });

  it('`width` 优先于 `measured`', () => {
    expect(groupBoxOf(node('a', 0, 0, { width: 300, measured: { width: 999 } }))).toEqual({ w: 300, h: 180 });
  });
});

describe('absolutePositionOf（原 `o(x)` 31514）', () => {
  it('★ 无父 ⇒ 就是自己的 `position`', () => {
    expect(absolutePositionOf(node('a', 10, 20), new Map())).toEqual({ x: 10, y: 20 });
  });

  it('★ 有父 ⇒ **加一层父偏移**', () => {
    const parent = node('grp', 100, 50, { type: 'group' });
    const child = node('a', 10, 20, { parentId: 'grp' });
    expect(absolutePositionOf(child, new Map([['grp', parent]]))).toEqual({ x: 110, y: 70 });
  });

  it('父找不到 ⇒ 回落自己的坐标（不抛）', () => {
    expect(absolutePositionOf(node('a', 10, 20, { parentId: 'ghost' }), new Map())).toEqual({ x: 10, y: 20 });
  });
});

describe('groupSelectedNodes（原 31497）', () => {
  const A = node('a', 100, 100, { width: 200, height: 180, selected: true });
  const B = node('b', 400, 300, { width: 200, height: 180, selected: true });

  it('★ 选中**少于 2** 个 ⇒ `need-2`（原 31502）', () => {
    expect(groupSelectedNodes([{ ...A }], () => 'grp_1', 1)).toEqual({ ok: false, reason: 'need-2' });
    expect(groupSelectedNodes([], () => 'grp_1', 1)).toEqual({ ok: false, reason: 'need-2' });
  });

  it('★ **组不参与成组**（只有非组节点才算进选中数）', () => {
    const g = node('g0', 0, 0, { type: 'group', selected: true });
    expect(groupSelectedNodes([g, { ...A }], () => 'grp_1', 2)).toEqual({ ok: false, reason: 'need-2' });
  });

  it('★ 几何：`x=minX-f` · `y=minY-d-f` · `w=max(200, 跨度+2f)` · `h=max(140, 跨度+d+2f)`', () => {
    const r = groupSelectedNodes([{ ...A }, { ...B }], () => 'grp_1', 1);
    if (!r.ok) throw new Error('应当成功');
    const g = r.nodes[0]!;
    expect(g.id).toBe('grp_1');
    expect(g.type).toBe('group');
    expect(g.position).toEqual({ x: 100 - GROUP_PADDING, y: 100 - GROUP_HEADER_H - GROUP_PADDING });
    expect(g.width).toBe(Math.max(GROUP_MIN_W, 600 - 100 + GROUP_PADDING * 2)); // 536
    expect(g.height).toBe(Math.max(GROUP_MIN_H, 480 - 100 + GROUP_HEADER_H + GROUP_PADDING * 2)); // 450
  });

  it('★ 组节点：`zIndex = -1001`、`selected: true`、`label = 组 N`、**插在最前**', () => {
    const r = groupSelectedNodes([{ ...A }, { ...B }], () => 'grp_1', 3);
    if (!r.ok) throw new Error('应当成功');
    expect(r.nodes[0]).toMatchObject({ zIndex: -1001, selected: true, data: { label: '组 3' } });
    expect(r.nodes).toHaveLength(3);
    expect(r.count).toBe(2);
  });

  it('★ 成员：`parentId` / `extent:"parent"` / `selected:false` / **位置换成相对坐标**', () => {
    const r = groupSelectedNodes([{ ...A }, { ...B }], () => 'grp_1', 1);
    if (!r.ok) throw new Error('应当成功');
    const a = r.nodes.find((n) => n.id === 'a') as GroupNodeLike & { extent?: string };
    expect(a.parentId).toBe('grp_1');
    expect(a.extent).toBe('parent');
    expect(a.selected).toBe(false);
    // 原点 (82,48) ⇒ a 的相对坐标 = (100-82, 100-48) = (18,52)
    expect(a.position).toEqual({ x: 18, y: 52 });
  });

  it('★ 未入组的选中项 ⇒ **只取消选中**（原 31580-31590）', () => {
    const other = node('g0', 0, 0, { type: 'group', selected: true });
    const r = groupSelectedNodes([{ ...A }, { ...B }, other], () => 'grp_1', 2);
    if (!r.ok) throw new Error('应当成功');
    const g0 = r.nodes.find((n) => n.id === 'g0');
    expect(g0).toEqual({ ...other, selected: false });
    // 它**没有**变成成员
    expect((g0 as GroupNodeLike).parentId).toBeUndefined();
  });

  it('★ 未选中的节点**原样返回**（同一引用 —— 不加无意义的拷贝）', () => {
    const idle = node('idle', 999, 999);
    const r = groupSelectedNodes([{ ...A }, { ...B }, idle], () => 'grp_1', 1);
    if (!r.ok) throw new Error('应当成功');
    expect(r.nodes.find((n) => n.id === 'idle')).toBe(idle);
  });

  it('组内已有成员时按**绝对坐标**算包围盒（不吃父偏移两次）', () => {
    const parent = node('grp0', 1000, 1000, { type: 'group' });
    const child = node('c', 10, 10, { parentId: 'grp0', width: 200, height: 180, selected: true });
    const other = node('d', 2000, 2000, { width: 200, height: 180, selected: true });
    const r = groupSelectedNodes([parent, child, other], () => 'grp_1', 2);
    if (!r.ok) throw new Error('应当成功');
    // child 的绝对坐标 = (1010,1010)，other = (2000,2000) ⇒ minX=1010 ⇒ 原点 x = 992
    expect(r.nodes[0]!.position.x).toBe(1010 - GROUP_PADDING);
  });
});

describe('ungroupNodes（原 31610）', () => {
  const grouped = () => {
    const A = node('a', 100, 100, { width: 200, height: 180, selected: true });
    const B = node('b', 400, 300, { width: 200, height: 180, selected: true });
    const r = groupSelectedNodes([A, B], () => 'grp_1', 1);
    if (!r.ok) throw new Error('应当成功');
    return r.nodes;
  };

  it('★ 目标不是组 ⇒ `{ok:false, reason:"no-group"}`（原 31612-31620）', () => {
    expect(ungroupNodes([node('a', 0, 0)], 'a')).toEqual({ ok: false, reason: 'no-group' });
    expect(ungroupNodes([], 'grp_x')).toEqual({ ok: false, reason: 'no-group' });
    // **类型必须是 group**：同 id 的 text 节点不算
    expect(ungroupNodes([node('grp_1', 0, 0)], 'grp_1')).toEqual({ ok: false, reason: 'no-group' });
  });

  it('★ 删掉组节点本身', () => {
    const r = ungroupNodes(grouped(), 'grp_1');
    if (!r.ok) throw new Error('应当成功');
    expect(r.nodes.find((n) => n.id === 'grp_1')).toBeUndefined();
  });

  it('★ 成员：去掉 `parentId`/`extent`、`selected: true`、位置**换回绝对坐标**', () => {
    const r = ungroupNodes(grouped(), 'grp_1');
    if (!r.ok) throw new Error('应当成功');
    const a = r.nodes.find((n) => n.id === 'a') as GroupNodeLike & { extent?: string };
    expect(a.parentId).toBeUndefined();
    expect(a.extent).toBeUndefined();
    expect(a.selected).toBe(true);
    expect(a.position).toEqual({ x: 100, y: 100 });
  });

  it('★★ **往返不变**：成组 → 取消组 ⇒ 各节点坐标与最初完全一致', () => {
    const before = [
      node('a', 100, 100, { width: 200, height: 180, selected: true }),
      node('b', 400, 300, { width: 200, height: 180, selected: true }),
    ];
    const g = groupSelectedNodes(before, () => 'grp_1', 1);
    if (!g.ok) throw new Error('应当成功');
    const u = ungroupNodes(g.nodes, 'grp_1');
    if (!u.ok) throw new Error('应当成功');
    for (const orig of before) {
      const back = u.nodes.find((n) => n.id === orig.id)!;
      expect(back.position).toEqual(orig.position);
      expect(back.width).toBe(orig.width);
      expect(back.height).toBe(orig.height);
    }
  });

  it('★ 非成员**原样不动**（同一引用）', () => {
    const outsider = node('out', 5, 5);
    const list = [...grouped(), outsider];
    const r = ungroupNodes(list, 'grp_1');
    if (!r.ok) throw new Error('应当成功');
    expect(r.nodes.find((n) => n.id === 'out')).toBe(outsider);
  });

  it('**别的组的成员不会被顺手释放**', () => {
    const otherChild = node('oc', 1, 2, { parentId: 'grp_other' });
    const r = ungroupNodes([...grouped(), node('grp_other', 0, 0, { type: 'group' }), otherChild], 'grp_1');
    if (!r.ok) throw new Error('应当成功');
    expect(r.nodes.find((n) => n.id === 'oc')?.parentId).toBe('grp_other');
  });
});

describe('releaseDeletedGroupChildren（原 `onNodesChange` 删组支 26848-26875）', () => {
  const grouped = () => {
    const A = node('a', 100, 100, { width: 200, height: 180, selected: true });
    const B = node('b', 400, 300, { width: 200, height: 180, selected: true });
    const r = groupSelectedNodes([A, B], () => 'grp_1', 1);
    if (!r.ok) throw new Error('应当成功');
    return r.nodes;
  };
  /** 模拟 `removeNodes` 的调用口径：`nodes` 已过滤、`before` 是变更前、`removedIds` 是被删 id */
  const kill = (list: GroupNodeLike[], ...ids: string[]) => {
    const removed = new Set(ids);
    return { before: list, survivors: list.filter((n) => !removed.has(n.id)), removed };
  };

  it('★ 删组 ⇒ 成员摘掉 `parentId`/`extent`、位置**换回绝对坐标**、`selected` **不动**', () => {
    const { before, survivors, removed } = kill(grouped(), 'grp_1');
    const out = releaseDeletedGroupChildren(survivors, before, removed);
    const a = out.find((n) => n.id === 'a') as GroupNodeLike & { extent?: string };
    expect(a.parentId).toBeUndefined();
    expect(a.extent).toBeUndefined();
    expect(a.position).toEqual({ x: 100, y: 100 });
    // ⚠️ 源在删除路径**不设** `selected`（成组时成员是 `false`）—— 与「取消组」不同
    expect(a.selected).toBe(false);
  });

  it('★ **只释放、不删孩子**（成员仍在表里）', () => {
    const { before, survivors, removed } = kill(grouped(), 'grp_1');
    const out = releaseDeletedGroupChildren(survivors, before, removed);
    expect(out.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('★ 删**非组**节点 ⇒ 成员**不受影响**（仍是相对坐标 + `parentId`）', () => {
    const list = [...grouped(), node('x', 9, 9)];
    const { before, survivors, removed } = kill(list, 'x');
    const out = releaseDeletedGroupChildren(survivors, before, removed);
    const a = out.find((n) => n.id === 'a') as GroupNodeLike & { extent?: string };
    expect(a.parentId).toBe('grp_1');
    expect(a.extent).toBe('parent');
  });

  it('★ 被删的**非组**节点即便是某节点的 `parentId` 也**不释放**（源判据 `type === "group"`）', () => {
    const pseudo = node('p', 500, 500); // 非组节点
    const child = node('c', 10, 20, { parentId: 'p' });
    const list = [pseudo, child];
    const { before, survivors, removed } = kill(list, 'p');
    const out = releaseDeletedGroupChildren(survivors, before, removed);
    expect(out.find((n) => n.id === 'c')?.parentId).toBe('p');
  });

  it('★ **别的组**的成员不受影响', () => {
    const otherChild = node('oc', 1, 2, { parentId: 'grp_other' });
    const list = [...grouped(), node('grp_other', 0, 0, { type: 'group' }), otherChild];
    const { before, survivors, removed } = kill(list, 'grp_1');
    const out = releaseDeletedGroupChildren(survivors, before, removed);
    expect(out.find((n) => n.id === 'oc')?.parentId).toBe('grp_other');
  });

  it('★ 一次删**两个组** ⇒ 两组的孩子各自释放', () => {
    const g1 = groupSelectedNodes(
      [
        node('a', 100, 100, { width: 200, height: 180, selected: true }),
        node('b', 400, 300, { width: 200, height: 180, selected: true }),
      ],
      () => 'grp_1',
      1,
    );
    if (!g1.ok) throw new Error('应当成功');
    const g2 = groupSelectedNodes(
      [
        node('c', 900, 900, { width: 200, height: 180, selected: true }),
        node('d', 1200, 1200, { width: 200, height: 180, selected: true }),
      ],
      () => 'grp_2',
      2,
    );
    if (!g2.ok) throw new Error('应当成功');
    const list = [...g1.nodes, ...g2.nodes];
    const { before, survivors, removed } = kill(list, 'grp_1', 'grp_2');
    const out = releaseDeletedGroupChildren(survivors, before, removed);
    expect(out.find((n) => n.id === 'a')?.position).toEqual({ x: 100, y: 100 });
    expect(out.find((n) => n.id === 'c')?.position).toEqual({ x: 900, y: 900 });
  });

  it('★★ **往返不变**：成组 → 删组释放 ⇒ 成员坐标与最初完全一致', () => {
    const before = [
      node('a', 100, 100, { width: 200, height: 180, selected: true }),
      node('b', 400, 300, { width: 200, height: 180, selected: true }),
    ];
    const g = groupSelectedNodes(before, () => 'grp_1', 1);
    if (!g.ok) throw new Error('应当成功');
    const { before: pre, survivors, removed } = kill(g.nodes, 'grp_1');
    const out = releaseDeletedGroupChildren(survivors, pre, removed);
    for (const orig of before) {
      const back = out.find((n) => n.id === orig.id)!;
      expect(back.position).toEqual(orig.position);
      expect(back.width).toBe(orig.width);
      expect(back.height).toBe(orig.height);
    }
  });

  it('没有任何**组**被删 ⇒ 内容不变', () => {
    const list = grouped();
    const out = releaseDeletedGroupChildren(list, list, new Set(['nope']));
    expect(out.map((n) => n.id)).toEqual(list.map((n) => n.id));
  });
});

describe('selectedGroupIdOf（原 `_Component42.jsx:112-129` 的 `H`）', () => {
  it('没有选中节点 ⇒ null', () => {
    expect(selectedGroupIdOf([node('a', 0, 0)])).toBeNull();
  });

  it('★ 第一个选中节点没有 parentId ⇒ null（**选中组节点本身不算**）', () => {
    expect(selectedGroupIdOf([node('g', 0, 0, { type: 'group', selected: true })])).toBeNull();
    // 组节点排在前面时，即便后面跟着组内成员也返回 null（源版只看 B[0]）
    expect(
      selectedGroupIdOf([
        node('g', 0, 0, { type: 'group', selected: true }),
        node('a', 1, 1, { parentId: 'g', selected: true }),
      ]),
    ).toBeNull();
  });

  it('全部选中节点同属一个组 ⇒ 返回该组 id', () => {
    expect(
      selectedGroupIdOf([
        node('a', 1, 1, { parentId: 'g', selected: true }),
        node('b', 2, 2, { parentId: 'g', selected: true }),
      ]),
    ).toBe('g');
  });

  it('分属不同的组 ⇒ null', () => {
    expect(
      selectedGroupIdOf([
        node('a', 1, 1, { parentId: 'g1', selected: true }),
        node('b', 2, 2, { parentId: 'g2', selected: true }),
      ]),
    ).toBeNull();
  });

  it('未选中的节点不参与判定', () => {
    expect(
      selectedGroupIdOf([
        node('a', 1, 1, { parentId: 'g1', selected: true }),
        node('b', 2, 2, { parentId: 'g2', selected: false }),
      ]),
    ).toBe('g1');
  });
});
