import { describe, expect, it } from 'vitest';
import { detectNewReply, didEnterChatPage, needsGenerationConfirm } from '../genConfirm';

describe('needsGenerationConfirm（原 `Ge`）', () => {
  const base = { autoSend: true, imageCount: 0, params: {}, text: '' };

  it('autoSend=false ⇒ 一律 false（原第一个子句）', () => {
    expect(needsGenerationConfirm({ ...base, autoSend: false, params: { model: 'seedance-2.5' } })).toBe(false);
  });

  it('带图 ⇒ true', () => {
    expect(needsGenerationConfirm({ ...base, imageCount: 1 })).toBe(true);
  });

  it('params.model / params.duration ⇒ true', () => {
    expect(needsGenerationConfirm({ ...base, params: { model: 'seedance-2.5' } })).toBe(true);
    expect(needsGenerationConfirm({ ...base, params: { duration: 10 } })).toBe(true);
  });

  it('★ `duration: 0` 不算（源是 `!!dt.duration` 真值判定）', () => {
    expect(needsGenerationConfirm({ ...base, params: { duration: 0 } })).toBe(false);
  });

  it('正文含「视频生成」/ `duration=` ⇒ true（大小写不敏感）', () => {
    expect(needsGenerationConfirm({ ...base, text: '帮我视频生成一段' })).toBe(true);
    expect(needsGenerationConfirm({ ...base, text: 'x Duration=8' })).toBe(true);
  });

  it('纯文本、无参数、无图 ⇒ false', () => {
    expect(needsGenerationConfirm({ ...base, text: '你好' })).toBe(false);
  });
});

describe('detectNewReply（原 `kt` 的 `dt` 与确认支 —— 同一条规则）', () => {
  it('读数无效（null）⇒ 不命中、baseline 不动', () => {
    expect(detectNewReply({ reading: null, baseline: 3, ownText: '' })).toEqual({
      baseline: 3,
      hit: false,
    });
  });

  it('count 未超过 baseline ⇒ 不命中', () => {
    expect(detectNewReply({ reading: { count: 3, text: '确认后我再开始生成视频' }, baseline: 3, ownText: '' })).toEqual({
      baseline: 3,
      hit: false,
    });
  });

  it('count 超过 baseline 且 text 非空 ⇒ 命中', () => {
    expect(detectNewReply({ reading: { count: 4, text: '确认后我再开始生成视频' }, baseline: 3, ownText: '' })).toEqual({
      baseline: 3,
      hit: true,
    });
  });

  it('★ count 回退（SPA 切换 / 会话裁剪）⇒ baseline 归零后**重新判**（源就是这语义）', () => {
    // 5 < 9 ⇒ baseline 归 0；归零后 5 > 0 ∧ text 非空 ⇒ 命中，且新 baseline = 0
    expect(detectNewReply({ reading: { count: 5, text: 'x' }, baseline: 9, ownText: '' })).toEqual({
      baseline: 0,
      hit: true,
    });
  });

  it('★ `ownText` 含 `text`（是我们自己发出去的）⇒ 不命中', () => {
    expect(
      detectNewReply({
        reading: { count: 4, text: '确认后我再开始生成视频' },
        baseline: 3,
        ownText: '请确认后我再开始生成视频，谢谢',
      }),
    ).toEqual({ baseline: 3, hit: false });
  });

  it('text 为空串 ⇒ 不命中（源 `!$e.text`）', () => {
    expect(detectNewReply({ reading: { count: 4, text: '' }, baseline: 3, ownText: '' })).toEqual({
      baseline: 3,
      hit: false,
    });
  });
});

describe('didEnterChatPage（原 `kt` 的 `ge()`）', () => {
  it('首次跳到 /chat/ ⇒ true', () => {
    expect(
      didEnterChatPage({ beforeUrl: 'https://x/aispace', currentUrl: 'https://x/chat/123', alreadyDone: false }),
    ).toBe(true);
  });

  it('URL 没变 ⇒ false', () => {
    expect(
      didEnterChatPage({ beforeUrl: 'https://x/chat/1', currentUrl: 'https://x/chat/1', alreadyDone: false }),
    ).toBe(false);
  });

  it('变了但不在 /chat/ 上 ⇒ false', () => {
    expect(
      didEnterChatPage({ beforeUrl: 'https://x/a', currentUrl: 'https://x/b', alreadyDone: false }),
    ).toBe(false);
  });

  it('★ 已归零过（哨兵 `de`）⇒ 不再重复归零', () => {
    expect(
      didEnterChatPage({ beforeUrl: 'https://x/aispace', currentUrl: 'https://x/chat/123', alreadyDone: true }),
    ).toBe(false);
  });

  it('beforeUrl 空 ⇒ false（源要求 `ve.beforeUrl` 为真）', () => {
    expect(didEnterChatPage({ beforeUrl: '', currentUrl: 'https://x/chat/1', alreadyDone: false })).toBe(false);
  });
});
