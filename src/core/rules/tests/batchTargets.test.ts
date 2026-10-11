/**
 * 批量目标与视觉顺序单测（原 `v3` 41551 / `$p` 41574 / `y3` 41550）
 */

import { describe, expect, it } from 'vitest';
import {
  BATCH_ROW_TOLERANCE,
  nodeDisplayName,
  orderBatchTargets,
  orderBatchTargetsOf,
} from '../batchTargets';
import { GEN_VIDEO_LABEL, TEXT_NODE_LABEL, type CanvasNode } from '@/stable/model/node';

const node = (
  id: string,
  type: string,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): { id: string; type: string; position: { x: number; y: number }; data: unknown } => ({
  id,
  type,
  position: { x, y },
  data,
});

describe('nodeDisplayName（原 v3）', () => {
  it('★ 有 label / name 且不等于「文生视频」⇒ 直接用', () => {
    expect(nodeDisplayName({ type: 'text', data: { label: '我的文案' } })).toBe('我的文案');
    expect(nodeDisplayName({ type: 'text', data: { name: '名字' } })).toBe('名字');
    // label 优先于 name
    expect(nodeDisplayName({ type: 'text', data: { label: 'L', name: 'N' } })).toBe('L');
  });

  it('★ `genvideo` + label 恰是「文生视频」⇒ 取 text 前 18 字', () => {
    const long = '一'.repeat(30);
    expect(nodeDisplayName({ type: 'genvideo', data: { label: GEN_VIDEO_LABEL, text: long } })).toBe('一'.repeat(18));
  });

  it('★ `genvideo` 且 text 为空 ⇒ 回落「文生视频」', () => {
    expect(nodeDisplayName({ type: 'genvideo', data: { label: GEN_VIDEO_LABEL } })).toBe(GEN_VIDEO_LABEL);
    expect(nodeDisplayName({ type: 'genvideo', data: { text: '   ' } })).toBe(GEN_VIDEO_LABEL);
  });

  it('★ 文本节点无 label/name ⇒ 取 text 前 18 字；空 ⇒ 「文本框」', () => {
    const long = 'x'.repeat(25);
    expect(nodeDisplayName({ type: 'text', data: { text: long } })).toBe('x'.repeat(18));
    expect(nodeDisplayName({ type: 'text', data: {} })).toBe(TEXT_NODE_LABEL);
  });

  it('★ text 会先过 `stripHtml`（原 `In`：解实体 + 剥标签）', () => {
    expect(nodeDisplayName({ type: 'text', data: { text: '<p>a&nbsp;b</p>' } })).toBe('a b');
  });

  it('label 是 `文生视频` 但节点**不是** genvideo ⇒ 仍返回它（源版那个"冗余"分支）', () => {
    expect(nodeDisplayName({ type: 'text', data: { label: GEN_VIDEO_LABEL } })).toBe(GEN_VIDEO_LABEL);
  });

  it('非字符串 label ⇒ `String()` 归一', () => {
    expect(nodeDisplayName({ type: 'text', data: { label: 42 } })).toBe('42');
  });

  it('data 缺失 / 非对象 ⇒ 不崩', () => {
    expect(nodeDisplayName({ type: 'text', data: null })).toBe(TEXT_NODE_LABEL);
    expect(nodeDisplayName({ type: 'text', data: undefined })).toBe(TEXT_NODE_LABEL);
  });
});

