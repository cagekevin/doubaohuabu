/**
 * 账号名册单测（原 `addAccount` 30159 / `removeAccount` 30229）
 *
 * 断言红线：**实现一变必红** —— 指纹沿用/重算的分支、lovart 代理轮询、
 * 以及"追加/移除都要重编号"这三处最容易写错。
 */

import { describe, expect, it } from 'vitest';
import { addAccountToList, buildNewAccount, removeAccountFromList, type RosterDeps } from '../accountRoster';
import type { Account, Fingerprint } from '@/stable/model/account';

const NOW = 1_700_000_000_000;

const fp = (hostOS: Fingerprint['hostOS'], ver = 3): Fingerprint =>
  ({ ver, hostOS, userAgent: `UA-${hostOS}-${ver}` }) as Fingerprint;

function makeDeps(over: Partial<RosterDeps> = {}): { deps: RosterDeps; seeds: string[] } {
  const seeds: string[] = [];
  const deps: RosterDeps = {
    now: NOW,
    os: 'macos',
    fingerprintVersion: 3,
    generateFingerprint: (seed, os) => {
      seeds.push(seed);
      return fp(os);
    },
    proxyPool: [],
    ...over,
  };
  return { deps, seeds };
}

const acc = (id: string, name: string, type: Account['type'] = 'doubao', extra: Partial<Account> = {}): Account =>
  ({ id, name, type, groupId: null, autoStart: false, fpSalt: 0, status: '已登录', partition: null, addedAt: 0, ...extra }) as Account;

describe('buildNewAccount · 基础字段（原 addAccount 30159-30196）', () => {
  it('★ 名字不给 ⇒ 按分组自动编号', () => {
    const { deps } = makeDeps();
    expect(buildNewAccount([acc('a', '豆包01')], { type: 'doubao' }, deps).name).toBe('豆包02');
  });

  it('★ 给了名字就**原样用**（即便它看起来像默认名）', () => {
    const { deps } = makeDeps();
    expect(buildNewAccount([], { type: 'doubao', name: '豆包99' }, deps).name).toBe('豆包99');
  });

  it('id 不给 ⇒ `acc_<base36(now)>`；给了就用', () => {
    const { deps } = makeDeps();
    expect(buildNewAccount([], { type: 'doubao' }, deps).id).toBe(`acc_${NOW.toString(36)}`);
    expect(buildNewAccount([], { type: 'doubao', id: 'acc_fixed' }, deps).id).toBe('acc_fixed');
  });

  it('默认值：`status` = 已登录 · `addedAt` = now · `autoStart` 必须**真为 true** 才算', () => {
    const { deps } = makeDeps();
    const a = buildNewAccount([], { type: 'doubao' }, deps);
    expect(a.status).toBe('已登录');
    expect(a.addedAt).toBe(NOW);
    expect(a.autoStart).toBe(false);
    // 源：`n.autoStart === true` —— 传字符串 `'true'` **不算**
    expect(
      buildNewAccount([], { type: 'doubao', autoStart: 'true' as unknown as boolean }, deps).autoStart,
    ).toBe(false);
    expect(buildNewAccount([], { type: 'doubao', autoStart: true }, deps).autoStart).toBe(true);
  });

  it('`groupId` 缺失与 `null` 同义', () => {
    const { deps } = makeDeps();
    expect(buildNewAccount([], { type: 'doubao' }, deps).groupId).toBeNull();
  });

  it('类型会被归一（未知类型 ⇒ `doubao`）', () => {
    const { deps } = makeDeps();
    expect(buildNewAccount([], { type: '不认识的' }, deps).type).toBe('doubao');
  });
});

describe('buildNewAccount · 指纹沿用 / 重算（原 30194 的三目）', () => {
  it('★ `hostOS` 相符且版本一致 ⇒ **沿用**（不调生成器）', () => {
    const { deps, seeds } = makeDeps({ os: 'windows', fingerprintVersion: 3 });
    const a = buildNewAccount([], { type: 'doubao', fingerprint: fp('windows', 3) }, deps);
    expect(a.fingerprint?.userAgent).toBe('UA-windows-3');
    expect(seeds).toEqual([]); // 没生成
  });

  it('★ `hostOS` **不符** ⇒ 重算，且种子是 `${id}#${fpSalt}`', () => {
    const { deps, seeds } = makeDeps({ os: 'macos' });
    const a = buildNewAccount([], { type: 'doubao', id: 'acc_x', fpSalt: 7, fingerprint: fp('windows') }, deps);
    expect(seeds).toEqual(['acc_x#7']);
    expect(a.fingerprint?.hostOS).toBe('macos');
  });

  it('★ **只有 windows 校验版本号**：mac 上版本旧也沿用', () => {
    const mac = makeDeps({ os: 'macos', fingerprintVersion: 3 });
    expect(buildNewAccount([], { type: 'doubao', fingerprint: fp('macos', 1) }, mac.deps).fingerprint?.ver).toBe(1);
    expect(mac.seeds).toEqual([]);

    const win = makeDeps({ os: 'windows', fingerprintVersion: 3 });
    buildNewAccount([], { type: 'doubao', fingerprint: fp('windows', 1) }, win.deps);
    expect(win.seeds).toHaveLength(1); // 版本旧 ⇒ 重算
  });

  it('★ `other` 类型**没有指纹**（也不调生成器）', () => {
    const { deps, seeds } = makeDeps();
    const a = buildNewAccount([], { type: 'other', fingerprint: fp('macos') }, deps);
    expect(a.fingerprint).toBeUndefined();
    expect(seeds).toEqual([]);
  });

  it('`fpSalt` 缺失 ⇒ 0（种子里的盐就是 `0`）', () => {
    const { deps, seeds } = makeDeps();
    buildNewAccount([], { type: 'doubao', id: 'acc_x' }, deps);
    expect(seeds).toEqual(['acc_x#0']);
  });
});

