/**
 * 「模糊匹配待确认项」纯规则单测
 * 回源：`a$` 24395 · `l$` 24446 · `c$` 24588 · `My`/`u$` 24615/24626 · `mk` 24661 · `i$` 24438
 *
 * 断言红线：实现一变必红 —— 逐条钉住源版的**四个门槛**、**下标映射**与**归组语义**。
 */

import { describe, expect, it } from 'vitest';
import {
  commonSubstring,
  decodeEntityAt,
  fuzzyCandidates,
  groupCandidates,
  replaceRangeWithRef,
  visibleMap,
  type FuzzyCandidate,
  type FuzzyLibraryItem,
} from '../fuzzyMatch';

const lib = (id: string, name: string, dataUrl = ''): FuzzyLibraryItem => ({ id, name, dataUrl });

describe('decodeEntityAt（原 `u$` 24626-24660）', () => {
  it('具名表 9 条（含三种单引号写法）', () => {
    expect(decodeEntityAt('&nbsp;', 0)).toEqual({ ch: '\u00A0', len: 6 });
    expect(decodeEntityAt('&amp;', 0)).toEqual({ ch: '&', len: 5 });
    expect(decodeEntityAt('&#39;', 0)).toEqual({ ch: "'", len: 5 });
    expect(decodeEntityAt('&#x27;', 0)).toEqual({ ch: "'", len: 6 });
    expect(decodeEntityAt('&#160;', 0)).toEqual({ ch: '\u00A0', len: 6 });
  });

  it('十进制 / 十六进制码点；**码点须在 (0, 1114112)**', () => {
    // ★ 十进制那条是**有意偏离源**（源 `slice(3,-1)` 是 hex 的偏移，`&#65;` 会解成 U+0005）—— 见 TD-03-16
    expect(decodeEntityAt('&#65;', 0)).toEqual({ ch: 'A', len: 5 });
    // ★ 十六进制那条也是**有意偏离源**（源正则漏了 `&` ⇒ 该分支永不执行）—— 同 TD-03-16
    expect(decodeEntityAt('&#x42;', 0)).toEqual({ ch: 'B', len: 6 });
    expect(decodeEntityAt('&#x4E2D;', 0)).toEqual({ ch: '中', len: 8 });
    // 0 与越界都拒绝（源的两个边界）
    expect(decodeEntityAt('&#0;', 0)).toBeNull();
    expect(decodeEntityAt('&#1114112;', 0)).toBeNull();
  });

  it('★ 三种拒绝：非 `&` 开头 · 没有 `;` · **跨度 > 10**', () => {
    expect(decodeEntityAt('abc', 0)).toBeNull();
    expect(decodeEntityAt('&amp', 0)).toBeNull();
    expect(decodeEntityAt('&aaaaaaaaaaa;', 0)).toBeNull(); // `;` 在 12 ⇒ 差 12 > 10
    expect(decodeEntityAt('&aaaaaaaaa;', 0)).toBeNull(); // 差正好 10 ⇒ 进表/正则判定，但都不是 ⇒ null
  });

  it('表里没有、也不是数字实体 ⇒ `null`（原文保留）', () => {
    expect(decodeEntityAt('&unknown;', 0)).toBeNull();
  });
});

describe('visibleMap（原 `mk` 24661-24713）', () => {
  it('纯文本：恒等映射，末尾补一格', () => {
    expect(visibleMap('abc')).toEqual({
      visibleText: 'abc',
      rawToVis: [0, 1, 2, 3],
      visToRaw: [0, 1, 2],
    });
  });

  it('★ 标签整段吃掉（`rawToVis` 置 `-1`），`<br>` 换成换行', () => {
    expect(visibleMap('a<b>c')).toEqual({
      visibleText: 'ac',
      rawToVis: [0, -1, -1, -1, 1, 2],
      visToRaw: [0, 4],
    });
    expect(visibleMap('a<br>b')).toEqual({
      visibleText: 'a\nb',
      rawToVis: [0, -1, -1, -1, -1, 2, 3],
      visToRaw: [0, 1, 5],
    });
    // `<BR/>`（大小写与自闭合）也认
    expect(visibleMap('a<BR/>b').visibleText).toBe('a\nb');
  });

  it('★ 实体：解成一个字符；**首字符那格**指向新字符，其余置 `-1`', () => {
    expect(visibleMap('a&amp;b')).toEqual({
      visibleText: 'a&b',
      rawToVis: [0, 1, -1, -1, -1, -1, 2, 3],
      visToRaw: [0, 1, 6],
    });
  });

  it('★ 孤立的 `<`（后面没有 `>`）⇒ 当普通字符收下', () => {
    expect(visibleMap('a<b').visibleText).toBe('a<b');
  });
});

