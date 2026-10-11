/**
 * ToastHost —— Toast 宿主（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**出现 + 自动消失 + 堆叠**
 * 队列状态在 `state/slices/ui`；本组件**只负责渲染**（原则 1：谁拥有状态谁写）
 */

import { useEffect } from 'react';
// ★ 数据形状由 state 拥有（分层：state 不得依赖 ui，所以类型定义放 state）
import type { ToastItem } from '@/state/slices/ui';
import styles from './shared.module.css';

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
      className={`${styles.toast} ${item.level === 'warn' ? styles.toastWarn : item.level === 'error' ? styles.toastError : ''}`}
      role="status"
      onClick={() => onDismiss(item.id)}
    >
      {item.message}
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
