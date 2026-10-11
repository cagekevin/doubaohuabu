/**
 * 批量发送队列单测（原 `x3` 41615-41822 + `PS` 42354-42447）
 *
 * 重点：
 *   ① ★ **互斥闩**：并发第二次 ⇒ `busy`；且**任何路径都要放闩**（否则后续全废）
 *   ② ★ **中止闩是"一闩到底"**：答 abort 之后剩下的全 `skipped`
 *   ③ ★ **失败必须释放账号占用**（busy / 其它失败 / 抛异常三条路）
 *   ④ ★ 决策只在**两处**发起：准备失败且 `no-account`、发送失败（带分类标签）
 *   ⑤ `sendOneNode` 与批量**三处刻意差异**（先写「排队发送中…」/ 写 recipe / 成功后 toast）
 */

import { describe, expect, it } from 'vitest';
import {
  isBatchSendRunning,
  runBatchSend,
  sendOneNode,
  type BatchNodeState,
  type NodeSendState,
  type RunBatchSendInput,
} from '../sendQueue';
import { ok, err } from '@/core/model/result';
import { BATCH_TEXT } from '@/constants/text';
import type { Account } from '@/stable/model/account';
import type { CanvasNode } from '@/stable/model/node';

const acc = (id: string): Account => ({
  id,
  name: `#${id}`,
  type: 'doubao',
  status: '已登录',
  partition: `persist:${id}`,
  addedAt: 0,
  groupId: null,
  autoStart: false,
  fpSalt: 0,
});

const nodes = (ids: string[]): CanvasNode[] =>
  ids.map((id, i) => ({
    id,
    type: 'text',
    position: { x: 0, y: i * 10 },
    data: { text: id },
  })) as unknown as CanvasNode[];

interface Taken {
  states: BatchNodeState[];
  released: string[];
  decisions: Array<{ msg: string; remaining: number; nodeId: string }>;
}

function makeInput(
  over: Partial<RunBatchSendInput> = {},
): { input: RunBatchSendInput; taken: Taken } {
  const taken: Taken = { states: [], released: [], decisions: [] };
  const input: RunBatchSendInput = {
    nodeIds: ['a'],
    nodes: nodes(['a']),
    isSending: () => false,
    prepare: () => ok({ account: acc('acc1'), operation: {} }),
    transport: async () => ok({ ok: true }),
    releaseAccount: (id) => taken.released.push(id),
    ...over,
  };
  return { input, taken };
}

const cbOf = (taken: Taken, over: Partial<Parameters<typeof runBatchSend>[1]> = {}) => ({
  onNodeState: (e: BatchNodeState) => taken.states.push(e),
  ...over,
});

describe('runBatchSend · 互斥闩', () => {
  it('★ 并发第二次 ⇒ `busy` + 源版文案（且第一个跑完后闩要放掉）', async () => {
    // ⚠️ 初值给成空函数（而不是 `null`）—— 否则 TS 会把 `releaseGate` 收窄成 `null`（不可调用）
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      releaseGate = r;
    });
    const { input } = makeInput({
      transport: async () => {
        await gate;
        return ok({ ok: true });
      },
    });
    const first = runBatchSend(input);
    // 让第一个进入 await（闩已置位）
    await Promise.resolve();
    expect(isBatchSendRunning()).toBe(true);

    const second = await runBatchSend(makeInput().input);
    expect(second).toEqual(err('busy', BATCH_TEXT.busy));

    releaseGate?.();
    expect((await first).ok).toBe(true);
    expect(isBatchSendRunning()).toBe(false);
  });
});

