/**
 * 「待归属尝试」纯层单测（原 `_Component43.jsx` 的 `sendPayload` 两段）
 *
 * 依据：`N0` `shared.js:36757-36767` · `:2883-2890`（`edit` 快照）· `:2891-2903`（成功）
 *      · `:2925-2931`（失败）· `:2907-2913` / `:2935-2941`（落点补丁）
 *
 * 断言红线：**实现一变必红** —— 逐条对齐源的「成功带 params/edit/conversationId、失败只带
 * note」「`_pendingAttempts` 按账号分槽」「两个键恒写」语义。
 */

import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_PROMPT_MAX,
  accountNameFallback,
  attemptPromptOf,
  conversationIdFromUrl,
  failedAttemptOf,
  pendingAttemptEdit,
  pendingAttemptParams,
  pendingAttemptPatch,
  sentAttemptOf,
} from '../pendingAttempt';

describe('conversationIdFromUrl（原 N0 shared.js:36757-36767）', () => {
  it('★ 从 href 里取出会话 id', () => {
    expect(conversationIdFromUrl('https://www.doubao.com/chat/abc123')).toBe('abc123');
    expect(conversationIdFromUrl('https://www.dola.com/chat/a_b-C1/other')).toBe('a_b-C1');
  });

  it('★ 不限 hostname（源是在整个 href 上 match）', () => {
    expect(conversationIdFromUrl('foo/chat/zz')).toBe('zz');
  });

  it('没有 /chat/ ⇒ null；空 ⇒ null', () => {
    expect(conversationIdFromUrl('https://www.doubao.com/')).toBeNull();
    expect(conversationIdFromUrl('')).toBeNull();
    expect(conversationIdFromUrl(null)).toBeNull();
    expect(conversationIdFromUrl(undefined)).toBeNull();
  });
});

describe('accountNameFallback（原 :2869 的 tt ? dola : 豆包）', () => {
  it('dola 类型 ⇒ dola；其余（含未知 / 缺项）⇒ 豆包', () => {
    expect(accountNameFallback('dola')).toBe('dola');
    expect(accountNameFallback('doubao')).toBe('豆包');
    expect(accountNameFallback('lovart')).toBe('豆包');
    expect(accountNameFallback(undefined)).toBe('豆包');
  });
});

describe('pendingAttemptEdit（原 $e :2883-2890）', () => {
  it('★ 四个兜底：text 空串 / 其余 null / styleIds 非数组 ⇒ []', () => {
    expect(pendingAttemptEdit({})).toEqual({
      text: '',
      aspectRatio: null,
      duration: null,
      model: null,
      sendAccount: null,
      styleIds: [],
    });
  });

  it('★ 有值照取；`styleIds` **拷贝**一份（不是同一个引用）', () => {
    const styleIds = ['s1', 's2'];
    const e = pendingAttemptEdit({
      text: '一只猫',
      aspectRatio: '16:9',
      duration: 5,
      model: 'm',
      sendAccount: 'auto',
      styleIds,
    });
    expect(e).toEqual({
      text: '一只猫',
      aspectRatio: '16:9',
      duration: 5,
      model: 'm',
      sendAccount: 'auto',
      styleIds: ['s1', 's2'],
    });
    expect(e.styleIds).not.toBe(styleIds);
  });

  it('非对象入参 ⇒ 全兜底', () => {
    expect(pendingAttemptEdit(null).text).toBe('');
    expect(pendingAttemptEdit('x').styleIds).toEqual([]);
  });
});

describe('pendingAttemptParams（原 :2894-2898 的 ye ? {model,duration,ratio} : null）', () => {
  it('★ 无入参 ⇒ `null`（不是 `{}`）', () => {
    expect(pendingAttemptParams(null)).toBeNull();
    expect(pendingAttemptParams(undefined)).toBeNull();
  });

  it('★ `ratio` 取的是 `aspectRatio`（源字段名不同）', () => {
    expect(pendingAttemptParams({ model: 'm', duration: 5, aspectRatio: '9:16' })).toEqual({
      model: 'm',
      duration: 5,
      ratio: '9:16',
    });
  });
});

