/**
 * 生成进度回显单测 —— 回源 `B0`(42493-42567) / `tc`(42481-42492)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { formatElapsed, resolveGenProgress } from '../genProgress';
import { GEN_ATTEMPT_WINDOW_MS } from '@/constants';

const NOW = 1_700_000_000_000;
/** 起始 = 10 秒前；`GEN_ATTEMPT_WINDOW_MS = 1500` ⇒ 窗口下界 = startedAt - 1500 */
const STARTED = NOW - 10_000;
const FLOOR = STARTED - GEN_ATTEMPT_WINDOW_MS;

describe('formatElapsed（原 `tc` 42481）', () => {
  it('无起始 → 空串', () => {
    expect(formatElapsed(null, null, NOW)).toBe('');
    expect(formatElapsed(0, null, NOW)).toBe('');
    expect(formatElapsed(undefined, null, NOW)).toBe('');
  });

  it('< 60s → `Ns`', () => {
    expect(formatElapsed(STARTED, STARTED + 59_000, NOW)).toBe('59s');
    expect(formatElapsed(STARTED, STARTED, NOW)).toBe('0s');
  });

  it('≥ 60s → `NmSSs`（秒补零两位）', () => {
    expect(formatElapsed(STARTED, STARTED + 61_000, NOW)).toBe('1m01s');
    expect(formatElapsed(STARTED, STARTED + 600_000, NOW)).toBe('10m00s');
  });

  it('★ `to` 为空 ⇒ 用注入的 `now`（原 `tc` 的 `t || Date.now()`）', () => {
    expect(formatElapsed(NOW - 5_000, null, NOW)).toBe('5s');
  });

  it('★ 负数差被夹到 0（原 `Math.max(0, …)`）', () => {
    expect(formatElapsed(STARTED, STARTED - 5_000, NOW)).toBe('0s');
  });
});

