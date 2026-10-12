/**
 * 账号默认名单测（原 `Mk` 26504 / `xT` 26391 / `vo` 26527 / `addAccount` 30167）
 *
 * 断言红线：**实现一变必红** —— 大小写、前导零、分组分桶、引用相等都被锁住。
 */

import { describe, expect, it } from 'vitest';
import {
  accountAvatarText,
  accountNamePrefix,
  isDefaultAccountName,
  makeAccountName,
  nextAccountName,
  renumberAccounts,
} from '../accountName';
import type { Account } from '@/stable/model/account';

const acc = (id: string, name: string, type: Account['type'] = 'doubao', groupId: string | null = null): Account =>
  ({ id, name, type, groupId }) as Account;

describe('accountAvatarText（原 `OP.jsx:724`）', () => {
  it('★ 取名字里的**第一段数字**（`豆包01` → `01`）', () => {
    expect(accountAvatarText({ type: 'doubao', name: '豆包01' })).toBe('01');
    expect(accountAvatarText({ type: 'lovart', name: 'lovart12' })).toBe('12');
  });

  it('★ 没有数字 ⇒ 取**首字**', () => {
    expect(accountAvatarText({ type: 'doubao', name: '主号' })).toBe('主');
  });

  it('★ `other` 恒 `其`（不看名字）', () => {
    expect(accountAvatarText({ type: 'other', name: '豆包01' })).toBe('其');
  });

  it('★ 空名 / 缺名 ⇒ 兜底 `豆`', () => {
    expect(accountAvatarText({ type: 'doubao', name: '' })).toBe('豆');
    expect(accountAvatarText({ type: 'doubao' })).toBe('豆');
  });
});

describe('accountNamePrefix（原 Mk 26504）', () => {
  it('★ 逐字对齐源（含大小写差异）', () => {
    expect(accountNamePrefix('doubao')).toBe('豆包');
    expect(accountNamePrefix('dola')).toBe('dola'); // 小写
    expect(accountNamePrefix('lovart')).toBe('lovart');
    expect(accountNamePrefix('tapnow')).toBe('tapnow');
    expect(accountNamePrefix('gpt')).toBe('GPT'); // 大写
    expect(accountNamePrefix('other')).toBe('其他');
  });

  it('未知 / 空类型 ⇒ 回落「豆包」（源版 else 分支）', () => {
    expect(accountNamePrefix('不认识的')).toBe('豆包');
    expect(accountNamePrefix('')).toBe('豆包');
  });
});

describe('isDefaultAccountName（原 xT 26391）', () => {
  it('★ 允许空格 / 下划线 / 连字符 + 前导零', () => {
    for (const name of ['豆包01', '豆包1', '豆包 01', '豆包_1', '豆包-01']) {
      expect(isDefaultAccountName('doubao', name)).toBe(true);
    }
  });

  it('★ 其它类型**不区分大小写**（`/i`）', () => {
    expect(isDefaultAccountName('dola', 'DOLA01')).toBe(true);
    expect(isDefaultAccountName('gpt', 'gpt1')).toBe(true);
    expect(isDefaultAccountName('gpt', 'GPT 07')).toBe(true);
    expect(isDefaultAccountName('other', '其他02')).toBe(true);
  });

  it('★ 纯中文名（不带编号）**不算**默认名 —— 不会被自动改名', () => {
    expect(isDefaultAccountName('doubao', '豆包')).toBe(false);
    expect(isDefaultAccountName('doubao', '我的主号')).toBe(false);
    expect(isDefaultAccountName('doubao', '')).toBe(false);
  });

  it('类型不匹配的名字不算（`dola01` 对 doubao 类型）', () => {
    expect(isDefaultAccountName('doubao', 'dola01')).toBe(false);
  });
});

