/**
 * 回复类型分类单测 —— 回源 `FR`(36571) / `BR`(36579) / `HR`(36587) / `WR`(36595) / `VR`(36626)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  classifyReply,
  isGenerating,
  isNewReply,
  isNoGeneration,
  isOfferToStart,
  REPLY_SENTINEL,
  type ReplyKind,
} from '../replyKind';

describe('classifyReply（原 `WR`）', () => {
  /** 表驱动：每个 kind 一条真实文案 */
  const cases: ReadonlyArray<readonly [string, ReplyKind]> = [
    ['目前没有视频在生成', 'none'],
    ['没有正在生成', 'none'],
    ['也不在生成队列', 'none'],
    ['查不到有效任务', 'none'],
    ['尚未正式提交', 'none'],
    ['no active video generation', 'none'],
    ['需要我现在立刻开始生成吗', 'offer'],
    ['要不要现在就开始生成', 'offer'],
    ['开始生成这个短视频吗', 'offer'],
    ['shall I start generating', 'offer'],
    ['排队生成中，请稍候', 'busy'],
    ['正在生成，请稍候', 'busy'],
    ['已进入生成队列', 'busy'],
    ['queued', 'busy'],
    ['好的，我来帮你写一段文案', 'other'],
  ];

  it.each(cases)('「%s」→ %s', (text, expected) => {
    const r = classifyReply(text);
    expect(r.kind).toBe(expected);
    expect(r.reply).toBe(true);
  });

  it('空文本 → no-reply 且 reply=false（原 `WR` else 分支）', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(classifyReply(v)).toEqual({ kind: 'no-reply', reply: false });
    }
  });

  it('★ 分支顺序不可换：**同时含** none 与 busy 标记时，必须命中 none', () => {
    // 这句话既含 `没有正在生成`（none）又含 `已进入生成队列`（busy）⇒ 顺序决定结果
    expect(classifyReply('没有正在生成，也不在生成队列，已进入生成队列').kind).toBe('none');
  });
});

describe('三个判定函数（原 `FR` / `BR` / `HR`）—— 直接测，含**空值早返回**', () => {
  it('空 / 空白 / null / undefined → 一律 false（源码 `if (t) … else return false`）', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(isNoGeneration(v)).toBe(false);
      expect(isOfferToStart(v)).toBe(false);
      expect(isGenerating(v)).toBe(false);
    }
  });

  it('★ 模式**会重叠** —— 这正是 `WR` 必须**先查 none** 的原因', () => {
    // `没有正在生成` 同时命中 FR（`没有…`）与 HR（子串 `正在生成`）⇒ 两个判定**都为 true**
    expect(isNoGeneration('没有正在生成')).toBe(true);
    expect(isGenerating('没有正在生成')).toBe(true); // ← 重叠！顺序不可换
    // 分类器靠「先 none」把它判成 none（否则会被 busy 抢走）
    expect(classifyReply('没有正在生成').kind).toBe('none');
  });

  it('不重叠的部分：各模式互不误伤', () => {
    expect(isOfferToStart('没有正在生成')).toBe(false);
    expect(isGenerating('需要我现在立刻开始生成吗')).toBe(false);
    expect(isNoGeneration('需要我现在立刻开始生成吗')).toBe(false);
    expect(isGenerating('排队生成中')).toBe(true);
    expect(isNoGeneration('排队生成中')).toBe(false);
    expect(isOfferToStart('排队生成中')).toBe(false);
  });

  it('判定前先做空白归一（首尾空白不影响）', () => {
    expect(isGenerating('  排队生成中  ')).toBe(true);
  });
});

describe('isNewReply（原 `VR` 36626）', () => {
  it('非空、不等于哨兵句、且与上次不同 → true', () => {
    expect(isNewReply('上一句', '新一句')).toBe(true);
    expect(isNewReply('', '新一句')).toBe(true);
  });

  it('相同 → false', () => {
    expect(isNewReply('同一句', '同一句')).toBe(false);
  });

  it('★ 哨兵句不算新回复', () => {
    expect(isNewReply('', REPLY_SENTINEL)).toBe(false);
    expect(isNewReply('别的', REPLY_SENTINEL)).toBe(false);
  });

  it('空白归一后再比较（`a  b` 与 `a b` 视为同一句）', () => {
    expect(isNewReply('a  b', 'a b')).toBe(false);
  });

  it('空当前 → false', () => {
    expect(isNewReply('上一句', '')).toBe(false);
    expect(isNewReply('上一句', null)).toBe(false);
  });
});
