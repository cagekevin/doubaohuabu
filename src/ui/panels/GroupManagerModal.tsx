/**
 * 分组管理（原 `OP.jsx:862-922` 的分组工具条 + `RP.jsx` 的分组区段）
 *
 * ★ 落**最小可用**版：新建 / 重命名 / 删除 / 颜色 / 自启动 + **账号移组**。
 *
 * ⚠️ 与源的三处差异（留痕）：
 *   ① 源版把分组**内联在账号列表里**（`RP.jsx` 带虚拟滚动 + 展开/收起 + 滚轮），本工程做成**独立弹窗**
 *      （账号列表保持扁平）—— 不搬那套 255 行的滚动实现。
 *   ② 源版颜色是**弹出层**（portal）；本工程用**内联调色板**（同 32 色，`GROUP_PALETTE`）。
 *   ③ 源版移组是**拖拽**；本工程用原生 `<select>`（`docs/17` §8 列为未收口的表单层）。
 *   ④ 源版重命名输入支持 `Escape` 取消；本工程**不实现** —— `原则8/rule-of-three` 规定
 *      `Escape` 处理只允许住 `ui/common/`（这里只保留 `Enter` 提交 + `onBlur` 提交）。
 *
 * ⚠️ 原则 1：本组件**不写 store** —— 只调 `useStore` 暴露的 action（纯逻辑在 `core/rules/accountGroup.ts`）。
 */

import { useState } from 'react';
import { Modal } from '@/ui/common/Modal';
import { useStore } from '@/state';
import { GROUP_PALETTE } from '@/constants/groupPalette';
import { GROUP_MANAGER_TEXT } from '@/constants/text';
import { Icon } from '@/ui/common/Icon';
import styles from './GroupManagerModal.module.css';

export interface GroupManagerModalProps {
  onClose: () => void;
}

export function GroupManagerModal({ onClose }: GroupManagerModalProps) {
  const groups = useStore((s) => s.groups);
  const accounts = useStore((s) => s.accounts);
  const addGroup = useStore((s) => s.addGroup);
  const renameGroup = useStore((s) => s.renameGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const setGroupColor = useStore((s) => s.setGroupColor);
  const setGroupAutoStart = useStore((s) => s.setGroupAutoStart);
  const moveAccountsToGroup = useStore((s) => s.moveAccountsToGroup);

  const [newName, setNewName] = useState('');
  /** 正在展开调色板的分组 id */
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  /** 正在重命名的分组（`null` = 不在重命名） */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  const membersOf = (gid: string) => accounts.filter((a) => a.groupId === gid);

  const commitRename = (): void => {
    if (!renaming) return;
    renameGroup(renaming.id, renaming.value);
    setRenaming(null);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={GROUP_MANAGER_TEXT.title}
    >
      {/* ── 新建分组（原 `OP.jsx:862-889`）── */}
      <div className={styles.newRow}>
        <input
          className={styles.input}
          value={newName}
          placeholder={GROUP_MANAGER_TEXT.namePlaceholder}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => {
            addGroup(newName);
            setNewName('');
          }}
        >
          {GROUP_MANAGER_TEXT.create}
        </button>
      </div>

      {/* ── 分组列表 ── */}
      {groups.length === 0 ? (
        <div className={styles.empty}>{GROUP_MANAGER_TEXT.noGroups}</div>
      ) : (
        <ul className={styles.list}>
          {groups.map((g) => {
            const members = membersOf(g.id);
            const allAuto = members.length > 0 && members.every((a) => a.autoStart === true);
            return (
              <li key={g.id} className={styles.groupRow}>
                <button
                  type="button"
                  className={`${styles.colorDot}${g.color ? '' : ` ${styles.colorDotNone}`}`}
                  style={g.color ? { background: g.color } : undefined}
                  title={GROUP_MANAGER_TEXT.colorTitle}
                  onClick={() => setPaletteFor(paletteFor === g.id ? null : g.id)}
                />
                {renaming?.id === g.id ? (
                  <input
                    className={styles.input}
                    autoFocus
                    value={renaming.value}
                    onChange={(e) => setRenaming({ id: g.id, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <span
                    className={styles.name}
                    title={GROUP_MANAGER_TEXT.renameTitle}
                    onDoubleClick={() => setRenaming({ id: g.id, value: g.name })}
                  >
                    {g.name}
                  </span>
                )}
                <span className={styles.count}>{members.length}</span>
                <button
                  type="button"
                  className={styles.autoBtn}
                  data-on={allAuto}
                  title={allAuto ? GROUP_MANAGER_TEXT.autoOnTitle : GROUP_MANAGER_TEXT.autoOffTitle}
                  onClick={() => setGroupAutoStart(g.id, !allAuto)}
                >
                  {GROUP_MANAGER_TEXT.autoLabel}
                </button>
                <button
                  type="button"
                  className={styles.delBtn}
                  title={GROUP_MANAGER_TEXT.deleteTitle}
                  onClick={() => {
                    if (window.confirm(GROUP_MANAGER_TEXT.deleteConfirm(g.name))) deleteGroup(g.id);
                  }}
                >
                  <Icon name="x" />
                </button>

                {paletteFor === g.id && (
                  <div className={styles.palette}>
                    {GROUP_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={styles.swatch}
                        style={{ background: c }}
                        title={GROUP_MANAGER_TEXT.pickColor}
                        onClick={() => {
                          setGroupColor(g.id, c);
                          setPaletteFor(null);
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      className={styles.noColor}
                      onClick={() => {
                        setGroupColor(g.id, null);
                        setPaletteFor(null);
                      }}
                    >
                      {GROUP_MANAGER_TEXT.noColor}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── 账号移组 ── */}
      <div className={styles.sectionTitle}>{GROUP_MANAGER_TEXT.assignTitle}</div>
      {accounts.length === 0 ? (
        <div className={styles.empty}>{GROUP_MANAGER_TEXT.noAccounts}</div>
      ) : (
        <ul className={styles.list}>
          {accounts.map((a) => (
            <li key={a.id} className={styles.accountRow}>
              {/* ★ 名字的样子与组名一致，但**不能共用 `.name`** —— 那个类带 `flex: 1`
                  （组名要撑开），用在这里会把右侧下拉挤窄；撑满归 `formRow` 的末位。 */}
              <span className={styles.accountName}>{a.name}</span>
              <select
                className={styles.select}
                value={a.groupId ?? ''}
                onChange={(e) => moveAccountsToGroup([a.id], e.target.value || null)}
              >
                <option value="">{GROUP_MANAGER_TEXT.ungrouped}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
