/**
 * genHistory 打补丁单测（原 `Uy` `shared.js:25577-25605`）
 *
 * 断言红线：**实现一变必红** —— 逐条对齐源版的三个「原样返回」分支与「不可变」语义。
 */

import { describe, expect, it } from 'vitest';
import { patchGenHistoryAttempt } from '../genHistory';
import { GEN_HISTORY_KEY } from '@/stable/model/node';

const withHistory = (attempts: unknown[]): Record<string, unknown> => ({
  text: '原样保留',
  [GEN_HISTORY_KEY]: { v: 1, attempts },
});

describe('patchGenHistoryAttempt（原 Uy）', () => {
  it('命中：只改那一条，其余字段与其它 attempt 不动', () => {
    const data = withHistory([
      { id: 'a1', status: 'running', note: 'x' },
      { id: 'a2', status: 'running' },
    ]);
    const out = patchGenHistoryAttempt(data, 'a2', { status: 'success' });
    const h = out[GEN_HISTORY_KEY] as { v: number; attempts: Array<Record<string, unknown>> };

    expect(h.attempts[1]).toEqual({ id: 'a2', status: 'success' });
    expect(h.attempts[0]).toEqual({ id: 'a1', status: 'running', note: 'x' });
    expect(out.text).toBe('原样保留');
    expect(h.v).toBe(1);
  });

  it('★ 不改原对象（不可变）', () => {
    const data = withHistory([{ id: 'a1', status: 'running' }]);
    patchGenHistoryAttempt(data, 'a1', { status: 'failed' });
    const h = data[GEN_HISTORY_KEY] as { attempts: Array<Record<string, unknown>> };
    expect(h.attempts[0]).toEqual({ id: 'a1', status: 'running' });
  });

  it('★ 没命中 ⇒ **原样返回同一个引用**（不是"追加一条"）', () => {
    const data = withHistory([{ id: 'a1' }]);
    expect(patchGenHistoryAttempt(data, 'nope', { status: 'x' })).toBe(data);
  });

  it('★ 没有 genHistory ⇒ 原样返回（不做补救）', () => {
    const data = { text: 't' };
    expect(patchGenHistoryAttempt(data, 'a1', { status: 'x' })).toBe(data);
  });

  it('★ genHistory 不是对象 / attempts 不是数组 ⇒ 原样返回', () => {
    expect(patchGenHistoryAttempt({ [GEN_HISTORY_KEY]: null }, 'a1', {})).toEqual({
      [GEN_HISTORY_KEY]: null,
    });
    const noArr = { [GEN_HISTORY_KEY]: { v: 1, attempts: 'nope' } };
    expect(patchGenHistoryAttempt(noArr, 'a1', {})).toBe(noArr);
  });

  it('attempts 里的坏项（null / 非对象）不参与匹配也不崩', () => {
    const data = withHistory([null, 1, { id: 'a1', status: 'running' }]);
    const out = patchGenHistoryAttempt(data, 'a1', { status: 'failed' });
    const h = out[GEN_HISTORY_KEY] as { attempts: unknown[] };
    expect(h.attempts[0]).toBeNull();
    expect(h.attempts[1]).toBe(1);
    expect(h.attempts[2]).toEqual({ id: 'a1', status: 'failed' });
  });

  it('patch 后追加新字段（不是替换整条）', () => {
    const data = withHistory([{ id: 'a1', status: 'running', keep: 1 }]);
    const out = patchGenHistoryAttempt(data, 'a1', { status: 'failed', note: 'API 生成失败' });
    const h = out[GEN_HISTORY_KEY] as { attempts: Array<Record<string, unknown>> };
    expect(h.attempts[0]).toEqual({ id: 'a1', status: 'failed', keep: 1, note: 'API 生成失败' });
  });
});
