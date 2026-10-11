/**
 * 画布「复制 / 粘贴节点」单测（原 `copyNodes` / `pasteNodes`，`shared.js:32041-32236`）
 *
 * ⚠️ 断言**逐值对源**（三档 id 前缀 / 子节点不偏移 / 外接框居中 / 引用重写 / 反选既有）——
 *    不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { buildClipboard, collectCopyIds, planPaste, type PasteIdKind } from '../clipboard';
import type { CanvasEdge } from '@/stable/model/project';
import type { CanvasNode } from '@/stable/model/node';

/** 造一个节点（只给用得上的字段） */
const node = (
  id: string,
  opts: {
    type?: string;
    selected?: boolean;
    parentId?: string;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    data?: Record<string, unknown>;
  } = {},
): CanvasNode =>
  ({
    id,
    type: opts.type ?? 'text',
    selected: opts.selected ?? false,
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
    position: opts.position ?? { x: 0, y: 0 },
    ...(opts.width === undefined ? {} : { width: opts.width }),
    ...(opts.height === undefined ? {} : { height: opts.height }),
    data: opts.data ?? { text: '', aspectRatio: '16:9', duration: 7, linkOrder: [], referenceOrder: [], materialIds: [], styleIds: [] },
  }) as unknown as CanvasNode;

const edge = (id: string, source: string, target: string): CanvasEdge => ({
  id,
  source,
  target,
  type: 'interactive',
});

describe('collectCopyIds（原 `copyNodes` 前半）', () => {
  it('没有选中 ⇒ 空（源此时直接 return，不覆盖剪贴板）', () => {
    expect(collectCopyIds([node('a'), node('b')])).toEqual([]);
  });

  it('★ 选中节点 **+ 其子孙**（`parentId` 闭包，不假设树深）', () => {
    const nodes = [
      node('g', { type: 'group', selected: true }),
      node('c1', { parentId: 'g' }),
      node('c2', { parentId: 'c1' }),
      node('other'),
    ];
    expect(collectCopyIds(nodes)).toEqual(['g', 'c1', 'c2']);
  });

  it('多选 + 后代按发现顺序追加', () => {
    const nodes = [node('a', { selected: true }), node('b', { selected: true }), node('k', { parentId: 'a' })];
    expect(collectCopyIds(nodes)).toEqual(['a', 'b', 'k']);
  });
});

