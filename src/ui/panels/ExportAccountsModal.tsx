/**
 * 导出账号弹窗（原 `PP.jsx`，4,092 B / 4 按钮 / 17 文案）
 *
 * ★ 语义：勾选「已登录」账号 → 逐个取 cookie → 组 JSON → 保存对话框（后端独立对话框）。
 *
 * ⚠️ 原则 1：本组件**不写 store** —— 走 `useAccountOps().exportAccounts`。
 * ⚠️ 原则 6：失败/取消的提示用**后端原文**（取消时就是 `已取消`）—— **不改写、不加前缀**；
 *    结果文案的真源在 `ACCOUNT_TRANSFER_TEXT`，控件标签在 `EXPORT_TEXT`。
 *
 * ⚠️ 与源版的三处差异（留痕）：
 *   ① 源版自带 `.login-head` 的「关闭」按钮 ⇒ 本工程用 `<Modal>` 的 `×`（`关闭` 那句因此不需要）；
 *   ② 源版「导出中」禁用关闭 ⇒ 本工程 `×` 恒可点（导出是 Promise，关窗**不会**取消它）；
 *   ③ 源版把「全选/取消全选/导出选中」放在**头部**，本工程放进 `<Modal>` 的 **footer**（组合件分工）。
 */

import { useState } from 'react';
import { Modal } from '@/ui/common/Modal';
import { useAccountOps, useStore } from '@/state';
import { ACCOUNT_STATUS } from '@/stable/model/account';
import { ACCOUNT_TRANSFER_TEXT, EXPORT_TEXT } from '@/constants/text';
import styles from './ExportAccountsModal.module.css';

export interface ExportAccountsModalProps {
  onClose: () => void;
}

export function ExportAccountsModal({ onClose }: ExportAccountsModalProps) {
  const accounts = useStore((s) => s.accounts);
  const accountOps = useAccountOps();
  // 已登录账号（原 `PP.jsx:95-97`：`(status || '已登录') === '已登录'`）
  const loggedIn = accounts.filter((a) => (a.status || ACCOUNT_STATUS.loggedIn) === ACCOUNT_STATUS.loggedIn);

  /**
   * 默认全选「已登录」账号（原 `PP.jsx:14-18` 的 effect）
   *
   * ⚠️ **用懒初始化而非 effect**：本弹窗**每次打开都重新挂载** ⇒ 懒初始化即等价于
   *   「打开时全选」；而 effect 里同步 `setState` 会触发级联渲染
   *   （`react-hooks/set-state-in-effect`，本项目已因此改过四处）。
   */
  const [selected, setSelected] = useState<Set<string>>(() => new Set(loggedIn.map((a) => a.id)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async (): Promise<void> => {
    if (selected.size === 0) {
      setMsg(ACCOUNT_TRANSFER_TEXT.pickNone);
      return;
    }
    setBusy(true);
    setMsg(ACCOUNT_TRANSFER_TEXT.exporting);
    const r = await accountOps.exportAccounts([...selected]);
    if (r.kind === 'failed') {
      // 原则 6：后端原文（取消时就是 `已取消`）
      setMsg(r.message);
      setBusy(false);
      return;
    }
    if (r.kind === 'exported') {
      setMsg(ACCOUNT_TRANSFER_TEXT.exported(r.count));
      // 原 `PP.jsx:83-85`：成功后 1200ms 自动关闭
      window.setTimeout(onClose, 1200);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={EXPORT_TEXT.title}
      closeOnMask={!busy}
      footer={
        <>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setSelected(new Set(loggedIn.map((a) => a.id)))}
          >
            {EXPORT_TEXT.selectAll}
          </button>
          <button type="button" className={styles.btnGhost} onClick={() => setSelected(new Set())}>
            {EXPORT_TEXT.deselectAll}
          </button>
          <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void run()}>
            {busy ? EXPORT_TEXT.exporting : EXPORT_TEXT.exportSelected(selected.size)}
          </button>
        </>
      }
    >
      <div className={styles.status}>{msg}</div>
      {loggedIn.length === 0 ? (
        <div className={styles.empty}>{EXPORT_TEXT.empty}</div>
      ) : (
        <ul className={styles.list}>
          {loggedIn.map((a) => (
            <li key={a.id}>
              <label className={styles.row}>
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                <span className={styles.name}>{a.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
