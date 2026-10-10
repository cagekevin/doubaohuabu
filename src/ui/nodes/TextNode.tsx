/**
 * 文本节点（`type: 'text'`）—— 对应原 `EL` / `CL.jsx`
 * 依据：docs/03-人类版.md §1（文本节点 28593-28611）
 */

import { NodeHandles } from './NodeHandles';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function TextNode({ data, selected }: RFNodeProps<'text'>) {
  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`}>
      <NodeHandles />
      <div className={styles.header}>
        <span>文本</span>
        <span>
          {data.aspectRatio} · {data.duration}s
        </span>
      </div>
      <div className={`${styles.body} ${styles.text}`}>{data.text || '（空）'}</div>
    </div>
  );
}
