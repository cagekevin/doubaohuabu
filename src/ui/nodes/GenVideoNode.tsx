/**
 * 文生视频节点（`type: 'genvideo'`）—— 对应原 `XL` / `YL.jsx`
 * 依据：docs/03-人类版.md §1（29519-29531）+ §5（生成链路）
 *
 * ⚠️ `_pendingAttempt` / `_pendingAttempts` / 未完成 `apiJob` 由**启动归位清理**
 *    （`stable/migrations/resetStaleJobs`）—— 重启即放弃，docs/06 视角 4
 *
 * 外壳统一走 `NodeShell`（判据 C1）
 */

import { NodeShell } from './NodeShell';
import { AnalyzePrompt } from './AnalyzePrompt';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function GenVideoNode({ id, data, selected }: RFNodeProps<'genvideo'>) {
  const hasResult = !!data.resultUrl;
  return (
    <NodeShell
      title="文生视频"
      meta={`${data.model ?? '默认'} · ${data.duration}s`}
      selected={selected}
      // 有框外浮层（分析按钮 / 提示词浮层）⇒ 不能被 `.node` 的 overflow 裁掉
      overflowVisible
    >
      <div className={styles.text}>{data.text || '（空提示词）'}</div>
      {hasResult ? (
        <video
          className={styles.thumb}
          src={data.resultUrl}
          poster={data.resultPoster}
          controls
          preload="metadata"
        />
      ) : (
        <div className={styles.placeholder}>未生成</div>
      )}
      {/* ★ 提示词分析（源 `fL.jsx:43/52` 与 `ZL.jsx` 逐字重复的那套 ⇒ 共享组件） */}
      <AnalyzePrompt
        nodeId={id}
        imageUrl={data.resultUrl}
        state={data.analyzePrompt ?? null}
        showButton={hasResult}
      />
    </NodeShell>
  );
}
