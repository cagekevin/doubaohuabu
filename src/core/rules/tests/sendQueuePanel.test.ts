/**
 * 发送队列面板纯显示层单测（原 `tc` 42481 / `B0` 42493 / `Qd` 42586）
 *
 * 断言红线（**实现一变必红**）：`formatElapsed` 的三档与**秒补零**、`deriveGenView` 的
 * **四组判定顺序**（尤其"`status !== 'success'` 时完全不看节点与进度"）与
 * **attempts 的三重过滤**（时间宽限 / 账号匹配 / 取最后一条）、`clampPanelPosition` 的**夹取**。
 */

import { describe, expect, it } from 'vitest';
import {
  clampPanelPosition,
  deriveGenView,
  formatElapsed,
  type QueueItemLike,
  type QueueNodeLike,
} from '../sendQueuePanel';

const item = (patch: Partial<QueueItemLike> = {}): QueueItemLike => ({ status: 'success', ...patch });

describe('formatElapsed（原 `tc` 42481）', () => {
  it('★ 空 / `0` ⇒ 空串（**不是 `0s`**）', () => {
    expect(formatElapsed(0, 5000)).toBe('');
    expect(formatElapsed(null, 5000)).toBe('');
    expect(formatElapsed(undefined, 5000)).toBe('');
  });

  it('★ `< 60s` ⇒ `{n}s`', () => {
    expect(formatElapsed(1000, 1500)).toBe('1s'); // 0.5 ⇒ round 1
    expect(formatElapsed(1000, 10500)).toBe('10s');
    expect(formatElapsed(1000, 59999)).toBe('59s');
  });

  it('★ `>= 60s` ⇒ `{m}m{ss}s`，**秒补零到 2 位**', () => {
    expect(formatElapsed(1000, 61000)).toBe('1m00s');
    expect(formatElapsed(1000, 62500)).toBe('1m02s'); // 61.5 ⇒ 62
    expect(formatElapsed(1000, 601000)).toBe('10m00s');
    // ⚠️ 我第一版把这条写成 `10m60s` —— **秒字段不可能到 60**：
    //   `Math.floor(660/60)=11`、`660%60=0` ⇒ `11m00s`
    expect(formatElapsed(1000, 660500)).toBe('11m00s'); // 659.5 ⇒ round 660
    expect(formatElapsed(1000, 661500)).toBe('11m01s'); // 660.5 ⇒ round 661
  });

  it('★ 边界：**先 `round` 再分档** ⇒ `59.999s` 已经是 `1m00s`', () => {
    /**
     * ⚠️ 我第一版这条也写错了（以为 59999ms 会显示 59s）—— 源版是
     * `Math.max(0, Math.round((now - start) / 1000))` ⇒ **先四舍五入到整秒再比 60**。
     * ⇒ `59.999s` 会进「60 秒」那一档，显示 **`1m00s`**。
     * 要拿到 `59s`，差值必须 **< 59.5s**（即 ≤ 59499ms）。
     */
    expect(formatElapsed(1000, 1000 + 59999)).toBe('1m00s');
    expect(formatElapsed(1000, 1000 + 59499)).toBe('59s');
    expect(formatElapsed(1000, 1000 + 59500)).toBe('1m00s');
  });

  it('未来时刻 ⇒ 夹到 `0s`（源版先 `Math.max(0, …)`）', () => {
    expect(formatElapsed(5000, 1000)).toBe('0s');
  });
});

