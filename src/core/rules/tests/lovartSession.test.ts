/**
 * Lovart 会话条纯判据单测（原 `_Component25.jsx:341-380`）
 *
 * 断言红线：**实现一变必红** —— 五档提示行、三键禁用判据、同步键文案、
 * 两处错误行的**三级回落顺序**（错误码表 → 后端原文 → 兜底）。
 */

import { describe, expect, it } from 'vitest';
import {
  lovartCloseDisabled,
  lovartHint,
  lovartOpenDisabled,
  lovartOpenErrorOf,
  lovartOpenErrorText,
  lovartSyncDisabled,
  lovartSyncErrorText,
  lovartSyncLabel,
  type LovartOpenState,
} from '../lovartSession';

const open = (over: Partial<LovartOpenState> = {}): LovartOpenState => ({ status: 'idle', ...over });

describe('lovartHint（源 `:366` 的五档三目）', () => {
  it('★ `open` + `alreadyOpen` ⇒ 「已开 · 登录后点同步」', () => {
    expect(lovartHint(open({ status: 'open', alreadyOpen: true }))).toContain('已开');
  });

  it('★ `open`（本次刚打开）⇒ 「已打开 · 请在里面登录」', () => {
    expect(lovartHint(open({ status: 'open', alreadyOpen: false }))).toContain('请在里面登录');
  });

  it('`opening` ⇒ 正在打开', () => {
    expect(lovartHint(open({ status: 'opening' }))).toContain('正在打开');
  });

  it('`error` ⇒ 打开失败', () => {
    expect(lovartHint(open({ status: 'error' }))).toContain('打开真实 Chrome 失败');
  });

  it('★ 默认档（`idle`）⇒ 未登录提示', () => {
    expect(lovartHint(open())).toContain('未登录');
  });
});

describe('三键禁用判据（源 `:369` / `:372` / `:375`）', () => {
  it('★ 「打开」：`opening` / `open` 禁用；`idle` / `error` 可点', () => {
    expect(lovartOpenDisabled(open({ status: 'opening' }))).toBe(true);
    expect(lovartOpenDisabled(open({ status: 'open' }))).toBe(true);
    expect(lovartOpenDisabled(open({ status: 'idle' }))).toBe(false);
    expect(lovartOpenDisabled(open({ status: 'error' }))).toBe(false);
  });

  it('★ 「同步」：只在 `syncing` 禁用（`null` / `error` 都可再点）', () => {
    expect(lovartSyncDisabled({ status: 'syncing' })).toBe(true);
    expect(lovartSyncDisabled({ status: 'error' })).toBe(false);
    expect(lovartSyncDisabled(null)).toBe(false);
  });

  it('★ 「关闭」：**只有** `open` 可点（其余全禁）', () => {
    expect(lovartCloseDisabled(open({ status: 'open' }))).toBe(false);
    expect(lovartCloseDisabled(open({ status: 'idle' }))).toBe(true);
    expect(lovartCloseDisabled(open({ status: 'opening' }))).toBe(true);
    expect(lovartCloseDisabled(open({ status: 'error' }))).toBe(true);
  });
});

describe('lovartSyncLabel（源 `:373`）', () => {
  it('`syncing` ⇒ 「同步中…」；否则 ⇒ 「同步会话到画布」', () => {
    expect(lovartSyncLabel({ status: 'syncing' })).toContain('同步中');
    expect(lovartSyncLabel({ status: 'error' })).toBe('同步会话到画布');
    expect(lovartSyncLabel(null)).toBe('同步会话到画布');
  });
});

describe('两处错误行（源 `:379` / `:380`）', () => {
  it('★ 同步错误：只在 `error` 显示，带前缀', () => {
    expect(lovartSyncErrorText(null)).toBeNull();
    expect(lovartSyncErrorText({ status: 'syncing' })).toBeNull();
    expect(lovartSyncErrorText({ status: 'error', message: 'cookie 导出失败' })).toBe(
      '同步失败：cookie 导出失败',
    );
  });

  it('★ 打开错误：**错误码表 → 后端原文 → 兜底**（三级，顺序即优先级）', () => {
    // ① 已知码 ⇒ 表文案（源 `xD` 逐字）
    expect(lovartOpenErrorText(open({ status: 'error', error: 'no-chrome' }))).toBe(
      '未检测到本机 Google Chrome。请安装 Google Chrome 后重试。',
    );
    // ② 未知码 ⇒ 后端原文
    expect(lovartOpenErrorText(open({ status: 'error', error: 'who-knows', message: '后端原文' }))).toBe(
      '后端原文',
    );
    // ③ 未知码 + 无原文 ⇒ 兜底
    expect(lovartOpenErrorText(open({ status: 'error', error: 'who-knows' }))).toBe('打开失败');
  });

  it('非 `error` 态 ⇒ 不渲染（`null`）', () => {
    expect(lovartOpenErrorText(open({ status: 'idle' }))).toBeNull();
    expect(lovartOpenErrorText(open({ status: 'open' }))).toBeNull();
  });
});

describe('lovartOpenErrorOf（原 `xD`，`shared.js:38652-38662`）', () => {
  it('★ 后端会返回的 9 个错误码**全部有文案**（漏一个 ⇒ 静默落兜底）', () => {
    const backendCodes = [
      'no-chrome',
      'no-account',
      'spawn-failed',
      'chrome-no-port',
      'chrome-no-ws',
      'cdp-connect-failed',
      'no-api',
      'empty-result',
      'exception',
    ];
    for (const code of backendCodes) {
      expect(lovartOpenErrorOf(code), `缺少 ${code} 的文案`).toBeTruthy();
    }
  });

  it('★ 未知码 / 空值 ⇒ `null`（**不编文案**，交给调用方回落）', () => {
    expect(lovartOpenErrorOf('unknown-code')).toBeNull();
    expect(lovartOpenErrorOf('')).toBeNull();
    expect(lovartOpenErrorOf(undefined)).toBeNull();
  });
});
