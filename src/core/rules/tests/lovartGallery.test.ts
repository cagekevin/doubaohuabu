/**
 * Lovart 画廊单测（原 `addLovartImages` 29243 / `removeLovartImages` 29296 /
 * `clearLovartGallery` 29315 / `ET` 26637）
 *
 * 断言红线（**实现一变必红**）：
 *   ① **双去重**（`dataUrl` 归一后 + `sourceUrl` 原值），且两个集是**边遍历边加**
 *      ⇒ **同一批里的重复也会被滤掉**；
 *   ② 没新增 ⇒ **返回原引用**（不是"返回一个内容相同的新对象"）；
 *   ③ `remove` 按 **`id`**、且**会凭空建键**（源版如此）；
 *   ④ `clear` 把键置 `[]`（**保留键**，不是 `delete`）；
 *   ⑤ `parse` 对坏数据 ⇒ `{}` **不抛**。
 */

import { describe, expect, it } from 'vitest';
import {
  addLovartImages,
  canvasMaterialBookmarks,
  LOVART_SOURCE_CANVAS,
  isLovartJunk,
  LOVART_MIN_SIDE,
  LOVART_SCOPE_NOT_CANVAS,
  matchesLovartScope,
  purgeLovartImages,
  removeLovartAccount,
  clearLovartGallery,
  parseLovartGalleries,
  removeLovartImages,
  shouldMaterializeImage,
  type LovartGalleries,
} from '../lovartGallery';

const NOW = 1_700_000_000_000;
let seq = 0;
const deps = {
  now: NOW,
  idFactory: () => `lg_${++seq}`,
  // 默认"归一"就是原样（不落盘）—— 单独测落盘时再换
  normalizeImage: (u: string) => u,
};

describe('parseLovartGalleries（原 `ET` 26637）', () => {
  it('★ 正常 JSON 对象 ⇒ 原样', () => {
    expect(parseLovartGalleries('{"acc_1":[{"id":"lg_1"}]}')).toEqual({ acc_1: [{ id: 'lg_1' }] });
  });

  it('★ 空 / 坏数据 / 不是对象 ⇒ `{}`（**不抛** —— 画廊丢了不该挡住启动）', () => {
    expect(parseLovartGalleries(null)).toEqual({});
    expect(parseLovartGalleries('')).toEqual({});
    expect(parseLovartGalleries('{坏 json')).toEqual({});
    expect(parseLovartGalleries('"字符串"')).toEqual({});
    expect(parseLovartGalleries('42')).toEqual({});
    expect(parseLovartGalleries('null')).toEqual({});
  });

  it('⚠️ 数组也算对象（源版判据 `typeof === "object"`）⇒ 会被返回', () => {
    expect(parseLovartGalleries('[1,2]')).toEqual([1, 2]);
  });
});

