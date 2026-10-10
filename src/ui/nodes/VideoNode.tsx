/**
 * 视频节点（`type: 'video'`）—— 对应原 `_Component` / 视频组件
 * 依据：docs/03-人类版.md §1（视频节点 28277-28302）
 *
 * ⚠️ 视频**必须落盘**（远端是签名临时地址）—— docs/10 #9
 * ⚠️ `url` 为 `vid://` 或磁盘引用；前端**不直接拼 `vid://`**（见 09-校验记录 C2）
 *
 * 外壳统一走 `NodeShell`（判据 C1）
 */

import { NodeShell } from './NodeShell';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function VideoNode({ data, selected }: RFNodeProps<'video'>) {
  return (
    <NodeShell title="视频" meta={data.duration ? `${data.duration}s` : ''} selected={selected}>
      {data.url ? (
        <video
          className={styles.thumb}
          src={data.url}
          poster={data.poster}
          controls
          preload="metadata"
        />
      ) : (
        <div className={styles.placeholder}>无视频</div>
      )}
    </NodeShell>
  );
}