describe('commonSubstring（原 `a$` 24395-24437）', () => {
  it('最长公共子串 + 它在**第二参**里的下标', () => {
    expect(commonSubstring('abcd', 'xxbcxx')).toEqual({ str: 'bc', indexInB: 2 });
    expect(commonSubstring('小猫插画', '画一只小猫在草地上')).toEqual({ str: '小猫', indexInB: 3 });
  });

  it('没有公共子串 / 有空参 ⇒ 空串 + `-1`', () => {
    expect(commonSubstring('猫猫', '狗狗')).toEqual({ str: '', indexInB: -1 });
    expect(commonSubstring('', 'abc')).toEqual({ str: '', indexInB: -1 });
    expect(commonSubstring('abc', '')).toEqual({ str: '', indexInB: -1 });
  });

  it('★ 源的两个截断：第一参取前 **200**、第二参取前 **4000**', () => {
    // 公共段在第 201 个字符之后 ⇒ 被截掉，看不见
    expect(commonSubstring(`${'a'.repeat(250)}QQ`, 'QQ')).toEqual({ str: '', indexInB: -1 });
    // 挪到 200 以内 ⇒ 找得到
    expect(commonSubstring(`${'a'.repeat(198)}QQ`, 'QQ')).toEqual({ str: 'QQ', indexInB: 0 });
  });
});

