/**
 * 站点能力表 —— ★ **手工档的唯一防线**
 *
 * ⚠️ **为什么必须有这个文件**（2026-10-14 核验实证）：`SITE_CAPS` 是**人工填的档**
 *    （每格对着源行号或改前行为），而它的 12 个字段里 **11 个此前零测试覆盖** ——
 *    也就是说把 `lovart.hasChromeSession` 填成 `false` ⇒ `tsc` 不红、测试不红、
 *    只是**静默**少了会话条。**手工档 + 零断言 = 改错无人知。**
 *
 * ★ **本文件的期望值一律砸「字面量」**（按源 / 按改前行为写死），
 *   **不拿表自己的字段拼期望值** —— 后者是自证式（表被改它照样绿）。
 *   ⇒ 表改一格、或派生视图漂一格，这里就红。
 */
import { describe, expect, it } from 'vitest';
import { SITE_TYPES } from '@/stable/model/account';
import { NEW_IMAGES_SITES } from '../accountPick';
import { GALLERY_SITES, isGallerySite } from '../lovartGallery';
import { CHROME_SESSION_SITES, isChromeSessionSite } from '../lovartSession';
import { SITE_CAPS, capsOf, needsSessionPrep, siteTypesWhere } from '../siteCaps';

describe('站点能力表 · 结构', () => {
  it('六个站点一个不少（键集 = SITE_TYPES，且顺序一致）', () => {
    expect(Object.keys(SITE_CAPS)).toEqual([...SITE_TYPES]);
  });

  it('未知 / 空类型按**既有归一**（未知 ⇒ 与 doubao 同档，不另立兜底）', () => {
    expect(capsOf('')).toEqual(SITE_CAPS.doubao);
    expect(capsOf('not-a-site')).toEqual(SITE_CAPS.doubao);
  });
});

describe('关键档位（改一格必红）', () => {
  it('无水印**按钮**：只有 doubao / dola（源 `_Component43.jsx:3255-3261` 的 `dola‖doubao`）', () => {
    expect(siteTypesWhere((c) => c.hasWatermarkButton)).toEqual(['doubao', 'dola']);
  });

  it('无水印**面板**允许它出现的是"除 lovart 外"（源 `:3298` 的 `!== lovart` 与按钮**不是**同一条件）', () => {
    expect(siteTypesWhere((c) => !c.watermarkPanelAllowed)).toEqual(['lovart']);
  });

  it('画廊来源 = lovart / tapnow；**会话条**只有 lovart（两个问题两个字段）', () => {
    expect(siteTypesWhere((c) => c.gallerySource === 'lovart')).toEqual(['lovart']);
    expect(siteTypesWhere((c) => c.gallerySource === 'tapnow')).toEqual(['tapnow']);
    expect(siteTypesWhere((c) => c.hasChromeSession)).toEqual(['lovart']);
  });

  it('可走**网页通道**执行 = doubao / dola / gpt（原 `WEB_EXECUTABLE_TYPES`）', () => {
    expect(siteTypesWhere((c) => c.webExecutable)).toEqual(['doubao', 'dola', 'gpt']);
  });

  it('代理池只作用于 lovart（原 `proxy.ts` 与 `ProxyPoolPanel` 的同一判据）', () => {
    expect(siteTypesWhere((c) => c.usesProxyPool)).toEqual(['lovart']);
  });

  it('无固定地址 / 无需指纹会话：只有 other（源 `$P.jsx:17` 与 `:49-90` 的 `other` 支）', () => {
    expect(siteTypesWhere((c) => !c.hasFixedUrl)).toEqual(['other']);
    // 指纹只给 dola/doubao/tapnow/gpt（源 `$P.jsx:142-153`）；lovart 走容器、other 两者都没有
    expect(siteTypesWhere((c) => !c.needsFingerprintSession)).toEqual(['lovart', 'other']);
    expect(siteTypesWhere((c) => c.usesLovartContainer)).toEqual(['lovart']);
    expect(SITE_TYPES.filter((t) => needsSessionPrep(t))).toEqual([
      'doubao',
      'dola',
      'lovart',
      'tapnow',
      'gpt',
    ]);
  });

  it('登录弹窗两处例外：tapnow 无「在浏览器打开」（源 `:255`）· 只有它有验证链接行（源 `:316-328`）', () => {
    expect(siteTypesWhere((c) => !c.loginCanOpenInBrowser)).toEqual(['tapnow']);
    expect(siteTypesWhere((c) => c.loginHasVerifyRow)).toEqual(['tapnow']);
  });

  it('通道映射（原 `AccountPicker` 内联表 `{doubao,dola,gpt}` + 其余兜底 doubao）', () => {
    expect(SITE_CAPS.doubao.channel).toBe('doubao');
    expect(SITE_CAPS.dola.channel).toBe('dola');
    expect(SITE_CAPS.gpt.channel).toBe('gpt');
    expect(SITE_CAPS.lovart.channel).toBe('doubao');
    expect(SITE_CAPS.tapnow.channel).toBe('doubao');
    expect(SITE_CAPS.other.channel).toBe('doubao');
  });
});

describe('派生视图（钉住**改前的值** —— 防表漂移后清单静默变）', () => {
  it('NEW_IMAGES_SITES = [lovart, tapnow, other]（原字面量）', () => {
    expect([...NEW_IMAGES_SITES]).toEqual(['lovart', 'tapnow', 'other']);
  });

  it('GALLERY_SITES = [lovart, tapnow]（原 `as const` 元组），且 `isGallerySite` 与它一致', () => {
    expect([...GALLERY_SITES]).toEqual(['lovart', 'tapnow']);
    expect(SITE_TYPES.filter(isGallerySite)).toEqual(['lovart', 'tapnow']);
  });

  it('CHROME_SESSION_SITES = [lovart]（原 `as const` 元组），且 `isChromeSessionSite` 与它一致', () => {
    expect([...CHROME_SESSION_SITES]).toEqual(['lovart']);
    expect(SITE_TYPES.filter(isChromeSessionSite)).toEqual(['lovart']);
  });
});
