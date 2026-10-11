/**
 * 生成用例单测（双通道 + 重试/换号 + **错误透传**）
 *
 * 覆盖：docs/08 的 W9（失败分类落点）+ §6.5 原则 6（错误透传）
 * 原则 7：只测纯逻辑 —— 这里用**注入的假 adapter**（不测 adapter 实现，只测编排）
 */

import { describe, expect, it, vi } from 'vitest';
import { generateImage, generateVideo, type GenDeps } from '../generate';
// ⚠️ 从 **SSOT** 导入（`constants`），不从 `generate` 转手 —— TD-03-2
import { FAILURE_MAX_RETRY } from '@/constants';
import { ACCOUNT_PICK_TEXT } from '@/constants/text';
import { ok, err } from '@/core/model/result';
import type { Account } from '@/stable/model/account';
import type { SitePort, SiteRegistry, SendPayload } from '@/core/ports/site.port';
import type { ApiPort, HostPort } from '@/core/ports/host.port';
import type { ClockPort } from '@/core/ports/clock.port';

const acc = (id: string, status = '已登录'): Account => ({
  id,
  name: id,
  type: 'doubao',
  status,
  partition: `persist:${id}`,
  addedAt: 0,
  groupId: null,
  autoStart: false,
  fpSalt: 0,
});

const clock: ClockPort = {
  now: () => 1_700_000_000_000,
  setTimeout: () => () => undefined,
  setInterval: () => () => undefined,
};

/** 造一个可编排的假 SitePort */
function makeSite(script: Array<{ reason: Parameters<typeof err>[0]; message: string } | { ok: true }>) {
  const calls: Array<{ accountId: string; payload: SendPayload }> = [];
  let i = 0;
  const site: SitePort = {
    kind: 'doubao',
    scan: async () => ok({ items: [], skipped: 0 }),
    probe: async () => ok({ usable: true, loggedIn: true }),
    send: async (account, payload) => {
      calls.push({ accountId: account.id, payload });
      const step = script[Math.min(i, script.length - 1)];
      i += 1;
      if (step && 'ok' in step) {
        return ok({
          sessionId: 's1',
          endReason: 'settled' as const,
          results: [
            { ref: 'img://x.png', source: 'doubao' as const, accountName: account.name, genKey: 'k', ts: 1, ratio: '1:1', prompt: 'p', params: {} },
          ],
        });
      }
      return err(step!.reason, step!.message);
    },
  };
  return { site, calls };
}

function makeApi(script: Array<{ ok: true } | { reason: Parameters<typeof err>[0]; message: string }>) {
  const calls: unknown[] = [];
  let i = 0;
  const api: ApiPort = {
    providersList: async () => ok([]),
    configGet: async () => ok({ providers: [], configs: {} }),
    configSet: async () => ok({ config: {} }),
    configSetKey: async () => ok({}),
    configSetSecret: async () => ok({ hasSecret: true }),
    configTest: async () => ok({}),
    jobSubmit: async (payload) => {
      calls.push(payload);
      const step = script[Math.min(i, script.length - 1)];
      i += 1;
      // ★ 后端只回 `jobId`（不是任务对象）—— 见 `job-manager.js:430`
      if (step && 'ok' in step) return ok({ jobId: 'apj-test-1' });
      return err(step!.reason, step!.message);
    },
    jobBatch: async () => ok({ jobIds: [], errors: [], total: 0 }),
    jobCancel: async () => ok({ status: 'cancelled' }),
    jobList: async () => ok([]),
    setupGet: async () =>
      ok({
        setup: { imageProviderId: null, videoProviderId: null, fallbackProviderId: null, concurrency: 3 },
        usage: {},
      }),
    setupSet: async () =>
      ok({
        setup: { imageProviderId: null, videoProviderId: null, fallbackProviderId: null, concurrency: 3 },
      }),
    onJobEvent: () => () => undefined,
  };
  return { api, calls };
}

function makeDeps(
  site: SitePort | null,
  api: ApiPort,
  over: Partial<Pick<GenDeps, 'holdAccount' | 'releaseAccount'>> = {},
): GenDeps {
  const sites: SiteRegistry = site ? { doubao: site } : {};
  return {
    sites,
    host: { api } as Pick<HostPort, 'api'>,
    clock,
    stylePrefixOf: (ids) => (ids.length > 0 ? '水墨风，' : ''),
    // ★ 占用 / 释放（原 `Fi` / `tn`）—— 默认"永远占得到、释放记一笔"
    holdAccount: () => true,
    releaseAccount: () => undefined,
    ...over,
  };
}

