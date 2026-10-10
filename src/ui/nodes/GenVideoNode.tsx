/**
 * 文生视频节点（`type: 'genvideo'`）—— 对应原 `XL` / `YL.jsx`
 * 依据：docs/03-人类版.md §1（29519-29531）+ §5（生成链路）
 *
 * ⚠️ `_pendingAttempt` / `_pendingAttempts` / 未完成 `apiJob` 由**启动归位清理**
 *    （`stable/migrations/resetStaleJobs`）—— 重启即放弃，docs/06 视角 4
 */

import { NodeHandles } from './NodeHandles';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function GenVideoNode({ data, selected }: RFNodeProps<'genvideo'>) {
  const hasResult = !!data.resultUrl;
  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`}>
      <NodeHandles />
      <div className={styles.header}>
        <span>文生视频</span>
        <span>
          {data.model ?? '默认'} · {data.duration}s
        </span>
      </div>
      <div className={styles.body}>
        <div className={styles.text}>{data.text || '（空提示词）'}</div>
        {hasResult ? (
          <video className={styles.thumb} src={data.resultUrl} poster={data.resultPoster} controls preload="metadata" />
        ) : (
          <div className={styles.placeholder}>未生成</div>
        )}
      </div>
    </div>
  );
}
