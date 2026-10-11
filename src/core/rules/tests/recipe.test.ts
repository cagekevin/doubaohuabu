/**
 * 生成配方单测 —— 回源 `uR`(35611) / `dR`(35641)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 * ⚠️ 用**未知模型 id** 让 `normalizeModelLabel` 原样返回，避免测试绑死模型标签表
 */

import { describe, expect, it } from 'vitest';
import {
  formatClock,
  provenanceLabel,
  recipeTextNodePosition,
  snapToGrid,
  readRecipe,
  recipeDetailLines,
  recipeSummaryLine,
  truncateText,
  RECIPE_KEY,
  type RecipeViewLite,
} from '../recipe';

const FULL: RecipeViewLite = {
  prompt: '海边日落',
  model: 'unknown-model-x',
  duration: 5,
  ratio: '16:9',
  styleName: '写实电影感',
  images: [{ label: '素材A' }, { label: '素材B' }],
  textRefs: [{ id: 't1', label: '文本1' }],
  accountName: '豆包01',
};

describe('recipeSummaryLine（原 `uR` 35611）', () => {
  it('全字段 → 按「模型 · 时长 · 比例 · 风格 · 参考图×N · 引用文本×N · 账号」拼接', () => {
    expect(recipeSummaryLine(FULL)).toBe(
      'unknown-model-x · 5s · 16:9 · 写实电影感 · 参考图×2 · 引用文本×1 · 豆包01',
    );
  });

  it('★ 各项按**真值**判断：空串 / `0` / null 都不出现', () => {
    expect(recipeSummaryLine({ model: 'm', duration: 0, ratio: '', styleName: null })).toBe('m');
    expect(recipeSummaryLine({ images: [], textRefs: [], accountName: '' })).toBe('');
  });

  it('只出现「参考图×N」而不列名（与 `dR` 的区别）', () => {
    expect(recipeSummaryLine({ images: [{ label: 'A' }, { label: 'B' }] })).toBe('参考图×2');
  });

  it('空 / null / undefined → 空串', () => {
    expect(recipeSummaryLine(null)).toBe('');
    expect(recipeSummaryLine(undefined)).toBe('');
    expect(recipeSummaryLine({})).toBe('');
  });
});

describe('recipeDetailLines（原 `dR` 35641）', () => {
  it('全字段 → 逐行输出', () => {
    expect(recipeDetailLines(FULL)).toBe(
      [
        '提示词：海边日落',
        '参数：模型 unknown-model-x / 时长 5s / 比例 16:9',
        '风格：写实电影感',
        '参考图：素材A、素材B',
        '出片账号：豆包01',
      ].join('\n'),
    );
  });

  it('★ 「参数」是**整体**：只要有任一子项就输出 `参数：…`', () => {
    expect(recipeDetailLines({ model: 'm' })).toBe('参数：模型 m');
    expect(recipeDetailLines({ ratio: '1:1' })).toBe('参数：比例 1:1');
  });

  it('★ 参考图用 `、` 连接**各图 label**（不是计数）', () => {
    expect(recipeDetailLines({ images: [{ label: 'A' }] })).toBe('参考图：A');
  });

  it('★ 与源一致：label 为空时**不滤**，会出现空项（`A、`）', () => {
    expect(recipeDetailLines({ images: [{ label: 'A' }, {}] })).toBe('参考图：A、');
  });

  it('空 / null / undefined → 空串', () => {
    expect(recipeDetailLines(null)).toBe('');
    expect(recipeDetailLines(undefined)).toBe('');
    expect(recipeDetailLines({})).toBe('');
  });
});

