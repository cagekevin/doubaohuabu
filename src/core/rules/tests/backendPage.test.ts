/**
 * 后台页纯决策单测（原 `vr` 26024-26108 + `rn` 26109-26126）
 *
 * 断言红线：**实现一变必红** —— 逐条对齐源版的常量与阈值。
 */

import { describe, expect, it } from 'vitest';
import {
  backendFailure,
  backendPollDelayMs,
  backendTimeoutNote,
  createLease,
  isLeaseAlive,
  makeLeaseId,
  shouldReloadBackendPage,
} from '../backendPage';
import {
  BACKEND_LEASE_TTL_MS,
  BACKEND_LOAD_TIMEOUT_MS,
  BACKEND_RELOAD_AFTER_MS,
} from '@/constants';

describe('SSOT 常量（逐字对齐源）', () => {
  it('默认超时 = 原 `q$` 30000；租约 TTL = 原 `Y$` 3600000；重载阈值 = 原 7000', () => {
    expect(BACKEND_LOAD_TIMEOUT_MS).toBe(30000);
    expect(BACKEND_LEASE_TTL_MS).toBe(3600000);
    expect(BACKEND_RELOAD_AFTER_MS).toBe(7000);
  });
});

describe('backendPollDelayMs（原 `Math.min(250, Math.max(10, Math.floor(a / 20)))`）', () => {
  it('30s 超时 ⇒ 250（触上限）', () => {
    expect(backendPollDelayMs(30000)).toBe(250);
  });

  it('★ 上限 250 / 下限 10', () => {
    expect(backendPollDelayMs(100000)).toBe(250);
    expect(backendPollDelayMs(100)).toBe(10);
    expect(backendPollDelayMs(0)).toBe(10);
  });

  it('中间值按 floor(t/20)', () => {
    expect(backendPollDelayMs(1000)).toBe(50);
    expect(backendPollDelayMs(4000)).toBe(200);
    expect(backendPollDelayMs(4001)).toBe(200); // floor(200.05)
  });

  it('非有限值 ⇒ 回落默认超时（不产生 NaN）', () => {
    expect(backendPollDelayMs(NaN)).toBe(250);
    expect(backendPollDelayMs(Infinity)).toBe(250);
  });
});

describe('backendTimeoutNote（原 26101）', () => {
  it('★ 秒数**向上取整**', () => {
    expect(backendTimeoutNote(30000)).toBe('后台页面加载超过 30 秒');
    expect(backendTimeoutNote(30001)).toBe('后台页面加载超过 31 秒');
    expect(backendTimeoutNote(1)).toBe('后台页面加载超过 1 秒');
  });
});

describe('shouldReloadBackendPage（原 26085）', () => {
  const base = { alreadyReloaded: false, hasWebview: true, hasError: false, elapsedMs: 0 };

  it('★ 达到 7000ms ⇒ 重载', () => {
    expect(shouldReloadBackendPage({ ...base, elapsedMs: 6999 })).toBe(false);
    expect(shouldReloadBackendPage({ ...base, elapsedMs: 7000 })).toBe(true);
  });

  it('★ 已有错误 ⇒ 不等阈值就重载', () => {
    expect(shouldReloadBackendPage({ ...base, hasError: true, elapsedMs: 0 })).toBe(true);
  });

  it('★ 只重载**一次**（`alreadyReloaded` 后永不再重载）', () => {
    expect(
      shouldReloadBackendPage({ ...base, alreadyReloaded: true, hasError: true, elapsedMs: 60000 }),
    ).toBe(false);
  });

  it('★ 没有 webview ⇒ 无从重载（即使已报错 / 已超阈值）', () => {
    expect(shouldReloadBackendPage({ ...base, hasWebview: false, hasError: true })).toBe(false);
    expect(shouldReloadBackendPage({ ...base, hasWebview: false, elapsedMs: 60000 })).toBe(false);
  });
});

describe('backendFailure（原 26100-26106）', () => {
  it('★ 有后端错误 ⇒ `page-error`，note 用**原文**', () => {
    expect(backendFailure('net::ERR_NAME_NOT_RESOLVED', 30000)).toEqual({
      reason: 'page-error',
      note: 'net::ERR_NAME_NOT_RESOLVED',
    });
  });

  it('★ 没有后端错误 ⇒ `page-timeout` + 超时文案', () => {
    expect(backendFailure(null, 30000)).toEqual({
      reason: 'page-timeout',
      note: '后台页面加载超过 30 秒',
    });
    expect(backendFailure('', 45000).reason).toBe('page-timeout');
    expect(backendFailure(undefined, 45000).note).toBe('后台页面加载超过 45 秒');
  });

  it('映射到 **SSOT 失败分类**（不新增 kind）', () => {
    // `page-error` / `page-timeout` 都是 `constants/failure.ts` 里已有的 kind
    expect(['page-error', 'page-timeout']).toContain(backendFailure('x', 1).reason);
  });
});

describe('租约（原 `vr` 26034-26056 + `rn`）', () => {
  const T0 = 1_700_000_000_000;

  it('leaseId 形如 rt_<base36>_<base36 seq>', () => {
    expect(makeLeaseId(T0, 1)).toBe(`rt_${T0.toString(36)}_1`);
    expect(makeLeaseId(T0, 10)).toBe(`rt_${T0.toString(36)}_a`);
  });

  it('建租约：默认 purpose `task`、jobId `null`、expiresAt = now + TTL', () => {
    const l = createLease({ leaseId: 'rt_1', accountId: 'a', now: T0 });
    expect(l).toEqual({
      leaseId: 'rt_1',
      accountId: 'a',
      purpose: 'task',
      jobId: null,
      acquiredAt: T0,
      expiresAt: T0 + BACKEND_LEASE_TTL_MS,
    });
  });

  it('可覆盖 purpose / jobId / TTL', () => {
    const l = createLease({
      leaseId: 'rt_1',
      accountId: 'a',
      now: T0,
      purpose: 'image-analysis',
      jobId: 'analyze:n1',
      leaseTtlMs: 1000,
    });
    expect(l.purpose).toBe('image-analysis');
    expect(l.jobId).toBe('analyze:n1');
    expect(l.expiresAt).toBe(T0 + 1000);
  });

  it('★ 存活判定：到期即失效（`now < expiresAt`）', () => {
    const l = createLease({ leaseId: 'rt_1', accountId: 'a', now: T0, leaseTtlMs: 1000 });
    expect(isLeaseAlive(l, T0)).toBe(true);
    expect(isLeaseAlive(l, T0 + 999)).toBe(true);
    expect(isLeaseAlive(l, T0 + 1000)).toBe(false);
    expect(isLeaseAlive(undefined, T0)).toBe(false);
  });
});
