/**
 * 发送防重单测 —— 回源 `AS`(41866) / `$S`(41876) / `N3`(41835)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { contentFingerprint, shouldSkipResend } from '../sendGuard';
import { SEND_DEDUP_MS } from '@/constants';

describe('contentFingerprint（原 `AS` 41866）', () => {
  it('先剥 HTML、再去全部空白、最后截 200 字', () => {
    expect(contentFingerprint('<p>你好 &amp; 世界</p>')).toBe('你好&世界');
    expect(contentFingerprint('a b\nc')).toBe('abc');
  });

  it('★ 截断到 200 字（超长正文只有前 200 字参与比较）', () => {
    const long = 'x'.repeat(500);
    expect(contentFingerprint(long)).toHaveLength(200);
  });

  it('空值 → 空串', () => {
    expect(contentFingerprint('')).toBe('');
    expect(contentFingerprint(null)).toBe('');
    expect(contentFingerprint(undefined)).toBe('');
  });
});

describe('shouldSkipResend（原 `$S` 判定半）', () => {
  const last = { fp: 'abc', at: 1_000_000 };

  it('指纹相同且在窗口内 → 跳过', () => {
    expect(shouldSkipResend('abc', last, last.at + SEND_DEDUP_MS - 1)).toBe(true);
  });

  it('★ 边界：恰好等于窗口（90000ms）→ **不**跳过（源码是 `< N3`）', () => {
    expect(shouldSkipResend('abc', last, last.at + SEND_DEDUP_MS)).toBe(false);
  });

  it('指纹不同 → 不跳过', () => {
    expect(shouldSkipResend('xyz', last, last.at + 1)).toBe(false);
  });

  it('force → 不跳过（原 `!force` 前置条件）', () => {
    expect(shouldSkipResend('abc', last, last.at + 1, { force: true })).toBe(false);
  });

  it('无历史 / 空指纹 → 不跳过', () => {
    expect(shouldSkipResend('abc', null, 1)).toBe(false);
    expect(shouldSkipResend('abc', undefined, 1)).toBe(false);
    expect(shouldSkipResend('', last, last.at + 1)).toBe(false);
  });

  it('可注入窗口（便于测试与将来调参）', () => {
    expect(shouldSkipResend('abc', last, last.at + 500, { windowMs: 100 })).toBe(false);
  });
});
