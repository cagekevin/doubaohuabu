/**
 * 队列入队规划单测（原 `$S` 41876 / `AS` 41868 / `MS` 41870）
 *
 * 断言红线（**实现一变必红**）：
 *   ① 指纹是 **删掉全部空白**（不是折成一个空格）→ 「改缩进不算改内容」
 *   ② 防重复的**四个条件缺一不可**（`!force` / 指纹非空 / 有缓存 / 指纹相同 / **窗口 90s**）
 *   ③ 新项的三处字面形状：`accountId: null`、`notBefore: null`、`order = now + 下标`
 *   ④ `replace` 只保留 `success`
 */

import { describe, expect, it } from 'vitest';
import {
  buildQueueItem,
  DEDUPE_WINDOW_MS,
  nodeTextOf,
  planEnqueue,
  queueFingerprint,
  type QueueItem,
} from '../sendQueuePlan';

const NOW = 1_000_000;
let seq = 0;
const idFactory = (): string => `q_${++seq}`;

const okItem = (nodeId: string): QueueItem => ({
  ...buildQueueItem({ id: `old_${nodeId}`, nodeId, order: 1 }),
  status: 'success',
});

describe('queueFingerprint（原 `AS` 41868）', () => {
  it('★ **删掉全部空白**（不是折成一个空格）⇒ 改缩进/换行不算改内容', () => {
    expect(queueFingerprint('a b')).toBe('ab');
    expect(queueFingerprint('  a\n\n b  ')).toBe('ab');
    expect(queueFingerprint('a b')).toBe(queueFingerprint('ab'));
  });

  it('★ 先 `stripHtml`（标签不算内容）', () => {
    expect(queueFingerprint('<p>甲</p>')).toBe('甲');
    expect(queueFingerprint('<b>甲</b>')).toBe(queueFingerprint('甲'));
  });

  it('★ 截 200 字符（第 201 个字符不算）', () => {
    const a = 'x'.repeat(201);
    expect(queueFingerprint(a)).toHaveLength(200);
    // ⚠️ 只差第 201 个字符 ⇒ 指纹**相同**（这正是截断的后果，照抄）
    expect(queueFingerprint(`${'x'.repeat(200)}y`)).toBe(queueFingerprint(a));
  });

  it('空 / 非字符串 ⇒ 空串', () => {
    expect(queueFingerprint(null)).toBe('');
    expect(queueFingerprint(undefined)).toBe('');
    expect(queueFingerprint('   ')).toBe('');
  });
});

describe('nodeTextOf（原 `MS` 41870）', () => {
  it('★ 取 `data.text`；节点不存在 / 不是字符串 ⇒ 空串', () => {
    const nodes = [{ id: 't1', data: { text: '甲' } }, { id: 't2', data: {} }];
    expect(nodeTextOf(nodes, 't1')).toBe('甲');
    expect(nodeTextOf(nodes, 't2')).toBe('');
    expect(nodeTextOf(nodes, 'ghost')).toBe('');
  });
});

describe('buildQueueItem（原 41903-41917）', () => {
  it('★ 字段逐个照抄（三处易被"顺手修正"的都锁住）', () => {
    const it1 = buildQueueItem({ id: 'q1', nodeId: 'n1', name: '甲', order: 42 });
    expect(it1).toEqual({
      id: 'q1',
      nodeId: 'n1',
      name: '甲',
      // ⚠️ 是 `null` 不是 `''`
      accountId: null,
      accountName: '',
      status: 'waiting',
      attempt: 0,
      startedAt: null,
      finishedAt: null,
      note: '',
      order: 42,
      // ⚠️ 是 `null` 不是 `0`
      notBefore: null,
      excludeAccountIds: [],
    });
  });

  it('`name` 缺 ⇒ 空串；`excludeAccountIds` 会**滤掉空串**', () => {
    expect(buildQueueItem({ id: 'q', nodeId: 'n', order: 0 }).name).toBe('');
    expect(
      buildQueueItem({ id: 'q', nodeId: 'n', order: 0, excludeAccountIds: ['a', '', 'b'] }).excludeAccountIds,
    ).toEqual(['a', 'b']);
  });
});

