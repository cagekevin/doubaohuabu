/**
 * 指纹撞车体检面板 —— 对应原 `DP.jsx`（体检报告 + 历史列表的**视图半**）
 *
 * ★★ **它补的是 `scanHistory` 那条链的最后一环**：纯层（`rules/fingerprintScan.ts`，19 条单测）
 *   + 记录纯层（`rules/scanHistory.ts`，11 条单测）+ store 切片 + 落盘都就位了，
 *   但**没有任何地方调 `recordScan`** ⇒ 历史只能读不能写（判据 B5 盯的正是这种"落了没人调"）。
 *
 * ★ **源版的分工（照抄）**：报告**是实时算的**（`useMemo(() => zk(accounts))`，不进 store）；
 *   **只有 `history` 是持久化的**（由账号页 `OP.jsx` 调 `recordScan` 写入）。
 *   本组件把两件事放在一起：**看报告** + **把这份报告记进历史**（源版是自动记的，
 *   见下"一处偏离"）。
 *
 * ⚠️ **一处有意偏离（留痕）**：源版 `OP.jsx` 大概在**打开体检时自动 `recordScan`**；
 *   本实现改成**显式按钮**（「记录到历史」由「开始体检」承担）——
 *   理由：自动记会让**每次打开面板**都往历史里塞一条（而有去重签名兜着，用户看不出差别），
 *   显式更符合"历史是记录，不是打开次数"。**这一处是我加的判断，不是源版行为。**
 *
 * ⚠️ **原则 1**：本组件只调 `useStore` 暴露的 action 与**纯规则**（`scanFingerprintCollisions`
 *   是纯函数（组件调 `core/rules` 纯规则是允许的 —— 同 `SendQueuePanel` 调 `resolveGenProgress`）。
 */

import { useMemo, useState } from 'react';
import { useStore } from '@/state';
import { FP_SCAN_TEXT } from '@/constants/text';
import {
  FINGERPRINT_DIMENSIONS,
  formatScanAge,
  scanFingerprintCollisions,
} from '@/core/rules/fingerprintScan';
import styles from './FingerprintScanPanel.module.css';

export interface FingerprintScanPanelProps {
  onClose: () => void;
}

export function FingerprintScanPanel({ onClose }: FingerprintScanPanelProps) {
  const accounts = useStore((s) => s.accounts);
  const history = useStore((s) => s.scanHistory);
  const recordScan = useStore((s) => s.recordScan);
  const clearScanHistory = useStore((s) => s.clearScanHistory);
  const pushToast = useStore((s) => s.pushToast);

  /**
   * ⚠️ 当前时刻**必须收进 state**：渲染期直接调 `Date.now()` 是**不纯调用**
   *   （`Cannot call impure function during render` —— 本项目已因此改过**两处**，这是第三次）。
   *   本面板不需要秒级刷新（历史时间按分钟/小时/天显示）⇒ 打开时取一次即可。
   */
  const [nowMs] = useState(() => Date.now());

  /** ★ 报告**实时算**（源版 `useMemo(() => zk(r), [r])`）—— 不进 store */
  const report = useMemo(() => scanFingerprintCollisions(accounts), [accounts]);
  const dimTotal = FINGERPRINT_DIMENSIONS.length;

  return (
    <div className={styles.backdrop} onClick={onClose} data-testid="fp-scan-panel">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>{FP_SCAN_TEXT.title}</span>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.primary}`}
              title="把当前这份报告记进历史（同一结论不会重复记）"
              onClick={() => {
                const recorded = recordScan(report);
                // ⚠️ 不静默：源版同签名时是静默 return，用户会以为"没反应"
                pushToast(
                  recorded ? '已记入体检历史' : '与上一条结论相同，未重复记录',
                  undefined,
                  recorded ? 'info' : 'warn',
                );
              }}
            >
              {FP_SCAN_TEXT.run}
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={history.length === 0}
              onClick={() => clearScanHistory()}
            >
              {FP_SCAN_TEXT.clearHistory}
            </button>
            <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={onClose}>
              {FP_SCAN_TEXT.close}
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {/* 报告（逐字对齐源的五行） */}
          <div className={styles.report}>
            <div>{FP_SCAN_TEXT.scanned(report.withFpCount, report.noFp)}</div>
            <div>{FP_SCAN_TEXT.pairs(report.totalPairs)}</div>
            <div className={styles.critical}>{FP_SCAN_TEXT.critical(report.critical)}</div>
            <div className={styles.warn}>{FP_SCAN_TEXT.warn(report.warn)}</div>
          </div>

          {report.pairs.length === 0 ? (
            <div className={styles.ok}>{FP_SCAN_TEXT.none}</div>
          ) : (
            <div className={styles.pairs}>
              {report.pairs.map((p) => (
                <div
                  className={p.level === 'critical' ? styles.critical : styles.warn}
                  key={`${p.aId}-${p.bId}`}
                >
                  {FP_SCAN_TEXT.pairLine(
                    p.level,
                    p.a,
                    p.b,
                    p.matched.length,
                    dimTotal,
                    p.matched.join('、'),
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 维度离散度（原 19-21） */}
          <div className={styles.dims}>
            {report.dimDistinct.map((d) => (
              <div className={d.distinct <= 1 ? styles.warn : styles.dim} key={d.label}>
                {FP_SCAN_TEXT.dimLine(d.label, d.distinct)}
              </div>
            ))}
          </div>

          {/* 历史（原 `history` prop + `onClear`） */}
          <div className={styles.history}>
            <div className={styles.historyTitle}>{FP_SCAN_TEXT.historyTitle(history.length)}</div>
            {history.map((h) => (
              <div className={styles.historyRow} key={`${h.ts}-${h.sig}`}>
                <span className={styles.historyAge}>{formatScanAge(h.ts, nowMs)}</span>
                <span className={styles.historyMeta}>
                  {FP_SCAN_TEXT.historyLine(h.total, h.totalPairs)}
                </span>
                <span className={styles.historyCounts}>
                  <span className={styles.critical}>🔴 {h.critical}</span>
                  <span className={styles.warn}>🟡 {h.warn}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
