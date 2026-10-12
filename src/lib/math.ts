/**
 * 数值工具（无状态 —— `lib` 层，L0）
 *
 * ⚠️ 为什么放 `lib/`（判据 A1）：通用数学原语（纯函数、不读时钟、无副作用）——
 *    各层（`core`／`state`／`ui`）都能依赖。
 *
 * ⚠️ **它取代什么**：此前 `clamp` 只长在 `core/rules/facemask.ts`（人脸遮罩业务模块里），
 *    ⇒ 其余模块取不到通用原语，只能就地内联 `Math.min(Math.max(...))` 各写一份
 *    （`sendQueuePanel`／`capture`／`faceDetect`／`genVideo`／`VideoNode`／`GenVideoNode`／
 *    `videoPoster` 共 10 处）。本文件把它收口为**唯一实现**。
 */

/** 把 `v` 夹进 `[min, max]`（逐字等价 `Math.min(Math.max(v, min), max)`，要求 `min <= max`） */
/**
 * 0..1 的比例 → **百分比整数**（`0.126` ⇒ `13`）
 *
 * ★ **2026-10-12（`TD-16-109`）收口**：此前 `FaceMaskPanel` ＋ `FaceMarksLayer` 各写一份
 *   `Math.round(pad * 100)`（同一个数据的同一处显示）。
 * ⚠️ **只收这一种语义**：进度条那类「`done / total` 再乘 100」是**另一种语义**
 *   （带除零保护、且全仓仅 1 处 ⇒ 不够收口门槛），**不要**并进本函数。
 */
export function toPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