describe('runBatchSend · 顺序与缺失节点', () => {
  it('★ 按视觉顺序发；画布上已没有的 nodeIds ⇒ `skipped 节点已不存在`', async () => {
    const order: string[] = [];
    const { input, taken } = makeInput({
      nodeIds: ['a', 'b', 'gone'],
      nodes: nodes(['b', 'a']), // y: b=0, a=10 ⇒ 先 b 后 a
      prepare: (id) => {
        order.push(id);
        return ok({ account: acc('acc1'), operation: {} });
      },
    });
    const r = await runBatchSend(input, cbOf(taken));
    expect(order).toEqual(['b', 'a']);
    if (!r.ok) return;
    expect(r.value.results.map((x) => [x.nodeId, x.status])).toEqual([
      ['b', 'success'],
      ['a', 'success'],
      ['gone', 'skipped'],
    ]);
    expect(r.value.results[2]!.msg).toBe(BATCH_TEXT.nodeMissing);
    expect(r.value.total).toBe(3);
    expect(r.value.aborted).toBe(false);
  });

  it('★ 每步都有 `onNodeState`（waiting → sending → success），且带 index/total', async () => {
    const { input, taken } = makeInput({ nodeIds: ['a'], nodes: nodes(['a']) });
    await runBatchSend(input, cbOf(taken));
    expect(taken.states.map((s) => s.status)).toEqual(['waiting', 'sending', 'success']);
    expect(taken.states[0]).toMatchObject({ nodeId: 'a', name: 'a', index: 1, total: 1 });
    expect(taken.states[1]!.msg).toBe(BATCH_TEXT.sendingTo('#acc1'));
    expect(taken.states[2]!.msg).toBe(BATCH_TEXT.sentTo('#acc1'));
    expect(taken.states[2]!.accountName).toBe('#acc1');
  });
});

describe('runBatchSend · 中止与跳过', () => {
  it('★ `shouldAbort()` 一真 ⇒ 后续全 `skipped`（闩一到底）', async () => {
    let calls = 0;
    const { input, taken } = makeInput({
      nodeIds: ['a', 'b', 'c'],
      nodes: nodes(['a', 'b', 'c']),
      transport: async () => {
        calls += 1;
        return ok({ ok: true });
      },
    });
    const r = await runBatchSend(input, cbOf(taken, { shouldAbort: () => calls >= 1 }));
    if (!r.ok) return;
    expect(calls).toBe(1); // 只发了 a
    expect(r.value.results.map((x) => x.status)).toEqual(['success', 'skipped', 'skipped']);
    expect(r.value.aborted).toBe(true);
    expect(r.value.results[1]!.msg).toBe(BATCH_TEXT.abortedSkipped);
  });

  it('★ 已在发送中的节点 ⇒ `error`，**不调 prepare**', async () => {
    let prepared = 0;
    const { input, taken } = makeInput({
      isSending: (id) => id === 'a',
      prepare: () => {
        prepared += 1;
        return ok({ account: acc('acc1'), operation: {} });
      },
    });
    const r = await runBatchSend(input, cbOf(taken));
    if (!r.ok) return;
    expect(prepared).toBe(0);
    expect(r.value.results[0]).toEqual({
      nodeId: 'a',
      name: 'a',
      status: 'error',
      msg: BATCH_TEXT.alreadySending,
    });
  });
});

describe('runBatchSend · 失败路径与占用释放', () => {
  it('★ `busy` ⇒ 释放占用 + `正在发送中，请稍候再试`', async () => {
    const { input, taken } = makeInput({ transport: async () => ok({ ok: false, reason: 'busy' }) });
    const r = await runBatchSend(input, cbOf(taken));
    if (!r.ok) return;
    expect(taken.released).toEqual(['acc1']);
    expect(r.value.results[0]!.msg).toBe(BATCH_TEXT.sendBusyRetry);
  });

  it('★ 其它失败 ⇒ 释放占用 + `note || reason || 发送失败`', async () => {
    const withNote = makeInput({ transport: async () => ok({ ok: false, note: '页面超时' }) });
    const r1 = await runBatchSend(withNote.input, cbOf(withNote.taken));
    if (r1.ok) expect(r1.value.results[0]!.msg).toBe('页面超时');
    expect(withNote.taken.released).toEqual(['acc1']);

    const bare = makeInput({ transport: async () => ok({ ok: false }) });
    const r2 = await runBatchSend(bare.input, cbOf(bare.taken));
    if (r2.ok) expect(r2.value.results[0]!.msg).toBe(BATCH_TEXT.sendFailed);
  });

  it('★ 传输**抛异常** ⇒ 释放占用 + 用异常 message', async () => {
    const { input, taken } = makeInput({
      transport: async () => {
        throw new Error('boom');
      },
    });
    const r = await runBatchSend(input, cbOf(taken));
    expect(taken.released).toEqual(['acc1']);
    if (!r.ok) return;
    expect(r.value.results[0]!.msg).toBe('boom');
  });

  it('★ `onProgress` 的 success / error 会即时反映到节点态', async () => {
    const { input, taken } = makeInput({
      transport: async (_op, opts) => {
        opts?.onProgress?.({ type: 'error', note: '中途失败' });
        return ok({ ok: true });
      },
    });
    await runBatchSend(input, cbOf(taken));
    const errored = taken.states.filter((s) => s.status === 'error');
    expect(errored).toHaveLength(1);
    expect(errored[0]!.msg).toBe('中途失败');
  });
});

