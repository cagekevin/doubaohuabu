/**
 * 视频节点（`type: 'video'`）—— 对应原 `BL.jsx`（**492 行**，本工程落**最小可用子集**）
 *
 * ★ 语义：一条**成片**，带**来源**（哪个节点产出的）与**配方**（`recipe`：提示词与参数）。
 *
 * ★ **2026-10-10 补齐**（此前该组件 31 行、**零交互**）：
 *   ① **双击改名**（原 86-105：进态用 `requestAnimationFrame` 再 focus+select；
 *      提交时 **`trim()` 非空且与旧名不同**才写，**无论如何都退出改名态**）；
 *   ② **可缩放边框**（原 303 的 `NodeResizer`，`minWidth=200`/`minHeight=170`）；
 *   ③ **来源 chip**（原 330-333）→ 点击**定位到源节点**（原 106-125）：取源节点
 *      `width||measured.width||**440**`、`height||measured.height||**300**`，`setCenter` 到它的中心；
 *      **源节点已不存在**时提示（原 119）；
 *   ④ **配方 chip + 面板**（原 341-445）：提示词 + 规格（模型/时长/比例/风格/参考图×n/
 *      引用文本×n/出片账号）+ 参考图标签 + **「复制配方」**（复制 `recipeDetailLines` 的多行详情）。
 *
 * ⛔ **两处未落地（按判据 B4 处理，不假装）**：
 *   · **「按配方重跑」**（原 442）→ 源版走 `store.addTextNodeFromRecipe`（用配方反建文本框），
 *     **该 action 未落地** ⇒ 按钮**禁用** + `title` 说明。
 *   · **「出片记录」**（原 448+ 的第二块面板：按 `nodeId` 聚合的产出历史）—— 需要 `genHistory`
 *     的聚合视图，本工程**未落地** ⇒ **不渲染**（渲染空列表等于假装有）。
 *   · 另有**预览截图**（原 `Mt`：`window.api.captureRect` 拖框截图）等一组动作，同属大件。
 *
 * ⚠️ 与源一致：定位用的 `position` **不折算父偏移**（原 124 直接用 `it.position`）——
 *   组内节点会被定位偏；**照抄**（源版如此）。
 */

import { useCallback, useRef, useState } from 'react';
import { useCapture } from '@/state';
import { useCaptureElement } from '@/ui/common/useCaptureElement';
import { NodeResizer, useReactFlow } from '@xyflow/react';
import { useStore } from '@/state';
import {
  formatClock,
  provenanceLabel,
  readRecipe,
  recipeDetailLines,
  recipeSummaryLine,
} from '@/core/rules/recipe';
import { normalizeModelLabel } from '@/core/rules/prompt';
import { ANALYZE_UI_TEXT, VIDEO_NODE_TEXT } from '@/constants/text';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

/** 定位源节点时的兜底尺寸（原 122-123 的两个魔法值） */
const FALLBACK_SOURCE_W = 440;
const FALLBACK_SOURCE_H = 300;

