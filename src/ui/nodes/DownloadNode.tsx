/**
 * 下载节点（`type: 'download'`）—— 对应原 `VL` / `WL.jsx`
 * 依据：docs/03-人类版.md §1（29610-29612）
 */

import { NodeHandles } from './NodeHandles';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function DownloadNode({ data, selected }: RFNodeProps<'download'>) {
  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`}>
      <NodeHandles />
      <div className={styles.header}>
        <span>下载</span>
      </div>
      <div className={styles.body}>
        <div className={styles.text}>{data.folder || '（默认目录）'}</div>
      </div>
    </div>
  );
}
