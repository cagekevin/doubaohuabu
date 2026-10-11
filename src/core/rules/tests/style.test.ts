/**
 * 风格预设纯规则单测（原 `nu` 41147 / `q0` 42740 / `Pt` 26668 / store 30471-30540 / `US.jsx:96-113`）
 *
 * 断言红线：实现一变必红 —— 逐条对齐源版的「尾标点规则」「未命中跳过」「已存在不写盘」等分支。
 */

import { describe, expect, it } from 'vitest';
import {
  defaultStyles,
  makeStyleId,
  normalizeStyleName,
  normalizeStylePrefix,
  planAddStyle,
  planRemoveStyle,
  planUpdateStyle,
  styleCoverGradient,
  stylePrefixOf,
  UNNAMED_STYLE,
} from '../style';
import { DEFAULT_STYLE_PRESETS } from '@/constants/stylePresets';

const sty = (id: string, name: string, prefix: string) => ({ id, name, prefix });

describe('makeStyleId（原 `Pt(\u0027sty\u0027)`）', () => {
  it('形状 = `sty_<时间36>_<序号>`', () => {
    expect(makeStyleId(1700000000000, 3)).toBe(`sty_${(1700000000000).toString(36)}_3`);
  });
});

describe('normalizeStyleName / normalizeStylePrefix（原 `US.jsx:97-98`）', () => {
  it('名称 trim；空 ⇒ 「未命名风格」', () => {
    expect(normalizeStyleName('  国风  ')).toBe('国风');
    expect(normalizeStyleName('   ')).toBe(UNNAMED_STYLE);
    expect(normalizeStyleName(null)).toBe(UNNAMED_STYLE);
  });

  it('★ 前缀：trim + 去**一个**尾标点 + 补 `，`', () => {
    expect(normalizeStylePrefix('国风，')).toBe('国风，');
    expect(normalizeStylePrefix('国风, ')).toBe('国风，');
    // ⚠️ 源正则是 `[，,]\s*$`（**没有 `+`**）⇒ 两个尾标点只去一个
    expect(normalizeStylePrefix('国风，，')).toBe('国风，，');
    expect(normalizeStylePrefix('')).toBe('，');
  });
});

describe('stylePrefixOf（原 `nu` 的 prefix 半）', () => {
  const styles = [sty('a', '国风', '国风插画，'), sty('b', '扁平', '扁平矢量')];

  it('★ 逐条去**全部**尾标点 → `join(\u0027，\u0027)` → **末尾再补一个 `，`**', () => {
    expect(stylePrefixOf(['a'], styles)).toBe('国风插画，');
    expect(stylePrefixOf(['a', 'b'], styles)).toBe('国风插画，扁平矢量，');
  });

  it('★ 未命中的 id **跳过**（不抛、不进 parts）', () => {
    expect(stylePrefixOf(['nope', 'a'], styles)).toBe('国风插画，');
    expect(stylePrefixOf(['nope'], styles)).toBe('');
  });

  it('空表 / 空 styles ⇒ 空串', () => {
    expect(stylePrefixOf([], styles)).toBe('');
    expect(stylePrefixOf(null, null)).toBe('');
    expect(stylePrefixOf(['a'], [])).toBe('');
  });

  it('★ 用**内置表**时与旧实现等价（前缀自带尾 `，` ⇒ 结果不变）', () => {
    const id = DEFAULT_STYLE_PRESETS[0]!.id;
    expect(stylePrefixOf([id], DEFAULT_STYLE_PRESETS)).toBe(DEFAULT_STYLE_PRESETS[0]!.prefix);
  });
});

describe('styleCoverGradient（原 `q0`）', () => {
  it('★ 同名 ⇒ 同色（确定性）；空名 ⇒ 用字面量 `风`', () => {
    expect(styleCoverGradient('国风')).toBe(styleCoverGradient('国风'));
    expect(styleCoverGradient('国风')).not.toBe(styleCoverGradient('扁平'));
    expect(styleCoverGradient('')).toBe(styleCoverGradient('风'));
  });

  it('形状是 `linear-gradient(135deg, hsl(…) , hsl(…))`', () => {
    expect(styleCoverGradient('x')).toMatch(/^linear-gradient\(135deg, hsl\(\d+ 72% 84%\), hsl\(\d+ 66% 68%\)\)$/);
  });
});

describe('planAddStyle（原 `addStyle` 30490-30509）', () => {
  const idFactory = () => 'sty_new';

  it('★ 空 / 无 name ⇒ `null`（调用方什么都不做）', () => {
    expect(planAddStyle([], null, idFactory)).toBeNull();
    expect(planAddStyle([], { prefix: 'x' }, idFactory)).toBeNull();
  });

  it('正常新增：追加到末尾 + 用工厂 id', () => {
    const r = planAddStyle([sty('a', '国风', 'x')], { name: '新风格', prefix: 'y' }, idFactory);
    expect(r).toEqual({
      id: 'sty_new',
      added: true,
      styles: [sty('a', '国风', 'x'), { id: 'sty_new', name: '新风格', prefix: 'y' }],
    });
  });

  it('★ id 已存在 ⇒ `added:false`（**调用方不得 set** —— 源只回 id、不写盘）', () => {
    const r = planAddStyle([sty('a', '国风', 'x')], { id: 'a', name: '改' }, idFactory);
    expect(r?.added).toBe(false);
    expect(r?.id).toBe('a');
    expect(r?.styles).toEqual([sty('a', '国风', 'x')]);
  });
});

describe('planUpdateStyle / planRemoveStyle（原 30510-30540）', () => {
  it('update：`patch` 覆盖同名键，其余不动；`!id || !patch` ⇒ `null`', () => {
    const list = [sty('a', '国风', 'x'), sty('b', '扁平', 'y')];
    expect(planUpdateStyle(list, 'a', { name: '国风2' })).toEqual([
      sty('a', '国风2', 'x'),
      sty('b', '扁平', 'y'),
    ]);
    expect(planUpdateStyle(list, null, { name: 'x' })).toBeNull();
    expect(planUpdateStyle(list, 'a', null)).toBeNull();
  });

  it('remove：按 id 过滤；`!id` ⇒ `null`', () => {
    const list = [sty('a', '国风', 'x'), sty('b', '扁平', 'y')];
    expect(planRemoveStyle(list, 'a')).toEqual([sty('b', '扁平', 'y')]);
    expect(planRemoveStyle(list, null)).toBeNull();
  });
});

describe('defaultStyles（原 `resetStyles`）', () => {
  it('★ 值等于内置表、但**是新数组新对象**（改副本不影响内置表）', () => {
    const out = defaultStyles();
    expect(out).toEqual(DEFAULT_STYLE_PRESETS);
    expect(out).not.toBe(DEFAULT_STYLE_PRESETS);
    out[0]!.name = '改过了';
    expect(DEFAULT_STYLE_PRESETS[0]!.name).not.toBe('改过了');
  });
});
