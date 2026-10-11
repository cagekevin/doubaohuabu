/**
 * 提示词分析纯决策单测（原 `CD` 38678 / `oS` 38683 / `$D` 38979）
 *
 * 断言红线：**实现一变必红** —— 三个兜底（原文回落 / zh→en / 空文本）逐条锁死。
 */

import { describe, expect, it } from 'vitest';
import {
  buildReplyReadOptions,
  extractJsonBlock,
  formatJsonPrompt,
  parseAnalyzeResult,
} from '../analyzePrompt';

describe('extractJsonBlock（原 CD）', () => {
  it('★ 优先取 ```json 围栏内部并 trim', () => {
    expect(extractJsonBlock('前言\n```json\n  {"a":1}  \n```\n后记')).toBe('{"a":1}');
  });

  it('★ 围栏大小写不敏感（原 `/i`）', () => {
    expect(extractJsonBlock('```JSON\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('★ 无围栏 ⇒ 取**第一个 `{` 到最后一个 `}`**', () => {
    expect(extractJsonBlock('啰嗦 {"a":1} 中间 {"b":2} 结尾')).toBe('{"a":1} 中间 {"b":2}');
  });

  it('★ 空文本 / 只有 `{` / 只有 `}` / `}` 在 `{` 前 ⇒ `null`（原版此处 throw）', () => {
    expect(extractJsonBlock('')).toBeNull();
    expect(extractJsonBlock('abc { def')).toBeNull();
    expect(extractJsonBlock('abc } def')).toBeNull();
    expect(extractJsonBlock('} {')).toBeNull(); // 0 <= 2 ⇒ 命中 `r <= n`
  });

  it('★ 边界：`{}` 是 `r > n` ⇒ **不算失败**（源版 `r <= n` 为假）', () => {
    expect(extractJsonBlock('{}')).toBe('{}');
  });

  it('围栏存在但内部为空 ⇒ 回落第二条策略（原 `t && t[1]` 的假值判定）', () => {
    // 围栏内部是空串 ⇒ `fenced[1]` 为空 ⇒ 走 indexOf 分支
    expect(extractJsonBlock('```json\n```')).toBeNull();
  });
});

describe('parseAnalyzeResult（原 oS）', () => {
  const okReply = JSON.stringify({
    zh_prompt: '  中文提示词  ',
    en_prompt: '  english prompt  ',
    json_prompt: { subject: ['a'] },
    extra: 1,
  });

  it('★ 成功：zh/en 各自 trim，json_prompt 原样，parsed/raw 保留', () => {
    const r = parseAnalyzeResult(okReply);
    expect(r.ok).toBe(true);
    expect(r.zh_prompt).toBe('中文提示词');
    expect(r.en_prompt).toBe('english prompt');
    expect(r.json_prompt).toEqual({ subject: ['a'] });
    expect(r.raw).toBe(okReply);
    expect(r.parsed).toEqual(JSON.parse(okReply));
  });

  it('★ 空 / 全空白 ⇒ `ok:false`，且 zh/en/raw 都是原文', () => {
    for (const v of ['', '   ', '\n\t']) {
      expect(parseAnalyzeResult(v)).toEqual({
        ok: false,
        zh_prompt: v,
        en_prompt: v,
        json_prompt: null,
        parsed: null,
        raw: v,
      });
    }
  });

  it('★ 非字符串输入 ⇒ 按空文本处理（原文 = 空串）', () => {
    expect(parseAnalyzeResult(null).ok).toBe(false);
    expect(parseAnalyzeResult(undefined).raw).toBe('');
    expect(parseAnalyzeResult({ a: 1 }).raw).toBe('');
  });

  it('★ 解析失败（不是合法 JSON）⇒ 回落形状，zh/en = **整段原文**', () => {
    const r = parseAnalyzeResult('这是解释文字 { 不是 json }');
    expect(r.ok).toBe(false);
    expect(r.zh_prompt).toBe('这是解释文字 { 不是 json }');
    expect(r.en_prompt).toBe(r.zh_prompt);
    expect(r.json_prompt).toBeNull();
  });

  it('★ `zh_prompt` 缺失 / 非字符串 ⇒ 回落成**整段原文**（不是空串）', () => {
    const raw = JSON.stringify({ en_prompt: 'en only' });
    const r = parseAnalyzeResult(raw);
    expect(r.ok).toBe(true);
    expect(r.zh_prompt).toBe(raw); // ← 原文，不是 ''
    expect(r.en_prompt).toBe('en only');
  });

  it('★ `en_prompt` 缺失 ⇒ 回落成 **zh_prompt**（不是原文）', () => {
    const r = parseAnalyzeResult(JSON.stringify({ zh_prompt: '中文' }));
    expect(r.zh_prompt).toBe('中文');
    expect(r.en_prompt).toBe('中文');
  });

  it('★ `json_prompt` 是假值 ⇒ `null`（原 `|| null`）', () => {
    expect(parseAnalyzeResult(JSON.stringify({ zh_prompt: 'x', json_prompt: 0 })).json_prompt).toBeNull();
    expect(parseAnalyzeResult(JSON.stringify({ zh_prompt: 'x', json_prompt: '' })).json_prompt).toBeNull();
    expect(parseAnalyzeResult(JSON.stringify({ zh_prompt: 'x', json_prompt: null })).json_prompt).toBeNull();
  });

  it('★ JSON 是数组 / 标量 ⇒ 视为失败（源版会因取属性而"成功"但字段全空）', () => {
    // 有意偏离：源 `JSON.parse('[1,2]')` 得数组，取 `zh_prompt` 为 undefined ⇒ 也只能回落原文；
    // 本实现直接判失败（形状更诚实，语义等价）
    expect(parseAnalyzeResult('[1,2]').ok).toBe(false);
    expect(parseAnalyzeResult('"just a string"').ok).toBe(false);
    expect(parseAnalyzeResult('42').ok).toBe(false);
  });

  it('能处理围栏包裹的回复', () => {
    const r = parseAnalyzeResult('好的：\n```json\n{"zh_prompt":"中","en_prompt":"en"}\n```');
    expect(r.ok).toBe(true);
    expect(r.zh_prompt).toBe('中');
    expect(r.en_prompt).toBe('en');
  });
});

describe('buildReplyReadOptions（原 $D）', () => {
  it('★ 归一化：空白（含换行）折叠成**单空格**再 trim', () => {
    const r = buildReplyReadOptions('  请  调整\n\n光影  ', []);
    expect(r.full).toBe('请 调整 光影');
    expect(r.head).toBe('请 调整 光影');
  });

  it('★ `head` 是归一化全文的**前 40 字**', () => {
    const long = 'x'.repeat(100);
    const r = buildReplyReadOptions(long, []);
    expect(r.head).toHaveLength(40);
    expect(r.full).toHaveLength(100);
  });

  it('★ 基线最多 20 条（原 `slice(0, 20)`）', () => {
    const r = buildReplyReadOptions('t', Array.from({ length: 30 }, (_, i) => `m${i}`));
    expect(r.baseline).toHaveLength(20);
    expect(r.baseline[0]).toBe('m0');
  });

  it('基线非数组 ⇒ 空数组（不崩）', () => {
    expect(buildReplyReadOptions('t', undefined).baseline).toEqual([]);
    expect(buildReplyReadOptions('t', 'nope').baseline).toEqual([]);
    expect(buildReplyReadOptions('t', { 0: 'a' }).baseline).toEqual([]);
  });

  it('非字符串指令 ⇒ 归一成空串', () => {
    expect(buildReplyReadOptions(null, []).full).toBe('');
    expect(buildReplyReadOptions(42, []).full).toBe('42');
  });
});

describe('formatJsonPrompt（原 `ZL.jsx:380-383` 的面板展示）', () => {
  it('★ 逐行 `${键}: ${值}`，**数组用全角分号 `；` 连接**', () => {
    const out = formatJsonPrompt({ subject: ['猫', '狗'], style: '胶片', count: 3 });
    expect(out).toBe('subject: 猫；狗\nstyle: 胶片\ncount: 3');
  });

  it('★ 数组里的非字符串也会被 `join` 归一', () => {
    expect(formatJsonPrompt({ a: [1, 2] })).toBe('a: 1；2');
  });

  it('★ 不是对象 / 数组 / 空值 ⇒ `null`（调用方回落「(无结构化 JSON)」）', () => {
    expect(formatJsonPrompt(null)).toBeNull();
    expect(formatJsonPrompt(undefined)).toBeNull();
    expect(formatJsonPrompt('字符串')).toBeNull();
    expect(formatJsonPrompt(42)).toBeNull();
    expect(formatJsonPrompt(['a'])).toBeNull();
    // ⚠️ 空对象是**合法**的（会渲染成空串，不是 null）—— 与源 `Object.entries({})` 一致
    expect(formatJsonPrompt({})).toBe('');
  });

  it('嵌套对象按 `String()` 输出（源版对非数组值也不深挖）', () => {
    expect(formatJsonPrompt({ a: { b: 1 } })).toBe('a: [object Object]');
  });
});
