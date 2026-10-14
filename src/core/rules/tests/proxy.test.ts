/**
 * Lovart 出口代理分配单测 —— 回源 `reassignLovartProxies`(30331-30362) + `Ps`(26441)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { assignProxyPool, normalizeProxyPool } from '../proxy';
import { isSiteType, normalizeAccountType, type Account, type SiteType } from '@/stable/model/account';

const acc = (id: string, type: SiteType, partition: string = `persist:${id}`): Account => ({
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

  it('★ `assignments` 含**全部** lovart 账号（分区恒有值 ⇒ 「无分区就跳过」那档已删）', () => {
    const accounts = [acc('l1', 'lovart'), acc('l2', 'lovart')];
    const r = assignProxyPool(accounts, ['p0']);
    expect(r.assignments).toEqual([
      { accountId: 'l1', partition: 'persist:l1', proxy: 'p0' },
      { accountId: 'l2', partition: 'persist:l2', proxy: 'p0' },
    ]);
  });

  /*
   * ⚠️ 原有一条「`partition` 为空串 ⇒ 不进 assignments」**已删**：
   *    空串这一档随 `if (a.partition)` 一起删除（分区由产生方保证恒有值，
   *    `Account.partition: string`）。留着它等于替「产生方又缺了」打掩护。
   */
  it('★ 空池 / 未知类型仍照旧：只分配 lovart，且 proxy 一律写上', () => {
    const r = assignProxyPool([acc('l1', 'lovart')], []);
    expect(r.assignments).toEqual([{ accountId: 'l1', partition: 'persist:l1', proxy: '' }]);
    expect(r.accounts[0]?.proxy).toBe('');
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

describe('normalizeProxyPool（原 `setProxyPool` 30321-30324 的纯半）', () => {
  it('★ 字符串按**换行**拆 → trim → 滤掉空行', () => {
    expect(normalizeProxyPool('  http://a:1 \n\n  socks5://b:2\n   ')).toEqual(['http://a:1', 'socks5://b:2']);
  });

  it('数组同样 trim + 滤空', () => {
    expect(normalizeProxyPool([' p1 ', '', '   '])).toEqual(['p1']);
  });

  it('★ null / undefined / 空串 ⇒ 空数组（源版 `String(n || 空)` 同结果）', () => {
    expect(normalizeProxyPool(null)).toEqual([]);
    expect(normalizeProxyPool(undefined)).toEqual([]);
    expect(normalizeProxyPool('')).toEqual([]);
  });
});