describe('readRecipe（原 `lR` 35577）', () => {
  it('★ 键名是字面量 `recipe`（原 `iR` 35576）', () => {
    expect(RECIPE_KEY).toBe('recipe');
  });

  it('★ 没有 `data` / 键值不是非空对象 ⇒ `null`', () => {
    expect(readRecipe(undefined)).toBeNull();
    expect(readRecipe(null)).toBeNull();
    expect(readRecipe('字符串')).toBeNull();
    expect(readRecipe({})).toBeNull();
    expect(readRecipe({ recipe: null })).toBeNull();
    expect(readRecipe({ recipe: '' })).toBeNull();
    expect(readRecipe({ recipe: 42 })).toBeNull();
  });

  it('★ 是对象 ⇒ 原样返回（**不深拷、不归一**）', () => {
    const raw = { prompt: '海边', model: 'seedance-2.5' };
    expect(readRecipe({ recipe: raw })).toBe(raw);
  });

  it('⚠️ 数组也算对象（源版判据就是 `typeof === "object"`）⇒ 会被返回', () => {
    // 源版如此。实际数据不会出现数组配方，这里**锁住行为**而非"改正"它。
    expect(readRecipe({ recipe: [] })).toEqual([]);
  });
});

describe('truncateText（原 `Gk` 35599）', () => {
  it('★ 先**折叠空白**再 trim', () => {
    expect(truncateText('  a   b\n c ')).toBe('a b c');
  });

  it('★ 空 ⇒ 空串', () => {
    expect(truncateText('')).toBe('');
    expect(truncateText('   \n\t ')).toBe('');
    expect(truncateText(null)).toBe('');
  });

  it('★ **超长才加省略号**，且是单字符 `…`（不是 `...`）', () => {
    expect(truncateText('abc', 3)).toBe('abc');
    expect(truncateText('abcd', 3)).toBe('abc…');
    expect(truncateText('a'.repeat(47))).toBe(`${'a'.repeat(46)}…`);
  });

  it('默认上限 **46**', () => {
    expect(truncateText('a'.repeat(46))).toBe('a'.repeat(46));
    expect(truncateText('a'.repeat(47))).toBe(`${'a'.repeat(46)}…`);
  });

  it('非字符串走 `String()`', () => {
    expect(truncateText(42)).toBe('42');
  });
});

describe('provenanceLabel（原 `fR` 35706）', () => {
  const textNode = (id: string, text: string, label?: string) => ({
    id,
    type: 'text',
    data: { text, ...(label === undefined ? {} : { label }) },
  });

  it('★ `sourceLabel` **优先**（连查都不查）', () => {
    const nodes = [textNode('t1', '海边日落')];
    expect(provenanceLabel({ sourceLabel: '手填的来源', sourceNodeId: 't1' }, nodes)).toBe('手填的来源');
  });

  it('★ 锚点 = `gridAnchor` **或** `sourceNodeId`（前者优先）', () => {
    const nodes = [textNode('g', '来自网格'), textNode('s', '来自源节点')];
    expect(provenanceLabel({ gridAnchor: 'g', sourceNodeId: 's' }, nodes)).toBe('来自网格');
    expect(provenanceLabel({ sourceNodeId: 's' }, nodes)).toBe('来自源节点');
  });

  it('★ 没有锚点 / 找不到节点 ⇒ **空串**（悬空来源不编造）', () => {
    expect(provenanceLabel({}, [])).toBe('');
    expect(provenanceLabel({ sourceNodeId: 'ghost' }, [])).toBe('');
  });

  it('★★ 来源是**文本节点** ⇒ 取正文、剥标签、**截 12 个字符**', () => {
    const nodes = [textNode('t1', '<p>一二三四五六七八九十十一十二十三</p>')];
    // 剥标签 + 折空白后是 13 个字 ⇒ 截 12 + `…`
    expect(provenanceLabel({ sourceNodeId: 't1' }, nodes)).toBe('一二三四五六七八九十十一…');
  });

  it('★ 正文为空 ⇒ 回落 `data.label`，都空则「文本框」', () => {
    expect(provenanceLabel({ sourceNodeId: 't1' }, [textNode('t1', '', '我的文本')])).toBe('我的文本');
    expect(provenanceLabel({ sourceNodeId: 't1' }, [textNode('t1', '   ')])).toBe('文本框');
  });

  it('★ 非文本来源 ⇒ 先取 `data.label`，再回落类型名', () => {
    const nodes = [
      { id: 'v1', type: 'video', data: { label: '成片' } },
      { id: 'v2', type: 'video', data: {} },
    ];
    expect(provenanceLabel({ sourceNodeId: 'v1' }, nodes)).toBe('成片');
    expect(provenanceLabel({ sourceNodeId: 'v2' }, nodes)).toBe('video');
  });

  it('没有 `data` ⇒ 空串', () => {
    expect(provenanceLabel(null, [])).toBe('');
  });
});

