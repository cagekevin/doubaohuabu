/**
 * EmptyState —— 空态（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**标题 + 说明 + 可选按钮**
 * 原实现三处各写一遍：画布空态 / 资源库空态 / 历史项目空态
 */

import type { ReactNode } from 'react';
import styles from './shared.module.css';

export interface EmptyStateProps {
  title: string;
  hint?: string;
  /** 可选操作区（如「＋ 新建项目」） */
  action?: ReactNode;
  /** 可选外壳类 —— 给"覆盖整块区域"这类**定位**用（空的形态仍归真源 `.empty`） */
  className?: string;
}

export function EmptyState({ title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={className ? `${styles.empty} ${className}` : styles.empty}>
      <div className={styles.emptyTitle}>{title}</div>
      {hint !== undefined && <div className={styles.emptyHint}>{hint}</div>}
      {action}
    </div>
  );
}
