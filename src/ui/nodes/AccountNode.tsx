/**
 * 账号节点（`type: 'account'`）—— 对应原 `UL` / `OL.jsx`
 * 依据：docs/03-人类版.md §1（29592-29594）+ §4（账号可用性判定）
 */

import { useStore } from '@/state';
import { ACCOUNT_STATUS, isAccountUsable } from '@/stable/model/account';
import { NodeHandles } from './NodeHandles';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function AccountNode({ data, selected }: RFNodeProps<'account'>) {
  const account = useStore((s) => s.accounts.find((a) => a.id === data.accountId));
  const usable = account ? isAccountUsable(account) : false;

  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`}>
      <NodeHandles />
      <div className={styles.header}>
        <span>账号</span>
        <span>{account?.type ?? '—'}</span>
      </div>
      <div className={styles.body}>
        {account ? (
          <div className={styles.accountRow}>
            <span className={`${styles.dot} ${usable ? '' : styles.dotInvalid}`} />
            <span>{account.name}</span>
            <span className={styles.spinner}>{account.status || ACCOUNT_STATUS.loggedIn}</span>
          </div>
        ) : (
          <div className={styles.placeholder}>账号不存在（{data.accountId}）</div>
        )}
      </div>
    </div>
  );
}
