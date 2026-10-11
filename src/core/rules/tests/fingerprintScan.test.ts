/**
 * 指纹撞车体检单测（原 `zk` 34300 / `Jl` 34253 / `UP` 34366）
 *
 * 断言红线（**实现一变必红**）：
 *   ① `totalPairs` 是**组合数** `n(n-1)/2`（**0 撞车时仍然很大**）；
 *   ② 分级：**全命中 ⇒ `critical` 先判**（否则 1.0 会落进 `warn`）、`>= 0.7` ⇒ `warn`、
 *      **命中 0 维不入列表**（但 `totalPairs` 照算）；
 *   ③ 空串 / `null` **都不算取值** ⇒「两边都没填」不算命中（`分辨率` 缺失时返回空串正是这个用途）；
 *   ④ 维度表的**七条**与逐条取值方式（尤其「语言」是 `join(', ')` 成一个串）。
 */

import { describe, expect, it } from 'vitest';
import {
  FINGERPRINT_DIMENSIONS,
  formatScanAge,
  scanFingerprintCollisions,
  type FingerprintShape,
  type ScannableAccount,
} from '../fingerprintScan';

/** 一个"完整"的指纹（七维齐全） */
const full = (patch: Partial<FingerprintShape> = {}): FingerprintShape => ({
  userAgent: 'UA-A',
  timezone: 'Asia/Shanghai',
  languages: ['zh-CN', 'en'],
  screen: { width: 1920, height: 1080, pixelRatio: 1 },
  webgl: { renderer: 'Apple M1' },
  hardwareConcurrency: 8,
  deviceMemory: 8,
  ...patch,
});

const acc = (id: string, name: string, fingerprint?: FingerprintShape | null): ScannableAccount => ({
  id,
  name,
  ...(fingerprint === undefined ? {} : { fingerprint }),
});

const DIM_TOTAL = FINGERPRINT_DIMENSIONS.length; // 7
const NOW = 1_700_000_000_000;

describe('FINGERPRINT_DIMENSIONS（原 `Jl` 34253）', () => {
  it('★ 恰好 **7** 个维度，label 逐字', () => {
    expect(DIM_TOTAL).toBe(7);
    expect(FINGERPRINT_DIMENSIONS.map((d) => d.label)).toEqual([
      'User-Agent',
      '时区',
      '语言',
      '分辨率',
      'WebGL 渲染器',
      '并发核数',
      '内存',
    ]);
  });

  it('★ 「语言」是 `join(\', \')` 成**一个串**（顺序不同 ⇒ 视为不同值）', () => {
    const lang = FINGERPRINT_DIMENSIONS.find((d) => d.key === 'lang')!;
    expect(lang.get({ languages: ['zh-CN', 'en'] })).toBe('zh-CN, en');
    expect(lang.get({ languages: [] })).toBe('');
    expect(lang.get({})).toBe('');
  });

  it('★ 「分辨率」拼成 `W×H@PRx`；`screen` 缺失 ⇒ **空串**', () => {
    const screen = FINGERPRINT_DIMENSIONS.find((d) => d.key === 'screen')!;
    expect(screen.get({ screen: { width: 1920, height: 1080, pixelRatio: 2 } })).toBe('1920×1080@2x');
    expect(screen.get({ screen: null })).toBe('');
    expect(screen.get({})).toBe('');
  });
});

