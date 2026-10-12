/**
 * 指纹体检历史（**纯函数**，★ 必测）—— 原 `recordScan`(30362) / `clearScanHistory`(30388)
 *
 * ★★ **先纠正一处容易搞混的事**：这个 `scanHistory` **不是画廊扫描的历史**。
 *   它是**账号指纹撞车体检**的结果（源 `recordScan` 的入参是
 *   `{withFpCount, totalPairs, critical, warn, pairs[]}` —— 全是"多少对撞了、几级告警"）。
 *   画廊那个「扫描 Tapnow 画布」是**另一件事**（走站点页内脚本）。
 *
 * ★ **它顺带关掉了第二个 `[待确认]`**：`LsValueMap` 里 `'doubao-scan-history'` 此前是
 *   `unknown[]`（`docs/过程.md` §1 #8，当时只证明了「有读」`jk`/`Fy`）—— 源 `recordScan` 的**写侧**
 *   给出了完整字段表 ⇒ 本轮定形为 `ScanHistoryEntry[]`。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 容量 | `dT` 26224 | **50**（超出丢最旧的） |
 *   | 去重 | 30363-30367 | 与**最近一条**（`history[0]`）**同签名** ⇒ **不记**（不重复堆积） |
 *   | 签名 | 30364 | `` `${withFpCount}\|${totalPairs}\|${critical}\|${warn}` ``（**逐字**，含竖线） |
 *   | 新条目 | 30368-30382 | `ts` 在最前 + **插在头部** + `pairs` **只留 `a`/`b`/`level` 三个字段** |
 *
 * ⚠️ **时间注入**：源版内联 `Date.now()`（原则 4 违规）⇒ 这里收 `now`。
 * ⚠️ **签名只比"最近一条"**（不是"任意一条"）⇒ 同一结论反复出现时仍会**交替记录**
 *   （A→B→A 三条都会进）—— 源版如此，**照抄**（用测试锁住）。
 */

import type {
  ScanHistoryEntry as ContractScanHistoryEntry,
  ScanHistoryPair as ContractScanHistoryPair,
} from '@/stable/contracts/lsValues';

/** 历史容量上限（原 `dT` 26224 的 `50`） */
export const SCAN_HISTORY_MAX = 50;

/**
 * ⚠️ **形状真源在 `stable/contracts/lsValues.ts`**（持久化契约那层）—— 这里只**转发**。
 *   本文件第一版自己定义了一份（与画廊那次同错）⇒ 两处定义迟早漂。
 */
export type ScanHistoryEntry = ContractScanHistoryEntry;
export type ScanHistoryPair = ContractScanHistoryPair;

/** `recordScan` 的入参（源版直接收扫描结果） */
export interface ScanResultLike {
  withFpCount: number;
  totalPairs: number;
  critical: number;
  warn: number;
  pairs?: readonly { a: string; b: string; level: string }[];
}

/** 造一条签名（原 30364）—— ⚠️ **逐字**：竖线分隔、顺序固定 */
export function scanSignature(scan: ScanResultLike): string {
  return `${scan.withFpCount}|${scan.totalPairs}|${scan.critical}|${scan.warn}`;
}

/**
 * 记一次扫描（原 `recordScan` 30362-30387）
 *
 * ⚠️ 与源一致：**与最近一条同签名 ⇒ 整件事不做**（返回 `recorded: false` 且 **`history` 是原引用**
 *   —— 源版就是 `return`，连 `set` 都不调）。
 * ⚠️ 新条目**插在头部**，再 `.slice(0, 50)`。
 * @returns `recorded` = 是否真的记了一条（供调用方决定要不要落盘）
 */
export function planRecordScan(
  history: readonly ScanHistoryEntry[] | null | undefined,
  scan: ScanResultLike,
  now: number,
): { history: ScanHistoryEntry[]; recorded: boolean } {
  const cur = history ?? [];
  const sig = scanSignature(scan);
  const head = cur[0];
  if (head && head.sig === sig) return { history: cur as ScanHistoryEntry[], recorded: false };

  const entry: ScanHistoryEntry = {
    ts: now,
    sig,
    total: scan.withFpCount,
    totalPairs: scan.totalPairs,
    critical: scan.critical,
    warn: scan.warn,
    // ⚠️ `pairs` **只留三个字段**（源版逐字段挑，不是整对象展开）
    pairs: (scan.pairs ?? []).map((p) => ({ a: p.a, b: p.b, level: p.level })),
  };

  return { history: [entry, ...cur].slice(0, SCAN_HISTORY_MAX), recorded: true };
}