describe('generateImage · 网页通道（成功路径）', () => {
  it('★ 成功 → 返回 via=web + 账号 + 结果', async () => {
    const { site } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a')],
      text: '一只猫',
      channel: 'doubao',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.via).toBe('web');
    expect(r.value.accountId).toBe('a');
    expect(r.value.results).toHaveLength(1);
  });

  it('★ 风格前缀进入报文的 text', async () => {
    const { site, calls } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    await generateImage(makeDeps(site, api), {
      accounts: [acc('a')],
      text: '一只猫',
      styleIds: ['sty-def-guofeng-2d'],
      channel: 'doubao',
    });
    expect(calls[0]!.payload.text.startsWith('画一张：水墨风，一只猫')).toBe(true);
    expect(calls[0]!.payload.source).toBe('canvas-image-gen');
  });
});

/**
 * ★ 新增（2026-10-10）：**账号占用 / 释放**（原 `Fi` / `tn`）
 *
 * 这一组的存在理由 = `docs/14` §8「`setBusyAccounts` 零调用 ⇒ `all-busy` 排队永不触发」：
 * 占用必须发生在「选号之后、发送之前」，而选号在用例内部 ⇒ 用例必须调注入的占用回调。
 */
describe('generateImage · 账号占用与释放（原 Fi / tn）', () => {
  it('★ 成功路径：占用**在发送前**、释放**在发送后**（同一账号 id）', async () => {
    const order: string[] = [];
    const { site } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const deps = makeDeps(site, api, {
      holdAccount: (id, nodeId) => {
        order.push(`hold:${id}:${String(nodeId)}`);
        return true;
      },
      releaseAccount: (id) => order.push(`release:${id}`),
    });
    await generateImage(deps, {
      accounts: [acc('a')],
      text: '猫',
      channel: 'doubao',
      sourceNodeId: 'ig_1',
    });
    expect(order).toEqual(['hold:a:ig_1', 'release:a']);
  });

  it('★ 占用失败 ⇒ `busy` + 源版文案，且**不发送、不释放**', async () => {
    const released: string[] = [];
    const { site, calls } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(
      makeDeps(site, api, {
        holdAccount: () => false,
        releaseAccount: (id) => released.push(id),
      }),
      { accounts: [acc('a')], text: '猫', channel: 'doubao' },
    );
    expect(r).toEqual(err('busy', ACCOUNT_PICK_TEXT.holdFailed));
    expect(calls).toHaveLength(0);
    expect(released).toEqual([]);
  });

  it('★ 发送失败也要释放（原 `gS` 的 `finally`）', async () => {
    const released: string[] = [];
    const { site } = makeSite([{ reason: 'send-stuck', message: '卡住' }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(
      makeDeps(site, api, { releaseAccount: (id) => released.push(id) }),
      { accounts: [acc('a')], text: '猫', channel: 'doubao' },
    );
    expect(r.ok).toBe(false);
    expect(released).toEqual(['a']);
  });

  it('★ 换号重试：每次都**先占后放**（两次尝试 ⇒ 两组占用/释放）', async () => {
    const order: string[] = [];
    const { site } = makeSite([{ reason: 'quota', message: '额度' }, { ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    await generateImage(
      makeDeps(site, api, {
        holdAccount: (id) => {
          order.push(`hold:${id}`);
          return true;
        },
        releaseAccount: (id) => order.push(`release:${id}`),
      }),
      { accounts: [acc('a'), acc('b')], text: '猫', channel: 'doubao', cursor: 0 },
    );
    expect(order).toEqual(['hold:a', 'release:a', 'hold:b', 'release:b']);
  });
});

describe('generateImage · 重试与换号（原 `g3` 决策）', () => {
  it('★ `quota`（可换号）→ 换账号重试并成功', async () => {
    const { site, calls } = makeSite([{ reason: 'quota', message: '今日生成次数已用完' }, { ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a'), acc('b')],
      text: '猫',
      channel: 'doubao',
      cursor: 0,
    });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.accountId)).toEqual(['a', 'b']); // 换号了
  });

  it('★ `page-timeout`（只重试不换号）→ 同一账号重试', async () => {
    const { site, calls } = makeSite([{ reason: 'page-timeout', message: '页面超时' }, { ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a'), acc('b')],
      text: '猫',
      channel: 'doubao',
      cursor: 0,
    });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.accountId)).toEqual(['a', 'a']); // 没换号
  });

  it('★ `risk-refuse`（不可重试）→ 立即放弃，不重试', async () => {
    const { site, calls } = makeSite([{ reason: 'risk-refuse', message: '平台拒绝（风控/内容规范）' }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a'), acc('b')],
      text: '猫',
      channel: 'doubao',
      cursor: 0,
    });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(1); // 只调了 1 次
  });

  it('★ 尝试上限 = `FAILURE_MAX_RETRY`(2) ⇒ 最多 2 次调用（attempt 从 1 起）', async () => {
    const { site, calls } = makeSite([{ reason: 'quota', message: '额度不足' }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a'), acc('b'), acc('c'), acc('d')],
      text: '猫',
      channel: 'doubao',
      cursor: 0,
    });
    expect(r.ok).toBe(false);
    // 源码 `g3`：`n >= maxRetry ⇒ give-up`，n 从 1 起 ⇒ maxRetry=2 = 最多 2 次尝试
    expect(calls).toHaveLength(FAILURE_MAX_RETRY);
    expect(FAILURE_MAX_RETRY).toBe(2);
  });

  it('★ 决策用**生产者已分类的 reason**，不拿 message 二次分类', async () => {
    // message 是一句**不含任何 f3/p3/h3 关键词**的原文；只有 reason 能判定
    const { site, calls } = makeSite([{ reason: 'risk-refuse', message: 'ERR_9102: upstream rejected' }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a'), acc('b')],
      text: '猫',
      channel: 'doubao',
      cursor: 0,
    });
    expect(r.ok).toBe(false);
    // 若错误地按 message 分类 → 会落到 unknown(retryable) → 重试；按 reason 则立即放弃
    expect(calls).toHaveLength(1);
    if (r.ok) return;
    expect(r.message).toBe('ERR_9102: upstream rejected');
  });
});

describe('§6.5 原则 6 · 错误透传（**不得改写 / 编造**）', () => {
  it('★ 失败时 message = adapter 的**原文**（不是「操作失败，请重试」）', async () => {
    const original = '上游返回了一段非常具体的原因：HTTP 429 / quota_exceeded';
    const { site } = makeSite([{ reason: 'quota', message: original }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a')],
      text: '猫',
      channel: 'doubao',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe(original);
    expect(r.reason).toBe('quota');
  });

  it('★ 无站点适配器 → 明确报错（**不编造**「网络异常」）', async () => {
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(null, api), {
      accounts: [acc('a')],
      text: '猫',
      channel: 'doubao',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain('doubao');
    expect(r.message).toContain('适配器');
  });

  it('★ 无可用账号 → `no-account`，message = 「无可用账号」', async () => {
    const { site } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a', '已失效')],
      text: '猫',
      channel: 'doubao',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no-account');
  });

  it('★ 全部被排除 → 保留**最后一次的原始错误**（不是自造文案）', async () => {
    const last = '第 N 次的原始错误原文';
    const { site } = makeSite([{ reason: 'account-invalid', message: last }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [acc('a')], // 只有一个 → 换号后池空
      text: '猫',
      channel: 'doubao',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe(last);
  });
});

describe('generateImage / generateVideo · API 通道', () => {
  it('★ 图片 API 通道 → 走 jobSubmit，返回 via=api + jobs', async () => {
    const { site } = makeSite([{ ok: true }]);
    const { api, calls } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [],
      text: '一只猫',
      channel: 'api',
      model: 'Seedream 5.0 Pro',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.via).toBe('api');
    // ★ 后端只回 `jobId`（结果经 `onJobEvent` 推送）—— 不是任务对象
    expect(r.value.jobId).toBe('apj-test-1');
    expect(calls).toHaveLength(1);
  });

  it('★ API 通道失败 → 原样转发（message 与 reason 都不改）', async () => {
    const { site } = makeSite([{ ok: true }]);
    // ⚠️ `SendFailKind` 是**发送链路**的 14 类；`auth` 属后端错误横幅（BackendErrorKind），不在其中
    const { api } = makeApi([{ reason: 'quota', message: '密钥无效（401）' }]);
    const r = await generateImage(makeDeps(site, api), { accounts: [], text: '猫', channel: 'api' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe('密钥无效（401）');
    expect(r.reason).toBe('quota');
  });

  it('★ 视频 API 通道 batch=true → 走 jobBatch（三比例）', async () => {
    const { site } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const batch = vi.spyOn(api, 'jobBatch');
    const r = await generateVideo(makeDeps(site, api), {
      accounts: [],
      text: '猫在跳舞',
      channel: 'api',
      batch: true,
    });
    expect(r.ok).toBe(true);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]![1]).toEqual({ ratios: ['16:9', '9:16', '1:1'] });
  });

  it('★ 视频网页通道 → source = `canvas-text-node`', async () => {
    const { site, calls } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    await generateVideo(makeDeps(site, api), {
      accounts: [acc('a')],
      text: '猫在跳舞',
      model: 'seedance-2.0',
      duration: 5,
      ratio: '16:9',
      channel: 'doubao',
    });
    expect(calls[0]!.payload.source).toBe('canvas-text-node');
    expect(calls[0]!.payload.text).toContain('视频生成');
  });
});
