/**
 * 失败分类单测 —— 对应 docs/08-验证用例.md **W9**
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { classifyFailure, decideFailAction, CLASSIFY_TABLE } from '../failure';
import { FAILURE_MAX_RETRY, SEND_MAX_RETRIES } from '@/constants';
import { SEND_FAIL_KINDS, type SendFailKind } from '@/constants/failure';

describe('classifyFailure（原 `_S`）', () => {
  /** 表驱动：每个 kind 一条真实文案 */
  const cases: ReadonlyArray<readonly [string, SendFailKind]> = [
    ['该内容涉及肖像权，无法生成', 'risk-refuse'],
    ['请先阅读并签署安全承诺书', 'safety-promise'],
    ['请完成滑动验证后重试', 'human-verification'],
    ['请先确认后再继续', 'confirm-required'],
    ['发送卡住，未响应', 'send-stuck'],
    ['文本框内容为空', 'empty-text'],
    ['无可用账号', 'no-account'],
    ['今日生成次数已用完', 'quota'],
    ['账号已失效，请重新登录', 'account-invalid'],
    ['发送通道忙碌，请稍后', 'busy'],
    ['请求过于频繁，请稍后再试', 'rate-limit'],
    ['页面超时', 'page-timeout'],
    ['页面异常，脚本执行失败', 'page-error'],
  ];

  it.each(cases)('「%s」→ %s', (text, expected) => {
    expect(classifyFailure(text).kind).toBe(expected);
  });

  it('空文本 → 兜底 unknown', () => {
    expect(classifyFailure('').kind).toBe('unknown');
    expect(classifyFailure('   ').kind).toBe('unknown');
    expect(classifyFailure(null).kind).toBe('unknown');
  });

  it('未命中 → unknown 且 retryable=true（原 `z0`）', () => {
    const r = classifyFailure('一段完全无关的文本');
    expect(r.kind).toBe('unknown');
    expect(r.retryable).toBe(true);
    expect(r.switchAccount).toBe(false);
  });

  it('★ 安全优先：safety-promise 必须 retryable=false（防封号）', () => {
    expect(classifyFailure('请签署安全承诺书').retryable).toBe(false);
  });

  it('★ 换号：quota / account-invalid → switchAccount=true；busy → false（源码如此）', () => {
    const by = (k: SendFailKind) => CLASSIFY_TABLE.find((r) => r.kind === k);
    expect(by('quota')!.switchAccount).toBe(true);
    expect(by('account-invalid')!.switchAccount).toBe(true);
    // ⚠️ 源码 `p3` 里 busy 的 switchAccount 是 false —— 忙碌只重试，不换号
    expect(by('busy')!.switchAccount).toBe(false);
  });

  it('★ `p3` 表的 retryable 必须为 true（否则 g3 的换号分支不可达）', () => {
    const by = (k: SendFailKind) => CLASSIFY_TABLE.find((r) => r.kind === k);
    for (const k of ['quota', 'account-invalid', 'busy'] as const) {
      expect(by(k)!.retryable, `${k}.retryable 应为 true`).toBe(true);
    }
  });

  it('★ `f3` 表（7 项）必须 retryable=false 且 switchAccount=false', () => {
    const giveUp: SendFailKind[] = [
      'risk-refuse',
      'safety-promise',
      'human-verification',
      'confirm-required',
      'send-stuck',
      'empty-text',
      'no-account',
    ];
    for (const k of giveUp) {
      const rule = CLASSIFY_TABLE.find((r) => r.kind === k);
      expect(rule, `表里应有 ${k}`).toBeDefined();
      expect(rule!.retryable, `${k}.retryable`).toBe(false);
      expect(rule!.switchAccount, `${k}.switchAccount`).toBe(false);
    }
  });

  it('★ 可重试集合 = h3(3) + p3(3) = 6 项', () => {
    const retryable = CLASSIFY_TABLE.filter((r) => r.retryable)
      .map((r) => r.kind)
      .sort();
    expect(retryable).toEqual(['account-invalid', 'busy', 'page-error', 'page-timeout', 'quota', 'rate-limit']);
  });

  it('★ 分类表顺序 = f3 → p3 → h3（命中即停，安全优先）', () => {
    expect(CLASSIFY_TABLE.map((r) => r.kind)).toEqual([
      'risk-refuse',
      'safety-promise',
      'human-verification',
      'confirm-required',
      'send-stuck',
      'empty-text',
      'no-account',
      'quota',
      'account-invalid',
      'busy',
      'rate-limit',
      'page-timeout',
      'page-error',
    ]);
  });

  it('每个 kind 都有 label，且覆盖 SEND_FAIL_KINDS 全集', () => {
    for (const k of SEND_FAIL_KINDS) {
      expect(classifyFailure('').label.length, `${k} 应有兜底 label`).toBeGreaterThan(0);
    }
    // 表里出现的 kind 必须都在 SEND_FAIL_KINDS 内
    for (const r of CLASSIFY_TABLE) expect(SEND_FAIL_KINDS).toContain(r.kind);
  });
});

describe('decideFailAction（原 `g3`）', () => {
  it('不可重试 → give-up', () => {
    expect(decideFailAction('请完成滑动验证', 1).action).toBe('give-up');
  });

  it('可换号 → retry-switch（quota / account-invalid）', () => {
    expect(decideFailAction('账号已失效', 1).action).toBe('retry-switch');
    expect(decideFailAction('今日生成次数已用完', 1).action).toBe('retry-switch');
  });

  it('可重试但**不换号** → retry（busy / rate-limit / page-*）', () => {
    expect(decideFailAction('页面超时', 1).action).toBe('retry');
    expect(decideFailAction('发送通道忙碌', 1).action).toBe('retry');
    expect(decideFailAction('请求过于频繁', 1).action).toBe('retry');
  });

  it('★ maxRetry 默认 2（不是发送层的 1）', () => {
    expect(FAILURE_MAX_RETRY).toBe(2);
    expect(SEND_MAX_RETRIES).toBe(1);
    expect(decideFailAction('页面超时', 2).action).toBe('give-up');
    expect(decideFailAction('页面超时', 1).action).toBe('retry');
  });

  it('attempt 非法值按 1 处理', () => {
    expect(decideFailAction('页面超时', 0).action).toBe('retry');
  });

  it('label 与分类结果一致（不覆盖原始 message）', () => {
    const d = decideFailAction('今日生成次数已用完', 1);
    expect(d.label).toBe(d.info.label);
    expect(d.info.kind).toBe('quota');
  });
});
