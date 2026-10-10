/**
 * 生成面板（原「文生视频面板 / 文生图面板」的最小可用版）
 *
 * 依据：docs/03-人类版.md §5 §8
 *
 * ⚠️ 原则 1：本组件**不写 store**，只调 `state` 暴露的 `gen` 控制器
 * ⚠️ 原则 8：这是**首个**生成面板；第二个（视频面板）出现时**必须**抽成复合组件
 *    （`<GenPanel>` + `<ModelPicker>` / `<RatioPicker>` —— 见 §9.4 组合模式）
 */

import { useState } from 'react';
import { useGen, useStore } from '@/state';
import { PROJECT_TEXT } from '@/constants/text';
// ⚠️ `DEFAULT_IMAGE_RESOLUTION` 来自 SSOT，不在 JSX 里内联 `'2K'` —— TD-08-2
import { ASPECT_RATIOS, DEFAULT_IMAGE_RESOLUTION, IMAGE_RESOLUTIONS, VIDEO_MODELS } from '@/constants/models';
import styles from './GenPanel.module.css';

export function GenPanel() {
  const nodes = useStore((s) => s.nodes);
  const patchNodeData = useStore((s) => s.patchNodeData);
  const gen = useGen();
  const [busy, setBusy] = useState(false);

  // ⚠️ 用显式分支做**判别联合收窄**（`find` 的谓词不会收窄类型）
  const selected = nodes.find((n) => n.selected);
  if (!selected) return null;

  // 分别取出两种生成节点的 data（避免在联合类型上访问可选字段 —— 会退化成 unknown）
  const imageNode = selected.type === 'imggen' ? selected : null;
  const videoNode = selected.type === 'genvideo' ? selected : null;
  if (!imageNode && !videoNode) return null;

  const nodeId = selected.id;
  const ratio = imageNode ? imageNode.data.aspectRatio : (videoNode as NonNullable<typeof videoNode>).data.aspectRatio;
  const hasResult = imageNode ? !!imageNode.data.resultUrl : !!(videoNode as NonNullable<typeof videoNode>).data.resultUrl;

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      await gen.runForNode(nodeId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel} data-testid="gen-panel">
      <div className={styles.head}>{imageNode ? '文生图' : '文生视频'}</div>

      <label className={styles.row}>
        <span>比例</span>
        <select value={ratio} onChange={(e) => patchNodeData(nodeId, { aspectRatio: e.target.value })}>
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      {imageNode && (
        <>
          <label className={styles.row}>
            <span>分辨率</span>
            <select
              value={imageNode.data.igResolution ?? DEFAULT_IMAGE_RESOLUTION}
              onChange={(e) => patchNodeData(nodeId, { igResolution: e.target.value })}
            >
              {IMAGE_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span>张数</span>
            <input
              type="number"
              min={1}
              max={4}
              value={imageNode.data.imageCount ?? 1}
              onChange={(e) => patchNodeData(nodeId, { imageCount: Number(e.target.value) || 1 })}
            />
          </label>
        </>
      )}

      {videoNode && (
        <label className={styles.row}>
          <span>模型</span>
          <select
            value={videoNode.data.model ?? ''}
            onChange={(e) => patchNodeData(nodeId, { model: e.target.value })}
          >
            <option value="">（默认）</option>
            {VIDEO_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="button" className={styles.run} onClick={() => void run()} disabled={busy}>
        {busy ? '生成中…' : hasResult ? PROJECT_TEXT.regenerating : PROJECT_TEXT.generate}
      </button>
    </div>
  );
}