describe('addLovartImages（原 29243）', () => {
  const img = (dataUrl: string, extra: Record<string, unknown> = {}) => ({ dataUrl, ...extra });

  it('★ 三重守卫：没有账号 / 不是数组 / 空数组 ⇒ **新增 0 且原样返回**', () => {
    const g: LovartGalleries = {};
    expect(addLovartImages(g, '', [img('img://a.png')], deps)).toEqual({ galleries: g, added: 0 });
    expect(addLovartImages(g, 'acc_1', [], deps)).toEqual({ galleries: g, added: 0 });
    // @ts-expect-error 故意传非数组
    expect(addLovartImages(g, 'acc_1', null, deps)).toEqual({ galleries: g, added: 0 });
  });

  it('★ 项形状：逐个字段给默认值', () => {
    const r = addLovartImages({}, 'acc_1', [img('img://a.png')], deps);
    expect(r.added).toBe(1);
    expect(r.galleries.acc_1![0]).toEqual({
      id: expect.stringMatching(/^lg_/),
      name: 'Lovart 图',
      dataUrl: 'img://a.png',
      natW: 0,
      natH: 0,
      sizeBytes: 0,
      source: 'import',
      sourceUrl: '',
      scope: '',
      addedAt: NOW,
    });
  });

  it('★ 传入的字段会被采用（含 `addedAt` 显式给值时不覆盖）', () => {
    const r = addLovartImages(
      {},
      'acc_1',
      [img('img://a.png', { id: 'lg_x', name: '我的图', natW: 800, natH: 600, sizeBytes: 123, source: 'scan', sourceUrl: 'https://x/a.png', scope: 'canvas', addedAt: 1 })],
      deps,
    );
    expect(r.galleries.acc_1![0]).toEqual({
      id: 'lg_x',
      name: '我的图',
      dataUrl: 'img://a.png',
      natW: 800,
      natH: 600,
      sizeBytes: 123,
      source: 'scan',
      sourceUrl: 'https://x/a.png',
      scope: 'canvas',
      addedAt: 1,
    });
  });

  it('★ **按 `dataUrl` 去重**（已在池里 ⇒ 跳过，新增 0 ⇒ **返回原引用**）', () => {
    const g: LovartGalleries = { acc_1: [{ ...addLovartImages({}, 'acc_1', [img('img://a.png')], deps).galleries.acc_1![0]! }] };
    const r = addLovartImages(g, 'acc_1', [img('img://a.png')], deps);
    expect(r.added).toBe(0);
    expect(r.galleries).toBe(g);
  });

  it('★ **按 `sourceUrl` 去重**（同一个远程图换了个本地地址也不算新）', () => {
    const first = addLovartImages({}, 'acc_1', [img('img://a.png', { sourceUrl: 'https://x/a.png' })], deps);
    const g = first.galleries;
    const r = addLovartImages(g, 'acc_1', [img('img://b.png', { sourceUrl: 'https://x/a.png' })], deps);
    expect(r.added).toBe(0);
  });

  it('★★ **同一批里的重复也会被滤掉**（两个集是边遍历边加的）', () => {
    const r = addLovartImages(
      {},
      'acc_1',
      [img('img://a.png'), img('img://a.png'), img('img://b.png', { sourceUrl: 'https://x/s.png' }), img('img://c.png', { sourceUrl: 'https://x/s.png' })],
      deps,
    );
    // 第 1 条进；第 2 条 dataUrl 重复；第 3 条进；第 4 条 sourceUrl 重复
    expect(r.added).toBe(2);
    expect(r.galleries.acc_1!.map((x) => x.dataUrl)).toEqual(['img://a.png', 'img://b.png']);
  });

  it('★ 缺 `dataUrl` 的条目跳过（不算新增）', () => {
    expect(addLovartImages({}, 'acc_1', [{ name: '没有地址' }, img('img://a.png')], deps).added).toBe(1);
  });

  it('★★ 归一后**为空** ⇒ 整条丢弃（源版 `if (!!p && …)`）', () => {
    const r = addLovartImages({}, 'acc_1', [img('https://x/a.png')], {
      ...deps,
      normalizeImage: () => '',
    });
    expect(r.added).toBe(0);
  });

  it('★★ 存的是**归一后**的 `dataUrl`，而 `sourceUrl` 存原值', () => {
    const r = addLovartImages({}, 'acc_1', [img('https://x/a.png', { sourceUrl: 'https://x/a.png' })], {
      ...deps,
      normalizeImage: (u) => (u.startsWith('https://') ? 'img://local-a.png' : u),
    });
    expect(r.galleries.acc_1![0]!.dataUrl).toBe('img://local-a.png');
    expect(r.galleries.acc_1![0]!.sourceUrl).toBe('https://x/a.png');
  });

  it('★ 追加在**尾部**，且不碰其它账号', () => {
    const g: LovartGalleries = { acc_2: [] };
    const r = addLovartImages(g, 'acc_1', [img('img://a.png')], deps);
    expect(r.galleries.acc_2).toBe(g.acc_2); // 同一引用
    expect(r.galleries.acc_1).toHaveLength(1);
  });
});

