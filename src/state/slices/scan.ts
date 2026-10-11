/**
 * 指纹体检历史 slice（③ 独立成片）
 *
 * ★ **为什么独立成片**：源版把它放在全局 store（26788），而本工程的 `global.ts` 已有 **27 个字段**
 *   （`docs/11 §5.3` 上限 25）⇒ 按同一节的规定另开一片（`queue` / `gallery` 同因，这是第三片）。
 *
 * ★★ **本片只有"写"的能力，没有"想"的能力**：去重判据（**只与最近一条**比签名）、
 *   插入位置、容量 50、`pairs` 只留三字段 —— 全在**已测**的 `core/rules/scanHistory.ts`
 *   （11 条单测）里；本片只把结果落到 store。
 *
 * 依据（**逐行回源**）：`recordScan` 30362-30387 · `clearScanHistory` 30388-30393。
 *
 * ⚠️ **"没记"就不写**（源版同签名时**连 `set` 都不调**）—— 纯层用"返回原引用"表达，
 *   本片据此跳过 `set`（否则每次空扫描都会把整棵树写一遍盘、并触发一次落盘调度）。
 */

import { planRecordScan, type ScanHistoryEntry, type ScanResultLike } from '@/core/rules/scanHistory';

export interface ScanSlice {
  /** 指纹撞车体检的历史（原 26788 的 `scanHistory: fT()`） */
  scanHistory: ScanHistoryEntry[];
  /** 灌入（`hydrate` 用） */
  setScanHistory: (entries: ScanHistoryEntry[]) => void;
  /**
   * 记一次扫描（原 30362）
   * @returns 是否真的记了一条（源版的 `recordScan` 无返回值；这里给出来便于调用方决定落盘）
   */
  recordScan: (scan: ScanResultLike) => boolean;
  /** 清空（原 30388） */
  clearScanHistory: () => void;
}

export const createScanSlice =
  (now: () => number) =>
  (
    set: (partial: Partial<ScanSlice>) => void,
    get: () => ScanSlice,
  ): ScanSlice => ({
    scanHistory: [],

    setScanHistory: (entries) => set({ scanHistory: entries }),

    recordScan: (scan) => {
      const cur = get().scanHistory;
      const r = planRecordScan(cur, scan, now());
      // ⚠️ **没记就不写**（源版 `return` 早退，连 `set` 都没走到）
      if (!r.recorded) return false;
      set({ scanHistory: r.history });
      return true;
    },

    clearScanHistory: () => set({ scanHistory: [] }),
  });
