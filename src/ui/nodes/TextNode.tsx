/**
 * 文本节点（`type: 'text'`）—— 对应原 `EL` / `CL.jsx`
 * 依据：docs/03-人类版.md §1（文本节点 28593-28611）
 *
 * 外壳（外框 / 选中态 / 连接点 / 头部）统一走 `NodeShell`（判据 C1）。
 */

import { NodeShell } from './NodeShell';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function TextNode({ data, selected }: RFNodeProps<'text'>) {
  return (
    <NodeShell
      title="文本"
      meta={`${data.aspectRatio} · ${data.duration}s`}
      selected={selected}
    >
      <div className={styles.text}>{data.text || '（空）'}</div>
    </NodeShell>
  );
}