describe('formatClock（原 `qd` 40754）—— 视频时长 `m:ss`', () => {
  it('★ 格式是 **`m:ss`**（与配方摘要的 `5s` 是两套，别混）', () => {
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
  });

  it('★ 秒位**补零到 2 位**', () => {
    expect(formatClock(61)).toBe('1:01');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(10)).toBe('0:10');
  });

  it('★ `null`/`undefined` ⇒ 空串，但 **`0` ⇒ `0:00`**（源版是 `!e && e !== 0`）', () => {
    expect(formatClock(null)).toBe('');
    expect(formatClock(undefined)).toBe('');
    expect(formatClock(0)).toBe('0:00');
  });

  it('★ 小数**先向下取整**（源版 `Math.floor`）', () => {
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(60.5)).toBe('1:00');
  });

  it('⚠️ 负数不防（源版不防）—— 会得到带负号的串，照抄', () => {
    // ⚠️ 我第一版写的是 `0:-1`，错了：`Math.floor(-1/60)` 是 **-1**（不是一个很小的负数）
    expect(formatClock(-1)).toBe('-1:-1');
  });
});

describe('snapToGrid（原 `mr` 26150）', () => {
  it('★ 四舍五入到最近的 20 网格', () => {
    expect(snapToGrid({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(snapToGrid({ x: 9, y: 11 })).toEqual({ x: 0, y: 20 });
    expect(snapToGrid({ x: 10, y: 30 })).toEqual({ x: 20, y: 40 });
    expect(snapToGrid({ x: -9, y: -11 })).toEqual({ x: -0, y: -20 });
  });
});

describe('recipeTextNodePosition（原 `addTextNodeFromRecipe` 29462-29472）', () => {
  it('★ 有锚点 ⇒ 落在**正下方**（`x` 不变、`y` 加上高度与 40 间距）', () => {
    expect(recipeTextNodePosition({ position: { x: 100, y: 200 }, height: 300 }, false)).toEqual({
      x: 100,
      y: 540,
    });
  });

  it('★ 高度三级兜底：`height` → `measured.height` → **240**', () => {
    expect(recipeTextNodePosition({ position: { x: 0, y: 0 }, measured: { height: 100 } }, false).y).toBe(140);
    expect(recipeTextNodePosition({ position: { x: 0, y: 0 } }, false).y).toBe(280);
  });

  it('★ 没有锚点 ⇒ `{120, 120}`', () => {
    expect(recipeTextNodePosition(null, false)).toEqual({ x: 120, y: 120 });
    expect(recipeTextNodePosition(undefined, false)).toEqual({ x: 120, y: 120 });
  });

  it('★ `snap` ⇒ 吸附到 20 网格', () => {
    // 100,540 恰好都在网格上 ⇒ 不变
    expect(recipeTextNodePosition({ position: { x: 100, y: 200 }, height: 300 }, true)).toEqual({
      x: 100,
      y: 540,
    });
    // 103,542 ⇒ 100,540
    expect(recipeTextNodePosition({ position: { x: 103, y: 202 }, height: 300 }, true)).toEqual({
      x: 100,
      y: 540,
    });
    // 没有锚点时 {120,120} 本来就在网格上
    expect(recipeTextNodePosition(null, true)).toEqual({ x: 120, y: 120 });
  });

  it('★ **只动 `y`、不动 `x`**（不做"田字格铺开"）', () => {
    const p = recipeTextNodePosition({ position: { x: 777, y: 0 }, height: 0 }, false);
    expect(p.x).toBe(777);
  });
});
