/**
 * 发送编排链单测（原 `gS` 39086-39254 的公共外壳 —— 原版内联在五处，判据 C3 抽出）
 *
 * 重点：
 *   ① ★ **退级**：doubao 号池不可用 ⇒ 落到 dola；两者都不可用 ⇒ SSOT 文案
 *   ② ★ **释放保证**：`run` 成功 / 抛错 / prepare 失败，占用与租约**都要释放**
 *   ③ ★ **占用失败 ⇒ 不碰后台页**（原 `hold-failed`）
 *   ④ 站点没声明 `chatUrl` ⇒ 明确报错（不回落）
 */

import { describe, expect, it } from 'vitest';
import {
  SEND_FALLBACK_CHAIN,
  resolveSendAccountForChain,
  withBackendPage,
  type SendToSiteDeps,
} from '../sendToSite';
import { ok, err } from '@/core/model/result';
import { ACCOUNT_PICK_TEXT, BACKEND_PAGE_TEXT, SEND_TEXT } from '@/constants/text';
import type { Account } from '@/stable/model/account';
import type { SitePort, SiteRegistry } from '@/core/ports/site.port';
import type { BackendPagePort, BackendPagePrepareOptions } from '@/core/ports/backendPage.port';

const acc = (id: string, type: Account['type'] = 'doubao', status = '已登录'): Account => ({
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

const site = (kind: SitePort['kind'], chatUrl?: string): SitePort => ({
  kind,
  ...(chatUrl === undefined ? {} : { chatUrl }),
  scan: async () => ok({ items: [], skipped: 0 }),
  probe: async () => ok({ usable: true, loggedIn: true }),
  send: async () => ok({ sessionId: 's', endReason: 'settled', results: [] }),
});

const registry = (over: Partial<Record<string, SitePort>> = {}): SiteRegistry => ({
  doubao: site('doubao', 'https://www.doubao.com/chat/'),
  dola: site('dola', 'https://www.dola.com/chat/'),
  ...over,
});

function makeDeps(over: Partial<SendToSiteDeps> = {}) {
  const events: string[] = [];
  const prepared: BackendPagePrepareOptions[] = [];
  const backendPage: BackendPagePort = {

    prepareForSend: async (_a: Account, opts: BackendPagePrepareOptions) => {
      prepared.push(opts);
      events.push('prepare');
      return ok({ leaseId: 'rt_1', webContentsId: 42, href: opts.targetUrl });
    },
    release: (leaseId: string) => events.push(`release:${leaseId}`),
    runScript: async () => ok(undefined),
    reload: () => ok(undefined),

    // ⚠️ 测试夹具：泛型方法无法逐一满足，整体断言到端口类型（与 `analyzePrompt.test.ts` 同法）
  } as unknown as BackendPagePort;

  const deps: SendToSiteDeps = {
    sites: registry(),
    backendPage,
    holdAccount: (id) => {
      events.push(`hold:${id}`);
      return true;
    },
    releaseAccount: (id) => events.push(`releaseAccount:${id}`),
    ...over,
  };
  return { deps, events, prepared };
}

describe('SEND_FALLBACK_CHAIN（原 `gS` 39086-39093）', () => {
  it('★ 链序是 doubao → dola', () => {
    expect(SEND_FALLBACK_CHAIN).toEqual(['doubao', 'dola']);
  });
});

describe('resolveSendAccountForChain · 退级', () => {
  it('首选站点有号 ⇒ 直接用，`degraded=false`', () => {
    const r = resolveSendAccountForChain({ accounts: [acc('a')], sites: registry() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.choice.type).toBe('doubao');
    expect(r.choice.degraded).toBe(false);
  });

  it('★ doubao 无号 ⇒ **退到 dola**，`degraded=true`', () => {
    const r = resolveSendAccountForChain({
      accounts: [acc('d', 'dola')],
      sites: registry(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.choice.account.id).toBe('d');
    expect(r.choice.type).toBe('dola');
    expect(r.choice.degraded).toBe(true);
  });

  it('★ doubao 全忙 ⇒ 退到 dola 的**空闲**号（忙只在各自站点池内生效）', () => {
    const r = resolveSendAccountForChain({
      accounts: [acc('a'), acc('d', 'dola')],
      busy: ['a'],
      sites: registry(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.choice.account.id).toBe('d');
  });

  it('★ 两个站点都没号 ⇒ `no-account` + 源版文案', () => {
    const r = resolveSendAccountForChain({ accounts: [], sites: registry() });
    expect(r).toEqual({ ok: false, reason: 'no-account', note: SEND_TEXT.noAccount });
  });

  it('★ 有号但全忙 ⇒ `all-busy` + 源版文案', () => {
    const r = resolveSendAccountForChain({
      accounts: [acc('a'), acc('d', 'dola')],
      busy: ['a', 'd'],
      sites: registry(),
    });
    expect(r).toEqual({ ok: false, reason: 'all-busy', note: SEND_TEXT.allBusy });
  });

  it('★ 有意偏离：doubao 无号 + dola 全忙 ⇒ 报 **no-account**（源版只留最后一次 reason，会说成"都在忙"）', () => {
    const r = resolveSendAccountForChain({
      accounts: [acc('d', 'dola')],
      busy: ['d'],
      sites: registry(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no-account');
    expect(r.note).toBe(SEND_TEXT.noAccount);
  });

  it('缺少适配器的站点**跳过**（不算"没号"）', () => {
    const r = resolveSendAccountForChain({ accounts: [acc('a')], sites: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // 一个站点都没试 ⇒ 既没 no-account 也没 busy ⇒ 落到 all-busy 文案
    expect(r.reason).toBe('all-busy');
  });
});

describe('withBackendPage · 生命周期', () => {
  const input = { accounts: [acc('a')], jobId: 'analyze:n1', nodeId: 'ig_1' };

  it('★ 成功：hold → prepare → run → release(租约) → releaseAccount', async () => {
    const { deps, events, prepared } = makeDeps();
    const r = await withBackendPage(deps, input, async (ctx) => {
      events.push(`run:${ctx.account.id}:${ctx.page.webContentsId}`);
      return ok('done');
    });
    expect(r).toEqual(ok('done'));
    expect(events).toEqual(['hold:a', 'prepare', 'run:a:42', 'release:rt_1', 'releaseAccount:a']);
    expect(prepared[0]).toMatchObject({
      targetUrl: 'https://www.doubao.com/chat/',
      jobId: 'analyze:n1',
    });
  });

  it('★ `run` 抛错 ⇒ **照样释放**（原 `gS` 的 `finally`）', async () => {
    const { deps, events } = makeDeps();
    await expect(
      withBackendPage(deps, input, async () => {
        throw new Error('页内脚本炸了');
      }),
    ).rejects.toThrow('页内脚本炸了');
    expect(events).toEqual(['hold:a', 'prepare', 'release:rt_1', 'releaseAccount:a']);
  });

  it('★ prepare 失败 ⇒ 转发原因，仍释放占用（**没有租约可放**）', async () => {
    const { deps, events } = makeDeps();
    deps.backendPage = {
      ...deps.backendPage,
      prepareForSend: async () => err('page-timeout', '后台页面加载超过 30 秒'),
    };
    const r = await withBackendPage(deps, input, async () => ok('never'));
    expect(r).toEqual(err('page-timeout', '后台页面加载超过 30 秒'));
    expect(events).toEqual(['hold:a', 'releaseAccount:a']);
  });

  it('★ prepare 失败但 note 为空 ⇒ 兜底源版文案', async () => {
    const { deps } = makeDeps();
    deps.backendPage = {
      ...deps.backendPage,
      prepareForSend: async () => err('page-error', ''),
    };
    const r = await withBackendPage(deps, input, async () => ok('never'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe(BACKEND_PAGE_TEXT.loadFailed);
  });

  it('★ 占用失败 ⇒ **不碰后台页**，报 `holdFailed`', async () => {
    const { deps, events } = makeDeps({ holdAccount: () => false });
    const r = await withBackendPage(deps, input, async () => ok('never'));
    expect(r).toEqual(err('busy', ACCOUNT_PICK_TEXT.holdFailed));
    expect(events).toEqual([]);
  });

  it('★ 站点没声明 `chatUrl` ⇒ 明确报错，且**释放占用**', async () => {
    const { deps, events } = makeDeps({
      sites: registry({ doubao: site('doubao') }),
    });
    const r = await withBackendPage(deps, input, async () => ok('never'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe(SEND_TEXT.noChatUrl('doubao'));
    expect(events).toEqual(['hold:a', 'releaseAccount:a']);
  });

  it('选不到号 ⇒ 直接失败，不占用', async () => {
    const { deps, events } = makeDeps();
    const r = await withBackendPage(deps, { ...input, accounts: [] }, async () => ok('never'));
    expect(r).toEqual(err('no-account', SEND_TEXT.noAccount));
    expect(events).toEqual([]);
  });
});
