/**
 * 账号分组 CRUD 单测（原 `shared.js:31937-32040`）
 *
 * 断言红线：**实现一变必红** —— `vo()` 重编号**只在源版跑了它的两处跑**
 * （`deleteGroup` / `moveAccountsToGroup`，`setGroupAutoStart` **不跑**）、空名保留原名、假值归 `null`。
 */

import { describe, expect, it } from 'vitest';
import {
  addGroup,
  deleteGroup,
  moveAccountsToGroup,
  renameGroup,
  setGroupAutoStart,
  setGroupColor,
} from '../accountGroup';
import type { Account, AccountGroup, SiteType } from '@/stable/model/account';

const acc = (id: string, extra: Partial<Account> = {}): Account => ({
  id,
  name: id,
  type: 'doubao' as SiteType,
  status: '已登录',
  partition: null,
  addedAt: 0,
  groupId: null,
  autoStart: false,
  fpSalt: 0,
  ...extra,
});

const grp = (id: string, extra: Partial<AccountGroup> = {}): AccountGroup => ({ id, name: id, ...extra });

describe('addGroup（原 31937-31951）', () => {
  it('建组：id 来自 idFactory、name trim、createdAt=now、color=null', () => {
    const r = addGroup([], '  主力  ', { idFactory: () => 'grp_x', now: 111 });
    expect(r.id).toBe('grp_x');
    expect(r.groups).toEqual([{ id: 'grp_x', name: '主力', createdAt: 111, color: null }]);
  });

  it('★ 空名 / 纯空白 ⇒ `未命名分组`', () => {
    expect(addGroup([], '   ', { idFactory: () => 'g', now: 1 }).groups[0]?.name).toBe('未命名分组');
    expect(addGroup([], '', { idFactory: () => 'g', now: 1 }).groups[0]?.name).toBe('未命名分组');
  });

  it('追加在末尾（不动已有组）', () => {
    const g0 = grp('g0');
    const r = addGroup([g0], 'x', { idFactory: () => 'g1', now: 1 });
    expect(r.groups[0]).toBe(g0);
    expect(r.groups).toHaveLength(2);
  });
});

describe('setGroupColor（原 31952-31967）', () => {
  it('只改目标组；未命中的组**引用不变**', () => {
    const gs = [grp('a'), grp('b')];
    expect(setGroupColor(gs, 'a', '#f00')[0]?.color).toBe('#f00');
    expect(setGroupColor(gs, 'a', '#f00')[1]).toBe(gs[1]);
  });

  it('★ 假值（`null` / 空串）⇒ `null`', () => {
    const gs = [grp('a', { color: '#f00' })];
    expect(setGroupColor(gs, 'a', null)[0]?.color).toBeNull();
    expect(setGroupColor(gs, 'a', '')[0]?.color).toBeNull();
  });
});

describe('renameGroup（原 31968-31983）', () => {
  it('trim 后写入', () => {
    expect(renameGroup([grp('a', { name: '旧' })], 'a', '  新  ')[0]?.name).toBe('新');
  });

  it('★ 空名 / 纯空白 ⇒ **保留原名**', () => {
    expect(renameGroup([grp('a', { name: '旧' })], 'a', '   ')[0]?.name).toBe('旧');
    expect(renameGroup([grp('a', { name: '旧' })], 'a', '')[0]?.name).toBe('旧');
  });
});

describe('deleteGroup（原 31984-32005）', () => {
  it('★ 成员落回未分组 + **重编号**；组被移除', () => {
    const accounts = [
      acc('a1', { name: '豆包01', groupId: 'g1' }),
      acc('a2', { name: '豆包05' }),
    ];
    const r = deleteGroup([grp('g1'), grp('g2')], accounts, 'g1');
    expect(r.groups.map((g) => g.id)).toEqual(['g2']);
    expect(r.accounts[0]?.groupId).toBeNull();
    // 两个都进「未分组」桶 ⇒ 按数组顺序重编号 01 / 02
    expect(r.accounts.map((a) => a.name)).toEqual(['豆包01', '豆包02']);
  });

  it('非成员的 `groupId` 不动', () => {
    const accounts = [acc('a1', { groupId: 'g1' }), acc('a2', { groupId: 'g2' })];
    const r = deleteGroup([grp('g1'), grp('g2')], accounts, 'g1');
    expect(r.accounts[1]?.groupId).toBe('g2');
  });
});

describe('moveAccountsToGroup（原 32006-32023）', () => {
  it('命中 id 的改 groupId；**重编号**', () => {
    const accounts = [
      acc('a1', { name: '豆包01' }),
      acc('a2', { name: '豆包02', groupId: 'g1' }),
    ];
    const r = moveAccountsToGroup(accounts, ['a1'], 'g1');
    expect(r[0]?.groupId).toBe('g1');
    expect(r.map((a) => a.name)).toEqual(['豆包01', '豆包02']);
  });

  it('★ `groupId` 假值 ⇒ 归 `null`（未分组）', () => {
    const accounts = [acc('a1', { groupId: 'g1' })];
    expect(moveAccountsToGroup(accounts, ['a1'], null)[0]?.groupId).toBeNull();
  });

  it('未命中的账号**引用不变**', () => {
    const accounts = [acc('a1'), acc('a2')];
    const r = moveAccountsToGroup(accounts, ['a1'], null);
    expect(r[1]).toBe(accounts[1]);
  });
});

describe('setGroupAutoStart（原 32024-32040）', () => {
  it('★ 只改该组；**不重编号**（源版此处没有 `vo`）', () => {
    const accounts = [
      acc('a1', { name: '豆包01', groupId: 'g1' }),
      acc('a2', { name: '豆包09' }),
    ];
    const r = setGroupAutoStart(accounts, 'g1', true);
    expect(r[0]?.autoStart).toBe(true);
    expect(r[1]?.autoStart).toBe(false);
    expect(r.map((a) => a.name)).toEqual(['豆包01', '豆包09']);
  });

  it('★ `groupId` 假值 ⇒ 命中**未分组**那一桶', () => {
    const accounts = [acc('a1', { groupId: 'g1' }), acc('a2')];
    const r = setGroupAutoStart(accounts, null, true);
    expect(r[0]?.autoStart).toBe(false);
    expect(r[1]?.autoStart).toBe(true);
  });
});
