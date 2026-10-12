import { describe, it, expect } from 'vitest';
import {
  classifyFirstRound,
  detectCutoff,
  hasVideoDescendant,
  pickFreshVideos,
  seedSeenKeys,
  shouldStartTimer,
  type DetectVideoLike,
} from '../genDetect';
import { DETECT_BASELINE_WINDOW_MS, DETECT_TIMER_FALLBACK_MS } from '@/constants';

/** ⚠️ 用**真实量级**的毫秒（> 1e12）—— 否则 `parseSiteTimestamp` 会按**秒**×1000（源里 `created_at` 是秒/毫秒真值） */
const NOW = 1_700_000_000_000;

const vid = (key: string, created_at: unknown, ready = true): DetectVideoLike => ({
  key,
  created_at,
  ready,
  url: ready ? `https://x/${key}.mp4` : null,
});

describe('seedSeenKeys（原 `:526-541` 的基线播种）', () => {
  it('= `videoShares[].vid` ∪ `video 节点[].data.vid`', () => {
    const set = seedSeenKeys(
      [{ vid: 'a' }, { vid: null }, {}],
      [
        { type: 'video', data: { vid: 'b' } },
        { type: 'text', data: { vid: 'c' } },
        { type: 'video', data: { vid: '' } },
        { type: 'video', data: {} },
      ],
    );
    expect([...set].sort()).toEqual(['a', 'b']);
  });

  it('空输入 ⇒ 空集（不是 null）', () => {
    expect(seedSeenKeys([], []).size).toBe(0);
  });
});

describe('detectCutoff（原 `_e()`）', () => {
  it('有正 sendTime ⇒ min(now, …) - 60000', () => {
    expect(detectCutoff([NOW - 5000, NOW - 3000], NOW)).toBe(NOW - 5000 - DETECT_BASELINE_WINDOW_MS);
  });

  it('now 更小 ⇒ 以 now 为基', () => {
    expect(detectCutoff([NOW + 9000], NOW)).toBe(NOW - DETECT_BASELINE_WINDOW_MS);
  });

  it('没有正 sendTime ⇒ now - 60000（源 `[ve]` 兜底）', () => {
    expect(detectCutoff([0, -5], NOW)).toBe(NOW - DETECT_BASELINE_WINDOW_MS);
    expect(detectCutoff([], NOW)).toBe(NOW - DETECT_BASELINE_WINDOW_MS);
  });
});

describe('classifyFirstRound（原首轮建基线）', () => {
  const cutoff = detectCutoff([NOW], NOW); // = NOW - 60000

  it('窗内 ⇒ 新片；不然 ⇒ 基线', () => {
    const { baselineKeys, fresh } = classifyFirstRound(
      [vid('old', NOW - 100_000), vid('new', NOW - 1000)],
      cutoff,
    );
    expect([...baselineKeys]).toEqual(['old']);
    expect(fresh.map((v) => v.key)).toEqual(['new']);
  });

  it('不可下载（`!ready || !url`）⇒ 既不进基线也不进新片', () => {
    const { baselineKeys, fresh } = classifyFirstRound([vid('x', NOW - 1000, false)], cutoff);
    expect(baselineKeys.size).toBe(0);
    expect(fresh).toHaveLength(0);
  });

  it('无 `key` ⇒ 跳过', () => {
    const { fresh } = classifyFirstRound([{ key: '', created_at: NOW, ready: true, url: 'u' }], cutoff);
    expect(fresh).toHaveLength(0);
  });

  it('无时间戳 ⇒ 走基线（窗内判否），不算新片', () => {
    const { baselineKeys, fresh } = classifyFirstRound([vid('a', null)], cutoff);
    expect([...baselineKeys]).toEqual(['a']);
    expect(fresh).toHaveLength(0);
  });

  it('保序：新片按页面顺序', () => {
    const { fresh } = classifyFirstRound([vid('b', NOW - 1), vid('a', NOW - 2)], cutoff);
    expect(fresh.map((v) => v.key)).toEqual(['b', 'a']);
  });
});

describe('pickFreshVideos（原常规轮 `Ne`）', () => {
  const cutoff = detectCutoff([NOW], NOW);

  it('已在 `seen` ⇒ 跳过', () => {
    const seen = new Set(['a']);
    expect(pickFreshVideos([vid('a', NOW - 1)], cutoff, seen, new Set())).toHaveLength(0);
  });

  it('窗内 ⇒ 新片', () => {
    expect(pickFreshVideos([vid('n', NOW - 1)], cutoff, new Set(), new Set()).map((v) => v.key)).toEqual([
      'n',
    ]);
  });

  it('★ 不在窗内 ∧ 在基线里 ⇒ 判旧片并**写进 `seen`**（源 `b.current.add`）', () => {
    const seen = new Set<string>();
    const out = pickFreshVideos([vid('old', NOW - 100_000)], cutoff, seen, new Set(['old']));
    expect(out).toHaveLength(0);
    expect(seen.has('old')).toBe(true);
  });

  it('★ 不在窗内但**不在基线里** ⇒ 仍算新片（源 `|| !K.has(key)`）', () => {
    const seen = new Set<string>();
    const out = pickFreshVideos([vid('ghost', NOW - 100_000)], cutoff, seen, new Set());
    expect(out.map((v) => v.key)).toEqual(['ghost']);
    expect(seen.has('ghost')).toBe(false);
  });

  it('不可下载 ⇒ 跳过', () => {
    expect(pickFreshVideos([vid('x', NOW - 1, false)], cutoff, new Set(), new Set())).toHaveLength(0);
  });
});

describe('hasVideoDescendant（原 `O0`）', () => {
  const N = (id: string, type = 'text') => ({ id, type });
  const E = (source: string, target: string) => ({ source, target });

  it('无 video 节点 ⇒ false（源早退）', () => {
    expect(hasVideoDescendant([N('a'), N('b')], [E('a', 'b')], 'a')).toBe(false);
  });

  it('直连下游有 video ⇒ true', () => {
    expect(hasVideoDescendant([N('a'), N('v', 'video')], [E('a', 'v')], 'a')).toBe(true);
  });

  it('多跳可达 ⇒ true（BFS）', () => {
    expect(
      hasVideoDescendant([N('a'), N('b'), N('v', 'video')], [E('a', 'b'), E('b', 'v')], 'a'),
    ).toBe(true);
  });

  it('★ 起点**自身**是 video ⇒ **不算**「有后代」（源只收 target）', () => {
    expect(hasVideoDescendant([N('v', 'video')], [], 'v')).toBe(false);
  });

  it('不可达 ⇒ false', () => {
    expect(hasVideoDescendant([N('a'), N('x'), N('v', 'video')], [E('x', 'v')], 'a')).toBe(false);
  });
});

describe('shouldStartTimer（原 `xe`）', () => {
  it('探测到「已提交」⇒ true（无论早晚）', () => {
    expect(shouldStartTimer(1000, 1000, true, DETECT_TIMER_FALLBACK_MS)).toBe(true);
  });

  it('未探测到 ⇒ 等满兜底阈值才 true', () => {
    expect(shouldStartTimer(1000, 1000 + DETECT_TIMER_FALLBACK_MS - 1, false, DETECT_TIMER_FALLBACK_MS)).toBe(
      false,
    );
    expect(shouldStartTimer(1000, 1000 + DETECT_TIMER_FALLBACK_MS, false, DETECT_TIMER_FALLBACK_MS)).toBe(true);
  });
});
