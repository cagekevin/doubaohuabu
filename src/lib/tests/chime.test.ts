/**
 * 提示音「音型」单测（原 `gt`，`_Component42.jsx:398-434`）
 *
 * ⚠️ 只测**纯排期**（`chimePlan`）—— `playChime` 要真 `AudioContext`，不在单测范围（原则 7）。
 * ⚠️ 断言**逐值对源**（频率 / 间隔 / 包络 / 停时六个字面量）—— 不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { chimePlan } from '../chime';

describe('chimePlan（原 `gt` 的音型）', () => {
  const plan = chimePlan();

  it('四声：C5 / E5 / G5 三连 + C6 收尾（逐字对源 402/420）', () => {
    expect(plan.map((t) => t.hz)).toEqual([523.25, 659.25, 783.99, 1046.5]);
    expect(plan).toHaveLength(4);
  });

  it('★ 三连每音间隔 `0.1s`；收尾接在三连之后（`3 × 0.1`，源 403/421）', () => {
    expect(plan[0]!.at).toBe(0);
    expect(plan[1]!.at).toBeCloseTo(0.1);
    expect(plan[2]!.at).toBeCloseTo(0.2);
    expect(plan[3]!.at).toBeCloseTo(0.3);
  });

  it('★ 包络逐值：三连 `peak .25 / attack .015 / release .42 / stopAfter .45`（源 411-415）', () => {
    for (const tone of plan.slice(0, 3)) {
      expect(tone).toMatchObject({ peak: 0.25, attack: 0.015, release: 0.42, stopAfter: 0.45 });
    }
  });

  it('★ 收尾音包络**与三连不同**：`peak .18 / attack .01 / release .5 / stopAfter .55`（源 423-427）', () => {
    expect(plan[3]).toMatchObject({ peak: 0.18, attack: 0.01, release: 0.5, stopAfter: 0.55 });
  });
});
