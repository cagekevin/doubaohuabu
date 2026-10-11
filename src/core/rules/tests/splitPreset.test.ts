/**
 * 「拆分并套用节点预设」单测（原 `splitApplyPreset`，`shared.js:28646-28905`）
 *
 * ⚠️ 断言**逐值对源**（入口节点判定 / 每份的坐标公式 / 引用重写 / 三类边的接法），
 *    不是"不崩"式自证。
 * ⚠️ 夹具用最小替身（`as unknown as CanvasNode`）：本规则只读 `data.text` 与 `position`，
 *    构造完整 `TextNodeData` 与本规则语义无关。
 */

import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@/stable/model/node';
import type { CanvasEdge, GraphPreset } from '@/stable/model/project';
import { SPLIT_NODE_GAP, SPLIT_NODE_HEIGHT, SPLIT_NODE_WIDTH } from '@/constants';
import { planSplitWithPreset } from '../splitPreset';
import type { SplitPart } from '../splitText';

const node = (id: string, x: number, y: number, text = ''): CanvasNode =>
  ({ id, type: 'text', position: { x, y }, data: { text } }) as unknown as CanvasNode;
const edge = (source: string, target: string): CanvasEdge =>
  ({ id: `e_${source}_${target}`, source, target, type: 'interactive' }) as unknown as CanvasEdge;

const SOURCE = node('src', 100, 200, '镜头1：一只猫\n镜头2：一只狗');

/** 预设：`a`（入口，入度 0）→ `b`；`b` 是数组首元素之外的那个 —— 用来验证"按入度挑"而不是"按顺序挑" */
const PRESET: GraphPreset = {
  id: 'pre_1_1',
  name: '两节点套路',
  kind: 'graph',
  nodes: [node('b', 300, 200, '@[a|上一步]'), node('a', 0, 0)],
  edges: [edge('a', 'b')],
};

/** 测试替身：id / data / edge 三个注入点 */
function deps() {
  let seq = 0;
  return {
    newTextData: (part: SplitPart) => ({ label: part.title, text: part.content }),
    nextNodeId: (type: string) => `${type}_${++seq}`,
    makeEdge: (e: { source: string; target: string }) => edge(e.source, e.target),
  };
}
const run = (over: Partial<Parameters<typeof planSplitWithPreset>[0]> = {}) =>
  planSplitWithPreset({
    source: SOURCE,
    preset: PRESET,
    keywords: ['镜头'],
    ...deps(),
    ...over,
  });

describe('planSplitWithPreset（原 `splitApplyPreset`）· 失败档', () => {
  it('预设缺失 / 不是 `graph` ⇒ `preset-missing`（源 28662-28675）', () => {
    expect(run({ preset: undefined })).toEqual({ ok: false, reason: 'preset-missing' });
    expect(run({ preset: { ...PRESET, kind: 'other' } as unknown as GraphPreset })).toEqual({
      ok: false,
      reason: 'preset-missing',
    });
  });

  it('预设 `nodes` 为空 ⇒ `preset-empty`（源 28678-28688）', () => {
    expect(run({ preset: { ...PRESET, nodes: [], edges: [] } })).toEqual({
      ok: false,
      reason: 'preset-empty',
    });
  });

  it('拆不出两段 ⇒ 有自定义关键词时 `no-keyword`、否则 `not-splittable`（源 28692-28702）', () => {
    expect(run({ source: node('src2', 0, 0, '没有关键词的一段话') })).toEqual({
      ok: false,
      reason: 'no-keyword',
    });
    expect(run({ source: node('src2', 0, 0, '没有关键词的一段话'), keywords: [] })).toEqual({
      ok: false,
      reason: 'not-splittable',
    });
  });
});

