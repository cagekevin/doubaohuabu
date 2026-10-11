/**
 * 队列结果结算单测（原 `TS` 执行半 42195-42285）
 *
 * 断言红线（**实现一变必红**）：
 *   ① **两个丢弃闸**（代次变了 / 已被取消）⇒ **空 patch**，但**要释放占用**；
 *   ② 成功 ⇒ 四字段「结果 `||` 原值」+ **清 `notBefore`** + **要记指纹**；
 *   ③ 放弃 ⇒ note **标签与原因相同时不重复前缀**；**两个账号都要释放**；
 *   ④ 重试 ⇒ 退避 `2000 × 第几次`、排除表 **`slice(-3)`**、`order` 换新；
 *   ⑤ 判据优先级：**有异常时看 `error.message`，否则看结果里的 `note`/`reason`**。
 */

import { describe, expect, it } from 'vitest';
import { EXCLUDE_KEEP, planQueueSettlement, RETRY_BACKOFF_BASE_MS } from '../sendQueueSettle';
import { buildQueueItem, type QueueItem } from '../sendQueuePlan';

const NOW = 800_000;
const item = (patch: Partial<QueueItem> = {}): QueueItem => ({
  ...buildQueueItem({ id: 'q1', nodeId: 'n1', order: 1, ...patch }),
  status: 'sending',
  accountId: 'acc_1',
  accountName: '豆包01',
  attempt: 1,
  ...patch,
});

const base = {
  now: NOW,
  generation: 7,
  currentGeneration: 7,
  isCancelled: false,
};

