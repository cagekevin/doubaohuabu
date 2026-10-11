import { describe, expect, it } from 'vitest';
import type { Account } from '@/stable/model/account';
import type { ScanResult, ScannedImage, SitePort, SiteRegistry } from '@/core/ports/site.port';
import { err, ok } from '@/core/model/result';
import { scanGallery } from '../scanGallery';

const acc = (type: Account['type'], id = 'a1'): Account =>
  ({ id, name: id, type, groupId: null, partition: `persist:${type}` }) as Account;

const scanned = (over: Partial<ScannedImage> = {}): ScannedImage => ({
  url: 'https://cdn.lovart.ai/x/photo.png',
  ref: 'img://abc123.png',
  scope: 'canvas',
  via: 'webview',
  ...over,
});

/** 造一个只实现 `scan` 的站点（其余方法断言到 `SitePort`） */
const siteWith = (scan: SitePort['scan'], kind: SitePort['kind'] = 'lovart'): SitePort =>
  ({ kind, scan }) as unknown as SitePort;

describe('scanGallery（原 `wp` 的编排半）', () => {
  it('★ 无站点适配器 ⇒ **明确报错**（不把"没适配器"当成"页面上没有图"）', async () => {
    const r = await scanGallery({ sites: {} }, acc('gpt'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('无 gpt 站点适配器');
  });

  it('★ 适配器失败 ⇒ **原样透传**（不吞、不改写 message）', async () => {
    const sites: SiteRegistry = { lovart: siteWith(async () => err('page-error', 'Lovart 页面未就绪')) };
    const r = await scanGallery({ sites }, acc('lovart'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Lovart 页面未就绪');
  });

  it('★ 映射：`dataUrl` 取**已落盘的 `ref`**、`sourceUrl` 取原 url', async () => {
    const sites: SiteRegistry = { lovart: siteWith(async () => ok<ScanResult>({ items: [scanned()], skipped: 0 })) };
    const r = await scanGallery({ sites }, acc('lovart'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items[0]).toMatchObject({
      dataUrl: 'img://abc123.png',
      sourceUrl: 'https://cdn.lovart.ai/x/photo.png',
      scope: 'canvas',
      source: 'capture-page',
      name: 'photo.png',
    });
  });

  it('★ `name` = 抓来图的命名（原 `XT`）：URL 尾段是图片名就用它；`data:` ⇒ 内联图 N', async () => {
    const items = [
      scanned({ url: 'https://x/a/b.webp', ref: 'img://1.png' }),
      scanned({ url: 'data:image/png;base64,AAA', ref: 'img://2.png' }),
      scanned({ url: 'blob:https://x/zzz', ref: 'img://3.png' }),
      scanned({ url: 'https://x/noext', ref: 'img://4.png' }),
    ];
    const sites: SiteRegistry = { lovart: siteWith(async () => ok<ScanResult>({ items, skipped: 0 })) };
    const r = await scanGallery({ sites }, acc('lovart'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items.map((x) => x.name)).toEqual(['b.webp', 'Lovart 内联图 2', 'Lovart 生成图 3', 'Lovart 生成图 4']);
  });

  it('★ `source` 出处：`data:` / `blob:` ⇒ `capture-blob`，其余 ⇒ `capture-page`', async () => {
    const items = [
      scanned({ url: 'https://x/a.png' }),
      scanned({ url: 'data:image/png;base64,AAA' }),
      scanned({ url: 'blob:https://x/zzz' }),
    ];
    const sites: SiteRegistry = { lovart: siteWith(async () => ok<ScanResult>({ items, skipped: 0 })) };
    const r = await scanGallery({ sites }, acc('lovart'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items.map((x) => x.source)).toEqual(['capture-page', 'capture-blob', 'capture-blob']);
  });

  it('★ 缺 `natW`/`natH` ⇒ **不塞 0**（`addLovartImages` 有自己的兜底）', async () => {
    const sites: SiteRegistry = {
      lovart: siteWith(async () => ok<ScanResult>({ items: [scanned({ natW: undefined, natH: undefined })], skipped: 0 })),
    };
    const r = await scanGallery({ sites }, acc('lovart'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('natW' in r.value.items[0]!).toBe(false);
    expect('natH' in r.value.items[0]!).toBe(false);
  });

  it('★ 计数原样带出：`skipped` / `failed`（对齐 `wp.failed`）/ `unread`（frame 数）', async () => {
    const sites: SiteRegistry = {
      lovart: siteWith(async () =>
        ok<ScanResult>({
          items: [scanned()],
          skipped: 3,
          failed: 2,
          unread: [
            { kind: 'cross-origin-frame', why: 'SecurityError' },
            { kind: 'img-query', why: 'boom' },
          ],
        }),
      ),
    };
    const r = await scanGallery({ sites }, acc('lovart'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ skipped: 3, failed: 2, unread: 2 });
  });

  it('★ 缺 `failed` / `unread` ⇒ 按 **0** 算（适配器可以不报）', async () => {
    const sites: SiteRegistry = { lovart: siteWith(async () => ok<ScanResult>({ items: [], skipped: 0 })) };
    const r = await scanGallery({ sites }, acc('lovart'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ failed: 0, unread: 0, items: [] });
  });

  it('★ `onPhase` **原样转发**给适配器（本用例只上报、不写 store）', async () => {
    const seen: string[] = [];
    const sites: SiteRegistry = {
      lovart: siteWith(async (_a, opts) => {
        opts.onPhase?.({ phase: 'scanning', message: '尝试 webview 通道…' });
        return ok<ScanResult>({ items: [], skipped: 0 });
      }),
    };
    await scanGallery({ sites }, acc('lovart'), {
      onPhase: (e) => seen.push(`${e.phase}:${e.message}`),
    });
    expect(seen).toEqual(['scanning:尝试 webview 通道…']);
  });
});