describe('runBatchSend · 决策（只在两处发起）', () => {
  it('★ 准备失败但**不是** `no-account` ⇒ **不问**决策', async () => {
    const { input, taken } = makeInput({ prepare: () => err('busy', '账号都在忙') });
    await runBatchSend(
      input,
      cbOf(taken, {
        onDecision: (d) => {
          taken.decisions.push({ msg: d.msg, remaining: d.remaining, nodeId: d.nodeId });
          return 'continue';
        },
      }),
    );
    expect(taken.decisions).toEqual([]);
  });

  it('★ 准备失败且 `no-account` ⇒ 问决策；答 `abort` ⇒ 后面全 skipped', async () => {
    const { input, taken } = makeInput({
      nodeIds: ['a', 'b'],
      nodes: nodes(['a', 'b']),
      prepare: () => err('no-account', '未配置已登录的豆包 / Dola 账号'),
    });
    const r = await runBatchSend(
      input,
      cbOf(taken, {
        onDecision: (d) => {
          taken.decisions.push({ msg: d.msg, remaining: d.remaining, nodeId: d.nodeId });
          return 'abort';
        },
      }),
    );
    expect(taken.decisions).toEqual([
      { nodeId: 'a', msg: '未配置已登录的豆包 / Dola 账号', remaining: 1 },
    ]);
    if (!r.ok) return;
    expect(r.value.results.map((x) => x.status)).toEqual(['error', 'skipped']);
    expect(r.value.aborted).toBe(true);
  });

  it('★ 发送失败 ⇒ 问决策；`unknown` 分类**不加标签**', async () => {
    const { input, taken } = makeInput({
      transport: async () => ok({ ok: false, note: '喵喵喵未知故障' }),
    });
    await runBatchSend(
      input,
      cbOf(taken, {
        onDecision: (d) => {
          taken.decisions.push({ msg: d.msg, remaining: d.remaining, nodeId: d.nodeId });
          return 'continue';
        },
      }),
    );
    expect(taken.decisions).toHaveLength(1);
    expect(taken.decisions[0]!.msg).toBe('喵喵喵未知故障');
  });

  it('★ 发送失败且能分类 ⇒ 标签用**全角括号**包住原文', async () => {
    const { input, taken } = makeInput({
      transport: async () => ok({ ok: false, note: '文本框内容为空' }),
    });
    await runBatchSend(
      input,
      cbOf(taken, {
        onDecision: (d) => {
          taken.decisions.push({ msg: d.msg, remaining: d.remaining, nodeId: d.nodeId });
          return 'continue';
        },
      }),
    );
    expect(taken.decisions[0]!.msg).toContain('（文本框内容为空）');
  });
});

describe('runBatchSend · 汇总', () => {
  it('调 `onSummary`，返回的 summary 与之一致', async () => {
    const seen: unknown[] = [];
    const { input, taken } = makeInput();
    const r = await runBatchSend(input, cbOf(taken, { onSummary: (s) => seen.push(s) }));
    if (!r.ok) return;
    expect(seen).toEqual([r.value]);
    expect(r.value).toMatchObject({ total: 1, aborted: false });
  });
});

