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
import { FAIL_LABEL } from '@/constants/failure';
import { ok, err } from '@/core/model/result';
import type { Account } from '@/stable/model/account';
import type { SitePort, SiteRegistry } from '@/core/ports/site.port';
import type { SiteSendPayload } from '@/core/rules/payload';
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
  const calls: Array<{ accountId: string; payload: SiteSendPayload }> = [];
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
  /** ★ 批量调用的实参（`{basePayload, matrix}`）—— 断言报文形状用 */
  const batchCalls: Array<{ basePayload: unknown; matrix: unknown }> = [];
  let i = 0;
  /** 取脚本里的下一步（两个提交口**共用同一个游标** —— 失败路径也要能测） */
  const nextStep = () => {
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    return step;
  };
  const api: ApiPort = {
    providersList: async () => ok([]),
    configGet: async () => ok({ providers: [], configs: {} }),
    configSet: async () => ok({ config: {} }),
    configSetKey: async () => ok({}),
    configSetSecret: async () => ok({ hasSecret: true }),
    configTest: async () => ok({}),
    jobSubmit: async (payload) => {
      calls.push(payload);
      const step = nextStep();
      // ★ 后端只回 `jobId`（不是任务对象）—— 见 `job-manager.js:430`
      if (step && 'ok' in step) return ok({ jobId: 'apj-test-1' });
      return err(step!.reason, step!.message);
    },
    jobBatch: async (basePayload: unknown, matrix: unknown) => {
      batchCalls.push({ basePayload, matrix });
      const step = nextStep();
      if (!step || !('ok' in step)) return err(step!.reason, step!.message);
      // ★ 与后端同形：`matrix` 逐位展开 ⇒ 逐位回 `jobIds`（`job-manager.js:463-480`）
      const n = Array.isArray(matrix) ? matrix.length : 0;
      return ok({
        jobIds: Array.from({ length: n }, (_, k) => `apj-batch-${k + 1}`),
        errors: Array.from({ length: n }, () => null),
        total: n,
      });
    },
    jobCancel: async () => ok({ status: 'cancelled' }),
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
  return { api, calls, batchCalls };
}

