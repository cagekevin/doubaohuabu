import { describe, expect, it } from 'vitest';
import {
  countRecurringAsset,
  createNearDupWindow,
  decideScanEnd,
  emptyRecurringTable,
  filterValidScans,
  freshScannedItems,
  isRecurringTable,
  isValidScan,
  pruneRecurringAssets,
  scanKeyOf,
  stripScanKeys,
} from '../resultScan';
import {
  GEN_NO_REAL_IMAGE_MS,
  GEN_SILENT_MS,
  GEN_TIMEOUT_MS,
} from '@/constants';

describe('scanKeyOf（去重键 = 原 `Od`）', () => {
  it('★ 同一张图**不同签名** ⇒ 同一个键（否则永远判不出重复）', () => {
    const a = 'https://x.com/gen/a.png?sign=AAA&x-expires=1';
    const b = 'https://x.com/gen/a.png?sign=BBB&x-expires=2';
    expect(scanKeyOf(a)).toBe(scanKeyOf(b));
  });

  it('★ 非签名参数**保留**（`Od` 与 `Si` 的区别：只摘签名类）', () => {
    expect(scanKeyOf('https://x.com/a.png?w=480&sign=z')).toContain('w=480');
  });

  it('`data:` / `blob:` 原样（无签名可去）', () => {
    expect(scanKeyOf('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(scanKeyOf('blob:https://x/1')).toBe('blob:https://x/1');
  });

  it('解析失败 / 空串 原样返回（不抛）', () => {
    expect(scanKeyOf('not a url')).toBe('not a url');
    expect(scanKeyOf('')).toBe('');
  });

  it('`stripScanKeys` **保序**（源是 `forEach`）', () => {
    expect(stripScanKeys([{ url: 'https://x.com/1.png?sign=a' }, { url: 'https://x.com/2.png' }])).toEqual([
      'https://x.com/1.png',
      'https://x.com/2.png',
    ]);
  });
});

describe('freshScannedItems（原 `:36452-36455` 的 filter）', () => {
  const items = [{ url: 'https://x.com/a.png' }, { url: 'https://x.com/b.png' }];

  it('★ **排除基线**（页面上已有的图不是本轮结果）', () => {
    const out = freshScannedItems(items, ['https://x.com/a.png'], []);
    expect(out.map((o) => o.key)).toEqual(['https://x.com/b.png']);
  });

  it('★ **排除已处理**（哪怕它不在基线里）', () => {
    const out = freshScannedItems(items, [], ['https://x.com/a.png']);
    expect(out.map((o) => o.key)).toEqual(['https://x.com/b.png']);
  });

  it('★ 基线比对用**去签名键**（签名变了仍算旧图）', () => {
    // 基线来自 `stripScanKeys`（首轮扫描的产物）—— 不是原始 URL
    const baseline = stripScanKeys([{ url: 'https://x.com/a.png?sign=OLD' }]);
    const out = freshScannedItems([{ url: 'https://x.com/a.png?sign=NEW' }], baseline, []);
    expect(out).toEqual([]);
  });

  it('★ **原样带上原始项**（不能剥字段 —— `kind` 决定要不要走网络取回）', () => {
    const typed = [{ url: 'https://x.com/c.png', kind: 'http' as const, w: 800, h: 600 }];
    const out = freshScannedItems(typed, [], []);
    expect(out[0]?.item).toEqual({ url: 'https://x.com/c.png', kind: 'http', w: 800, h: 600 });
    expect(out[0]?.key).toBe('https://x.com/c.png');
  });

  it('保序；空输入 ⇒ 空数组', () => {
    const three = [{ url: 'https://x.com/1.png' }, { url: 'https://x.com/2.png' }, { url: 'https://x.com/3.png' }];
    expect(freshScannedItems(three, [], []).map((o) => o.key)).toEqual([
      'https://x.com/1.png',
      'https://x.com/2.png',
      'https://x.com/3.png',
    ]);
    expect(freshScannedItems([], [], [])).toEqual([]);
  });
});

describe('decideScanEnd（原 `:36532-36541` 的三档）', () => {
  const base = { sinceLastProgressMs: 0, emitted: 0, sawPlaceholder: false, sinceStartMs: 0 };

  it('★ 有产出且静默超 `ER` ⇒ `settled`', () => {
    expect(decideScanEnd({ ...base, emitted: 2, sinceLastProgressMs: GEN_SILENT_MS + 1 })).toBe('settled');
  });

  it('★ **严格大于**：恰好等于 `ER` 不收工（源 `z > ER`）', () => {
    expect(decideScanEnd({ ...base, emitted: 2, sinceLastProgressMs: GEN_SILENT_MS })).toBeNull();
  });

  it('一张都没出 ⇒ 不判 `settled`（哪怕静默很久 —— 那是另一档）', () => {
    expect(decideScanEnd({ ...base, emitted: 0, sinceLastProgressMs: GEN_SILENT_MS + 1 })).toBeNull();
  });

  it('★ 无产出 + **见过占位图** + 超 `jR` ⇒ `no-real-image`', () => {
    expect(
      decideScanEnd({ ...base, emitted: 0, sawPlaceholder: true, sinceLastProgressMs: GEN_NO_REAL_IMAGE_MS + 1 }),
    ).toBe('no-real-image');
  });

  it('★ **没见过占位图** ⇒ 不判 `no-real-image`（"还没出图"不是"只有占位图"）', () => {
    expect(
      decideScanEnd({ ...base, emitted: 0, sawPlaceholder: false, sinceLastProgressMs: GEN_NO_REAL_IMAGE_MS + 1 }),
    ).toBeNull();
  });

  it('★ 已有产出 ⇒ 不判 `no-real-image`（哪怕也见过占位图）', () => {
    expect(
      decideScanEnd({ ...base, emitted: 1, sawPlaceholder: true, sinceLastProgressMs: GEN_NO_REAL_IMAGE_MS + 1 }),
    ).toBe('settled');
  });

  it('★ 总超时用 `_R`（600000）—— **25 秒不再判超时**（旧常量引错源 `Vo` 的回归断言）', () => {
    expect(decideScanEnd({ ...base, emitted: 0, sinceStartMs: 25000 })).toBeNull();
    expect(decideScanEnd({ ...base, emitted: 0, sinceStartMs: GEN_TIMEOUT_MS + 1 })).toBe('timeout');
  });

  it('优先级：`settled` 先于 `timeout`（源同序）', () => {
    expect(
      decideScanEnd({
        emitted: 1,
        sawPlaceholder: false,
        sinceLastProgressMs: GEN_SILENT_MS + 1,
        sinceStartMs: GEN_TIMEOUT_MS + 1,
      }),
    ).toBe('settled');
  });
});

describe('跨会话去重表（原 `TR`/`PR`/`p0`）', () => {
  it('`isRecurringTable`：两个桶都是对象才算数（源 `t.urls && t.hashes`）', () => {
    expect(isRecurringTable(emptyRecurringTable())).toBe(true);
    expect(isRecurringTable(null)).toBe(false);
    expect(isRecurringTable([])).toBe(false);
    expect(isRecurringTable({ urls: {} })).toBe(false);
    expect(isRecurringTable({ urls: [], hashes: [] })).toBe(false); // ⚠️ 数组不算对象桶
  });

  it('★ 首次见到 ⇒ 计数 1，并写入 `{n, last}`（源 `p0`）', () => {
    const t = emptyRecurringTable();
    const seen = new Set<string>();
    expect(countRecurringAsset(t, 'urls', 'https://x/a.png', seen, 111)).toBe(1);
    expect(t.urls['https://x/a.png']).toEqual({ n: 1, last: 111 });
  });

  it('★ **同一场轮询内不重复叠加**（`seen` 整场共用 —— 源 `d` `:36351`）', () => {
    const t = emptyRecurringTable();
    const seen = new Set<string>();
    countRecurringAsset(t, 'urls', 'k', seen, 1);
    expect(countRecurringAsset(t, 'urls', 'k', seen, 2)).toBe(1);
    expect(t.urls.k).toEqual({ n: 1, last: 1 }); // `last` 也没被后一次覆盖
  });

  it('★ **换一场轮询**（新的 `seen`）⇒ 计数 +1 —— 这才是「≥2 判固有素材」的来源', () => {
    const t = emptyRecurringTable();
    countRecurringAsset(t, 'urls', 'k', new Set<string>(), 1); // 第 1 场
    expect(countRecurringAsset(t, 'urls', 'k', new Set<string>(), 2)).toBe(2); // 第 2 场
    expect(t.urls.k).toEqual({ n: 2, last: 2 });
  });

  it('空 key ⇒ 0，且**不写表**（源 `if (!n) return e[t][n] || 0`）', () => {
    const t = emptyRecurringTable();
    expect(countRecurringAsset(t, 'urls', '', new Set<string>(), 1)).toBe(0);
    expect(t.urls).toEqual({});
  });

  it('★ 两个桶**互不干扰**（同名字符串在 `urls` / `hashes` 各算各的）', () => {
    const t = emptyRecurringTable();
    const seen = new Set<string>();
    expect(countRecurringAsset(t, 'urls', 'SAME', seen, 1)).toBe(1);
    expect(countRecurringAsset(t, 'hashes', 'SAME', seen, 1)).toBe(1);
    expect(t.urls.SAME).toEqual({ n: 1, last: 1 });
    expect(t.hashes.SAME).toEqual({ n: 1, last: 1 });
  });

  it('`prune`：**恰好 400 不裁**（源 `r.length <= $R` 就返回）', () => {
    const t = emptyRecurringTable();
    for (let i = 0; i < 400; i++) t.urls[`u${i}`] = { n: 1, last: i };
    pruneRecurringAssets(t);
    expect(Object.keys(t.urls)).toHaveLength(400);
  });

  it('★ 401 条 ⇒ 按 `last` 升序**丢掉较旧的前半**（源 `slice(floor(len/2))`）', () => {
    const t = emptyRecurringTable();
    for (let i = 0; i < 401; i++) t.urls[`u${i}`] = { n: 1, last: i };
    pruneRecurringAssets(t);
    const kept = Object.keys(t.urls);
    expect(kept).toHaveLength(201); // 401 - floor(401/2) = 201
    expect(t.urls.u0).toBeUndefined(); // 最旧的那条没了
    expect(t.urls.u400).toBeDefined(); // 最新的那条还在
  });

  it('★ 两个桶**各自裁**（一个超限不影响另一个）', () => {
    const t = emptyRecurringTable();
    for (let i = 0; i < 401; i++) t.urls[`u${i}`] = { n: 1, last: i };
    t.hashes.h1 = { n: 1, last: 5 };
    pruneRecurringAssets(t);
    expect(Object.keys(t.urls)).toHaveLength(201);
    expect(t.hashes).toEqual({ h1: { n: 1, last: 5 } });
  });
});

describe('有效性滤网（原 `RR`，`:36323-36334`）', () => {
  const ok = (w: number, h: number) => ({ url: 'https://p3.doubao.com/gen/abc.png', w, h });

  it('★ 非 `http(s)` 一律丢 —— **`data:` / `blob:` 也算不合格**', () => {
    expect(isValidScan({ url: 'data:image/png;base64,AAA', w: 1024, h: 768 })).toBe(false);
    expect(isValidScan({ url: 'blob:https://x/1', w: 1024, h: 768 })).toBe(false);
    expect(isValidScan({ url: 'img://a1228ab1c4f684cf.png', w: 1024, h: 768 })).toBe(false);
  });

  it('★ `.svg` 丢（含带 query 的 `foo.svg?x=1`）', () => {
    expect(isValidScan({ url: 'https://x.com/a.svg', w: 1024, h: 768 })).toBe(false);
    expect(isValidScan({ url: 'https://x.com/a.svg?v=2', w: 1024, h: 768 })).toBe(false);
  });

  it('★ 装饰图（`MR`）丢：`avatar` / `icon` / `logo` / `placeholder` / `/flags/`', () => {
    for (const name of ['avatar', 'emoji_1', 'expression', 'icon-set', 'logo', 'badge', 'sprite', 'placeholder', 'brand', 'fe-icon', 'flags/us']) {
      expect(isValidScan({ url: `https://x.com/${name}.png`, w: 1024, h: 768 })).toBe(false);
    }
  });

  it('★ 尺寸：`min(w,h) >= 220` **且** `max(w,h) > 512`', () => {
    expect(isValidScan(ok(1024, 768))).toBe(true);
    expect(isValidScan(ok(513, 800))).toBe(true);
    expect(isValidScan(ok(300, 300))).toBe(false); // 长边 300 <= 512
    expect(isValidScan(ok(100, 800))).toBe(false); // 短边 100 < 220
  });

  it('★ 边界**严格**：`max === 512` 丢、`max === 513` 留；`min === 220` 留、`min === 219` 丢', () => {
    expect(isValidScan(ok(512, 300))).toBe(false); // max === 512
    expect(isValidScan(ok(513, 300))).toBe(true); // max === 513
    expect(isValidScan(ok(220, 800))).toBe(true); // min === 220
    expect(isValidScan(ok(219, 800))).toBe(false); // min === 219
  });

  it('★ **量不到尺寸 ⇒ 放行**（源 `!n || !r || …` 两个子句都短路为真）', () => {
    expect(isValidScan({ url: 'https://x.com/a.png' })).toBe(true);
    expect(isValidScan(ok(0, 0))).toBe(true);
  });

  it('空 / 无 `url` ⇒ false', () => {
    expect(isValidScan(null)).toBe(false);
    expect(isValidScan({ url: '' })).toBe(false);
  });

  it('`filterValidScans` **保序**且只留合格项', () => {
    const items = [
      { url: 'https://x.com/a.png', w: 1024, h: 768 },
      { url: 'https://x.com/icon.png', w: 1024, h: 768 },
      { url: 'https://x.com/b.png', w: 1024, h: 768 },
      { url: 'data:image/png;base64,AAA', w: 1024, h: 768 },
    ];
    expect(filterValidScans(items).map((o) => o.url)).toEqual(['https://x.com/a.png', 'https://x.com/b.png']);
  });
});

describe('近重复窗口（原 `wl`，`:36288` + `k` 的判定 `:36390-36397`）', () => {
  const A = '0000000000000000';
  const B = '000000000000ffff'; // 与 A 距 16
  const C = '00000000ffff0000'; // 与 A / B 各距 16 / 32

  it('★ 空哈希 ⇒ `false` 且**不记入**（源 `if (E) {…}` 整段跳过）', () => {
    const w = createNearDupWindow();
    expect(w.check('')).toBe(false);
    expect(w.check('')).toBe(false);
  });

  it('★ 首次见 ⇒ `false`；同一个再来 ⇒ `true`（记入后即命中）', () => {
    const w = createNearDupWindow();
    expect(w.check(A)).toBe(false);
    expect(w.check(A)).toBe(true);
  });

  it('★ 阈值是**汉明距离 ≤ 8**：距 8 命中、距 9 不命中', () => {
    const w = createNearDupWindow();
    w.check('0000000000000000');
    expect(w.check('00000000000000ff')).toBe(true); // 8 位
    const w2 = createNearDupWindow();
    w2.check('0000000000000000');
    expect(w2.check('00000000000001ff')).toBe(false); // 9 位
  });

  it('★ 超出上限**挤掉最旧的**（源 `wl.length > 120` ⇒ `shift`）', () => {
    const w = createNearDupWindow(2, 8);
    expect(w.check(A)).toBe(false);
    expect(w.check(B)).toBe(false);
    expect(w.check(C)).toBe(false); // 塞入 C ⇒ A 被挤掉
    // A 已不在窗口里 ⇒ 再查 A 不命中（若未被挤掉会是 true）
    expect(w.check(A)).toBe(false);
  });
});
