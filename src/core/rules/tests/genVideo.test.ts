/**
 * 文生视频节点纯规则单测（原 `YL.jsx` 的 `v` / `h` / `y`）
 *
 * ⚠️ 断言**逐值对源**（`YL.jsx:42,64-75,62-109`）—— 不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { hasResult, nodeAccountLabel, stageRatio } from '../genVideo';
import type { Account } from '@/stable/model/account';

describe('stageRatio（原 `v`，`YL.jsx:64-75`）', () => {
  it('三分支：9:16 / 1:1 / 其余', () => {
    expect(stageRatio('9:16')).toBe('9 / 16');
    expect(stageRatio('1:1')).toBe('1 / 1');
    expect(stageRatio('16:9')).toBe('16 / 9');
  });

  it('★ 空值与**其它比例**一律 `16 / 9`（源只有三个分支 —— `4:3` 也不例外）', () => {
    expect(stageRatio(undefined)).toBe('16 / 9');
    expect(stageRatio('')).toBe('16 / 9');
    expect(stageRatio('4:3')).toBe('16 / 9');
    expect(stageRatio('3:4')).toBe('16 / 9');
  });
});

describe('hasResult（原 `h`，`YL.jsx:42`）', () => {
  it('`resultUrl` 或 `resultPoster` 任一为真即真', () => {
    expect(hasResult({ resultUrl: 'img://x.png' })).toBe(true);
    expect(hasResult({ resultPoster: 'img://p.png' })).toBe(true);
    expect(hasResult({ resultUrl: 'a', resultPoster: 'b' })).toBe(true);
  });

  it('都没有 ⇒ 假（含空串 —— 源是 `!!`，空串算假）', () => {
    expect(hasResult({})).toBe(false);
    expect(hasResult({ resultUrl: '', resultPoster: '' })).toBe(false);
  });
});

describe('nodeAccountLabel（原 `y`，`YL.jsx:62-109`）', () => {
  const accounts = [{ id: 'a_1', name: '豆包01' }] as unknown as Account[];
  const groups = [{ id: 'g1', name: '主力' }];

  it('空 / `auto` ⇒ 全部账号（自动）', () => {
    expect(nodeAccountLabel({})).toBe('全部账号（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto' })).toBe('全部账号（自动）');
  });

  it('`auto:group:ungrouped` ⇒ 未分组（自动）', () => {
    expect(nodeAccountLabel({ sendAccount: 'auto:group:ungrouped' })).toBe('未分组（自动）');
  });

  it('`auto:group:<id>` ⇒ 组名（自动）；查不到 ⇒ 分组（自动）', () => {
    expect(nodeAccountLabel({ sendAccount: 'auto:group:g1', groups })).toBe('主力（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:group:nope', groups })).toBe('分组（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:group:g1' })).toBe('分组（自动）');
  });

  it('`auto:<channel>` ⇒ 频道名账号（自动）；查不到频道 ⇒ 原文账号（自动）', () => {
    expect(nodeAccountLabel({ sendAccount: 'auto:doubao' })).toBe('豆包账号（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:other' })).toBe('其他账号（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:lovart' })).toBe('Lovart账号（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:unknownch' })).toBe('unknownch账号（自动）');
  });

  it('显式账号 id ⇒ 账号名；查不到 ⇒ 豆包账号（自动）', () => {
    expect(nodeAccountLabel({ sendAccount: 'a_1', accounts })).toBe('豆包01');
    expect(nodeAccountLabel({ sendAccount: 'a_missing', accounts })).toBe('豆包账号（自动）');
  });

  it('★ 不看 `channel`（与 `accountPickerLabel` 的 `api` 优先**不同**）', () => {
    expect(nodeAccountLabel({ sendAccount: 'auto' })).toBe('全部账号（自动）');
    // 反证：同样的输入喂给 picker 那套会得 'API'（见 accountPick.test.ts）
  });
});