describe('renumberAccounts（原 vo 26527）', () => {
  it('★ 默认名在**分组内**重新编号', () => {
    const out = renumberAccounts([acc('a', '豆包05'), acc('b', '豆包09')]);
    expect(out.map((x) => x.name)).toEqual(['豆包01', '豆包02']);
  });

  it('★ **自定义名绝不被覆盖**', () => {
    const out = renumberAccounts([acc('a', '豆包05'), acc('b', '主账号'), acc('c', '豆包09')]);
    expect(out.map((x) => x.name)).toEqual(['豆包01', '主账号', '豆包02']);
  });

  it('★ 计数器**按 `groupId` 分桶**（不同分组各从 1 开始）', () => {
    const out = renumberAccounts([
      acc('a', '豆包03', 'doubao', null),
      acc('b', '豆包07', 'doubao', 'g1'),
      acc('c', '豆包11', 'doubao', null),
      acc('d', '豆包13', 'doubao', 'g1'),
    ]);
    expect(out.map((x) => x.name)).toEqual(['豆包01', '豆包01', '豆包02', '豆包02']);
  });

  it('★ 同组**混类型**时共用一个计数器（源版就怪 —— 照实锁住，勿"顺手修好"）', () => {
    /**
     * 源 `vo` 的计数器是 `t: Map<groupId, count>` —— **只按分组分桶，不按类型**：
     * 每个「名字匹配自己类型默认模式」的账号都让同一个计数 +1，于是同组混类型会得到
     * `豆包01` / `dola02` / `豆包03` 这种**跨类型连号**。
     * 看起来像瑕疵，但它是源版**确定的行为**（改掉＝行为不等价）⇒ 只锁住、不改。
     */
    const out = renumberAccounts([acc('a', '豆包01'), acc('b', 'dola01', 'dola'), acc('c', '豆包08')]);
    expect(out.map((x) => x.name)).toEqual(['豆包01', 'dola02', '豆包03']);
  });

  it('分到**不同组**时各类型各从 1 开始（分桶仍是分组）', () => {
    const out = renumberAccounts([
      acc('a', '豆包01', 'doubao', 'g1'),
      acc('b', 'dola01', 'dola', 'g2'),
      acc('c', '豆包08', 'doubao', 'g1'),
      acc('d', 'dola09', 'dola', 'g2'),
    ]);
    expect(out.map((x) => x.name)).toEqual(['豆包01', 'dola01', '豆包02', 'dola02']);
  });

  it('★ **无变化 ⇒ 返回原数组**（引用相等，源版靠它省一次 store 写入）', () => {
    const list = [acc('a', '豆包01'), acc('b', '主账号')];
    expect(renumberAccounts(list)).toBe(list);
  });

  it('★ 名字**已经是目标值** ⇒ 返回原对象（保引用）', () => {
    const a = acc('a', '豆包01');
    const out = renumberAccounts([a, acc('b', '自定')]);
    expect(out[0]).toBe(a);
  });

  it('`groupId` 缺失与 `null` 视为同一桶（源 `|| null`）', () => {
    const out = renumberAccounts([
      { ...acc('a', '豆包04'), groupId: undefined } as unknown as Account,
      acc('b', '豆包06', 'doubao', null),
    ]);
    expect(out.map((x) => x.name)).toEqual(['豆包01', '豆包02']);
  });

  it('空数组不崩', () => {
    expect(renumberAccounts([])).toEqual([]);
  });
});

describe('nextAccountName（原 addAccount 30167-30180）', () => {
  it('★ 取**同分组同类型**的**最大编号 + 1**（不是"数量 + 1"）', () => {
    expect(
      nextAccountName([acc('a', '豆包05'), acc('b', '豆包09'), acc('c', '豆包02')], 'doubao'),
    ).toBe('豆包10');
  });

  it('★ 删过账号也接着最大号走（`01` 被删掉，下一个仍是 `03`）', () => {
    expect(nextAccountName([acc('a', '豆包03')], 'doubao')).toBe('豆包04');
  });

  it('★ 只看**同一分组**', () => {
    const list = [acc('a', '豆包09', 'doubao', 'g1'), acc('b', '豆包02', 'doubao', null)];
    expect(nextAccountName(list, 'doubao', null)).toBe('豆包03');
    expect(nextAccountName(list, 'doubao', 'g1')).toBe('豆包10');
  });

  it('★ 自定义名 / 别的类型**不参与**计数', () => {
    expect(nextAccountName([acc('a', '豆包99'), acc('b', '主账号'), acc('c', 'dola50', 'dola')], 'doubao')).toBe(
      '豆包100',
    );
  });

  it('空池 ⇒ `01`', () => {
    expect(nextAccountName([], 'doubao')).toBe('豆包01');
    expect(nextAccountName([], 'gpt')).toBe('GPT01');
  });
});

describe('makeAccountName', () => {
  it('编号补零到 2 位；超过 99 不截断', () => {
    expect(makeAccountName('doubao', 1)).toBe('豆包01');
    expect(makeAccountName('doubao', 100)).toBe('豆包100');
  });
});