describe('removeLovartImages（原 29296）', () => {
  const withTwo = (): LovartGalleries => ({
    acc_1: [
      { id: 'lg_1', name: 'a', dataUrl: 'img://a.png', natW: 0, natH: 0, sizeBytes: 0, source: 'import', sourceUrl: '', scope: '', addedAt: 1 },
      { id: 'lg_2', name: 'b', dataUrl: 'img://b.png', natW: 0, natH: 0, sizeBytes: 0, source: 'import', sourceUrl: '', scope: '', addedAt: 2 },
    ],
  });

  it('★ 按 **`id`** 删（不是 url）', () => {
    const r = removeLovartImages(withTwo(), 'acc_1', ['lg_1']);
    expect(r.galleries.acc_1!.map((x) => x.id)).toEqual(['lg_2']);
  });

  it('★ 守卫：没有账号 / 空数组 ⇒ **原引用**', () => {
    const g = withTwo();
    expect(removeLovartImages(g, '', ['lg_1']).galleries).toBe(g);
    expect(removeLovartImages(g, 'acc_1', []).galleries).toBe(g);
  });

  it('⚠️ 该账号**没有池**时也会**凭空建键**（源版照样写 `[accountId]: []`）', () => {
    const r = removeLovartImages({}, 'acc_1', ['lg_1']);
    expect(r.galleries).toEqual({ acc_1: [] });
    expect('acc_1' in r.galleries).toBe(true);
  });

  it('删不存在的 id ⇒ 内容不变（但仍是新对象）', () => {
    const g = withTwo();
    const r = removeLovartImages(g, 'acc_1', ['不存在']);
    expect(r.galleries.acc_1).toEqual(g.acc_1);
    expect(r.galleries).not.toBe(g);
  });
});

describe('clearLovartGallery（原 29315）', () => {
  it('★ 把键置成 **`[]`**（**保留键** —— 不是 `delete`）', () => {
    const r = clearLovartGallery({ acc_1: [{ id: 'x' } as never], acc_2: [] }, 'acc_1');
    expect(r.galleries.acc_1).toEqual([]);
    expect('acc_1' in r.galleries).toBe(true);
    expect(r.galleries.acc_2).toEqual([]);
  });

  it('★ 没有账号 ⇒ **原引用**', () => {
    const g: LovartGalleries = {};
    expect(clearLovartGallery(g, '').galleries).toBe(g);
  });
});

describe('shouldMaterializeImage（原 `Tn` 的判据半）', () => {
  it('★ **只有远程 http(s) 才落盘**', () => {
    expect(shouldMaterializeImage('https://x/a.png')).toBe(true);
    expect(shouldMaterializeImage('http://x/a.png')).toBe(true);
  });

  it('★ 本地引用 / data URL / 空 ⇒ 不落盘（原样返回）', () => {
    expect(shouldMaterializeImage('img://a.png')).toBe(false);
    expect(shouldMaterializeImage('file:///a.png')).toBe(false);
    expect(shouldMaterializeImage('data:image/png;base64,AAA')).toBe(false);
    expect(shouldMaterializeImage('')).toBe(false);
  });
});