describe('buildClipboard（原 `copyNodes` 后半）', () => {
  it('无选中 ⇒ `null`', () => {
    expect(buildClipboard([node('a')], [])).toBeNull();
  });

  it('★ 只留**两端都在选中集合**里的边', () => {
    const nodes = [node('a', { selected: true }), node('b', { selected: true }), node('c')];
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'a', 'c'), edge('e3', 'c', 'a')];
    const clip = buildClipboard(nodes, edges);
    expect(clip?.edges.map((e) => e.id)).toEqual(['e1']);
    expect(clip?.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('深拷贝（改产物不影响原节点）', () => {
    const nodes = [node('a', { selected: true, data: { text: 'x' } })];
    const clip = buildClipboard(nodes, []);
    (clip?.nodes[0]!.data as Record<string, unknown>).text = 'y';
    expect((nodes[0]!.data as Record<string, unknown>).text).toBe('x');
  });
});

describe('planPaste（原 `pasteNodes`）', () => {
  /** 记录每次 id 工厂收到的**档位**（用于反证"三档前缀"） */
  const idFactory = (): { next: (k: PasteIdKind) => string; kinds: PasteIdKind[] } => {
    const kinds: PasteIdKind[] = [];
    let seq = 0;
    return {
      kinds,
      next: (k) => {
        kinds.push(k);
        seq += 1;
        return `new_${seq}`;
      },
    };
  };

  it('剪贴板空 ⇒ `null`（源直接 return，**不 commit**）', () => {
    expect(planPaste({ clipboard: { nodes: [], edges: [] }, nodes: [], position: null, nextNodeId: () => 'x' })).toBeNull();
  });

  it('★ 新 id 只分**三档**：material→`material`、text→`text`、**其余一律 `account`**', () => {
    const f = idFactory();
    const clip = buildClipboard(
      [
        node('m', { type: 'material', selected: true }),
        node('t', { type: 'text', selected: true }),
        node('g', { type: 'imggen', selected: true }),
      ],
      [],
    )!;
    planPaste({ clipboard: clip, nodes: [], position: null, nextNodeId: f.next });
    // ⚠️ 第三档是 `account` —— 源对 `imggen`/`genvideo` 也走 `a_` 前缀（逐字保留的 quirk）
    expect(f.kinds).toEqual(['material', 'text', 'account']);
  });

  it('★ 没给落点 ⇒ 固定 `+50/+50`', () => {
    const clip = buildClipboard([node('a', { selected: true, position: { x: 10, y: 20 } })], [])!;
    const plan = planPaste({ clipboard: clip, nodes: [], position: null, nextNodeId: () => 'n1' })!;
    expect(plan.nodes[0]!.position).toEqual({ x: 60, y: 70 });
  });

  it('★ 给了落点 ⇒ 让**外接框中心**落到落点（宽高缺省 200×180）', () => {
    const clip = buildClipboard([node('a', { selected: true, position: { x: 0, y: 0 } })], [])!;
    const plan = planPaste({ clipboard: clip, nodes: [], position: { x: 500, y: 500 }, nextNodeId: () => 'n1' })!;
    // 外接框中心 = (0+200/2, 0+180/2) = (100, 90) ⇒ 偏移 = 500-100 / 500-90
    expect(plan.nodes[0]!.position).toEqual({ x: 400, y: 410 });
  });

  it('★ 子节点（父也在剪贴板里）⇒ 位置**原样**、`parentId` 重映射', () => {
    const nodes = [
      node('g', { type: 'group', selected: true, position: { x: 0, y: 0 } }),
      node('c', { parentId: 'g', position: { x: 5, y: 6 } }),
    ];
    const clip = buildClipboard(nodes, [])!;
    let i = 0;
    const plan = planPaste({
      clipboard: clip,
      nodes,
      position: { x: 1000, y: 1000 },
      nextNodeId: () => `n${++i}`,
    })!;
    const parent = plan.nodes.find((n) => n.id === 'n1')!;
    const child = plan.nodes.find((n) => n.id === 'n2')!;
    expect(child.parentId).toBe('n1');
    // 子节点位置**不加偏移**（父已整体平移）
    expect(child.position).toEqual({ x: 5, y: 6 });
    // 父节点是平移过的（证明确实"父整体平移、子不动"）
    expect(parent.position).not.toEqual({ x: 0, y: 0 });
  });

  it('★ 正文 `@[老id|名]` 重写为**新 id**；不在映射里的引用保持原样', () => {
    const nodes = [
      node('m', { type: 'material', selected: true }),
      node('t', { selected: true, data: { text: '看 @[m|小红] 和 @[zzz|别人]' } }),
    ];
    const clip = buildClipboard(nodes, [])!;
    let i = 0;
    const plan = planPaste({
      clipboard: clip,
      nodes,
      position: null,
      nextNodeId: () => `n${++i}`,
    })!;
    const text = plan.nodes.find((n) => n.id === 'n2')!;
    expect((text.data as unknown as Record<string, unknown>).text).toBe('看 @[n1|小红] 和 @[zzz|别人]');
  });

  it('★ `materialIds` 重映射（按老 id → 新 id；未命中的保持）', () => {
    const nodes = [
      node('m', { type: 'material', selected: true }),
      node('t', { selected: true, data: { text: 'x', materialIds: ['m', 'zzz'] } }),
    ];
    const clip = buildClipboard(nodes, [])!;
    let i = 0;
    const plan = planPaste({ clipboard: clip, nodes, position: null, nextNodeId: () => `n${++i}` })!;
    const text = plan.nodes.find((n) => n.id === 'n2')!;
    expect((text.data as unknown as Record<string, unknown>).materialIds).toEqual(['n1', 'zzz']);
  });

  it('★ 既有节点**全部反选**，粘贴节点 `selected: true`', () => {
    const existing = [node('old', { selected: true }), node('idle')];
    const clip = buildClipboard([node('a', { selected: true })], [])!;
    const plan = planPaste({ clipboard: clip, nodes: existing, position: null, nextNodeId: () => 'n1' })!;
    expect(plan.nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(['n1']);
    expect(plan.nodes.map((n) => n.id)).toEqual(['old', 'idle', 'n1']);
  });

  it('★ `edgePairs` 只含**两端都在剪贴板**的边（id 交给调用方工厂）', () => {
    const nodes = [node('a', { selected: true }), node('b', { selected: true })];
    const clip = buildClipboard(nodes, [edge('e1', 'a', 'b'), edge('e2', 'a', 'zzz')])!;
    let i = 0;
    const plan = planPaste({ clipboard: clip, nodes, position: null, nextNodeId: () => `n${++i}` })!;
    expect(plan.edgePairs).toEqual([{ source: 'n1', target: 'n2' }]);
  });
});
