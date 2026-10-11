/**
 * 队列分发决策单测（原 `TS` 的 `ls()` 42090-42192 的调度半）
 *
 * 断言红线（**实现一变必红**）：
 *   ① **暂停是 `break` 不是 `continue`**（后面的项一个都不跑）
 *   ② **按账号**并发上限（同一账号在跑的计数 + 本轮的分配也要计入）
 *   ③ 固定账号的两句 note（未登录 / 正忙）与**池分配的四句 note**（按有无 scope 分）
 *   ④ **试占用失败 ⇒ 跳过且不写 note**
 *   ⑤ 已有账号的项**不做池分配**，只看并发
 */

import { describe, expect, it } from 'vitest';
import { planQueueDispatch, type PickAutoResult } from '../sendQueueDispatch';
import { buildQueueItem, type QueueItem } from '../sendQueuePlan';
import type { SendMode } from '../sendQueueOps';

const NOW = 700_000;
const item = (patch: Partial<QueueItem> = {}): QueueItem => ({
  ...buildQueueItem({ id: 'q1', nodeId: 'n1', order: 1 }),
  ...patch,
});

const autoPool: SendMode = { mode: 'auto', opts: {}, label: '账号池' };
const autoScope: SendMode = { mode: 'auto', opts: { groupId: 'g1' }, label: '所选分组' };
const fixed: SendMode = { mode: 'fixed', accountId: 'acc_1', label: '所选账号' };

const modeAlways = (m: SendMode) => () => m;
const pickNone = (): PickAutoResult => null;
const pickNoAccount = (): PickAutoResult => ({ reason: 'no-account' });
const pickBusy = (): PickAutoResult => ({ reason: 'all-busy' });
const pickAcc = (id = 'acc_9', name = '豆包09') => (): PickAutoResult => ({ accountId: id, name });