describe('buildNewAccount · url / lovart 代理（原 30195-30211）', () => {
  it('★ `url` 只有 `other` 有', () => {
    const { deps } = makeDeps();
    expect(buildNewAccount([], { type: 'other', url: 'https://x' }, deps).url).toBe('https://x');
    expect(buildNewAccount([], { type: 'other' }, deps).url).toBe('');
    expect(buildNewAccount([], { type: 'doubao', url: 'https://x' }, deps).url).toBeUndefined();
  });

  it('★ lovart：**传了 proxy 就用**（含空串 ⇒ 直连）', () => {
    const { deps } = makeDeps({ proxyPool: ['p0', 'p1'] });
    expect(buildNewAccount([], { type: 'lovart', proxy: '' }, deps).proxy).toBe('');
    expect(buildNewAccount([], { type: 'lovart', proxy: 'px' }, deps).proxy).toBe('px');
  });

  it('★ lovart：不传 ⇒ 按**已有 lovart 数 % 池长**轮询', () => {
    const { deps } = makeDeps({ proxyPool: ['p0', 'p1', 'p2'] });
    // 已有 0 个 lovart ⇒ 取 p0
    expect(buildNewAccount([], { type: 'lovart' }, deps).proxy).toBe('p0');
    // 已有 1 个 lovart ⇒ 取 p1
    expect(buildNewAccount([acc('l1', 'lovart01', 'lovart')], { type: 'lovart' }, deps).proxy).toBe('p1');
    // 已有 3 个 ⇒ 3 % 3 = 0 ⇒ p0
    const three = [acc('l1', 'a', 'lovart'), acc('l2', 'b', 'lovart'), acc('l3', 'c', 'lovart')];
    expect(buildNewAccount(three, { type: 'lovart' }, deps).proxy).toBe('p0');
  });

  it('★ lovart：**池为空** ⇒ 空串（直连）', () => {
    const { deps } = makeDeps({ proxyPool: [] });
    expect(buildNewAccount([], { type: 'lovart' }, deps).proxy).toBe('');
  });

  it('非 lovart 类型**不带** `proxy` 字段', () => {
    const { deps } = makeDeps({ proxyPool: ['p0'] });
    expect(buildNewAccount([], { type: 'doubao' }, deps).proxy).toBeUndefined();
  });
});

describe('addAccountToList（原 `vo([...r, u])`）', () => {
  it('★ 追加后**必须重编号**（把删号留下的空洞补齐）', () => {
    const { deps } = makeDeps();
    // 名册里是 01 / 03（02 被删过）⇒ 追加一个 ⇒ 应变成 01 / 02 / 03
    const list = [acc('a', '豆包01'), acc('c', '豆包03')];
    const out = addAccountToList(list, { type: 'doubao', id: 'new' }, deps);
    expect(out.map((x) => x.name)).toEqual(['豆包01', '豆包02', '豆包03']);
    expect(out[2]!.id).toBe('new');
  });

  it('★ 不改入参（返回新数组）', () => {
    const { deps } = makeDeps();
    const list = [acc('a', '主号')];
    const out = addAccountToList(list, { type: 'doubao' }, deps);
    expect(list).toHaveLength(1);
    expect(out).toHaveLength(2);
  });

  it('自定义名不参与重编号，但**计数仍跳过它**', () => {
    const { deps } = makeDeps();
    const out = addAccountToList([acc('a', '主号'), acc('b', '豆包01')], { type: 'doubao' }, deps);
    expect(out.map((x) => x.name)).toEqual(['主号', '豆包01', '豆包02']);
  });
});

describe('removeAccountFromList（原 `vo(r.filter(...))`）', () => {
  it('★ 移除后重编号', () => {
    const out = removeAccountFromList([acc('a', '豆包01'), acc('b', '豆包02'), acc('c', '豆包03')], 'b');
    expect(out.map((x) => x.name)).toEqual(['豆包01', '豆包02']);
    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('移除不存在的 id ⇒ 内容不变（⚠️ **不是**原数组引用 —— `filter` 必然产生新数组）', () => {
    const list = [acc('a', '豆包01')];
    const out = removeAccountFromList(list, '不存在');
    expect(out).toEqual(list);
    /**
     * ⚠️ 这里**不能**断言 `toBe(list)`：源版是 `vo(r.filter(...))`，而 `vo` 只在
     * **它自己**没改名字时才返回传入的引用 —— 传进去的**已经是 filter 出的新数组**了。
     * （`renumberAccounts` 的"不变则返回原数组"保的是**它收到的那一个**。）
     */
    expect(out).not.toBe(list);
  });

  it('只删匹配的那一个（同名不同 id 不受影响）', () => {
    const out = removeAccountFromList([acc('a', '主号'), acc('b', '主号')], 'a');
    expect(out.map((x) => x.id)).toEqual(['b']);
  });
});