function makeDeps(
  site: SitePort | null,
  api: ApiPort,
  over: Partial<Pick<GenDeps, 'holdAccount' | 'releaseAccount' | 'busyIds'>> = {},
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
    // ★ 忙账号（原 `Hk` 的 `accountBusy` 读侧）—— 默认"没人忙"（TD-02-16）
    busyIds: () => [],
    // ★ 尝试 id（原 `O$`）—— 测试给**确定性**产出，断言才能写死（真源用时间36 + 自增36）
    makeAttemptId: (() => {
      let n = 0;
      return () => `a-test-${++n}`;
    })(),
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
 * 这一组的存在理由 = `docs/过程.md` §8「`setBusyAccounts` 零调用 ⇒ `all-busy` 排队永不触发」：
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

/**
 * ★ 新增（2026-10-11 · TD-02-16）：**选号必须带 `busy`**
 *
 * 病灶：`sendViaWeb` 选号**不传 `busy`** ⇒ 选中正在生成的账号 ⇒ `holdAccount` 失败 ⇒
 * 直接报 `busy`（**而不是跳过它换下一个空闲号**）。这一组断言"忙号被跳过"。
 */
describe('generateImage · 选号跳过忙账号（TD-02-16）', () => {
  it('★ 忙账号被跳过：cursor=0 时选中的是**下一个空闲号**（不是忙的那个）', async () => {
    const { site, calls } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api, { busyIds: () => ['a'] }), {
      accounts: [acc('a'), acc('b')],
      text: '猫',
      channel: 'doubao',
      cursor: 0,
    });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.accountId)).toEqual(['b']);
  });

  it('★ 全忙 ⇒ `busy` + SSOT 文案，且**一个都不发**', async () => {
    const { site, calls } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api, { busyIds: () => ['a', 'b'] }), {
      accounts: [acc('a'), acc('b')],
      text: '猫',
      channel: 'doubao',
      cursor: 0,
    });
    expect(r).toEqual(err('busy', FAIL_LABEL.busy));
    expect(calls).toHaveLength(0);
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
  it('★ 图片 API 通道 → 走 jobBatch（**张数 = N 个任务**），报文逐字对后端契约', async () => {
    const { site } = makeSite([{ ok: true }]);
    const { api, batchCalls } = makeApi([{ ok: true }]);
    const r = await generateImage(makeDeps(site, api), {
      accounts: [],
      text: '一只猫',
      channel: 'api',
      count: 3,
      styleIds: ['s1'],
      ratio: '1:1',
      providerId: 'sd',
      sourceNodeId: 'ig_1',
      images: ['data:image/png;base64,BBB'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.via).toBe('api');
    expect(batchCalls).toHaveLength(1);
    const { basePayload, matrix } = batchCalls[0]!;
    // ★ 后端 `submit(payload)` 读的就是这六个字段（`job-manager.js:415`）
    expect(basePayload).toEqual({
      providerId: 'sd',
      kind: 'image',
      // 源 `_Component45.jsx:924`：`${前缀}${正文}`（**不加**额外「，」）且正文本 `trim()`
      prompt: '水墨风，一只猫',
      params: { ratio: '1:1' },
      nodeId: 'ig_1',
      refSources: ['data:image/png;base64,BBB'],
    });
    // 张数 3 ⇒ matrix 是**长度 3 的数组**（源 `Array.from({length:N},()=>({}))`）
    expect(matrix).toEqual([{}, {}, {}]);
    expect(r.value.batch!.jobIds).toEqual(['apj-batch-1', 'apj-batch-2', 'apj-batch-3']);
  });

  it('★ 图片 API 通道：张数缺省 ⇒ 1 个任务（`clampImageCount` 兜底）', async () => {
    const { site } = makeSite([{ ok: true }]);
    const { api, batchCalls } = makeApi([{ ok: true }]);
    await generateImage(makeDeps(site, api), { accounts: [], text: '猫', channel: 'api' });
    expect((batchCalls[0]!.matrix as unknown[]).length).toBe(1);
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

  it('★ 视频 API 通道 batch=true → 走 jobBatch，matrix 是**数组**且**每个变体各带一条 attempt**', async () => {
    const { site } = makeSite([{ ok: true }]);
    const { api } = makeApi([{ ok: true }]);
    const batch = vi.spyOn(api, 'jobBatch');
    const r = await generateVideo(makeDeps(site, api), {
      accounts: [],
      text: '猫在跳舞',
      channel: 'api',
      batch: true,
      providerId: 'kl',
      providerName: '可灵',
      duration: 6,
      model: 'seedance-2.5',
    });
    expect(r.ok).toBe(true);
    expect(batch).toHaveBeenCalledTimes(1);
    // ★ 后端 `submitBatch` 用 `Array.isArray(matrix)` 判定（job-manager.js:464）——
    //   传对象会被静默当成空数组 ⇒ 提交 0 个任务却报成功。断言形状即锁死这条 bug。
    const matrix = batch.mock.calls[0]![1] as Array<{
      params: { ratio: string };
      attempt: { id: string; status: string; accountName: string; note: string; params: unknown; edit: unknown };
    }>;
    expect(matrix.map((v) => v.params.ratio)).toEqual(['16:9', '9:16', '1:1']);
    // ★ TD-03-6：每条变体带自己的 attempt（原 `Z3_1.jsx:904-927`）⇒ 出片后 genHistory 才有记录
    expect(matrix.map((v) => v.attempt.id)).toEqual(['a-test-1', 'a-test-2', 'a-test-3']);
    expect(matrix.map((v) => v.attempt.status)).toEqual(['pending', 'pending', 'pending']);
    expect(matrix.map((v) => v.attempt.accountName)).toEqual([
      'API · 可灵 · 16:9',
      'API · 可灵 · 9:16',
      'API · 可灵 · 1:1',
    ]);
    expect(matrix.map((v) => v.attempt.note)).toEqual([
      'API 批量 · 可灵 · 16:9',
      'API 批量 · 可灵 · 9:16',
      'API 批量 · 可灵 · 1:1',
    ]);
    expect(matrix[1]!.attempt.params).toEqual({ ratio: '9:16', duration: 6, styleId: null });
    expect(matrix[1]!.attempt.edit).toEqual({
      text: '猫在跳舞',
      aspectRatio: '9:16',
      duration: 6,
      model: 'seedance-2.5',
      sendAccount: 'api',
      styleIds: [],
    });
  });

  it('★ 视频 API 通道报文逐字对后端契约（providerId / params / nodeId / refSources / attempt / prompt 含风格前缀）', async () => {
    const { site } = makeSite([{ ok: true }]);
    const { api, calls } = makeApi([{ ok: true }]);
    await generateVideo(makeDeps(site, api), {
      accounts: [],
      text: '猫在跳舞',
      rawText: '@[m_1|小猫]在跳舞',
      channel: 'api',
      providerId: 'kl',
      providerName: '可灵',
      ratio: '9:16',
      duration: 6,
      model: 'seedance-2.5',
      styleIds: ['s1'],
      sourceNodeId: 'gv_1',
      images: ['data:image/png;base64,AAA'],
    });
    expect(calls[0]).toEqual({
      providerId: 'kl',
      kind: 'video',
      // 源 `Z3_1.jsx:803`：`${前缀}，${正文}`（前缀自带尾 `，` ⇒ 这里是**双逗号**，逐字保留）
      prompt: '水墨风，，猫在跳舞',
      params: { ratio: '9:16', duration: 6, resolution: '1080p', watermark: 'off' },
      nodeId: 'gv_1',
      refSources: ['data:image/png;base64,AAA'],
      // ★ TD-03-6：单发也带 attempt（原 `Z3_1.jsx:810-828`）
      attempt: {
        id: 'a-test-1',
        at: 1_700_000_000_000,
        accountId: null,
        accountName: 'API · 可灵',
        params: { ratio: '9:16', duration: 6, styleId: 's1' },
        prompt: '水墨风，，猫在跳舞',
        // ⚠️ `edit.text` 是**原始正文**（源 `N.current`）—— 版本切换要靠它还原节点正文
        edit: {
          text: '@[m_1|小猫]在跳舞',
          aspectRatio: '9:16',
          duration: 6,
          model: 'seedance-2.5',
          sendAccount: 'api',
          styleIds: ['s1'],
        },
        conversationId: null,
        messageId: null,
        vid: null,
        resourceId: null,
        status: 'pending',
        note: 'API 通道 · 可灵',
      },
    });
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
