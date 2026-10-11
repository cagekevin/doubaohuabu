/**
 * 账号导入 / 导出用例单测
 *
 * 覆盖（`PP.jsx:36-94` 导出 + `OP.jsx:585-699` 导入）：
 *   - 导出：空选择拒发 / cookie 失败**降级但不静默**（源版只有 console.warn）/ 保存失败转发
 *   - 导入：取消 / 解析失败 / 无账号数据 / 三重判重 / cookie 恢复计数 / 恢复失败**不中断**
 *   - ★ 原则 4：时间来自注入的 `ClockPort`（`exportedAt` 可被断言）
 */

import { describe, expect, it } from 'vitest';
import { exportAccounts, importAccounts, type AccountTransferDeps } from '../accountTransfer';
import { ok, err } from '@/core/model/result';
import { ACCOUNT_TRANSFER_TEXT } from '@/constants/text';
import type { Account } from '@/stable/model/account';
import type { ClockPort } from '@/core/ports/clock.port';

const NOW = 1_700_000_000_000;
const clock: ClockPort = {
  now: () => NOW,
  setTimeout: () => () => undefined,
  setInterval: () => () => undefined,
};

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

function makeDeps(over: Partial<AccountTransferDeps['account']> = {}) {
  const saved: string[] = [];
  const imported: Array<{ partition: string; cookies: readonly unknown[] }> = [];
  const deps: AccountTransferDeps = {
    clock,
    account: {
      exportCookies: async () => ok({ cookies: [{ name: 'c' }] }),
      importCookies: async (partition, cookies) => {
        imported.push({ partition, cookies });
        return ok({ restored: cookies.length });
      },
      saveAccountsFile: async (content) => {
        saved.push(content);
        return ok({ path: '/tmp/accounts.json' });
      },
      loadAccountsFile: async () => ok(null),
      ...over,
    },
  };
  return { deps, saved, imported };
}

describe('exportAccounts（原 PP.jsx:36-94）', () => {
  it('★ 没选账号 ⇒ 拒发（源版 `请至少选择一个账号`）', async () => {
    const { deps, saved } = makeDeps();
    expect(await exportAccounts(deps, { accounts: [] })).toEqual(
      err('no-account', ACCOUNT_TRANSFER_TEXT.pickNone),
    );
    expect(saved).toHaveLength(0);
  });

  it('导出成功：正文含 version/exportedAt（时间来自 ClockPort）+ 账号条目', async () => {
    const { deps, saved } = makeDeps();
    const res = await exportAccounts(deps, { accounts: [acc({ id: 'acc_a' })] });
    expect(res).toEqual(ok({ count: 1, warnings: [] }));
    const parsed = JSON.parse(saved[0]!);
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe(new Date(NOW).toISOString());
    expect(parsed.accounts[0]).toMatchObject({ id: 'acc_a', cookies: [{ name: 'c' }] });
  });

  it('★ cookie 读取失败：**不静默**（记 warning）但仍降级为空 cookie 继续导出', async () => {
    const { deps, saved } = makeDeps({
      exportCookies: async () => err('unknown', 'no_window'),
    });
    const res = await exportAccounts(deps, { accounts: [acc({ id: 'acc_a', name: '甲' })] });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.value.count).toBe(1);
    expect(res.value.warnings).toEqual([ACCOUNT_TRANSFER_TEXT.exportCookieFailed('甲', 'no_window')]);
    expect(JSON.parse(saved[0]!).accounts[0].cookies).toEqual([]);
  });

  it('保存失败 / 取消 ⇒ 转发后端原文（如「已取消」）', async () => {
    const { deps } = makeDeps({ saveAccountsFile: async () => err('unknown', '已取消') });
    expect(await exportAccounts(deps, { accounts: [acc({ id: 'acc_a' })] })).toEqual(
      err('unknown', '已取消'),
    );
  });
});

