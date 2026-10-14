/**
 * 画布「成片落地」提示音的**音型**（原 `gt`，`_Component42.jsx:398-434`）—— ★ 纯数据部分
 *
 * **触发条件**（原 435-443）：`soundEnabled` 为真 **且** `video` 节点数**变多** ⇒ 响一次。
 *
 * **音型**（逐字对源）：**C5 → E5 → G5** 三连（`523.25 / 659.25 / 783.99`，每音间隔 `0.1s`），
 * 每音 `sine`、包络 `0.0001 →(0.015s) 0.25 →(0.42s) 0.001`、`0.45s` 后停；
 * 收尾再补一记 **C6**（`1046.5`，峰值 `0.18`、`0.01s` 起音、`0.5s` 衰减、`0.55s` 后停）。
 *
 * ⚠️ **本文件只留「音型」**（`chimePlan` 是**纯函数** ⇒ 住 `lib` 才可单测，见 `lib/tests/chime.test.ts`）。
 *    **播放**（`playChime`，碰 `AudioContext` / `window.setTimeout`）住 **`ui/lib/chime.ts`** —— 原则 4：
 *    `lib` 不得碰宿主；Web DOM/WebAudio 工具归**消费它的层**（`ui`）。
 */

/** 三连音（原 `Oe`，`_Component42.jsx:402`）—— C5 / E5 / G5 */
const NOTES = [523.25, 659.25, 783.99] as const;
/** 每音间隔（秒；原 `We`，403） */
const NOTE_GAP = 0.1;
/** 收尾音（原 `Ze.frequency.value`，420）—— C6 */
const TAIL_HZ = 1046.5;

/** 一个音的排期（**相对** `AudioContext.currentTime`，纯数据 ⇒ 可单测） */
export interface ChimeTone {
  hz: number;
  /** 起音时刻（秒，相对 0） */
  at: number;
  /** 峰值增益 */
  peak: number;
  /** 起音时长（秒） */
  attack: number;
  /** 衰减到 `0.001` 的时长（秒，从起音末算起） */
  release: number;
  /** 相对起音的停止时刻（秒） */
  stopAfter: number;
}

/**
 * 排期（**纯函数** —— 与 `playChime` 分开，好让"音型"可单测）
 *
 * 源里这三连 + 收尾的**频率 / 间隔 / 包络 / 停时**是六个内联字面量，这里原样提出成数据。
 */
export function chimePlan(): ChimeTone[] {
  const tones: ChimeTone[] = NOTES.map((hz, i) => ({
    hz,
    at: i * NOTE_GAP,
    peak: 0.25,
    attack: 0.015,
    release: 0.42,
    stopAfter: 0.45,
  }));
  tones.push({
    hz: TAIL_HZ,
    at: NOTES.length * NOTE_GAP,
    peak: 0.18,
    attack: 0.01,
    release: 0.5,
    stopAfter: 0.55,
  });
  return tones;
}
