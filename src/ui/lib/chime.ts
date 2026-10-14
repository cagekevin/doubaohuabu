/**
 * 画布「成片落地」提示音的**播放**（原 `gt`，`_Component42.jsx:398-434`）—— ★ 碰 WebAudio 的部分
 *
 * ⚠️ **为什么住 `ui/lib/`**（原则 4）：它碰 `AudioContext` / `window.setTimeout` —— **宿主/Web 能力**
 *    ⇒ `lib`（L0 无状态工具）不得承载。而它**只被 `ui` 消费**（`CanvasHost`）⇒ 归 `ui` 层。
 *    **音型**（纯、可单测）留在 `lib/chime.ts`（`chimePlan`）。
 *
 * ⚠️ 源把整段包在 `try { … } catch {}` 里**空吞**（老浏览器没有 `AudioContext`）——
 *    本实现改 `log.warn` 留痕（原则 6），**语义等价**（放不出声就不放）。
 * ⚠️ 源还写了 `window.webkitAudioContext` 回落 —— **Electron 的 Chromium 恒有 `AudioContext`**
 *    （Chrome 35+）⇒ 该回落**结构上不可达**，**不落**（同 `gv-dl` 那刀对"老后端回落"的处理）。
 */

import { log } from '@/lib/log';
import { chimePlan } from '@/lib/chime';

/** 关闭 `AudioContext` 的延时（ms；原 428 的 `1500`） */
const CLOSE_MS = 1500;

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
