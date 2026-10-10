/**
 * 账号节点（`type: 'account'`）—— 对应原 `UL` / `OL.jsx`
 * 依据：docs/03-人类版.md §1（29592-29594）+ §4（账号可用性判定）
 *
 * 外壳统一走 `NodeShell`；状态圆点走 `NodeStatusDot`（`dot` 类名只在 `NodeShell.tsx`）
 */

import { useStore } from '@/state';
import { ACCOUNT_STATUS, isAccountUsable } from '@/stable/model/account';
import { NodeShell, NodeStatusDot } from './NodeShell';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function AccountNode({ data, selected }: RFNodeProps<'account'>) {
  const account = useStore((s) => s.accounts.find((a) => a.id === data.accountId));
  const usable = account ? isAccountUsable(account) : false;

  return (
    <NodeShell title="账号" meta={account?.type ?? '—'} selected={selected}>
      {account ? (
        <div className={styles.accountRow}>
          <NodeStatusDot ok={usable} />
          <span>{account.name}</span>
          <span className={styles.spinner}>{account.status || ACCOUNT_STATUS.loggedIn}</span>
        </div>
      ) : (
        <div className={styles.placeholder}>账号不存在（{data.accountId}）</div>
      )}
    </NodeShell>
  );
}