describe('planEnqueue（原 `$S` 41876）', () => {
  const nodes = [{ id: 'n1', data: { text: '正文一' } }, { id: 'n2', data: { text: '正文二' } }];

  it('★ 正常入队：追加在**尾部**，`order = now + 下标`', () => {
    const r = planEnqueue({
      nodes,
      current: [okItem('old')],
      incoming: [{ nodeId: 'n1', name: '甲' }, { nodeId: 'n2', name: '乙' }],
      fingerprints: new Map(),
      now: NOW,
      idFactory,
    });
    expect(r.items.map((i) => i.nodeId)).toEqual(['old', 'n1', 'n2']);
    expect(r.added.map((i) => i.order)).toEqual([NOW, NOW + 1]);
    expect(r.skipped).toEqual([]);
  });

  it('★ 滤掉没有 `nodeId` 的入参', () => {
    const r = planEnqueue({
      nodes,
      current: [],
      incoming: [{ nodeId: '' }, { nodeId: 'n1' }],
      fingerprints: new Map(),
      now: NOW,
      idFactory,
    });
    expect(r.added).toHaveLength(1);
  });

  it('★★ **防重复**：指纹相同 + 缓存新鲜 ⇒ 跳过，且理由就是源版那句', () => {
    const fp = queueFingerprint('正文一');
    const r = planEnqueue({
      nodes,
      current: [],
      incoming: [{ nodeId: 'n1', name: '甲' }],
      fingerprints: new Map([['n1', { fp, at: NOW - 1000 }]]),
      now: NOW,
      idFactory,
    });
    expect(r.added).toEqual([]);
    expect(r.skipped).toEqual([
      { nodeId: 'n1', name: '甲', reason: '与上次发送内容相同（90 秒内），已跳过防重复' },
    ]);
  });

  it('★ 防重复的**四个条件缺一不可**', () => {
    const fp = queueFingerprint('正文一');
    const common = { nodes, current: [], incoming: [{ nodeId: 'n1' }], now: NOW, idFactory };

    // ① `force` ⇒ 不跳过
    expect(
      planEnqueue({ ...common, fingerprints: new Map([['n1', { fp, at: NOW }]]), force: true }).added,
    ).toHaveLength(1);
    // ② 没有缓存 ⇒ 不跳过
    expect(planEnqueue({ ...common, fingerprints: new Map() }).added).toHaveLength(1);
    // ③ 指纹不同（正文变了）⇒ 不跳过
    expect(
      planEnqueue({ ...common, fingerprints: new Map([['n1', { fp: '别的', at: NOW }]]) }).added,
    ).toHaveLength(1);
    // ④ 缓存过期（**恰好 90s 不算过期** —— 源版是 `<`）
    expect(
      planEnqueue({ ...common, fingerprints: new Map([['n1', { fp, at: NOW - DEDUPE_WINDOW_MS }]]) }).added,
    ).toHaveLength(1);
    expect(
      planEnqueue({
        ...common,
        fingerprints: new Map([['n1', { fp, at: NOW - DEDUPE_WINDOW_MS + 1 }]]),
      }).added,
    ).toHaveLength(0);
  });

  it('★ 节点正文为空 ⇒ **指纹为空 ⇒ 永不跳过**（源版 `d &&` 的条件）', () => {
    const empty = [{ id: 'n9', data: { text: '' } }];
    const r = planEnqueue({
      nodes: empty,
      current: [],
      incoming: [{ nodeId: 'n9' }],
      fingerprints: new Map([['n9', { fp: '', at: NOW }]]),
      now: NOW,
      idFactory,
    });
    expect(r.added).toHaveLength(1);
  });

  it('★ `replace` ⇒ **只保留已成功**的旧项', () => {
    const waiting: QueueItem = { ...buildQueueItem({ id: 'w', nodeId: 'x', order: 0 }), status: 'waiting' };
    const failed: QueueItem = { ...buildQueueItem({ id: 'f', nodeId: 'y', order: 0 }), status: 'error' };
    const r = planEnqueue({
      nodes,
      current: [okItem('a'), waiting, failed],
      incoming: [{ nodeId: 'n1' }],
      fingerprints: new Map(),
      now: NOW,
      idFactory,
      replace: true,
    });
    // ⚠️ **不要断言生成的 id** —— `idFactory` 的 `seq` 是模块级的，跨用例累加 ⇒
    //    写死 `q_1` 只在**第一个**用到它的用例里成立（我第一版就是这么错的）。
    //    这里断言**结构**：保留的那个旧项 + 一个新项。
    expect(r.items.map((i) => i.id)).toHaveLength(2);
    expect(r.items[0]!.id).toBe('old_a');
    expect(r.items[1]!.nodeId).toBe('n1');
  });

  it('★ `excludeAccountIds` 会带进新项（滤空串）', () => {
    const r = planEnqueue({
      nodes,
      current: [],
      incoming: [{ nodeId: 'n1' }],
      fingerprints: new Map(),
      now: NOW,
      idFactory,
      excludeAccountIds: ['acc_1', ''],
    });
    expect(r.added[0]!.excludeAccountIds).toEqual(['acc_1']);
  });

  it('入参为空数组 ⇒ 什么都不加（`items` 是旧列表的副本）', () => {
    const cur = [okItem('a')];
    const r = planEnqueue({ nodes, current: cur, incoming: [], fingerprints: new Map(), now: NOW, idFactory });
    expect(r.added).toEqual([]);
    expect(r.items).toEqual(cur);
    expect(r.items).not.toBe(cur); // ⚠️ 是新数组（源版 `[...s, ...a]`）
  });
});
