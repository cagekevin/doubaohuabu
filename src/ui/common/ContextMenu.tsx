/**
 * ContextMenu —— 右键菜单（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**定位 + 点外部关闭 + 键盘导航**
 * 原实现里四处各写一遍：画布空白 / 节点 / 边 / 组
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { useAnchoredLayer } from './useAnchoredLayer';
import styles from './shared.module.css';

/** 可点项 */
export interface MenuActionItem {
  key: string;
  label: ReactNode;
  /** 图标槽（设计稿口径 ①）—— 名字取自 `Icon.tsx`（唯一真源）*/
  icon?: IconName;
  /** 危险项（删除类）：悬停整行翻红底白字，让"不可逆"在按下前被看见（口径 ④）*/
  danger?: boolean;
  /** 原生 tooltip（如**禁用原因** —— 源里「打开文件所在位置」就靠它解释为什么灰） */
  title?: string;
  disabled?: boolean;
  onSelect: () => void;
}
/** 分隔线项（不响应点击 / 键盘导航） */
export interface MenuSeparatorItem {
  key: string;
  separator: true;
}

export type MenuItem = MenuActionItem | MenuSeparatorItem;

export function isMenuSeparator(it: MenuItem | undefined): it is MenuSeparatorItem {
  return it != null && 'separator' in it;
}

export interface ContextMenuProps {
  /** 屏幕坐标（fixed 定位） */
  x: number;
  y: number;
  items: readonly MenuItem[];
  /** 可选标题（渲染在菜单顶部，如「移动到…」） */
  title?: ReactNode;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, title, onClose }: ContextMenuProps) {
  /**
   * 摆位交给**浮层定位原语**（`B06`：一类问题一处解 —— `size → flip → shift`）。
   * ⚠️ 外部接口**不变**（调用方仍传屏幕坐标 `x`/`y`）：改的只是"直接写死 `left/top`"
   *    ⇒ "经原语收边 + 打开期间跟滚动/尺寸变化"。
   * ⚠️ 用原语返回的 `ref`（下面"点外部关闭"要 `ref.current.contains`）——两者是同一个元素。
   */
  const { ref, style } = useAnchoredLayer({
    open: true,
    anchor: { x, y },
    depsKey: `${items.length}`,
  });
  // ★ active 初始指向第一个可点项（跳过可能的前导分隔线）
  const firstSelectable = items.findIndex((it) => !isMenuSeparator(it));
  const [active, setActive] = useState(firstSelectable < 0 ? 0 : firstSelectable);

  // 点击外部关闭（全应用唯一实现）
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // ⚠️ `ref` 进依赖：它现在是**原语返回的 ref**（仍来自 `useRef` ⇒ 稳定引用，加上不会重复绑定）。
  }, [onClose, ref]);

  // 键盘导航 + ESC 关闭（★ 跳过分隔线）
  useEffect(() => {
    const step = (dir: 1 | -1): void => {
      setActive((cur) => {
        let next = cur + dir;
        while (next >= 0 && next < items.length && isMenuSeparator(items[next])) next += dir;
        return next >= 0 && next < items.length ? next : cur;
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowDown') return step(1);
      if (e.key === 'ArrowUp') return step(-1);
      if (e.key === 'Enter') {
        const it = items[active];
        if (it && !isMenuSeparator(it) && !it.disabled) {
          it.onSelect();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, active, onClose]);

  return (
    <div ref={ref} className={styles.menu} style={style} role="menu">
      {title && <div className={styles.menuTitle}>{title}</div>}
      {items.map((it, i) =>
        isMenuSeparator(it) ? (
          <div key={it.key} className={styles.menuSep} role="separator" />
        ) : (
          <button
            key={it.key}
            type="button"
            className={it.danger ? `${styles.menuItem} ${styles.isDanger}` : styles.menuItem}
            data-active={i === active}
            title={it.title}
            disabled={it.disabled}
            role="menuitem"
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              it.onSelect();
              onClose();
            }}
          >
            {it.icon !== undefined && <Icon name={it.icon} />}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
