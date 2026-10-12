import { describe, expect, it } from 'vitest';
import type { Account } from '@/stable/model/account';
import type { ScanResult, ScannedImage, SitePort, SiteRegistry } from '@/core/ports/site.port';
import { err, ok } from '@/core/model/result';
import {
  SCAN_CANVAS_GALLERY_LIMIT,
  SCAN_GALLERY_DEFAULT_LIMIT,
  isScanGalleryRunning,
  scanCanvasGallery,
  scanGallery,
} from '../scanGallery';

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
    // ⚠️ 顺序 = **按分降序**（源 `Yh` `:23527` 就 `sort`）：非 http（`data:`/`blob:`，+120）
    //    ⇒ 排在 http 之前；`b.webp` 有图片扩展名（+40）⇒ 在无扩展名的 `noext`（+0）之前。
    // ⚠️ 序号随之 = **清洗后**的下标（源也是"清洗完再逐张取图取名"）。
    expect(r.value.items.map((x) => x.name)).toEqual(['Lovart 内联图 1', 'Lovart 生成图 2', 'b.webp', 'Lovart 生成图 4']);
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
    // 同上：非 http（`data:`/`blob:`）按 `Yh` 的 +120 排在 http 之前
    expect(r.value.items.map((x) => x.source)).toEqual(['capture-blob', 'capture-blob', 'capture-page']);
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

  it('★ `limit`：候选上限（源 `wp` 的 `x.slice(0, limit)`，`:32592`）—— 截断**不算** `skipped`', async () => {
    const items = Array.from({ length: 5 }, (_, i) => scanned({ url: `https://x/p${i}.png` }));
    const sites: SiteRegistry = { lovart: siteWith(async () => ok<ScanResult>({ items, skipped: 0 })) };
    const r = await scanGallery({ sites }, acc('lovart'), { limit: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(2);
    expect(r.value.skipped).toBe(0); // 源也不把"这轮不处理"算成"跳过"
  });

  it('`limit` 缺省 ⇒ 用默认 12（源 `FT`，`shared.js:32415`）', async () => {
    const items = Array.from({ length: 20 }, (_, i) => scanned({ url: `https://x/q${i}.png` }));
    const sites: SiteRegistry = { lovart: siteWith(async () => ok<ScanResult>({ items, skipped: 0 })) };
    const r = await scanGallery({ sites }, acc('lovart'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(SCAN_GALLERY_DEFAULT_LIMIT);
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

  it('★ `seenUrls` **原样转发**给适配器（源 `wp:32588` 的下载前过滤要用它）', async () => {
    let seen: readonly string[] | undefined;
    const sites: SiteRegistry = {
      lovart: siteWith(async (_a, opts) => {
        seen = opts.seenUrls;
        return ok<ScanResult>({ items: [], skipped: 0 });
      }),
    };
    await scanGallery({ sites }, acc('lovart'), { seenUrls: ['https://cdn.lovart.ai/x/photo.png'] });
    expect(seen).toEqual(['https://cdn.lovart.ai/x/photo.png']);
  });

  it('未给 `seenUrls` ⇒ **不塞该键**（适配器按"没有"处理，不是空数组）', async () => {
    let present = true;
    const sites: SiteRegistry = {
      lovart: siteWith(async (_a, opts) => {
        present = 'seenUrls' in opts;
        return ok<ScanResult>({ items: [], skipped: 0 });
      }),
    };
    await scanGallery({ sites }, acc('lovart'));
    expect(present).toBe(false);
  });
});

describe('scanCanvasGallery（原 `wP` 33842-33871 的画布半）', () => {
  const siteWithCanvas = (scanCanvas: NonNullable<SitePort['scanCanvas']>): SitePort =>
    ({ kind: 'tapnow', scanCanvas }) as unknown as SitePort;

  it('★ 站点没有 `scanCanvas` 能力 ⇒ **明确报错**（**不回落** DOM 扫描）', async () => {
    const sites: SiteRegistry = {
      tapnow: siteWith(async () => ok<ScanResult>({ items: [], skipped: 0 }), 'tapnow'),
    };
    const r = await scanCanvasGallery({ sites }, acc('tapnow'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('站点 tapnow 不支持扫描画布');
  });

  it('★ 命名 / 出处走**画布那套**（原 `s0`：尾段前 8 字；`source: tapnow-api`）', async () => {
    const url = 'https://oss-cn-x.aliyuncs.com/a/abcdefghij.png';
    const sites: SiteRegistry = {
      tapnow: siteWithCanvas(async () => ok<ScanResult>({ items: [scanned({ url })], skipped: 0 })),
    };
    const r = await scanCanvasGallery({ sites }, acc('tapnow'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items[0]).toMatchObject({
      name: 'Tapnow 图 abcdefgh',
      source: 'tapnow-api',
      dataUrl: 'img://abc123.png',
      sourceUrl: url,
    });
  });

  it('★ `seenUrls` / `onPhase` **原样转发**给适配器', async () => {
    let seen: readonly string[] | undefined;
    const sites: SiteRegistry = {
      tapnow: siteWithCanvas(async (_a, opts) => {
        seen = opts.seenUrls;
        opts.onPhase?.({ phase: 'found', message: '当前画布含 3 张图' });
        return ok<ScanResult>({ items: [], skipped: 0 });
      }),
    };
    const phases: string[] = [];
    await scanCanvasGallery({ sites }, acc('tapnow'), {
      seenUrls: ['https://a/1.png'],
      onPhase: (e) => phases.push(`${e.phase}:${e.message}`),
    });
    expect(seen).toEqual(['https://a/1.png']);
    expect(phases).toEqual(['found:当前画布含 3 张图']);
  });

  it('★ `limit` **交下去**（源 `wP` 在**取图之前**截断）—— 缺省 = `SCAN_CANVAS_GALLERY_LIMIT`（源 `bP` = 60）', async () => {
    let seenLimit: number | undefined;
    const sites: SiteRegistry = {
      tapnow: siteWithCanvas(async (_a, opts) => {
        seenLimit = opts.limit;
        return ok<ScanResult>({ items: [], skipped: 0 });
      }),
    };
    await scanCanvasGallery({ sites }, acc('tapnow'));
    expect(seenLimit).toBe(SCAN_CANVAS_GALLERY_LIMIT);
    await scanCanvasGallery({ sites }, acc('tapnow'), { limit: 7 });
    expect(seenLimit).toBe(7);
  });

  it('★ 与 `scanGallery` **共用同一把闩**（源 `Xl` 管的就是 tapnow 这半边）', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const sites: SiteRegistry = {
      tapnow: siteWithCanvas(async () => {
        await gate;
        return ok<ScanResult>({ items: [], skipped: 0 });
      }),
    };
    const first = scanCanvasGallery({ sites }, acc('tapnow'));
    try {
      const second = await scanCanvasGallery({ sites }, acc('tapnow'));
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.reason).toBe('busy');
    } finally {
      release();
      await first;
    }
    expect(isScanGalleryRunning()).toBe(false);
  });
});

describe('scanGallery · 抓取互斥闩（原 `wp:32531-32538` 的 `Xa`）', () => {
  it('★ 并发第二次 ⇒ `busy` ＋ SSOT 文案（源 `:32535` 逐字）', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const sites: SiteRegistry = {
      lovart: siteWith(async () => {
        await gate; // 占住第一发，让第二发撞上闩
        return ok<ScanResult>({ items: [], skipped: 0 });
      }),
    };
    const first = scanGallery({ sites }, acc('lovart'));
    try {
      const second = await scanGallery({ sites }, acc('lovart'));
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toBe('busy');
        expect(second.message).toBe('上一次抓取还没结束');
      }
    } finally {
      release();
      await first; // 放闩（模块级状态 + `test.isolate:false` ⇒ 必须保证）
    }
    expect(isScanGalleryRunning()).toBe(false);
  });

  it('★ 适配器失败也要放闩（源 `:32939` 的 `finally` —— 留闩会让后续抓取全废）', async () => {
    const sites: SiteRegistry = {
      lovart: siteWith(async () => err('page-error', 'Lovart 页面未就绪')),
    };
    expect((await scanGallery({ sites }, acc('lovart'))).ok).toBe(false);
    expect(isScanGalleryRunning()).toBe(false);
    // 再来一次仍能跑（闩真的放掉了）
    expect((await scanGallery({ sites }, acc('lovart'))).ok).toBe(false);
  });

  it('★ 没有站点适配器 ⇒ **不占闩**（先查适配器、后拿闩；否则一个错站名会锁死全局）', async () => {
    const r = await scanGallery({ sites: {} }, acc('gpt'));
    expect(r.ok).toBe(false);
    expect(isScanGalleryRunning()).toBe(false);
  });

  it('`isScanGalleryRunning()` 在跑的时候是 `true`（源 `Jy`/`o0` 的判据）', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const sites: SiteRegistry = {
      lovart: siteWith(async () => {
        await gate;
        return ok<ScanResult>({ items: [], skipped: 0 });
      }),
    };
    const first = scanGallery({ sites }, acc('lovart'));
    expect(isScanGalleryRunning()).toBe(true);
    release();
    await first;
    expect(isScanGalleryRunning()).toBe(false);
  });
});