describe('scanFingerprintCollisions（原 `zk` 34300）', () => {
  it('★ 只算**带指纹**的账号；`noFp` = 总数 − 带指纹数', () => {
    const r = scanFingerprintCollisions([acc('1', '甲', full()), acc('2', '乙'), acc('3', '丙')]);
    expect(r.withFpCount).toBe(1);
    expect(r.noFp).toBe(2);
  });

  it('★★ 空/缺省入参 ⇒ 一份空报告（不抛）；⚠️ 且 `totalPairs` 是 **`-0`**', () => {
    const r = scanFingerprintCollisions([]);
    expect(r.withFpCount).toBe(0);
    expect(r.noFp).toBe(0);
    expect(r.pairs).toEqual([]);
    /**
     * ⚠️ **真发现**：`0 * (0 - 1) / 2` 在 JS 里得到 **`-0`**（不是 `0`）—— 源版同样如此。
     *   `-0 === 0` 为真，但 `Object.is(-0, 0)` 为假（`toBe`/`toMatchObject` 用的是后者）
     *   ⇒ 第一版我写 `toMatchObject({totalPairs: 0})` 就是被这里绊住的。
     * ⚠️ 对下游**无害**：签名是模板串，`` `${-0}` `` 会变成 `'0'` ✓。故**不改实现**（照抄源头行为），
     *   只在此锁住这个事实。
     */
    expect(Object.is(r.totalPairs, -0)).toBe(true);
    expect(r.totalPairs === 0).toBe(true);
    expect(scanFingerprintCollisions(null).pairs).toEqual([]);
  });

  it('★★ 两个**完全一致**的指纹 ⇒ `critical`，`matched` 是**全部 7 个 label**', () => {
    const r = scanFingerprintCollisions([acc('1', '甲', full()), acc('2', '乙', full())]);
    expect(r.critical).toBe(1);
    expect(r.warn).toBe(0);
    expect(r.pairs[0]).toMatchObject({ a: '甲', b: '乙', aId: '1', bId: '2', level: 'critical' });
    expect(r.pairs[0]!.matched).toHaveLength(DIM_TOTAL);
  });

  it('★★ 命中比例 **>= 0.7** ⇒ `warn`（7 维里命中 5 = 0.714）', () => {
    const a = full();
    // 改掉两维（语言、内存）⇒ 命中 5/7 ≈ 0.714
    const b = full({ languages: ['ja'], deviceMemory: 16 });
    const r = scanFingerprintCollisions([acc('1', '甲', a), acc('2', '乙', b)]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.level).toBe('warn');
    expect(r.pairs[0]!.matched).toHaveLength(5);
  });

  it('★ 命中比例 **< 0.7** ⇒ **不入列表**（但 `totalPairs` 照算）', () => {
    // 只留 UA 相同（命中 1/7 ≈ 0.14）
    const a = full();
    const b = full({
      timezone: 'UTC',
      languages: ['ja'],
      screen: { width: 800, height: 600, pixelRatio: 1 },
      webgl: { renderer: '别的' },
      hardwareConcurrency: 4,
      deviceMemory: 16,
    });
    const r = scanFingerprintCollisions([acc('1', '甲', a), acc('2', '乙', b)]);
    expect(r.pairs).toEqual([]);
    expect(r.critical).toBe(0);
    expect(r.warn).toBe(0);
    expect(r.totalPairs).toBe(1); // ⚠️ 组合数照算
  });

  it('★★ **`totalPairs` 是组合数**（3 个参检 ⇒ 3 对；0 撞车时仍是 3）', () => {
    const accounts = [acc('1', '甲', full()), acc('2', '乙', full()), acc('3', '丙', full())];
    const r = scanFingerprintCollisions(accounts);
    expect(r.totalPairs).toBe(3);
    expect(r.pairs).toHaveLength(3); // 两两都全命中
    // 5 个 ⇒ 10 对
    const five = Array.from({ length: 5 }, (_, i) => acc(String(i), `a${i}`, full()));
    expect(scanFingerprintCollisions(five).totalPairs).toBe(10);
  });

  it('★★ 空串 / `null` **都不算取值** ⇒「两边都没填」**不算命中**', () => {
    // 两个账号都缺 screen（⇒ 该维返回空串）与 webgl
    const a = full({ screen: null, webgl: null });
    const b = full({ screen: null, webgl: null });
    const r = scanFingerprintCollisions([acc('1', '甲', a), acc('2', '乙', b)]);
    // 7 维里只有这 2 维"都没填" ⇒ 命中 5 ⇒ warn（**不是** critical）
    expect(r.pairs[0]!.level).toBe('warn');
    expect(r.pairs[0]!.matched).not.toContain('分辨率');
    expect(r.pairs[0]!.matched).not.toContain('WebGL 渲染器');
  });

  it('★ `dimDistinct`：每维**非空取值的种类数**', () => {
    const r = scanFingerprintCollisions([
      acc('1', '甲', full({ deviceMemory: 8 })),
      acc('2', '乙', full({ deviceMemory: 16 })),
      acc('3', '丙', full({ deviceMemory: 8 })),
    ]);
    const mem = r.dimDistinct.find((d) => d.label === '内存')!;
    expect(mem.distinct).toBe(2); // 8 / 16
    const ua = r.dimDistinct.find((d) => d.label === 'User-Agent')!;
    expect(ua.distinct).toBe(1); // 都一样
  });

  it('★ `dimDistinct` 与 `pairs` 的长度互不影响（一维只有一种取值 ⇒ 那维对每对都命中）', () => {
    const r = scanFingerprintCollisions([acc('1', '甲', full()), acc('2', '乙', full())]);
    expect(r.dimDistinct).toHaveLength(DIM_TOTAL);
    expect(r.dimDistinct.every((d) => d.distinct === 1)).toBe(true);
  });

  it('★ `pairs` 顺序可复现：`a` 总是数组里靠前的那个', () => {
    const r = scanFingerprintCollisions([acc('1', '甲', full()), acc('2', '乙', full()), acc('3', '丙', full())]);
    expect(r.pairs.map((p) => `${p.a}-${p.b}`)).toEqual(['甲-乙', '甲-丙', '乙-丙']);
  });

  it('★ `critical` / `warn` 是**各自计数**（不是列表长度之和）', () => {
    const r = scanFingerprintCollisions([
      acc('1', '甲', full()),
      acc('2', '乙', full()), // 与甲 critical
      acc('3', '丙', full({ languages: ['ja'], deviceMemory: 16 })), // 与甲/乙 命中 5 ⇒ warn
    ]);
    expect(r.critical).toBe(1);
    expect(r.warn).toBe(2);
    expect(r.pairs).toHaveLength(3);
  });

  it('★ 维度表可注入（默认七维；传空表 ⇒ 什么都命中不了）', () => {
    const r = scanFingerprintCollisions([acc('1', '甲', full()), acc('2', '乙', full())], []);
    expect(r.pairs).toEqual([]);
    expect(r.totalPairs).toBe(1);
    expect(r.dimDistinct).toEqual([]);
  });
});