describe('attemptPromptOf（原 :2899 / :2928 的 slice(0,2000)）', () => {
  it('★ 截断到 2000', () => {
    expect(attemptPromptOf('x'.repeat(2500))).toHaveLength(ATTEMPT_PROMPT_MAX);
  });

  it('空 / 非字符串 ⇒ 空串', () => {
    expect(attemptPromptOf('')).toBe('');
    expect(attemptPromptOf(null)).toBe('');
    expect(attemptPromptOf(undefined)).toBe('');
  });
});

describe('sentAttemptOf（原 :2891-2903）', () => {
  const base = {
    id: 'a1',
    at: 1000,
    accountId: 'acc_1',
    accountName: '豆包号',
    prompt: '一只猫',
    payloadParams: { model: 'm', duration: 5, aspectRatio: '16:9' },
    conversationId: 'c1',
    nodeData: { text: '节点文', aspectRatio: '4:3', styleIds: ['s'] },
  };

  it('★ 形状：带 params / edit / conversationId，status=pending、note 空', () => {
    const a = sentAttemptOf(base);
    expect(a).toMatchObject({
      id: 'a1',
      at: 1000,
      accountId: 'acc_1',
      accountName: '豆包号',
      params: { model: 'm', duration: 5, ratio: '16:9' },
      prompt: '一只猫',
      edit: { text: '节点文', aspectRatio: '4:3', duration: null, model: null, sendAccount: null, styleIds: ['s'] },
      conversationId: 'c1',
      status: 'pending',
      note: '',
    });
  });

  it('★ 无 payload params ⇒ `params` 为 `null`（仍写出该键）', () => {
    const a = sentAttemptOf({ ...base, payloadParams: undefined });
    expect(a.params).toBeNull();
  });

  it('★ 无会话 id ⇒ `conversationId` 为 `null`（不编造）', () => {
    const a = sentAttemptOf({ ...base, conversationId: null });
    expect(a.conversationId).toBeNull();
  });
});

describe('failedAttemptOf（原 :2925-2931）', () => {
  const base = {
    id: 'a2',
    at: 2000,
    accountId: 'acc_1',
    accountName: '豆包号',
    prompt: '一只猫',
    note: '发送失败',
  };

  it('★ 形状：status=failed + note；**不带** params / edit / conversationId', () => {
    const a = failedAttemptOf(base);
    expect(a).toMatchObject({ id: 'a2', status: 'failed', note: '发送失败', conversationId: null });
    expect(a.params).toBeNull();
    expect('edit' in a).toBe(false);
  });
});

describe('pendingAttemptPatch（原 :2907-2913 / :2935-2941 —— 两处同形）', () => {
  it('★ 两个键恒写；`_pendingAttempts` **按账号分槽**', () => {
    const at = { id: 'a1' };
    expect(pendingAttemptPatch({}, 'acc_1', at)).toEqual({
      _pendingAttempt: at,
      _pendingAttempts: { acc_1: at },
    });
  });

  it('★ 已有 `_pendingAttempts` ⇒ 不丢其它账号的槽', () => {
    const at = { id: 'a2' };
    const patch = pendingAttemptPatch({ _pendingAttempts: { acc_9: { id: 'old' } } }, 'acc_1', at);
    expect(patch._pendingAttempts).toEqual({ acc_9: { id: 'old' }, acc_1: at });
  });

  it('`_pendingAttempts` 不是对象 ⇒ 当空表（不抛）', () => {
    expect(pendingAttemptPatch({ _pendingAttempts: 'x' }, 'acc_1', { id: 'a' })._pendingAttempts).toEqual({
      acc_1: { id: 'a' },
    });
  });
});
