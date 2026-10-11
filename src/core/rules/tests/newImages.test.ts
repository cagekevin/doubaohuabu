import { describe, expect, it } from 'vitest';
import type { Account } from '@/stable/model/account';
import type { LovartGalleries } from '@/core/rules/lovartGallery';
import type { LovartGalleryImage } from '@/stable/contracts/lsValues';
import {
  aggregateNewImages,
  galleryItemKey,
  hostnameFromUrl,
  isFetchableSite,
  isFreshItem,
  sourceTag,
} from '../newImages';

/** 造账号（与 `accountName.test.ts` 同法：只给判据用得到的字段，整体断言到 `Account`） */
const acc = (id: string, type: Account['type'], name = id): Account =>
  ({ id, name, type, groupId: null }) as Account;

/**
 * 造画廊条目
 * ⚠️ `extra` 用 `Record<string, unknown>` 而不是 `Partial<LovartGalleryImage>`：本文件要造一条
 *    **带 `canvasId`** 的条目（那字段不在持久化形状里 —— 见 `newImages.ts` 文件头「源版怪癖」）。
 */
const img = (id: string, extra: Record<string, unknown> = {}): LovartGalleryImage =>
  ({
    id,
    name: `图 ${id}`,
    dataUrl: `img://${id}`,
    natW: 100,
    natH: 100,
    sizeBytes: 1000,
    source: 'import',
    sourceUrl: '',
    scope: '',
    addedAt: 1000,
    ...extra,
  }) as LovartGalleryImage;

const gallery = (entries: Record<string, LovartGalleryImage[]>): LovartGalleries => entries;

describe('站点判定 isFetchableSite（原 `x0` 36705）', () => {
  it('lovart / tapnow / other ⇒ 可抓取', () => {
    expect(isFetchableSite(acc('a', 'lovart'))).toBe(true);
    expect(isFetchableSite(acc('a', 'tapnow'))).toBe(true);
    expect(isFetchableSite(acc('a', 'other'))).toBe(true);
  });

  it('★ doubao / dola / gpt ⇒ **不可**（它们页面里没有图库）', () => {
    expect(isFetchableSite(acc('a', 'doubao'))).toBe(false);
    expect(isFetchableSite(acc('a', 'dola'))).toBe(false);
    expect(isFetchableSite(acc('a', 'gpt'))).toBe(false);
  });

  it('空 / null ⇒ false（源版 `e && …`）', () => {
    expect(isFetchableSite(null)).toBe(false);
    expect(isFetchableSite(undefined)).toBe(false);
  });
});

describe('galleryItemKey（原 `mo` 36746）', () => {
  it('`` `${_accId || ""}:${id}` ``', () => {
    expect(galleryItemKey({ id: 'x1', _accId: 'a1' })).toBe('a1:x1');
  });

  it('没有 `_accId` ⇒ 前缀为空（源版 `|| ""`）', () => {
    expect(galleryItemKey({ id: 'x1' })).toBe(':x1');
  });

  it('★ 同一 id 不同账号 ⇒ **不同键**（这正是它要解决的冲突）', () => {
    expect(galleryItemKey({ id: 'x1', _accId: 'a1' })).not.toBe(galleryItemKey({ id: 'x1', _accId: 'a2' }));
  });
});

describe('sourceTag（原 642-644 的三目）', () => {
  it('lovart → L · tapnow → T · 其余 → 网', () => {
    expect(sourceTag('lovart')).toBe('L');
    expect(sourceTag('tapnow')).toBe('T');
    expect(sourceTag('other')).toBe('网');
    expect(sourceTag(undefined)).toBe('网');
  });
});

describe('hostnameFromUrl（原 `nD` 36739）', () => {
  it('取主机名（去协议 / 路径 / query）', () => {
    expect(hostnameFromUrl('https://a.com/x/y.png?sig=1')).toBe('a.com');
  });

  it('★ 解析不了（相对路径 / 乱码 / 空）⇒ **空串**（源版 `catch { return "" }`，不编造）', () => {
    expect(hostnameFromUrl('/relative/x.png')).toBe('');
    expect(hostnameFromUrl('not a url')).toBe('');
    expect(hostnameFromUrl('')).toBe('');
    expect(hostnameFromUrl(null)).toBe('');
    expect(hostnameFromUrl(undefined)).toBe('');
  });

  it('★ `img://abc` **能**被 `URL` 解析 ⇒ 返回 `abc`（源版同 —— 它只看 `new URL` 成不成功）', () => {
    expect(hostnameFromUrl('img://abc')).toBe('abc');
  });
});

describe('isFreshItem（原 627 的 `>= now - 3600000`）', () => {
  const NOW = 10_000_000;

  it('★ 恰好 1 小时前 ⇒ **算新**（`>=`，不是 `>`）', () => {
    expect(isFreshItem({ addedAt: NOW - 3_600_000 }, NOW)).toBe(true);
  });

  it('1 小时零 1 毫秒前 ⇒ 不算新', () => {
    expect(isFreshItem({ addedAt: NOW - 3_600_001 }, NOW)).toBe(false);
  });

  it('未来时间戳 ⇒ 算新（源版不设上界）', () => {
    expect(isFreshItem({ addedAt: NOW + 999 }, NOW)).toBe(true);
  });

  it('缺 `addedAt` / 空 ⇒ 不算新（`|| 0` 后必然 < now - 1h）', () => {
    expect(isFreshItem({ addedAt: 0 }, NOW)).toBe(false);
    expect(isFreshItem(null, NOW)).toBe(false);
  });
});

