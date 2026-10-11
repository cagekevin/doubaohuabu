/**
 * 选择工具条（原 `_Component42.jsx` 的 `.sel-toolbar`，1490-1562）
 *
 * ★ **2026-10-11 补齐**：此前只落「成组」（`groupSelected` 的入口，判据 B5）；本轮补上源版
 *   余下两块 —— **整齐排列**（九种模式的菜单，几何在**已测**的 `core/rules/arrange.ts`）
 *   与**取消组**（`ungroupNodes`）。于是 `SELECT_TOOLBAR_TEXT` 从"零消费者"变成唯一文案源。
 *
 * ★ **可见性判据（原 130 的 `J`）**：`_ >= 2 || !!H` —— 即「≥2 个非组节点」**或**「选中了
 *   某个组的成员」。⚠️ 于是「只选中组内 1 个成员」时工具条**也会出现**（为的是能点「取消组」）。
 *
 * ⚠️ 位置偏离：源版贴着选中节点的包围盒（`se`，131-160 的视口数学）；本工程固定在画布**上中**
 *   （不引入视口数学，见 `SelectionToolbar.module.css`）。
 * ⚠️ 原则 1：不写 store —— 只调 `useStore` 暴露的 action。
 * ⚠️ `Escape` 处理走 `ui/common/useEscapeKey`（`原则8/rule-of-three` 只允许它在 `ui/common/`）。
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/state';
import { SELECT_TOOLBAR_TEXT } from '@/constants/text';
import { selectedGroupIdOf } from '@/core/rules/group';
import type { ArrangeMode } from '@/core/rules/arrange';
import { useEscapeKey } from '@/ui/common/useEscapeKey';
import styles from './SelectionToolbar.module.css';

/** 菜单里的两组模式（原 1513-1553 的顺序：水平四项 / 垂直四项） */
const H_MODES: ArrangeMode[] = ['left', 'hcenter', 'right', 'hdist'];
const V_MODES: ArrangeMode[] = ['top', 'vcenter', 'bottom', 'vdist'];

export function SelectionToolbar() {
  const nodes = useStore((s) => s.nodes);
  const groupSelected = useStore((s) => s.groupSelected);
  const ungroupNodes = useStore((s) => s.ungroupNodes);
  const arrangeNodes = useStore((s) => s.arrangeNodes);
  const pushToast = useStore((s) => s.pushToast);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 源版判据：`selected && type !== 'group'`（组不参与成组 / 排列）
  const selected = nodes.filter((n) => n.selected);
  const nonGroupCount = selected.filter((n) => n.type !== 'group').length;
  const groupId = selectedGroupIdOf(nodes);
  const visible = nonGroupCount >= 2 || !!groupId;

  const closeMenu = () => setMenuOpen(false);

  // 点空白处关闭（原 169-177 的 `mousedown`；`Escape` 那半走 `useEscapeKey`）
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const onKeyDown = useEscapeKey(menuOpen, closeMenu);

  if (!visible) return null;

  const runArrange = (mode: ArrangeMode) => {
    arrangeNodes(mode);
    setMenuOpen(false);
  };

  return (
    <div className={styles.bar} data-testid="selection-toolbar">
      <span className={styles.count}>{SELECT_TOOLBAR_TEXT.selected(selected.length)}</span>
      <button
        type="button"
        className={styles.btn}
        disabled={nonGroupCount < 2}
        title={nonGroupCount < 2 ? SELECT_TOOLBAR_TEXT.groupHint : SELECT_TOOLBAR_TEXT.groupTitle}
        onClick={() => {
          const r = groupSelected();
          // ⚠️ 失败**不静默**：`need-2` 只会在"选中数刚好跨过边界"时出现（理论上到不了）
          if (!r.ok) pushToast(SELECT_TOOLBAR_TEXT.groupHint, undefined, 'warn');
        }}
      >
        {SELECT_TOOLBAR_TEXT.group}
      </button>

      <div className={styles.arrangeWrap} ref={wrapRef} onKeyDown={onKeyDown}>
        <button
          type="button"
          className={styles.btn}
          disabled={nonGroupCount < 2}
          title={nonGroupCount < 2 ? SELECT_TOOLBAR_TEXT.arrangeDisabled : SELECT_TOOLBAR_TEXT.arrangeTitle}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          {SELECT_TOOLBAR_TEXT.arrange}
        </button>
        {menuOpen && nonGroupCount >= 2 && (
          <div className={styles.menu} role="menu">
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemPrimary}`}
              role="menuitem"
              onClick={() => runArrange('smart')}
            >
              {SELECT_TOOLBAR_TEXT.smartArrange}
            </button>
            <div className={styles.menuSep} />
            <div className={styles.menuHead}>{SELECT_TOOLBAR_TEXT.headH}</div>
            {H_MODES.map((m) => (
              <button key={m} type="button" className={styles.menuItem} role="menuitem" onClick={() => runArrange(m)}>
                {SELECT_TOOLBAR_TEXT.mode[m]}
              </button>
            ))}
            <div className={styles.menuHead}>{SELECT_TOOLBAR_TEXT.headV}</div>
            {V_MODES.map((m) => (
              <button key={m} type="button" className={styles.menuItem} role="menuitem" onClick={() => runArrange(m)}>
                {SELECT_TOOLBAR_TEXT.mode[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {groupId && (
        <button
          type="button"
          className={styles.btn}
          title={SELECT_TOOLBAR_TEXT.ungroupHint}
          onClick={() => ungroupNodes(groupId)}
        >
          {SELECT_TOOLBAR_TEXT.ungroup}
        </button>
      )}
    </div>
  );
}
