/**
 * 节点标题（图标 + 名称，双击改名）
 *
 * 收口掉「节点名 + 改名」的重复实现（原 `MaterialNode` / `TextNode` 各写一份改名态）：
 * 两态切换（显示 `<button>` ↔ 编辑 `<input>`）、`Enter` 提交、`Esc` 取消、`blur` 提交。
 *
 * ⚠️ **`Esc` 走 `ui/common/useEscapeKey`** —— 键盘 `Escape` 处理只允许住 `ui/common/`
 *   （否则每个浮层各写一份 `if (e.key === 'Escape')`，解散法迟早不一致）。
 * ⚠️ `icon` 收**组件引用**（不是 element）：引用是模块级常量 ⇒ 天然稳定，
 *   且图标尺寸/颜色属本组件的呈现决定，不该由调用方各写一遍。
 */

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useEscapeKey } from '@/ui/common/useEscapeKey';
import { NODE_TITLE_TEXT } from '@/constants/text';
import styles from './NodeTitle.module.css';

/** 图标组件（只声明本组件用到的两个 props —— 不绑死具体图标库） */
export type NodeIcon = ComponentType<{ size?: number | string; className?: string }>;

export interface NodeTitleProps {
  /** 当前标题（受控：外部 label 变化时同步回显） */
  label?: string;
  /** `label` 为空时的兜底标题 */
  defaultTitle?: string;
  /** 标题前的小图标**组件**（不是 element） */
  icon?: NodeIcon;
  /** 名称前的固定前缀（如素材节点的「素材 · 」） */
  prefix?: ReactNode;
  /** 追加类名 */
  className?: string;
  /** 浮层模式：绝对定位到节点上方（默认内联在标题槽） */
  floating?: boolean;
  /** 改名提交回调；不传则只改本地显示 */
  onRename?: (next: string) => void;
}

export function NodeTitle({
  label,
  defaultTitle,
  icon: Icon,
  prefix,
  className,
  floating = false,
  onRename,
}: NodeTitleProps) {
  const fallback = label || defaultTitle || '';
  const [val, setVal] = useState(fallback);
  const [editing, setEditing] = useState(false);
  const [prevFallback, setPrevFallback] = useState(fallback);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部 label 变化 ⇒ 同步回显（渲染期调整，不用 effect —— react-hooks/set-state-in-effect）
  if (prevFallback !== fallback) {
    setPrevFallback(fallback);
    setVal(fallback);
  }

  // 进改名态后 focus + 全选（否则用户还要手点一次）
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = (text: string): void => {
    const next = text.trim() || defaultTitle || '';
    setVal(next);
    setEditing(false);
    if (typeof onRename === 'function') onRename(next);
  };

  const onEscape = useEscapeKey(editing, () => {
    setEditing(false);
    setVal(fallback);
  });

  return (
    <span className={`${styles.title} ${floating ? styles.floating : ''} ${className ?? ''}`}>
      {Icon ? <Icon size={11} className={styles.icon} /> : null}
      {editing ? (
        <input
          ref={inputRef}
          className={`${styles.input} nodrag nopan nowheel`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(e.currentTarget.value);
              return;
            }
            onEscape(e);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          type="button"
          className={styles.name}
          title={NODE_TITLE_TEXT.renameTitle}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {prefix}
          {val || defaultTitle}
        </button>
      )}
    </span>
  );
}
