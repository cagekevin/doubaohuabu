/**
 * 会话准备用例单测（原 `$P.jsx:49-90` / `_Component25` / `shared.js:30218-30361` / `OP.jsx:100`）
 *
 * 重点：
 *   ① ★ **载荷是账号对象**（含 `partition`）—— 这正是上一轮抓到的签名 bug，
 *      断言"传了 partition"才能防它复发
 *   ② 三种模式各自的端口方法不被走错
 *   ③ 代理落地**逐条 set + 失败记账不中断**（源版是 `.catch(() => {})` 全吞）
 *   ④ 空分区**不清会话**（源版 `if (s.partition)` 守卫）
 */

import { describe, expect, it } from 'vitest';
import {
  applyProxyAssignments,
  diagnoseSession,
  prepareSession,
  releaseSession,
  type PrepareSessionDeps,
} from '../prepareSession';
import { ok, err } from '@/core/model/result';
import { SESSION_TEXT } from '@/constants/text';

function makeDeps(over: Partial<PrepareSessionDeps['account']> = {}) {
  const calls: Array<[string, unknown]> = [];
  const account: PrepareSessionDeps['account'] = {
    ensureFingerprint: async (p) => {
      calls.push(['ensureFingerprint', p]);
      return ok({ preloadUrl: 'fp://preload.js' });
    },
    ensurePlainSession: async (p) => {
      calls.push(['ensurePlainSession', p]);
      return ok({ userAgent: 'UA/1' });
    },
    ensureLovartContainer: async (p) => {
      calls.push(['ensureLovartContainer', p]);
      return ok({ userAgent: 'UA/2', preloadUrl: 'lv://preload.js' });
    },
    clearSession: async (partition) => {
      calls.push(['clearSession', partition]);
      return ok(undefined);
    },
    setProxy: async (partition, proxy) => {
      calls.push(['setProxy', `${partition}|${proxy}`]);
      return ok(undefined);
    },
    fpNetDiag: async (partition) => {
      calls.push(['fpNetDiag', partition]);
      return ok({ ok: true, note: '通畅' });
    },
    ...over,
  };
  return { deps: { account } satisfies PrepareSessionDeps, calls };
}

describe('prepareSession · fingerprint（原 $P.jsx:77-85）', () => {
  it('★ 载荷带 `{id, partition, fingerprint}`（**分区必须传对** —— 签名 bug 的回归锁）', async () => {
    const { deps, calls } = makeDeps();
    const r = await prepareSession(deps, {
      mode: 'fingerprint',
      accountId: 'acc_1',
      partition: 'persist:acc_1',
      fingerprint: { ver: 3 },
    });
    expect(calls).toEqual([
      ['ensureFingerprint', { id: 'acc_1', partition: 'persist:acc_1', fingerprint: { ver: 3 } }],
    ]);
    expect(r).toEqual(ok({ mode: 'fingerprint', preloadUrl: 'fp://preload.js', userAgent: null }));
  });

  it('没给指纹 ⇒ 载荷里**不带该键**（不是 `fingerprint: undefined`）', async () => {
    const { deps, calls } = makeDeps();
    await prepareSession(deps, { mode: 'fingerprint', accountId: 'acc_1', partition: 'persist:acc_1' });
    expect(calls[0]![1]).toEqual({ id: 'acc_1', partition: 'persist:acc_1' });
  });

  /*
   * ⚠️ 原有一条「`partition: null` 如实传（不替后端编一个）」**已删**：
   *    那锁的是「分区可以为空」这条已撤销的设计（后端现已**不猜、缺了就抛**，
   *    `main.js`）。现在入参类型就是 `string` ⇒ 该场景**不存在**。
   */

  it('后端失败 ⇒ **原样转发**（源版 `.catch(() => {})` 吞错）', async () => {
    const { deps } = makeDeps({ ensureFingerprint: async () => err('unknown', '指纹目录写失败') });
    expect(await prepareSession(deps, { mode: 'fingerprint', accountId: 'a', partition: 'persist:a' })).toEqual(
      err('unknown', '指纹目录写失败'),
    );
  });
});

