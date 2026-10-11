/**
 * Modal —— 弹窗（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**遮罩点击空白关闭 + X 关闭 + ESC 关闭**
 * 原实现里这套逻辑散落在：创建面板 / 素材选择 / 遮脸面板 / 预设选择 / 关键词弹窗 / 图片编辑器 …
 *
 * ⚠️ `Escape` / `aria-modal` / `role="dialog"` **只允许出现在本文件所在目录**
 *    （约定：`ui/common/` 是浮层语义唯一落点。原 grep 型闸已于 2026-10-11 退役，现无机器守卫）
 *
 * 组合模式：复合组件（`Modal.Header` / `Modal.Body` / `Modal.Footer`），避免布尔 props 爆炸
 *           （依据技能 `vercel-composition-patterns` 的 `architecture-avoid-boolean-props`）
 */

import { useEffect, type ReactNode } from 'react';
import styles from './shared.module.css';

export interface ModalProps {
  open: boolean;
  /** 关闭回调（遮罩点击 / X / ESC 三处共用同一个） */
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 点遮罩是否关闭，默认 true */
  closeOnMask?: boolean;
}

export function Modal({ open, onClose, title, children, footer, closeOnMask = true }: ModalProps) {
  // ESC 关闭 —— 全应用**唯一**的 Escape 处理点
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.mask} onClick={closeOnMask ? onClose : undefined} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className={styles.header}>
            <span>{title}</span>
            <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer !== undefined && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
