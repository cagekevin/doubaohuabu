import { describe, expect, it } from 'vitest';
import { isDolaForceTarget } from '../dolaForce';

/** 命中闸的最小参数（连字符 id + 时长 16） */
const OK = { duration: 16, model: 'seedance-2.5' };

describe('isDolaForceTarget（原 `Mt` 的闸，`_Component43.jsx:761`）', () => {
  it('三条件全中 ⇒ true', () => {
    expect(isDolaForceTarget('dola', OK)).toBe(true);
  });

  it('★ 账号类型不是 dola ⇒ false（doubao / lovart 都不走）', () => {
    expect(isDolaForceTarget('doubao', OK)).toBe(false);
    expect(isDolaForceTarget('lovart', OK)).toBe(false);
  });

  it('★ 时长边界是 `> 15`：15 ⇒ false，16 ⇒ true', () => {
    expect(isDolaForceTarget('dola', { ...OK, duration: 15 })).toBe(false);
    expect(isDolaForceTarget('dola', { ...OK, duration: 16 })).toBe(true);
  });

  it('时长缺失 / 非数字 ⇒ false（`Number(undefined)` = NaN）', () => {
    expect(isDolaForceTarget('dola', { model: 'seedance-2.5' })).toBe(false);
    expect(isDolaForceTarget('dola', { duration: 'abc', model: 'seedance-2.5' })).toBe(false);
  });

  it('★ 时长是**字符串**也过（源用 `Number(...)`）—— 别"顺手"改成 `typeof === number`', () => {
    expect(isDolaForceTarget('dola', { duration: '16', model: 'seedance-2.5' })).toBe(true);
  });

  it('★ 模型认**连字符** id：下划线形态（报文里那个 `seedance_v2.5`）⇒ **false**', () => {
    // ⚠️ 这条锁的就是"同源不同形"：闸用 `seedance-2.5`，而 `JP` 的默认模型是 `seedance_v2.5`。
    //    若哪天有人把两处"统一"成一种写法，这条会红 —— 那正是它要提醒的。
    expect(isDolaForceTarget('dola', { duration: 16, model: 'seedance_v2.5' })).toBe(false);
  });

  it('其他模型 / 缺模型 ⇒ false', () => {
    expect(isDolaForceTarget('dola', { duration: 16, model: 'seedance-2.0' })).toBe(false);
    expect(isDolaForceTarget('dola', { duration: 16 })).toBe(false);
  });

  it('params 为 null / undefined ⇒ false（不抛）', () => {
    expect(isDolaForceTarget('dola', null)).toBe(false);
    expect(isDolaForceTarget('dola', undefined)).toBe(false);
  });
});