describe('prepareSession · plain / lovart', () => {
  it('plain ⇒ 走 `ensurePlainSession`，userAgent 透传', async () => {
    const { deps, calls } = makeDeps();
    const r = await prepareSession(deps, { mode: 'plain', accountId: 'a', partition: 'p' });
    expect(calls).toEqual([['ensurePlainSession', { id: 'a', partition: 'p' }]]);
    expect(r).toEqual(ok({ mode: 'plain', preloadUrl: null, userAgent: 'UA/1' }));
  });

  it('★ lovart ⇒ 走 `ensureLovartContainer`，载荷带 `containerId` / `proxy`', async () => {
    const { deps, calls } = makeDeps();
    const r = await prepareSession(deps, {
      mode: 'lovart',
      accountId: 'a',
      partition: 'p',
      containerId: 'lv-1',
      proxy: 'http://1.2.3.4:8080',
    });
    expect(calls).toEqual([
      [
        'ensureLovartContainer',
        { id: 'a', partition: 'p', containerId: 'lv-1', proxy: 'http://1.2.3.4:8080' },
      ],
    ]);
    expect(r).toEqual(ok({ mode: 'lovart', preloadUrl: 'lv://preload.js', userAgent: 'UA/2' }));
  });

  it('lovart 不给 containerId / proxy ⇒ 载荷里不带这两个键', async () => {
    const { deps, calls } = makeDeps();
    await prepareSession(deps, { mode: 'lovart', accountId: 'a', partition: 'p' });
    expect(calls[0]![1]).toEqual({ id: 'a', partition: 'p' });
  });

  it('★ 三种模式**互不走错**方法', async () => {
    const { deps, calls } = makeDeps();
    await prepareSession(deps, { mode: 'fingerprint', accountId: 'a', partition: 'p' });
    await prepareSession(deps, { mode: 'plain', accountId: 'a', partition: 'p' });
    await prepareSession(deps, { mode: 'lovart', accountId: 'a', partition: 'p' });
    expect(calls.map((c) => c[0])).toEqual([
      'ensureFingerprint',
      'ensurePlainSession',
      'ensureLovartContainer',
    ]);
  });
});

describe('releaseSession（原 removeAccount 30224）', () => {
  /*
   * ⚠️ 原有一条「空 / `null` 分区 ⇒ 直接成功且不调宿主（源版 `if (s.partition)`）」**已删**：
   *    该守卫随类型收窄一起删除（分区恒有值，`releaseSession(deps, partition: string)`）。
   *    分区为空这一档不存在 ⇒ 没有可断言的行为（留着就是锁一条已撤销的设计）。
   */

  it('有分区 ⇒ 清该分区；失败原样转发', async () => {
    const { deps, calls } = makeDeps();
    await releaseSession(deps, 'persist:x');
    expect(calls).toEqual([['clearSession', 'persist:x']]);

    const failing = makeDeps({ clearSession: async () => err('unknown', '分区不存在') });
    expect(await releaseSession(failing.deps, 'persist:x')).toEqual(err('unknown', '分区不存在'));
  });
});

describe('applyProxyAssignments（原 30347-30351 的宿主半）', () => {
  const a1 = { accountId: 'a1', partition: 'p1', proxy: 'http://p1' };
  const a2 = { accountId: 'a2', partition: 'p2', proxy: 'http://p2' };

  it('逐条 set，返回成功数', async () => {
    const { deps, calls } = makeDeps();
    const r = await applyProxyAssignments(deps, [a1, a2]);
    expect(r).toEqual({ applied: 2, failures: [] });
    expect(calls).toEqual([
      ['setProxy', 'p1|http://p1'],
      ['setProxy', 'p2|http://p2'],
    ]);
  });

  it('★ 一条失败 ⇒ 记账 + **不中断**其余（源版 `.catch(() => {})` 全吞）', async () => {
    let i = 0;
    const { deps } = makeDeps({
      setProxy: async () => {
        i += 1;
        return i === 1 ? err('unknown', '代理不可用') : ok(undefined);
      },
    });
    const r = await applyProxyAssignments(deps, [a1, a2]);
    expect(r.applied).toBe(1);
    expect(r.failures).toEqual([SESSION_TEXT.proxyApplyFailed('a1', '代理不可用')]);
  });

  it('空清单 ⇒ 不调宿主', async () => {
    const { deps, calls } = makeDeps();
    expect(await applyProxyAssignments(deps, [])).toEqual({ applied: 0, failures: [] });
    expect(calls).toEqual([]);
  });
});

describe('diagnoseSession（原 OP.jsx:100）', () => {
  it('转发分区并原样带回后端结果（含失败）', async () => {
    const { deps, calls } = makeDeps();
    expect(await diagnoseSession(deps, 'persist:x')).toEqual(ok({ ok: true, note: '通畅' }));
    expect(calls).toEqual([['fpNetDiag', 'persist:x']]);

    const failing = makeDeps({ fpNetDiag: async () => err('unknown', 'no_window') });
    expect(await diagnoseSession(failing.deps, 'persist:x')).toEqual(err('unknown', 'no_window'));
  });
});
