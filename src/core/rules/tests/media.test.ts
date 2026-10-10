/**
 * 视频回填匹配单测 —— 回源 `Kk`(35758) / `hR`(35767-35933) / `qk`(35734)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 *
 * ⚠️ 每条 DP 用例的期望值都是**按源码手工推演**出来的（不是"跑出来就断言"）：
 *    时间戳是唯一线索，`hR` 用「保序最小总时间差」对齐 ⇒ 断言的是**具体指派**，不是"有结果就行"。
 */

import { describe, expect, it } from 'vitest';
import { filterLiveJobs, matchVideosToNodes, type SendJobRecord } from '../media';
import { MAX_JOB_AGE_MS } from '@/constants';

const job = (nodeId: string, sendTime: number): SendJobRecord => ({ nodeId, sendTime });
/** 站点时间戳用**秒**写（`pR` 会 ×1000） */
const vid = (key: string, seconds: number) => ({ key, created_at: seconds });

describe('filterLiveJobs（原 `Kk` 35758）', () => {
  const NOW = 10_000;

  it('三个条件：有 nodeId → isNodeAlive → 时效内', () => {
    const jobs = [job('n1', NOW), job('n2', NOW), job('n3', NOW)];
    const alive = (id: string) => id !== 'n2';
    expect(filterLiveJobs(jobs, alive, NOW).map((j) => j.nodeId)).toEqual(['n1', 'n3']);
  });

  it('★ 无 nodeId 的条目被丢掉', () => {
    const jobs = [{ nodeId: '' , sendTime: NOW }, job('n1', NOW)];
    expect(filterLiveJobs(jobs, null, NOW)).toHaveLength(1);
  });

  it('★ 时效边界：恰好等于 `maxJobAgeMs` **保留**（源码 `<=`）', () => {
    expect(filterLiveJobs([job('n1', NOW - MAX_JOB_AGE_MS)], null, NOW)).toHaveLength(1);
    expect(filterLiveJobs([job('n1', NOW - MAX_JOB_AGE_MS - 1)], null, NOW)).toHaveLength(0);
  });

  it('★ 不传 `isNodeAlive` ⇒ 不做存活过滤', () => {
    expect(filterLiveJobs([job('n1', NOW)], null, NOW)).toHaveLength(1);
    expect(filterLiveJobs([job('n1', NOW)], undefined, NOW)).toHaveLength(1);
  });

  it('空 / null → 空数组', () => {
    expect(filterLiveJobs(null, null, NOW)).toEqual([]);
    expect(filterLiveJobs(undefined, null, NOW)).toEqual([]);
    expect(filterLiveJobs([], null, NOW)).toEqual([]);
  });
});

