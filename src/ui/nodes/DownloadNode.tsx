/**
 * 下载节点（`type: 'download'`）—— 对应原 `VL` / `WL.jsx`
 * 依据：docs/03-人类版.md §1（29610-29612）
 *
 * 外壳统一走 `NodeShell`（判据 C1）
 */

import { NodeShell } from './NodeShell';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function DownloadNode({ data, selected }: RFNodeProps<'download'>) {
  return (
    <NodeShell title="下载" selected={selected}>
      <div className={styles.text}>{data.folder || '（默认目录）'}</div>
    </NodeShell>
  );
}
