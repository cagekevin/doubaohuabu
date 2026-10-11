/**
 * 账号导入 / 导出纯规则单测
 *
 * 覆盖（**逐行对齐源实现**）：
 *   - 状态别名：`OP.jsx:624-628` 的 `Pe = {used,done,idle} → 已登录`
 *   - id / 分区 / 名字默认：`OP.jsx:635-637`
 *   - 三重判重：`OP.jsx:615-650`（id → name → partition）
 *   - 导出条目与文件正文：`PP.jsx:63-79`
 *   - 文件读取（裸数组 / `accounts` 字段）：`OP.jsx:607`
 *
 * 断言红线：**实现一变必红**。
 */

import { describe, expect, it } from 'vitest';
import {
  buildAccountsExportFile,
  makeImportedAccountId,
  makeImportedPartition,
  normalizeImportedStatus,
  readAccountsFromFile,
  selectImportableAccounts,
  toExportedAccountEntry,
  toImportedAccount,
} from '../accountTransfer';
import type { Account } from '@/stable/model/account';
import { ACCOUNTS_EXPORT_VERSION, IMPORTED_PARTITION_PREFIX } from '@/stable/contracts/schemas';

const acc = (over: Partial<Account> & { id: string }): Account => ({
  name: over.id,
  type: 'doubao',
  status: '已登录',
  partition: `persist:${over.id}`,
  addedAt: 0,
  groupId: null,
  autoStart: false,
  fpSalt: 0,
  ...over,
});

describe('normalizeImportedStatus（原 Pe 映射）', () => {
  it('★ 三个运行时态一律映射成「已登录」', () => {
    expect(normalizeImportedStatus('used')).toBe('已登录');
    expect(normalizeImportedStatus('done')).toBe('已登录');
    expect(normalizeImportedStatus('idle')).toBe('已登录');
  });

  it('其它字符串原样保留', () => {
    expect(normalizeImportedStatus('已失效')).toBe('已失效');
  });

  it('空 / 非字符串 ⇒ 兜底「已登录」', () => {
    expect(normalizeImportedStatus(undefined)).toBe('已登录');
    expect(normalizeImportedStatus('')).toBe('已登录');
    expect(normalizeImportedStatus(0)).toBe('已登录');
    expect(normalizeImportedStatus({})).toBe('已登录');
  });
});

describe('id / 分区默认（原 OP.jsx:635-636）', () => {
  it('id = acc_<base36>_<下标>', () => {
    expect(makeImportedAccountId('mv1raqbo', 3)).toBe('acc_mv1raqbo_3');
  });

  it('分区 = persist:import_<账号id>', () => {
    expect(makeImportedPartition('acc_x_0')).toBe(`${IMPORTED_PARTITION_PREFIX}acc_x_0`);
  });
});

describe('toImportedAccount（原 OP.jsx:663-676 + addAccount 归一）', () => {
  const opts = { index: 0, nowBase36: 'bt', now: 999 };

  it('★ 缺 id / 名字 / 分区时按源版补默认', () => {
    const { account } = toImportedAccount({}, opts);
    expect(account.id).toBe('acc_bt_0');
    expect(account.name).toBe('豆包00');
    expect(account.partition).toBe(`${IMPORTED_PARTITION_PREFIX}acc_bt_0`);
    expect(account.status).toBe('已登录');
    expect(account.type).toBe('doubao');
    expect(account.addedAt).toBe(999);
    expect(account.fpSalt).toBe(0);
    expect(account.groupId).toBeNull();
    expect(account.autoStart).toBe(false);
  });

  it('★ 类型白名单外的值回落 doubao；白名单内原样', () => {
    expect(toImportedAccount({ type: 'dola' }, opts).account.type).toBe('dola');
    expect(toImportedAccount({ type: 'gpt' }, opts).account.type).toBe('gpt');
    expect(toImportedAccount({ type: 'weird' }, opts).account.type).toBe('doubao');
    expect(toImportedAccount({ type: 'doubao' }, opts).account.type).toBe('doubao');
  });

  it('★ url 恒存在：非 other 为空串（源 `s === \'other\' && n.url || \'\'`）', () => {
    expect(toImportedAccount({ url: 'https://x' }, opts).account.url).toBe('');
    expect(toImportedAccount({ type: 'other', url: 'https://x' }, opts).account.url).toBe('https://x');
    expect(toImportedAccount({ type: 'other' }, opts).account.url).toBe('');
  });

  it('cookies 抽取：非数组 ⇒ 空数组', () => {
    expect(toImportedAccount({ cookies: [{ a: 1 }] }, opts).cookies).toEqual([{ a: 1 }]);
    expect(toImportedAccount({ cookies: 'nope' }, opts).cookies).toEqual([]);
    expect(toImportedAccount({}, opts).cookies).toEqual([]);
  });

  it('已有字段照收（id / 名字 / 分区 / 时间 / 盐 / 分组）', () => {
    const { account } = toImportedAccount(
      { id: 'acc_keep', name: '甲', partition: 'persist:keep', addedAt: 5, fpSalt: 3, groupId: 'g1' },
      opts,
    );
    expect(account).toMatchObject({
      id: 'acc_keep',
      name: '甲',
      partition: 'persist:keep',
      addedAt: 5,
      fpSalt: 3,
      groupId: 'g1',
    });
  });

  it('指纹原样透传（重算归 state 的 addAccount，见函数注释）', () => {
    const fp = { ver: 3, hostOS: 'windows' } as unknown as Account['fingerprint'];
    expect(toImportedAccount({ fingerprint: fp }, opts).account.fingerprint).toBe(fp);
    expect(toImportedAccount({}, opts).account.fingerprint).toBeUndefined();
  });
});