describe('isLovartJunk（原 `Dc` 23537）', () => {
  const mk = (natW: number, natH: number, sizeBytes = 0) => ({ natW, natH, sizeBytes });

  it('★ 判据①：**最大边 < 96** ⇒ 垃圾（恰好 96 不算）', () => {
    // ⚠️ 我第一版写的是 `mk(50, 200)` —— 但源版取的是 **`Math.max(natW, natH)`**
    //   ⇒ 200 那一维够大就不算垃圾。**单看"有一边小"会算错**。
    expect(isLovartJunk(mk(50, 50))).toBe(true);
    expect(isLovartJunk(mk(95, 95))).toBe(true);
    expect(isLovartJunk(mk(96, 96))).toBe(false);
    expect(isLovartJunk(mk(50, 200))).toBe(false); // 最大边 200 ⇒ 不算
    expect(isLovartJunk({} as never)).toBe(false);
  });

  it('★ 判据②：**没有尺寸**且文件 >0 且 <2048 ⇒ 垃圾', () => {
    expect(isLovartJunk(mk(0, 0, 100))).toBe(true);
    expect(isLovartJunk(mk(0, 0, 0))).toBe(false); // bytes=0 ⇒ 三条都不成立
    // ⚠️ `2048` 这条**看着该放过**，其实被**判据③**接住了（`2048<4096 && 0<512`）
    //   ⇒ 三条判据是**或**关系，"小文件 + 小边长"与"没尺寸"会重叠。我第一版在这里也写错了。
    expect(isLovartJunk(mk(0, 0, 2048))).toBe(true);
  });

  it('★ 判据③：文件 <4096 **且** 边长 <512 ⇒ 垃圾', () => {
    expect(isLovartJunk(mk(300, 300, 3000))).toBe(true);
    expect(isLovartJunk(mk(600, 600, 3000))).toBe(false);
    expect(isLovartJunk(mk(300, 300, 5000))).toBe(false);
  });

  it('★ `minSide` 可覆盖；默认是 96', () => {
    expect(isLovartJunk(mk(200, 200), 300)).toBe(true);
    expect(isLovartJunk(mk(200, 200), 100)).toBe(false);
    expect(LOVART_MIN_SIDE).toBe(96);
  });

  it('★ 空条目 ⇒ **直接算垃圾**', () => {
    expect(isLovartJunk(null)).toBe(true);
    expect(isLovartJunk(undefined)).toBe(true);
  });
});

describe('matchesLovartScope（原 29395-29397）', () => {
  it('★ 哨兵 `!canvas` ⇒ **清掉所有非画布的**（保留 canvas）', () => {
    expect(matchesLovartScope({ scope: 'canvas' }, LOVART_SCOPE_NOT_CANVAS)).toBe(false);
    expect(matchesLovartScope({ scope: 'gallery' }, LOVART_SCOPE_NOT_CANVAS)).toBe(true);
    expect(matchesLovartScope({ scope: '' }, LOVART_SCOPE_NOT_CANVAS)).toBe(true);
  });

  it('★ 显式 scope ⇒ **相等才算**（空 scope 不等于它）', () => {
    expect(matchesLovartScope({ scope: 'canvas' }, 'canvas')).toBe(true);
    expect(matchesLovartScope({ scope: 'gallery' }, 'canvas')).toBe(false);
    expect(matchesLovartScope({ scope: '' }, 'canvas')).toBe(false);
  });
});

describe('purgeLovartImages（原 `purgeLovartJunk` 29346 / `purgeLovartByScope` 29382 的公共体）', () => {
  const mk = (id: string, scope = '') => ({ id, scope }) as never;

  it('★ 不给账号 ⇒ **遍历全部键**', () => {
    const r = purgeLovartImages({ a: [mk('1'), mk('2')], b: [mk('3')] }, null, () => true);
    expect(r.removed).toBe(3);
    expect(r.galleries).toEqual({ a: [], b: [] });
  });

  it('★ 给了账号 ⇒ **只看那一个键**', () => {
    const g = { a: [mk('1')], b: [mk('2')] };
    const r = purgeLovartImages(g, 'a', () => true);
    expect(r.removed).toBe(1);
    expect(r.galleries.b).toBe(g.b);
  });

  it('★ **不是数组 / 空数组 ⇒ 跳过**（⚠️ 空键留在原地，不被删）', () => {
    const r = purgeLovartImages({ a: [], b: [mk('1')], c: 'x' as never }, null, () => true);
    expect(r.removed).toBe(1);
    expect(r.galleries.a).toEqual([]);
    expect('c' in r.galleries).toBe(true);
  });

  it('★★ **无变化 ⇒ 返回原引用**（源版 `return {}` = 不写状态、不落盘）', () => {
    const g = { a: [mk('1')] };
    const r = purgeLovartImages(g, null, () => false);
    expect(r.removed).toBe(0);
    expect(r.galleries).toBe(g);
  });

  it('★ 与 scope 谓词联动：清掉非画布的', () => {
    const g = { a: [mk('1', 'canvas'), mk('2', 'gallery'), mk('3', '')] };
    const r = purgeLovartImages(g, null, (x) => matchesLovartScope(x, LOVART_SCOPE_NOT_CANVAS));
    expect(r.removed).toBe(2);
    expect(r.galleries.a!.map((x) => (x as { id: string }).id)).toEqual(['1']);
  });
});

