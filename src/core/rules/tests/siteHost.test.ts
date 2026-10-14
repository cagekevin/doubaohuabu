/**
 * 站点域名归属判定单测（渲染侧唯一实现，口径同主进程 `electron/site-hosts.js` 层 2）
 *
 * 断言红线（**实现一变必红**）：
 *   ① **子域要认**（`www.x` / `a.b.x` 都算），**近名要拒**（`evillovart.ai` 这种没有边界点的
 *      必须拒 —— 那正是 `TD-05-12` 里 `/lovart\.ai$/i` 漏的那件事）；
 *   ② 归一化三条：`www.` 前缀 / **尾点** / 大小写；
 *   ③ 未登记的站点 ⇒ `false`（**不编默认值**）。
 *
 * ⚠️ **域名的值不重抄**（值真源 = `constants/siteHosts`）：正向用例从真源**派生**，
 *    只有"近名"这类**负向夹具**才写字面量（它们考的是规则，不是某个站点的域名）。
 */
import { describe, expect, it } from 'vitest';
import { SITE_HOSTS } from '@/constants/siteHosts';
import type { SiteType } from '@/constants/siteTypes';
import { isHostOfSite } from '../siteHost';

/** 真源里登记的全部「(站点, 主域)」对 —— 派生，不重抄 */
const ALL_BASES: ReadonlyArray<readonly [SiteType, string]> = Object.entries(SITE_HOSTS).flatMap(
  ([site, bases]) => bases.map((base) => [site as SiteType, base] as const),
);

describe('isHostOfSite（渲染侧站点归属判定）', () => {
  it('★ 每个登记的主域：自身 / 带 `www.` / 任意子域 都认', () => {
    expect(ALL_BASES.length).toBeGreaterThanOrEqual(4);
    for (const [site, base] of ALL_BASES) {
      expect(isHostOfSite(base, site)).toBe(true);
      expect(isHostOfSite(`www.${base}`, site)).toBe(true);
      expect(isHostOfSite(`p3.deep.${base}`, site)).toBe(true);
    }
  });

  it('★ 近名要拒（边界是子域规则里那个点）', () => {
    expect(isHostOfSite('evillovart.ai', 'lovart')).toBe(false);
    expect(isHostOfSite('xdoubao.com', 'doubao')).toBe(false);
    expect(isHostOfSite('doubao.com.evil.test', 'doubao')).toBe(false);
    expect(isHostOfSite('not-tapnow.media.evil.test', 'tapnow')).toBe(false);
  });

  it('★ 归一化三条：`www.` 前缀 · 尾点 · 大小写', () => {
    expect(isHostOfSite('WWW.DouBao.COM.', 'doubao')).toBe(true);
    expect(isHostOfSite('sub.TAPNOW.MEDIA.', 'tapnow')).toBe(true);
  });

  it('★ 站点间不串：一个域的判定只看它自己的站点', () => {
    for (const [site, base] of ALL_BASES) {
      const other: SiteType = site === 'lovart' ? 'tapnow' : 'lovart';
      expect(isHostOfSite(base, other)).toBe(false);
    }
  });

  it('未登记的站点 / 空 / 非字符串 ⇒ `false`（不认识就是 false）', () => {
    expect(isHostOfSite('doubao.com', 'gpt')).toBe(false);
    expect(isHostOfSite('doubao.com', 'other')).toBe(false);
    expect(isHostOfSite('', 'doubao')).toBe(false);
    expect(isHostOfSite(null, 'doubao')).toBe(false);
    expect(isHostOfSite(undefined, 'doubao')).toBe(false);
    expect(isHostOfSite(42, 'doubao')).toBe(false);
  });
});
