/**
 * 发送账号解析单测 —— 回源 `Bk`(34515-34534) / `FS`(42830-42890) / `eO`(42819-42829)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  accountPickerLabel,
  buildAccountGroups,
  deriveChannelFromGroup,
  filterPoolAccounts,
  hasExecutableAccount,
  pickInitialActiveAccount,
  resolveSendAccount,
  UNGROUPED,
} from '../accountPick';
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

describe('buildAccountGroups（原 _Component45.jsx:601-621 的 `T`）', () => {
  const groups = [
    { id: 'g1', name: '主力' },
    { id: 'g2', name: '副号' },
    { id: 'g3', name: '' }, // 空名 ⇒ 未命名分组
  ];
  const mk = (id: string, groupId: string | null, type: SiteType = 'doubao', status = '已登录'): Account =>
    ({ id, name: id, type, status, partition: null, addedAt: 0, groupId, autoStart: false, fpSalt: 0 }) as Account;

  it('★ 只列出**非空**分组，且按 `groups` 的顺序', () => {
    const out = buildAccountGroups([mk('a', 'g2'), mk('b', 'g1'), mk('c', null)], groups);
    expect(out.map((g) => g.gid)).toEqual(['g1', 'g2', null]);
  });

  it('★ **空分组不显示**（原版 `if (Ne.length)`）', () => {
    const out = buildAccountGroups([mk('a', 'g1')], groups);
    expect(out.map((g) => g.gid)).toEqual(['g1']);
  });

  it('★ 「未分组」**永远排最后**（即使它在 `accounts` 里最先出现）', () => {
    const out = buildAccountGroups([mk('a', null), mk('b', 'g1')], groups);
    expect(out.map((g) => g.gid)).toEqual(['g1', null]);
    expect(out[1]!.label).toBe('未分组');
  });

  it('★ 组名为空 ⇒ `未命名分组`（原 607）', () => {
    const out = buildAccountGroups([mk('a', 'g3')], groups);
    expect(out[0]!.label).toBe('未命名分组');
  });

  it('★ 分组 id 存在但**不在 `groups` 里** ⇒ 不显示（原版按 groups 迭代）', () => {
    const out = buildAccountGroups([mk('a', 'ghost')], groups);
    expect(out).toEqual([]);
  });

  it('空账号 ⇒ 空数组', () => {
    expect(buildAccountGroups([], groups)).toEqual([]);
  });
});

describe('deriveChannelFromGroup（原 `K` 622-634）', () => {
  const mk = (type: SiteType): Account => ({ id: type, name: type, type, status: '已登录' }) as Account;

  it('★ 组内**只有一种**可执行类型 ⇒ 用它', () => {
    expect(deriveChannelFromGroup([mk('dola'), mk('dola')])).toBe('dola');
    expect(deriveChannelFromGroup([mk('gpt')])).toBe('gpt');
  });

  it('★ 多种类型 / 含不可执行类型 ⇒ 回落 `doubao`', () => {
    expect(deriveChannelFromGroup([mk('dola'), mk('gpt')])).toBe('doubao');
    expect(deriveChannelFromGroup([mk('lovart')])).toBe('doubao');
    expect(deriveChannelFromGroup([mk('doubao'), mk('lovart')])).toBe('doubao');
  });

  it('空组 ⇒ `doubao`', () => {
    expect(deriveChannelFromGroup([])).toBe('doubao');
  });

  it('★ 只看**类型**，不看登录态（源版如此）', () => {
    expect(deriveChannelFromGroup([{ id: 'x', name: 'x', type: 'dola', status: '已失效' } as Account])).toBe('dola');
  });
});

describe('hasExecutableAccount（原 1347-1349 的 `be`）', () => {
  const mk = (type: SiteType, status: string): Account => ({ id: `${type}-${status}`, name: 'x', type, status }) as Account;

  it('★ 必须**同时**满足「可用」与「可执行类型」', () => {
    expect(hasExecutableAccount([mk('doubao', '已登录')])).toBe(true);
    expect(hasExecutableAccount([mk('doubao', '已失效')])).toBe(false);
    expect(hasExecutableAccount([mk('lovart', '已登录')])).toBe(false);
  });

  it('列表里只要有一条满足就为真', () => {
    expect(hasExecutableAccount([mk('lovart', '已登录'), mk('dola', '已登录')])).toBe(true);
  });

  it('空列表 ⇒ false', () => {
    expect(hasExecutableAccount([])).toBe(false);
  });
});

describe('accountPickerLabel（原 `Se` 685-711）', () => {
  const groups = [{ id: 'g1', name: '主力' }];

  it('★ 五档逐字对齐', () => {
    expect(accountPickerLabel({ channel: 'api' })).toBe('API');
    expect(accountPickerLabel({ sendAccount: 'auto' })).toBe('自动');
    expect(accountPickerLabel({ sendAccount: 'auto:group:ungrouped' })).toBe('未分组 · 自动');
    expect(accountPickerLabel({ sendAccount: 'auto:group:g1', groups })).toBe('主力 · 自动');
    expect(accountPickerLabel({ sendAccount: 'acc_1', accounts: [{ id: 'acc_1', name: '豆包01' } as Account] })).toBe(
      '豆包01',
    );
  });

  it('★ `channel === api` **优先于** `sendAccount`（源版第一分支）', () => {
    expect(accountPickerLabel({ channel: 'api', sendAccount: 'acc_1' })).toBe('API');
  });

  it('★ 组不存在 ⇒ `分组 · 自动`（源版对 `ye?.name || 分组` 取兜底）', () => {
    expect(accountPickerLabel({ sendAccount: 'auto:group:不存在', groups })).toBe('分组 · 自动');
  });

  it('★ 显式 id **找不到** ⇒ 回落 `自动`（`auto:<type>` 因此也显示 `自动`，源版如此）', () => {
    expect(accountPickerLabel({ sendAccount: 'acc_不存在' })).toBe('自动');
    expect(accountPickerLabel({ sendAccount: 'auto:dola' })).toBe('自动');
  });

  it('缺省值 ⇒ `自动`', () => {
    expect(accountPickerLabel({})).toBe('自动');
  });

  it('`UNGROUPED` 哨兵与分组 `id` **不会混**（前者优先当未分组）', () => {
    // 即便真有个分组 id 恰好叫 ungrouped，源版也先按未分组处理
    expect(accountPickerLabel({ sendAccount: `auto:group:${UNGROUPED}`, groups: [{ id: UNGROUPED, name: 'X' }] })).toBe(
      '未分组 · 自动',
    );
  });
});

describe('pickInitialActiveAccount（原 `shared.js:26791-26805` 的 IIFE）', () => {
  /** 加 `autoStart` 的账号（既有 `acc` 助手不带这个字段） */
  const withAuto = (id: string, autoStart: boolean, status = '已登录'): Account => ({
    ...acc(id, 'doubao', { status }),
    autoStart,
  });

  it('① 第一个「已登录 **且** `autoStart`」优先 —— 即使它不是第一个账号', () => {
    const list = [withAuto('a', false), withAuto('b', true), withAuto('c', true)];
    expect(pickInitialActiveAccount(list)).toBe('b');
  });

  it('② 没有 `autoStart` 的 ⇒ 回落「第一个已登录」（跳过未登录的）', () => {
    const list = [withAuto('a', false, '未登录'), withAuto('b', false), withAuto('c', false)];
    expect(pickInitialActiveAccount(list)).toBe('b');
  });

  it('③ 全都未登录 ⇒ **仍取第一个**（源 `n[0]`，**不看状态** —— 刻意的）', () => {
    const list = [withAuto('a', false, '未登录'), withAuto('b', false, '未登录')];
    expect(pickInitialActiveAccount(list)).toBe('a');
  });

  it('空 / `null` / `undefined` ⇒ `null`（不抛）', () => {
    expect(pickInitialActiveAccount([])).toBeNull();
    expect(pickInitialActiveAccount(null)).toBeNull();
    expect(pickInitialActiveAccount(undefined)).toBeNull();
  });

  it('未登录账号**不会**因 `autoStart` 被选中（条件是 `&&`，不是 `||`）', () => {
    const list = [withAuto('a', true, '未登录'), withAuto('b', false)];
    expect(pickInitialActiveAccount(list)).toBe('b');
  });
});
