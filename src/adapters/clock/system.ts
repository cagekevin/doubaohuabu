/**
 * ClockPort 实现（真实时钟）
 * 依据：docs/11 §4.4
 *
 * ⚠️ 这是 `core` **唯一**获得时间/定时的途径（原则 4：core 不得直接调 Date.now / setTimeout）
 */

import type { Cancel, ClockPort } from '@/core/ports/clock.port';

export function createSystemClock(): ClockPort {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => {
      const id = globalThis.setTimeout(fn, ms);
      return (() => globalThis.clearTimeout(id)) as Cancel;
    },
    setInterval: (fn, ms) => {
      const id = globalThis.setInterval(fn, ms);
      return (() => globalThis.clearInterval(id)) as Cancel;
    },
  };
}
