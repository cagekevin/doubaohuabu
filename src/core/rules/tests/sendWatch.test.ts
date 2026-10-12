/**
 * `sendWatch` 纯判据单测（原 `_Component43.jsx` 的 `watchSendReply` 判断段）
 *
 * 断言红线：**实现一变必红** —— 逐条对齐源版的分支与优先级（尤其"取语气最高"与"跳过无增量"）。
 */

import { describe, expect, it } from 'vitest';
import {
  QUOTA_EXHAUSTED_CODE,
  countdownOf,
  formatCountdown,
  isSendEffective,
  pickReplyNotice,
  quotaExhaustedNotice,
  quotaLowNotice,
  quotaLowText,
  reduceWatchRound,
  seedWatchState,
  type WatchReading,
  type WatchState,
} from '../sendWatch';
import {
  QUOTA_EXHAUSTED_FALLBACK_TEXT,
  QUOTA_LOW_FALLBACK_TEXT,
  REPLY_NOTICE_RULES,
} from '@/constants/sendWatch';
import type { QuotaUsageReading } from '@/core/ports/site.port';

const NO_SEEN: ReadonlySet<string> = new Set<string>();

const quotaReading = (over: Partial<QuotaUsageReading> = {}): QuotaUsageReading => ({
  lowCount: 1,
  consume: null,
  remain: null,
  reason: '',
  sample: '',
  ...over,
});

describe('pickReplyNotice（原 `ye` 2585-2607）', () => {
  it('没有增量 ⇒ `null`（源 `counts[code] <= lt[code]`）', () => {
    expect(pickReplyNotice({ infringe: 1 }, { infringe: 'x' }, { infringe: 1 }, NO_SEEN)).toBeNull();
    expect(pickReplyNotice({ infringe: 1 }, {}, {}, NO_SEEN)).not.toBeNull(); // 基线缺 ⇒ 视为 0
  });

  it('★ 取**语气最高**的一条（`error` > `warn` > `info`），与遍历顺序无关', () => {
    const counts = { 'quota-not-deducted': 1, 'change-topic': 1, infringe: 1 };
    const samples = { 'quota-not-deducted': 'A', 'change-topic': 'B', infringe: 'C' };
    const picked = pickReplyNotice(counts, samples, {}, NO_SEEN);
    expect(picked).toMatchObject({ code: 'infringe', level: 'error', title: '疑似包含侵权', text: 'C' });
  });

  it('同级**先遍历到的先得**（源是 `>` 不是 `>=`）', () => {
    const counts = { infringe: 1, 'cannot-return': 1 };
    const samples = { infringe: 'first', 'cannot-return': 'second' };
    expect(pickReplyNotice(counts, samples, {}, NO_SEEN)?.code).toBe('infringe');
  });

  it('★ 跳过 `quota-exhausted`（它走专用分支）', () => {
    expect(pickReplyNotice({ [QUOTA_EXHAUSTED_CODE]: 3 }, { [QUOTA_EXHAUSTED_CODE]: 'x' }, {}, NO_SEEN)).toBeNull();
  });

  it('★ 跳过**已通知过**的 code（源 `G.has(Ye)`）', () => {
    const seen = new Set(['infringe']);
    expect(pickReplyNotice({ infringe: 1 }, { infringe: 'x' }, {}, seen)).toBeNull();
  });

  it('表里没有的 code ⇒ 忽略（不造规则）', () => {
    expect(pickReplyNotice({ unknownCode: 9 }, { unknownCode: 'x' }, {}, NO_SEEN)).toBeNull();
  });

  it('`text` = `sample.trim()`；sample 空 ⇒ 回落 `title`', () => {
    expect(pickReplyNotice({ 'change-topic': 1 }, { 'change-topic': '  换个主题  ' }, {}, NO_SEEN)?.text).toBe(
      '换个主题',
    );
    expect(pickReplyNotice({ 'change-topic': 1 }, {}, {}, NO_SEEN)?.text).toBe('建议换个主题');
  });

  it('★ 不写 `accountId`（源 `ye` 那 4 个调用点都没传 —— 形状里它是可选的）', () => {
    const picked = pickReplyNotice({ 'change-topic': 1 }, { 'change-topic': 'x' }, {}, NO_SEEN);
    expect(picked).not.toBeNull();
    expect('accountId' in (picked as object)).toBe(false);
  });
});