describe('planSplitWithPreset · 成功档', () => {
  it('拆分节点：N 段 ⇒ N 个文本框，同 `x`、`y` 按 `i × (400 + 80)` 往下排（源 28745-28768）', () => {
    const r = run();
    if (!r.ok) throw new Error('应当成功');
    const split = r.plan.nodes.slice(0, 2);
    expect(split.map((n) => n.position.x)).toEqual([100, 100]);
    expect(split.map((n) => n.position.y)).toEqual([
      200,
      200 + (SPLIT_NODE_HEIGHT + SPLIT_NODE_GAP),
    ]);
    expect(split.map((n) => n.width)).toEqual([SPLIT_NODE_WIDTH, SPLIT_NODE_WIDTH]);
    expect(split.every((n) => n.selected === true)).toBe(true);
    expect(r.plan.count).toBe(2);
    expect(r.plan.newIds).toHaveLength(2);
  });

  it('★ 入口节点按**入度 0** 挑（不是"数组第一个"）：`b` 是首元素但入度 1 ⇒ 入口是 `a`', () => {
    const r = run();
    if (!r.ok) throw new Error('应当成功');
    // 其余节点 = 整份预设里除入口之外的（此处只有 `b`）⇒ 每份 1 个 × 2 段 = 2
    const others = r.plan.nodes.slice(2);
    expect(others).toHaveLength(2);
    // x = 段.x + 600 + 30 + (b.x − a.x) × 0.3 = 100 + 630 + 300 × 0.3 = 820
    expect(others.map((n) => n.position.x)).toEqual([820, 820]);
    // y = 段.y + (b.y − a.y) = 段.y + 200 ⇒ 400 / 880（第二段的 段.y = 200 + 480）
    expect(others.map((n) => n.position.y)).toEqual([400, 880]);
  });

  it('★ 引用重写：`@[旧id|名]` ⇒ `@[新id|名]`（源 28800-28832）', () => {
    // `c` 引用 `b`（两者都在 others 里 ⇒ 都会被映射）
    const preset: GraphPreset = {
      ...PRESET,
      nodes: [node('b', 300, 200), node('a', 0, 0), node('c', 600, 200, '@[b|上一步]')],
      edges: [edge('a', 'b')],
    };
    const r = run({ preset });
    if (!r.ok) throw new Error('应当成功');
    const c1 = r.plan.nodes.slice(2).find((n) => (n.data.text as string).startsWith('@['));
    expect(c1?.data.text).toMatch(/^@\[text_\d+\|上一步\]$/);
  });

  it('⚠️ 指向**入口节点**的引用**不参与映射**（源亦如此 ⇒ 会悬空；见 `splitPreset.ts` 头注）', () => {
    const r = run();
    if (!r.ok) throw new Error('应当成功');
    // `b.data.text` 是 `@[a|上一步]`，而 `a` 是入口（不在 `others` 里 ⇒ 无映射）
    const b1 = r.plan.nodes.slice(2)[0];
    expect(b1?.data.text).toBe('@[a|上一步]');
  });

  it('`materialIds` 逐项映射（源 28814-28822）', () => {
    const preset: GraphPreset = {
      ...PRESET,
      nodes: [
        node('b', 300, 200),
        node('a', 0, 0),
        { ...node('c', 600, 200), data: { materialIds: ['b', 'lib_x'] } } as unknown as CanvasNode,
      ],
      edges: [edge('a', 'b')],
    };
    const r = run({ preset });
    if (!r.ok) throw new Error('应当成功');
    const c1 = r.plan.nodes.slice(2).find((n) => Array.isArray(n.data.materialIds));
    const got = c1?.data.materialIds as string[];
    expect(got[0]).toMatch(/^text_\d+$/); // `b`（预设节点 id）⇒ 映射到新 id
    expect(got[1]).toBe('lib_x'); // 不在映射表里 ⇒ 原样
  });

  it('其余节点**删 `height`**（源 `delete he.height`）', () => {
    const withHeight = {
      ...PRESET,
      nodes: [node('b', 300, 200), node('a', 0, 0)],
    };
    const r = run({ preset: withHeight });
    if (!r.ok) throw new Error('应当成功');
    const first = r.plan.nodes.slice(2)[0];
    expect(first !== undefined && 'height' in first).toBe(false);
  });

  it('三类边：份内边 × 段数 · 入口出边 ⇒ **各份**的首个拆分节点 · 入口入边 ⇒ **第一份**首个', () => {
    /**
     * ⚠️ 夹具是**刻意的**：要让"入口入边"那条路可达，入口必须走**回退**（`nodes[0]`）——
     *    因为"入度为 0 ⇒ 选为入口"与"有边指向入口"**互斥**。
     *    这里 `a` 入度 1、`b` 入度 2、`c` 入度 1 ⇒ 无入度 0 的 ⇒ 入口 = `a`（回退）。
     */
    const preset: GraphPreset = {
      ...PRESET,
      nodes: [node('a', 0, 0), node('b', 300, 200), node('c', 600, 400)],
      edges: [edge('b', 'a'), edge('a', 'b'), edge('b', 'c')],
    };
    const r = run({ preset });
    if (!r.ok) throw new Error('应当成功');
    const [s1, s2] = r.plan.newIds;
    // 每份：份内边（b→c）1 条 + 入口出边（a→b）1 条 ⇒ 2 × 2 = 4；再加入口入边 1 条 ⇒ 5
    expect(r.plan.edges).toHaveLength(5);
    // 入口出边：source 必须是**该份**的拆分节点
    expect(r.plan.edges.some((e) => e.source === s1)).toBe(true);
    expect(r.plan.edges.some((e) => e.source === s2)).toBe(true);
    // 入口入边（b → a）：只接**第一份**的首个拆分节点
    expect(r.plan.edges.some((e) => e.target === s1)).toBe(true);
    expect(r.plan.edges.some((e) => e.target === s2)).toBe(false);
  });

  it('`focusIds` = **全部**新增节点（源 `[...E, ...I.map(id)]`）', () => {
    const r = run();
    if (!r.ok) throw new Error('应当成功');
    expect(r.plan.focusIds).toEqual(r.plan.nodes.map((n) => n.id));
    expect(r.plan.focusIds.length).toBe(2 + 2); // 2 段拆分 + 其余节点 1 个 × 2 份
  });
});
