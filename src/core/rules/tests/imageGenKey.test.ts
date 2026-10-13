/**
 * 图像生成键表 / 回流落点的纯层单测
 *
 * 依据：原 `bindImageGenKey` `:27171-27194` · `bindImageGenJobs` `:27196-27225` ·
 *      `addImageGenResult` `:27352-27453` · `pushImageGenFeed` `:27132-27161` ·
 *      `attachImageResultToNode` 查表回填 `:27246-27257` / 删键 `:27280-27288`
 *
 * 断言红线：**实现一变必红** —— 逐条对齐源的「提交值优先 · 节点兜底 · 默认兜底」与
 * 「缺 key/nodeId 即不写 · 超上限砍最旧」语义。
 */

import { describe, expect, it } from 'vitest';
import {
  bindImageGenJobs,
  bindImageGenKey,
  deliveredTarget,
  dropImageGenKey,
  imageGenJobId,
  imageGenKeyOfJobId,
  isImageGenJobId,
  isImageGenSatisfied,
  isPlaceholderDataUrl,
  isPlaceholderHash,
  planImageGenFeed,
  resolveImageGenParams,
  tickImageGenDelivered,
  type ImageGenDeliveredKeys,
  type ImageGenFeedItem,
  type ImageGenKeyParams,
  type ImageGenKeyTargets,
  type ImageGenParams,
} from '../imageGenKey';
import { IMAGE_GEN_DELIVERED_MAX, IMAGE_GEN_FEED_LIMIT } from '@/constants';
import { NODE_DEFAULT_RATIO_LABEL } from '@/constants/models';
import { PLACEHOLDER_EXACT_HASHES } from '@/constants/dedupe';

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

const emptyKeyTables = () => ({ keyNodes: {}, keyTargets: {}, keyParams: {} });

describe('bindImageGenJobs（原 :27196-27225）', () => {
  it('批量绑定多个 jobId 到同一份参数', () => {
    const t = bindImageGenJobs({}, ['j1', 'j2', 'j3'], 'n1', P);
    expect(t?.j1).toBe(P);
    expect(t?.j2).toBe(P);
    expect(t?.j3).toBe(P);
  });

  it('跳过空 / 假 jobId', () => {
    const t = bindImageGenJobs({}, ['j1', '', null], 'n1', P);
    expect(Object.keys(t ?? {})).toEqual(['j1']);
  });

  it('★ 缺 nodeId ⇒ `null`（源 `if (!!r && …)`）', () => {
    expect(bindImageGenJobs({}, ['j1'], null, P)).toBeNull();
    expect(bindImageGenJobs({}, ['j1'], '', P)).toBeNull();
  });

  it('★ 空 jobIds ⇒ `null`', () => {
    expect(bindImageGenJobs({}, [], 'n1', P)).toBeNull();
  });

  it('缺 params ⇒ 原表原样返回（源只写 `imageGenJobNode` 那一支）', () => {
    const prev: ImageGenKeyParams = { old: P };
    expect(bindImageGenJobs(prev, ['j1'], 'n1', null)).toBe(prev);
  });

  it('不可变：原表不被修改', () => {
    const prev = { old: P };
    const t = bindImageGenJobs(prev, ['j1'], 'n1', P);
    expect(prev).toEqual({ old: P });
    expect(t?.old).toBe(P);
  });
});

