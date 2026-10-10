/**
 * 异步工具单测 —— 回源 `gn`(23587-23616)
 *
 * 原则 7：只测纯逻辑（本文件在 `lib/tests/` 下，合规）
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../async';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout（原 `gn`）', () => {
  it('结果先到 ⇒ `ok:true` + 原值', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, '测试')).resolves.toEqual({
      ok: true,
      value: 42,
    });
  });

  it('★ 超时文案含秒数（原版 `Math.round(ms / 1000)`）', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<never>(() => undefined), 20000, '接口调用');
    await vi.advanceTimersByTimeAsync(20000);
    await expect(p).resolves.toEqual({
      ok: false,
      kind: 'timeout',
      error: '接口调用超时（20s）',
    });
  });

  it('★ 不足 1 秒也按 `Math.round` 取整（10ms ⇒ 0s）', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<never>(() => undefined), 10, '读取页面地址');
    await vi.advanceTimersByTimeAsync(10);
    await expect(p).resolves.toEqual({
      ok: false,
      kind: 'timeout',
      error: '读取页面地址超时（0s）',
    });
  });

  it('★ 拒绝 ⇒ `kind:error`，**不抛**（调用方不必写 try）', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, '测试')).resolves.toEqual({
      ok: false,
      kind: 'error',
      error: 'boom',
    });
  });

  it('★ 非 Error 的拒绝（字符串 / null）⇒ `String(e)` 兜底', async () => {
    await expect(withTimeout(Promise.reject('字符串原因'), 1000, '测试')).resolves.toEqual({
      ok: false,
      kind: 'error',
      error: '字符串原因',
    });
    await expect(withTimeout(Promise.reject(null), 1000, '测试')).resolves.toEqual({
      ok: false,
      kind: 'error',
      error: 'null',
    });
  });

  it('★ **先到先得**：结果已到后超时不再改写（`settled` 闸）', async () => {
    vi.useFakeTimers();
    const p = withTimeout(Promise.resolve('先到'), 1000, '测试');
    await vi.advanceTimersByTimeAsync(5000); // 远超时
    await expect(p).resolves.toEqual({ ok: true, value: '先到' });
  });

  it('★ 超时后结果才到 ⇒ 不再改写（同一闸的反向）', async () => {
    vi.useFakeTimers();
    let release: (v: string) => void = () => undefined;
    const slow = new Promise<string>((r) => {
      release = r;
    });
    const p = withTimeout(slow, 1000, '测试');
    await vi.advanceTimersByTimeAsync(1000);
    release('迟到的结果');
    await expect(p).resolves.toEqual({ ok: false, kind: 'timeout', error: '测试超时（1s）' });
  });

  it('可直接传值（非 Promise）', async () => {
    await expect(withTimeout('直接值', 1000, '测试')).resolves.toEqual({ ok: true, value: '直接值' });
  });
});
