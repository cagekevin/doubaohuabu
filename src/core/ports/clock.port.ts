/**
 * ClockPort —— 时序（★ 为了可测）
 *
 * 依据：docs/11 §4.4
 * 目的：让「生成轮询 3s / 静默 9s / 持久化防抖 600ms / 撤销合并 800ms」可**用假时钟单测**，
 *       不必等真实时间。同时满足 §6.5 原则 4：`core` 不得直接调 `Date.now` / `setTimeout`。
 */

export type Cancel = () => void;

export interface ClockPort {
  /** 当前时间戳（ms） */
  now(): number;
  /** 一次性定时 */
  setTimeout(fn: () => void, ms: number): Cancel;
  /** 周期定时 */
  setInterval(fn: () => void, ms: number): Cancel;
}
