/**
 * ContextMenu —— 右键菜单（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**定位 + 点外部关闭 + 键盘导航**
 * 原实现里四处各写一遍：画布空白 / 节点 / 边 / 组
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './shared.module.css';

export interface MenuItem {
  key: string;
  label: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ContextMenuProps {
  /** 屏幕坐标（fixed 定位） */
  x: number;
  y: number;
  items: readonly MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // 点击外部关闭（全应用唯一实现）
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  // 键盘导航 + ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowDown') return setActive((i) => Math.min(i + 1, items.length - 1));
      if (e.key === 'ArrowUp') return setActive((i) => Math.max(i - 1, 0));
      if (e.key === 'Enter') {
        const it = items[active];
        if (it && !it.disabled) {
          it.onSelect();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, active, onClose]);

  return (
    <div ref={ref} className={styles.menu} style={{ left: x, top: y }} role="menu">
      {items.map((it, i) => (
        <button
          key={it.key}
          type="button"
          className={styles.menuItem}
          data-active={i === active}
          disabled={it.disabled}
          role="menuitem"
          onMouseEnter={() => setActive(i)}
          onClick={() => {
            it.onSelect();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
