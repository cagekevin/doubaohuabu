/**
 * 账号忙标记单测（原 `Fi` 34596 · `tn` 34614 · `Hk` 34611 · `qP` 34630）
 *
 * 重点锁三件事（都会在实现漂移时变红）：
 *   ① **TTL**：过期即可再占用（原版 `Er` 无比对 TTL —— 这是**有意收口**，见文件头）
 *   ② **`itemId` 所有权**：不是自己占的**不许放**（原 `tn` 的核心作用）
 *   ③ **不可变**：不改传入的 map
 */

import { describe, expect, it } from 'vitest';
import {
  busyIdsOf,
  clearBusy,
  holdAccount,
  isAccountBusy,
  pruneBusy,
  releaseAccount,
  type BusyMap,
} from '../accountBusy';
import { ACCOUNT_BUSY_TIMEOUT_MS } from '@/constants';

const T0 = 1_700_000_000_000;

describe('holdAccount（原 Fi）', () => {
  it('空表可占；返回带 since/expiresAt 的新表', () => {
    const m = holdAccount({}, 'a', { now: T0, nodeId: 'ig_1' });
    expect(m).not.toBeNull();
    expect(m!.a).toEqual({
      itemId: null,
      nodeId: 'ig_1',
      since: T0,
      expiresAt: T0 + ACCOUNT_BUSY_TIMEOUT_MS,
    });
  });

  it('★ 被占用（未过期）⇒ `null`（原 `Fi` 的 `return false`）', () => {
    const m = holdAccount({}, 'a', { now: T0 })!;
    expect(holdAccount(m, 'a', { now: T0 + 1 })).toBeNull();
  });

  it('★ TTL 到期 ⇒ 可再占（这里与源版 `Er` 有意不同，见文件头）', () => {
    const m = holdAccount({}, 'a', { now: T0, ttlMs: 1000 })!;
    expect(holdAccount(m, 'a', { now: T0 + 999 })).toBeNull();
    const again = holdAccount(m, 'a', { now: T0 + 1000 });
    expect(again).not.toBeNull();
    // 且过期条目已被顺带清掉（不是叠着两条）
    expect(Object.keys(again!)).toEqual(['a']);
  });

  it('★ 空 accountId ⇒ `null`（原 `if (!e || Er.has(e))`）', () => {
    expect(holdAccount({}, '', { now: T0 })).toBeNull();
  });

  it('★ 不改原表（不可变）', () => {
    const m: BusyMap = {};
    holdAccount(m, 'a', { now: T0 });
    expect(m).toEqual({});
  });

  it('占用不同账号互不影响', () => {
    const m = holdAccount({}, 'a', { now: T0 })!;
    const m2 = holdAccount(m, 'b', { now: T0 })!;
    expect(Object.keys(m2).sort()).toEqual(['a', 'b']);
  });
});

describe('releaseAccount（原 tn）', () => {
  it('释放已占用的账号 ⇒ `released: true` 且从表中消失', () => {
    const m = holdAccount({}, 'a', { now: T0 })!;
    const { map, released } = releaseAccount(m, 'a');
    expect(released).toBe(true);
    expect(map).toEqual({});
  });

  it('★ 释放没占用的 ⇒ `false`（原 `Er.delete` 返回 false）', () => {
    expect(releaseAccount({}, 'a')).toEqual({ map: {}, released: false });
  });

  it('★ `itemId` 不符 ⇒ 不动（原 `t.itemId && n.itemId !== t.itemId`）', () => {
    const m = holdAccount({}, 'a', { now: T0, itemId: 'job-1' })!;
    const mismatched = releaseAccount(m, 'a', { itemId: 'job-2' });
    expect(mismatched.released).toBe(false);
    expect(mismatched.map).toBe(m);
    // 对的 itemId 才放得掉
    expect(releaseAccount(m, 'a', { itemId: 'job-1' }).released).toBe(true);
  });

  it('★ 对方已过期（键还在，但 itemId 不匹配）⇒ 也不动 —— 所有权优先', () => {
    const m = holdAccount({}, 'a', { now: T0, itemId: 'mine' })!;
    expect(releaseAccount(m, 'a', { itemId: 'other' }).released).toBe(false);
  });

  it('空 accountId ⇒ false', () => {
    expect(releaseAccount({ a: { itemId: null, nodeId: null, since: 0, expiresAt: 1 } }, '').released).toBe(false);
  });

  it('★ 不改原表', () => {
    const m = holdAccount({}, 'a', { now: T0 })!;
    releaseAccount(m, 'a');
    expect(Object.keys(m)).toEqual(['a']);
  });
});

describe('isAccountBusy / busyIdsOf / pruneBusy（原 Hk + store accountBusy）', () => {
  const m = holdAccount(holdAccount({}, 'a', { now: T0 })!, 'b', { now: T0, ttlMs: 10 })!;

  it('按 TTL 判忙', () => {
    expect(isAccountBusy(m, 'a', T0 + 1)).toBe(true);
    expect(isAccountBusy(m, 'b', T0 + 10)).toBe(false);
    expect(isAccountBusy(m, 'zzz', T0)).toBe(false);
  });

  it('busyIdsOf 只给未过期的（喂 pickAccount 用）', () => {
    expect(busyIdsOf(m, T0 + 1)).toEqual(['a', 'b']);
    expect(busyIdsOf(m, T0 + 10)).toEqual(['a']);
  });

  it('pruneBusy 无变化时**返回同一引用**（免得白 render）', () => {
    expect(pruneBusy(m, T0 + 1)).toBe(m);
    const pruned = pruneBusy(m, T0 + 10);
    expect(pruned).not.toBe(m);
    expect(Object.keys(pruned)).toEqual(['a']);
  });
});

describe('clearBusy（原 qP 34630）', () => {
  it('全清（无 itemId 约束）', () => {
    const m = holdAccount(holdAccount({}, 'a', { now: T0 })!, 'b', { now: T0 })!;
    expect(clearBusy(m)).toEqual({});
  });

  it('★ 带 itemId ⇒ 只清"我的"那些（逐个 `tn` 的语义）', () => {
    const m = holdAccount(holdAccount({}, 'a', { now: T0, itemId: 'mine' })!, 'b', {
      now: T0,
      itemId: 'other',
    })!;
    const out = clearBusy(m, { itemId: 'mine' });
    expect(Object.keys(out)).toEqual(['b']);
  });
});
