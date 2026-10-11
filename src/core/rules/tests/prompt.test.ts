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
  mergeLinkedTexts,
  normalizeModelLabel,
  normalizeResolution,
  resolveReferences,
  resolveRefMaterial,
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

describe('resolveRefMaterial（原 fk 24135-24203）—— 六级回落', () => {
  const lib = [
    { id: 'lib_1', name: '素材甲', dataUrl: 'img://lib1.png' },
    { id: 'lib_2', name: '素材乙', dataUrl: 'img://lib2.png' },
  ];
  const nodeMap = {
    // ② material 自带 dataUrl
    n_mat: { id: 'n_mat', type: 'material', data: { dataUrl: 'img://mat.png', name: '节点图' } },
    // ③ material 带 libId
    n_lib: { id: 'n_lib', type: 'material', data: { libId: 'lib_2', name: '库里图' } },
    // ⑤ video
    n_vid: { id: 'n_vid', type: 'video', data: { label: '片子', poster: 'img://poster.png', url: 'vid://x.mp4' } },
    // ⑥ imggen
    n_ig: { id: 'n_ig', type: 'imggen', data: { dataUrl: 'img://ig.png', label: '文生图' } },
    // 无
    n_gv: { id: 'n_gv', type: 'genvideo', data: {} },
  };

  it('★ ① 资源库 id 命中优先', () => {
    expect(resolveRefMaterial('lib_1', lib, nodeMap)).toEqual({
      id: 'lib_1',
      label: '素材甲',
      dataUrl: 'img://lib1.png',
    });
  });

  it('★ ② material 自带 dataUrl', () => {
    expect(resolveRefMaterial('n_mat', lib, nodeMap)).toMatchObject({ label: '节点图', dataUrl: 'img://mat.png' });
  });

  it('★ ③ material 的 libId 回查资源库', () => {
    expect(resolveRefMaterial('n_lib', lib, nodeMap)).toMatchObject({ label: '素材乙', dataUrl: 'img://lib2.png' });
  });

  it('★ ⑤ video 用 poster 当图、带上 videoUrl 与 mediaType', () => {
    expect(resolveRefMaterial('n_vid', lib, nodeMap)).toEqual({
      id: 'n_vid',
      label: '片子',
      dataUrl: 'img://poster.png',
      mediaType: 'video',
      videoUrl: 'vid://x.mp4',
    });
  });

  it('★ ⑥ imggen 自带 dataUrl', () => {
    expect(resolveRefMaterial('n_ig', lib, nodeMap)).toMatchObject({ label: '文生图', dataUrl: 'img://ig.png' });
  });

  it('★ 全不命中 ⇒ `{id, label: id, dataUrl: ""}`（**不抛、不 null**）', () => {
    expect(resolveRefMaterial('n_gv', lib, nodeMap)).toEqual({ id: 'n_gv', label: 'n_gv', dataUrl: '' });
    expect(resolveRefMaterial('不存在', lib, nodeMap)).toEqual({ id: '不存在', label: '不存在', dataUrl: '' });
  });

  it('`nodes` 也接受数组形状（两种入参等价）', () => {
    const arr = Object.values(nodeMap);
    expect(resolveRefMaterial('n_ig', lib, arr)).toEqual(resolveRefMaterial('n_ig', lib, nodeMap));
  });
});

describe('mergeLinkedTexts（原 sR 35486-35521）', () => {
  it('★ 正文里出现 `@<名字>` ⇒ **就地替换成该文本的正文**', () => {
    expect(mergeLinkedTexts('请参考 @甲 的风格', [{ label: '甲', text: '赛博朋克' }])).toBe('请参考 赛博朋克 的风格');
  });

  it('★ 正文里出现 `@[...|<名字>]` ⇒ 同样就地替换', () => {
    expect(mergeLinkedTexts('看 @[t_1|甲] 的写法', [{ label: '甲', text: '水墨' }])).toBe('看 水墨 的写法');
  });

  it('★ 正文里**没出现** ⇒ 空行分隔**追加**到末尾', () => {
    expect(mergeLinkedTexts('主正文', [{ label: '甲', text: '补充一' }, { label: '乙', text: '补充二' }])).toBe(
      '主正文\n\n补充一\n\n补充二',
    );
  });

  it('★ 无 `label` ⇒ **一律进追加组**（不做就地替换）', () => {
    expect(mergeLinkedTexts('主', [{ text: '补' }])).toBe('主\n\n补');
  });

  it('★ 主正文为空 ⇒ 只留追加组（不留前导空行）', () => {
    expect(mergeLinkedTexts('', [{ text: 'a' }, { text: 'b' }])).toBe('a\n\nb');
  });

  it('空文本条目被忽略', () => {
    expect(mergeLinkedTexts('主', [{ label: '甲', text: '   ' }])).toBe('主');
  });

  it('★ 名字里的正则元字符要转义（否则 `@a.b` 的 `.` 会当通配）', () => {
    expect(mergeLinkedTexts('用 @a.b 风格', [{ label: 'a.b', text: 'X' }])).toBe('用 X 风格');
    // 未转义时 `@a.b` 会匹配 `@axb` —— 这里验证**不该**匹配
    expect(mergeLinkedTexts('用 @axb 风格', [{ label: 'a.b', text: 'X' }])).toBe('用 @axb 风格\n\nX');
  });
});
