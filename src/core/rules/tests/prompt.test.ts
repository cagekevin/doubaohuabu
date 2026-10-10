/**
 * 提示词组装单测 —— 对应 docs/08-验证用例.md **W7**（幂等）+ **W8**（风格拼接）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  applyStylePrefix,
  clampImageCount,
  composeBody,
  composeImagePrompt,
  composeVideoPrompt,
  isPreformatted,
  normalizeModelLabel,
  normalizeResolution,
  resolveReferences,
  stripGeneratedArtifacts,
  videoParamsSuffix,
} from '../prompt';

/** 统计出现次数 */
const countOf = (haystack: string, needle: string | RegExp): number =>
  typeof needle === 'string'
    ? haystack.split(needle).length - 1
    : (haystack.match(needle) ?? []).length;

describe('W7 · 图片提示词幂等（原 `PL` 的 5 条剥离）', () => {
  it('★ 正文已含「画一张：」+「图片分辨率 4K」→ 组装后各只出现 1 次', () => {
    const out = composeImagePrompt({
      text: '画一张：一只猫，图片分辨率 4K',
      ratio: '1:1',
      count: 1,
      model: 'Seedream 5.0 Pro',
      resolution: '2K',
    });

    expect(countOf(out, /画一张[:：]/g)).toBe(1);
    expect(countOf(out, /图片分辨率/g)).toBe(1);
    // 剥离后保留的是**本次参数**（2K），不是正文里写的 4K
    expect(out).toContain('图片分辨率 2K');
    expect(out).not.toContain('4K');
    expect(out).toContain('一只猫');
  });

  it('★ 5 条模式各自都能被剥离（表驱动）', () => {
    const cases: Array<[string, string]> = [
      ['画一张：一只猫', '一只猫'],
      ['一只猫，图片分辨率 4K', '一只猫'],
      ['一只猫，使用 Seedream 5.0 Pro 模型', '一只猫'],
      ['一只猫，生成 3 张图片', '一只猫'],
      ['一只猫，只生成 1 张图片', '一只猫'],
      ['一只猫，画面比例 16:9', '一只猫'],
    ];
    for (const [input, expectedBody] of cases) {
      const out = composeImagePrompt({ text: input, ratio: '1:1', count: 1 });
      expect(out, input).toContain(expectedBody);
      expect(countOf(out, /画一张[:：]/g), input).toBe(1);
    }
  });

  it('★ 组合输入：全部模式同时出现也只各剩一次', () => {
    const out = composeImagePrompt({
      text: '画一张：一只猫，画面比例 16:9，生成 2 张图片，使用 Seedream 5.0 Flash 模型，图片分辨率 1K',
      ratio: '9:16',
      count: 4,
      model: 'Seedream 5.0 Pro',
      resolution: '4K',
    });
    expect(countOf(out, /画一张[:：]/g)).toBe(1);
    expect(countOf(out, /图片分辨率/g)).toBe(1);
    expect(countOf(out, /使用/g)).toBe(1);
    expect(countOf(out, /画面比例/g)).toBe(1);
    expect(countOf(out, /张图片/g)).toBe(1);
    expect(out).toContain('生成 4 张图片');
    expect(out).toContain('画面比例 9:16');
  });

  it('★ 幂等：对已组装的结果再组装一次，正文不叠加', () => {
    const first = composeImagePrompt({ text: '一只猫', ratio: '1:1', count: 1, resolution: '2K' });
    const second = composeImagePrompt({ text: first, ratio: '1:1', count: 1, resolution: '2K' });
    expect(countOf(second, /画一张[:：]/g)).toBe(1);
    expect(countOf(second, /图片分辨率/g)).toBe(1);
    expect(countOf(second, /一只猫/g)).toBe(1);
  });

  it('张数：1 张用「只生成 1 张图片」，>1 用「生成 N 张图片」', () => {
    expect(composeImagePrompt({ text: '猫', count: 1 })).toContain('只生成 1 张图片');
    expect(composeImagePrompt({ text: '猫', count: 3 })).toContain('生成 3 张图片');
  });

  it('ratio=auto 时不写画面比例', () => {
    const out = composeImagePrompt({ text: '猫', ratio: 'auto', count: 1 });
    expect(out).not.toContain('画面比例');
  });

  it('★ 空正文：`im` 早退返回空串，但 `PL` **仍会包壳**（源码如此，不是 bug）', () => {
    // 回源 shared.js:40361-40410 —— PL 没有对空正文早退，只有内部的 im 会返回 ''
    // ⇒ 结果是 `画一张：，只生成 1 张图片`（正文位置为空）
    expect(composeImagePrompt({ text: '   ' })).toBe('画一张：，只生成 1 张图片');
    expect(composeImagePrompt({})).toBe('画一张：，只生成 1 张图片');
  });

  it('对比：`composeBody` 才会早退（原 `im`）', () => {
    expect(composeBody({ body: '   ', mediaType: 'image' })).toBe('');
    expect(composeBody({ body: '', mediaType: 'video' })).toBe('');
  });

  it('非法分辨率被丢弃', () => {
    expect(composeImagePrompt({ text: '猫', resolution: '8K' })).not.toContain('图片分辨率');
    expect(composeImagePrompt({ text: '猫', resolution: '2K' })).toContain('图片分辨率 2K');
  });
});

