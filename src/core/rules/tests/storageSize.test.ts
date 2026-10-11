import { describe, expect, it } from 'vitest';
import { formatStorageSize } from '../storageSize';

/**
 * 断言锚 = **源 `Mt`（`_Component42.jsx:215-235`）的三个档位边界**，不是"看起来合理"。
 * ⚠️ 与 `downloadNode.formatBytes` 的**故意不同**：那套无 GB 档、B 档整数；本套 GB 档是
 *    "两位/一位小数"（**没有取整档**）—— 这里把差异也钉住。
 */
describe('formatStorageSize（原 `Mt`）', () => {
  it('null / undefined / 非有限数 / 负数 ⇒ **空串**（源 `return \'\'`）', () => {
    expect(formatStorageSize(null)).toBe('');
    expect(formatStorageSize(undefined)).toBe('');
    expect(formatStorageSize(Number.NaN)).toBe('');
    expect(formatStorageSize(Number.POSITIVE_INFINITY)).toBe('');
    expect(formatStorageSize(-1)).toBe('');
  });

  it('B 档（<1024）：**整数无小数** —— 含 `0 B`（与 `formatBytes(0)⇒空串` 不同）', () => {
    expect(formatStorageSize(0)).toBe('0 B');
    expect(formatStorageSize(1)).toBe('1 B');
    expect(formatStorageSize(1023)).toBe('1023 B');
  });

  it('KB 档：`<10` 两位小数 · `<100` 一位 · 其余取整', () => {
    expect(formatStorageSize(1024)).toBe('1.00 KB');
    expect(formatStorageSize(1024 * 10)).toBe('10.0 KB');
    expect(formatStorageSize(1024 * 99)).toBe('99.0 KB');
    expect(formatStorageSize(1024 * 100)).toBe('100 KB');
    expect(formatStorageSize(1024 * 512)).toBe('512 KB');
  });

  it('MB 档：同 KB 三档', () => {
    expect(formatStorageSize(1024 * 1024)).toBe('1.00 MB');
    expect(formatStorageSize(1024 * 1024 * 10)).toBe('10.0 MB');
    expect(formatStorageSize(1024 * 1024 * 100)).toBe('100 MB');
  });

  it('★ GB 档：`<10` 两位小数，**其余一位小数（不取整）** —— 与 KB/MB 有意不同', () => {
    expect(formatStorageSize(1024 ** 3)).toBe('1.00 GB');
    expect(formatStorageSize(1024 ** 3 * 9.5)).toBe('9.50 GB');
    expect(formatStorageSize(1024 ** 3 * 10)).toBe('10.0 GB');
    expect(formatStorageSize(1024 ** 3 * 100)).toBe('100.0 GB'); // ← 取整的话会是 "100 GB"
  });
});
