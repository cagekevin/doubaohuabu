/**
 * 指纹体检历史单测（原 `recordScan` 30362 / `clearScanHistory` 30388）
 *
 * 断言红线（**实现一变必红**）：
 *   ① 签名**逐字**（竖线分隔、字段顺序固定）—— 它是去重的唯一依据；
 *   ② **只与最近一条**比签名（不是"任意一条"）⇒ A→B→A 三条都进；
 *   ③ 新条目**插头部** + 容量 **50**（超出丢最旧）；
 *   ④ `pairs` **只留 `a`/`b`/`level`**（多余字段被丢掉）；
 *   ⑤ 同签名 ⇒ **返回原引用**（源版连 `set` 都不调）。
 */

import { describe, expect, it } from 'vitest';
import {
  planRecordScan,
  scanSignature,
  SCAN_HISTORY_MAX,
  type ScanHistoryEntry,
  type ScanResultLike,
} from '../scanHistory';

const NOW = 1_700_000_000_000;
const scan = (patch: Partial<ScanResultLike> = {}): ScanResultLike => ({
  withFpCount: 3,
  totalPairs: 5,
  critical: 1,
  warn: 2,
  ...patch,
});

const entry = (sig: string, ts = 1): ScanHistoryEntry => ({
  ts,
  sig,
  total: 0,
  totalPairs: 0,
  critical: 0,
  warn: 0,
  pairs: [],
});

describe('scanSignature（原 30364）', () => {
  it('★ **逐字**：竖线分隔、字段顺序 `withFpCount|totalPairs|critical|warn`', () => {
    expect(scanSignature(scan())).toBe('3|5|1|2');
    // 顺序反了会得出不同签名 ⇒ 用两条**不同字段同值**的数据锁住顺序
    expect(scanSignature({ withFpCount: 1, totalPairs: 2, critical: 3, warn: 4 })).toBe('1|2|3|4');
  });

  it('★ **不看 `pairs`**（签名只由四个计数决定）', () => {
    const a = scanSignature(scan({ pairs: [] }));
    const b = scanSignature(scan({ pairs: [{ a: '1', b: '2', level: 'x' }] }));
    expect(a).toBe(b);
  });
});

describe('planRecordScan（原 `recordScan` 30362）', () => {
  it('★ 首次记录：新条目**插在头部**，`ts` 用注入的时刻、`total` 取 `withFpCount`', () => {
    const r = planRecordScan([], scan(), NOW);
    expect(r.recorded).toBe(true);
    expect(r.history).toHaveLength(1);
    expect(r.history[0]).toEqual({
      ts: NOW,
      sig: '3|5|1|2',
      total: 3, // ⚠️ 字段名换成 `total`，值来自 `withFpCount`
      totalPairs: 5,
      critical: 1,
      warn: 2,
      pairs: [],
    });
  });

  it('★★ 与**最近一条**同签名 ⇒ **不记**，且 `history` 是**原引用**', () => {
    const cur = [entry('3|5|1|2', 111)];
    const r = planRecordScan(cur, scan(), NOW);
    expect(r.recorded).toBe(false);
    expect(r.history).toBe(cur);
  });

  it('★★ **只与最近一条比** —— 更早那条同签名也**照记**（源版如此）', () => {
    const cur = [entry('9|9|9|9', 3), entry('3|5|1|2', 2), entry('7|7|7|7', 1)];
    const r = planRecordScan(cur, scan(), NOW);
    expect(r.recorded).toBe(true);
    expect(r.history).toHaveLength(4);
    expect(r.history[0]!.ts).toBe(NOW);
    expect(r.history[2]!.sig).toBe('3|5|1|2'); // 旧的那条还在
  });

  it('★ 新条目在**头部**（顺序是"最新在前"）', () => {
    const r = planRecordScan([entry('旧')], scan(), NOW);
    expect(r.history.map((x) => x.sig)).toEqual(['3|5|1|2', '旧']);
  });

  it('★★ 容量 **50**：超出时丢**最旧**的', () => {
    const full = Array.from({ length: SCAN_HISTORY_MAX }, (_, i) => entry(`sig-${i}`, i));
    const r = planRecordScan(full, scan({ withFpCount: 99 }), NOW);
    expect(r.history).toHaveLength(SCAN_HISTORY_MAX);
    expect(r.history[0]!.sig).toBe('99|5|1|2');
    // 原来最后一条（`sig-49`）被挤掉
    expect(r.history.some((x) => x.sig === `sig-${SCAN_HISTORY_MAX - 1}`)).toBe(false);
    // 原来第一条仍在
    expect(r.history.some((x) => x.sig === 'sig-0')).toBe(true);
  });

  it('★ `SCAN_HISTORY_MAX` 就是 **50**（源 `dT` 26224）', () => {
    expect(SCAN_HISTORY_MAX).toBe(50);
  });

  it('★★ `pairs` **只留 `a`/`b`/`level`**（多余字段被丢弃）', () => {
    const r = planRecordScan(
      [],
      scan({
        pairs: [{ a: 'acc_1', b: 'acc_2', level: 'critical', extra: '不该出现' } as never],
      }),
      NOW,
    );
    expect(r.history[0]!.pairs).toEqual([{ a: 'acc_1', b: 'acc_2', level: 'critical' }]);
    expect('extra' in r.history[0]!.pairs[0]!).toBe(false);
  });

  it('★ `pairs` 缺省 ⇒ 空数组（不抛）', () => {
    expect(planRecordScan([], scan(), NOW).history[0]!.pairs).toEqual([]);
  });

  it('`history` 传 `null`/`undefined` ⇒ 当空（第一版源版是 `t().scanHistory`，恒有值）', () => {
    expect(planRecordScan(null, scan(), NOW).history).toHaveLength(1);
    expect(planRecordScan(undefined, scan(), NOW).recorded).toBe(true);
  });
});
