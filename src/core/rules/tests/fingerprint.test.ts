/**
 * 跨账号指纹关联扫描单测（原 `zk`）
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  COLLISION_LEVEL_LABEL,
  comparePair,
  FINGERPRINT_DIMENSIONS,
  scanFingerprintCollisions,
} from '../fingerprint';
import type { Account, Fingerprint } from '@/stable/model/account';

/** 造指纹：默认 7 维齐备 */
const fp = (over: Partial<Fingerprint> = {}): Fingerprint => ({
  ver: 3,
  hostOS: 'windows',
  userAgent: 'UA-A',
  appVersion: '1',
  platform: 'Win32',
  vendor: 'Google',
  language: 'zh-CN',
  languages: ['zh-CN', 'zh'],
  timezone: 'Asia/Shanghai',
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelRatio: 1 },
  webgl: { vendor: 'Google', renderer: 'ANGLE (NVIDIA)' },
  hardwareConcurrency: 8,
  deviceMemory: 8,
  maxTouchPoints: 0,
  ...over,
});

const acc = (id: string, fingerprint?: Fingerprint): Account => ({
  id,
  name: id,
  type: 'doubao',
  status: '已登录',
  partition: `persist:${id}`,
  addedAt: 0,
  groupId: null,
  autoStart: false,
  fpSalt: 0,
  ...(fingerprint ? { fingerprint } : {}),
});

describe('维度表（原 `Jl`）', () => {
  it('★ 恰好 7 维，顺序与源码一致', () => {
    expect(FINGERPRINT_DIMENSIONS).toHaveLength(7);
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

  it('★ 分辨率拼接格式：`宽×高@像素比x`', () => {
    const dim = FINGERPRINT_DIMENSIONS.find((d) => d.label === '分辨率')!;
    expect(dim.get(fp())).toBe('1920×1080@1x');
  });

  it('★ 语言用 `languages` 逗号连接（不是 `language`）', () => {
    const dim = FINGERPRINT_DIMENSIONS.find((d) => d.label === '语言')!;
    expect(dim.get(fp())).toBe('zh-CN, zh');
  });
});

describe('comparePair', () => {
  it('★ 全 7 维相同 → critical，ratio = 1', () => {
    const r = comparePair(fp(), fp());
    expect(r.level).toBe('critical');
    expect(r.dims).toHaveLength(7);
    expect(r.ratio).toBe(1);
  });

  it('★ 5/7 ≈ 71% → warn（≥70%）', () => {
    const b = fp({ timezone: 'America/New_York', hardwareConcurrency: 16 });
    const r = comparePair(fp(), b);
    expect(r.dims).toHaveLength(5);
    expect(r.ratio).toBeCloseTo(5 / 7);
    expect(r.level).toBe('warn');
  });

  it('★ 4/7 ≈ 57% → ok（不报）', () => {
    const b = fp({ timezone: 'America/New_York', hardwareConcurrency: 16, deviceMemory: 16 });
    const r = comparePair(fp(), b);
    expect(r.dims).toHaveLength(4);
    expect(r.level).toBe('ok');
  });

  it('★ 恰好 4.9/7 边界：需要 ≥ 0.7 ⇒ 至少 5 维', () => {
    // 4 维 = 0.571 → ok；5 维 = 0.714 → warn
    const four = comparePair(fp(), fp({ timezone: 'X', hardwareConcurrency: 1, deviceMemory: 1 }));
    expect(four.level).toBe('ok');
    const five = comparePair(fp(), fp({ timezone: 'X', hardwareConcurrency: 1 }));
    expect(five.level).toBe('warn');
  });

  it('★ 空值维度不参与比较（`null` / `""`）', () => {
    const a = fp({ userAgent: '' });
    const b = fp({ userAgent: 'DIFFERENT' });
    const r = comparePair(a, b);
    // UA 为空 → 不参与 ⇒ 只剩 6 维可比，且这 6 维全同
    expect(r.dims).toHaveLength(6);
    expect(r.dims).not.toContain('User-Agent');
    // 6/7 = 0.857 → warn（不是 critical，因为 total 仍是 7）
    expect(r.level).toBe('warn');
  });

  it('★ 全维空 → ok（没有可比的维度）', () => {
    const empty = fp({ userAgent: '', timezone: '', languages: [], screen: undefined as never, webgl: undefined as never, hardwareConcurrency: undefined as never, deviceMemory: undefined as never });
    expect(comparePair(empty, empty).level).toBe('ok');
  });
});

describe('scanFingerprintCollisions（原 `zk`）', () => {
  it('★ 无指纹账号被跳过并计入 missing', () => {
    const r = scanFingerprintCollisions([acc('a', fp()), acc('b')]);
    expect(r.compared).toBe(1);
    expect(r.missing).toBe(1);
    expect(r.pairs).toEqual([]);
  });

  it('★ 两两组合（C(3,2) = 3 对）', () => {
    const r = scanFingerprintCollisions([acc('a', fp()), acc('b', fp()), acc('c', fp())]);
    expect(r.pairs).toHaveLength(3);
    expect(r.pairs.every((p) => p.level === 'critical')).toBe(true);
  });

  it('★ 只有重合的对才进 pairs', () => {
    const r = scanFingerprintCollisions([
      acc('a', fp()),
      acc('b', fp()), // 与 a 全同 → critical
      acc('c', fp({ timezone: 'X', hardwareConcurrency: 1, deviceMemory: 1, userAgent: 'UA-C' })), // 与 a 只 3 维 → ok
    ]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.aId).toBe('a');
    expect(r.pairs[0]!.bId).toBe('b');
  });

  it('★ 维度分布：distinct = 不同取值个数', () => {
    const r = scanFingerprintCollisions([
      acc('a', fp({ timezone: 'Asia/Shanghai' })),
      acc('b', fp({ timezone: 'Asia/Shanghai' })),
      acc('c', fp({ timezone: 'America/New_York' })),
    ]);
    const tz = r.spread.find((s) => s.label === '时区')!;
    expect(tz.distinct).toBe(2);
    const ua = r.spread.find((s) => s.label === 'User-Agent')!;
    expect(ua.distinct).toBe(1); // 三个账号 UA 都一样 ⇒ 容易被关联
  });

  it('★ pair 带上双方 id / name / dims / ratio', () => {
    const r = scanFingerprintCollisions([acc('a', fp()), acc('b', fp({ timezone: 'X', hardwareConcurrency: 1 }))]);
    expect(r.pairs).toHaveLength(1);
    const p = r.pairs[0]!;
    expect(p.aName).toBe('a');
    expect(p.bName).toBe('b');
    expect(p.dims).not.toContain('时区');
    expect(p.ratio).toBeCloseTo(5 / 7);
    expect(p.level).toBe('warn');
  });

  it('空数组 → 全零，不崩', () => {
    const r = scanFingerprintCollisions([]);
    expect(r.pairs).toEqual([]);
    expect(r.compared).toBe(0);
    expect(r.missing).toBe(0);
    expect(r.spread).toHaveLength(7);
    expect(r.spread.every((s) => s.distinct === 0)).toBe(true);
  });
});

describe('分级文案（原 `DP.jsx`）', () => {
  it('★ 三级文案', () => {
    expect(COLLISION_LEVEL_LABEL.ok).toContain('未检测到');
    expect(COLLISION_LEVEL_LABEL.critical).toContain('完全关联');
    expect(COLLISION_LEVEL_LABEL.warn).toContain('高度相似');
  });
});
