import { describe, expect, it } from 'vitest';
import type { NodeType } from '@/stable/model/node';
import { NODE_DEFAULTS, defaultNodeData, inheritGenNodeData } from '../defaults';

/** 造一个节点（只给 `inheritGenNodeData` 用到的两字段） */
const node = (type: string, data: Record<string, unknown>) => ({ type, data });

/**
 * `defaultNodeData` —— ★ 它必须是**深拷贝**（8 类默认值里有嵌套数组），
 * 且机制已统一到 `structuredClone`（与 `core/rules/clipboard` / `state/slices/canvas` 同一写法）。
 * ⚠️ 这两条一起才有意义：只测"不共享引用"会漏掉"嵌套数组共享"这种最阴的写法（浅拷贝）。
 */
describe('defaultNodeData（8 类默认 data 的深拷贝）', () => {
  it('★ 两次调用**不共享**任何嵌套数组（改一份不污染另一份，也不污染常量）', () => {
    const a = defaultNodeData('imggen');
    const b = defaultNodeData('imggen');
    expect(a.styleIds).not.toBe(b.styleIds);
    expect(a.results).not.toBe(b.results);
    a.styleIds.push('x');
    a.results.push({ url: 'u' } as never);
    expect(b.styleIds).toEqual([]);
    expect(defaultNodeData('imggen').results).toEqual([]);
  });

  it('★ 输出与"JSON 轮"**逐字等价**（这就是当时敢换机制的前提：定义域只有纯 JSON 值）', () => {
    // ⚠️ 类型集合**从真源取**（别像第一版那样手写 8 个字符串 —— 手写错一个就会静默拿到 undefined）
    for (const t of Object.keys(NODE_DEFAULTS) as NodeType[]) {
      expect(defaultNodeData(t)).toEqual(JSON.parse(JSON.stringify(defaultNodeData(t))));
    }
  });

  it('★ 未知类型**响亮报错**（不许静默返回 undefined）', () => {
    expect(() => defaultNodeData('not-a-type' as NodeType)).toThrow(/未知节点类型/);
  });
});

describe('inheritGenNodeData（原 `addGenVideo` 29496 / `addGenImage` 29536）', () => {
  it('★ 无同类节点 ⇒ 空 patch（**不编造**）', () => {
    expect(inheritGenNodeData('genvideo', [])).toEqual({});
    expect(inheritGenNodeData('imggen', [node('text', { aspectRatio: '16:9' })])).toEqual({});
  });

  it('★ `genvideo`：上一个同类节点的设置**全沿用**（真值）', () => {
    const prev = node('genvideo', {
      aspectRatio: '16:9',
      duration: 10,
      model: 'm1',
      sendAccount: 'acc',
      channel: 'kling',
      styleIds: ['a', 'b'],
    });
    expect(inheritGenNodeData('genvideo', [prev])).toEqual({
      aspectRatio: '16:9',
      sendAccount: 'acc',
      styleIds: ['a', 'b'],
      duration: 10,
      model: 'm1',
      channel: 'kling',
    });
  });

  it('★ `genvideo` 的 `model` 用**非 `undefined`/`null`** 判断（空串也沿用，源逐字）', () => {
    expect(inheritGenNodeData('genvideo', [node('genvideo', { model: '' })]).model).toBe('');
    expect(inheritGenNodeData('genvideo', [node('genvideo', { model: null })]).model).toBeUndefined();
    expect(inheritGenNodeData('genvideo', [node('genvideo', {})]).model).toBeUndefined();
  });

  it('★ 真值判断：空串 / 0 / 缺项一律**不沿用**（源 `u.X ||` 语义）', () => {
    const prev = node('genvideo', { aspectRatio: '', duration: 0, sendAccount: '', channel: '' });
    expect(inheritGenNodeData('genvideo', [prev])).toEqual({});
  });

  it('★ `styleIds` 是**浅拷贝**（改副本不影响上一个节点）', () => {
    const styleIds = ['a', 'b'];
    const out = inheritGenNodeData('genvideo', [node('genvideo', { styleIds })]);
    expect(out.styleIds).toEqual(['a', 'b']);
    expect(out.styleIds).not.toBe(styleIds);
  });

  it('★ `imggen`：channel / imageCount / igModel / igResolution / styleIds 沿用', () => {
    const prev = node('imggen', {
      aspectRatio: '1:1',
      channel: 'doubao-x',
      imageCount: 4,
      igModel: 'seedream',
      igResolution: '4K',
      styleIds: ['s'],
      sendAccount: 'acc',
    });
    expect(inheritGenNodeData('imggen', [prev])).toEqual({
      aspectRatio: '1:1',
      sendAccount: 'acc',
      styleIds: ['s'],
      channel: 'doubao-x',
      imageCount: 4,
      igModel: 'seedream',
      igResolution: '4K',
    });
  });

  it('★ `imggen` 的 `igModel` **有值才加键**（源条件展开 `...(u.igModel ? … : {})`）', () => {
    expect('igModel' in inheritGenNodeData('imggen', [node('imggen', { igModel: '' })])).toBe(false);
    expect('igModel' in inheritGenNodeData('imggen', [node('imggen', {})])).toBe(false);
  });

  it('★ 只取**最后一个**同类节点（源 `[...nodes].reverse().find`）', () => {
    const nodes = [
      node('genvideo', { aspectRatio: '16:9' }),
      node('text', { aspectRatio: '1:1' }),
      node('genvideo', { aspectRatio: '9:16' }),
    ];
    expect(inheritGenNodeData('genvideo', nodes).aspectRatio).toBe('9:16');
  });

  it('★ 跨类型不串（`genvideo` 不吃 `imggen` 的设置）', () => {
    expect(inheritGenNodeData('genvideo', [node('imggen', { aspectRatio: '1:1' })])).toEqual({});
  });

  it('★ 上一个节点的 `data` 非对象 / 缺 ⇒ 空 patch（不抛）', () => {
    expect(inheritGenNodeData('genvideo', [{ type: 'genvideo' }])).toEqual({});
    expect(inheritGenNodeData('genvideo', [{ type: 'genvideo', data: null }])).toEqual({});
    expect(inheritGenNodeData('genvideo', [{ type: 'genvideo', data: 'x' }])).toEqual({});
  });

  it('★ 与 `defaultNodeData` 合并后：**沿用值覆盖默认**、缺项保持默认（真实用途）', () => {
    const merged = {
      ...defaultNodeData('genvideo'),
      ...inheritGenNodeData('genvideo', [node('genvideo', { aspectRatio: '9:16' })]),
    };
    expect(merged.aspectRatio).toBe('9:16'); // 沿用上一个节点
    expect(merged.duration).toBe(5); // 上一个节点没给 ⇒ 保持默认
    expect(merged.label).toBe('文生视频'); // 默认标签不动
  });
});
