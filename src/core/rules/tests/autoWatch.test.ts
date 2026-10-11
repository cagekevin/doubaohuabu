import { describe, expect, it } from 'vitest';
import {
  advanceAutoWatch,
  autoWatchBaseDelay,
  autoWatchJitter,
  initialAutoWatchProgress,
  shouldAutoWatchScan,
  type AutoWatchCadence,
} from '../autoWatch';

/**
 * ⚠️ 这是**源版算法的独立复刻**（`shared.js:36685-36691` 的 `tD`），用作**规格**：
 *    实现若漂移，本文件的断言就红。**不是**自证式断言。
 */
const sourceJitter = (id: string): number => {
  let t = 5381;
  const n = String(id || '');
  for (let r = 0; r < n.length; r += 1) {
    t = ((t << 5) + t + n.charCodeAt(r)) >>> 0;
  }
  return t % 8000;
};

const cadence: AutoWatchCadence = { intervalMs: 6000, idleBackoffMs: 15000 };

describe('autoWatchJitter（原 `tD` 36685）', () => {
  it('★ 与源算法**逐值一致**（含无符号回绕）', () => {
    for (const id of ['', 'a', 'acc-1', 'TAPNOW::1234567890', '中文 id', 'x'.repeat(64)]) {
      expect(autoWatchJitter(id)).toBe(sourceJitter(id));
    }
  });

  it('★ **确定性**（同 id 恒同值）—— 源版靠它给多账号错峰', () => {
    expect(autoWatchJitter('acc-1')).toBe(autoWatchJitter('acc-1'));
  });

  it('★ 空 id ⇒ `5381 % 8000` = **5381**（源 `tD` 同款，不特判）', () => {
    expect(autoWatchJitter('')).toBe(5381);
  });

  it('落在 `[0, 8000)`（`% AUTO_WATCH_JITTER_MOD`）', () => {
    for (const id of ['a', 'b', 'c', 'acc-9', 'z'.repeat(40)]) {
      const j = autoWatchJitter(id);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(8000);
    }
  });

  it('不同 id 通常不同（错峰有意义）', () => {
    expect(autoWatchJitter('acc-1')).not.toBe(autoWatchJitter('acc-2'));
  });
});

describe('autoWatchBaseDelay（原 `Ee` 的 `te(acc)` / `X(acc)`）', () => {
  it('正常态 ⇒ **基础间隔**', () => {
    expect(autoWatchBaseDelay({ idleRounds: 0, autoCount: 0 }, cadence)).toBe(6000);
    expect(autoWatchBaseDelay({ idleRounds: 3, autoCount: 39 }, cadence)).toBe(6000);
  });

  it('★ 连续空转达上限（`idleRounds >= 4`）⇒ **退避**', () => {
    expect(autoWatchBaseDelay({ idleRounds: 4, autoCount: 0 }, cadence)).toBe(15000);
  });

  it('★ 累计新增超限（`autoCount >= 40`）⇒ **退避**', () => {
    expect(autoWatchBaseDelay({ idleRounds: 0, autoCount: 40 }, cadence)).toBe(15000);
  });

  it('节奏由 **cadence 参数**决定（不认站点名）—— 换个 cadence 同输入出不同值', () => {
    const lovartLike: AutoWatchCadence = { intervalMs: 3000, idleBackoffMs: 10000 };
    expect(autoWatchBaseDelay({ idleRounds: 0, autoCount: 0 }, lovartLike)).toBe(3000);
    expect(autoWatchBaseDelay({ idleRounds: 4, autoCount: 0 }, lovartLike)).toBe(10000);
  });
});

describe('advanceAutoWatch（原 `Ee` 的增减）', () => {
  it('★ 有新增 ⇒ `idleRounds` **归 0**、`autoCount` **累加**', () => {
    expect(advanceAutoWatch({ idleRounds: 3, autoCount: 5 }, 2)).toEqual({
      idleRounds: 0,
      autoCount: 7,
    });
  });

  it('★ 无新增 ⇒ `idleRounds` +1、`autoCount` **不动**', () => {
    expect(advanceAutoWatch({ idleRounds: 3, autoCount: 5 }, 0)).toEqual({
      idleRounds: 4,
      autoCount: 5,
    });
  });

  it('不改原对象（纯函数）', () => {
    const p = initialAutoWatchProgress();
    advanceAutoWatch(p, 1);
    expect(p).toEqual({ idleRounds: 0, autoCount: 0 });
  });
});

describe('shouldAutoWatchScan（原 `Ee:486`）', () => {
  it('★ 未喂饱 ⇒ 扫', () => {
    expect(shouldAutoWatchScan({ idleRounds: 0, autoCount: 0 })).toBe(true);
    expect(shouldAutoWatchScan({ idleRounds: 0, autoCount: 39 })).toBe(true);
  });

  it('★ 已达上限（`autoCount >= 40`）⇒ **不扫**（只顺延，别再打页面）', () => {
    expect(shouldAutoWatchScan({ idleRounds: 0, autoCount: 40 })).toBe(false);
  });
});