describe('planQueueSettlement（原 `TS` 执行半）', () => {
  it('★ 代次变了 ⇒ **丢弃**（空 patch）但要**释放占用**', () => {
    const r = planQueueSettlement({
      ...base,
      item: item(),
      outcome: { ok: true },
      currentGeneration: 8, // 队列被重置过
    });
    expect(r.action).toBe('discard');
    expect(r.patch).toEqual({});
    expect(r.releaseAccountIds).toEqual(['acc_1']);
    expect(r.recordFingerprint).toBe(false);
  });

  it('★ 已被取消 ⇒ 丢弃（同代次也要丢）', () => {
    const r = planQueueSettlement({ ...base, item: item(), outcome: null, isCancelled: true });
    expect(r.action).toBe('discard');
    expect(r.releaseAccountIds).toEqual(['acc_1']);
  });

  it('★ 没分配过账号的项被丢弃 ⇒ **不释放任何账号**', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ accountId: null }),
      outcome: null,
      isCancelled: true,
    });
    expect(r.releaseAccountIds).toEqual([]);
  });

  it('★★ 成功 ⇒ 四字段「结果 `||` 原值」+ **清 `notBefore`** + **要记指纹**', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ notBefore: 999 }),
      outcome: { ok: true, accountId: 'acc_2', accountName: '豆包02', note: '搞定' },
    });
    expect(r.action).toBe('success');
    expect(r.patch).toEqual({
      status: 'success',
      finishedAt: NOW,
      accountId: 'acc_2',
      accountName: '豆包02',
      note: '搞定',
      notBefore: null,
    });
    expect(r.recordFingerprint).toBe(true);
    expect(r.releaseAccountIds).toEqual(['acc_1']);
  });

  it('★ 成功但结果里**没带**账号/名字 ⇒ 用项上原值', () => {
    const r = planQueueSettlement({ ...base, item: item(), outcome: { ok: true } });
    expect(r.patch.accountId).toBe('acc_1');
    expect(r.patch.accountName).toBe('豆包01');
    expect(r.patch.note).toBe('');
  });

  it('★ 成功时**不改** `attempt`（源版成功后不回写它）', () => {
    const r = planQueueSettlement({ ...base, item: item({ attempt: 3 }), outcome: { ok: true } });
    expect(r.patch.attempt).toBeUndefined();
  });

  it('★★ 判据优先级：**有异常 ⇒ 用 `error.message`**', () => {
    const r = planQueueSettlement({
      ...base,
      item: item(),
      outcome: { ok: false, note: '结果里的原因' },
      error: { message: '抛出来的原因' },
      maxRetry: 0, // 立刻放弃，好断言 note
    });
    expect(r.action).toBe('failed');
    // 未知分类 ⇒ label 与原因不同 ⇒ 会加前缀
    expect(String(r.patch.note)).toContain('抛出来的原因');
    expect(String(r.patch.note)).not.toContain('结果里的原因');
  });

  it('★ 异常没有 `message` ⇒ 用「发送异常」兜底', () => {
    const r = planQueueSettlement({
      ...base,
      item: item(),
      outcome: null,
      error: {},
      maxRetry: 0,
    });
    expect(String(r.patch.note)).toContain('发送异常');
  });

  it('★ 没有异常也没有 note/reason ⇒ 用「发送失败」兜底', () => {
    const r = planQueueSettlement({ ...base, item: item(), outcome: { ok: false }, maxRetry: 0 });
    expect(String(r.patch.note)).toContain('发送失败');
  });

  it('★★ **放弃** ⇒ 两个账号都释放（自己 + 结果里另一个）', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ accountId: 'acc_1' }),
      outcome: { ok: false, accountId: 'acc_2', note: '次数已用完' },
      maxRetry: 0,
    });
    expect(r.action).toBe('failed');
    expect(r.releaseAccountIds).toEqual(['acc_1', 'acc_2']);
    // `accountId` 取结果里的那个
    expect(r.patch.accountId).toBe('acc_2');
  });

  it('★ 放弃时**两个账号相同** ⇒ 只释放一次', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ accountId: 'acc_1' }),
      outcome: { ok: false, accountId: 'acc_1', note: '次数已用完' },
      maxRetry: 0,
    });
    expect(r.releaseAccountIds).toEqual(['acc_1']);
  });

  it('★★ **重试** ⇒ 退避 `2000 × 第几次`、`order` 换新、`startedAt`/`finishedAt` 清空', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ attempt: 1 }),
      // `busy` 分类 ⇒ retryable 且 **不换号**
      outcome: { ok: false, note: '发送通道忙碌' },
      maxRetry: 5,
    });
    expect(r.action).toBe('retry');
    // 第几次 = attempt + 1 = 2 ⇒ 退避 4000
    expect(r.patch.notBefore).toBe(NOW + RETRY_BACKOFF_BASE_MS * 2);
    expect(r.patch.order).toBe(NOW);
    expect(r.patch.startedAt).toBeNull();
    expect(r.patch.finishedAt).toBeNull();
    expect(r.patch.status).toBe('waiting');
    expect(String(r.patch.note)).toContain('/5');
  });

  it('★★ **换号重试** ⇒ 账号清空 + 把结果里的账号加进排除表', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ accountId: 'acc_1', accountName: '旧的', excludeAccountIds: ['old1'] }),
      // `quota` 分类 ⇒ retryable + **switchAccount**
      outcome: { ok: false, accountId: 'acc_2', note: '该账号额度不足' },
      maxRetry: 5,
    });
    expect(r.action).toBe('retry');
    expect(r.patch.accountId).toBeNull();
    expect(r.patch.accountName).toBe('');
    expect(r.patch.excludeAccountIds).toEqual(['old1', 'acc_2']);
  });

  it('★ 排除表**最多留 3 个**（多了丢最旧的）', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ excludeAccountIds: ['e1', 'e2', 'e3'] }),
      outcome: { ok: false, accountId: 'e4', note: '该账号额度不足' },
      maxRetry: 5,
    });
    expect(r.patch.excludeAccountIds).toEqual(['e2', 'e3', 'e4']);
    expect(r.patch.excludeAccountIds).toHaveLength(EXCLUDE_KEEP);
  });

  it('★ **不换号**的重试**不动**排除表与账号', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ accountId: 'acc_1', accountName: '豆包01', excludeAccountIds: ['x'] }),
      outcome: { ok: false, note: '页面超时' },
      maxRetry: 5,
    });
    expect(r.patch.excludeAccountIds).toEqual(['x']);
    expect(r.patch.accountId).toBe('acc_1');
    expect(r.patch.accountName).toBe('豆包01');
  });

  it('★ 达到 `maxRetry` ⇒ 转成**放弃**（不再退避）', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ attempt: 5 }),
      outcome: { ok: false, note: '页面超时' },
      maxRetry: 5,
    });
    expect(r.action).toBe('failed');
  });

  it('★ 不可重试的分类（如风控拒绝）⇒ **立刻放弃**，不管 `attempt`', () => {
    const r = planQueueSettlement({
      ...base,
      item: item({ attempt: 0 }),
      outcome: { ok: false, note: '内容不符合规范' },
      maxRetry: 9,
    });
    expect(r.action).toBe('failed');
  });
});
