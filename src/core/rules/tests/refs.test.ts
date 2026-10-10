/**
 * `@` 引用协议单测 —— 回源 `U0`(40794) / `Ks`(40795) / `Ja`(40796) / `KL`(40848) / `eu`(40873)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  createRefChipRe,
  formatRefMark,
  formatReferenceLabel,
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