describe('quotaExhaustedNotice（原 `ye` 2569-2577）', () => {
  it('`level`/`title` **从规则表取**（SSOT，不在调用处写死第二份）', () => {
    const rule = REPLY_NOTICE_RULES.find((r) => r.code === QUOTA_EXHAUSTED_CODE);
    expect(rule).toBeDefined();
    expect(quotaExhaustedNotice('今日视频生成免费次数用完了')).toMatchObject({
      level: rule?.level,
      code: QUOTA_EXHAUSTED_CODE,
      title: rule?.title,
    });
  });

  it('sample 缺 ⇒ 兜底文案（原 2575/2577 的 `||`）', () => {
    expect(quotaExhaustedNotice(undefined)?.text).toBe(QUOTA_EXHAUSTED_FALLBACK_TEXT);
    expect(quotaExhaustedNotice('')?.text).toBe(QUOTA_EXHAUSTED_FALLBACK_TEXT);
    expect(quotaExhaustedNotice('原文')?.text).toBe('原文');
  });
});

describe('quotaLowNotice / quotaLowText（原 `Ne` 2621-2634）', () => {
  it('`consume` 型 ⇒ 带消耗值与阈值', () => {
    const t = quotaLowText(quotaReading({ reason: 'consume', consume: 25 }), 20, 10);
    expect(t).toBe('本次创作消耗了 25 额度（≥ 阈值 20），额度已所剩不多。');
  });

  it('`remain` 型 ⇒ 带剩余值与阈值', () => {
    const t = quotaLowText(quotaReading({ reason: 'remain', remain: 8 }), 20, 10);
    expect(t).toBe('剩余额度仅 8（≤ 阈值 10），额度不足。');
  });

  it('`explicit` 型 ⇒ 回显命中原文', () => {
    const t = quotaLowText(quotaReading({ reason: 'explicit', sample: '额度不足' }), 20, 10);
    expect(t).toBe('检测到「额度不足」，本次创作额度不足。');
  });

  it('其余 ⇒ 初值兜底（原 2621）', () => {
    expect(quotaLowText(quotaReading(), 20, 10)).toBe(QUOTA_LOW_FALLBACK_TEXT);
  });

  it('通知恒为 `warn` + 固定 code/title（原 2629-2633）', () => {
    expect(quotaLowNotice(quotaReading({ reason: 'consume', consume: 30 }), 20, 10)).toMatchObject({
      level: 'warn',
      code: 'quota-low',
      title: '额度不足',
    });
  });
});

describe('isSendEffective（原 2669 的 `W.count > Ge`）', () => {
  it('★ 用**增量**：等于基线不算生效（残留回复不误判）', () => {
    expect(isSendEffective({ count: 2, text: '' }, 2)).toBe(false);
    expect(isSendEffective({ count: 3, text: '' }, 2)).toBe(true);
    expect(isSendEffective({ count: 0, text: '' }, 0)).toBe(false);
  });
});

describe('countdownOf（原 `CL.jsx:63-64`）', () => {
  it('★ 没有记录 ⇒ `{0, ended:false}`（源 `p` 要求 `c` 存在 —— 空记录**不算**已结束）', () => {
    expect(countdownOf(null, 1000)).toEqual({ remainingMs: 0, ended: false });
    expect(countdownOf(undefined, 1000)).toEqual({ remainingMs: 0, ended: false });
  });

  it('未到点 ⇒ 剩余 = `detectedAt + seconds*1000 - now`', () => {
    expect(countdownOf({ detectedAt: 1000, seconds: 10 }, 4000)).toEqual({
      remainingMs: 7000,
      ended: false,
    });
  });

  it('★ 到点 / 过点 ⇒ 钳到 0 且 `ended:true`', () => {
    expect(countdownOf({ detectedAt: 1000, seconds: 10 }, 11000)).toEqual({ remainingMs: 0, ended: true });
    expect(countdownOf({ detectedAt: 1000, seconds: 10 }, 99000)).toEqual({ remainingMs: 0, ended: true });
  });
});

