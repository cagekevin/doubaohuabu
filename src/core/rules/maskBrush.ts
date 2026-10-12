/**
 * 遮脸**笔刷涂抹**的纯规则（★ 纯函数，必测）
 *
 * ★ **2026-10-12（`TD-09-4` 第二块 b）**：图片编辑器（源 `G3.jsx`）的"涂抹"工具，
 *   本文件只落它**与画布无关**的两条规则；绘制（`arc` + `clip` + 效果填充）归 UI。
 *
 * 依据（**逐行回源**，`expanded_components/G3.jsx`）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `BRUSH_DEFAULT_DIAMETER` | `:20` 的 `useState(64)`（`C`） | 笔刷**直径**默认 64（半径 = `C/2`） |
 *   | `brushPatchRect` | `:268-276` 的 `Je` | 圆形笔刷＝ `arc(cx, cy, r)` **clip** 后填一个**同心等径的正方** `(cx-r, cy-r, 2r, 2r)` |
 *   | `BRUSH_UNDO_LIMIT` | `shared.js:42651` 的 `V3 = 12` | **撤销快照**上限 12 张 |
 *   | `pushUndoSnapshot` | `:148-152` | `push` 后 **超过上限就 `shift()`（丢最早）**；撤销是 `pop()` |
 *
 * ⚠️ **订正**：`V3` 曾被（本仓债文里）猜成"strokes 上限"——回源看 `pe.current` 存的是
 *   **整张画布的快照**（`document.createElement('canvas')` + `drawImage`），且同函数 `:157` 的
 *   `re` 是 `pop()` 撤销 ⇒ 它是**撤销栈**，不是笔画数组。
 * ⚠️ **不可变**：`pushUndoSnapshot` 返回**新数组**（源是就地 `push`/`shift` 改 ref）——
 *   纯层统一"不改入参"（与 `makeGraphPreset` 等同判据）。
 */

/** 笔刷直径默认值（源 `C` 的初值 64） */
export const BRUSH_DEFAULT_DIAMETER = 64;

/** 撤销快照上限（源 `V3` = 12） */
export const BRUSH_UNDO_LIMIT = 12;

/** 一个矩形（图片坐标系） */
export interface BrushRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 笔刷一笔的**填充矩形**（源 `Je` 的 `Qe(ctx, cx-r, cy-r, 2r, 2r, …)`）
 *
 * ⚠️ 与 clip 圆（`arc(cx, cy, r)`）**同心等径** —— 矩形是圆的**外接正方**，
 *   超出圆的部分被 clip 切掉 ⇒ 视觉上仍是一个圆。
 */
export function brushPatchRect(cx: number, cy: number, r: number): BrushRect {
  return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
}

/**
 * 推入一张撤销快照（源 `:148-152`）
 *
 * @param limit 超出即丢**最早**的（源 `K.shift()`）
 * @returns **新数组**（不改入参）
 */
export function pushUndoSnapshot<T>(
  stack: readonly T[],
  snapshot: T,
  limit: number = BRUSH_UNDO_LIMIT,
): T[] {
  const next = [...stack, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