describe('selectImportableAccounts（原 OP.jsx:615-681 三重判重）', () => {
  const opts = { nowBase36: 'bt', now: 1 };

  it('★ 按 id / 名字 / 分区三种重复各自跳过', () => {
    const existing = [
      acc({ id: 'acc_a', name: '甲', partition: 'persist:a' }),
      acc({ id: 'acc_b', name: '乙', partition: 'persist:b' }),
      acc({ id: 'acc_c', name: '丙', partition: 'persist:c' }),
    ];
    const entries = [
      { id: 'acc_a', name: '新名字', partition: 'persist:new' }, // id 撞
      { id: 'acc_new1', name: '乙', partition: 'persist:new1' }, // 名字撞
      { id: 'acc_new2', name: '新名字2', partition: 'persist:b' }, // 分区撞
      { id: 'acc_new3', name: '丁', partition: 'persist:new3' }, // 可以进
    ];
    const { drafts, skipped } = selectImportableAccounts(entries, existing, opts);
    expect(skipped).toBe(3);
    expect(drafts.map((d) => d.account.id)).toEqual(['acc_new3']);
  });

  it('★ 批内自判重：同批两个一样的 id 只进一个', () => {
    const entries = [{ id: 'acc_same', name: '同名', partition: 'persist:s' }, { id: 'acc_same', name: '同名2', partition: 'persist:s2' }];
    const { drafts, skipped } = selectImportableAccounts(entries, [], opts);
    expect(drafts).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('非对象项计入 skipped', () => {
    const { drafts, skipped } = selectImportableAccounts([null, 1, 'x'], [], opts);
    expect(drafts).toEqual([]);
    expect(skipped).toBe(3);
  });

  it('分区为 null 的已有账号不进分区集合（源版 `.filter(Boolean)`）', () => {
    const existing = [acc({ id: 'acc_n', name: '无分区', partition: null })];
    // 新账号补出来的分区是 persist:import_<id>，不会与 null 冲突 ⇒ 能进
    const { drafts } = selectImportableAccounts([{ id: 'acc_z', name: '另一个' }], existing, opts);
    expect(drafts).toHaveLength(1);
  });
});

describe('导出（原 PP.jsx:63-79）', () => {
  it('条目归一：type || doubao · fpSalt || 0 · fingerprint || null', () => {
    const e = toExportedAccountEntry(
      acc({ id: 'acc_a', name: '甲', type: 'doubao', fpSalt: 0, status: '已登录', partition: null }),
      [{ k: 'v' }],
    );
    expect(e).toEqual({
      id: 'acc_a',
      name: '甲',
      type: 'doubao',
      status: '已登录',
      partition: null,
      addedAt: 0,
      fpSalt: 0,
      fingerprint: null,
      cookies: [{ k: 'v' }],
    });
  });

  it('文件正文：{version, exportedAt, accounts} 且 **2 空格缩进**', () => {
    const content = buildAccountsExportFile(
      [toExportedAccountEntry(acc({ id: 'acc_a' }), [])],
      '2026-10-10T00:00:00.000Z',
    );
    expect(content).toContain(`"version": ${ACCOUNTS_EXPORT_VERSION}`);
    expect(content).toContain('"exportedAt": "2026-10-10T00:00:00.000Z"');
    // 2 空格缩进 ⇒ 第二层键前正好两个空格
    expect(content).toContain('\n  "exportedAt"');
    expect(JSON.parse(content).accounts).toHaveLength(1);
  });
});

describe('readAccountsFromFile（原 OP.jsx:607 两种历史格式）', () => {
  it('带 accounts 的对象', () => {
    expect(readAccountsFromFile({ accounts: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
  });

  it('裸数组', () => {
    expect(readAccountsFromFile([{ id: 'a' }])).toEqual([{ id: 'a' }]);
  });

  it('其它 ⇒ 空数组', () => {
    expect(readAccountsFromFile(null)).toEqual([]);
    expect(readAccountsFromFile('x')).toEqual([]);
    expect(readAccountsFromFile({ accounts: 'nope' })).toEqual([]);
    expect(readAccountsFromFile({})).toEqual([]);
  });
});