describe('bindImageGenKey（原 :27171-27194）', () => {
  it('★ 三张表一次写：node / target / params', () => {
    const t = bindImageGenKey(emptyKeyTables(), 'k1', 'n1', 3, P);
    expect(t?.keyNodes.k1).toBe('n1');
    expect(t?.keyTargets.k1).toBe(3);
    expect(t?.keyParams.k1).toBe(P);
  });

  it('★ 缺 key 或 nodeId ⇒ `null`（源 `if (!n || !r) return`）', () => {
    expect(bindImageGenKey(emptyKeyTables(), '', 'n1', 1, P)).toBeNull();
    expect(bindImageGenKey(emptyKeyTables(), 'k1', '', 1, P)).toBeNull();
  });

  it('★ target 夹取 1~4（源 `Math.max(1, Math.min(4, s | 0 || 1))`）', () => {
    expect(bindImageGenKey(emptyKeyTables(), 'k', 'n', 9, P)?.keyTargets.k).toBe(4);
    expect(bindImageGenKey(emptyKeyTables(), 'k', 'n', 0, P)?.keyTargets.k).toBe(1);
  });

  it('★ 无 params ⇒ **不写** `keyParams`（源 `...(o ? {…} : {})`）', () => {
    const t = bindImageGenKey(emptyKeyTables(), 'k1', 'n1', 2, null);
    expect(t?.keyNodes.k1).toBe('n1');
    expect(t?.keyTargets.k1).toBe(2);
    expect(t?.keyParams).toEqual({});
  });
});

describe('作业 id 协议（原 `imggen:${m}`，shared.js:42921 / _Component43.jsx:166,208）', () => {
  it('造 id / 判 id / 取回 key 三者自洽', () => {
    const id = imageGenJobId('abc');
    expect(id).toBe('imggen:abc');
    expect(isImageGenJobId(id)).toBe(true);
    expect(imageGenKeyOfJobId(id)).toBe('abc');
  });

  it('★ 非作业 id ⇒ `false` / 空串（视频任务的真节点 id 不会误判）', () => {
    expect(isImageGenJobId('ig_mv1_1')).toBe(false);
    expect(isImageGenJobId(null)).toBe(false);
    expect(imageGenKeyOfJobId('ig_mv1_1')).toBe('');
  });
});

