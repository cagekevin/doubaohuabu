/**
 * 素材节点（`type: 'material'`）—— 对应原 `pL` / `fL.jsx`
 * 依据：docs/03-人类版.md §1（素材节点 28345-28351）
 *
 * ⚠️ 图片一律走 `<Thumb>` 缩略图（`?w=`），**不加载原图**（原图 2~20MB）—— docs/10 #7
 * ⚠️ `padded={false}`：缩略图要**通栏**（见 `NodeShell` 的注释）
 */

import { Thumb } from '@/ui/common/Thumb';
import { NodeShell } from './NodeShell';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function MaterialNode({ data, selected }: RFNodeProps<'material'>) {
  return (
    <NodeShell title="素材" meta={data.name} selected={selected} padded={false}>
      <Thumb src={data.dataUrl} alt={data.name} className={styles.thumb} />
    </NodeShell>
  );
}
