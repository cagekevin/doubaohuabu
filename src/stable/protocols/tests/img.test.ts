/**
 * `img://` + `?w=` 协议规则（★ 冻结契约）
 *
 * 判据（docs/10 #7）：缩略图一律走 `?w=`，**不加载原图**；拼接必须**幂等**
 * ⚠️ 这些是**行为断言**（真实输入 → 真实输出），把实现改坏必红
 */

import { describe, expect, it } from 'vitest';
import { isDataUrl, isImgRef, withThumb } from '../img';

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

  it('空串 → 原样返回（不抛）', () => {
    expect(withThumb('', 480)).toBe('');
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

  it('isDataUrl 只认 `data:` 前缀', () => {
    expect(isDataUrl('data:image/png;base64,x')).toBe(true);
    expect(isDataUrl('img://a.png')).toBe(false);
    expect(isDataUrl('')).toBe(false);
  });
});
