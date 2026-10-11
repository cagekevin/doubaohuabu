/**
 * 提示词预设单测（原 `addPreset`，`shared.js:27857-27873`）
 *
 * ⚠️ 断言**逐值对源**（id 两段都 base36 / `name` 先 trim 再兜底 / `content || ''`）——
 *    不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@/stable/model/node';
import type { CanvasEdge } from '@/stable/model/project';
import { makeGraphPreset, makePromptPreset } from '../preset';

describe('makePromptPreset（原 `addPreset`）', () => {
  it('id 形如 `pre_<base36 时间>_<base36 计数>`（★ 两段都是 base36）', () => {
    expect(makePromptPreset({ name: 'x' }, 1_700_000_000_000, 7).id).toBe(
      `pre_${(1_700_000_000_000).toString(36)}_${(7).toString(36)}`,
    );
    // ★ 反证：seq 段**不是**十进制（与 `makeNodeId` 的 `${seq}` 不同）
    expect(makePromptPreset({ name: 'x' }, 1, 36).id).toBe('pre_1_10');
    expect(makePromptPreset({ name: 'x' }, 1, 36).id).not.toBe('pre_1_36');
  });

  it('name：先 `trim`，空 / 全空白 / 缺省 ⇒ `未命名预设`', () => {
    expect(makePromptPreset({ name: '  我的提示词  ' }, 1, 1).name).toBe('我的提示词');
    expect(makePromptPreset({ name: '' }, 1, 1).name).toBe('未命名预设');
    expect(makePromptPreset({ name: '   ' }, 1, 1).name).toBe('未命名预设');
    expect(makePromptPreset({}, 1, 1).name).toBe('未命名预设');
  });

  it('content：缺省 / 空串 ⇒ 空串（源的 `|| \'\'`）', () => {
    expect(makePromptPreset({ name: 'a', content: '一只橘猫' }, 1, 1).content).toBe('一只橘猫');
    expect(makePromptPreset({ name: 'a' }, 1, 1).content).toBe('');
    expect(makePromptPreset({ name: 'a', content: '' }, 1, 1).content).toBe('');
  });

  it('★ 产物**没有 `kind`**（提示词预设与图预设在同一个数组里，靠 `kind` 区分）', () => {
    expect(makePromptPreset({ name: 'a', content: 'b' }, 1, 1)).not.toHaveProperty('kind');
    expect(Object.keys(makePromptPreset({ name: 'a', content: 'b' }, 1, 1)).sort()).toEqual([
      'content',
      'id',
      'name',
    ]);
  });
});

describe('makeGraphPreset（原 `addNodePreset`）', () => {
  /**
   * 最小节点替身 —— ⚠️ 本函数**只碰 `id`/`selected`** 这两处，构造完整 `TextNode` 的 `data` 形状
   * 与本函数的语义无关（那是别的模块的契约，另有测试）。故这里用替身，不假装造了个真节点。
   */
  const node = (id: string, selected?: boolean): CanvasNode =>
    ({
      id,
      type: 'text',
      position: { x: 1, y: 2 },
      data: {},
      ...(selected === undefined ? {} : { selected }),
    }) as unknown as CanvasNode;
  const edge = (id: string): CanvasEdge =>
    ({ id, source: 'a', target: 'b', type: 'interactive' }) as unknown as CanvasEdge;

  it('id 与 `makePromptPreset` **同一形状**（`pre_<base36 时间>_<base36 计数>`）', () => {
    expect(makeGraphPreset({ nodes: [], edges: [] }, 1_700_000_000_000, 7).id).toBe(
      `pre_${(1_700_000_000_000).toString(36)}_${(7).toString(36)}`,
    );
    // 与提示词预设**同族**：同 now/同 seq ⇒ 同前缀规则（只是本仓 seq 是同一个计数器）
    expect(makeGraphPreset({ nodes: [], edges: [] }, 1, 36).id).toBe('pre_1_10');
  });

  it('name：先 `trim`，空 / 全空白 / 缺省 ⇒ `未命名节点预设`（★ 与提示词预设的兜底**不同字**）', () => {
    expect(makeGraphPreset({ name: '  我的套路  ', nodes: [], edges: [] }, 1, 1).name).toBe('我的套路');
    expect(makeGraphPreset({ name: '', nodes: [], edges: [] }, 1, 1).name).toBe('未命名节点预设');
    expect(makeGraphPreset({ name: '   ', nodes: [], edges: [] }, 1, 1).name).toBe('未命名节点预设');
    expect(makeGraphPreset({ nodes: [], edges: [] }, 1, 1).name).toBe('未命名节点预设');
  });

  it('`kind` 恒为 `graph`（同数组混装靠它区分）', () => {
    expect(makeGraphPreset({ nodes: [], edges: [] }, 1, 1).kind).toBe('graph');
  });

  it('nodes：**恒 `selected: false`**（源 `{...m, selected: false}`）—— 且**不改传入对象**', () => {
    const input = [node('n1', true), node('n2')];
    const got = makeGraphPreset({ nodes: input, edges: [] }, 1, 1);
    expect(got.nodes.map((n) => n.selected)).toEqual([false, false]);
    // 不可变：原数组里那条仍是 true（纯函数原则）
    //   ⚠️ `?.` 是本仓 `noUncheckedIndexedAccess` 要求的（`input[0]` 类型上是 `T | undefined`），
    //      不是"实际可能没有"—— 上面刚构造了两条。
    expect(input[0]?.selected).toBe(true);
  });

  it('edges：**原样收**（本仓 `CanvasEdge` 无可清洗字段 ⇒ 不照抄源的"删 selected"）', () => {
    const input = [edge('e1')];
    const got = makeGraphPreset({ nodes: [], edges: input }, 1, 1);
    expect(got.edges).toEqual(input);
    expect(got.edges).not.toBe(input); // 新数组（不可变）
  });
});
