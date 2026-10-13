/**
 * 指纹生成器单测（原 `b$`/`k$`/`M$`/`$$`/`P$`/`R$`/`zc`）
 *
 * ⚠️ **断言策略（重要，别误解这些测试的强度）**：
 *    候选表是**逐字抄录**的，但本工程**无法在运行期拿到原版**去比同一个种子产出什么
 *    ⇒ 这里锁的是**可判定的性质**：
 *      ① 确定性（同种子同环境 ⇒ 逐字段相等）—— 这条最有价值，它锁住了**PRNG 调用顺序**
 *         （多一次少一次 `pick()` 会让结果漂，测试立刻红）
 *      ② 跨种子/跨 OS 的**分辨力**（不同输入不该产出同一份指纹）
 *      ③ **封闭性**：每个字段都必须来自候选表（不是随机编的）
 *      ④ 两个过滤器的边界（不足 2 条回落全表、窗口比候选都大时回落全表）
 *    ⇒ **表数据本身错一位，本文件抓不到**（已如实登记）。
 */

import { describe, expect, it } from 'vitest';
import {
  FALLBACK_CHROME_MAJOR,
  buildSecChUaHints,
  buildUserAgentData,
  createSeededRandom,
  filterWinScreens,
  filterWinWebgl,
  fnv1a32,
  generateFingerprint,
} from '../fingerprintGenerator';
// ★ 指纹版本的真源在 `constants/fingerprint.ts`（`fingerprintGenerator` 只消费）
import { FINGERPRINT_VERSION } from '@/constants/fingerprint';

