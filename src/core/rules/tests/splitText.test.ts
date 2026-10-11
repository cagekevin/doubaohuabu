/**
 * 文本拆分纯层单测（原 `gk` 24874 / `$y` 24888 / `Na` 24923 / `Ty` 24941）
 *
 * 断言红线（**实现一变必红**）：`stripHtml` 的**替换顺序**、`parseKeywords` 的**大小写去重**、
 * `splitByKeywords` 的**「关键词后一个字符」判据**与**前置内容保留**、`splitAuto` 的**行首锚定**。
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPLIT_KEYWORDS,
  parseKeywords,
  splitAuto,
  splitByKeywords,
  stripHtml,
} from '../splitText';

describe('stripHtml（原 gk 24874）', () => {
  it('★ `br` / `</p>` 变成换行（**在剥标签之前**，否则换行会丢）', () => {
    expect(stripHtml('a<br>b')).toBe('a\nb');
    expect(stripHtml('a<br/>b')).toBe('a\nb');
    expect(stripHtml('<p>a</p><p>b</p>')).toBe('a\nb\n');
  });

  it('★ `\\r\\n` 统一成 `\\n`', () => {
    expect(stripHtml('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('其余标签剥掉、实体解码', () => {
    expect(stripHtml('<b>粗</b>')).toBe('粗');
    expect(stripHtml('&nbsp;&amp;&lt;&gt;&quot;&#39;')).toBe(' &<>"\'');
    expect(stripHtml('&#65;&#x42;')).toBe('AB');
  });

  it('假值 ⇒ 空串', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
    expect(stripHtml('')).toBe('');
  });
});

describe('parseKeywords（原 Na 24923）', () => {
  it('★ 按空白 / 半全角逗号 / 顿号 / 分号拆，并滤空', () => {
    expect(parseKeywords('场景, 分镜  镜头')).toEqual(['场景', '分镜', '镜头']);
    expect(parseKeywords('a，b、c；d;e f')).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('★ **大小写不敏感去重**，保留**首次**出现的原样大小写', () => {
    expect(parseKeywords('Prompt prompt PROMPT')).toEqual(['Prompt']);
    expect(parseKeywords('场景 场景')).toEqual(['场景']);
  });

  it('非字符串 / 空 ⇒ 空数组', () => {
    expect(parseKeywords('')).toEqual([]);
    expect(parseKeywords(null)).toEqual([]);
    expect(parseKeywords(123)).toEqual([]);
  });

  it('默认关键词是源版那五个（顺序即语义）', () => {
    expect([...DEFAULT_SPLIT_KEYWORDS]).toEqual(['提示词组', '分镜', '镜头', '场景', 'Prompt']);
  });
});

describe('splitByKeywords（原 Ty 24941）', () => {
  it('★ 关键词行是切点；**第一个关键词行之前的前置内容单独成一段**', () => {
    const parts = splitByKeywords('前置说明\n场景1：abc\n场景2：def', ['场景']);
    expect(parts).toEqual([
      { title: '前置说明', content: '前置说明' },
      { title: '场景1：abc', content: '场景1：abc' },
      { title: '场景2：def', content: '场景2：def' },
    ]);
  });

  it('★ 首个关键词就在第一行 ⇒ 没有前置段', () => {
    const parts = splitByKeywords('场景1：a\n场景2：b', ['场景']);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ title: '场景1：a', content: '场景1：a' });
  });

  it('★ **关键词后一个字符必须是数字 / 分隔符 / 空白**，否则不算命中（`场景` 不命中 `场景化`）', () => {
    expect(splitByKeywords('场景化设计', ['场景'])).toEqual([]);
    // 但后面跟数字或空白就算
    expect(splitByKeywords('场景 1', ['场景'])).toHaveLength(1);
  });

  it('★ 大小写不敏感', () => {
    const parts = splitByKeywords('Prompt 1\ntext', ['prompt']);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.title).toBe('Prompt 1');
  });

  it('★ 前置内容全为空白 ⇒ **不生成前置段**（源版 `if (p)` 直接跳过）', () => {
    // ⚠️ 顺带记一个源版事实：那句 `（开头）` 兜底**不可达** ——
    //    只有当"拼起来 trim 后非空"才进分支，而那时必然存在一行非空 ⇒ `firstLine` 必非空。
    //    本实现照抄（保留该分支），测试锁住**可达**的那条路径。
    const parts = splitByKeywords('   \n场景1：a', ['场景']);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.title).toBe('场景1：a');
  });

  it('★ 标题超 40 字 ⇒ 截断加省略号', () => {
    const long = '场景' + '甲'.repeat(45);
    const parts = splitByKeywords(`${long}\n场景2：b`, ['场景']);
    expect(parts[0]?.title).toHaveLength(41);
    expect(parts[0]?.title.endsWith('…')).toBe(true);
  });

  it('一处没命中 / 关键词为空 ⇒ 空数组', () => {
    expect(splitByKeywords('没有任何标记', ['场景'])).toEqual([]);
    expect(splitByKeywords('场景1：a', [])).toEqual([]);
    expect(splitByKeywords('', ['场景'])).toEqual([]);
  });

  it('富文本正文会先拍平（`<br>` 也算换行 ⇒ 关键词行照切）', () => {
    const parts = splitByKeywords('开场<br>场景1：a<br>场景2：b', ['场景']);
    expect(parts.map((p) => p.title)).toEqual(['开场', '场景1：a', '场景2：b']);
  });
});

describe('splitAuto（原 $y 24888）', () => {
  it('★ 行首「关键词+数字」是切点，标题是「关键词+数字」', () => {
    const parts = splitAuto('开场白\n分镜1：aaaa\n分镜2：bbbb');
    expect(parts).toEqual([
      { title: '分镜1', content: '分镜1：aaaa' },
      { title: '分镜2', content: '分镜2：bbbb' },
    ]);
  });

  it('★ **前置内容被丢掉**（自动模式从第一个标记开始 —— 源版如此）', () => {
    const parts = splitAuto('开场白\n分镜1：a\n分镜2：b');
    expect(parts.some((p) => p.content.includes('开场白'))).toBe(false);
  });

  it('★ 匹配到 **< 2 处** ⇒ 空数组（拆不动）', () => {
    expect(splitAuto('分镜1：只有一个')).toEqual([]);
    expect(splitAuto('完全没有任何标记')).toEqual([]);
  });

  it('`#` 标题符与中文数字都认', () => {
    const parts = splitAuto('# 分镜一：a\n## 分镜二：b');
    expect(parts.map((p) => p.title)).toEqual(['分镜一', '分镜二']);
  });

  it('富文本也会先拍平', () => {
    const parts = splitAuto('<p>分镜1：a</p><p>分镜2：b</p>');
    expect(parts.map((p) => p.title)).toEqual(['分镜1', '分镜2']);
  });
});
