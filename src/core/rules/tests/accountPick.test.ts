/**
 * 发送账号解析单测 —— 回源 `Bk`(34515-34534) / `FS`(42830-42890) / `eO`(42819-42829)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { filterPoolAccounts, resolveSendAccount, UNGROUPED } from '../accountPick';
import { siteDisplayName } from '@/constants/text';
import type { Account, SiteType } from '@/stable/model/account';

const acc = (
  id: string,
  type: SiteType = 'doubao',
  opts: { status?: string; groupId?: string | null } = {},
): Account => ({
  id,
  name: id,
  type,
  status: opts.status ?? '已登录',
  partition: `persist:${id}`,
  addedAt: 0,
  groupId: opts.groupId ?? null,
  autoStart: false,
  fpSalt: 0,
});

describe('siteDisplayName（原 `eO` 42819）', () => {
  it('三个已知站点给专名', () => {
    expect(siteDisplayName('dola')).toBe('Dola');
    expect(siteDisplayName('gpt')).toBe('GPT');
    expect(siteDisplayName('doubao')).toBe('豆包');
  });

  it('★ 未知类型取**大写**（源：`String(e || "doubao").toUpperCase()`）', () => {
    expect(siteDisplayName('tapnow')).toBe('TAPNOW');
    expect(siteDisplayName('')).toBe('豆包'); // 空 ⇒ 回落 doubao
    expect(siteDisplayName(null)).toBe('豆包');
  });
});

describe('filterPoolAccounts（原 `Bk` 34515）', () => {
  it('① 未登录被滤掉（`status !== 已登录`）', () => {
    const list = [acc('a'), acc('b', 'doubao', { status: '未登录' })];
    expect(filterPoolAccounts(list).map((a) => a.id)).toEqual(['a']);
  });

  it('① `status` 缺失按「已登录」算（源 `s.status || "已登录"`）', () => {
    const bare = { ...acc('a'), status: '' };
    expect(filterPoolAccounts([bare]).map((a) => a.id)).toEqual(['a']);
  });

  it('② 给了 `type` ⇒ 只留该类型', () => {
    const list = [acc('a', 'doubao'), acc('b', 'gpt'), acc('c', 'dola')];
    expect(filterPoolAccounts(list, { type: 'gpt' }).map((a) => a.id)).toEqual(['b']);
  });

  it('★ ③ `ungrouped` ⇒ **没有分组**的账号（`groupId` 为 null/空）', () => {
    const list = [acc('a', 'doubao', { groupId: null }), acc('b', 'doubao', { groupId: 'g1' })];
    expect(filterPoolAccounts(list, { groupId: UNGROUPED }).map((a) => a.id)).toEqual(['a']);
  });

  it('★ ③ 具名分组 ⇒ **精确相等**', () => {
    const list = [acc('a', 'doubao', { groupId: 'g1' }), acc('b', 'doubao', { groupId: 'g2' })];
    expect(filterPoolAccounts(list, { groupId: 'g1' }).map((a) => a.id)).toEqual(['a']);
  });

  it('不给 `groupId` ⇒ 不按分组筛', () => {
    const list = [acc('a', 'doubao', { groupId: null }), acc('b', 'doubao', { groupId: 'g1' })];
    expect(filterPoolAccounts(list).map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('resolveSendAccount（原 `FS` 42830）—— ① 显式账号 id', () => {
  const accounts = [acc('a'), acc('b'), acc('c', 'gpt'), acc('d', 'doubao', { status: '未登录' })];

  it('命中且已登录 → `ok`，`reason:idle`', () => {
    const r = resolveSendAccount({ accounts, type: 'doubao', sendAccount: 'a' });
    expect(r.ok).toBe(true);
    expect(r.account?.id).toBe('a');
    expect(r.reason).toBe('idle');
    expect(r.note).toBeNull();
  });

  it('★ 不存在 → `account-missing`', () => {
    const r = resolveSendAccount({ accounts, type: 'doubao', sendAccount: 'zzz' });
    expect(r).toMatchObject({ ok: false, reason: 'account-missing', note: '所选账号不存在或未登录' });
  });

  it('★ 存在但未登录 → 同样 `account-missing`（源用同一个判断）', () => {
    const r = resolveSendAccount({ accounts, type: 'doubao', sendAccount: 'd' });
    expect(r.reason).toBe('account-missing');
  });

  it('★ 类型不符 → `account-type-mismatch`（**不回落池选号**）', () => {
    const r = resolveSendAccount({ accounts, type: 'doubao', sendAccount: 'c' });
    expect(r).toMatchObject({
      ok: false,
      reason: 'account-type-mismatch',
      note: '所选账号与当前出图通道不匹配',
    });
  });

  it('★ 正在忙 → `account-busy`', () => {
    const r = resolveSendAccount({ accounts, type: 'doubao', sendAccount: 'a', busy: ['a'] });
    expect(r).toMatchObject({
      ok: false,
      reason: 'account-busy',
      note: '所选账号正在生成中，请稍后再试',
    });
  });
});

describe('resolveSendAccount —— ②③ 池选号', () => {
  it('`auto` 选到可用账号', () => {
    const r = resolveSendAccount({ accounts: [acc('a'), acc('b')], type: 'doubao', sendAccount: 'auto' });
    expect(r.ok).toBe(true);
    expect(r.account?.id).toBe('a');
    expect(r.nextCursor).toBe(1);
  });

  it('★ 池里没有可用账号 → `no-account` + **站点名进文案**', () => {
    const r = resolveSendAccount({ accounts: [acc('d', 'doubao', { status: '未登录' })], type: 'doubao', sendAccount: 'auto' });
    expect(r).toMatchObject({ ok: false, reason: 'no-account', note: '未配置已登录的豆包账号' });
  });

  it('★ 站点名随 `type` 变（`gpt` ⇒ GPT）', () => {
    const r = resolveSendAccount({ accounts: [], type: 'gpt', sendAccount: 'auto' });
    expect(r.note).toBe('未配置已登录的GPT账号');
  });

  it('★ 可用账号**全忙** → `all-busy`（上层据此**排队**，不是报错）', () => {
    const r = resolveSendAccount({
      accounts: [acc('a'), acc('b')],
      type: 'doubao',
      sendAccount: 'auto',
      busy: ['a', 'b'],
    });
    expect(r).toMatchObject({ ok: false, reason: 'all-busy', note: '豆包账号都在忙，请稍后再试' });
  });

  it('★ 与源一致：`all-excluded` 也走「都在忙」那句（源是二元三目）', () => {
    // 池非空但全被 `busy` 挡掉 ⇒ `pickAccount` 给 `all-busy`；此处只验文案统一
    const r = resolveSendAccount({ accounts: [acc('a')], type: 'doubao', sendAccount: 'auto', busy: ['a'] });
    expect(r.note).toBe('豆包账号都在忙，请稍后再试');
  });

  it('★ `auto:group:g1` ⇒ 只在该分组内选', () => {
    const accounts = [acc('a', 'doubao', { groupId: 'g1' }), acc('b', 'doubao', { groupId: 'g2' })];
    const r = resolveSendAccount({ accounts, type: 'doubao', sendAccount: 'auto:group:g1' });
    expect(r.account?.id).toBe('a');
  });

  it('★ `auto:group:`（组名为空）⇒ 回落 `ungrouped`（源 `|| "ungrouped"`）', () => {
    const accounts = [acc('a', 'doubao', { groupId: null }), acc('b', 'doubao', { groupId: 'g1' })];
    const r = resolveSendAccount({ accounts, type: 'doubao', sendAccount: 'auto:group:' });
    expect(r.account?.id).toBe('a');
  });

  it('★ 非字符串 `sendAccount` ⇒ 按 `auto` 处理（源 `typeof t == "string" ? t : "auto"`）', () => {
    const r = resolveSendAccount({
      accounts: [acc('a')],
      type: 'doubao',
      sendAccount: 123 as unknown as string,
    });
    expect(r.account?.id).toBe('a');
  });

  it('游标透传：`cursor` 决定 round-robin 起点', () => {
    const accounts = [acc('a'), acc('b'), acc('c')];
    const r = resolveSendAccount({ accounts, type: 'doubao', sendAccount: 'auto', cursor: 2 });
    expect(r.account?.id).toBe('c');
  });
});
