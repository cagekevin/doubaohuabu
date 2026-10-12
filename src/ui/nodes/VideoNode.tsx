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
 * ★ **2026-10-11 更正（TD-08-3）**：本节此前写「三处未落地」—— **现三处全部落地**（同文件他处已接通）：
 *   · ✅ **「按配方重跑」**（原 442）—— **已接通**：`store.addTextNodeFromRecipe` 落在
 *     `state/slices/canvas.ts:183/421` + 纯层 `core/rules/recipe.ts:200` ⇒ 按钮**可点**（见下方 `:277`）。
 *   · ✅ **预览截图**（原 `Mt`）—— **已接通**（`useCaptureElement` + `capturing`，见下方 `:178-194`）。
 *   · ✅ **「出片记录」**（原 `BL.jsx:346-354` 的 `vn-hist-chip` + `443-465` 的面板）—— **2026-10-11 已落**：
 *     数据来自节点自身的 `data.genHistory.attempts`（原 `tm`），统计用纯层 `attemptStats`（原 `F$`）；
 *     chip **只在 `total > 1` 时**渲染（源判据），内文 `×N`、`title` 是那句话。
 *     ⚠️ 与「生成配方」面板**互斥**（源 `S`/`P` 互相置 false）—— 见下方两个 chip 的 `onClick`。
 *
 * ⚠️ 与源一致：定位用的 `position` **不折算父偏移**（原 124 直接用 `it.position`）——
 *   组内节点会被定位偏；**照抄**（源版如此）。
 *
 *   · ✅ **自绘播放条**（原 `BL.jsx:468-488` 的 `video-controls` / `video-timeline`）—— **2026-10-11 已落**：
 *     播放/暂停（`wt`）· 进度条（`vt-fill`/`vt-knob`，百分比走纯层 `timelinePercent`）· 时间文字
 *     （`vt-time`，`formatClock(当前) / formatClock(总)`）· 拖拽定位（`At`/`_t`）。
 *     ⚠️ 三处**有意差异**见下（登记 `TD-03-13`）；⚠️ `ct` 的「按视频宽高比自适应节点尺寸」**仍未落**（`TD-03-14`）。
 *
 *   · ✅ **「拉取结果」**（原 `BL.jsx:355-382` 的 `vn-pull-chip`）—— **2026-10-12 已落**：
 *     可拉判据走纯层 `pullTargetOf`（原 `xk` + `z$`），动作走 `usePullResult().pull`
 *     （原 `pullResult` 的 `vid` 分支）⇒ 按 vid 拉无水印直链 → 落节点 → 本地化。
 *     ⚠️ 两处有意差异：① **只落 `vid` 分支** —— 原版另一条 `conversationId` 分支
 *        （回对话页 → 登记 `pull:true` → 交给 `postSendDetect`）依赖**发送后监测子系统**
 *        （`docs/19` §4.1，未落）⇒ 只剩 `conversationId` 时按钮**禁用**（判据 B4）；
 *        ② 成功 / 失败走 **`pushToast`**（与 `sourceMissing` 同一映射），**不**复刻源版那个
 *        节点内的 `vn-pull-err` 瞬时行。
 * ⚠️ **仍未落**（原 `BL.jsx`）：`ct` 的自适应尺寸（见上）。
 */

import { useCallback, useRef, useState } from 'react';
import { useCapture, useHostOps, usePullResult, useStore } from '@/state';
import { useCaptureElement } from '@/ui/common/useCaptureElement';
import { useReactFlow } from '@xyflow/react';
import {
  formatClock,
  provenanceLabel,
  readRecipe,
  recipeDetailLines,
  recipeSummaryLine,
} from '@/core/rules/recipe';
import { normalizeModelLabel } from '@/core/rules/prompt';
import { attemptsOf, attemptStats, attemptStatusLabel, pullTargetOf } from '@/core/rules/genHistory';
import { seekSeconds, timelinePercent } from '@/core/rules/genVideo';
import { formatMonthDayMinute } from '@/lib/time';
import { clamp } from '@/lib/math';
import { ANALYZE_UI_TEXT, MEDIA_PLAYER_TEXT, VIDEO_NODE_TEXT } from '@/constants/text';
import { NodeShell } from './NodeShell';
import { NodeTitle } from './NodeTitle';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

