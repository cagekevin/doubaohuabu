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
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