describe('sendOneNode（原 PS）', () => {
  const makeOne = (over: Partial<Parameters<typeof sendOneNode>[0]> = {}) => {
    const states: NodeSendState[] = [];
    const released: string[] = [];
    const recipes: Array<[string, unknown]> = [];
    const sent: string[] = [];
    const input = {
      nodeId: 'a',
      prepare: () => ok({ account: acc('acc1'), operation: {} }),
      transport: async () => ok({ ok: true }),
      releaseAccount: (id: string) => released.push(id),
      setState: (e: NodeSendState) => states.push(e),
      setRecipe: (id: string, recipe: unknown) => recipes.push([id, recipe]),
      onSent: (a: Account) => sent.push(a.id),
      ...over,
    } as Parameters<typeof sendOneNode>[0];
    return { input, states, released, recipes, sent };
  };

  it('★ 第一步先写「排队发送中…」（批量没有这一步）', async () => {
    const t = makeOne();
    await sendOneNode(t.input);
    expect(t.states[0]).toEqual({ nodeId: 'a', status: 'sending', msg: BATCH_TEXT.queueing });
  });

  it('★ 成功 ⇒ 写 recipe + onSent + 成功态', async () => {
    const t = makeOne({ prepare: () => ok({ account: acc('acc1'), operation: {}, recipe: { r: 1 } }) });
    const r = await sendOneNode(t.input);
    expect(t.recipes).toEqual([['a', { r: 1 }]]);
    expect(t.sent).toEqual(['acc1']);
    expect(r).toMatchObject({ ok: true, accountId: 'acc1', accountName: '#acc1' });
    expect(t.states.at(-1)).toMatchObject({ status: 'success', msg: BATCH_TEXT.sentTo('#acc1') });
  });

  it('★ 准备失败 ⇒ 写错误态 + 返回 `reason: stage`，**不释放**（还没占号）', async () => {
    const t = makeOne({ prepare: () => err('no-account', '无可用账号') });
    const r = await sendOneNode(t.input);
    expect(r).toEqual({ ok: false, reason: 'no-account', note: '无可用账号', accountId: null });
    expect(t.states.at(-1)).toMatchObject({ status: 'error', msg: '无可用账号' });
    expect(t.released).toEqual([]);
  });

  it('★ 传输失败 ⇒ 释放占用 + 错误态；返回 note 用 `note || reason`', async () => {
    const t = makeOne({ transport: async () => ok({ ok: false, reason: 'quota' }) });
    const r = await sendOneNode(t.input);
    expect(t.released).toEqual(['acc1']);
    expect(r).toMatchObject({ ok: false, note: 'quota', accountId: 'acc1' });
    expect(t.states.at(-1)).toMatchObject({ status: 'error', msg: 'quota' });
  });

  it('★ 传输抛异常 ⇒ 释放占用 + `reason: exception`', async () => {
    const t = makeOne({
      transport: async () => {
        throw new Error('炸了');
      },
    });
    const r = await sendOneNode(t.input);
    expect(t.released).toEqual(['acc1']);
    expect(r).toMatchObject({ ok: false, reason: 'exception', note: '炸了' });
  });

  it('★ 强制指定账号 / 排除清单会透传给 prepare', async () => {
    const seen: unknown[] = [];
    const t = makeOne({
      forceAccountId: 'acc9',
      excludeAccountIds: ['x'],
      prepare: (_id, opts) => {
        seen.push(opts);
        return ok({ account: acc('acc9'), operation: {} });
      },
    });
    await sendOneNode(t.input);
    expect(seen[0]).toEqual({ excludeAccountIds: ['x'], forceAccountId: 'acc9' });
  });

  it('没有 `setRecipe` / `recipe` 缺失 ⇒ 不调、不崩', async () => {
    const t = makeOne({ setRecipe: undefined });
    await sendOneNode(t.input);
    expect(t.recipes).toEqual([]);
  });
});