export function VideoNode({ id, data, selected }: RFNodeProps<'video'>) {
  const nodes = useStore((s) => s.nodes);
  const patchNodeData = useStore((s) => s.patchNodeData);
  const pushToast = useStore((s) => s.pushToast);
  const addTextNodeFromRecipe = useStore((s) => s.addTextNodeFromRecipe);
  const { setCenter } = useReactFlow();
  const capture = useCapture();
  /**
   * ★ 把 `<video>` 登记进**截图注册表**（原 `Lu.set`）—— 截图的发起方与"被截的元素"
   *   不在同一个组件里，靠这张表对上（见 `lib/captureRegistry.ts` 的头注释）。
   */
  const videoRef = useRef<HTMLVideoElement>(null);
  useCaptureElement(id, videoRef);
  const [capturing, setCapturing] = useState(false);

  const label = data.label || VIDEO_NODE_TEXT.fallbackName;

  const [editingName, setEditingName] = useState(false);
  // ⚠️ 显式 `string`：`label` 的来源是 `as const` 的 SSOT ⇒ 不标注会被收窄成字面量类型
  const [draft, setDraft] = useState<string>(label);
  const nameInputRef = useRef<HTMLInputElement>(null);

  /** 进入改名态（原 86-96）—— ⚠️ 源版用 `requestAnimationFrame` 等输入框挂上再 focus */
  const startRename = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setDraft(label);
      setEditingName(true);
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      });
    },
    [label],
  );

  /** 提交改名（原 97-105）—— ⚠️ **不 trim 就不写**、**同名也不写**，但**都退出改名态** */
  const commitRename = useCallback(() => {
    const next = draft.trim();
    if (next && next !== label) patchNodeData(id, { label: next });
    setEditingName(false);
  }, [draft, label, id, patchNodeData]);

  /** 来源标签（原 49-51 的 `M = fR({data}, nodes)`） */
  const source = provenanceLabel(data, nodes);
  /** 配方（原 27 的 `y = lR({data})`） */
  const recipe = readRecipe(data);

  /** 定位到源节点（原 106-125） */
  const locateSource = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      const anchor = data.gridAnchor || data.sourceNodeId;
      if (!anchor || typeof anchor !== 'string') return;
      const src = nodes.find((n) => n.id === anchor);
      if (!src) {
        // 原 119：`H('源节点已不存在')`
        pushToast(VIDEO_NODE_TEXT.sourceMissing, undefined, 'warn');
        return;
      }
      const w = src.width ?? FALLBACK_SOURCE_W;
      const h = src.height ?? FALLBACK_SOURCE_H;
      // ⚠️ 与源一致：**不折算父偏移**（组内节点会偏 —— 源版如此）
      setCenter(src.position.x + w / 2, src.position.y + h / 2, { zoom: 1, duration: 300 });
    },
    [data, nodes, pushToast, setCenter],
  );

  const [panelOpen, setPanelOpen] = useState(false);

  /** 「复制配方」（原 437-439 的 `ut`）—— 复制的是 `dR` 的多行详情 */
  const copyRecipe = useCallback(async () => {
    if (!recipe) return;
    const text = recipeDetailLines(recipe);
    try {
      await navigator.clipboard.writeText(text);
      pushToast(ANALYZE_UI_TEXT.copied);
    } catch {
      pushToast(ANALYZE_UI_TEXT.copyFailed, undefined, 'error');
    }
  }, [recipe, pushToast]);

  return (
    <div className={`${styles.videoNode} ${selected ? styles.groupSelected : ''}`} data-testid="video-node">
      {/* 原 303：`minWidth=200` / `minHeight=170` */}
      <NodeResizer minWidth={200} minHeight={170} isVisible={!!selected} />

      <div className={styles.materialHead}>
        <span className={styles.videoDot} />
        {editingName ? (
          <input
            ref={nameInputRef}
            className={`${styles.materialRename} nodrag nopan nowheel`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              // ⚠️ 与源一致：BL 的改名输入**只有 Enter**（不像素材节点还带 Escape）
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.materialTitle} title={VIDEO_NODE_TEXT.renameTitle} onDoubleClick={startRename}>
            {label}
          </span>
        )}
        {data.accountName && <span className={styles.videoMeta}>{data.accountName}</span>}
        {data.duration != null && <span className={styles.videoMeta}>{formatClock(data.duration)}</span>}
        {data.width != null && data.height != null && (
          <span className={styles.videoMeta}>
            {data.width}×{data.height}
          </span>
        )}
        {/* ★ 截图（原 `Mt` → `$T` → `Rk`）—— 失败**必须说出来**（源版静默返回 null，用户会反复点） */}
        <button
          type="button"
          className={styles.videoMeta}
          disabled={capturing}
          title={VIDEO_NODE_TEXT.captureTitle}
          onClick={() => {
            setCapturing(true);
            void capture
              .captureNode(id)
              .then((r) => {
                if (!r.ok) pushToast(r.reason ?? VIDEO_NODE_TEXT.captureTitle, undefined, 'warn');
              })
              .finally(() => setCapturing(false));
          }}
        >
          {capturing ? VIDEO_NODE_TEXT.captureBusy : VIDEO_NODE_TEXT.capture}
        </button>
      </div>

      {/* 原 327-345：来源 chip + 配方 chip */}
      <div className={`${styles.videoProvenance} nodrag nopan`}>
        {source && (
          <button
            type="button"
            className={styles.videoChip}
            title={VIDEO_NODE_TEXT.fromChipTitle(source)}
            onClick={locateSource}
          >
            {VIDEO_NODE_TEXT.fromChip(source)}
          </button>
        )}
        {recipe ? (
          <button
            type="button"
            className={styles.videoChip}
            title={VIDEO_NODE_TEXT.recipeChipTitle}
            onClick={() => setPanelOpen((v) => !v)}
          >
            {VIDEO_NODE_TEXT.recipeChip(recipeSummaryLine(recipe))}
          </button>
        ) : (
          <span className={styles.videoNoRecipe} title={VIDEO_NODE_TEXT.noRecipeTitle}>
            {VIDEO_NODE_TEXT.noRecipeText}
          </span>
        )}
      </div>

      <div className={styles.videoBody}>
        {data.url && !panelOpen ? (
          <video
            ref={videoRef}
            className={styles.videoEl}
            src={data.url}
            poster={data.poster || undefined}
            controls
            preload="metadata"
            playsInline
          />
        ) : data.url ? (
          /* 原 403-445：配方面板（占住视频区） */
          <div className={`${styles.videoPanel} nodrag nopan nowheel`}>
            <div className={styles.videoPanelHead}>
              <span>{VIDEO_NODE_TEXT.panelTitle}</span>
              <button
                type="button"
                className={styles.videoPanelClose}
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelOpen(false);
                }}
              >
                {VIDEO_NODE_TEXT.panelClose}
              </button>
            </div>
            <div className={styles.videoPanelBody}>
              <div className={styles.videoPrompt}>{recipe?.prompt || VIDEO_NODE_TEXT.noPrompt}</div>
              <div className={styles.videoSpecs}>
                {recipe?.model ? <span className={styles.videoSpec}>{VIDEO_NODE_TEXT.specModel(normalizeModelLabel(recipe.model))}</span> : null}
                {recipe?.duration ? <span className={styles.videoSpec}>{formatClock(recipe.duration)}</span> : null}
                {recipe?.ratio ? <span className={styles.videoSpec}>{String(recipe.ratio)}</span> : null}
                {recipe?.styleName ? <span className={styles.videoSpec}>{recipe.styleName}</span> : null}
                {recipe?.images?.length ? (
                  <span className={styles.videoSpec}>{`参考图×${recipe.images.length}`}</span>
                ) : null}
                {recipe?.textRefs?.length ? (
                  <span className={styles.videoSpec}>{`引用文本×${recipe.textRefs.length}`}</span>
                ) : null}
                {recipe?.accountName ? <span className={styles.videoSpec}>{recipe.accountName}</span> : null}
              </div>
            </div>
            <div className={styles.videoPanelFoot}>
              <button type="button" className={styles.videoAct} onClick={() => void copyRecipe()}>
                {VIDEO_NODE_TEXT.copyRecipe}
              </button>
              <button
                type="button"
                className={styles.videoAct}
                /*
                 * ★ **2026-10-11 接通**（原 `addTextNodeFromRecipe`）—— 此前 `disabled` 并写明
                 *   "未落地"。它会在这个视频节点**正下方**建一个文本框并填入配方。
                 * ⚠️ 与源一致：**不带 `styleId`** —— 本工程的配方视图（`RecipeViewLite`）只带
                 *   `styleName`，没有 id（源版从原始 recipe 里取 `styleId`）。
                 */
                onClick={() => {
                  if (!recipe) return;
                  addTextNodeFromRecipe({
                    prompt: String(recipe.prompt ?? ''),
                    ...(recipe.model ? { model: String(recipe.model) } : {}),
                    ...(recipe.duration ? { duration: Number(recipe.duration) } : {}),
                    ...(recipe.ratio ? { ratio: String(recipe.ratio) } : {}),
                    anchorNodeId: id,
                  });
                }}
              >
                {VIDEO_NODE_TEXT.rerunRecipe}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.videoFallback}>
            <div>{VIDEO_NODE_TEXT.loadFailed}</div>
            {data.vid && <div className={styles.videoVid}>{data.vid}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