describe('removeLovartAccount（原 `purgeLovartGallery` 29329）', () => {
  it('★ **`delete` 该键**（与 `clearLovartGallery` 的"置 `[]` 保留键"不同）', () => {
    const r = removeLovartAccount({ acc_1: [{} as never], acc_2: [] }, 'acc_1');
    expect('acc_1' in r.galleries).toBe(false);
    expect('acc_2' in r.galleries).toBe(true);
  });

  it('★ 键不存在 / 没有账号 ⇒ **原引用**（不无中生有）', () => {
    const g = { acc_2: [] };
    expect(removeLovartAccount(g, 'acc_1').galleries).toBe(g);
    expect(removeLovartAccount(g, '').galleries).toBe(g);
  });
});

describe('canvasMaterialBookmarks（原 `Ie` 337-352）', () => {
  const mat = (patch: Record<string, unknown> = {}) => ({
    selected: true,
    type: 'material',
    data: { dataUrl: 'img://a.png', ...patch },
  });

  it('★ 三个条件都要满足：`selected` + `type === \'material\'` + 有 `dataUrl`', () => {
    expect(canvasMaterialBookmarks([{ ...mat(), selected: false }])).toEqual([]);
    expect(canvasMaterialBookmarks([{ ...mat(), type: 'video' }])).toEqual([]);
    expect(canvasMaterialBookmarks([{ ...mat(), data: {} }])).toEqual([]);
    expect(canvasMaterialBookmarks([{ ...mat(), data: null }])).toEqual([]);
    expect(canvasMaterialBookmarks([])).toEqual([]);
    expect(canvasMaterialBookmarks(null)).toEqual([]);
  });

  it('★ 字段映射：`name` 回落链 + `natW/natH` 缺省 **0** + `source` 固定', () => {
    expect(canvasMaterialBookmarks([mat({ label: '我的图', natW: 800, natH: 600 })])).toEqual([
      {
        name: '我的图',
        dataUrl: 'img://a.png',
        natW: 800,
        natH: 600,
        source: LOVART_SOURCE_CANVAS,
      },
    ]);
    // 没有 label ⇒ 用 name；两者都没有 ⇒ 素材节点
    expect(canvasMaterialBookmarks([mat({ name: '别名' })])[0]!.name).toBe('别名');
    expect(canvasMaterialBookmarks([mat()])[0]!.name).toBe('素材节点');
    expect(canvasMaterialBookmarks([mat()])[0]!.natW).toBe(0);
  });

  it('★ `source` 是字面量 `canvas-bookmark`（与磁盘导入的 `import` 区分）', () => {
    expect(LOVART_SOURCE_CANVAS).toBe('canvas-bookmark');
    expect(canvasMaterialBookmarks([mat()])[0]!.source).toBe('canvas-bookmark');
  });

  it('★ **不传 `sizeBytes`**（源版就不传 —— 由 `addLovartImages` 填 0）', () => {
    expect('sizeBytes' in canvasMaterialBookmarks([mat()])[0]!).toBe(false);
  });

  it('★ 只挑**选中的**，其余原样忽略', () => {
    const list = [mat({ label: 'A' }), { ...mat({ label: 'B' }), selected: false }, mat({ label: 'C' })];
    expect(canvasMaterialBookmarks(list).map((x) => x.name)).toEqual(['A', 'C']);
  });
});
