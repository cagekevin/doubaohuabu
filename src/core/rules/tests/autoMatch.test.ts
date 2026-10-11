/**
 * 「自动匹配」纯规则单测（原 `Jh`，`shared.js:24280-24394`）
 *
 * ⚠️ 断言**逐值对源**（含 `参考图` 前后吸收、长名优先、每素材最多插一条、不可替换区间）——
 *    不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { autoMatchText } from '../autoMatch';

/** 造一条素材 */
const mat = (id: string, name: string) => ({ id, name });

describe('autoMatchText（原 `Jh`）', () => {
  it('空正文 / 空素材库 / 素材缺 id 或名 ⇒ **原样返回**', () => {
    expect(autoMatchText('', [mat('m1', '小红')])).toBe('');
    expect(autoMatchText('小红', [])).toBe('小红');
    expect(autoMatchText('小红', [{ id: 'm1', name: '   ' }])).toBe('小红');
    expect(autoMatchText('小红', [{ name: '小红' }])).toBe('小红');
  });

  it('★ 命中但**两侧都没有 `参考图`** ⇒ 在名字**之后插入**一条引用', () => {
    expect(autoMatchText('看小红的图', [mat('m1', '小红')])).toBe('看小红@[m1|小红]的图');
  });

  it('★ 左侧紧邻 `参考图`（只隔空白）⇒ **整段** `参考图 小红` 被引用替换', () => {
    expect(autoMatchText('看 参考图 小红', [mat('m1', '小红')])).toBe('看 @[m1|小红]');
  });

  it('★ 右侧紧邻 `参考图` ⇒ 同样整段替换（对称）', () => {
    expect(autoMatchText('小红 参考图', [mat('m1', '小红')])).toBe('@[m1|小红]');
  });

  it('★ 中间夹**句读** ⇒ 不算同一处引用（`pk` 终止符）⇒ 退回"名字后插入"', () => {
    expect(autoMatchText('参考图，小红', [mat('m1', '小红')])).toBe('参考图，小红@[m1|小红]');
  });

  it('★ `参考图` 后带数字（`参考图1`）⇒ 左扫不成 ⇒ 退回"名字后插入"', () => {
    expect(autoMatchText('参考图1 小红', [mat('m1', '小红')])).toBe('参考图1 小红@[m1|小红]');
  });

  it('★ 同一素材在正文里出现多次 ⇒ **只插一条**（源的 `insertedAfter` 守卫）', () => {
    expect(autoMatchText('小红 和 小红', [mat('m1', '小红')])).toBe('小红@[m1|小红] 和 小红');
  });

  it('★ 已有同一条引用 ⇒ 跳过（不重复追加）', () => {
    expect(autoMatchText('@[m1|小红] 又说小红', [mat('m1', '小红')])).toBe('@[m1|小红] 又说小红');
  });

  it('★ 素材按**名字长度降序** ⇒ 长名先匹配，短名不会抢走它那一段', () => {
    const lib = [mat('a', '小红'), mat('b', '小红红')];
    expect(autoMatchText('小红红', lib)).toBe('小红红@[b|小红红]');
  });

  it('★ 候选词含**字母数字变体**（去掉中文与符号，长度 ≥ 2）', () => {
    expect(autoMatchText('看 01 这张', [mat('m1', '小红-01')])).toBe('看 01@[m1|小红-01] 这张');
  });

  it('★ 名字里含 `]` / `|` ⇒ 跳过（会破坏 `@[id|名]` 协议）', () => {
    expect(autoMatchText('小红', [mat('m1', '小红|x')])).toBe('小红');
    expect(autoMatchText('小红', [mat('m1', '小红]x')])).toBe('小红');
  });

  it('★ 命中落在 **HTML 标签内** ⇒ 跳过（源的不可替换区间含 `/<[^>]*>/g`）', () => {
    expect(autoMatchText('<小红>', [mat('m1', '小红')])).toBe('<小红>');
    // 反证：标签**之外**的同样文字仍能匹配
    expect(autoMatchText('<b>小红</b>', [mat('m1', '小红')])).toBe('<b>小红@[m1|小红]</b>');
  });

  it('★ 多处命中按 `start` **降序**应用 ⇒ 下标不漂移（两段都能正确落位）', () => {
    const out = autoMatchText('参考图 甲 与 参考图 乙', [mat('a', '甲'), mat('b', '乙')]);
    expect(out).toBe('@[a|甲] 与 @[b|乙]');
  });

  it('没有命中 ⇒ 返回**原字符串**（调用方据此判「无匹配」）', () => {
    expect(autoMatchText('完全没有关系', [mat('m1', '小红')])).toBe('完全没有关系');
  });
});