describe('importAccounts（原 OP.jsx:585-699）', () => {
  it('用户取消（loadAccountsFile 返回 null）⇒ canceled', async () => {
    const { deps } = makeDeps();
    expect(await importAccounts(deps, { existing: [] })).toEqual(ok({ kind: 'canceled' }));
  });

  it('端口失败 ⇒ 原样转发', async () => {
    const { deps } = makeDeps({ loadAccountsFile: async () => err('unknown', 'no_window') });
    expect(await importAccounts(deps, { existing: [] })).toEqual(err('unknown', 'no_window'));
  });

  it('★ JSON 解析失败 ⇒ 「文件格式错误」+ 原始异常进 cause', async () => {
    const { deps } = makeDeps({ loadAccountsFile: async () => ok('{坏') });
    const res = await importAccounts(deps, { existing: [] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toBe('文件格式错误');
    expect(res.cause).toBeInstanceOf(SyntaxError);
  });

  it('★ 文件里没有账号 ⇒ 「文件中无账号数据」', async () => {
    const { deps } = makeDeps({ loadAccountsFile: async () => ok(JSON.stringify({ accounts: [] })) });
    expect(await importAccounts(deps, { existing: [] })).toEqual(
      err('no-account', ACCOUNT_TRANSFER_TEXT.noAccountsInFile),
    );
  });

  it('裸数组格式也能导入（源版兼容两种历史格式）', async () => {
    const { deps } = makeDeps({
      loadAccountsFile: async () => ok(JSON.stringify([{ id: 'acc_a', name: '甲' }])),
    });
    const res = await importAccounts(deps, { existing: [] });
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.accounts.map((a) => a.id)).toEqual(['acc_a']);
  });

  it('★ 三重判重：已存在的跳过并计入 skipped', async () => {
    const existing = [acc({ id: 'acc_a', name: '甲', partition: 'persist:a' })];
    const { deps } = makeDeps({
      loadAccountsFile: async () =>
        ok(
          JSON.stringify({
            accounts: [
              { id: 'acc_a', name: '别的名字' },
              { id: 'acc_new', name: '乙', partition: 'persist:a' },
              { id: 'acc_ok', name: '丙', partition: 'persist:c' },
            ],
          }),
        ),
    });
    const res = await importAccounts(deps, { existing });
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.skipped).toBe(2);
    expect(res.value.accounts.map((a) => a.id)).toEqual(['acc_ok']);
  });

  it('★ cookie 恢复：计数累加（后端 restored）', async () => {
    const { deps, imported } = makeDeps({
      loadAccountsFile: async () =>
        ok(
          JSON.stringify({
            accounts: [
              { id: 'acc_a', name: '甲', partition: 'persist:a', cookies: [{ n: 1 }, { n: 2 }] },
              { id: 'acc_b', name: '乙', partition: 'persist:b', cookies: [{ n: 3 }] },
            ],
          }),
        ),
    });
    const res = await importAccounts(deps, { existing: [] });
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.restored).toBe(3);
    expect(imported.map((i) => i.partition)).toEqual(['persist:a', 'persist:b']);
    expect(res.value.warnings).toEqual([]);
  });

  it('★ cookie 恢复失败：**不中断整批**、如实记账、该号照样进清单', async () => {
    const { deps } = makeDeps({
      importCookies: async () => err('unknown', 'partition gone'),
      loadAccountsFile: async () =>
        ok(JSON.stringify({ accounts: [{ id: 'acc_a', name: '甲', cookies: [{ n: 1 }] }] })),
    });
    const res = await importAccounts(deps, { existing: [] });
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    expect(res.value.accounts.map((a) => a.id)).toEqual(['acc_a']);
    expect(res.value.restored).toBe(0);
    expect(res.value.warnings).toEqual([
      ACCOUNT_TRANSFER_TEXT.restoreCookieFailed('甲', 'partition gone'),
    ]);
  });

  it('没有 cookie 的账号**不调** importCookies', async () => {
    const { deps, imported } = makeDeps({
      loadAccountsFile: async () => ok(JSON.stringify({ accounts: [{ id: 'acc_a', name: '甲' }] })),
    });
    await importAccounts(deps, { existing: [] });
    expect(imported).toHaveLength(0);
  });

  it('★ 补出来的 id 用**同一批**的 base36 时间（源版 `bt` 同批共用）', async () => {
    const { deps } = makeDeps({
      loadAccountsFile: async () => ok(JSON.stringify({ accounts: [{ name: '甲' }, { name: '乙' }] })),
    });
    const res = await importAccounts(deps, { existing: [] });
    if (!res.ok || res.value.kind !== 'imported') throw new Error('unreachable');
    const base = NOW.toString(36);
    expect(res.value.accounts.map((a) => a.id)).toEqual([`acc_${base}_0`, `acc_${base}_1`]);
  });
});