describe('aggregateNewImages（原 `z` 100-130）', () => {
  const accounts = [acc('L1', 'lovart', 'Lovart 一号'), acc('T1', 'tapnow', 'Tapnow 一号'), acc('D1', 'doubao')];

  it('★ 只聚合可抓取账号的图（doubao 的图**不进**列表）', () => {
    const g = gallery({
      L1: [img('l1')],
      T1: [img('t1')],
      D1: [img('d1')],
    });
    const out = aggregateNewImages(g, accounts, { currentOnly: false });
    expect(out.map((x) => x.id).sort()).toEqual(['l1', 't1']);
  });

  it('★ 铺开时附上归属（`_accId`/`_accName`/`_accType`）', () => {
    const g = gallery({ L1: [img('l1')] });
    const out = aggregateNewImages(g, accounts, { currentOnly: false });
    expect(out[0]).toMatchObject({ _accId: 'L1', _accName: 'Lovart 一号', _accType: 'lovart' });
  });

  it('★ 按 `addedAt` **降序**（新的在前）', () => {
    const g = gallery({ L1: [img('old', { addedAt: 100 }), img('new', { addedAt: 900 }), img('mid', { addedAt: 500 })] });
    const out = aggregateNewImages(g, accounts, { currentOnly: false });
    expect(out.map((x) => x.id)).toEqual(['new', 'mid', 'old']);
  });

  it('★ 缺 `addedAt` ⇒ 按 0 算（沉到最底）', () => {
    const g = gallery({ L1: [img('none', { addedAt: 0 }), img('some', { addedAt: 5 })] });
    const out = aggregateNewImages(g, accounts, { currentOnly: false });
    expect(out.map((x) => x.id)).toEqual(['some', 'none']);
  });

  it('★ 截断到 `limit`（原 `JR` = 48；这里给 2 验证截断发生在**排序之后**）', () => {
    const g = gallery({
      L1: [img('a', { addedAt: 1 }), img('b', { addedAt: 3 }), img('c', { addedAt: 2 })],
    });
    const out = aggregateNewImages(g, accounts, { currentOnly: false, limit: 2 });
    expect(out.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('★ 账号没有画廊条目 ⇒ 跳过（源版 `r && r[X.id] || []`）', () => {
    const out = aggregateNewImages(gallery({}), accounts, { currentOnly: false });
    expect(out).toEqual([]);
  });

  describe('「只留本画布」（原 `m`）', () => {
    const g = gallery({ L1: [img('l1')], T1: [img('t1')] });

    it('★ 开了 + 有当前账号 ⇒ 只剩该账号的图', () => {
      const out = aggregateNewImages(g, accounts, { currentOnly: true, activeAccountId: 'L1' });
      expect(out.map((x) => x.id)).toEqual(['l1']);
    });

    it('★ 开了但**没有当前账号** ⇒ 过滤**不生效**（源版 `m && te` 守卫）', () => {
      const out = aggregateNewImages(g, accounts, { currentOnly: true, activeAccountId: null });
      expect(out.map((x) => x.id).sort()).toEqual(['l1', 't1']);
    });

    it('关了 ⇒ 不过滤', () => {
      const out = aggregateNewImages(g, accounts, { currentOnly: false, activeAccountId: 'L1' });
      expect(out.map((x) => x.id).sort()).toEqual(['l1', 't1']);
    });

    it('★ Lovart：`scope` 有值且不是 `canvas` ⇒ 滤掉；空 `scope` ⇒ **保留**', () => {
      const gg = gallery({
        L1: [img('canvas', { scope: 'canvas' }), img('panel', { scope: 'panel' }), img('noscope', { scope: '' })],
      });
      const out = aggregateNewImages(gg, accounts, { currentOnly: true, activeAccountId: 'L1' });
      expect(out.map((x) => x.id).sort()).toEqual(['canvas', 'noscope']);
    });

    it('★ Tapnow + 有当前画布 id ⇒ 条目没带 `canvasId` ⇒ **全被滤掉**（源版怪癖，逐字照抄）', () => {
      const gg = gallery({ T1: [img('t1'), img('t2')] });
      const out = aggregateNewImages(gg, accounts, {
        currentOnly: true,
        activeAccountId: 'T1',
        currentCanvasId: 'abc12345',
      });
      expect(out).toEqual([]);
    });

    it('★ Tapnow + **没有**当前画布 id ⇒ 不过滤（源版 `v &&` 守卫）', () => {
      const gg = gallery({ T1: [img('t1')] });
      const out = aggregateNewImages(gg, accounts, {
        currentOnly: true,
        activeAccountId: 'T1',
        currentCanvasId: null,
      });
      expect(out.map((x) => x.id)).toEqual(['t1']);
    });

    it('★ Tapnow + 条目**带了**匹配的 `canvasId` ⇒ 保留（判据按预期工作）', () => {
      const gg = gallery({ T1: [img('t1', { canvasId: 'abc12345' })] });
      const out = aggregateNewImages(gg, accounts, {
        currentOnly: true,
        activeAccountId: 'T1',
        currentCanvasId: 'abc12345',
      });
      expect(out.map((x) => x.id)).toEqual(['t1']);
    });
  });
});
