/**
 * 生成配方单测 —— 回源 `uR`(35611) / `dR`(35641)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 * ⚠️ 用**未知模型 id** 让 `normalizeModelLabel` 原样返回，避免测试绑死模型标签表
 */

import { describe, expect, it } from 'vitest';
import { recipeDetailLines, recipeSummaryLine, type RecipeViewLite } from '../recipe';

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
