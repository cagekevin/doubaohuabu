/**
 * 素材节点（`type: 'material'`）—— 对应原 `pL` / `fL.jsx`
 * 依据：docs/03-人类版.md §1（素材节点 28345-28351）
 *
 * ⚠️ 图片一律走 `<Thumb>` 缩略图（`?w=`），**不加载原图**（原图 2~20MB）—— docs/10 #7
 */

import { Thumb } from '@/ui/common/Thumb';
import { NodeHandles } from './NodeHandles';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function MaterialNode({ data, selected }: RFNodeProps<'material'>) {
  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`}>
      <NodeHandles />
      <div className={styles.header}>
        <span>素材</span>
        <span>{data.name}</span>
      </div>
      <Thumb src={data.dataUrl} alt={data.name} className={styles.thumb} />
    </div>
  );
}
