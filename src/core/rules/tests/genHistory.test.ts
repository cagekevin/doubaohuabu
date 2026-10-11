/**
 * genHistory 打补丁单测（原 `Uy` `shared.js:25577-25605`）
 *
 * 断言红线：**实现一变必红** —— 逐条对齐源版的三个「原样返回」分支与「不可变」语义。
 */

import { describe, expect, it } from 'vitest';
import {
  appendGenHistoryAttempt,
  attemptsOf,
  attemptStats,
  attemptStatusLabel,
  currentVersionIndex,
  makeGenAttempt,
  patchGenHistoryAttempt,
  selectVersionPatch,
  setVersionPosterPatch,
  versionItemView,
} from '../genHistory';
import { GEN_HISTORY_KEY } from '@/stable/model/node';

const withHistory = (attempts: unknown[]): Record<string, unknown> => ({
  text: '原样保留',
  [GEN_HISTORY_KEY]: { v: 1, attempts },
});

describe('attemptsOf（原 `tm` 25553-25563）', () => {
  it('★ 缺失 / `attempts` 非数组 ⇒ **空表**（不抛）', () => {
    expect(attemptsOf({})).toEqual([]);
    expect(attemptsOf({ [GEN_HISTORY_KEY]: {} })).toEqual([]);
    expect(attemptsOf({ [GEN_HISTORY_KEY]: { attempts: 'nope' } })).toEqual([]);
    expect(attemptsOf({ [GEN_HISTORY_KEY]: null })).toEqual([]);
  });

  it('命中 ⇒ 返回**原数组本身**（源 `return t.attempts`，不拷贝）', () => {
    const arr = [{ id: 'a1' }];
    expect(attemptsOf({ [GEN_HISTORY_KEY]: { v: 1, attempts: arr } })).toBe(arr);
  });
});

describe('attemptStats（原 `F$` 25621-25652）', () => {
  it('★ 空表 ⇒ 全 0 + 空账号表', () => {
    expect(attemptStats({})).toEqual({ total: 0, success: 0, failed: 0, pending: 0, accounts: [] });
  });

  it('★ `cancelled` 计入 **failed**；**无 status** 计入 **pending**（源是 else 分支）', () => {
    const data = withHistory([
      { id: 'a1', status: 'success', accountName: '号一' },
      { id: 'a2', status: 'failed', accountName: '号二' },
      { id: 'a3', status: 'cancelled', accountName: '号一' },
      { id: 'a4' }, // ⚠️ 没有 status ⇒ pending
      { id: 'a5', status: 'pending' },
    ]);
    expect(attemptStats(data)).toEqual({
      total: 5,
      success: 1,
      failed: 2,
      pending: 2,
      accounts: ['号一', '号二'],
    });
  });

  it('★ `accounts` **按首次出现顺序去重**，空串 / 非字符串不收', () => {
    const data = withHistory([
      { id: 'a1', accountName: 'B' },
      { id: 'a2', accountName: '' },
      { id: 'a3', accountName: 'A' },
      { id: 'a4', accountName: 'B' },
      { id: 'a5', accountName: 123 },
    ]);
    expect(attemptStats(data).accounts).toEqual(['B', 'A']);
  });
});

describe('attemptStatusLabel（原 `FL` 40772-40777）', () => {
  it('四态逐字', () => {
    expect(attemptStatusLabel('pending')).toBe('进行中');
    expect(attemptStatusLabel('success')).toBe('成功');
    expect(attemptStatusLabel('failed')).toBe('失败');
    expect(attemptStatusLabel('cancelled')).toBe('已取消');
  });

  it("★ 命中不到 ⇒ **原样回显状态串**；空 / 非字符串 ⇒ 空串（源 `FL[s] || s || ''`）", () => {
    expect(attemptStatusLabel('weird')).toBe('weird');
    expect(attemptStatusLabel('')).toBe('');
    expect(attemptStatusLabel(undefined)).toBe('');
    expect(attemptStatusLabel(42)).toBe('');
  });
});