describe('matchVideosToNodes（原 `hR` 35767）', () => {
  it('④ 两侧都空 → 空指派、空剩余', () => {
    const r = matchVideosToNodes({ vids: [], jobs: [], now: 0 });
    expect(r.assignment.size).toBe(0);
    expect(r.leftoverJobs).toEqual([]);
  });

  it('④ 视频为空 → 任务**全部**算剩余', () => {
    const jobs = [job('n1', 1000), job('n2', 2000)];
    const r = matchVideosToNodes({ vids: [], jobs, now: 2000 });
    expect(r.assignment.size).toBe(0);
    expect(r.leftoverJobs).toEqual(jobs);
  });

  it('④ 任务为空 → 全部 null，**最后一个**视频给 fallback', () => {
    const r = matchVideosToNodes({ vids: [vid('a', 1), vid('b', 2)], jobs: [], now: 2000, fallbackNodeId: 'F' });
    expect([...r.assignment]).toEqual([
      ['a', null],
      ['b', 'F'],
    ]);
    expect(r.leftoverJobs).toEqual([]);
  });

  it('⑤ u=1,d=1 → 配上，无剩余', () => {
    const r = matchVideosToNodes({ vids: [vid('a', 1)], jobs: [job('n1', 1000)], now: 1000 });
    expect([...r.assignment]).toEqual([['a', 'n1']]);
    expect(r.leftoverJobs).toEqual([]);
  });

  it('★ ⑤ u=1,d=2 → 配给**时间最近**的任务，另一个算剩余', () => {
    // 视频 ts=1000；任务 A=1000（差 0）、B=2000（差 1000）⇒ 应配 A
    const r = matchVideosToNodes({ vids: [vid('a', 1)], jobs: [job('A', 1000), job('B', 2000)], now: 2000 });
    expect([...r.assignment]).toEqual([['a', 'A']]);
    expect(r.leftoverJobs).toEqual([job('B', 2000)]);
  });

  it('★ ⑥ u=2,d=1（转置分支）→ 只配 1 个；未匹配的**最后一个**给 fallback，剩余恒为空', () => {
    const r = matchVideosToNodes({
      vids: [vid('a', 1), vid('b', 5)],
      jobs: [job('n1', 1000)],
      now: 5000,
      fallbackNodeId: 'F',
    });
    expect([...r.assignment]).toEqual([
      ['a', 'n1'],
      ['b', 'F'],
    ]);
    expect(r.leftoverJobs).toEqual([]);
  });

  it('★ fallback 只给**最后一个**未匹配的视频（其余为 null）', () => {
    const r = matchVideosToNodes({
      vids: [vid('a', 1), vid('b', 2), vid('c', 5)],
      jobs: [job('n1', 1000)],
      now: 5000,
      fallbackNodeId: 'F',
    });
    expect([...r.assignment]).toEqual([
      ['a', 'n1'],
      ['b', null],
      ['c', 'F'],
    ]);
  });

  it('★ 无 fallback ⇒ 未匹配一律 null', () => {
    const r = matchVideosToNodes({ vids: [vid('a', 1), vid('b', 5)], jobs: [job('n1', 1000)], now: 5000 });
    expect([...r.assignment]).toEqual([
      ['a', 'n1'],
      ['b', null],
    ]);
  });

  it('★ ③ 时间戳**不可用**时整体 `reverse()`（不是"跳过排序"）—— 这决定谁是"最后一个"', () => {
    // 两条都无 created_at ⇒ ts 均 NaN ⇒ reverse ⇒ 顺序变 [b, a] ⇒ 最后一个 = a
    const r = matchVideosToNodes({
      vids: [{ key: 'a' }, { key: 'b' }],
      jobs: [],
      now: 0,
      fallbackNodeId: 'F',
    });
    expect([...r.assignment]).toEqual([
      ['b', null],
      ['a', 'F'],
    ]);
  });

  it('★ ③ 时间戳齐全时按时间升序（同刻按原序）', () => {
    const r = matchVideosToNodes({ vids: [vid('late', 9), vid('early', 1)], jobs: [], now: 0 });
    expect([...r.assignment.keys()]).toEqual(['early', 'late']);
  });

  it('★ 死节点 / 过期任务不参与匹配', () => {
    const r = matchVideosToNodes({
      vids: [vid('a', 1)],
      jobs: [job('dead', 1000), job('alive', 1000)],
      isNodeAlive: (id) => id === 'alive',
      now: 1000,
    });
    expect([...r.assignment]).toEqual([['a', 'alive']]);
    expect(r.leftoverJobs).toEqual([]); // dead 已被过滤掉，不算"剩余"
  });

  it('★ 视频侧：`created_at` 解析失败 ⇒ 该视频仍参与，但代价按 0 算（源码 `h` 的 else 分支）', () => {
    const r = matchVideosToNodes({
      vids: [{ key: 'a', created_at: null }],
      jobs: [job('n1', 1000)],
      now: 1000,
    });
    expect([...r.assignment]).toEqual([['a', 'n1']]);
  });

  it('★ 不改入参（内部排序只在副本上）', () => {
    const vids = [vid('late', 9), vid('early', 1)];
    matchVideosToNodes({ vids, jobs: [], now: 0 });
    expect(vids.map((v) => v.key)).toEqual(['late', 'early']);
  });
});

