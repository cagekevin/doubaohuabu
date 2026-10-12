/**
 * 节点状态五族的「该不该写」守卫单测（`TD-16-93` 数据层）
 *
 * ★ 判据：这三个守卫是「生产者有内容才写、否则删」的判定 —— 实现一变必红（可被证伪）。
 */

import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  noticeToWrite,
  switchToWrite,
  timerBand,
  waitTimeToWrite,
} from '../nodeStatus';

describe('formatElapsed（原 `LL`，`shared.js:40736`）', () => {
  it('不足 1 小时 ⇒ `mm:ss`', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('★ 小时位**补零** —— 与 `formatCountdown`（原 `NL`）的 `1:02:03` 不同', () => {
    expect(formatElapsed(3_723_000)).toBe('01:02:03');
  });

  it('★ 用 **floor**（不是 `formatCountdown` 的 ceil）：不足 1s 的零头截掉', () => {
    expect(formatElapsed(999)).toBe('00:00');
    expect(formatElapsed(1_999)).toBe('00:01');
  });

  it('负值 / 非有限 ⇒ 归 0（源 `e < 0 || !isFinite(e)`）', () => {
    expect(formatElapsed(-1)).toBe('00:00');
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe('00:00');
    expect(formatElapsed(Number.NaN)).toBe('00:00');
  });
});

describe('timerBand（原 `OL.jsx:415` 的两档）', () => {
  it('★ 边界是 `>=`：5 分钟整进黄档、不到则是 normal', () => {
    expect(timerBand(299_999)).toBe('normal');
    expect(timerBand(300_000)).toBe('yellow');
  });

  it('★ 边界是 `>=`：10 分钟整进红档（且**先判红**）', () => {
    expect(timerBand(599_999)).toBe('yellow');
    expect(timerBand(600_000)).toBe('red');
  });

  it('起点 ⇒ normal', () => {
    expect(timerBand(0)).toBe('normal');
  });
});

describe('nodeStatus 写盘守卫', () => {
  it('noticeToWrite：有 text ⇒ 带 at 的完整通知', () => {
    const r = noticeToWrite(
      { level: 'warn', code: 'quota-exhausted', accountId: 'a1', title: '额度用尽', text: '今日免费次数用尽' },
      1000,
    );
    expect(r).toEqual({
      level: 'warn',
      code: 'quota-exhausted',
      accountId: 'a1',
      title: '额度用尽',
      text: '今日免费次数用尽',
      at: 1000,
    });
  });

  it('noticeToWrite：无 text ⇒ null（= 删除）', () => {
    expect(
      noticeToWrite({ level: 'warn', code: 'x', accountId: null, title: '', text: '' }, 1000),
    ).toBeNull();
  });

  it('waitTimeToWrite：seconds > 0 ⇒ 完整倒计时；detectedAt 缺省 ⇒ 回落 at', () => {
    expect(waitTimeToWrite({ minutes: 3, seconds: 180, text: '预计等待 3 分钟' }, 1000)).toEqual({
      minutes: 3,
      seconds: 180,
      detectedAt: 1000,
      text: '预计等待 3 分钟',
    });
  });

  it('waitTimeToWrite：seconds = 0 ⇒ null（= 删除）', () => {
    expect(waitTimeToWrite({ minutes: 0, seconds: 0, text: '' }, 1000)).toBeNull();
  });

  it('switchToWrite：有 state ⇒ 带 at 的完整状态', () => {
    const r = switchToWrite({ state: 'done', fromName: '账号A', toName: '账号B', reason: '额度用尽' }, 2000);
    expect(r).toEqual({ state: 'done', fromName: '账号A', toName: '账号B', reason: '额度用尽', at: 2000 });
  });

  it('switchToWrite：无 state ⇒ null（= 删除）', () => {
    expect(switchToWrite({ state: '' as never, fromName: 'A', reason: '' }, 2000)).toBeNull();
  });
});
