/**
 * 队列逐项操作单测（原 `C3` 41930 / `E3` 41966 / `A3` 42011 / `I3` 42016 / `$3` 42043）
 *
 * 断言红线（**实现一变必红**）：取消的两句 note **不同**、重试的**三条不可重试**与
 * **`attempt+1` + `order` 换新**、`A3` 是"**保留在跑的**"而非"清空"、
 * `resolveSendMode` 里那句**照抄的措辞不一致**（`auto:<type>` 也显示「所选分组」）。
 */

import { describe, expect, it } from 'vitest';
import {
  clearFinishedQueue,
  isReadyToStart,
  planCancel,
  planRetry,
  queueStats,
  resolveSendMode,
} from '../sendQueueOps';
import { buildQueueItem, type QueueItem } from '../sendQueuePlan';

const NOW = 500_000;
const item = (patch: Partial<QueueItem> = {}): QueueItem => ({
  ...buildQueueItem({ id: 'q1', nodeId: 'n1', order: 1 }),
  ...patch,
});

describe('planCancel（原 `C3` 41930）', () => {
  it('★ `waiting` ⇒ note「已取消」；`sending` ⇒ note「已取消（发送中）」', () => {
    expect(planCancel(item({ status: 'waiting' }), NOW)?.patch).toEqual({
      status: 'cancelled',
      finishedAt: NOW,
      note: '已取消',
    });
    expect(planCancel(item({ status: 'sending' }), NOW)?.patch.note).toBe('已取消（发送中）');
  });

  it('★ 有 `accountId` ⇒ 返回"要释放"；没分配过 ⇒ `null`', () => {
    expect(planCancel(item({ status: 'waiting', accountId: 'acc_1' }), NOW)?.releaseAccountId).toBe('acc_1');
    expect(planCancel(item({ status: 'waiting', accountId: null }), NOW)?.releaseAccountId).toBeNull();
  });

  it('★ 其余状态**不可取消** ⇒ `null`', () => {
    for (const st of ['success', 'error', 'cancelled', 'failed']) {
      expect(planCancel(item({ status: st }), NOW)).toBeNull();
    }
  });
});

describe('planRetry（原 `E3` 41966）', () => {
  it('★ **`sending`/`waiting`/`success` 都不可重试** ⇒ `null`', () => {
    for (const st of ['sending', 'waiting', 'success']) {
      expect(planRetry(item({ status: st }), NOW)).toBeNull();
    }
  });

  it('★ 可重试 ⇒ 重置九字段，且 **`attempt + 1`**、**`order` 换成新时刻**（排到队尾）', () => {
    const p = planRetry(
      item({
        status: 'error',
        attempt: 2,
        startedAt: 1,
        finishedAt: 2,
        note: '超时',
        accountId: 'acc_9',
        accountName: '豆包09',
        order: 1,
        notBefore: 99,
      }),
      NOW,
    );
    expect(p?.patch).toEqual({
      status: 'waiting',
      attempt: 3,
      startedAt: null,
      finishedAt: null,
      note: '',
      accountId: null,
      accountName: '',
      order: NOW,
      notBefore: null,
    });
    expect(p?.releaseAccountId).toBe('acc_9');
  });

  it('`attempt` 缺失 ⇒ 从 `0` 起算成 `1`', () => {
    expect(planRetry(item({ status: 'error', attempt: 0 }), NOW)?.patch.attempt).toBe(1);
  });
});

describe('clearFinishedQueue（原 `A3` 42011）', () => {
  it('★ **保留 `waiting`/`sending`**、删掉已结束的（名字叫"清空"但语义不是清空）', () => {
    const items = [
      item({ id: 'a', status: 'waiting' }),
      item({ id: 'b', status: 'sending' }),
      item({ id: 'c', status: 'success' }),
      item({ id: 'd', status: 'cancelled' }),
      item({ id: 'e', status: 'error' }),
    ];
    expect(clearFinishedQueue(items).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('queueStats（原 `I3` 42016）', () => {
  it('★ 只统计五个具名档；**`total` 是全部项数**', () => {
    const items = [
      item({ status: 'waiting' }),
      item({ status: 'waiting' }),
      item({ status: 'sending' }),
      item({ status: 'success' }),
      item({ status: 'failed' }),
      item({ status: 'cancelled' }),
      item({ status: 'error' }), // ⚠️ 不在五档里 ⇒ 不计
    ];
    expect(queueStats(items)).toEqual({
      total: 7,
      waiting: 2,
      sending: 1,
      success: 1,
      failed: 1,
      cancelled: 1,
    });
  });

  it('空队列 ⇒ 全 0', () => {
    expect(queueStats([])).toEqual({ total: 0, waiting: 0, sending: 0, success: 0, failed: 0, cancelled: 0 });
  });
});

describe('resolveSendMode（原 `$3` 42043）', () => {
  it('★ 四档：分组 / 类型 / 固定账号 / 账号池', () => {
    expect(resolveSendMode('auto:group:g1')).toEqual({
      mode: 'auto',
      opts: { groupId: 'g1' },
      label: '所选分组',
    });
    expect(resolveSendMode('auto:dola')).toEqual({ mode: 'auto', opts: { type: 'dola' }, label: '所选分组' });
    expect(resolveSendMode('acc_7')).toEqual({ mode: 'fixed', accountId: 'acc_7', label: '所选账号' });
    expect(resolveSendMode('auto')).toEqual({ mode: 'auto', opts: {}, label: '账号池' });
  });

  it('★ 缺省 / 非字符串 ⇒ 当 `auto`（账号池）', () => {
    expect(resolveSendMode(undefined)).toEqual({ mode: 'auto', opts: {}, label: '账号池' });
    expect(resolveSendMode('')).toEqual({ mode: 'auto', opts: {}, label: '账号池' });
    expect(resolveSendMode(null)).toEqual({ mode: 'auto', opts: {}, label: '账号池' });
  });

  it('⚠️ **照抄的措辞不一致**：`auto:<type>` 那档的 label 也是「所选分组」', () => {
    // 源版就是这样（按类型选却显示"分组"）—— 改掉＝行为不等价 ⇒ 只锁住、不改
    expect(resolveSendMode('auto:dola').label).toBe('所选分组');
    expect(resolveSendMode('auto:gpt').label).toBe('所选分组');
  });

  it('前缀切得准：`auto:group:` 是 `slice(11)`、`auto:` 是 `slice(5)`', () => {
    expect(resolveSendMode('auto:group:')).toEqual({ mode: 'auto', opts: { groupId: '' }, label: '所选分组' });
    expect(resolveSendMode('auto:')).toEqual({ mode: 'auto', opts: { type: '' }, label: '所选分组' });
  });
});

describe('isReadyToStart', () => {
  it('★ `waiting` + `notBefore` 为空或已过 ⇒ 可开始', () => {
    expect(isReadyToStart(item({ status: 'waiting', notBefore: null }), NOW)).toBe(true);
    expect(isReadyToStart(item({ status: 'waiting', notBefore: NOW }), NOW)).toBe(true);
    expect(isReadyToStart(item({ status: 'waiting', notBefore: NOW - 1 }), NOW)).toBe(true);
  });

  it('★ `notBefore` 未到 ⇒ 不可开始', () => {
    expect(isReadyToStart(item({ status: 'waiting', notBefore: NOW + 1 }), NOW)).toBe(false);
  });

  it('★ 非 `waiting` ⇒ 一律不可"开始"', () => {
    for (const st of ['sending', 'success', 'error', 'cancelled']) {
      expect(isReadyToStart(item({ status: st, notBefore: null }), NOW)).toBe(false);
    }
  });
});