describe('W8 · 风格前缀拼接（原 `im` 的 image 分支）', () => {
  it('★ 前缀在正文之前，且**无分隔符**', () => {
    const out = applyStylePrefix('一只猫', '国风二次元插画风格，工笔线条，青绿山水配色，');
    expect(out).toBe('国风二次元插画风格，工笔线条，青绿山水配色，一只猫');
  });

  it('★ W8 完整用例：风格 + 正文 → 提示词以风格开头', () => {
    const out = composeImagePrompt({
      text: '一只猫',
      stylePrefix: '国风二次元插画风格，工笔线条，青绿山水配色，',
    });
    expect(out.startsWith('画一张：国风二次元插画风格，工笔线条，青绿山水配色，一只猫')).toBe(true);
  });

  it('空前缀 → 原样返回', () => {
    expect(applyStylePrefix('一只猫', '')).toBe('一只猫');
    expect(applyStylePrefix('一只猫', '   ')).toBe('一只猫');
  });
});

describe('视频组装（原 `im` video 分支 + `rR`）', () => {
  it('★ 未格式化 → 包装为「视频生成 …」并补参数后缀', () => {
    const out = composeVideoPrompt({ text: '一只猫在跳舞', model: 'seedance-2.0', duration: 5, ratio: '16:9' });
    expect(out).toBe('视频生成 一只猫在跳舞，画面比例 16:9，duration=5，--模型:Seedance 2.0');
  });

  it('★ 已格式化 → **不套娃**（原 `nR` 守卫）', () => {
    const preformatted = '视频生成 一只猫，画面比例 16:9，duration=5，--模型:Seedance 2.0';
    expect(isPreformatted(preformatted)).toBe(true);
    const out = composeVideoPrompt({ text: preformatted, model: 'seedance-2.5', duration: 10 });
    expect(out).toBe(preformatted);
  });

  it('★ 已格式化 + 新风格前缀 → 补前缀（不重复）', () => {
    const preformatted = '视频生成 一只猫，画面比例 16:9，duration=5，--模型:Seedance 2.0';
    const out = composeVideoPrompt({ text: preformatted, stylePrefix: '水墨风，' });
    expect(out).toBe(`水墨风，${preformatted}`);
    // 再调一次不叠加
    expect(composeVideoPrompt({ text: out, stylePrefix: '水墨风，' })).toBe(out);
  });

  it('duration 非有限数 → 5；ratio auto → 16:9', () => {
    expect(videoParamsSuffix({ model: 'seedance-2.0', duration: 'abc', ratio: 'auto' })).toBe(
      '，画面比例 16:9，duration=5，--模型:Seedance 2.0',
    );
  });

  it('mediaType=image 时后缀为空串', () => {
    expect(videoParamsSuffix({ model: 'seedance-2.0', mediaType: 'image' })).toBe('');
  });
});