describe('orderBatchTargets（原 $p）', () => {
  it('★ 只收 `text` / `genvideo`', () => {
    const got = orderBatchTargets([
      node('t', 'text', 0, 0, { text: 'A' }),
      node('g', 'genvideo', 0, 0, { text: 'B' }),
      node('m', 'material', 0, 0, {}),
      node('i', 'imggen', 0, 0, {}),
      node('v', 'video', 0, 0, {}),
    ]);
    expect(got.map((t) => t.nodeId)).toEqual(['t', 'g']);
  });

  it('★ 先按 y 再按 x 全排序（上下 → 左右）', () => {
    const got = orderBatchTargets([
      node('c', 'text', 500, 20, { text: 'c' }),
      node('a', 'text', 100, 10, { text: 'a' }),
      node('d', 'text', 100, 30, { text: 'd' }),
      node('b', 'text', 300, 10, { text: 'b' }),
    ]);
    /**
     * ★ **行锚点语义**（容易误判，故显式锁住）：归并是拿每个节点的 `y` 与
     *   **该行第一个节点的 `y`** 比（不是与"上一个节点"比）⇒ 上面 4 个的 y 是
     *   10/10/20/30，跨度 20 < 120 ⇒ **全部归成一行**，之后**纯按 x** 排：
     *   a(100) → d(100) → b(300) → c(500)。
     *   （直觉上的「第一行 a,b；第二行 c,d」在本算法下**不成立**。）
     */
    expect(got.map((t) => t.nodeId)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('★ 行内按 x 排 = 该行所有节点的 x（y 不参与行内排序）', () => {
    const got = orderBatchTargets([
      node('deep', 'text', 10, 400, {}), // y 更大但在左边
      node('shallow', 'text', 900, 300, {}),
    ]);
    // Δy = 100 <= 120 ⇒ 同一行 ⇒ 按 x：deep(10) 先
    expect(got.map((t) => t.nodeId)).toEqual(['deep', 'shallow']);
  });

  it('★ 行归并：`|Δy| <= 120` 视为同一行，行内按 x 排', () => {
    const got = orderBatchTargets([
      node('right', 'text', 400, 100, { text: 'r' }),
      node('left', 'text', 10, 220, { text: 'l' }), // Δy=120 ⇒ 同行
      node('next', 'text', 999, 221, { text: 'n' }), // Δy=121 ⇒ 下一行
    ]);
    expect(got.map((t) => t.nodeId)).toEqual(['left', 'right', 'next']);
  });

  it('★ 容差边界：恰好 120 归并、121 不归并', () => {
    expect(BATCH_ROW_TOLERANCE).toBe(120);
    const same = orderBatchTargets([
      node('a', 'text', 100, 0, {}),
      node('b', 'text', 0, 120, {}),
    ]);
    expect(same.map((t) => t.nodeId)).toEqual(['b', 'a']); // b 在左 ⇒ 先

    const diff = orderBatchTargets([
      node('a', 'text', 100, 0, {}),
      node('b', 'text', 0, 121, {}),
    ]);
    expect(diff.map((t) => t.nodeId)).toEqual(['a', 'b']); // 不同行 ⇒ 按 y
  });

  it('position 缺失 ⇒ 当 0 处理（不崩）', () => {
    const got = orderBatchTargets([
      { id: 'a', type: 'text', data: {} },
      { id: 'b', type: 'text', position: null, data: {} },
    ]);
    expect(got.map((t) => t.nodeId)).toEqual(['a', 'b']);
    expect(got[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('带上 `name`（= `nodeDisplayName`）', () => {
    const got = orderBatchTargets([node('a', 'text', 0, 0, { label: '甲' })]);
    expect(got[0]!.name).toBe('甲');
  });

  it('非节点项 / 空数组不崩', () => {
    expect(orderBatchTargets([])).toEqual([]);
    expect(orderBatchTargets([null as never])).toEqual([]);
  });

  it('`orderBatchTargetsOf` 与手写投影等价（可直接吃 `CanvasNode[]`）', () => {
    const nodes = [
      { id: 'g', type: 'genvideo', position: { x: 0, y: 200 }, data: { text: '片' } },
      { id: 't', type: 'text', position: { x: 0, y: 10 }, data: { text: '文' } },
    ] as unknown as CanvasNode[];
    expect(orderBatchTargetsOf(nodes).map((t) => t.nodeId)).toEqual(['t', 'g']);
  });
});