describe('formatCountdown（原 `NL` `shared.js:40141`）', () => {
  it('★ 秒数**向上取整**（源 `Math.ceil(ms/1000)`）—— 还剩 1ms 也显示 `00:01`', () => {
    expect(formatCountdown(1)).toBe('00:01');
    expect(formatCountdown(500)).toBe('00:01');
    expect(formatCountdown(1000)).toBe('00:01');
    expect(formatCountdown(1001)).toBe('00:02');
  });

  it('不足 1 小时 ⇒ `mm:ss`（分秒都补零两位）', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(59_000)).toBe('00:59');
    expect(formatCountdown(60_000)).toBe('01:00');
    expect(formatCountdown(3_599_000)).toBe('59:59');
  });

  it('★ ≥ 1 小时 ⇒ `h:mm:ss`（小时**不补零**，分秒补零）', () => {
    expect(formatCountdown(3_600_000)).toBe('1:00:00');
    expect(formatCountdown(3_661_000)).toBe('1:01:01');
    expect(formatCountdown(36_000_000)).toBe('10:00:00');
  });

  it('负数 ⇒ 钳到 0（源 `Math.max(0, …)`）', () => {
    expect(formatCountdown(-1)).toBe('00:00');
    expect(formatCountdown(-100_000)).toBe('00:00');
  });
});

describe('seedWatchState（原 2366-2372）', () => {
  it('★ `ackBaseline` 取「站点读数」与「上一轮留下的计数」的**较大者**', () => {
    expect(seedWatchState({ ack: { count: 3, text: '' } }, 7).ackBaseline).toBe(7);
    expect(seedWatchState({ ack: { count: 9, text: '' } }, 2).ackBaseline).toBe(9);
    expect(seedWatchState({}, 4).ackBaseline).toBe(4);
  });

  it('通知 / 额度基线取自第一轮读数；闩都是「未用」', () => {
    const s = seedWatchState({
      notices: { counts: { infringe: 2 }, samples: {} },
      quota: quotaReading({ lowCount: 5 }),
    });
    expect(s.noticeBaseline).toEqual({ infringe: 2 });
    expect(s.quotaBaseline).toBe(5);
    expect(s.seen).toEqual([]);
    expect(s.waitTimeDone).toBe(false);
    expect(s.quotaDone).toBe(false);
  });
});

