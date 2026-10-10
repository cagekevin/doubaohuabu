/**
 * 组节点（`type: 'group'`）—— 对应原 `qL` / `GL.jsx`
 * 依据：docs/03-人类版.md §1（31577-31579，`zIndex = -1001`）
 *
 * ⚠️ 组节点 zIndex 固定为 `GROUP_Z_INDEX = -1001`（在其它节点之下）
 */

import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function GroupNode({ data }: RFNodeProps<'group'>) {
  return (
    <div className={styles.group}>
      <div className={styles.groupLabel}>{data.label}</div>
    </div>
  );
}
