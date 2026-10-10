/**
 * 账号池选号单测
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { countUsable, pickAccount } from '../accountPool';
import type { Account } from '@/stable/model/account';

const acc = (id: string, status = '已登录', type: Account['type'] = 'doubao'): Account => ({
  id,
  name: id,
  type,
  status,
  partition: `persist:${id}`,
  addedAt: 0,
  groupId: null,
  autoStart: false,
  fpSalt: 0,
});

describe('pickAccount · round-robin（默认）', () => {
  it('★ 从 cursor 起环形选第一个可用', () => {
    const list = [acc('a'), acc('b'), acc('c')];
    expect(pickAccount(list, { cursor: 0 }).account?.id).toBe('a');
    expect(pickAccount(list, { cursor: 1 }).account?.id).toBe('b');
    expect(pickAccount(list, { cursor: 2 }).account?.id).toBe('c');
    expect(pickAccount(list, { cursor: 3 }).account?.id).toBe('a');
  });

  it('★ 跳过不可用账号', () => {
    const list = [acc('a', '已失效'), acc('b'), acc('c')];
    expect(pickAccount(list, { cursor: 0 }).account?.id).toBe('b');
  });

  it('★ 排除已失败账号', () => {
    const list = [acc('a'), acc('b'), acc('c')];
    expect(pickAccount(list, { cursor: 0, exclude: ['a'] }).account?.id).toBe('b');
    expect(pickAccount(list, { cursor: 0, exclude: ['a', 'b'] }).account?.id).toBe('c');
  });

  it('nextCursor 指向下一个（环形）', () => {
    const list = [acc('a'), acc('b'), acc('c')];
    expect(pickAccount(list, { cursor: 0 }).nextCursor).toBe(1);
    expect(pickAccount(list, { cursor: 2 }).nextCursor).toBe(0);
  });

  it('状态为空串按「已登录」处理（原实现 `status || 已登录`）', () => {
    const list = [acc('a', '')];
    expect(pickAccount(list, { cursor: 0 }).account?.id).toBe('a');
  });
});

describe('pickAccount · least-load', () => {
  it('★ 取负载最小者', () => {
    const list = [acc('a'), acc('b'), acc('c')];
    const load = (x: Account) => ({ a: 5, b: 1, c: 3 })[x.id] ?? 0;
    expect(pickAccount(list, { strategy: 'least-load', cursor: 0 }, load).account?.id).toBe('b');
  });

  it('least-load 但未提供 loadOf → 退化为 round-robin', () => {
    const list = [acc('a'), acc('b')];
    expect(pickAccount(list, { strategy: 'least-load', cursor: 1 }).account?.id).toBe('b');
  });
});

describe('pickAccount · 边界', () => {
  it('★ 无账号 → `no-account`', () => {
    const r = pickAccount([], {});
    expect(r.account).toBeNull();
    expect(r.reason).toBe('no-account');
  });

  it('★ 全部不可用 → `no-account`（不是 all-excluded）', () => {
    const r = pickAccount([acc('a', '已失效')], {});
    expect(r.account).toBeNull();
    expect(r.reason).toBe('no-account');
  });

  it('★ 可用但全被排除 → `all-excluded`', () => {
    const r = pickAccount([acc('a'), acc('b')], { exclude: ['a', 'b'] });
    expect(r.account).toBeNull();
    expect(r.reason).toBe('all-excluded');
  });

  it('★ preferId 命中且可用 → 直接用', () => {
    const list = [acc('a'), acc('b')];
    expect(pickAccount(list, { preferId: 'b', cursor: 0 }).account?.id).toBe('b');
  });

  it('★ preferId 不可用 → 回落池调度（不报错）', () => {
    const list = [acc('a'), acc('b', '已失效')];
    const r = pickAccount(list, { preferId: 'b', cursor: 0 });
    expect(r.account?.id).toBe('a');
    expect(r.reason).toBe('ok');
  });

  it('preferId 已被排除 → 回落池调度', () => {
    const list = [acc('a'), acc('b')];
    expect(pickAccount(list, { preferId: 'a', exclude: ['a'], cursor: 0 }).account?.id).toBe('b');
  });

  it('cursor 越界被取模', () => {
    const list = [acc('a'), acc('b')];
    expect(pickAccount(list, { cursor: 99 }).account?.id).toBe('b');
    expect(pickAccount(list, { cursor: -1 }).account?.id).toBe('a');
  });
});

describe('W11 · 账号池调度（忙跳过 + 全忙排队）', () => {
  it('★ ① 轮转顺序 acc1→acc2→acc3→acc1→acc2（5 个任务 / 3 账号，**并发 + 完成释放**）', () => {
    const list = [acc('acc1'), acc('acc2'), acc('acc3')];
    const busy: string[] = [];
    const picked: string[] = [];
    let cursor = 0;

    /** 取一个号（模拟「提交任务」）；全忙则返回 null（调用方排队） */
    const submit = (): string | null => {
      const r = pickAccount(list, { cursor, strategy: 'round-robin', busy });
      cursor = r.nextCursor;
      if (!r.account) return null;
      busy.push(r.account.id);
      picked.push(r.account.id);
      return r.account.id;
    };
    /** 模拟「任务完成，释放账号」 */
    const done = (id: string): void => {
      const i = busy.indexOf(id);
      if (i >= 0) busy.splice(i, 1);
    };

    // 前 3 个并发提交 → 各占一个账号
    expect(submit()).toBe('acc1');
    expect(submit()).toBe('acc2');
    expect(submit()).toBe('acc3');
    // 第 4、5 个：全忙 ⇒ **排队**（不是失败）
    expect(submit()).toBeNull();
    expect(pickAccount(list, { cursor, busy }).reason).toBe('all-busy');

    // acc1 完成 → 第 4 个拿到 acc1
    done('acc1');
    expect(submit()).toBe('acc1');
    // acc2 完成 → 第 5 个拿到 acc2
    done('acc2');
    expect(submit()).toBe('acc2');

    expect(picked).toEqual(['acc1', 'acc2', 'acc3', 'acc1', 'acc2']);
  });

  it('★ ② 忙账号被跳过', () => {
    const list = [acc('acc1'), acc('acc2'), acc('acc3')];
    const r = pickAccount(list, { cursor: 0, busy: ['acc1'] });
    expect(r.account?.id).toBe('acc2');
  });

  it('★ ③ 全忙 → `all-busy`（上层**排队**，不是报错）', () => {
    const list = [acc('acc1'), acc('acc2')];
    const r = pickAccount(list, { cursor: 0, busy: ['acc1', 'acc2'] });
    expect(r.account).toBeNull();
    expect(r.reason).toBe('all-busy');
  });

  it('★ 区分 `all-busy` 与 `all-excluded`', () => {
    const list = [acc('acc1'), acc('acc2')];
    expect(pickAccount(list, { exclude: ['acc1', 'acc2'] }).reason).toBe('all-excluded');
    expect(pickAccount(list, { busy: ['acc1', 'acc2'] }).reason).toBe('all-busy');
  });

  it('★ 混合（一忙一失败过）→ `all-busy`（还有可用账号在忙，值得等）', () => {
    const list = [acc('acc1'), acc('acc2')];
    const r = pickAccount(list, { busy: ['acc1'], exclude: ['acc2'] });
    expect(r.reason).toBe('all-busy');
  });

  it('★ ④ least-load 时选负载最小者（且不选忙的）', () => {
    const list = [acc('acc1'), acc('acc2'), acc('acc3')];
    const load = (a: Account) => ({ acc1: 1, acc2: 5, acc3: 0 })[a.id] ?? 0;
    // acc3 负载最小但忙 ⇒ 应选 acc1
    const r = pickAccount(list, { strategy: 'least-load', busy: ['acc3'] }, load);
    expect(r.account?.id).toBe('acc1');
  });

  it('★ preferId 命中但忙 → 回落池调度', () => {
    const list = [acc('acc1'), acc('acc2')];
    const r = pickAccount(list, { preferId: 'acc1', busy: ['acc1'], cursor: 0 });
    expect(r.account?.id).toBe('acc2');
  });

  it('忙 + 不可用叠加：全失效 → `no-account`（优先于 all-busy）', () => {
    const list = [acc('acc1', '已失效'), acc('acc2', '已失效')];
    expect(pickAccount(list, { busy: ['acc1'] }).reason).toBe('no-account');
  });
});

describe('countUsable', () => {
  it('统计可用数', () => {
    expect(countUsable([acc('a'), acc('b', '已失效'), acc('c')])).toBe(2);
    expect(countUsable([])).toBe(0);
  });
});
