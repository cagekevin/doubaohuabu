/**
 * Lovart 出口代理分配单测 —— 回源 `reassignLovartProxies`(30331-30362) + `Ps`(26441)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { assignProxyPool } from '../proxy';
import { isSiteType, normalizeAccountType, type Account, type SiteType } from '@/stable/model/account';

const acc = (id: string, type: SiteType, partition: string | null = `persist:${id}`): Account => ({
  id,
  name: id,
  type,
  status: '已登录',
  partition,
  addedAt: 0,
  groupId: null,
  autoStart: false,
  fpSalt: 0,
});

describe('normalizeAccountType（原 `Ps` 26441）', () => {
  it('已知类型原样返回', () => {
    for (const t of ['doubao', 'dola', 'lovart', 'tapnow', 'gpt', 'other'] as const) {
      expect(normalizeAccountType(t)).toBe(t);
    }
  });

  it('★ 未知 / 空 → 一律回落 `doubao`（源码无「保留原文」分支）', () => {
    expect(normalizeAccountType('unknown-site')).toBe('doubao');
    expect(normalizeAccountType('')).toBe('doubao');
    expect(normalizeAccountType(null)).toBe('doubao');
    expect(normalizeAccountType(undefined)).toBe('doubao');
  });

  it('★ 未覆盖分支：**非字符串**入参 → 回落 `doubao`', () => {
    expect(normalizeAccountType(123)).toBe('doubao');
    expect(normalizeAccountType({})).toBe('doubao');
    expect(normalizeAccountType([])).toBe('doubao');
  });
});

describe('isSiteType（类型谓词，免 `as` 收窄）', () => {
  it('已知类型 → true；其余 → false', () => {
    expect(isSiteType('lovart')).toBe(true);
    expect(isSiteType('other')).toBe(true);
    expect(isSiteType('mystery')).toBe(false);
    expect(isSiteType(123)).toBe(false);
    expect(isSiteType(null)).toBe(false);
    expect(isSiteType(undefined)).toBe(false);
  });
});

describe('assignProxyPool（原 `reassignLovartProxies` 纯逻辑半）', () => {
  it('★ 轮询分配：第 i 个 lovart 账号拿 `pool[i % n]`', () => {
    const accounts = [acc('l1', 'lovart'), acc('l2', 'lovart'), acc('l3', 'lovart')];
    const r = assignProxyPool(accounts, ['p0', 'p1']);
    expect(r.accounts.map((a) => a.proxy)).toEqual(['p0', 'p1', 'p0']);
  });

  it('★ 只数 lovart 账号：非 lovart **不占池序号**、且不加 `proxy` 字段', () => {
    const accounts = [acc('d1', 'doubao'), acc('l1', 'lovart'), acc('l2', 'lovart')];
    const r = assignProxyPool(accounts, ['p0', 'p1']);
    expect(r.accounts[0]).not.toHaveProperty('proxy');
    expect(r.accounts[1]?.proxy).toBe('p0'); // 若 d1 参与计数，这里会变成 p1
    expect(r.accounts[2]?.proxy).toBe('p1');
  });

  it('★ 空池 / null → 分配空串（= 直连），仍然写 `proxy`', () => {
    const r1 = assignProxyPool([acc('l1', 'lovart')], []);
    expect(r1.accounts[0]?.proxy).toBe('');
    const r2 = assignProxyPool([acc('l1', 'lovart')], null);
    expect(r2.accounts[0]?.proxy).toBe('');
  });

  it('★ `assignments` 只含**有 partition** 的账号（源码 `if (o.partition)`）', () => {
    const accounts = [acc('l1', 'lovart'), acc('l2', 'lovart', null)];
    const r = assignProxyPool(accounts, ['p0']);
    expect(r.assignments).toEqual([{ accountId: 'l1', partition: 'persist:l1', proxy: 'p0' }]);
    // 但 l2 仍被写入 proxy（源码如此）
    expect(r.accounts[1]?.proxy).toBe('p0');
  });

  it('★ 未覆盖分支：`partition` 为**空串** ⇒ 不进 assignments（`if (a.partition)` 为假），但仍写 `proxy`', () => {
    const r = assignProxyPool([acc('l1', 'lovart', '')], ['p0']);
    expect(r.assignments).toEqual([]);
    expect(r.accounts[0]?.proxy).toBe('p0');
  });

  it('★ 未知类型按 `doubao` 处理 ⇒ 不参与代理分配', () => {
    const weird = { ...acc('w1', 'doubao'), type: 'mystery' as SiteType };
    const r = assignProxyPool([weird, acc('l1', 'lovart')], ['p0']);
    expect(r.accounts[0]).not.toHaveProperty('proxy');
    expect(r.accounts[1]?.proxy).toBe('p0');
  });

  it('★ 不改入参（返回新数组与新对象）', () => {
    const a = acc('l1', 'lovart');
    const accounts = [a];
    const r = assignProxyPool(accounts, ['p0']);
    expect(a).not.toHaveProperty('proxy');
    expect(r.accounts[0]).not.toBe(a);
    expect(accounts).toHaveLength(1);
  });

  it('无 lovart 账号 → 全量原样、assignments 为空', () => {
    const accounts = [acc('d1', 'doubao')];
    const r = assignProxyPool(accounts, ['p0']);
    expect(r.assignments).toEqual([]);
    expect(r.accounts).toEqual(accounts);
  });
});
