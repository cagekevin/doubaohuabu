/**
 * 图像生成键表单测（原 `imageGenKeyParams` 的绑定 / 回填 / 删键）
 *
 * 断言红线：**实现一变必红** —— 逐条对齐源的「提交值优先 · 节点兜底 · 默认兜底」语义。
 */

import { describe, expect, it } from 'vitest';
import {
  bindImageGenJobs,
  bindImageGenKey,
  dropImageGenKey,
  isImageGenSatisfied,
  resolveImageGenParams,
  tickImageGenDelivered,
  type ImageGenDeliveredKeys,
  type ImageGenParams,
} from '../imageGenKey';
import { NODE_DEFAULT_RATIO_LABEL } from '@/constants/models';

const P: ImageGenParams = {
  text: '一只猫',
  channel: 'api',
  aspectRatio: '1:1',
  styleIds: ['s1'],
  imageCount: 2,
  igModel: 'm1',
  igResolution: '1K',
  sendAccount: 'auto',
};

describe('bindImageGenJobs（原 bindImageGenJobs 的 params 半）', () => {
  it('批量绑定多个 jobId 到同一份参数', () => {
    const t = bindImageGenJobs({}, ['j1', 'j2', 'j3'], P);
    expect(t.j1).toBe(P);
    expect(t.j2).toBe(P);
    expect(t.j3).toBe(P);
  });

  it('跳过空 / 假 jobId', () => {
    const t = bindImageGenJobs({}, ['j1', '', null as unknown as string], P);
    expect(Object.keys(t)).toEqual(['j1']);
  });

  it('不可变：原表不被修改', () => {
    const prev = { old: P };
    const t = bindImageGenJobs(prev, ['j1'], P);
    expect(prev).toEqual({ old: P });
    expect(t.old).toBe(P);
    expect(t.j1).toBe(P);
  });
});

describe('bindImageGenKey', () => {
  it('绑定单键', () => {
    expect(bindImageGenKey({}, 'k1', P).k1).toBe(P);
  });

  it('空 key ⇒ 原表原样返回', () => {
    const prev = {};
    expect(bindImageGenKey(prev, '', P)).toBe(prev);
  });
});

describe('dropImageGenKey', () => {
  it('删已存在的键', () => {
    expect(dropImageGenKey({ k1: P }, 'k1')).toEqual({});
  });

  it('键不存在 ⇒ 返回同一引用（不造新对象）', () => {
    const prev = { k1: P };
    expect(dropImageGenKey(prev, 'nope')).toBe(prev);
  });

  it('空 key ⇒ 原样返回', () => {
    const prev = { k1: P };
    expect(dropImageGenKey(prev, '')).toBe(prev);
  });
});

describe('resolveImageGenParams（查表回填，原 27248-27257）', () => {
  it('★ 有提交值 ⇒ 全部用提交值', () => {
    const r = resolveImageGenParams(P, { text: '节点旧文', aspectRatio: '4:3', imageCount: 4 });
    expect(r).toEqual(P);
  });

  it('无提交值 ⇒ 用节点兜底', () => {
    const node = {
      text: '节点文',
      channel: 'doubao',
      aspectRatio: '16:9',
      styleIds: ['a'],
      imageCount: 3,
      igModel: 'x',
      igResolution: '2K',
      sendAccount: 'auto',
    };
    const r = resolveImageGenParams(null, node);
    expect(r.text).toBe('节点文');
    expect(r.channel).toBe('doubao');
    expect(r.aspectRatio).toBe('16:9');
    expect(r.styleIds).toEqual(['a']);
    expect(r.imageCount).toBe(3);
    expect(r.igModel).toBe('x');
    expect(r.igResolution).toBe('2K');
  });

  it('节点也空 ⇒ 默认兜底', () => {
    const r = resolveImageGenParams(null, {});
    expect(r.text).toBe('');
    expect(r.channel).toBe('doubao');
    expect(r.aspectRatio).toBe(NODE_DEFAULT_RATIO_LABEL);
    expect(r.styleIds).toEqual([]);
    expect(r.imageCount).toBe(1);
    expect(r.igModel).toBe('');
    expect(r.igResolution).toBe('');
    expect(r.sendAccount).toBe('auto');
  });

  it('★ `text` 用 `!= null` 判定：提交 text 为空串也算有值', () => {
    const r = resolveImageGenParams({ ...P, text: '' }, { text: '节点文' });
    expect(r.text).toBe('');
  });

  it('`imageCount` 为 0 ⇒ fallthrough 到节点值', () => {
    const r = resolveImageGenParams({ ...P, imageCount: 0 }, { imageCount: 3 });
    expect(r.imageCount).toBe(3);
  });
});

describe('delivered 计数（原 imageGenDeliveredKeys，`:27416-27423`）', () => {
  const D = (target: number, got: number): ImageGenDeliveredKeys => ({ k: { ts: 1, target, got } });

  it('★ `isImageGenSatisfied`：got >= target ⇒ true', () => {
    expect(isImageGenSatisfied(D(2, 2), 'k')).toBe(true);
    expect(isImageGenSatisfied(D(2, 1), 'k')).toBe(false);
  });

  it('无记录 / null key ⇒ 未收满', () => {
    expect(isImageGenSatisfied({}, 'k')).toBe(false);
    expect(isImageGenSatisfied(D(2, 2), null)).toBe(false);
  });

  it('`tickImageGenDelivered`：got+1 且收满判定', () => {
    const r = tickImageGenDelivered(D(2, 1), 'k', 9);
    expect(r.got).toBe(2);
    expect(r.target).toBe(2);
    expect(r.satisfied).toBe(true);
    expect(r.table.k).toEqual({ ts: 9, target: 2, got: 2 });
  });

  it('无记录 ⇒ target 兜底 1、got 从 1 起', () => {
    const r = tickImageGenDelivered({}, 'k', 9);
    expect(r.got).toBe(1);
    expect(r.target).toBe(1);
    expect(r.satisfied).toBe(true);
  });

  it('target 夹取 1~4', () => {
    expect(tickImageGenDelivered(D(5, 0), 'k', 9).target).toBe(4);
    expect(tickImageGenDelivered(D(0, 0), 'k', 9).target).toBe(1);
  });

  it('不可变：原表不被修改', () => {
    const prev = D(2, 1);
    tickImageGenDelivered(prev, 'k', 9);
    expect(prev.k).toEqual({ ts: 1, target: 2, got: 1 });
  });
});
