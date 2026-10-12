/**
 * 抓图候选清洗单测 —— 逐条回源 `Yh`（`shared.js:23439-23536`）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 * 断言红线：实现一变必红 —— 每条都钉住一条**源判据**（不是"跑通就算"）。
 */

import { describe, expect, it } from 'vitest';
import {
  SCAN_CLEAN_DEFAULT_SCOPE,
  cleanScannedImages,
  excludeSeenImages,
  type ScannableImage,
} from '../scanClean';

/** 造一条候选（默认 200×200 · 画布） */
const img = (url: string, extra: Partial<ScannableImage> = {}): ScannableImage => ({
  url,
  scope: 'canvas',
  natW: 200,
  natH: 200,
  ...extra,
});

const urls = (r: { items: ScannableImage[] }): string[] => r.items.map((x) => x.url);

describe('cleanScannedImages · scope 白名单（原 `Yh` 23448-23451）', () => {
  it('★ 默认只留 `canvas` —— panel / feed / site 一律滤掉', () => {
    const r = cleanScannedImages([
      img('https://a.com/1.png', { scope: 'canvas' }),
      img('https://a.com/2.png', { scope: 'panel' }),
      img('https://a.com/3.png', { scope: 'feed' }),
      img('https://a.com/4.png', { scope: 'site' }),
    ]);
    expect(urls(r)).toEqual(['https://a.com/1.png']);
    expect(r.skipped).toBe(3);
  });

  it('★ `scope` 缺省视作 `site`（原 `l.scope || zs.SITE`）⇒ 默认也被滤掉', () => {
    const r = cleanScannedImages([{ url: 'https://a.com/1.png', natW: 200, natH: 200 }]);
    expect(r.items).toEqual([]);
    expect(r.skipped).toBe(1);
  });

  it('`allowedScopes` 可覆盖（非空数组才当白名单）', () => {
    const panel = [img('https://a.com/2.png', { scope: 'panel' })];
    expect(cleanScannedImages(panel, { allowedScopes: ['panel'] }).items).toHaveLength(1);
    // 空数组 ⇒ 回落到默认（源：`length > 0` 才用它）
    expect(cleanScannedImages(panel, { allowedScopes: [] }).items).toHaveLength(0);
  });

  it('默认常量就是 `canvas`', () => {
    expect(SCAN_CLEAN_DEFAULT_SCOPE).toBe('canvas');
  });
});

describe('cleanScannedImages · 尺寸下限（原 23457-23462）', () => {
  it('★ 恰好 96 保留 · 95 滤掉（判据是 `max(natW,natH)`，不是"有一边够大"）', () => {
    expect(cleanScannedImages([img('https://a.com/ok.png', { natW: 96, natH: 96 })]).items).toHaveLength(1);
    expect(cleanScannedImages([img('https://a.com/no.png', { natW: 95, natH: 95 })]).items).toHaveLength(0);
    // 一边够大 ⇒ 保留（源取 max）
    expect(cleanScannedImages([img('https://a.com/long.png', { natW: 95, natH: 400 })]).items).toHaveLength(1);
  });

  it('★ 无尺寸（0）**不**滤 —— 源是 `minSide > 0 && v > 0 && v < minSide`', () => {
    const r = cleanScannedImages([{ url: 'https://a.com/unknown.png', scope: 'canvas' }]);
    expect(r.items).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });
});

describe('cleanScannedImages · URL 清洗（原 23466-23476）', () => {
  it('★ `Ad`：图标 / 头像 / 占位 / 1x1 / 追踪 —— path、host、query 任一命中即滤', () => {
    for (const u of [
      'https://a.com/logo.png',
      'https://a.com/avatar.png',
      'https://a.com/1x1.png',
      'https://icon.a.com/pic.png',
      'https://a.com/pic.png?gtm=1',
    ]) {
      expect(cleanScannedImages([img(u)]).items, u).toHaveLength(0);
    }
  });

  it('★ 非图片扩展名（原 `YM`）⇒ 滤掉', () => {
    for (const u of ['https://a.com/app.js', 'https://a.com/style.css', 'https://a.com/data.json']) {
      expect(cleanScannedImages([img(u)]).items, u).toHaveLength(0);
    }
  });

  it('⚠️ `.svg` **不**在这一轮里滤（`Ad`/`YM` 都不含 svg）—— 它由**页内脚本**丢（`hp`）', () => {
    expect(cleanScannedImages([img('https://a.com/x.svg')]).items).toHaveLength(1);
  });

  it('★ `/api/` + 非图片扩展名 + **无尺寸** ⇒ 滤掉；有尺寸则留（三个条件缺一不可）', () => {
    expect(cleanScannedImages([img('https://a.com/api/v1/get', { natW: 0, natH: 0 })]).items).toHaveLength(0);
    expect(cleanScannedImages([img('https://a.com/api/v1/get')]).items).toHaveLength(1);
  });

  it('非 http(s) 协议 ⇒ 滤掉（如 `ftp:`）', () => {
    expect(cleanScannedImages([img('ftp://a.com/pic.png')]).items).toHaveLength(0);
  });
});

