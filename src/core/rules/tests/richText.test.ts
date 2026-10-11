/**
 * 富文本纯字符串层单测（原 `bL` 40047 快路径 / `P0` 39988 / `qs` 39956 / `Jc` 39963 / `la` 39981 / `Xt` 22564）
 *
 * 断言红线：**实现一变必红** —— 转义**只转 `&<>` 不转引号**（`qs`）、属性转义才转引号（`Jc`）、
 * 药丸的 `contenteditable="false"` 与 `data-id`/`data-name`、缺失占位的 **id 是字面量 `x`**、
 * 无图与有图两种内文、以及"老富文本不猜、整段转义"。
 */

import { describe, expect, it } from 'vitest';
import {
  GP_REF_CHIP_CLASS,
  escapeAttr,
  escapeHtml,
  gpRefChipHtml,
  textToGpEditorHtml,
  hasRichMarkup,
  isRemoteImageUrl,
  refChipHtml,
  refMissingHtml,
  splitRefMarkers,
  textToEditorHtml,
  thumbUrl,
} from '../richText';

describe('escapeHtml / escapeAttr（原 qs 39956 / Jc 39963）', () => {
  it('★ `qs` **只转 `&` `<` `>`**（不转引号）', () => {
    expect(escapeHtml('a & b < c > d " e')).toBe('a &amp; b &lt; c &gt; d " e');
  });

  it('★ `Jc` 在 `qs` 之上**再转双引号**', () => {
    expect(escapeAttr('a"b&c')).toBe('a&quot;b&amp;c');
  });

  it('非字符串走 `String()`；null/undefined ⇒ 空串', () => {
    expect(escapeHtml(42 as unknown as string)).toBe('42');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('hasRichMarkup（原 bL 40051 的判定）', () => {
  it('有标签 / 有实体 ⇒ true', () => {
    expect(hasRichMarkup('<p>x</p>')).toBe(true);
    expect(hasRichMarkup('a&nbsp;b')).toBe(true);
    expect(hasRichMarkup('&#39;')).toBe(true);
    expect(hasRichMarkup('&#x27;')).toBe(true);
  });

  it('纯文本 + `@` 标记 ⇒ false（走快路径）', () => {
    expect(hasRichMarkup('看 @[lib_1|甲] 的效果')).toBe(false);
    expect(hasRichMarkup('')).toBe(false);
    // 单个 `&` 不是实体 ⇒ 不算富文本（源正则要求 `&名字;` 形态）
    expect(hasRichMarkup('a & b')).toBe(false);
  });
});

describe('thumbUrl / isRemoteImageUrl（原 Xt 22564）', () => {
  it('★ 远程 http(s) ⇒ 切掉原 query/hash 再挂 `?w=`', () => {
    expect(thumbUrl('https://cdn.x.com/a.png?x=1#f', 120)).toBe('https://cdn.x.com/a.png?w=120');
  });

  it('★ `data:` / `img://` / `file:` **原样返回**（不挂 `?w=`）', () => {
    expect(thumbUrl('data:image/png;base64,AAA', 120)).toBe('data:image/png;base64,AAA');
    expect(thumbUrl('img://a.png', 120)).toBe('img://a.png');
    expect(thumbUrl('file:///x.png', 120)).toBe('file:///x.png');
  });

  it('空串 ⇒ 空串', () => {
    expect(thumbUrl('')).toBe('');
    expect(isRemoteImageUrl('')).toBe(false);
  });
});

describe('refChipHtml（原 P0 39988）', () => {
  it('★ 形状逐字：`contenteditable="false"` + `data-id` + `data-name`', () => {
    const html = refChipHtml({ id: 'lib_1', name: '素材甲', dataUrl: 'img://a.png' });
    expect(html).toContain('class="ref-chip"');
    expect(html).toContain('contenteditable="false"');
    expect(html).toContain('data-id="lib_1"');
    expect(html).toContain('data-name="素材甲"');
  });

  it('★ 有图 ⇒ `<img class="chip-img">` + `@名`（缩略图宽 **120**）', () => {
    const html = refChipHtml({ id: 'a', name: '甲', dataUrl: 'https://x/a.png' });
    expect(html).toContain('src="https://x/a.png?w=120"');
    expect(html).toContain('<span class="chip-name">@甲</span>');
  });

  it('★ 无图 ⇒ `@名 (无图片)`', () => {
    const html = refChipHtml({ id: 'a', name: '甲' });
    expect(html).toContain('@甲 <i>(无图片)</i>');
    expect(html).not.toContain('chip-img');
  });

  it('★ 名字为空 / 字面量 `undefined` ⇒ 回落 `素材`（原 39990）', () => {
    expect(refChipHtml({ id: 'a' })).toContain('data-name="素材"');
    expect(refChipHtml({ id: 'a', name: '   ' })).toContain('data-name="素材"');
    expect(refChipHtml({ id: 'a', name: 'undefined' })).toContain('data-name="素材"');
  });

  it('★ id/name 里的引号与尖括号被转义（不会撑破属性）', () => {
    const html = refChipHtml({ id: 'a"b', name: '<x>' });
    expect(html).toContain('data-id="a&quot;b"');
    expect(html).toContain('data-name="&lt;x&gt;"');
  });
});

describe('refMissingHtml（原 bL 40064）', () => {
  it('★ 是 `.ref-missing` + `data-name`，内文 `@名 (素材缺失)`', () => {
    const html = refMissingHtml('甲');
    expect(html).toContain('class="ref-missing"');
    expect(html).toContain('contenteditable="false"');
    expect(html).toContain('data-name="甲"');
    expect(html).toContain('@甲 <i>(素材缺失)</i>');
    // ⚠️ **没有 `data-id`**（源版如此 —— 反向解析时 id 固定成字面量 `x`）
    expect(html).not.toContain('data-id');
  });
});

describe('splitRefMarkers（原 bL 40052 的 split）', () => {
  it('★ 交替切出「标记 / 普通文本」，且保留分隔符', () => {
    const parts = splitRefMarkers('前 @[a|甲] 后');
    expect(parts.map((p) => p.raw)).toEqual(['前 ', '@[a|甲]', ' 后']);
    expect(parts[1]!.marker).toEqual({ id: 'a', name: '甲' });
    expect(parts[0]!.marker).toBeNull();
  });

  it('不成对/畸形的不当标记（`@[无竖线]` / 未闭合）', () => {
    expect(splitRefMarkers('@[nope]').every((p) => p.marker === null)).toBe(true);
    expect(splitRefMarkers('@[a|甲').every((p) => p.marker === null)).toBe(true);
  });
});

describe('textToEditorHtml（原 bL 快路径）', () => {
  const materials = { lib_1: { name: '素材甲', dataUrl: 'img://a.png' } };

  it('空文本 ⇒ 空串', () => {
    expect(textToEditorHtml('')).toBe('');
  });

  it('★ 命中素材 ⇒ 药丸；未命中 ⇒ `.ref-missing`（不抛）', () => {
    const hit = textToEditorHtml('看 @[lib_1|甲]', materials);
    expect(hit).toContain('ref-chip');
    expect(hit).toContain('看 ');

    const miss = textToEditorHtml('看 @[ghost|鬼]', materials);
    expect(miss).toContain('ref-missing');
    expect(miss).toContain('@鬼 <i>(素材缺失)</i>');
  });

  it('★ 普通文本被转义，且 `\\n` ⇒ `<br/>`', () => {
    expect(textToEditorHtml('a < b\nc')).toBe('a &lt; b<br/>c');
  });

  it('★ 命中时**用节点的名字**（源 `d.data.label || d.data.name || 原文`）', () => {
    const html = textToEditorHtml('@[lib_1|标记里的名]', { lib_1: { name: '节点里的名' } });
    expect(html).toContain('data-name="节点里的名"');
  });

  it('★ 名字缺 ⇒ 回落**标记里的原文**（源 `u[2]`）', () => {
    const html = textToEditorHtml('@[lib_1|标记里的名]', { lib_1: {} });
    expect(html).toContain('data-name="标记里的名"');
  });

  it('★ 老富文本（含标签/实体）⇒ **整段转义**（不渲染不可信 HTML —— 铁律②零注入）', () => {
    const html = textToEditorHtml('<img src=x onerror=alert(1)>');
    expect(html).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    // 实体也一并转义（免得 `&nbsp;` 被当实体解析）
    expect(textToEditorHtml('a&nbsp;b')).toBe('a&amp;nbsp;b');
  });
});

describe('gpRefChipHtml（原 X3 42662）—— 生成面板的药丸', () => {
  it('★ 类名多一个 `gp-ref-chip`，载体是 **`data-n`**（不是 data-id/data-name）', () => {
    const html = gpRefChipHtml(2, '素材甲', 'img://a.png');
    expect(html).toContain(`class="ref-chip ${GP_REF_CHIP_CLASS}"`);
    expect(html).toContain('data-n="2"');
    expect(html).not.toContain('data-id');
    expect(html).not.toContain('data-name');
    expect(html).toContain('contenteditable="false"');
  });

  it('★ 名字兜底是 **`图${n}`**（文本节点那边是 `素材` —— 两者不同，别混）', () => {
    expect(gpRefChipHtml(3)).toContain('@图3');
    expect(gpRefChipHtml(3, '') ).toContain('@图3');
    expect(gpRefChipHtml(3, 'undefined')).toContain('@图3');
    expect(gpRefChipHtml(3, '甲')).toContain('@甲');
  });

  it('★ 编号非法（非有限数 / ≤ 0）⇒ `data-n` 回落 **1**', () => {
    expect(gpRefChipHtml(0)).toContain('data-n="1"');
    expect(gpRefChipHtml(-2)).toContain('data-n="1"');
    expect(gpRefChipHtml(NaN)).toContain('data-n="1"');
  });

  it('有图 ⇒ 缩略图（宽 **120**）；无图 ⇒ `(无图片)`', () => {
    expect(gpRefChipHtml(1, '甲', 'https://x/a.png')).toContain('src="https://x/a.png?w=120"');
    expect(gpRefChipHtml(1, '甲')).toContain('(无图片)');
  });
});

describe('textToGpEditorHtml（原 DS 42669 + G0）', () => {
  const lookup = (n: number) =>
    n === 1 ? { label: '素材甲', dataUrl: 'img://a.png' } : n === 2 ? { label: '乙' } : {};

  it('★ `@图N` ⇒ gp 药丸，**按编号查**（不是按 id —— 那是文本框的协议）', () => {
    const html = textToGpEditorHtml('看 @图1 和 @图2', lookup);
    expect(html).toContain('gp-ref-chip');
    expect(html).toContain('data-n="1"');
    expect(html).toContain('data-n="2"');
    expect(html).toContain('看 ');
  });

  it('★ 查不到的编号 ⇒ 仍出药丸、名字回落 `图N`（源版 `c = r(l) || {}`）', () => {
    const html = textToGpEditorHtml('@图9', lookup);
    expect(html).toContain('data-n="9"');
    expect(html).toContain('@图9');
  });

  it('★ 普通文本被转义，`\n` ⇒ `<br/>`', () => {
    expect(textToGpEditorHtml('a < b\nc')).toBe('a &lt; b<br/>c');
  });

  it('★ 没有标记 ⇒ 整段转义（不留 `@` 之外的东西）', () => {
    expect(textToGpEditorHtml('随便写点')).toBe('随便写点');
  });

  it('★ 多枚标记与纯文本交替时**不丢字符**', () => {
    const html = textToGpEditorHtml('前@图1中@图2后', lookup);
    expect(html.startsWith('前')).toBe(true);
    expect(html.endsWith('后')).toBe(true);
    expect(html).toContain('中');
  });

  it('★ 正则上限是 **3 位数字**（源 `Ks` 就是 `\d{1,3}`）⇒ `@图1234` 只吃前三位', () => {
    const html = textToGpEditorHtml('@图1234', lookup);
    expect(html).toContain('data-n="123"');
    expect(html.endsWith('4')).toBe(true);
  });

  it('空文本 ⇒ 空串', () => {
    expect(textToGpEditorHtml('')).toBe('');
  });
});
