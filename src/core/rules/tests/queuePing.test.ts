/**
 * 「排队追问」纯逻辑单测 —— 回源 `GR`(shared.js:36631-36659) 与 `_Component43.jsx:2255-2262` 的 `st`
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { queuePingText, shouldPingQueueProgress } from '../queuePing';
import { QUEUE_PING_FIRST_MS, QUEUE_PING_INTERVAL_MS, QUEUE_PING_MAX } from '@/constants';

const T0 = 1_700_000_000_000;

describe('shouldPingQueueProgress（原 `GR`）', () => {
  it('① 次数用尽（默认上限 1）⇒ 不问', () => {
    expect(QUEUE_PING_MAX).toBe(1); // 源 `Cp = 1`，这条钉住它
    expect(shouldPingQueueProgress({ pings: 1, ackedAt: T0, now: T0 + 999_999 })).toBe(false);
  });

  it('① `finished` / `generating` ⇒ 不问（已经有答案了）', () => {
    expect(shouldPingQueueProgress({ pings: 0, ackedAt: T0, now: T0 + 999_999, finished: true })).toBe(false);
    expect(shouldPingQueueProgress({ pings: 0, ackedAt: T0, now: T0 + 999_999, generating: true })).toBe(false);
  });

  it('② `ackedAt` 为 0（还没发出去）⇒ 不问', () => {
    expect(shouldPingQueueProgress({ pings: 0, ackedAt: 0, now: T0 })).toBe(false);
    expect(shouldPingQueueProgress({ pings: 0, now: T0 })).toBe(false);
  });

  it('③ 首次：距 `ackedAt` 满 60s 才问（边界两侧）', () => {
    expect(shouldPingQueueProgress({ pings: 0, ackedAt: T0, now: T0 + QUEUE_PING_FIRST_MS })).toBe(true);
    expect(shouldPingQueueProgress({ pings: 0, ackedAt: T0, now: T0 + QUEUE_PING_FIRST_MS - 1 })).toBe(false);
  });

  it('④ 之后：距 `lastPingAt` 满 300s 才问（边界两侧）', () => {
    const base = { pings: 1, ackedAt: T0, lastPingAt: T0 + 60_000, maxPings: 3 };
    expect(shouldPingQueueProgress({ ...base, now: base.lastPingAt + QUEUE_PING_INTERVAL_MS })).toBe(true);
    expect(shouldPingQueueProgress({ ...base, now: base.lastPingAt + QUEUE_PING_INTERVAL_MS - 1 })).toBe(false);
  });

  it('④ `pings > 0` 但 `lastPingAt` 为 0 ⇒ 不问（源 `else return false`）', () => {
    expect(shouldPingQueueProgress({ pings: 1, ackedAt: T0, now: T0 + 999_999, maxPings: 3 })).toBe(false);
  });

  it('★ 默认 `maxPings` 走 `QUEUE_PING_MAX`：0 次可问、1 次不可问', () => {
    expect(shouldPingQueueProgress({ pings: 0, ackedAt: T0, now: T0 + 60_000 })).toBe(true);
    expect(shouldPingQueueProgress({ pings: 1, ackedAt: T0, lastPingAt: T0 + 60_000, now: T0 + 600_000 })).toBe(false);
  });

  it('★ 判序：`generating` 优先于"时间到了"（源先判 36640 再判时间）', () => {
    expect(
      shouldPingQueueProgress({ pings: 0, ackedAt: T0, now: T0 + 999_999, generating: true }),
    ).toBe(false);
  });
});

describe('queuePingText（原 `st` 映射）', () => {
  it('四档固定文案', () => {
    expect(queuePingText('none')).toContain('当前没有正在生成的视频');
    expect(queuePingText('offer')).toContain('是否要现在开始生成');
    expect(queuePingText('busy')).toContain('任务正在排队');
    expect(queuePingText('no-reply')).toContain('暂未收到回复');
  });

  it('★ 其余（含 `other` / 未知 kind）⇒ `助手回复：` + 原文', () => {
    expect(queuePingText('other', '正在为你排队')).toBe('助手回复：正在为你排队');
    expect(queuePingText('某种新档', 'x')).toBe('助手回复：x');
  });

  it('★ 原文截断到 80 字符（源 `slice(0, 80)`）', () => {
    const long = '一'.repeat(200);
    const out = queuePingText('other', long);
    expect(out).toBe(`助手回复：${'一'.repeat(80)}`);
  });

  it('原文缺失 ⇒ 空串（不写 `undefined`）', () => {
    expect(queuePingText('other')).toBe('助手回复：');
    expect(queuePingText('other', null)).toBe('助手回复：');
  });
});