/** 定位源节点时的兜底尺寸（原 122-123 的两个魔法值） */
const FALLBACK_SOURCE_W = 440;
const FALLBACK_SOURCE_H = 300;

/**
 * 状态 → 行的着色类（原 `className={`vn-attempt ${Be.status || ''}`}` 的 CSS Modules 版）
 *
 * ⚠️ CSS Modules **不能拼类名**（会被哈希）⇒ 用显式查表；**未知状态不着色**（与源一致：
 *   源那半的类名只是个"额外的标识"，没有对应 CSS 规则就什么也不发生）。
 */
// ⚠️ 值域含 `undefined`：CSS Modules 的类型是 `string | undefined`（缺类名时不报错）
const ATTEMPT_STATUS_CLASS: Record<string, string | undefined> = {
  pending: styles.videoAttemptPending,
  success: styles.videoAttemptSuccess,
  failed: styles.videoAttemptFailed,
  cancelled: styles.videoAttemptCancelled,
};

export function VideoNode({ id, data, selected }: RFNodeProps<'video'>) {
  const nodes = useStore((s) => s.nodes);
  const patchNodeData = useStore((s) => s.patchNodeData);
  const pushToast = useStore((s) => s.pushToast);
  const addTextNodeFromRecipe = useStore((s) => s.addTextNodeFromRecipe);
  // ★ 宿主能力走控制器（`ui` 不持 `Ports` —— TD-16-8）
  const hostOps = useHostOps();
  const { setCenter } = useReactFlow();
  const capture = useCapture();
  const pullResult = usePullResult();
  /**
   * 「拉取结果」的可拉目标（原 `xk` + `z$`）—— 每次渲染算（判据 A2：能算出来就不入 state）。
   * ⚠️ `null` ⇒ 没有可拉的记录（已有 `url` / 没有尝试 / 尝试里既无 `vid` 也无 `conversationId`）。
   */
  const pullTarget = pullTargetOf(data);
  /** 拉取中（原 `z`，`:41`）—— 只用于按钮的忙碌态 */
  const [pulling, setPulling] = useState(false);
  /**
   * ★ 把 `<video>` 登记进**截图注册表**（原 `Lu.set`）—— 截图的发起方与"被截的元素"
   *   不在同一个组件里，靠这张表对上（见 `lib/captureRegistry.ts` 的头注释）。
   */
  const videoRef = useRef<HTMLVideoElement>(null);
  useCaptureElement(id, videoRef);
  const [capturing, setCapturing] = useState(false);

  const label = data.label || VIDEO_NODE_TEXT.fallbackName;

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
  /**
   * 出片记录面板（原 `BL.jsx:39` 的 `E`）
   * ⚠️ 与 `panelOpen`（生成配方）**互斥** —— 源在每次开一个时把另一个置 false（`:339` / `:351`）。
   */
  const [histOpen, setHistOpen] = useState(false);
  /** 尝试表（原 `BL.jsx:32` 的 `k = tm({data})`） */
  const attempts = attemptsOf(data);
  /** 出片统计（原 `BL.jsx:35` 的 `N = F$({data})`）—— 只用 `total` 决定 chip 出不出 */
  const stats = attemptStats(data);
  /** 面板是否真的顶掉视频区（原 `E && k.length` —— **空表不顶**） */
  const histShown = histOpen && attempts.length > 0;

  // ── 自绘播放器（原 `BL.jsx:468-488` 的 `video-controls` / `video-timeline`）──
  /** 加载失败（原 `f`/`p`，`:20`）—— 失败时**换成兜底**，并把播放条一起收掉 */
  const [loadFailed, setLoadFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  /** 当前播放位置（秒，原 `oe`） */
  const [currentTime, setCurrentTime] = useState(0);
  /** 视频总时长（秒，原 `Ie`）—— `onLoadedMetadata` 时量得 */
  const [duration, setDuration] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  /** 进度百分比（原 `zt`；纯层 `timelinePercent`，与 `gv-tl` **同一份公式**） */
  const percent = timelinePercent(currentTime, duration);

  /** 播放 / 暂停（原 `wt`，`:224-236`）—— ⚠️ `play()` 被拦（自动播放策略）⇒ **静默**（源也 `.catch(()=>{})`） */
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => setPlaying(true))
        .catch(() => undefined);
      return;
    }
    el.pause();
    setPlaying(false);
  }, []);

  /**
   * 按 `clientX` 的比例定位（原 `At`，`:237-254`）
   *
   * ⚠️ 源是 `try { currentTime = t } catch {}`（**静默吞**）；本仓按「失败可见」改为
   *    **先判可寻址**：没有可寻址区间（未就绪 / 流式）就**不动**，不做无声的假成功。
   */
  const seekTo = useCallback((clientX: number) => {
    const el = videoRef.current;
    const bar = timelineRef.current;
    if (!el || !bar || !el.duration) return;
    const rect = bar.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const target = seekSeconds(ratio, el.duration, 0);
    if (!Number.isFinite(target)) return;
    if (el.seekable.length === 0) return;
    el.currentTime = target;
    setCurrentTime(target);
  }, []);

  /**
   * 「复制配方」（原 437-439 的 `ut`）—— 复制的是 `dR` 的多行详情
   *
   * ★ **必须走端口**（`hostOps` 控制器），不得直调 `navigator.clipboard`：
   *   ① `ui` 的宿主能力一律经端口；② 剪贴板必须 **`clear()` → `writeText()` → `await`**，
   *      该保证**只在端口实现里**（`host.port.ts:74`「实现内部必须…」）⇒ 直调浏览器 API 会漏掉 `clear()`（旧内容残留）；
   *   ③ `ui` 不得直持 `Ports`（TD-16-8 母体）。
   * ⚠️ 换成端口后失败**不再是抛异常**而是 `Result` ⇒ 必须**判 `r.ok`**（否则失败分支变成死代码）。
   * ⚠️ 失败**原文透传**（原则 6）—— 不再只给一句泛化文案。
   */
  const copyRecipe = useCallback(async () => {
    if (!recipe) return;
    const r = await hostOps.copyText(recipeDetailLines(recipe));
    if (r.ok) {
      pushToast(ANALYZE_UI_TEXT.copied);
      return;
    }
    pushToast(`${ANALYZE_UI_TEXT.copyFailed}：${r.message}`, undefined, 'error');
  }, [recipe, pushToast, hostOps]);

  return (
    <NodeShell
      type="video"
      title={
        /*
         * 改名收口到 `NodeTitle`（原 86-105 的进入/提交两态）。
         * ⚠️ 与源一致：**不 `trim` 就不写**、**同名也不写** ⇒ `defaultTitle` 传当前 `label`，
         *    使"清空后提交"回落到当前名（不误改名）。
         */
        <NodeTitle
          label={label}
          defaultTitle={label}
          onRename={(next) => {
            if (next && next !== label) patchNodeData(id, { label: next });
          }}
        />
      }
      meta={
        <>
          {data.accountName && <span className={styles.videoMeta}>{data.accountName}</span>}
          {data.duration != null && <span className={styles.videoMeta}>{formatClock(data.duration)}</span>}
          {data.width != null && data.height != null && (
            <span className={styles.videoMeta}>
              {data.width}×{data.height}
            </span>
          )}
        </>
      }
      selected={selected}
      minWidth={200}
      minHeight={170}
      testId="video-node"
    >

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
            onClick={() => {
              setPanelOpen((v) => !v);
              // ★ 与出片记录互斥（原 `BL.jsx:339` 的 `P(false)`）
              setHistOpen(false);
            }}
          >
            {VIDEO_NODE_TEXT.recipeChip(recipeSummaryLine(recipe))}
          </button>
        ) : (
          <span className={styles.videoNoRecipe} title={VIDEO_NODE_TEXT.noRecipeTitle}>
            {VIDEO_NODE_TEXT.noRecipeText}
          </span>
        )}
        {/* 出片记录 chip（原 346-354）—— ⚠️ **只在 `total > 1` 时**渲染；内文是 `×N` */}
        {stats.total > 1 && (
          <button
            type="button"
            className={styles.videoChip}
            title={VIDEO_NODE_TEXT.historyChipTitle(stats.total)}
            onClick={(e) => {
              e.stopPropagation();
              setHistOpen((v) => !v);
              // ★ 与生成配方互斥（原 `BL.jsx:351` 的 `S(false)`）
              setPanelOpen(false);
            }}
          >
            {VIDEO_NODE_TEXT.historyChip(stats.total)}
          </button>
        )}
        {/* 「拉取结果」（原 `BL.jsx:355-382` 的 `vn-pull-chip`）
            ⚠️ 显示判据**照源 `z$`**（无 `url` + 最后一条尝试有 `vid` / `conversationId`）；
               本工程只落了「按 vid」那条路 ⇒ **只有 `vid` 时可用**，只剩 `conversationId` 时
               **禁用**（判据 B4：不渲染"点了没反应"的按钮）。 */}
        {pullTarget && (
          <button
            type="button"
            className={styles.videoChip}
            disabled={pulling || !pullTarget.vid}
            title={VIDEO_NODE_TEXT.pullTitle}
            onClick={(e) => {
              e.stopPropagation();
              setPulling(true);
              void pullResult
                .pull(id)
                .then((r) => {
                  if (r.ok) {
                    pushToast(VIDEO_NODE_TEXT.pulled);
                    return;
                  }
                  // ⚠️ 失败**原文透传**（原则 6）—— 不在这里造"拉取失败"这类泛化文案
                  pushToast(r.message, undefined, 'error');
                })
                .finally(() => setPulling(false));
            }}
          >
            {pulling ? VIDEO_NODE_TEXT.pulling : VIDEO_NODE_TEXT.pull}
          </button>
        )}
      </div>

      <div className={styles.videoBody}>
        {data.url && !loadFailed && !panelOpen && !histShown ? (
          <video
            ref={videoRef}
            className={styles.videoEl}
            src={data.url}
            poster={data.poster || undefined}
            /* ⚠️ **不用原生 `controls`**（源 `BL.jsx:386` 也没有）—— 本节点自绘播放条（见文件下方） */
            preload="metadata"
            playsInline
            onLoadedMetadata={(e) => {
              // 原 `ct` 的「量时长」半边（`:185` 的 `De(it.duration || 0)`）
              const d = e.currentTarget.duration;
              setDuration(Number.isFinite(d) && d > 0 ? d : 0);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => setPlaying(false)}
            // 原 `p(true)`：加载失败 ⇒ 换成兜底（并把播放条一起收掉）
            onError={() => setLoadFailed(true)}
          />
        ) : data.url && panelOpen ? (
          /* 原 403-442：配方面板（占住视频区） */
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
        ) : histShown ? (
          /* 原 443-465：出片记录面板（占住视频区；与配方面板互斥，见两个 chip） */
          <div className={`${styles.videoPanel} nodrag nopan nowheel`} onPointerDown={(e) => e.stopPropagation()}>
            <div className={styles.videoPanelHead}>
              <span>{VIDEO_NODE_TEXT.historyTitle(attempts.length)}</span>
              <button
                type="button"
                className={styles.videoPanelClose}
                onClick={(e) => {
                  e.stopPropagation();
                  setHistOpen(false);
                }}
              >
                {VIDEO_NODE_TEXT.panelClose}
              </button>
            </div>
            <div className={styles.videoPanelBody}>
              {/* ⚠️ 源 `k.slice().reverse()` —— **新记录在最上**（原 456） */}
              {[...attempts].reverse().map((item, i) => {
                const a = (item ?? {}) as Record<string, unknown>;
                const status = typeof a.status === 'string' ? a.status : '';
                const at = typeof a.at === 'number' ? a.at : 0;
                const account =
                  typeof a.accountName === 'string' && a.accountName
                    ? a.accountName
                    : VIDEO_NODE_TEXT.attemptAccountFallback;
                const note = typeof a.note === 'string' ? a.note : '';
                // key 用 attempt id（源 `key={Be.id}`）；老数据可能没有 ⇒ 回落下标
                const key = typeof a.id === 'string' && a.id ? a.id : `idx-${i}`;
                const statusClass = ATTEMPT_STATUS_CLASS[status];
                return (
                  <div
                    className={`${styles.videoAttempt}${statusClass ? ` ${statusClass}` : ''}`}
                    key={key}
                  >
                    <span className={styles.videoAttemptTime}>{formatMonthDayMinute(at)}</span>
                    <span className={styles.videoAttemptAcc}>{account}</span>
                    <span className={styles.videoAttemptStatus}>{attemptStatusLabel(status)}</span>
                    {note ? <span className={styles.videoAttemptNote}>{note}</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={styles.videoFallback}>
            <div>{VIDEO_NODE_TEXT.loadFailed}</div>
            {data.vid && <div className={styles.videoVid}>{data.vid}</div>}
          </div>
        )}
      </div>

      {/* 自绘播放条（原 `BL.jsx:468-488`）
          ⚠️ 渲染条件本仓收紧为「视频**真的在放**」—— 源那边面板与 `<video>` 是**同层并列**（`:385-466`），
             所以源在面板开着时**仍显示播放条**（对着一个被挡住的视频）；本仓的面板是"顶掉"视频
             ⇒ 不显示（**有意差异**，登记 `TD-03-13`）。 */}
      {data.url && !loadFailed && !panelOpen && !histShown && (
        <div
          className={`${styles.videoControls} nodrag nopan nowheel`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.vtBtn}
            onClick={togglePlay}
            title={playing ? MEDIA_PLAYER_TEXT.pause : MEDIA_PLAYER_TEXT.play}
          >
            {playing ? MEDIA_PLAYER_TEXT.pauseGlyph : MEDIA_PLAYER_TEXT.playGlyph}
          </button>
          <div
            ref={timelineRef}
            className={styles.videoTimeline}
            title={MEDIA_PLAYER_TEXT.timelineTitle}
            onPointerDown={(e) => {
              // ⚠️ 源用 `window` 上的 `pointermove`/`pointerup`（`:259-268`）；本仓用**指针捕获**
              //   （与 `gv-tl` 同法 —— 判据 C1：同为"拖时间线"，不写第二套监听）
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              seekTo(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              seekTo(e.clientX);
            }}
          >
            <div className={styles.vtFill} style={{ width: `${percent}%` }} />
            <div className={styles.vtKnob} style={{ left: `${percent}%` }} />
          </div>
          <span className={styles.vtTime}>
            {formatClock(currentTime)} / {formatClock(duration || data.duration || 0)}
          </span>
          {/*
            ★ 截图（原 `BL.jsx:535-537` 的 `.vt-btn.vt-shot`）—— 在**播放条里**、时间文字之后。
            ⚠️ **2026-10-12 归位**：此前它在**节点头部右槽**（源里那一槽没有这颗钮）。
            ⚠️ 失败**必须说出来**（源版静默返回 null，用户会反复点）⇒ toast。
          */}
          <button
            type="button"
            className={`${styles.vtBtn} ${styles.vtShot}`}
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
            {capturing ? VIDEO_NODE_TEXT.captureBusyGlyph : VIDEO_NODE_TEXT.captureGlyph}
          </button>
        </div>
      )}
    </NodeShell>
  );
}