describe('dropImageGenKey（原 :27280-27288）', () => {
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

describe('resolveImageGenParams（查表回填，原 :27248-27257）', () => {
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

describe('占位图（原 `addImageGenResult` 的同步半 :27377-27385）', () => {
  it('★ 命中黑名单的两个哈希 ⇒ true', () => {
    for (const h of PLACEHOLDER_EXACT_HASHES) expect(isPlaceholderHash(h)).toBe(true);
  });

  it('非黑名单 / 空 ⇒ false', () => {
    expect(isPlaceholderHash('deadbeefdeadbeef')).toBe(false);
    expect(isPlaceholderHash(null)).toBe(false);
    expect(isPlaceholderHash('')).toBe(false);
  });

  it('★ 非 `data:image/*;base64` ⇒ 取不到哈希 ⇒ false（不误杀）', () => {
    expect(isPlaceholderDataUrl('img://a1228ab1c4f684cf.png')).toBe(false);
    expect(isPlaceholderDataUrl('https://x/y.png')).toBe(false);
    expect(isPlaceholderDataUrl('data:image/png;base64,AAAA')).toBe(false);
  });
});

describe('delivered 计数（原 :27369 / :27416-27438）', () => {
  const D = (target: number, got: number): ImageGenDeliveredKeys => ({ k: { ts: 1, target, got } });
  const T = (target: number): ImageGenKeyTargets => ({ k: target });

  it('★ `deliveredTarget`：`imageGenKeyTarget` 优先，其次上轮 `target`，末档 1', () => {
    expect(deliveredTarget(T(3), D(2, 0), 'k')).toBe(3);
    expect(deliveredTarget({}, D(2, 0), 'k')).toBe(2);
    expect(deliveredTarget({}, {}, 'k')).toBe(1);
  });

  it('★ 无 key ⇒ 恒 1（源 `n ? … : 1`）', () => {
    expect(deliveredTarget(T(3), D(3, 0), null)).toBe(1);
  });

  it('★ `isImageGenSatisfied`：got >= target ⇒ true', () => {
    expect(isImageGenSatisfied(D(2, 2), T(2), 'k')).toBe(true);
    expect(isImageGenSatisfied(D(2, 1), T(2), 'k')).toBe(false);
  });

  it('无记录 / null key ⇒ 未收满', () => {
    expect(isImageGenSatisfied({}, T(2), 'k')).toBe(false);
    expect(isImageGenSatisfied(D(2, 2), T(2), null)).toBe(false);
  });

  it('`tickImageGenDelivered`：got+1 且收满判定', () => {
    const r = tickImageGenDelivered(D(2, 1), 'k', 2, 9);
    expect(r.got).toBe(2);
    expect(r.target).toBe(2);
    expect(r.satisfied).toBe(true);
    expect(r.table.k).toEqual({ ts: 9, target: 2, got: 2 });
  });

  it('无记录 ⇒ target 兜底 1、got 从 1 起', () => {
    const r = tickImageGenDelivered({}, 'k', 1, 9);
    expect(r.got).toBe(1);
    expect(r.target).toBe(1);
    expect(r.satisfied).toBe(true);
  });

  it('target 夹取 1~4', () => {
    expect(tickImageGenDelivered(D(5, 0), 'k', 5, 9).target).toBe(4);
    expect(tickImageGenDelivered(D(0, 0), 'k', 0, 9).target).toBe(1);
  });

  it('★ 超 `IMAGE_GEN_DELIVERED_MAX` ⇒ 按 `ts` 升序砍最旧（原 :27427-27435）', () => {
    const full: ImageGenDeliveredKeys = {};
    for (let i = 0; i < IMAGE_GEN_DELIVERED_MAX; i++) full[`k${i}`] = { ts: i, target: 1, got: 1 };
    const r = tickImageGenDelivered(full, 'newest', 1, IMAGE_GEN_DELIVERED_MAX);
    expect(Object.keys(r.table)).toHaveLength(IMAGE_GEN_DELIVERED_MAX);
    expect(r.table.k0).toBeUndefined(); // 最旧（ts=0）被砍
    expect(r.table.newest).toBeDefined();
  });

  it('不可变：原表不被修改', () => {
    const prev = D(2, 1);
    tickImageGenDelivered(prev, 'k', 2, 9);
    expect(prev.k).toEqual({ ts: 1, target: 2, got: 1 });
  });
});

describe('planImageGenFeed（原 pushImageGenFeed :27132-27161）', () => {
  let seq = 0;
  const deps = {
    nextId: () => `ig_${++seq}`,
    now: () => 1000,
    persistImage: (u: string) => `img://${u}`,
  };

  it('★ 补缺省字段（id / name / source / accountName / genKey / ts）', () => {
    const t = planImageGenFeed([], [{ dataUrl: 'a' }], deps);
    expect(t?.[0]).toEqual({
      id: 'ig_1',
      name: '生成图片',
      dataUrl: 'img://a',
      source: 'api',
      accountName: null,
      genKey: null,
      ts: 1000,
    });
  });

  it('★ 空入参 ⇒ `null`（源 `return {}`）', () => {
    expect(planImageGenFeed([], [], deps)).toBeNull();
  });

  it('★ 按 `dataUrl` 去重，且**空 dataUrl 丢弃**（与 `addToLibrary` 不同）', () => {
    const prev: ImageGenFeedItem[] = [
      { id: 'x', name: 'n', dataUrl: 'img://a', source: 'api', accountName: null, genKey: null, ts: 1 },
    ];
    // 全被去重 ⇒ `null`
    expect(planImageGenFeed(prev, [{ dataUrl: 'a' }], deps)).toBeNull();
    // 空 dataUrl 那条被丢掉，只留 `b`
    const t = planImageGenFeed(prev, [{ dataUrl: 'b' }, { dataUrl: '' }], deps);
    expect(t?.map((x) => x.dataUrl)).toEqual(['img://b', 'img://a']);
  });

  it('★ 倒序插到最前 + 上限 `IMAGE_GEN_FEED_LIMIT`', () => {
    const prev: ImageGenFeedItem[] = Array.from({ length: IMAGE_GEN_FEED_LIMIT }, (_, i) => ({
      id: `p${i}`,
      name: 'n',
      dataUrl: `img://p${i}`,
      source: 'api',
      accountName: null,
      genKey: null,
      ts: i,
    }));
    const t = planImageGenFeed(prev, [{ dataUrl: 'new' }], deps);
    expect(t).toHaveLength(IMAGE_GEN_FEED_LIMIT);
    expect(t?.[0]?.dataUrl).toBe('img://new');
  });
});
