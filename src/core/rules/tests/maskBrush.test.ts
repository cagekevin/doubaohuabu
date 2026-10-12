/**
 * `maskBrush` 单测 —— 笔刷涂抹的纯规则（`TD-09-4` 第二块 b）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  BRUSH_DEFAULT_DIAMETER,
  BRUSH_UNDO_LIMIT,
  brushPatchRect,
  pushUndoSnapshot,
} from '../maskBrush';

describe('brushPatchRect（源 `G3.jsx:268-276` 的 `Je`）', () => {
  it('默认直径 64 ⇒ 半径 32；矩形是 clip 圆的**外接正方**（同心等径）', () => {
    const r = BRUSH_DEFAULT_DIAMETER / 2;
    expect(brushPatchRect(100, 50, r)).toEqual({ x: 68, y: 18, w: 64, h: 64 });
  });

  it('笔心在原点 ⇒ 矩形对称（负坐标合法）', () => {
    expect(brushPatchRect(0, 0, 10)).toEqual({ x: -10, y: -10, w: 20, h: 20 });
  });
});

describe('pushUndoSnapshot（源 `:148-152`）', () => {
  it('未超上限 ⇒ 追加在尾', () => {
    expect(pushUndoSnapshot(['a', 'b'], 'c', 3)).toEqual(['a', 'b', 'c']);
  });

  it('超出上限 ⇒ 丢**最早**的（源 `K.shift()`），保持长度 = 上限', () => {
    expect(pushUndoSnapshot(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
    expect(pushUndoSnapshot([], 'x', 1)).toEqual(['x']);
  });

  it('⚠️ 默认上限 = 12（源 `V3`）；**不改入参**（纯层统一）', () => {
    expect(BRUSH_UNDO_LIMIT).toBe(12);
    const src = ['a'];
    const out = pushUndoSnapshot(src, 'b');
    expect(out).not.toBe(src);
    expect(src).toEqual(['a']);
  });
});
