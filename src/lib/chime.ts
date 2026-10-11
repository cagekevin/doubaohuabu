/**
 * 画布「成片落地」提示音（原 `gt`，`_Component42.jsx:398-434`）
 *
 * **触发条件**（原 435-443）：`soundEnabled` 为真 **且** `video` 节点数**变多** ⇒ 响一次。
 *
 * **音型**（逐字对源）：**C5 → E5 → G5** 三连（`523.25 / 659.25 / 783.99`，每音间隔 `0.1s`），
 * 每音 `sine`、包络 `0.0001 →(0.015s) 0.25 →(0.42s) 0.001`、`0.45s` 后停；
 * 收尾再补一记 **C6**（`1046.5`，峰值 `0.18`、`0.01s` 起音、`0.5s` 衰减、`0.55s` 后停）；
 * 全部排完后 `1.5s` 关闭 `AudioContext`。
 *
 * ⚠️ 源把整段包在 `try { … } catch {}` 里**空吞**（老浏览器没有 `AudioContext`）——
 *    本实现改 `console.warn` 留痕（原则 6），**语义等价**（放不出声就不放）。
 * ⚠️ 源还写了 `window.webkitAudioContext` 回落 —— **Electron 的 Chromium 恒有 `AudioContext`**
 *    （Chrome 35+）⇒ 该回落**结构上不可达**，**不落**（同 `gv-dl` 那刀对"老后端回落"的处理）。
 *
 * 归属：纯浏览器能力工具（`lib` 层，L0；与 `lib/videoPoster.ts` 同法）。
 */

import { log } from './log';

/** 三连音（原 `Oe`，`_Component42.jsx:402`）—— C5 / E5 / G5 */
const NOTES = [523.25, 659.25, 783.99] as const;
/** 每音间隔（秒；原 `We`，403） */
const NOTE_GAP = 0.1;
/** 收尾音（原 `Ze.frequency.value`，420）—— C6 */
const TAIL_HZ = 1046.5;
/** 关闭 `AudioContext` 的延时（ms；原 428 的 `1500`） */
const CLOSE_MS = 1500;

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

/**
 * 响一次（原 `gt`）—— 失败**留痕不吞**（原则 6）
 *
 * ⚠️ 浏览器的自动播放策略：`AudioContext` 需要有**用户手势**才出声。本音是在
 *    「新成片出现」这种异步事件里放的 —— 此时用户必然已经点过界面（粘性激活）⇒ 正常出声。
 */
export function playChime(): void {
  try {
    const ctx = new AudioContext();
    const t0 = ctx.currentTime;
    for (const tone of chimePlan()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone.hz;
      const at = t0 + tone.at;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(tone.peak, at + tone.attack);
      gain.gain.exponentialRampToValueAtTime(0.001, at + tone.attack + tone.release);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + tone.stopAfter);
    }
    window.setTimeout(() => {
      try {
        void ctx.close();
      } catch (err) {
        log.warn('[chime] 关闭 AudioContext 失败:', err);
      }
    }, CLOSE_MS);
  } catch (err) {
    log.warn('[chime] 提示音播放失败:', err);
  }
}
