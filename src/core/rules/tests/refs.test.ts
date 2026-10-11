/**
 * `@` 引用协议单测 —— 回源 `U0`(40794) / `Ks`(40795) / `Ja`(40796) / `KL`(40848) / `eu`(40873)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  createRefChipRe,
  filterRefCandidates,
  formatRefMark,
  formatReferenceLabel,
  matchRefTrigger,
  toRefMarker,
  parseRefChips,
  refsToReferenceLabels,
  renumberRefs,
  type ParsedRef,
} from '../refs';

const ref = (n: number, id: string, rawName: string): ParsedRef => ({ n, id, rawName });

describe('协议 token / 正则工厂', () => {
  it('token 只有一处格式化', () => {
    expect(formatReferenceLabel(3)).toBe('参考图3');
    expect(formatRefMark(3)).toBe('@图3');
  });

  it('★ 正则是**工厂**：每次调用都是新实例（无共享可变状态）', () => {
    expect(createRefChipRe()).not.toBe(createRefChipRe());
  });

  it('★ 说明性测试：**共享的 `/g` 正则会被 `.test()` 污染 `lastIndex`** —— 这正是用工厂的原因', () => {
    const shared = /@\[([^\]|]+)\|([^\]]+)\]/g;
    shared.test('@[a|b]'); // 模拟日后有人图省事写 `REF_CHIP_RE.test(s)`
    expect(shared.lastIndex).toBe(6); // ← 被留成非 0

    // 而 `matchAll` 会**复制** lastIndex 作起点 ⇒ 从第 6 位开始，**静默漏掉首条**
    expect([...('@[a|b] @[c|d]'.matchAll(shared))]).toHaveLength(1);
    // 对照：工厂产物是干净的 ⇒ 两条都在
    expect([...('@[a|b] @[c|d]'.matchAll(createRefChipRe()))]).toHaveLength(2);
  });

  it('★ 回归：即使把某次工厂产物污染，也不影响后续解析（无跨调用状态）', () => {
    const polluted = createRefChipRe();
    polluted.lastIndex = 5;
    expect(parseRefChips('@[n1|猫] 与 @[n2|狗]').refs).toHaveLength(2);
  });
});

describe('parseRefChips（原 `Ja` 40796）—— 解析 + 按首次出现分配编号', () => {
  it('`@[id|名]` → `@图N`，并产出 refs', () => {
    const r = parseRefChips('看这个 @[n1|猫] 和 @[n2|狗]');
    expect(r.text).toBe('看这个 @图1 和 @图2');
    expect(r.refs).toEqual([ref(1, 'n1', '猫'), ref(2, 'n2', '狗')]);
  });

  it('★ 同一 id 重复出现 → **复用同一个编号**（不重复进 refs）', () => {
    const r = parseRefChips('@[n1|猫] 与 @[n1|猫] 与 @[n2|狗]');
    expect(r.text).toBe('@图1 与 @图1 与 @图2');
    expect(r.refs).toHaveLength(2);
  });

  it('无引用 → 原样返回、refs 为空', () => {
    expect(parseRefChips('普通文本')).toEqual({ text: '普通文本', refs: [] });
  });

  it('空值 → 空文本 + 空 refs', () => {
    expect(parseRefChips('')).toEqual({ text: '', refs: [] });
    expect(parseRefChips(null)).toEqual({ text: '', refs: [] });
    expect(parseRefChips(undefined)).toEqual({ text: '', refs: [] });
  });

  it('★ 第二参 `transform` 作用在**编号后**的文本上（原 `Ja(e, t)`）', () => {
    const r = parseRefChips('@[n1|猫]', (s) => `[${s}]`);
    expect(r.text).toBe('[@图1]');
    expect(r.refs).toEqual([ref(1, 'n1', '猫')]);
  });

  it('`@` 与 `[` 之间无空格才算引用（正则要求紧邻）', () => {
    expect(parseRefChips('@ [n1|猫]').text).toBe('@ [n1|猫]');
  });
});

describe('refsToReferenceLabels（原 `KL` 40848）—— 发送报文', () => {
  const refs = [ref(1, 'n1', '猫'), ref(2, 'n2', '狗')];

  it('`@图N` → `参考图N`，并按首次出现记录 sentRefs', () => {
    const r = refsToReferenceLabels('@图1 和 @图2', refs);
    expect(r.body).toBe('参考图1 和 参考图2');
    expect(r.sentRefs).toEqual(refs);
  });

  it('★ 去重保序：同一编号只进 `sentRefs` 一次', () => {
    const r = refsToReferenceLabels('@图2 @图1 @图2', refs);
    expect(r.body).toBe('参考图2 参考图1 参考图2');
    expect(r.sentRefs).toEqual([ref(2, 'n2', '狗'), ref(1, 'n1', '猫')]);
  });

  it('★ 不在 refs 里的 `@图N` **原样保留**（源码即如此）', () => {
    const r = refsToReferenceLabels('@图9 与 @图1', refs);
    expect(r.body).toBe('@图9 与 参考图1');
    expect(r.sentRefs).toEqual([ref(1, 'n1', '猫')]);
  });

  it('refs 为空 / null → 文本不变、sentRefs 为空', () => {
    expect(refsToReferenceLabels('@图1', []).body).toBe('@图1');
    expect(refsToReferenceLabels('@图1', null).body).toBe('@图1');
    expect(refsToReferenceLabels('@图1', undefined).sentRefs).toEqual([]);
  });
});

describe('renumberRefs（原 `eu` 40873）—— 重编号压实', () => {
  it('删掉中间引用后压实：`@图1 @图3` → `@图1 @图2`', () => {
    const r = renumberRefs('@图1 @图3', [ref(1, 'a', 'A'), ref(3, 'c', 'C')]);
    expect(r.changed).toBe(true);
    expect(r.text).toBe('@图1 @图2');
    expect(r.refs).toEqual([ref(1, 'a', 'A'), ref(2, 'c', 'C')]);
  });

  it('★ 编号顺序按**正文首次出现**顺序，不按 refs 数组顺序', () => {
    const r = renumberRefs('@图3 先出现，@图1 后出现', [ref(1, 'a', 'A'), ref(3, 'c', 'C')]);
    expect(r.text).toBe('@图1 先出现，@图2 后出现');
    expect(r.refs).toEqual([ref(1, 'c', 'C'), ref(2, 'a', 'A')]);
  });

  it('无需压实 → `changed:false` 且文本/refs 原样（**值**相等）', () => {
    const refs = [ref(1, 'a', 'A'), ref(2, 'b', 'B')];
    const r = renumberRefs('@图1 @图2', refs);
    expect(r.changed).toBe(false);
    expect(r.text).toBe('@图1 @图2');
    expect(r.refs).toEqual(refs);
  });

  it('空文本 / 空 refs → `changed:false`', () => {
    expect(renumberRefs('', [ref(1, 'a', 'A')]).changed).toBe(false);
    expect(renumberRefs('@图1', []).changed).toBe(false);
    expect(renumberRefs('@图1', null).changed).toBe(false);
  });

  it('正文里没有的编号不进 refs（只按实际出现的压）', () => {
    const r = renumberRefs('@图3', [ref(1, 'a', 'A'), ref(3, 'c', 'C')]);
    expect(r.text).toBe('@图1');
    expect(r.refs).toEqual([ref(1, 'c', 'C')]);
  });

  it('★ 两趟替换防撞：`@图1`↔`@图2` 互换不会互相踩', () => {
    const r = renumberRefs('@图2 @图1', [ref(1, 'a', 'A'), ref(2, 'b', 'B')]);
    expect(r.text).toBe('@图1 @图2');
    expect(r.refs).toEqual([ref(1, 'b', 'B'), ref(2, 'a', 'A')]);
  });

  it('★ 未覆盖分支：正文含**不在 refs 里**的 `@图N` ⇒ 该处原样保留', () => {
    const r = renumberRefs('@图1 与 @图5 与 @图3', [ref(1, 'a', 'A'), ref(3, 'c', 'C')]);
    expect(r.text).toBe('@图1 与 @图5 与 @图2'); // `@图5` 不受影响
    expect(r.refs).toEqual([ref(1, 'a', 'A'), ref(2, 'c', 'C')]);
  });

  it('★ 未覆盖分支：正文**重复**出现同一编号 ⇒ 顺序扫描只记一次', () => {
    const r = renumberRefs('@图1 @图1 @图3', [ref(1, 'a', 'A'), ref(3, 'c', 'C')]);
    expect(r.text).toBe('@图1 @图1 @图2');
    expect(r.refs).toEqual([ref(1, 'a', 'A'), ref(2, 'c', 'C')]);
  });

  it('★ **硬化回归**：正文含 `@@R99@@` 字面量时**不得**产出 `@图undefined`', () => {
    const r = renumberRefs('@图1 和 @@R99@@ 与 @图3', [ref(1, 'a', 'A'), ref(3, 'c', 'C')]);
    expect(r.text).toBe('@图1 和 @@R99@@ 与 @图2');
    expect(r.text).not.toContain('undefined');
  });
});

describe('matchRefTrigger（原 CL.jsx:521）—— 只看光标左侧', () => {
  it('★ 刚敲下 `@` ⇒ start 指向它、query 为空串', () => {
    // `写点什么 @`：下标 0..3 是汉字、4 是空格、5 才是 `@`（别漏算空格）
    expect(matchRefTrigger('写点什么 @')).toEqual({ start: 5, query: '' });
    expect('写点什么 @'.indexOf('@')).toBe(5);
  });

  it('★ 带查询词（`\w` 与中文都认）', () => {
    expect(matchRefTrigger('看 @cat')).toEqual({ start: 2, query: 'cat' });
    expect(matchRefTrigger('看 @小猫')).toEqual({ start: 2, query: '小猫' });
  });

  it('★ 查询词后**紧跟空格/中文虚词** ⇒ 不再触发（正则要求匹配到串尾）', () => {
    // `@小猫 的风格`：`@` 后面是 `小猫 ` —— 空格不是查询字符，且匹配必须到串尾 ⇒ 不触发
    expect(matchRefTrigger('用 @小猫 的风格')).toBeNull();
  });

  it('★ **只认紧贴光标的那个** —— `@` 后面有非查询字符 ⇒ 不触发', () => {
    expect(matchRefTrigger('@甲 后面还有字')).toBeNull();
    expect(matchRefTrigger('email@x.com')).toBeNull();
  });

  it('★ 正文中间早已闭合的 `@[id|名]` **不**误触发（`]` 不是查询字符）', () => {
    expect(matchRefTrigger('引用 @[lib_1|素材] 结束')).toBeNull();
    expect(matchRefTrigger('引用 @[lib_1|素材] 再打 @')).toEqual({ start: 18, query: '' });
  });

  it('空串 / 无 `@` ⇒ null', () => {
    expect(matchRefTrigger('')).toBeNull();
    expect(matchRefTrigger('随便写点')).toBeNull();
  });
});

describe('toRefMarker（原 kL.jsx:5）', () => {
  it('★ 形态 `@[id|名字]`', () => {
    expect(toRefMarker('lib_1', '素材甲')).toBe('@[lib_1|素材甲]');
  });

  it('★ 名字里的 `"` 换成 `&quot;`（与源逐字一致，保证与老数据形态相同）', () => {
    expect(toRefMarker('lib_2', 'a"b')).toBe('@[lib_2|a&quot;b]');
  });

  it('★ 与 `createRefChipRe` **能对上**（拼出来的标记必须能被解析回来）', () => {
    const marker = toRefMarker('t_9', '图 1');
    const m = createRefChipRe().exec(marker);
    expect(m?.[1]).toBe('t_9');
    expect(m?.[2]).toBe('图 1');
  });
});

describe('filterRefCandidates', () => {
  const lib = [
    { id: 'a', name: '小猫' },
    { id: 'b', name: 'Cat Photo' },
    { id: 'c', name: '风景' },
    { id: 'd', name: '小猫2' },
  ];

  it('★ 空查询 ⇒ **全给**（刚敲下 `@` 时要列全库）', () => {
    expect(filterRefCandidates(lib, '').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('★ 名称包含即命中（大小写不敏感）', () => {
    expect(filterRefCandidates(lib, 'cat').map((x) => x.id)).toEqual(['b']);
    expect(filterRefCandidates(lib, '小猫').map((x) => x.id)).toEqual(['a', 'd']);
  });

  it('★ 候选**封顶**（默认 8）', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, name: `素材${i}` }));
    expect(filterRefCandidates(many, '素材')).toHaveLength(8);
    expect(filterRefCandidates(many, '素材', 3)).toHaveLength(3);
  });

  it('查不到 ⇒ 空数组（不抛）', () => {
    expect(filterRefCandidates(lib, '不存在的名字')).toEqual([]);
  });
});
