/**
 * Lovart 出口代理池面板（原 `LP.jsx`，2,648 B / 2 按钮 / 7 文案）
 *
 * ★ 语义：每行一个代理；保存后 **Lovart 账号按序轮询分配独立出口 IP**
 *   （源版文案：对应 Firefox 容器 + Mozilla VPN「每个容器独立 IP」的效果）。
 *
 * ⚠️ 原则 1：本组件**不写 store** —— 走 `useAccountOps().saveProxyPool`。
 * ⚠️ 与源版的一处差异（留痕）：源版自带 `.login-head` 的「关闭」按钮 ⇒ 本工程用 `<Modal>` 的 `×`。
 * ⚠️ 预览列表用的是 **store 里已保存的 `proxyPool`**（源 `LP.jsx:63` 的 `t`），**不是**文本域当前内容
 *   —— 与源一致：未保存时看到的仍是上一次生效的分配。
 */

import { useState } from 'react';
import { Modal } from '@/ui/common/Modal';
import { useAccountOps, useStore } from '@/state';
import { normalizeAccountType } from '@/stable/model/account';
import { PROXY_TEXT } from '@/constants/text';
import styles from './ProxyPoolPanel.module.css';

export interface ProxyPoolPanelProps {
  onClose: () => void;
}

export function ProxyPoolPanel({ onClose }: ProxyPoolPanelProps) {
  const proxyPool = useStore((s) => s.proxyPool);
  const accounts = useStore((s) => s.accounts);
  const accountOps = useAccountOps();
  // 文本域初值 = 当前池（原 `LP.jsx:16` 的 `(t || []).join('\n')`）
  const [text, setText] = useState(() => (proxyPool || []).join('\n'));
  const [msg, setMsg] = useState('');

  // 只列 Lovart 账号（原 19-21）
  const lovart = accounts.filter((a) => normalizeAccountType(a.type) === 'lovart');

  const save = async (): Promise<void> => {
    const r = await accountOps.saveProxyPool(text);
    setMsg(r.count ? PROXY_TEXT.saved(r.count) : PROXY_TEXT.cleared);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={PROXY_TEXT.title}
      footer={
        <button type="button" className={styles.saveBtn} onClick={() => void save()}>
          {PROXY_TEXT.save}
        </button>
      }
    >
      <p className={styles.tip}>
        {PROXY_TEXT.hint}
        {PROXY_TEXT.hintRest}
      </p>
      <textarea
        className={styles.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PROXY_TEXT.placeholder}
        rows={6}
      />
      <div className={styles.status}>{msg}</div>
      <div className={styles.assignTitle}>{PROXY_TEXT.assignment}</div>
      {lovart.length === 0 ? (
        <div className={styles.empty}>{PROXY_TEXT.noLovart}</div>
      ) : (
        <ul className={styles.list}>
          {lovart.map((a, i) => {
            const pool = proxyPool || [];
            const proxy = pool.length ? (pool[i % pool.length] ?? '') : '';
            return (
              <li key={a.id} className={styles.row}>
                <span className={styles.name}>{a.name}</span>
                <span className={proxy ? styles.net : styles.direct}>{proxy || PROXY_TEXT.direct}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
