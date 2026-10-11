/**
 * `img://` + `?w=` 协议规则（★ 冻结契约）
 *
 * 判据（docs/10 #7）：缩略图一律走 `?w=`，**不加载原图**；拼接必须**幂等**
 * ⚠️ 这些是**行为断言**（真实输入 → 真实输出），把实现改坏必红
 */

import { describe, expect, it } from 'vitest';
import { isImgRef, isInlineImage, withThumb } from '../img';

describe('withThumb · 拼缩略图 URL', () => {
  it('img:// 无查询串 → 用 `?` 接', () => {
    expect(withThumb('img://abc123.png', 480)).toBe('img://abc123.png?w=480');
  });

  it('已有其它查询串 → 用 `&` 接（不能拼出两个 `?`）', () => {
    expect(withThumb('img://abc.png?v=2', 480)).toBe('img://abc.png?v=2&w=480');
  });

  it('★ 幂等：已带 `?w=` → 原样返回（不叠加）', () => {
    const once = withThumb('img://a.png', 480);
    expect(withThumb(once, 480)).toBe(once);
    expect(withThumb(once, 999)).toBe(once); // 换宽度也不改（已是最终形态）
  });

  it('★ 幂等：已带 `&w=`（多参数场景）→ 原样返回', () => {
    expect(withThumb('img://a.png?v=2&w=480', 999)).toBe('img://a.png?v=2&w=480');
  });

  it('data: 内联图 → 原样返回（dataUrl 不能加查询串）', () => {
    const d = 'data:image/png;base64,iVBORw0KGgo=';
    expect(withThumb(d, 480)).toBe(d);
  });

  it('★ **远程 / file: ⇒ 原样返回**（2026-10-11 纠错：此前会给它们也挂 `?w=`）', () => {
    expect(withThumb('https://cdn.x.com/a.png?x=1#f', 480)).toBe('https://cdn.x.com/a.png?x=1#f');
    expect(withThumb('http://cdn.x.com/a.png', 480)).toBe('http://cdn.x.com/a.png');
    expect(withThumb('file:///x/a.png', 480)).toBe('file:///x/a.png');
  });

  it('空串 → 原样返回（不抛）', () => {
    expect(withThumb('', 480)).toBe('');
    expect(withThumb(null as unknown as string, 480)).toBe('');
  });

  it('默认宽度来自 SSOT（`constants/dedupe.THUMB_WIDTH`）', () => {
    // 只断"拼出了一个 w 参数"，不断具体数值（数值由 constants 管，改它是合法配置变更）
    expect(withThumb('img://a.png')).toMatch(/\?w=\d+$/);
  });
});

describe('协议判定', () => {
  it('isImgRef 只认 `img://` 前缀', () => {
    expect(isImgRef('img://a.png')).toBe(true);
    expect(isImgRef('data:image/png;base64,x')).toBe(false);
    expect(isImgRef('https://x/a.png')).toBe(false);
    expect(isImgRef(null)).toBe(false);
    expect(isImgRef(undefined)).toBe(false);
    expect(isImgRef(123)).toBe(false);
  });

  // ⚠️ `isDataUrl` 的用例**已删**（2026-10-11）：它唯一的真实消费者是 `withThumb` 的早退分支，
  //    而那分支按源 `Xt` 判据是冗余的 ⇒ 该导出失去全部生产消费者，按死代码闸判死删除。
});

/**
 * ★ 2026-10-11 回源纠错：这条判据（原 `fp`）是「**要不要落盘**」（原 `Tn`）的真判据。
 * ⚠️ 此前 `core/rules/lovartGallery.ts` 的 `shouldMaterializeImage` 写成了「是不是远程 http」
 *   —— **恰好反了** ⇒ 两处测试都锁的是错行为。这里锁**正确**的那一条。
 */
describe('isInlineImage · 「要不要落盘」的判据（原 `fp` 22561 / `Tn` 22578）', () => {
  it('★ 内联 base64 图片 ⇒ true（只有它需要外置成 `img://`）', () => {
    expect(isInlineImage('data:image/png;base64,AAA')).toBe(true);
    expect(isInlineImage('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    // 带 charset 也是内联 base64 图
    expect(isInlineImage('data:image/png;charset=utf-8;base64,AAA')).toBe(true);
  });

  it('★ **远程 http(s) ⇒ false**（远程图**不该**落盘 —— 这正是此前写反的那条）', () => {
    expect(isInlineImage('https://x/a.png')).toBe(false);
    expect(isInlineImage('http://x/a.png')).toBe(false);
  });

  it('★ 已是 `img://` 引用 ⇒ false（否则会被**二次外置**成坏引用）', () => {
    expect(isInlineImage('img://a.png')).toBe(false);
  });

  it('非图片 data URL / file:// / 空 / 非字符串 ⇒ false', () => {
    expect(isInlineImage('data:text/plain;base64,AAA')).toBe(false);
    expect(isInlineImage('data:image/png,AAA')).toBe(false); // 非 base64
    expect(isInlineImage('file:///x.png')).toBe(false);
    expect(isInlineImage('')).toBe(false);
    expect(isInlineImage(null)).toBe(false);
    expect(isInlineImage(undefined)).toBe(false);
    expect(isInlineImage(42)).toBe(false);
  });
});
