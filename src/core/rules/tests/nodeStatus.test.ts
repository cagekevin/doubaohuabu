/**
 * 节点状态五族的「该不该写」守卫单测（`TD-16-93` 数据层）
 *
 * ★ 判据：这三个守卫是「生产者有内容才写、否则删」的判定 —— 实现一变必红（可被证伪）。
 */

import { describe, expect, it } from 'vitest';
import { noticeToWrite, switchToWrite, waitTimeToWrite } from '../nodeStatus';

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