/**
 * ★ **property 测试：与「暴力最优解」交叉验证**
 *
 * 为什么需要它：`hR` 是 167 行 DP，逐例断言只能覆盖我**想得到**的输入。
 * DP 的目标函数是明确的 —— **把全部视频（或全部任务）保序匹配到对方，使总时间差最小**
 * ⇒ 可以**穷举所有保序匹配**求最优值，与实现的总代价比对。
 *
 * ⚠️ 只比**总代价**，不比"选了哪几个"：DP 在等代价时按 `<=` 偏好对角（即偏好匹配），
 *    与穷举的任一最优解可能不同 —— 比指派会误报，比代价才是不变量。
 * ⚠️ 用**确定性 PRNG**（core 禁止 `Math.random`，测试里用种子随机可复现）。
 */
describe('★ property：与暴力最优解交叉验证', () => {
  /** mulberry32：小而确定的 PRNG */
  const makeRnd = (seed: number) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** 穷举「从 [0,n) 里取 k 个」的全部组合 */
  const combos = (n: number, k: number): number[][] => {
    const out: number[][] = [];
    const walk = (start: number, acc: number[]): void => {
      if (acc.length === k) {
        out.push([...acc]);
        return;
      }
      for (let i = start; i < n; i += 1) walk(i + 1, [...acc, i]);
    };
    walk(0, []);
    return out;
  };

  const costOf = (vidTs: number, j: SendJobRecord): number => Math.abs(vidTs - (j.sendTime || 0));

  it('u <= d：总代价 = 枚举所有保序匹配的最小值；且匹配**保序**、全部视频都配上', () => {
    const rnd = makeRnd(20261010);
    for (let trial = 0; trial < 300; trial += 1) {
      const u = 1 + Math.floor(rnd() * 4);
      const d = u + Math.floor(rnd() * 4);
      // created_at 递增 ⇒ 内部按 ts 排序是恒等变换，顺序可预测
      const vids = Array.from({ length: u }, (_, i) => vid(`v${i}`, i + 1));
      const jobs = Array.from({ length: d }, (_, i) => job(`n${i}`, Math.floor(rnd() * 5) * 1000));
      const sortedJobs = [...jobs].sort((a, b) => (a.sendTime || 0) - (b.sendTime || 0));

      const r = matchVideosToNodes({ vids, jobs, now: 0, maxJobAgeMs: Number.MAX_SAFE_INTEGER });

      // ① 实现的总代价
      const byNode = new Map(sortedJobs.map((j) => [j.nodeId, j]));
      let actual = 0;
      let prev = -1;
      for (const [i, v] of vids.entries()) {
        const nodeId = r.assignment.get(v.key);
        const j = nodeId ? byNode.get(nodeId) : undefined;
        expect(j).toBeDefined(); // ② 全部视频都必须配上
        if (!j) continue;
        actual += costOf((i + 1) * 1000, j);
        const k = sortedJobs.findIndex((x) => x.nodeId === nodeId); // ③ 保序
        expect(k).toBeGreaterThan(prev);
        prev = k;
      }

      // ④ 暴力最优
      let best = Infinity;
      for (const combo of combos(d, u)) {
        let sum = 0;
        for (const [i, k] of combo.entries()) {
          const j = sortedJobs[k];
          if (!j) {
            sum = Infinity;
            break;
          }
          sum += costOf((i + 1) * 1000, j);
        }
        best = Math.min(best, sum);
      }
      expect(actual).toBe(best);
    }
  });

  it('u > d：总代价 = 把**全部任务**保序配给视频的最小值', () => {
    const rnd = makeRnd(20261011);
    for (let trial = 0; trial < 300; trial += 1) {
      const d = 1 + Math.floor(rnd() * 3);
      const u = d + 1 + Math.floor(rnd() * 3);
      const vids = Array.from({ length: u }, (_, i) => vid(`v${i}`, i + 1));
      const jobs = Array.from({ length: d }, (_, i) => job(`n${i}`, Math.floor(rnd() * 5) * 1000));
      const sortedJobs = [...jobs].sort((a, b) => (a.sendTime || 0) - (b.sendTime || 0));

      const r = matchVideosToNodes({ vids, jobs, now: 0, maxJobAgeMs: Number.MAX_SAFE_INTEGER });

      // ① 实现的总代价（只累加「配上了」的）
      const byNode = new Map(sortedJobs.map((j) => [j.nodeId, j]));
      let actual = 0;
      for (const [i, v] of vids.entries()) {
        const nodeId = r.assignment.get(v.key);
        const j = nodeId ? byNode.get(nodeId) : undefined;
        if (j) actual += costOf((i + 1) * 1000, j);
      }

      // ② 暴力最优：把 d 个任务保序配给 u 个视频
      let best = Infinity;
      for (const combo of combos(u, d)) {
        let sum = 0;
        for (const [jIdx, vIdx] of combo.entries()) {
          const j = sortedJobs[jIdx];
          if (!j) {
            sum = Infinity;
            break;
          }
          sum += costOf((vIdx + 1) * 1000, j);
        }
        best = Math.min(best, sum);
      }
      expect(actual).toBe(best);
    }
  });
});

