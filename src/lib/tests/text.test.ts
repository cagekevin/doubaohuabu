/**
 * 文本工具单测 —— 回源 `ia`(36560) / `In`(24036)
 *
 * 原则 7：只测纯逻辑（本文件在 `lib/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { normalizeSpace, stripHtml } from '../text';

describe('normalizeSpace（原 `ia` 36560）', () => {
  it('全部连续空白 → 单空格 + trim', () => {
    expect(normalizeSpace('  a \n\t b  ')).toBe('a b');
  });

  it('★ 怪癖（与源一致）：JS 的 `\\s` **包含 NBSP**，故 NBSP 也被折成普通空格', () => {
    expect(normalizeSpace('a\u00a0b')).toBe('a b');
  });

  it('★ 怪癖（与源一致）：`String(e || \'\')` ⇒ **falsy 值一律变空串**（`0` / `false` 都不是 `"0"`/`"false"`）', () => {
    expect(normalizeSpace('')).toBe('');
    expect(normalizeSpace(null)).toBe('');
    expect(normalizeSpace(undefined)).toBe('');
    expect(normalizeSpace(0)).toBe('');
    expect(normalizeSpace(false)).toBe('');
  });
});

describe('stripHtml（原 `In` 24036）', () => {
  it('无 HTML 标签 → 原样返回（快路径，不做实体解码）', () => {
    expect(stripHtml('你好 &amp; 世界')).toBe('你好 &amp; 世界');
    expect(stripHtml('纯文本')).toBe('纯文本');
  });

  it('有标签 → 解码实体 + 剥标签', () => {
    expect(stripHtml('<p>你好 &amp; 世界</p>')).toBe('你好 & 世界');
    expect(stripHtml('<p>&#65;&#x42;</p>')).toBe('AB');
    expect(stripHtml('<p>a&nbsp;b</p>')).toBe('a b');
    expect(stripHtml('<a href="x">链接</a>')).toBe('链接');
  });

  it('★ 怪癖（与源一致）：**实体先解码、再剥标签** ⇒ 转义出来的标签也被剥掉', () => {
    // `&lt;b&gt;` 解码成真 `<b>` 后，被紧随其后的剥标签循环吃掉
    expect(stripHtml('<p>&lt;b&gt;</p>')).toBe('');
    // 对照：没有外层标签时走快路径，**不**解码 ⇒ 原样保留
    expect(stripHtml('&lt;b&gt;')).toBe('&lt;b&gt;');
  });

  it('★ 怪癖（与源一致）：快路径正则 `/<[a-z][\\s>]/i` 只认「单字母标签名 + 空白/`>`」', () => {
    // `<div>` / `<span>` 这类**多字母无属性**标签**不**触发剥离 ⇒ 原样返回（标签留在里面）
    expect(stripHtml('<div><span>a</span></div>')).toBe('<div><span>a</span></div>');
    // `<p>` 命中（`<p` + `>`）⇒ 走剥离路径
    expect(stripHtml('<p>a</p>')).toBe('a');
    // `<a href>` 命中（`<a` + 空格）⇒ 走剥离路径
    expect(stripHtml('<a href="u">l</a>')).toBe('l');
  });

  it('收尾只整理空格/制表与 3+ 换行（**不是**全空白归一）', () => {
    expect(stripHtml('<p>a\n\n\n\nb</p>')).toBe('a\n\nb');
    expect(stripHtml('<p>a   b</p>')).toBe('a b');
  });

  it('空值 → 空串', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});