describe('cleanScannedImages · 择优（原 23487-23535）', () => {
  it('★ 同 `origin + pathname`（查询串不同）⇒ 只留一条（键砍掉查询串）', () => {
    const r = cleanScannedImages([
      img('https://a.com/pic.png?v=1'),
      img('https://a.com/pic.png?v=2'),
    ]);
    expect(r.items).toHaveLength(1);
    // 择优**不是**"跳过"（源也不计入任何计数）
    expect(r.skipped).toBe(0);
  });

  it('★ 不同文件名 = 不同键 ⇒ 各留一条', () => {
    const r = cleanScannedImages([img('https://a.com/a.png'), img('https://a.com/b.png')]);
    expect(r.items).toHaveLength(2);
  });

  it('★ 按分降序：尺寸大的在前（同尺寸时 +40 的图片扩展名优势）', () => {
    const r = cleanScannedImages([
      img('https://a.com/small.png', { natW: 100, natH: 100 }),
      img('https://a.com/big.png', { natW: 900, natH: 900 }),
    ]);
    expect(urls(r)).toEqual(['https://a.com/big.png', 'https://a.com/small.png']);
  });

  it('★ 缩略图特征（pathname 命中 `thumb|small|mini|preview|lowres|_s.|_xs.|_sm.`）⇒ −400 排后面', () => {
    const r = cleanScannedImages([
      img('https://a.com/photo_thumb.png'),
      img('https://a.com/photo.png', { natW: 100, natH: 100 }), // 更小，但**不是**缩略图
    ]);
    // 缩略图 −400 落到 −160（200+40−400）；小图 = 140 ⇒ 小图仍在前面
    expect(urls(r)[0]).toBe('https://a.com/photo.png');
  });

  it('CDN 处理参数（`?x-oss-process=…`）⇒ 与"剥掉后"同键，只留一条', () => {
    const r = cleanScannedImages([
      img('https://a.com/pic.png?x-oss-process=image/resize,w_100'),
      img('https://a.com/pic.png'),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });
});

describe('cleanScannedImages · 非 http（原 23488-23490）', () => {
  it('★ `data:` 不做 URL 清洗；键 = `kind:去尾 96 字符` ⇒ 内容不同则各留一条', () => {
    const r = cleanScannedImages([
      img('data:image/png;base64,AAAA'),
      img('data:image/png;base64,BBBB'),
    ]);
    expect(r.items).toHaveLength(2);
  });

  it('★ 长 `data:` 只比尾 96 字符 —— 头部不同但尾部相同的会被当作同一条', () => {
    const tail = 'X'.repeat(120);
    const r = cleanScannedImages([
      img(`data:image/png;base64,HEAD1${tail}`),
      img(`data:image/png;base64,HEAD2${tail}`),
    ]);
    expect(r.items).toHaveLength(1);
  });
});

describe('cleanScannedImages · 边界', () => {
  it('空输入 / 空 url ⇒ 不崩，空 url 计入 skipped', () => {
    expect(cleanScannedImages([]).items).toEqual([]);
    expect(cleanScannedImages([img('')]).skipped).toBe(1);
  });

  it('★ 不可变：不改传入的候选', () => {
    const one = img('https://a.com/pic.png?v=1');
    cleanScannedImages([one]);
    expect(one.url).toBe('https://a.com/pic.png?v=1');
  });
});

describe('excludeSeenImages · 已在库过滤（原 `wp:32588-32591` 的 `x`）', () => {
  it('★ 原样命中 ⇒ 滤掉（并计入 skipped）', () => {
    const r = excludeSeenImages([img('https://a.com/1.png'), img('https://a.com/2.png')], [
      'https://a.com/1.png',
    ]);
    expect(urls(r)).toEqual(['https://a.com/2.png']);
    expect(r.skipped).toBe(1);
  });

  it('★ 两侧都规范化：库里存的是**去查询串**的、候选带查询串 ⇒ 仍判为同一张', () => {
    // 源：`n.has(M.url) || n.has(Si(M.url))`，且 `n` 里本身就同时塞了原样与规范化两种（32595-32599）
    const r = excludeSeenImages([img('https://a.com/pic.png?x=1&y=2')], ['https://a.com/pic.png']);
    expect(r.items).toHaveLength(0);
    // 反向亦然：库里带查询串、候选不带
    const back = excludeSeenImages([img('https://a.com/pic.png')], ['https://a.com/pic.png?x=1']);
    expect(back.items).toHaveLength(0);
  });

  it('★ `blob:` / `data:` 原样比（`normalizeUrl` 对它们不做处理）', () => {
    const r = excludeSeenImages(
      [img('blob:https://x/aaa'), img('data:image/png;base64,AAA')],
      ['blob:https://x/aaa'],
    );
    expect(urls(r)).toEqual(['data:image/png;base64,AAA']);
  });

  it('★ 形状不合法（非对象 / 无 url）⇒ **原样放行**（不是"已见"）', () => {
    const raws: unknown[] = [null, 42, { scope: 'canvas' }, { url: 'https://a.com/1.png' }];
    const r = excludeSeenImages(raws, ['https://a.com/1.png']);
    expect(r.items).toHaveLength(3);
    expect(r.skipped).toBe(1);
  });

  it('空清单 / 空 `seenUrls` ⇒ 原样返回、不计数', () => {
    expect(excludeSeenImages([], ['https://a.com/1.png'])).toEqual({ items: [], skipped: 0 });
    const all = excludeSeenImages([img('https://a.com/1.png')], []);
    expect(all.items).toHaveLength(1);
    expect(all.skipped).toBe(0);
  });

  it('★ 不可变：返回新数组，不动传入的那个', () => {
    const list = [img('https://a.com/1.png')];
    const r = excludeSeenImages(list, []);
    expect(r.items).not.toBe(list);
  });
});
