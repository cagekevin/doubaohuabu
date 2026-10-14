/**
 * `isApiJobEvent` 单测 —— 推送边界收窄的唯一入口
 *
 * 依据：`TD-04-12`（推送载荷不可信；与 `isLicenseStatusKind` 同法，形状与谓词同源）
 * 断言红线：**形状漂移必须被拒** —— 否则漂移会静默变成 `undefined`（这正是那笔债的症状）。
 */

import { describe, expect, it } from 'vitest';
import { isApiJobEvent } from '../gen';

/** 最小合法载荷（只含谓词判定的四个字段） */
const OK = { jobId: 'j1', kind: 'video', status: 'done', results: [] };

describe('isApiJobEvent（推送边界收窄）', () => {
  it('完整载荷 ⇒ 通过（多余字段不影响）', () => {
    expect(isApiJobEvent({ ...OK, providerName: '火山方舟' })).toBe(true);
    expect(isApiJobEvent({ ...OK, kind: 'image' })).toBe(true);
  });

  it('非对象 ⇒ 拒（含数组 —— 它 `typeof` 也是 object）', () => {
    for (const v of [null, undefined, 'x', 42, [], true]) {
      expect(isApiJobEvent(v)).toBe(false);
    }
  });

  it('★ 缺任一必需字段 / 类型不符 ⇒ 拒', () => {
    expect(isApiJobEvent({ ...OK, jobId: undefined })).toBe(false);
    expect(isApiJobEvent({ ...OK, jobId: '' })).toBe(true); // 空串仍是 string（源不保证非空）
    expect(isApiJobEvent({ ...OK, kind: 'audio' })).toBe(false);
    expect(isApiJobEvent({ ...OK, status: 1 })).toBe(false);
    expect(isApiJobEvent({ ...OK, results: null })).toBe(false);
  });
});