describe('模型 / 参数规范化（原 `io` / `PL`）', () => {
  it('★ id → 展示名', () => {
    expect(normalizeModelLabel('seedance-2.5')).toBe('Seedance 2.5');
    expect(normalizeModelLabel('seedance-2.0-fast')).toBe('Seedance 2.0 Fast');
  });

  it('★ 未知 id 原样返回；空 → 默认', () => {
    expect(normalizeModelLabel('my-custom-model')).toBe('my-custom-model');
    expect(normalizeModelLabel('')).toBe('Seedance 2.0 Mini');
    expect(normalizeModelLabel(null)).toBe('Seedance 2.0 Mini');
  });

  it('★ 张数夹到 [1,4]（原 `Math.max(1, Math.min(4, ...))`）', () => {
    expect(clampImageCount(0)).toBe(1);
    expect(clampImageCount(-3)).toBe(1);
    expect(clampImageCount(2)).toBe(2);
    expect(clampImageCount(99)).toBe(4);
    expect(clampImageCount('3')).toBe(3);
    expect(clampImageCount(undefined)).toBe(1);
  });

  it('分辨率白名单', () => {
    expect(normalizeResolution('1K')).toBe('1K');
    expect(normalizeResolution(' 2K ')).toBe('2K');
    expect(normalizeResolution('4k')).toBe('');
    expect(normalizeResolution('')).toBe('');
  });
});

describe('痕迹剥离（原 `Vk` / `tR`）', () => {
  it('★ 反复剥离直到稳定（最多 8 轮）', () => {
    const out = stripGeneratedArtifacts('视频生成 一只猫，画面比例 16:9，duration=5，--模型:Seedance 2.0');
    expect(out).toBe('一只猫');
  });

  it('剥离「请直接开始生成 / 无需确认参数 / 不要反问」等指令尾巴', () => {
    const out = stripGeneratedArtifacts('一只猫，请直接开始生成，无需确认参数');
    expect(out).toBe('一只猫');
  });

  it('空输入 → 空串', () => {
    expect(stripGeneratedArtifacts('')).toBe('');
    expect(stripGeneratedArtifacts(null)).toBe('');
  });

  it('不误伤正常正文', () => {
    expect(stripGeneratedArtifacts('一只猫坐在窗台上')).toBe('一只猫坐在窗台上');
  });
});

describe('引用替换（原 `Qc`）', () => {
  it('★ `@[id|label]` 命中 refMap → `参考图N`', () => {
    expect(resolveReferences('看这个 @[n1|小红] 和 @[n2|小蓝]', { n1: 1, n2: 2 })).toBe('看这个 参考图1 和 参考图2');
  });

  it('未命中 → 回落 label', () => {
    expect(resolveReferences('@[n9|小黄]', {})).toBe('小黄');
    expect(resolveReferences('@[n9|小黄]', null)).toBe('小黄');
  });

  it('无 `@[...]` → 原样', () => {
    expect(resolveReferences('普通文本', {})).toBe('普通文本');
  });
});

describe('composeBody 通用组装', () => {
  it('image：纯前缀拼接', () => {
    expect(composeBody({ body: '猫', stylePrefix: '水墨，', mediaType: 'image' })).toBe('水墨，猫');
  });

  it('video 未格式化：视频生成 前缀+正文+后缀', () => {
    expect(composeBody({ body: '猫', model: 'seedance-2.0', duration: 5, ratio: '1:1', mediaType: 'video' })).toBe(
      '视频生成 猫，画面比例 1:1，duration=5，--模型:Seedance 2.0',
    );
  });

  it('空正文 → 空串', () => {
    expect(composeBody({ body: '', mediaType: 'video' })).toBe('');
  });
});
