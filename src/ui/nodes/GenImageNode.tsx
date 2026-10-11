/**
 * 文生图节点（`type: 'imggen'`）—— 对应原 `_Component` / 文生图组件
 * 依据：docs/03-人类版.md §1（29559-29575）+ §5
 *
 * ⚠️ `results[]` 上限由 `IMAGE_GEN_FEED_LIMIT`（80）约束
 * ⚠️ 结果图走 `<Thumb>`（`?w=`），不加载原图
 *
 * 外壳统一走 `NodeShell`（判据 C1）
 */

import { Thumb } from '@/ui/common/Thumb';
// ⚠️ 默认分辨率来自 SSOT（`constants/models.ts`），不在此内联 —— TD-08-2
import { DEFAULT_IMAGE_RESOLUTION } from '@/constants/models';
import { NodeShell } from './NodeShell';
import { AnalyzePrompt } from './AnalyzePrompt';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function GenImageNode({ id, data, selected }: RFNodeProps<'imggen'>) {
  const first = data.results[0];
  const current = data.resultUrl ?? first?.dataUrl;
  return (
    <NodeShell
      title="文生图"
      meta={`${data.channel} · ${data.igResolution ?? DEFAULT_IMAGE_RESOLUTION} · ${data.imageCount} 张`}
      selected={selected}
      // 有框外浮层（分析按钮 / 提示词浮层）⇒ 不能被 `.node` 的 overflow 裁掉
      overflowVisible
    >
      <div className={styles.text}>{data.text || '（空提示词）'}</div>
      {data.generating ? (
        <div className={styles.spinner}>生成中…</div>
      ) : current ? (
        <Thumb src={current} className={styles.thumb} />
      ) : (
        <div className={styles.placeholder}>未生成</div>
      )}
      {data.results.length > 1 && (
        <div className={styles.spinner}>共 {data.results.length} 张</div>
      )}
      {/*
        ★ 提示词分析（原 `ZL.jsx:256/273-286` 的浮动按钮 + `321` 的浮层）
        ⚠️ 与源一致：`showButton` = 有图且**不在生成中**（原 256 的 `u && !l.generating`）
        ⚠️ `imageUrl` = **当前图**（原 `se()` 的 `d`）
      */}
      <AnalyzePrompt
        nodeId={id}
        imageUrl={current}
        state={data.analyzePrompt ?? null}
        showButton={!!current && !data.generating}
      />
    </NodeShell>
  );
}