describe('formatScanAge（原 `UP` 34366）', () => {
  it('★ 五档：刚刚 / 分钟 / 小时 / 天 / 日期', () => {
    expect(formatScanAge(NOW - 30_000, NOW)).toBe('刚刚'); // < 1 分钟
    expect(formatScanAge(NOW - 5 * 60_000, NOW)).toBe('5 分钟前');
    expect(formatScanAge(NOW - 3 * 3_600_000, NOW)).toBe('3 小时前');
    expect(formatScanAge(NOW - 2 * 86_400_000, NOW)).toBe('2 天前');
  });

  it('★ 各档都是 `Math.floor`（59.9 分钟仍是「59 分钟前」）', () => {
    expect(formatScanAge(NOW - (59 * 60_000 + 59_000), NOW)).toBe('59 分钟前');
    expect(formatScanAge(NOW - 23 * 3_600_000 - 3_599_000, NOW)).toBe('23 小时前');
  });

  it('★ **>= 30 天** ⇒ `YYYY-MM-DD`（本地时区、月日补零）', () => {
    const ts = new Date(2026, 0, 5, 12, 0, 0).getTime();
    const later = ts + 31 * 86_400_000;
    expect(formatScanAge(ts, later)).toMatch(/^2026-01-05$/);
  });

  it('⚠️ **`ts` 在未来** ⇒ 负数 ⇒ 落进「刚刚」（源版如此，照抄）', () => {
    expect(formatScanAge(NOW + 60_000, NOW)).toBe('刚刚');
  });
});