describe('deriveGenView（原 `B0` 42493）', () => {
  const NOW = 10_000;

  it('★ 第一组：`status !== "success"` ⇒ **完全不看节点与进度**', () => {
    for (const st of ['waiting', 'sending']) {
      const v = deriveGenView(item({ status: st }), null, { kind: 'generating' }, NOW);
      expect(v).toEqual({ text: '生成未开始', cls: 'idle', wait: '', note: '' });
    }
    for (const st of ['error', 'skipped']) {
      const v = deriveGenView(item({ status: st }), null, null, NOW);
      expect(v).toEqual({ text: '—', cls: 'na', wait: '', note: '' });
    }
  });

  it('★ 第二组：节点不存在 ⇒ `状态未知` + note `节点不存在`', () => {
    expect(deriveGenView(item(), null, null, NOW)).toEqual({
      text: '状态未知',
      cls: 'unknown',
      wait: '',
      note: '节点不存在',
    });
  });

  it('★ 第三组：最后一条尝试 `failed` ⇒ `失败` + 它的 note', () => {
    const node: QueueNodeLike = {
      data: { genHistory: { attempts: [{ at: 9000, status: 'failed', note: '超时' }] } },
    };
    const v = deriveGenView(item({ startedAt: 9000 }), node, null, NOW);
    expect(v).toEqual({ text: '失败', cls: 'failed', wait: '1s', note: '超时' });
  });

  it('★ 最后一条尝试 `success` ⇒ `已完成`，等待时长算到 **`resultAt`**', () => {
    const node: QueueNodeLike = {
      data: { genHistory: { attempts: [{ at: 9000, status: 'success' }] }, resultAt: 30000 },
    };
    // 9000 → 30000 = 21s
    expect(deriveGenView(item({ startedAt: 9000 }), node, null, NOW)).toEqual({
      text: '已完成',
      cls: 'done',
      wait: '21s',
      note: '',
    });
  });

  it('★ `success` 但**没有 `resultAt`** ⇒ 用注入的 `now` 兜底', () => {
    const node: QueueNodeLike = { data: { genHistory: { attempts: [{ at: 9000, status: 'success' }] } } };
    expect(deriveGenView(item({ startedAt: 9000 }), node, null, NOW).wait).toBe('1s');
  });

  it('★★ attempts 过滤：**早于 `startedAt - 1500` 的不算**（上一次发送的残留）', () => {
    const node: QueueNodeLike = {
      data: {
        genHistory: {
          attempts: [
            { at: 1000, status: 'failed', note: '上一次的' }, // 早于 9000-1500=7500 ⇒ 排除
            { at: 9000, status: 'success' },
          ],
        },
      },
    };
    expect(deriveGenView(item({ startedAt: 9000 }), node, null, NOW).text).toBe('已完成');
  });

  it('★ attempts 过滤：**账号不匹配的不算**（同一节点被别的账号跑过）', () => {
    const node: QueueNodeLike = {
      data: {
        genHistory: {
          attempts: [
            { at: 9000, status: 'failed', note: '别的账号', accountId: 'acc_2' },
            { at: 9100, status: 'success', accountId: 'acc_1' },
          ],
        },
      },
    };
    const v = deriveGenView(item({ startedAt: 9000, accountId: 'acc_1' }), node, null, NOW);
    expect(v.text).toBe('已完成');
  });

  it('★ attempts 过滤：条目**没有 `accountId`** 时不过滤掉（源版是 `||` 链）', () => {
    const node: QueueNodeLike = {
      data: { genHistory: { attempts: [{ at: 9000, status: 'failed', note: '无账号字段' }] } },
    };
    expect(deriveGenView(item({ startedAt: 9000, accountId: 'acc_1' }), node, null, NOW).text).toBe('失败');
  });

  it('★ 第四组：按进度 `kind` 分档', () => {
    const node: QueueNodeLike = { data: { genHistory: { attempts: [] } } };
    const it1 = item({ startedAt: 9000 });
    expect(deriveGenView(it1, node, { kind: 'unknown' }, NOW)).toEqual({
      text: '状态未知',
      cls: 'unknown',
      wait: '1s',
      note: '未能获取进度',
    });
    expect(deriveGenView(it1, node, { kind: 'offer' }, NOW)).toEqual({
      text: '排队中',
      cls: 'queued',
      wait: '1s',
      note: '等待豆包开始生成',
    });
    expect(deriveGenView(it1, node, { kind: 'none' }, NOW)).toEqual({
      text: '未在生成',
      cls: 'idle',
      wait: '1s',
      note: '后台暂无该任务的生成记录',
    });
    // 其余（含 `generating` 与**未知 kind**）一律「生成中」
    expect(deriveGenView(it1, node, { kind: 'generating' }, NOW).text).toBe('生成中');
    expect(deriveGenView(it1, node, { kind: '某种新档' }, NOW).text).toBe('生成中');
    expect(deriveGenView(it1, node, null, NOW)).toEqual({
      text: '生成中',
      cls: 'generating',
      wait: '1s',
      note: '',
    });
  });

  it('★ 进度自带 `text` ⇒ 覆盖兜底 note（但不改 `text`/`cls`）', () => {
    const node: QueueNodeLike = { data: { genHistory: { attempts: [] } } };
    const v = deriveGenView(item({ startedAt: 9000 }), node, { kind: 'offer', text: '排第 3' }, NOW);
    expect(v).toEqual({ text: '排队中', cls: 'queued', wait: '1s', note: '排第 3' });
  });

  it('`genHistory` 缺失 / `attempts` 不是数组 ⇒ 走进度分支（不抛）', () => {
    const node: QueueNodeLike = { data: {} };
    expect(deriveGenView(item({ startedAt: 9000 }), node, { kind: 'offer' }, NOW).cls).toBe('queued');
  });

  it('`startedAt` 缺失 ⇒ 等待时长为空串，但状态照常判', () => {
    const node: QueueNodeLike = { data: {} };
    const v = deriveGenView(item(), node, { kind: 'offer' }, NOW);
    expect(v).toEqual({ text: '排队中', cls: 'queued', wait: '', note: '等待豆包开始生成' });
  });
});

describe('clampPanelPosition（原 `Qd` 42586）', () => {
  it('★ 正常范围：原样（取整）', () => {
    expect(clampPanelPosition(100.4, 200.6, 300, 200, { w: 1280, h: 800 })).toEqual({ x: 100, y: 201 });
  });

  it('★ 负值 ⇒ 夹到 `0`', () => {
    expect(clampPanelPosition(-50, -50, 300, 200, { w: 1280, h: 800 })).toEqual({ x: 0, y: 0 });
  });

  it('★ 超出右下 ⇒ 夹到 `视口 - 面板尺寸`', () => {
    expect(clampPanelPosition(9999, 9999, 300, 200, { w: 1280, h: 800 })).toEqual({ x: 980, y: 600 });
  });

  it('★ **面板比视口大** ⇒ 夹到 `0`（不是负值）', () => {
    expect(clampPanelPosition(50, 50, 2000, 1000, { w: 1280, h: 800 })).toEqual({ x: 0, y: 0 });
  });
});
