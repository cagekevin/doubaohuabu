/**
 * 指纹撞车体检面板 —— 对应原 `DP.jsx`（体检报告 + 历史列表的**视图半**）
 *
 * ★ **报告是实时算的**（`useMemo(() => scanFingerprintCollisions(accounts))`，不进 store）；
 *   **只有 `history` 是持久化的**。
 *
 * ★ **写入方 = 账号页**（原 `OP.jsx:26-40`）：报告稳定 1.5s 后自动 `recordScan`
 *   —— 见 `AccountPanel` 的那个 effect。本组件**只读**（源 `DP.jsx` 里也没有「记录」按钮）。
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
import shared from '@/ui/common/shared.module.css';
import { PanelShell } from '@/ui/common/PanelShell';

export interface FingerprintScanPanelProps {
  onClose: () => void;
}

export function FingerprintScanPanel({ onClose }: FingerprintScanPanelProps) {
  const accounts = useStore((s) => s.accounts);
  const history = useStore((s) => s.scanHistory);
  const clearScanHistory = useStore((s) => s.clearScanHistory);

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
    <PanelShell
      overlay
      onClose={onClose}
      className={styles.panel}
      bodyClassName={styles.body}
      testId="fp-scan-panel"
      title={FP_SCAN_TEXT.title}
      actions={
        <button
          type="button"
          className={shared.btn}
          disabled={history.length === 0}
          onClick={() => clearScanHistory()}
        >
          {FP_SCAN_TEXT.clearHistory}
        </button>
      }
    >
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
    </PanelShell>
  );
}
