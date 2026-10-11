/**
 * 文生图节点纯规则单测（原 `ZL.jsx` 的 `d` / `ig-chip-status` / 历史版本条目）
 *
 * ⚠️ 断言**逐值对源**（`ZL.jsx:25-27,218-220,297-311`）—— 不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { genImageCurrentUrl, imageApiChipLabel, imageChannelLabel, imageVersionView } from '../genImage';

describe('genImageCurrentUrl（原 `d`，`ZL.jsx:25-27`）', () => {
  it('全空 ⇒ `null`', () => {
    expect(genImageCurrentUrl({})).toBeNull();
    expect(genImageCurrentUrl({ results: [] })).toBeNull();
  });

  it('`viewUrl` **在 `results` 里** ⇒ 优先用它', () => {
    expect(genImageCurrentUrl({ viewUrl: 'v', results: [{ dataUrl: 'v' }] })).toBe('v');
    expect(
      genImageCurrentUrl({ viewUrl: 'v', resultUrl: 'r', results: [{ dataUrl: 'v' }, { dataUrl: 'x' }] }),
    ).toBe('v');
  });

  it('★ `viewUrl` **不在 `results` 里** ⇒ 回落 `resultUrl`，再回落第一条结果', () => {
    expect(genImageCurrentUrl({ viewUrl: 'v', results: [{ dataUrl: 'a' }] })).toBe('a');
    expect(genImageCurrentUrl({ viewUrl: 'v', resultUrl: 'r', results: [{ dataUrl: 'a' }] })).toBe('r');
  });

  it('没有 `viewUrl` ⇒ `resultUrl` 优先，再回落第一条结果', () => {
    expect(genImageCurrentUrl({ resultUrl: 'r' })).toBe('r');
    expect(genImageCurrentUrl({ resultUrl: 'r', results: [{ dataUrl: 'a' }] })).toBe('r');
    expect(genImageCurrentUrl({ results: [{ dataUrl: 'a' }, { dataUrl: 'b' }] })).toBe('a');
  });

  it('★ 空串算假（源的 `||` 链）', () => {
    expect(genImageCurrentUrl({ resultUrl: '', results: [{ dataUrl: 'a' }] })).toBe('a');
    expect(genImageCurrentUrl({ viewUrl: '', results: [{ dataUrl: 'a' }] })).toBe('a');
  });
});

describe('imageChannelLabel（原 `QL`，`ZL.jsx:961`）', () => {
  it('三档有值', () => {
    expect(imageChannelLabel('doubao')).toBe('豆包后台');
    expect(imageChannelLabel('dola')).toBe('Dola');
    expect(imageChannelLabel('api')).toBe('API');
  });

  it('★ 表外 / 空 / 缺省 ⇒ 兜底 `豆包后台`（`QL` 只有 3 项 —— 与 `ACCOUNT_TYPE_LABEL` **不同**）', () => {
    expect(imageChannelLabel('lovart')).toBe('豆包后台');
    expect(imageChannelLabel('')).toBe('豆包后台');
    expect(imageChannelLabel(undefined)).toBe('豆包后台');
  });
});

describe('imageApiChipLabel（原 `ZL.jsx:218-220`）', () => {
  it('★ `null` = 不渲染：无 apiJob / 无 status / 已 `done`', () => {
    expect(imageApiChipLabel(undefined)).toBeNull();
    expect(imageApiChipLabel(null)).toBeNull();
    expect(imageApiChipLabel({})).toBeNull();
    expect(imageApiChipLabel({ status: '' })).toBeNull();
    expect(imageApiChipLabel({ status: 7 })).toBeNull();
    expect(imageApiChipLabel({ status: 'done' })).toBeNull();
  });

  it('`failed` ⇒ 失败；**其余一律**进行中（源只有二分）', () => {
    expect(imageApiChipLabel({ status: 'failed' })).toBe('API 失败');
    expect(imageApiChipLabel({ status: 'running' })).toBe('API 进行中');
    expect(imageApiChipLabel({ status: 'queued' })).toBe('API 进行中');
    expect(imageApiChipLabel({ status: 'weird' })).toBe('API 进行中');
  });
});

describe('imageVersionView（原 `ZL.jsx:297-311`）', () => {
  const result = {
    dataUrl: 'img://a',
    ts: 1700000000000,
    accountName: '豆包01',
    ratio: '1:1',
    prompt: '一只猫',
  };

  it('逐项取值；`selected` = 与当前展示图**同址**', () => {
    expect(imageVersionView(result, 'img://a')).toEqual({
      dataUrl: 'img://a',
      selected: true,
      ts: 1700000000000,
      account: '豆包01',
      ratio: '1:1',
      prompt: '一只猫',
    });
    expect(imageVersionView(result, 'img://b').selected).toBe(false);
    expect(imageVersionView(result, null).selected).toBe(false);
  });

  it('★ 缺字段 ⇒ 三个兜底（`—` / `自动` / `（无提示词）`）+ `ts` 为 `undefined`', () => {
    expect(imageVersionView({}, null)).toEqual({
      dataUrl: '',
      selected: false,
      ts: undefined,
      account: '—',
      ratio: '自动',
      prompt: '（无提示词）',
    });
    expect(imageVersionView({ ts: '1700000000000' }, null).ts).toBeUndefined();
    expect(imageVersionView({ accountName: '', ratio: '' }, null)).toMatchObject({
      account: '—',
      ratio: '自动',
    });
  });

  it('提示词**超 24 字** ⇒ 截断', () => {
    expect(imageVersionView({ dataUrl: 'a', prompt: '一'.repeat(30) }, null).prompt).toBe('一'.repeat(24));
  });
});
