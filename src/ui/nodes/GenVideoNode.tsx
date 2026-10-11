/**
 * 文生视频节点（`type: 'genvideo'`）—— 对应原 `YL.jsx`
 * 依据：`docs/12` §1.7（源结构树）+ `docs/13` §1.7（缺口登记）
 *
 * ★ **2026-10-11**：
 *   · 补 `gv-stage` + `gv-waiting` + `gv-preview-empty` + `gv-media-fallback`（原 485-530）；
 *   · **修正 `gv-meta` 第 2 项** —— 原误用 `data.aspectRatio`，源实为 `y` = **执行账号标签**
 *     （`core/rules/genVideo.nodeAccountLabel`，逐字对源 62-109）；顺带 `duration` 补默认 `5`（原 `w`）。
 *
 * ⚠️ 「生成中」在本仓 = **`data.generating`**（`state/generate.ts` 写入；`GenImageNode` 已用）。
 *    源 `genvideo` 用的是 `apiJob`/`_pendingAttempt` 推导的 `m`（`YL.jsx:43-58`，含 **30 分钟窗口**），
 *    而 `apiJob` 在本仓**未 patch 到节点**、`_pendingAttempt(s)` **无生产者**（启动即清）
 *    ⇒ 照搬 `m` 会得到**恒假**的假功能。取舍已登记 —— **TD-16-81**
 *    （源 `imggen` 的 `gv-waiting` 用的恰是 `data.generating`，见 `docs/12` §1.8 —— 本仓两节点统一到它）。
 *
 * ⚠️ `gv-waiting` **后两态**（`p` = `nodeNotices[id].code === 'generation-confirm'`）**无数据源** —— TD-16-81。
 * ⚠️ 仍未落：`gv-play` / `gv-dur-badge` / `gv-dl` / `gv-tl` / `gv-apijob` / `gv-hist-btn` / `gv-frame-btn`×3 /
 *    整卡点击打开生成面板 —— **TD-16-79**（整块）。`<video>` 因此仍用**原生 `controls`**，未用源的
 *    自绘播放按钮（`gv-play`）。
 * ⚠️ `_pendingAttempt` / `_pendingAttempts` / 未完成 `apiJob` 由**启动归位清理**
 *    （`stable/migrations/resetStaleJobs`）—— 重启即放弃，docs/06 视角 4。
 *
 * 外壳统一走 `NodeShell`（判据 C1）
 */

import { useMemo } from 'react';
import { useStore } from '@/state';
import { GEN_VIDEO_TEXT } from '@/constants/text';
import { countInputs } from '@/core/rules/linkedMaterials';
import { hasResult, nodeAccountLabel, stageRatio } from '@/core/rules/genVideo';
import { normalizeModelLabel } from '@/core/rules/prompt';
import { withThumb } from '@/stable/protocols/img';
import { NodeShell } from './NodeShell';
import { AnalyzePrompt } from './AnalyzePrompt';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function GenVideoNode({ id, data, selected }: RFNodeProps<'genvideo'>) {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const accounts = useStore((s) => s.accounts);
  const groups = useStore((s) => s.groups);

  /** `gv-meta` 首项：已连接 N 个输入（原 `u.length`，`YL.jsx:558`） */
  const inputCount = useMemo(() => countInputs(nodes, edges, id), [nodes, edges, id]);

  /**
   * `gv-meta`（原 556-559）：`已连接 N 个输入 · <账号标签> · <模型> · <时长>s`
   * ⚠️ 第 2 项是**账号标签**（原 `y`），**不是**比例 —— 这是 2026-10-11 的修正。
   */
  const meta = [
    GEN_VIDEO_TEXT.metaInputs(inputCount),
    // ⚠️ 依赖 `accounts`/`groups`（显式账号名与分组名要从 store 里查）
    nodeAccountLabel({ sendAccount: data.sendAccount, accounts, groups }),
    normalizeModelLabel(data.model),
    // 原 `w = d.duration || 5`
    `${data.duration || 5}s`,
  ].join(GEN_VIDEO_TEXT.metaSep);

  /** 有结果（原 `h` = `!!resultUrl || !!resultPoster`） */
  const produced = hasResult(data);
  /** 生成中（原 `m` 在本仓的等价物；见文件头 ⚠️） */
  const generating = !!data.generating;
  /** 海报缩略图（原 `Xt(d.resultPoster, 480)`） */
  const poster = data.resultPoster
    ? withThumb(data.resultPoster, GEN_VIDEO_TEXT.posterThumbWidth)
    : undefined;

  return (
    <NodeShell
      title={GEN_VIDEO_TEXT.title}
      meta={meta}
      selected={selected}
      // 有框外浮层（分析按钮 / 提示词浮层）⇒ 不能被 `.node` 的 overflow 裁掉
      overflowVisible
    >
      <div className={styles.text}>{data.text || '（空提示词）'}</div>
      {/* `gv-stage`（原 485-530）：按比例撑开的舞台，等待浮层叠在其上 */}
      <div className={styles.gvStage} style={{ aspectRatio: stageRatio(data.aspectRatio) }}>
        {generating && (
          <div className={styles.gvWaiting} aria-label={GEN_VIDEO_TEXT.waitingAria}>
            <div className={styles.gvwDots}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.gvwText}>
              {produced ? GEN_VIDEO_TEXT.waitingRegenerate : GEN_VIDEO_TEXT.waitingFirst}
            </div>
          </div>
        )}
        {produced ? (
          data.resultUrl ? (
            <video
              className={styles.thumb}
              src={data.resultUrl}
              poster={poster}
              controls
              preload="metadata"
            />
          ) : poster ? (
            <img className={styles.thumb} src={poster} alt="" loading="lazy" />
          ) : (
            <div className={styles.gvMediaFallback}>{GEN_VIDEO_TEXT.mediaFallback}</div>
          )
        ) : (
          <div className={styles.gvPreviewEmpty}>
            <div className={styles.gvPreviewTitle}>{GEN_VIDEO_TEXT.stageEmptyTitle}</div>
            <div className={styles.gvPreviewSub}>{GEN_VIDEO_TEXT.stageEmptySub}</div>
          </div>
        )}
      </div>
      {/*
        ★ 提示词分析（共享组件 `AnalyzePrompt`）
        ⚠️ **本仓既有、源 `YL.jsx` 里没有**（§1.7 的 44 条文案中无「分析提示词」；那套属 `ZL.jsx`/`fL.jsx`）
          —— 条件保持本仓原样（`!!resultUrl`），**本刀不动它**；是否保留待裁定，见 TD-16-80。
      */}
      <AnalyzePrompt
        nodeId={id}
        imageUrl={data.resultUrl}
        state={data.analyzePrompt ?? null}
        showButton={!!data.resultUrl}
      />
    </NodeShell>
  );
}
