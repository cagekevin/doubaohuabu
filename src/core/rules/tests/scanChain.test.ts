/**
 * 抓取降级链单测 —— 对应 docs/08-验证用例.md **W12**（修正为两档）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  DEPRECATED_SCAN_STRATEGY,
  SCAN_CHAIN,
  isScanChainExhausted,
  nextScanStrategy,
  remainingScanStrategies,
  summarizeScanAttempts,
} from '../scanChain';

describe('W12 · 链定义（★ 只有两档）', () => {
  it('★ 链序 = `frames` → `webview`（不含已废弃的 `chrome-cdp`）', () => {
    expect(SCAN_CHAIN).toEqual(['frames', 'webview']);
  });

  it('★ `chrome-cdp` 是**废弃常量**，不在可选链里（09-校验记录 C2）', () => {
    expect(DEPRECATED_SCAN_STRATEGY).toBe('chrome-cdp');
    expect(SCAN_CHAIN).not.toContain(DEPRECATED_SCAN_STRATEGY);
  });
});

describe('W12 · 降级决策', () => {
  it('★ 未尝试 → 第一档是 `frames`', () => {
    expect(nextScanStrategy([])).toBe('frames');
  });

  it('★ `frames` 失败 → 降级到 `webview`', () => {
    expect(nextScanStrategy(['frames'])).toBe('webview');
  });

  it('★ 两档都试过 → 链耗尽', () => {
    expect(nextScanStrategy(['frames', 'webview'])).toBeNull();
    expect(isScanChainExhausted(['frames', 'webview'])).toBe(true);
  });

  it('remaining 保持链序（不是尝试顺序）', () => {
    expect(remainingScanStrategies(['webview'])).toEqual(['frames']);
    expect(remainingScanStrategies([])).toEqual(['frames', 'webview']);
  });

  it('未知档位不影响（被忽略）', () => {
    expect(remainingScanStrategies(['chrome-cdp'])).toEqual(['frames', 'webview']);
  });
});

describe('W12 · 结果汇总', () => {
  it('★ 第一档成功 → via = frames', () => {
    const r = summarizeScanAttempts([{ via: 'frames', ok: true, count: 3 }]);
    expect(r.via).toBe('frames');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(3);
    expect(r.failures).toEqual([]);
  });

  it('★ 第一档失败、第二档成功 → via = webview（降级成功）', () => {
    const r = summarizeScanAttempts([
      { via: 'frames', ok: false, error: 'frames 通道不可用' },
      { via: 'webview', ok: true, count: 2 },
    ]);
    expect(r.via).toBe('webview');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(2);
    expect(r.failures).toEqual([{ via: 'frames', error: 'frames 通道不可用' }]);
  });

  it('★ 全失败 → via = null，ok = false，失败原因**原样保留**', () => {
    const r = summarizeScanAttempts([
      { via: 'frames', ok: false, error: 'E1' },
      { via: 'webview', ok: false, error: 'E2' },
    ]);
    expect(r.via).toBeNull();
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.failures).toEqual([
      { via: 'frames', error: 'E1' },
      { via: 'webview', error: 'E2' },
    ]);
  });

  it('空尝试 → 全零', () => {
    const r = summarizeScanAttempts([]);
    expect(r).toEqual({ via: null, ok: false, total: 0, failures: [] });
  });
});