describe('planQueueDispatch（原 `TS` 的 `ls()`）', () => {
  it('★ 正常派发：写 `sending` + `startedAt: now` + **`attempt+1`** + 账号', () => {
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1, attempt: 2 })],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: pickAcc(),
    });
    expect(r.dispatch).toHaveLength(1);
    expect(r.dispatch[0]!.patch).toEqual({
      status: 'sending',
      startedAt: NOW,
      attempt: 3,
      accountId: 'acc_9',
      accountName: '豆包09',
    });
    expect(r.dispatch[0]!.pickedFromPool).toBe(true);
  });

  it('★ 候选：**只取 `waiting`**，且 `notBefore` 未到的不取（原 42109-42110）', () => {
    const r = planQueueDispatch({
      items: [
        item({ id: 'a', nodeId: 'n1', order: 1, status: 'success' }),
        item({ id: 'b', nodeId: 'n2', order: 2, status: 'error' }),
        item({ id: 'c', nodeId: 'n3', order: 3, notBefore: NOW + 1 }), // 未到
        item({ id: 'd', nodeId: 'n4', order: 4, notBefore: NOW }), // 恰好到 ⇒ 取
      ],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: pickAcc(),
    });
    expect(r.dispatch.map((d) => d.itemId)).toEqual(['d']);
  });

  it('★ 顺序 = **`order` 升序**（不是数组顺序）', () => {
    const r = planQueueDispatch({
      items: [
        item({ id: 'a', nodeId: 'n1', order: 30 }),
        item({ id: 'b', nodeId: 'n2', order: 10 }),
        item({ id: 'c', nodeId: 'n3', order: 20 }),
      ],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: (() => {
        let i = 0;
        return () => ({ accountId: `acc_${++i}`, name: `账号${i}` });
      })(),
    });
    expect(r.dispatch.map((d) => d.itemId)).toEqual(['b', 'c', 'a']);
  });

  it('★★ **暂停 ⇒ `break`（不是 `continue`）**：后面的项一个都不派发', () => {
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1 }), item({ id: 'b', nodeId: 'n2', order: 2 })],
      now: NOW,
      paused: true,
      modeOf: modeAlways(autoPool),
      pickAuto: pickAcc(),
    });
    expect(r.dispatch).toEqual([]);
    expect(r.paused).toBe(true);
  });

  it('★★ **按账号**并发上限：同一账号在跑的 + 本轮分配的都要算', () => {
    const r = planQueueDispatch({
      items: [
        // 同一个账号已经有一个在跑
        item({ id: 'run', nodeId: 'nx', order: 0, status: 'sending', accountId: 'acc_9' }),
        item({ id: 'a', nodeId: 'n1', order: 1 }),
        item({ id: 'b', nodeId: 'n2', order: 2 }),
      ],
      now: NOW,
      concurrency: 2,
      modeOf: modeAlways(autoPool),
      // 两次都挑到**同一个**账号 ⇒ 第二个应被并发上限挡住
      pickAuto: pickAcc(),
    });
    expect(r.dispatch.map((d) => d.itemId)).toEqual(['a']);
  });

  it('★ 并发上限默认 `1`（三个项 → 只派一个，因为都挑到同一账号）', () => {
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1 }), item({ id: 'b', nodeId: 'n2', order: 2 })],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: pickAcc(),
    });
    expect(r.dispatch).toHaveLength(1);
  });

  it('★ 不同的账号 ⇒ 并发上限不互相挡', () => {
    let i = 0;
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1 }), item({ id: 'b', nodeId: 'n2', order: 2 })],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: () => ({ accountId: `acc_${++i}`, name: `账号${i}` }),
    });
    expect(r.dispatch.map((d) => d.accountId)).toEqual(['acc_1', 'acc_2']);
  });

  it('★ **已绑定账号的项不做池分配**（只看并发，不看 mode）', () => {
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1, accountId: 'acc_5', accountName: '旧的' })],
      now: NOW,
      modeOf: modeAlways(fixed), // 即便 mode 说固定账号也不理
      pickAuto: pickNone,
    });
    expect(r.dispatch[0]).toMatchObject({ accountId: 'acc_5', pickedFromPool: false });
    // ⚠️ 名字用的是**项上已存的** `accountName`
    expect(r.dispatch[0]!.accountName).toBe('旧的');
  });

  it('★ 固定账号：不存在/未登录 ⇒ note「所选账号不存在或未登录，排队等待」', () => {
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1 })],
      now: NOW,
      modeOf: modeAlways(fixed),
      isUsable: () => false,
      pickAuto: pickNone,
    });
    expect(r.dispatch).toEqual([]);
    expect(r.notes).toEqual([{ itemId: 'a', note: '所选账号不存在或未登录，排队等待' }]);
  });

  it('★ 固定账号：正忙 ⇒ note「所选账号正在生成中，排队等待空闲」', () => {
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1 })],
      now: NOW,
      modeOf: modeAlways(fixed),
      isUsable: () => true,
      isBusy: () => true,
      pickAuto: pickNone,
    });
    expect(r.notes[0]!.note).toBe('所选账号正在生成中，排队等待空闲');
  });

  it('★★ 池分配的四句 note（按**有无 scope** × **no-account / 都在忙**）', () => {
    const run = (mode: SendMode, pick: () => PickAutoResult): string =>
      planQueueDispatch({
        items: [item({ id: 'a', nodeId: 'n1', order: 1 })],
        now: NOW,
        modeOf: modeAlways(mode),
        pickAuto: pick,
      }).notes[0]?.note ?? '';

    expect(run(autoPool, pickNoAccount)).toBe('账号池暂无已登录账号，排队等待');
    expect(run(autoScope, pickNoAccount)).toBe('所选分组暂无已登录的可用账号，排队等待');
    expect(run(autoPool, pickBusy)).toBe('所有账号都在生成中，已排队等待空闲账号');
    expect(run(autoScope, pickBusy)).toBe('所选分组内账号都在生成中，已排队等待空闲账号');
    // ⚠️ `pickAuto` 返回 `null`（而不是带 reason）⇒ 走"都在忙"那一支
    expect(run(autoPool, pickNone)).toBe('所有账号都在生成中，已排队等待空闲账号');
  });

  it('★ note **只在变化时**回写（源版先比 `h.note !== S`）', () => {
    const first = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1 })],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: pickNoAccount,
    });
    expect(first.notes).toHaveLength(1);
    const again = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1, note: '账号池暂无已登录账号，排队等待' })],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: pickNoAccount,
    });
    expect(again.notes).toEqual([]);
  });

  it('★ **试占用失败 ⇒ 跳过且不写 note**（原 42174-42179）', () => {
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1 })],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: pickAcc(),
      reserve: () => false,
    });
    expect(r.dispatch).toEqual([]);
    expect(r.notes).toEqual([]);
  });

  it('★ 试占用失败的项**不占并发额度**（后面的项仍可派到同一账号）', () => {
    const r = planQueueDispatch({
      items: [item({ id: 'a', nodeId: 'n1', order: 1 }), item({ id: 'b', nodeId: 'n2', order: 2 })],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: pickAcc('acc_1', '一'),
      // 只有第一项被拒
      reserve: (_acc, id) => id !== 'a',
    });
    expect(r.dispatch.map((d) => d.itemId)).toEqual(['b']);
  });

  it('空队列 ⇒ 空计划', () => {
    const r = planQueueDispatch({
      items: [],
      now: NOW,
      modeOf: modeAlways(autoPool),
      pickAuto: pickAcc(),
    });
    expect(r).toEqual({ dispatch: [], notes: [], paused: false });
  });
});