describe('resolveGenProgress（原 `B0`）', () => {
  it('① 未成功 + waiting/sending → 生成未开始 / idle', () => {
    for (const status of ['waiting', 'sending']) {
      expect(resolveGenProgress({ status }, null, null, NOW)).toEqual({
        text: '生成未开始',
        state: 'idle',
        elapsed: '',
        note: '',
      });
    }
  });

  it('① 未成功 + 其它状态 → 「—」/ na', () => {
    expect(resolveGenProgress({ status: 'failed' }, null, null, NOW)).toEqual({
      text: '—',
      state: 'na',
      elapsed: '',
      note: '',
    });
  });

  it('② 成功但节点不存在 → 状态未知 / 节点不存在', () => {
    expect(resolveGenProgress({ status: 'success', startedAt: STARTED }, null, null, NOW)).toEqual({
      text: '状态未知',
      state: 'unknown',
      elapsed: '',
      note: '节点不存在',
    });
  });

  it('③ 本轮尝试失败 → 失败 + 原文 note', () => {
    const r = resolveGenProgress(
      { status: 'success', startedAt: STARTED, accountId: 'acc_1' },
      { data: { genHistory: { attempts: [{ at: STARTED + 1000, status: 'failed', note: '该账号额度不足' }] } } },
      null,
      NOW,
    );
    expect(r.text).toBe('失败');
    expect(r.state).toBe('failed');
    expect(r.note).toBe('该账号额度不足');
    expect(r.elapsed).toBe('10s');
  });

  it('③ 本轮尝试成功 → 已完成（耗时算到 resultAt）', () => {
    const r = resolveGenProgress(
      { status: 'success', startedAt: STARTED, accountId: 'acc_1' },
      {
        data: {
          genHistory: { attempts: [{ at: STARTED + 1000, status: 'success' }] },
          resultAt: STARTED + 5000,
        },
      },
      null,
      NOW,
    );
    expect(r.text).toBe('已完成');
    expect(r.state).toBe('done');
    expect(r.elapsed).toBe('5s');
    expect(r.note).toBe('');
  });

  it('★ 窗口判据：`at < startedAt - 1500` 的尝试**被忽略**（不误读上一轮结果）', () => {
    const r = resolveGenProgress(
      { status: 'success', startedAt: STARTED, accountId: 'acc_1' },
      { data: { genHistory: { attempts: [{ at: FLOOR - 1, status: 'failed', note: '上一轮' }] } } },
      { kind: 'offer', text: '' },
      NOW,
    );
    expect(r.state).toBe('queued'); // 落到「按回复类型」分支，而非 failed
    expect(r.note).toBe('等待豆包开始生成');
  });

  it('★ 窗口边界：`at === startedAt - 1500` **算**在本轮内（源码 `!(p.at < a)`）', () => {
    const r = resolveGenProgress(
      { status: 'success', startedAt: STARTED, accountId: 'acc_1' },
      { data: { genHistory: { attempts: [{ at: FLOOR, status: 'failed', note: '边界' }] } } },
      null,
      NOW,
    );
    expect(r.state).toBe('failed');
    expect(r.note).toBe('边界');
  });

  it('★ 账号不匹配的尝试被忽略；`entry.accountId` 为空则不校验账号', () => {
    const node = {
      data: { genHistory: { attempts: [{ at: STARTED + 1000, status: 'failed', note: '别人的', accountId: 'acc_OTHER' }] } },
    };
    const mine = resolveGenProgress({ status: 'success', startedAt: STARTED, accountId: 'acc_1' }, node, { kind: 'other' }, NOW);
    expect(mine.state).toBe('generating'); // 被忽略

    const anyAcc = resolveGenProgress({ status: 'success', startedAt: STARTED, accountId: null }, node, null, NOW);
    expect(anyAcc.state).toBe('failed'); // 不校验账号 ⇒ 认
  });

  it('④ 按回复类型：unknown / offer / none / 其它', () => {
    const entry = { status: 'success', startedAt: STARTED };
    const node = { data: { genHistory: { attempts: [] } } };

    expect(resolveGenProgress(entry, node, { kind: 'unknown' }, NOW)).toMatchObject({
      text: '状态未知',
      state: 'unknown',
      note: '未能获取进度',
      elapsed: '10s',
    });
    expect(resolveGenProgress(entry, node, { kind: 'offer' }, NOW)).toMatchObject({
      text: '排队中',
      state: 'queued',
      note: '等待豆包开始生成',
    });
    expect(resolveGenProgress(entry, node, { kind: 'none' }, NOW)).toMatchObject({
      text: '未在生成',
      state: 'idle',
      note: '后台暂无该任务的生成记录',
    });
    expect(resolveGenProgress(entry, node, { kind: 'other' }, NOW)).toMatchObject({
      text: '生成中',
      state: 'generating',
      note: '',
    });
  });

  it('④ 有回复原文时，note 用原文（不回落到默认提示）', () => {
    const r = resolveGenProgress(
      { status: 'success', startedAt: STARTED },
      { data: { genHistory: { attempts: [] } } },
      { kind: 'offer', text: '正在为你排队，请稍候' },
      NOW,
    );
    expect(r.note).toBe('正在为你排队，请稍候');
  });

  it('④ 无 startedAt ⇒ elapsed 为空串', () => {
    const r = resolveGenProgress(
      { status: 'success' },
      { data: { genHistory: { attempts: [] } } },
      { kind: 'other' },
      NOW,
    );
    expect(r.elapsed).toBe('');
  });

  it('③ 失败分支的 elapsed：无 since ⇒ 空串', () => {
    const r = resolveGenProgress(
      { status: 'success', accountId: null },
      { data: { genHistory: { attempts: [{ at: 1, status: 'failed', note: 'x' }] } } },
      null,
      NOW,
    );
    expect(r.state).toBe('failed');
    expect(r.elapsed).toBe('');
  });

  it('★ filter 防御分支：`null` 元素 / `at` 非数字 / `at` 非有限数 全被忽略', () => {
    const r = resolveGenProgress(
      { status: 'success', startedAt: STARTED, accountId: null },
      { data: { genHistory: { attempts: [null, { status: 'failed' }, { at: Number.NaN, status: 'failed' }] } } },
      { kind: 'other' },
      NOW,
    );
    expect(r.state).toBe('generating'); // 三条脏记录都被滤掉 ⇒ 落到「按回复类型」
  });

  it('★ `last` 的 status 既非 failed 也非 success（如 `pending`）⇒ 落到「按回复类型」', () => {
    const r = resolveGenProgress(
      { status: 'success', startedAt: STARTED, accountId: null },
      { data: { genHistory: { attempts: [{ at: STARTED + 1, status: 'pending' }] } } },
      { kind: 'other' },
      NOW,
    );
    expect(r.state).toBe('generating');
  });

  it('★ `since` 优先取 `finishedAt`（原 `e.finishedAt || e.startedAt`）', () => {
    const r = resolveGenProgress(
      { status: 'success', startedAt: STARTED, finishedAt: STARTED + 3000, accountId: null },
      { data: { genHistory: { attempts: [] } } },
      { kind: 'other' },
      NOW,
    );
    expect(r.elapsed).toBe('7s'); // since = STARTED+3000 ⇒ 距 NOW 7 秒（而非 10 秒）
  });
});