describe('reduceWatchRound（原 2650-2672 的判断段）', () => {
  const run = (state: WatchState, reading: WatchReading) => reduceWatchRound(state, reading, 20, 10);
  const base = (): WatchState => seedWatchState({});

  it('① 等待时长：**只写一次**（源 `Re` 闩）', () => {
    const first = run(base(), { waitTime: { hit: true, minutes: 5, seconds: 300, text: '预计等待 5 分钟' } });
    expect(first.effects.waitTime).toMatchObject({ hit: true, seconds: 300 });
    expect(first.state.waitTimeDone).toBe(true);
    // 第二轮即使又读到，也不再写（源 `$` 一进来就 `if (Re) return false`）
    const second = run(first.state, { waitTime: { hit: true, minutes: 9, seconds: 540, text: 'x' } });
    expect(second.effects.waitTime).toBeNull();
  });

  it('`hit:false` 不写、也不置闩（下一轮还能读到）', () => {
    const r = run(base(), { waitTime: { hit: false } });
    expect(r.effects.waitTime).toBeNull();
    expect(r.state.waitTimeDone).toBe(false);
  });

  it('③ 额度：`lowCount` 必须**超过基线**才写（源 `W.lowCount > dt`），写完置闩', () => {
    const s = seedWatchState({ quota: quotaReading({ lowCount: 3 }) });
    expect(run(s, { quota: quotaReading({ lowCount: 3, reason: 'consume', consume: 25 }) }).effects.notices).toEqual([]);

    const hit = run(s, { quota: quotaReading({ lowCount: 4, reason: 'consume', consume: 25 }) });
    expect(hit.effects.notices).toHaveLength(1);
    expect(hit.effects.notices[0]).toMatchObject({ code: 'quota-low', level: 'warn' });
    expect(hit.state.quotaDone).toBe(true);
    // 置闩后不再写
    expect(run(hit.state, { quota: quotaReading({ lowCount: 9, reason: 'consume', consume: 30 }) }).effects.notices).toEqual([]);
  });

  it('④a `quota-exhausted` 走专用分支（增量 ⇒ 写，且进 `seen`）', () => {
    const s = seedWatchState({ notices: { counts: { 'quota-exhausted': 1 }, samples: {} } });
    const r = run(s, {
      notices: { counts: { 'quota-exhausted': 2 }, samples: { 'quota-exhausted': '今日视频生成免费次数用完了' } },
    });
    expect(r.effects.notices[0]).toMatchObject({ code: 'quota-exhausted', text: '今日视频生成免费次数用完了' });
    expect(r.state.seen).toContain('quota-exhausted');
  });

  it('④b 其余规则走「语气最高」，且进 `seen` 后不再重复通知', () => {
    const s = seedWatchState({ notices: { counts: {}, samples: {} } });
    const r = run(s, {
      notices: {
        counts: { 'change-topic': 1, infringe: 1 },
        samples: { 'change-topic': 'B', infringe: 'C' },
      },
    });
    expect(r.effects.notices[0]).toMatchObject({ code: 'infringe', level: 'error' });
    expect(r.state.seen).toContain('infringe');
    // 同一读数再来一轮 ⇒ `seen` 挡住 ⇒ 不再通知
    expect(run(r.state, { notices: { counts: { infringe: 1 }, samples: { infringe: 'C' } } }).effects.notices).toEqual([]);
  });

  it('① 透传 `ackCount`（供调用方记 `Wd` / 判「已生效」）', () => {
    expect(run(base(), { ack: { count: 5, text: '' } }).effects.ackCount).toBe(5);
    expect(run(base(), {}).effects.ackCount).toBeNull();
  });

  it('★ 额度预警命中 ⇒ 当轮返回换号请求（源 `Ne` 尾部 `return await be(fe, \'额度不足\')`）', () => {
    const s = seedWatchState({});
    const r = run(s, { quota: quotaReading({ lowCount: 99, reason: 'explicit', sample: '额度不足' }) });
    expect(r.switchRequest).toMatchObject({ action: '额度不足' });
    // `reason` = 同一份额度文案（与写进通知的 `text` 同源）
    expect(r.switchRequest?.reason).toBe(r.effects.notices[0]?.text);
  });

  it('★「今日免费次数用尽」命中 ⇒ 换号请求（源 `ye` 尾部 `be(text, \'额度用尽\')`）', () => {
    const s = seedWatchState({});
    const r = run(s, { notices: { counts: { 'quota-exhausted': 1 }, samples: {} } });
    expect(r.switchRequest).toMatchObject({ action: '额度用尽' });
    expect(r.switchRequest?.reason).toBe(QUOTA_EXHAUSTED_FALLBACK_TEXT);
  });

  it('★ 其余回复通知**不换号**（源 `ye` 末尾 `return false`）', () => {
    const s = seedWatchState({});
    const r = run(s, { notices: { counts: { infringe: 1 }, samples: { infringe: 'C' } } });
    expect(r.effects.notices).toHaveLength(1);
    expect(r.switchRequest).toBeNull();
  });

  it('★ 无命中 ⇒ `switchRequest` 为 `null`（循环继续）', () => {
    expect(run(seedWatchState({}), {}).switchRequest).toBeNull();
  });

  it('★ 不可变：不改传入的 `state`', () => {
    const s = seedWatchState({});
    run(s, { ack: { count: 3, text: '' }, notices: { counts: { infringe: 1 }, samples: {} } });
    expect(s.ackBaseline).toBe(0);
    expect(s.seen).toEqual([]);
  });
});