describe('makeGenAttempt（原 `Fc` 25518-25552）', () => {
  const base = { id: 'a-1', at: 1_700_000_000_000 };

  it('★ 可空键**恒写出 `null`**（不省略）；`prompt` 空 ⇒ 空串', () => {
    expect(makeGenAttempt(base)).toEqual({
      id: 'a-1',
      at: 1_700_000_000_000,
      accountId: null,
      accountName: '',
      params: null,
      prompt: '',
      // ⚠️ `edit` 为假值 ⇒ **整个键都不出现**（源 `...(s ? {edit:{...s}} : null)`）
      conversationId: null,
      messageId: null,
      vid: null,
      resourceId: null,
      status: 'pending',
      note: '',
    });
    expect('edit' in makeGenAttempt(base)).toBe(false);
  });

  it('★ `params` / `edit` 是**浅拷贝**（改原对象不影响已造的尝试）', () => {
    const params = { ratio: '16:9' };
    const edit = { text: '猫' };
    const a = makeGenAttempt({ ...base, params, edit });
    params.ratio = '9:16';
    edit.text = '狗';
    expect(a.params).toEqual({ ratio: '16:9' });
    expect(a.edit).toEqual({ text: '猫' });
  });

  it('★ `id` / `at` 由**注入**给出（`core` 不自己取时间）', () => {
    const a = makeGenAttempt({ id: 'a-zz', at: 42 });
    expect(a.id).toBe('a-zz');
    expect(a.at).toBe(42);
  });

  it('显式 `status` / `note` / `accountName` 原样带上', () => {
    const a = makeGenAttempt({ ...base, status: 'success', note: 'API 通道 · 可灵', accountName: 'API · 可灵' });
    expect(a.status).toBe('success');
    expect(a.note).toBe('API 通道 · 可灵');
    expect(a.accountName).toBe('API · 可灵');
  });
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

describe('appendGenHistoryAttempt（原 U$）', () => {
  const attemptsOf = (out: Record<string, unknown>): unknown[] =>
    (out[GEN_HISTORY_KEY] as { attempts: unknown[] }).attempts;

  it('没有 genHistory ⇒ 建 `{v:1, attempts:[新]}`；其它字段保留', () => {
    const out = appendGenHistoryAttempt({ text: 't' }, { id: 'a1' });
    expect(out.text).toBe('t');
    expect(out[GEN_HISTORY_KEY]).toEqual({ v: 1, attempts: [{ id: 'a1' }] });
  });

  it('★ 追加在**末尾**（不是插到最前）', () => {
    const out = appendGenHistoryAttempt(withHistory([{ id: 'a1' }]), { id: 'a2' });
    expect(attemptsOf(out)).toEqual([{ id: 'a1' }, { id: 'a2' }]);
  });

  it('★ 假值 attempt（null / undefined / 0 / 空串）⇒ **原样返回同一引用**', () => {
    const data = withHistory([{ id: 'a1' }]);
    for (const bad of [null, undefined, 0, '']) {
      expect(appendGenHistoryAttempt(data, bad)).toBe(data);
    }
  });

  it('★ 只留最后 20 条（源 `slice(-20)`）—— 最早的被丢掉', () => {
    let data: Record<string, unknown> = {};
    for (let i = 0; i < 21; i++) data = appendGenHistoryAttempt(data, { id: `a${i}` });
    const attempts = attemptsOf(data) as Array<{ id: string }>;
    expect(attempts).toHaveLength(20);
    expect(attempts[0]?.id).toBe('a1'); // a0 已被挤掉
    expect(attempts[19]?.id).toBe('a20');
  });

  it('genHistory 在但 attempts 不是数组 ⇒ 视作空表（只放新条目）', () => {
    const out = appendGenHistoryAttempt({ [GEN_HISTORY_KEY]: { v: 1, attempts: 'nope' } }, { id: 'a1' });
    expect(attemptsOf(out)).toEqual([{ id: 'a1' }]);
  });

  it('★ 不改原对象（不可变）', () => {
    const data = withHistory([{ id: 'a1' }]);
    const out = appendGenHistoryAttempt(data, { id: 'a2' });
    expect(out).not.toBe(data);
    expect(attemptsOf(data)).toEqual([{ id: 'a1' }]);
  });
});

// ─────────────────────────── 历史版本（原 `YL.jsx:401-470,585-620`）───────────────────────────

/** 三条尝试：① 有 `url` + `params` ② 只有 `at`（**未出片**）③ 有 `url` + `edit` */
const VERSION_DATA: Record<string, unknown> = {
  selVer: 1,
  resultAt: 999,
  [GEN_HISTORY_KEY]: {
    v: 1,
    attempts: [
      {
        id: 'a1',
        url: 'vid://1.mp4',
        poster: 'img://p1',
        vid: 'v1',
        at: 100,
        accountName: '豆包01',
        prompt: '一只在窗台上的橘猫，阳光很好，正在打盹',
        params: { ratio: '16:9', duration: 5, model: 'seedance-2.0-mini' },
      },
      { id: 'a2', at: 200 },
      {
        id: 'a3',
        url: 'vid://3.mp4',
        at: 300,
        edit: { text: '新提示词', aspectRatio: '9:16', duration: 8, model: 'm', sendAccount: 'auto', styleIds: ['s1'] },
      },
    ],
  },
};

describe('currentVersionIndex（原 `pe`）', () => {
  it('`selVer` 是**有效下标** ⇒ 用它', () => {
    expect(currentVersionIndex(VERSION_DATA)).toBe(1);
  });

  it('★ 无效 / 缺失 ⇒ 回落**最后一条**', () => {
    expect(currentVersionIndex({ ...VERSION_DATA, selVer: 9 })).toBe(2);
    expect(currentVersionIndex({ ...VERSION_DATA, selVer: -1 })).toBe(2);
    expect(currentVersionIndex({ ...VERSION_DATA, selVer: '1' })).toBe(2);
    expect(currentVersionIndex({ [GEN_HISTORY_KEY]: { attempts: [1, 2, 3] } })).toBe(2);
  });

  it('没有 genHistory ⇒ `-1`（空表）', () => {
    expect(currentVersionIndex({})).toBe(-1);
  });
});

describe('selectVersionPatch（原 `selectVersion` 的纯半）', () => {
  it('① 有 `url` + `params` ⇒ 写 `selVer` / `result*` / `params` 三件套', () => {
    expect(selectVersionPatch(VERSION_DATA, 0)).toEqual({
      selVer: 0,
      resultUrl: 'vid://1.mp4',
      resultPoster: 'img://p1',
      resultVid: 'v1',
      resultAt: 100,
      aspectRatio: '16:9',
      duration: 5,
      model: 'seedance-2.0-mini',
    });
  });

  it('② 没 `url`（未出片）⇒ **只写 `selVer`**（不覆盖任何 `result*`）', () => {
    expect(selectVersionPatch(VERSION_DATA, 1)).toEqual({ selVer: 1 });
  });

  it('③ 有 `edit` ⇒ 写 `edit` 的六个字段（含 `styleIds` **拷贝**），`resultPoster`/`resultVid` **显式 `null`**', () => {
    expect(selectVersionPatch(VERSION_DATA, 2)).toEqual({
      selVer: 2,
      resultUrl: 'vid://3.mp4',
      resultPoster: null,
      resultVid: null,
      resultAt: 300,
      text: '新提示词',
      aspectRatio: '9:16',
      duration: 8,
      model: 'm',
      sendAccount: 'auto',
      styleIds: ['s1'],
    });
  });

  it('★ 越界 / 没有 genHistory ⇒ `null`（什么都不做）', () => {
    expect(selectVersionPatch(VERSION_DATA, 3)).toBeNull();
    expect(selectVersionPatch(VERSION_DATA, -1)).toBeNull();
    expect(selectVersionPatch({}, 0)).toBeNull();
  });
});

describe('setVersionPosterPatch（原 `setGenvideoVersionPoster` 的纯半）', () => {
  it('命中**当前版本** ⇒ 同时写节点级 `resultPoster`', () => {
    const patch = setVersionPosterPatch(VERSION_DATA, 'a2', 'img://new');
    expect(patch).toMatchObject({ resultPoster: 'img://new' });
    const attempts = (patch?.[GEN_HISTORY_KEY] as { attempts: Array<Record<string, unknown>> }).attempts;
    expect(attempts[1]).toMatchObject({ id: 'a2', poster: 'img://new' });
    expect(attempts[0]).not.toHaveProperty('poster', 'img://new');
  });

  it('命中**非当前版本** ⇒ 只改那条尝试（不写节点 `resultPoster`）', () => {
    const patch = setVersionPosterPatch(VERSION_DATA, 'a3', 'img://new');
    expect(patch).not.toHaveProperty('resultPoster');
    const attempts = (patch?.[GEN_HISTORY_KEY] as { attempts: Array<Record<string, unknown>> }).attempts;
    expect(attempts[2]).toMatchObject({ id: 'a3', poster: 'img://new' });
  });

  it('★ `attemptId == null` ⇒ **直接**写节点 `resultPoster`（源 `u = r == null`）', () => {
    expect(setVersionPosterPatch(VERSION_DATA, null, 'img://new')).toEqual({ resultPoster: 'img://new' });
  });

  it('★ `poster` 空 / 没命中且非 `null` ⇒ `null`（不产生空补丁）', () => {
    expect(setVersionPosterPatch(VERSION_DATA, 'a1', '')).toBeNull();
    expect(setVersionPosterPatch(VERSION_DATA, 'nope', 'img://new')).toBeNull();
  });
});

describe('versionItemView（原 `YL.jsx:594-618`）', () => {
  it('有 `url` ⇒ 可切换；比例 / 时长 / 账号 / 提示词（**截 24 字**）', () => {
    const v = versionItemView((VERSION_DATA[GEN_HISTORY_KEY] as { attempts: unknown[] }).attempts[0]);
    expect(v).toMatchObject({
      disabled: false,
      poster: 'img://p1',
      ratio: '16:9',
      duration: '5',
      account: '豆包01',
      prompt: '一只在窗台上的橘猫，阳光很好，正在打盹',
    });
    expect(v.prompt.length).toBeLessThan(24); // 未超长 ⇒ **原样**
    expect(typeof v.model).toBe('string');
  });

  it('★ 没 `url` ⇒ `disabled` + 三个兜底（`自动` / `—` / `—` / `（无提示词）`）', () => {
    const v = versionItemView((VERSION_DATA[GEN_HISTORY_KEY] as { attempts: unknown[] }).attempts[1]);
    expect(v).toMatchObject({
      disabled: true,
      poster: '',
      ratio: '自动',
      duration: '—',
      account: '—',
      prompt: '（无提示词）',
    });
  });

  it('提示词**超 24 字** ⇒ 截断', () => {
    const v = versionItemView({ id: 'x', url: 'u', prompt: '一'.repeat(30) });
    expect(v.prompt).toBe('一'.repeat(24));
  });
});
