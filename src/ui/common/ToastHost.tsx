/**
 * ToastHost —— Toast 宿主（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**出现 + 自动消失 + 堆叠**
 * 队列状态在 `state/slices/ui`；本组件**只负责渲染**（原则 1：谁拥有状态谁写）
 */

import { useEffect } from 'react';
// ★ 数据形状由 state 拥有（分层：state 不得依赖 ui，所以类型定义放 state）
import type { ToastItem } from '@/state/slices/ui';
import type { ToastLevel } from '@/constants/text';
import { log } from '@/lib/log';
import styles from './shared.module.css';

/**
 * 语气 → 样式类（原 `.app-toast-${type}`）
 * ⚠️ `info` 是默认态 ⇒ **不给类**（避免多一个无差别类）
 */
const TOAST_LEVEL_CLASS: Partial<Record<ToastLevel, string>> = {
  warn: styles.toastWarn,
  error: styles.toastError,
  success: styles.toastSuccess,
};

export interface ToastHostProps {
  toasts: readonly ToastItem[];
  onDismiss: (id: string) => void;
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (item.duration <= 0) return;
    const t = window.setTimeout(() => onDismiss(item.id), item.duration);
    return () => window.clearTimeout(t);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      // 语气 → 样式（原 `showToast(text, level)`）；`info` 是默认态，不加额外类
      className={`${styles.toast} ${TOAST_LEVEL_CLASS[item.level] ?? ''} ${item.action ? styles.toastHasAction : ''}`}
      role="status"
      // 原 `_Component42.jsx:1474`：点 toast 本体即清掉
      onClick={() => onDismiss(item.id)}
    >
      <span className={styles.toastMsg}>{item.message}</span>
      {/* 操作按钮（原 1478-1488）：`stopPropagation` → 调 `onClick` → 清 toast */}
      {item.action?.label ? (
        <button
          type="button"
          className={styles.toastAction}
          onClick={(e) => {
            e.stopPropagation();
            try {
              item.action?.onClick();
            } catch (err) {
              // 源此处 `catch {}` 吞错 ⇒ 就地留痕（原则 6；读者 = 开发者）
              log.warn('[ToastHost] 操作按钮回调失败:', err);
            }
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      ) : null}
    </div>
  );
}

export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.toastHost}>
      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