/**
 * ★ 审查补例 —— 独立审查指出：原有用例里 `u<=d` **只测了 u=1**、转置分支**只测了 d=1**
 * ⇒ DP 的「保序匹配」与「`y→k` 反转」两块**核心逻辑没有任何测试能咬**。此处补齐。
 */
describe('★ 审查补例（多元素保序 / 反转 / tie-break）', () => {
  it('★ ⑤ u=2,d=3：多视频保序匹配 + **跳过**中间任务（走回溯的 skip 路径）', () => {
    const r = matchVideosToNodes({
      vids: [vid('a', 1), vid('b', 2)],
      jobs: [job('J0', 100), job('J1', 1000), job('J2', 2000)],
      now: 2000,
    });
    expect([...r.assignment]).toEqual([
      ['a', 'J1'],
      ['b', 'J2'],
    ]);
    expect(r.leftoverJobs).toEqual([job('J0', 100)]);
  });

  it('★ ⑥ u=3,d=2：**`y→k` 反转**在多元素下才真正被检验；未匹配者夹在中间', () => {
    const r = matchVideosToNodes({
      vids: [vid('a', 1), vid('b', 2), vid('c', 3)],
      jobs: [job('J0', 1000), job('J1', 3000)],
      now: 3000,
      fallbackNodeId: 'F',
    });
    expect([...r.assignment]).toEqual([
      ['a', 'J0'],
      ['b', 'F'],
      ['c', 'J1'],
    ]);
    expect(r.leftoverJobs).toEqual([]);
  });

  it('★ u=d=2：任务**乱序输入** ⇒ 内部按 `sendTime` 升序后仍正确配对', () => {
    const r = matchVideosToNodes({
      vids: [vid('a', 1), vid('b', 2)],
      jobs: [job('J0', 2000), job('J1', 1000)],
      now: 2000,
    });
    expect([...r.assignment]).toEqual([
      ['a', 'J1'],
      ['b', 'J0'],
    ]);
  });

  it('★ 时间戳**相同** ⇒ 按原序（咬住 `|| a.i - b.i` 的 tie-break）', () => {
    const r = matchVideosToNodes({ vids: [vid('a', 1), vid('b', 1)], jobs: [], now: 0 });
    expect([...r.assignment.keys()]).toEqual(['a', 'b']);
  });

  it('★ **混合**时间戳（一条有效一条 NaN）⇒ 同样走 `reverse` 分支', () => {
    const r = matchVideosToNodes({
      vids: [{ key: 'a', created_at: 1 }, { key: 'b' }],
      jobs: [],
      now: 0,
      fallbackNodeId: 'F',
    });
    expect([...r.assignment]).toEqual([
      ['b', null],
      ['a', 'F'],
    ]);
  });

  it('★ ⑤ 分支**忽略** fallback（全部配上时不应出现 fallback）', () => {
    const r = matchVideosToNodes({
      vids: [vid('a', 1)],
      jobs: [job('n1', 1000)],
      now: 1000,
      fallbackNodeId: 'F',
    });
    expect([...r.assignment]).toEqual([['a', 'n1']]);
  });

  it('★ 自定义 `maxJobAgeMs`：过期任务被过滤 ⇒ 退化为「任务为空」分支', () => {
    const r = matchVideosToNodes({
      vids: [vid('a', 1)],
      jobs: [job('n1', 1000)],
      now: 5000,
      maxJobAgeMs: 1000,
      fallbackNodeId: 'F',
    });
    expect([...r.assignment]).toEqual([['a', 'F']]);
    expect(r.leftoverJobs).toEqual([]);
  });
});