describe('fuzzyCandidates（原 `l$` 24446-24587）', () => {
  it('空正文 / 空库 / 库里的无效项 ⇒ 空数组', () => {
    expect(fuzzyCandidates('', [lib('m1', '小猫')])).toEqual([]);
    expect(fuzzyCandidates('小猫', [])).toEqual([]);
    expect(fuzzyCandidates('小猫', [{ id: '', name: '小猫' }, { id: 'm2', name: '  ' }])).toEqual([]);
  });

  it('★ 分词命中 ⇒ `fuzzy:false`，`nameStart/nameEnd` 落在**素材名**里', () => {
    const out = fuzzyCandidates('小猫，在草地', [lib('m1', '小猫插画')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'm1',
      name: '小猫插画',
      keyword: '小猫',
      matchText: '小猫',
      fuzzy: false,
      start: 0,
      end: 2,
      nameStart: 0,
      nameEnd: 2,
      key: 'm1::小猫',
    });
  });

  it('★ 没有词命中 ⇒ 走最长公共子串（`fuzzy:true`），且门槛放行', () => {
    // 正文没有分隔符 ⇒ 只有一个长词，名字不吃它 ⇒ 退化到公共子串「小猫」
    const out = fuzzyCandidates('画一只小猫在草地上', [lib('m1', '小猫插画')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ keyword: '小猫', fuzzy: true, start: 3, end: 5, nameStart: 0, nameEnd: 2 });
  });

  it('★ 门槛：公共子串长度 < `ceil(名长 × 0.5)` ⇒ 丢弃', () => {
    // 名 6 字 ⇒ 需要 ≥ 3 字；公共段只有 2 字「小猫」
    expect(fuzzyCandidates('画一只小猫在草地上', [lib('m1', '小猫插画集锦')])).toEqual([]);
  });

  it('★ 门槛：公共子串**落在已有引用里** ⇒ 丢弃', () => {
    // `@[x|引用]` 里含「引用」两字；名字「引用素材」⇒ 公共段落在引用内部
    const text = '@[x|这是引用]别的内容';
    expect(fuzzyCandidates(text, [lib('m1', '引用素材')])).toEqual([]);
  });

  it('★ 跳过：素材名含 `]` / `|`（会破坏 `@[id|名]` 协议）', () => {
    expect(fuzzyCandidates('小猫，在草地', [lib('m1', '小]猫')])).toEqual([]);
    expect(fuzzyCandidates('小猫，在草地', [lib('m1', '小|猫')])).toEqual([]);
  });

  it('★ 跳过：该素材**已经被引用**（正文里已有同形字面量）', () => {
    const text = '小猫，在草地 @[m1|小猫插画]';
    expect(fuzzyCandidates(text, [lib('m1', '小猫插画')])).toEqual([]);
  });

  it('★ 按 `start` 升序 + 截前 **30** 条', () => {
    const names = Array.from({ length: 35 }, (_, i) => `xK${i}x`);
    const text = Array.from({ length: 35 }, (_, i) => `K${i}`).join('，');
    const out = fuzzyCandidates(
      text,
      names.map((n, i) => lib(`m${i}`, n)),
    );
    expect(out).toHaveLength(30);
    const starts = out.map((c) => c.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('★ 候选字段齐备（含 `dataUrl` 兜底空串）', () => {
    const out = fuzzyCandidates('小猫，在草地', [lib('m1', '小猫插画')]);
    expect(Object.keys(out[0] as object).sort()).toEqual(
      ['dataUrl', 'end', 'fuzzy', 'id', 'key', 'keyword', 'matchText', 'name', 'nameEnd', 'nameStart', 'start'].sort(),
    );
  });
});

describe('groupCandidates（原 `c$` 24588-24614）', () => {
  const c = (id: string, start: number, end: number, keyword = '小猫'): FuzzyCandidate => ({
    id,
    name: id,
    dataUrl: '',
    keyword,
    matchText: keyword,
    fuzzy: false,
    start,
    end,
    nameStart: 0,
    nameEnd: 2,
    key: `${id}::${keyword}`,
  });

  it('★ 同 `start` 归一组（`end` 取更大者）；不同 `start` 各成一组', () => {
    const groups = groupCandidates([c('a', 4, 6), c('b', 4, 8), c('d', 9, 11)]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ start: 4, end: 8, materials: [{ id: 'a' }, { id: 'b' }] });
    expect(groups[1]).toMatchObject({ start: 9, end: 11, materials: [{ id: 'd' }] });
  });

  it('组内先按 `start` 再按 `end` 排序（乱序输入也稳）', () => {
    const groups = groupCandidates([c('d', 9, 11), c('b', 4, 8), c('a', 4, 6)]);
    expect(groups.map((g) => g.start)).toEqual([4, 9]);
    expect(groups[0]?.materials.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('空输入 ⇒ 空数组', () => {
    expect(groupCandidates([])).toEqual([]);
    expect(groupCandidates(null)).toEqual([]);
  });
});

describe('replaceRangeWithRef（原 `i$` 24438-24445）', () => {
  it('★ 相邻有 `参考图` ⇒ **吸收它**（用同一个 `refSpan`）', () => {
    expect(replaceRangeWithRef('小猫 参考图1', '@[m1|小猫]', 0, 2)).toBe('@[m1|小猫]1');
    // ⚠️ `参考图2 小猫` **不吸收** —— 标签与正文之间夹了个 `2`（源 `scanBackward` 要求紧邻，跳空白后必须正好是 `参考图`）\n    expect(replaceRangeWithRef('参考图2 小猫', '@[m1|小猫]', 5, 7)).toBe('参考图2 @[m1|小猫]小猫');\n    expect(replaceRangeWithRef('参考图 小猫', '@[m1|小猫]', 4, 6)).toBe('@[m1|小猫]');
  });

  it('★ 没有相邻 `参考图` ⇒ **就地**在 `start` 处插入', () => {
    expect(replaceRangeWithRef('画小猫在草地', '@[m1|小猫]', 1, 3)).toBe('画@[m1|小猫]小猫在草地');
  });
});