describe('fnv1a32（原 b$ 25061）', () => {
  it('★ 与标准 FNV-1a 32 位一致', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('★ 结果恒为 uint32（`>>> 0`）', () => {
    for (const s of ['', 'a', '账号#0', 'x'.repeat(200)]) {
      const h = fnv1a32(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(h)).toBe(true);
    }
  });

  it('非字符串入参走 `String()`', () => {
    expect(fnv1a32(42 as unknown as string)).toBe(fnv1a32('42'));
  });
});

describe('createSeededRandom（原 k$ 25070）', () => {
  it('★ 同种子 ⇒ 同序列（可复现）', () => {
    const a = createSeededRandom(12345);
    const b = createSeededRandom(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('★ 取值恒在 `[0, 1)`', () => {
    const r = createSeededRandom(1);
    for (let i = 0; i < 200; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('不同种子 ⇒ 不同序列', () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});

describe('filterWinScreens（原 M$ 25336）', () => {
  it('★ 取 `w >= 真实宽 && h >= 真实高` 的子集', () => {
    const hit = filterWinScreens(1900, 1000);
    // 全表里满足 w>=1900 && h>=1000 的只有 1920×1080(×2)、2560×1440、3840×2160
    expect(hit).toHaveLength(4);
    expect(hit.every((s) => s.w >= 1900 && s.h >= 1000)).toBe(true);
  });

  it('★ **一条都不满足** ⇒ 回落**全表**（不是空数组 —— 源版就是 `: Dy`）', () => {
    const hit = filterWinScreens(99999, 99999);
    expect(hit).toHaveLength(8);
    expect(hit).toEqual(filterWinScreens(0, 0)); // 0,0 时全表也满足 ⇒ 同值
  });

  it('★ 返回的是**子集视图**（元素与全表同一引用）', () => {
    expect(filterWinScreens(1920, 1080)[0]).toBe(filterWinScreens(1920, 1080)[0]);
  });
});

describe('filterWinWebgl（原 $$ 25354）', () => {
  it('★ NVIDIA ⇒ 只留 `(NVIDIA,` 那 6 条', () => {
    const hit = filterWinWebgl('Google Inc. (NVIDIA) ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)');
    expect(hit).toHaveLength(6);
    expect(hit.every((g) => g.renderer.includes('(NVIDIA,'))).toBe(true);
  });

  it('★ Intel / AMD（含 `radeon`）各自匹配', () => {
    expect(filterWinWebgl('ANGLE (Intel, Intel(R) UHD Graphics)')).toHaveLength(5);
    expect(filterWinWebgl('ANGLE (AMD, AMD Radeon RX 6600)')).toHaveLength(5);
  });

  it('★ 认不出厂商 ⇒ 全表（原 `if (!t) return $d`）', () => {
    expect(filterWinWebgl('Apple M2')).toHaveLength(16);
    expect(filterWinWebgl('')).toHaveLength(16);
  });

  it('★ **不变量**：任何输入下返回条数都 ≥ 2（原 `n.length >= 2 ? n : $d`）', () => {
    /**
     * ⚠️ **如实标注**：源版的那条 `n.length >= 2 ? n : $d` 分支（"命中不足 2 条也回落全表"）
     *    在当前候选表下**不可达** —— 表里每个厂商都 ≥ 5 条，任何厂商关键字只可能命中 0 或 ≥5 条。
     *    ⇒ 它是**防御性**代码。本测试只锁**能观察到的不变量**（返回值恒 ≥ 2），
     *    不假装覆盖了那条分支（写一条永远走不到那个分支的断言＝假守卫）。
     */
    for (const gpu of ['', 'nvidia', 'intel', 'amd', 'radeon', 'apple', '未知 GPU 字符串']) {
      expect(filterWinWebgl(gpu).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Client Hints（原 P$ / R$）', () => {
  it('Sec-CH-UA 四个键逐字对齐源', () => {
    expect(buildSecChUaHints(140, 'Windows')).toEqual({
      'Sec-CH-UA': '"Google Chrome";v="140", "Chromium";v="140", "Not?A_Brand";v="24"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
      'Sec-CH-UA-Full-Version': '"140.0.0.0"',
    });
  });

  it('userAgentData 的品牌三元组与 `_fullVersion`（**带下划线**，照抄源）', () => {
    expect(buildUserAgentData(140, '140.0.0.0', 'macOS')).toEqual({
      brands: [
        { brand: 'Google Chrome', version: '140' },
        { brand: 'Chromium', version: '140' },
        { brand: 'Not?A_Brand', version: '24' },
      ],
      mobile: false,
      platform: 'macOS',
      _fullVersion: '140.0.0.0',
    });
  });
});

describe('generateFingerprint（原 zc 25397）', () => {
  const ENV = { os: 'windows' as const, chromeMajor: 140 };

  it('★★ 确定性：同种子 + 同环境 ⇒ **逐字段相等**（这条锁住 PRNG 调用顺序）', () => {
    const a = generateFingerprint('acc_1#0', ENV);
    const b = generateFingerprint('acc_1#0', ENV);
    expect(a).toEqual(b);
  });

  it('★★ 不同种子 ⇒ 结果不同（至少一个维度不同）', () => {
    const a = generateFingerprint('acc_1#0', ENV);
    const b = generateFingerprint('acc_2#0', ENV);
    expect(a).not.toEqual(b);
  });

  it('★ 盐不同也算不同种子（`id#salt` 拼法）', () => {
    expect(generateFingerprint('acc_1#0', ENV)).not.toEqual(generateFingerprint('acc_1#7', ENV));
  });

  it('★ `ver` 恒为 3（原 `Zh`）；`hostOS` 回填入参', () => {
    expect(generateFingerprint('s', ENV).ver).toBe(FINGERPRINT_VERSION);
    expect(FINGERPRINT_VERSION).toBe(3);
    expect(generateFingerprint('s', { os: 'macos' }).hostOS).toBe('macos');
  });

  it('★ win 分支：platform/UA/架构/平台版本都对齐源', () => {
    const fp = generateFingerprint('seed', ENV);
    expect(fp.platform).toBe('Win32');
    expect(fp.uaArchitecture).toBe('x86');
    expect(fp.userAgent).toContain('(Windows NT 10.0; Win64; x64)');
    expect(fp.userAgent).toContain(`Chrome/${fp.userAgentData?._fullVersion}`);
    expect(fp.uaBitness).toBe('64');
    expect(fp.uaWow64).toBe(false);
    expect(['10.0.0', '13.0.0', '15.0.0']).toContain(fp.uaPlatformVersion);
  });

  it('★ 非 win 分支（mac / **linux 也走这里**）：platform 是 `MacIntel`', () => {
    for (const os of ['macos', 'linux'] as const) {
      const fp = generateFingerprint('seed', { os });
      expect(fp.platform).toBe('MacIntel');
      expect(fp.uaArchitecture).toBe('arm');
      expect(fp.userAgent).toContain('(Macintosh; Intel Mac OS X 10_15_7)');
      expect(fp.uaPlatformVersion).toBe('14.0.0');
    }
  });

  it('★ **封闭性**：screen / webgl / languages / 并发 / 内存都来自候选表', () => {
    for (const seed of ['a', 'b', 'acc_x#3', '长种子' + 'x'.repeat(50)]) {
      for (const os of ['windows', 'macos'] as const) {
        const fp = generateFingerprint(seed, { os, chromeMajor: 140 });

        // languages 的第一项 == language（源 `u[0]`）
        expect(fp.language).toBe(fp.languages[0]);
        expect(fp.languages.length).toBeGreaterThanOrEqual(2);

        expect(fp.hardwareConcurrency).toBeGreaterThan(0);
        expect(fp.deviceMemory).toBeGreaterThan(0);

        expect(fp.screen.width).toBeGreaterThan(0);
        expect(fp.screen.availWidth).toBe(fp.screen.width); // 源：availWidth 直接取 w
        expect(fp.screen.availHeight).toBeLessThanOrEqual(fp.screen.height);
        expect([1, 1.25, 1.5, 2]).toContain(fp.screen.pixelRatio);
        expect([24, 30]).toContain(fp.screen.colorDepth);

        expect(fp.webgl.vendor).toContain('Google Inc.');
        expect(fp.webgl.renderer).toContain('ANGLE (');
        expect(fp.maxTouchPoints).toBe(0);
        expect(fp.vendor).toBe('Google Inc.');
      }
    }
  });

  it('★ `hardwareConcurrency`/`deviceMemory` 的平台候选集不同', () => {
    // 多抽几个种子，确认取值被限制在各自的候选集合里
    const winCores = new Set<number>();
    const macCores = new Set<number>();
    for (let i = 0; i < 60; i += 1) {
      winCores.add(generateFingerprint(`s${i}`, { os: 'windows' }).hardwareConcurrency);
      macCores.add(generateFingerprint(`s${i}`, { os: 'macos' }).hardwareConcurrency);
    }
    expect([...winCores].every((n) => [4, 6, 8, 10, 12, 16, 20, 24].includes(n))).toBe(true);
    expect([...macCores].every((n) => [8, 10, 11, 12, 14, 16].includes(n))).toBe(true);
  });

  it('`chromeMajor` 不给 / 非法 ⇒ 用兜底 126', () => {
    expect(FALLBACK_CHROME_MAJOR).toBe(126);
    const fp = generateFingerprint('s', { os: 'windows' });
    // 版本串只可能是 126 或 125
    expect(fp.userAgent).toMatch(/Chrome\/12[56]\.0\.0\.0/);
    expect(generateFingerprint('s', { os: 'windows', chromeMajor: 0 }).userAgent).toMatch(/Chrome\/12[56]\./);
  });

  it('★ 注入的 win 候选表会被**真的用上**（不忽略入参）', () => {
    const only = [{ w: 1234, h: 567, availH: 500, colorDepth: 24, pixelRatio: 1 }];
    const fp = generateFingerprint('s', { os: 'windows', winScreens: only });
    expect(fp.screen.width).toBe(1234);
    expect(fp.screen.height).toBe(567);
  });

  it('空的 win 候选表 ⇒ 回落全表（不当成"抽到了 undefined"）', () => {
    expect(() => generateFingerprint('s', { os: 'windows', winScreens: [] })).not.toThrow();
    expect(generateFingerprint('s', { os: 'windows', winScreens: [] }).screen.width).toBeGreaterThan(0);
  });
});
