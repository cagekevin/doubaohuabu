/**
 * 文生视频节点（`type: 'genvideo'`）—— 对应原 `YL.jsx`
 * 依据：`docs/12` §1.7（源结构树）+ `docs/13` §1.7（缺口登记）
 *
 * ★ **2026-10-11**：
 *   · 补 `gv-stage` + `gv-waiting` + `gv-preview-empty` + `gv-media-fallback`（原 485-530）；
 *   · **修正 `gv-meta` 第 2 项** —— 原误用 `data.aspectRatio`，源实为 `y` = **执行账号标签**
 *     （`core/rules/genVideo.nodeAccountLabel`，逐字对源 62-109）；顺带 `duration` 补默认 `5`（原 `w`）。
 *   · ★ **本刀（1）**：补 **自绘播放控件** —— `gv-play`（播放/暂停）+ `gv-dur-badge`（真实时长徽标）+
 *     `gv-tl`（可拖动时间线），并**去掉 `<video>` 的原生 `controls`**（原 502-555）；
 *     同时把 `gv-meta` 从 `NodeShell` 头部右槽**改回源的位置**（`gv-stage` 之后的**底部独立行**，
 *     原 557-560）—— 头部右槽留给源的 `gv-head-grow` / `gv-hist-btn`。
 *   · ★ **本刀（2）**：补 **`gv-dl` 下载**（原 349-400,513-524）—— 走 `hostOps.downloadFileAs`
 *     （「另存为」）+ 成功 toast 带 **「在文件夹中显示」操作按钮**（`hostOps.revealPath`）。
 *     该操作按钮**顺带接通**了 toast 的 `action` 机制（`state/slices/ui` + `ToastHost`，
 *     原 `_Component42.jsx:1474-1488` 的 `.app-toast-action`）—— `docs/13` §3 的那条缺口。
 *   · ★ **本刀（3）**：补 **`gv-apijob` API 任务状态条**（原 561-563）—— 纯层 `apiJobLabel`
 *     （六态文案 + `progress`/`error` 分支，`null` = 不渲染）；数据来自 `applyApiJobEvent` 的
 *     `nodePatch`（`state/subscriptions` 唯一写入点）。
 *   · ★ **本刀（4）**：补 **`gv-frame-btn`×3 三帧→画布参考图**（原 206-348,564-584）——
 *     纯层 `frameTargetRatio`/`frameSeekSeconds`/`frameCrop`/`framePlacement`（裁切与落点数学，
 *     + 单测）；离屏 `<video>` seek → canvas 裁切 → `toDataURL` → 建 `material` + 连边 + 提示。
 *   · ★ **本刀（5）**：补 **`gv-hist-btn` + `gv-hist-pop` 历史版本**（原 401-470,479-483,585-620）——
 *     纯层 `currentVersionIndex`/`selectVersionPatch`/`setVersionPosterPatch`/`versionItemView`
 *     （+ 单测）；`state` 加 `selectVersion`/`setGenvideoVersionPoster` 两个 action；
 *     弹层走 `createPortal` 到 `document.body`，打开时给缺海报的历次出片**懒生成**（`lib/videoPoster.ts`）。
 *     ⇒ **`YL.jsx` 的全部功能块至此落齐**（原 TD-16-79 可结）。
 *
 * ⚠️ 「生成中」在本仓 = **`data.generating`**（`state/generate.ts` 写入；`GenImageNode` 已用）。
 *    源 `genvideo` 用的是 `apiJob`/`_pendingAttempt` 推导的 `m`（`YL.jsx:43-58`，含 **30 分钟窗口**），
 *    而 `apiJob` 在本仓**未 patch 到节点**、`_pendingAttempt(s)` **无生产者**（启动即清）
 *    ⇒ 照搬 `m` 会得到**恒假**的假功能。取舍已登记 —— **TD-16-81**
 *    （源 `imggen` 的 `gv-waiting` 用的恰是 `data.generating`，见 `docs/12` §1.8 —— 本仓两节点统一到它）。
 *
 * ⚠️ `gv-waiting` **后两态**（`p` = `nodeNotices[id].code === 'generation-confirm'`）**无数据源** —— TD-16-81。
 * ⚠️ 已知差异（均已登记）：`gv-play.is-playing`/`gv-dur-real`/`gv-apijob-<status>` 状态类未输出（**TD-16-87**）·
 *    历史版本弹层样式无源 CSS（**TD-16-92**）· 三帧新素材节点用默认尺寸（**TD-16-91**）·
 *    `gv-waiting` 四态只落两态（**TD-16-81**）。
 * ⚠️ 源的 `<video>` 带 `crossOrigin="anonymous"`（供三帧取帧的 canvas 不污染）—— 本刀**照抄**（同一后端）。
 * ⚠️ 源另有两个**状态类**（`gv-play.is-playing` / `gv-dur-real`）**未输出**（mockup 无样式）—— **TD-16-87**。
 * ⚠️ `_pendingAttempt` / `_pendingAttempts` / 未完成 `apiJob` 由**启动归位清理**
 *    （`stable/migrations/resetStaleJobs`）—— 重启即放弃，docs/06 视角 4。
 *
 * 外壳统一走 `NodeShell`（判据 C1）
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useHostOps, useStore } from '@/state';
import { COMMON_TEXT, GEN_VIDEO_TEXT, MEDIA_PLAYER_TEXT } from '@/constants/text';
import { countInputs } from '@/core/rules/linkedMaterials';
import { isCardClick } from '@/core/rules/cardClick';
import {
  apiJobLabel,
  durationText,
  frameCrop,
  framePlacement,
  frameSeekSeconds,
  genVideoDownloadName,
  hasRealDuration,
  hasResult,
  nodeAccountLabel,
  seekSeconds,
  stageRatio,
  timelinePercent,
  type FrameKind,
} from '@/core/rules/genVideo';
import { normalizeModelLabel } from '@/core/rules/prompt';
import { currentVersionIndex, versionItemView } from '@/core/rules/genHistory';
import { toMessage } from '@/core/model/result';
import { log } from '@/lib/log';
import { asRecord } from '@/lib/object';
import { formatMonthDayMinute } from '@/lib/time';
import { createCanvas } from '@/lib/image';
import { clamp } from '@/lib/math';
import { generateVideoPoster } from '@/lib/videoPoster';
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
  const pushToast = useStore((s) => s.pushToast);
  const openGeneratePanel = useStore((s) => s.openGeneratePanel);
  const addNode = useStore((s) => s.addNode);
  const connect = useStore((s) => s.connect);
  // ★ 宿主能力走控制器（`ui` 不持 `Ports` —— TD-16-8）
  const hostOps = useHostOps();
  /** 卡片按下起点（原 `b`，`YL.jsx:112-118`）—— 供「点击 vs 拖动」判定 */
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  /** `gv-meta` 首项：已连接 N 个输入（原 `u.length`，`YL.jsx:558`） */
  const inputCount = useMemo(() => countInputs(nodes, edges, id), [nodes, edges, id]);

  /**
   * `gv-meta` 第 2 项（原 `y`）：**执行账号标签**（原 62-109）
   * ⚠️ 依赖 `accounts`/`groups`（显式账号名与分组名要从 store 里查）
   */
  const accountLabel = nodeAccountLabel({ sendAccount: data.sendAccount, accounts, groups });

  /** 有结果（原 `h` = `!!resultUrl || !!resultPoster`） */
  const produced = hasResult(data);
  /** 生成中（原 `m` 在本仓的等价物；见文件头 ⚠️） */
  const generating = !!data.generating;
  /** 计划时长（原 `w = d.duration || 5`） */
  const plannedDuration = data.duration || 5;
  /** 海报缩略图（原 `Xt(d.resultPoster, 480)`） */
  const poster = data.resultPoster
    ? withThumb(data.resultPoster, GEN_VIDEO_TEXT.posterThumbWidth)
    : undefined;

  // ── 自绘播放控件（原 `YL.jsx:112-205,502-555`）────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  /** 播放中（原 `C`，由 `onPlay`/`onPause` 驱动） */
  const [playing, setPlaying] = useState(false);
  /** `<video>` 元数据读到的**真实时长**（原 `z`） */
  const [realDuration, setRealDuration] = useState(0);
  /** 当前播放位置（原 `F`） */
  const [currentTime, setCurrentTime] = useState(0);
  /** 时间线拖动中（原 `U`）—— 只有按下期间才响应 `pointermove` */
  const draggingRef = useRef(false);

  /** 有真实时长（原 `A`）—— 决定 `gv-dur-badge` 是否出现 */
  const realDur = hasRealDuration(produced, realDuration);
  /** 时长文案（原 `D`） */
  const durationLabel = durationText(produced, realDuration, plannedDuration);
  /** 时间线进度百分比（原 `X`） */
  const percent = timelinePercent(currentTime, realDuration);
  /** `gv-apijob` 状态条文案（原 561-563）—— `null` = 不渲染 */
  const apiJobText = apiJobLabel(data.apiJob);
  /** `apiJob.status`（原 562 的 `d.apiJob.status`）—— 供 `gv-apijob-<status>` 状态类 */
  const apiJobStatus = (() => {
    const s = asRecord(data.apiJob).status;
    return typeof s === 'string' ? s : '';
  })();

  // ── 历史版本（`gv-hist-btn` / `gv-hist-pop`，原 `YL.jsx:401-470,479-483,585-620`）──
  const selectVersion = useStore((s) => s.selectVersion);
  const setGenvideoVersionPoster = useStore((s) => s.setGenvideoVersionPoster);
  /** ⚠️ `useMemo`：`?? []` 会在 `genHistory` 缺失时**每次渲染造新数组** ⇒ effect 依赖会抖 */
  const attempts = useMemo(() => data.genHistory?.attempts ?? [], [data.genHistory]);
  /** 当前版本下标（原 `pe`） */
  const curVer = currentVersionIndex(asRecord(data));
  const [histOpen, setHistOpen] = useState(false);
  const [histPos, setHistPos] = useState<{ left: number; top: number } | null>(null);
  const histBtnRef = useRef<HTMLButtonElement>(null);
  const histPopRef = useRef<HTMLDivElement>(null);
  /** 已发起过海报生成的 attempt url（原 `le` 的 `Set`）—— 避免重复发起 */
  const posterTriedRef = useRef<Set<string>>(new Set());

  /** 开合弹层（原 `De`，`YL.jsx:407-422`） */
  const toggleHistory = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (histOpen) {
      setHistOpen(false);
      return;
    }
    const rect = histBtnRef.current?.getBoundingClientRect();
    if (rect) {
      // 原：`left = max(8, min(rect.left, innerWidth - 264 - 8))`；`top = rect.bottom + 8`
      setHistPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 264 - 8)),
        top: rect.bottom + 8,
      });
    }
    setHistOpen(true);
  };

  /** 弹层开着时：点外面关掉（原 `YL.jsx:423-438`） */
  useEffect(() => {
    if (!histOpen) return;
    const onDown = (e: MouseEvent) => {
      const inBtn = histBtnRef.current?.contains(e.target as Node);
      const inPop = histPopRef.current?.contains(e.target as Node);
      if (!inBtn && !inPop) setHistOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [histOpen]);

  /** 弹层开着时：给「有 `url` 但没海报」的尝试**懒生成**海报（原 `YL.jsx:439-459`） */
  useEffect(() => {
    if (!histOpen) return;
    for (const item of attempts) {
      const a = asRecord(item);
      const url = typeof a.url === 'string' ? a.url : '';
      if (!url || a.poster || posterTriedRef.current.has(url)) continue;
      posterTriedRef.current.add(url);
      void generateVideoPoster(url).then((poster) => {
        if (poster && typeof a.id === 'string') setGenvideoVersionPoster(id, a.id, poster);
      });
    }
  }, [histOpen, attempts, id, setGenvideoVersionPoster]);

  /**
   * 播放 / 暂停（原 `E`，`YL.jsx:128-157`）
   *
   * ⚠️ 源在自动播放被策略拦截时**静音重试**（`play()` 抛 ⇒ 置 `muted` 再 `play()` ⇒ 恢复音量）。
   * ⚠️ 源两处 `catch {}` 吞错；本实现**就地留痕**（`log.warn`，读者 = 开发者，原则 6）。
   */
  const togglePlay = useCallback(async (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) {
      log.warn('[GenVideoNode] 播放按钮点击时 videoRef 为 null');
      return;
    }
    if (v.error) {
      log.warn('[GenVideoNode] 视频加载失败 code=', v.error.code, 'message=', v.error.message);
    }
    if (v.paused) {
      try {
        // 源：元数据未就绪（`readyState < 2`）时先 `load()`，否则 `play()` 会被拒
        if (v.readyState < 2) v.load();
        await v.play();
      } catch (err) {
        log.warn(
          '[GenVideoNode] play() 失败:',
          err instanceof Error ? err.name : undefined,
          err instanceof Error ? err.message : undefined,
        );
        if (!v.muted) {
          try {
            v.muted = true;
            await v.play();
            v.muted = false;
          } catch (retryErr) {
            log.warn('[GenVideoNode] 静音重试仍失败:', retryErr);
          }
        }
      }
    } else {
      v.pause();
    }
  }, []);

  /** 元数据就绪（原 `_`，`YL.jsx:176-181`）：记真实时长 + 当前时间 */
  const onLoadedMetadata = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    setRealDuration(Number.isFinite(v.duration) ? v.duration : 0);
    setCurrentTime(v.currentTime || 0);
  }, []);

  /** 播放进度（原 `H`，`YL.jsx:182-184`） */
  const onTimeUpdate = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime || 0);
  }, []);

  /** 加载错误（原 `I`，`YL.jsx:164-169`）—— 源只 `console.warn`（就地留痕） */
  const onVideoError = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    log.warn('[GenVideoNode] 视频加载错误 src=', v.src, 'code=', v.error?.code, 'msg=', v.error?.message);
  }, []);

  /**
   * 拖动时间线定位（原 `J`，`YL.jsx:185-205`）
   *
   * ⚠️ 源的 `currentTarget` 是 **`.gv-tl` 容器**（不是 track）⇒ 比值按容器的 `getBoundingClientRect` 算
   *    （含左右 padding，逐字保留）。
   */
  const seekFromPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const v = videoRef.current;
      const track = e.currentTarget;
      if (!v || !track) return;
      const rect = track.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const seconds = seekSeconds(ratio, v.duration, realDuration);
      if (!seconds) return;
      try {
        v.currentTime = seconds;
      } catch {
        // catch-ok: 媒体未就绪时定位会抛（源同此吞掉；下一帧 onTimeUpdate 会纠正）
      }
      setCurrentTime(seconds);
    },
    [realDuration],
  );

  /**
   * 下载结果（原 `ke`，`YL.jsx:349-400`）
   *
   * 源的三段回落（`downloadFileAs` → `downloadFile` → `<a download>`）在本工程**塌成一段**：
   *   `window.api` 的存在性判断在源里是因为**老后端可能没有该方法**，而本仓走 `FilePort`
   *   —— 端口**恒存在**（实现里再做宿主缺失判定）⇒ 后两段**结构上不可达**，不落（不写死代码）。
   * ⚠️ 源的 `try/catch` 兜的是「`window.api` 调用抛异常」；本仓端口**恒返回 `Result`、不抛**
   *   ⇒ 无 `catch` 可写（失败走 `!r.ok` 分支，原文透传，原则 6）。
   */
  const download = useCallback(async () => {
    const isVideo = !!data.resultUrl;
    const url = data.resultUrl || data.resultPoster;
    if (!url) return;
    const ext = isVideo ? 'mp4' : 'png';
    const name = genVideoDownloadName(data.label, ext, Date.now());
    const filters = [
      {
        name: isVideo ? GEN_VIDEO_TEXT.videoFilter : COMMON_TEXT.imageFilter,
        extensions: [ext],
      },
    ];
    const r = await hostOps.downloadFileAs(url, name, filters);
    if (!r.ok) {
      // 原 370/377/398：`'下载失败：' + (error || '未知错误')` —— 空原因回落 `未知错误`
      pushToast(COMMON_TEXT.downloadFailed(r.message || COMMON_TEXT.unknownReason), 5000, 'warn');
      return;
    }
    // 用户主动取消 ⇒ 静默返回（原 366：`if (Je && Je.canceled) return;`）
    if (r.value.canceled) return;
    const path = r.value.path || '';
    pushToast(
      COMMON_TEXT.downloadedTo(path || name),
      9000,
      'success',
      // 原 391-396：有落盘路径才给「在文件夹中显示」（`Qe && ze.revealPath`）
      path ? { label: COMMON_TEXT.revealInFolder, onClick: () => void hostOps.revealPath(path) } : undefined,
    );
  }, [data.resultUrl, data.resultPoster, data.label, hostOps, pushToast]);

  /**
   * 取三帧之一 → 画布参考图（原 `se`，`YL.jsx:206-348`）
   *
   * 源：新建一个**离屏 `<video>`** → seek 到目标时刻 → 等 `seeked` → 按目标比例**居中裁切**画到
   *   canvas → `toDataURL('image/jpeg', 0.92)` → 建 `material` 节点 + 连一条边 + 提示。
   * ⚠️ 源三处 `catch`（`load()` / `currentTime` / `drawImage`）都吞错 ⇒ 本实现统一收口到最外层
   *   `try/catch` **原文透传**（原则 6），不再逐处吞。
   * ⚠️ 离屏 `<video>` 必须 `crossOrigin='anonymous'`，否则 canvas 被污染、`toDataURL` 抛（源同法）。
   * ⚠️ 新节点**用默认尺寸**（源按 `me` 设尺寸；本仓 `addNode` 不接受节点级尺寸 —— 观感差异一处）—— **TD-16-91**。
   */
  const extractFrame = useCallback(
    async (kind: FrameKind) => {
      const label = GEN_VIDEO_TEXT.frameLabels[kind] || GEN_VIDEO_TEXT.frameFallbackLabel;
      const host = videoRef.current;
      const hostTotal =
        host && Number.isFinite(host.duration) && host.duration > 0 ? host.duration : realDuration;
      const seekTo = frameSeekSeconds(kind, host?.currentTime ?? 0, host?.duration ?? 0, realDuration);
      let el: HTMLVideoElement | null = null;
      try {
        const src = host?.currentSrc || host?.src || data.resultUrl;
        if (!src) throw new Error(GEN_VIDEO_TEXT.frameNoUrl);
        const video = document.createElement('video');
        el = video;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(
            () => reject(new Error(GEN_VIDEO_TEXT.frameTimeout)),
            GEN_VIDEO_TEXT.frameTimeoutMs,
          );
          const done = () => window.clearTimeout(timer);
          video.addEventListener(
            'loadedmetadata',
            () => {
              try {
                // 原：`Y = 有限且 >0 ? ze.duration : je`；`de = min(Ve, max(0, Y - 0.05))`
                const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : hostTotal;
                video.currentTime = clamp(seekTo, 0, Math.max(0, total - 0.05));
              } catch (err) {
                done();
                reject(err);
              }
            },
            { once: true },
          );
          video.addEventListener('seeked', () => { done(); resolve(); }, { once: true });
          video.addEventListener('error', () => { done(); reject(new Error(GEN_VIDEO_TEXT.frameLoadFailed)); }, { once: true });
          video.src = src;
          video.load();
        });
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) throw new Error(GEN_VIDEO_TEXT.frameNoSize);
        const crop = frameCrop(vw, vh, data.aspectRatio);
        const canvas = createCanvas(crop.outW, crop.outH);
        canvas
          .getContext('2d')
          ?.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.outW, crop.outH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const sourceNode = nodes.find((n) => n.id === id);
        const neighborCount = edges.filter(
          (e) => e.source === id && nodes.find((n) => n.id === e.target)?.type === 'material',
        ).length;
        const place = framePlacement(sourceNode, neighborCount, data.aspectRatio);
        const newId = addNode('material', place.position, { name: label, dataUrl });
        if (newId) connect({ source: id, target: newId });
        pushToast(GEN_VIDEO_TEXT.frameToast(label), undefined, 'info');
      } catch (err) {
        pushToast(GEN_VIDEO_TEXT.frameFailed(toMessage(err) || COMMON_TEXT.unknownReason), undefined, 'warn');
      } finally {
        if (el) {
          try {
            el.removeAttribute('src');
            el.load();
          } catch {
            // catch-ok: 释放离屏 video 属 best-effort（源同此吞掉）
          }
        }
      }
    },
    [data.resultUrl, data.aspectRatio, realDuration, nodes, edges, id, addNode, connect, pushToast],
  );

  return (
    // ⚠️ 用 Fragment 包住：弹层走 `createPortal` 到 `document.body`（源 `YL.jsx:585` 同法）
    <>
      <NodeShell
      title={GEN_VIDEO_TEXT.title}
      selected={selected}
      // 有框外浮层（分析按钮 / 提示词浮层）⇒ 不能被 `.node` 的 overflow 裁掉
      overflowVisible
      // `gv-hist-btn`（原 479-483）：有历史才显示，位于头部**最右**（`gv-head-grow` 之后）
      meta={
        attempts.length > 0 ? (
          <button
            ref={histBtnRef}
            type="button"
            className={`${styles.gvHistBtn} nodrag${histOpen ? ` ${styles.gvHistBtnOpen}` : ''}`}
            title={GEN_VIDEO_TEXT.histBtnTitle}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggleHistory}
          >
            {GEN_VIDEO_TEXT.histBtn(attempts.length)}
          </button>
        ) : undefined
      }
      cardTitle={GEN_VIDEO_TEXT.cardTitle}
      // 整卡点击 → 打开生成面板（原 `x` 记起点 + `k` 判「点击 vs 拖动」）
      onPointerDown={(e) => {
        pressRef.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        const start = pressRef.current;
        pressRef.current = null;
        if (isCardClick(start, { x: e.clientX, y: e.clientY })) openGeneratePanel(id);
      }}
    >
      <div className={styles.text}>{data.text || COMMON_TEXT.emptyPrompt}</div>
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
              ref={videoRef}
              className={styles.thumb}
              src={data.resultUrl}
              poster={poster}
              playsInline
              preload="metadata"
              crossOrigin="anonymous"
              draggable={false}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onError={onVideoError}
              key={data.resultUrl || 'video'}
            />
          ) : poster ? (
            <img
              className={styles.thumb}
              src={poster}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              key={data.resultPoster || 'poster'}
            />
          ) : (
            <div className={styles.gvMediaFallback}>{GEN_VIDEO_TEXT.mediaFallback}</div>
          )
        ) : (
          <div className={styles.gvPreviewEmpty}>
            <div className={styles.gvPreviewTitle}>{GEN_VIDEO_TEXT.stageEmptyTitle}</div>
            <div className={styles.gvPreviewSub}>{GEN_VIDEO_TEXT.stageEmptySub}</div>
          </div>
        )}
        {/* `gv-play`（原 502-509）：正中播放 / 暂停（键盘 Enter / Space 同效） */}
        {produced && data.resultUrl ? (
          <span
            className={`${styles.gvPlay}${playing ? ` ${styles.gvPlayPlaying}` : ''}`}
            role="button"
            tabIndex={0}
            aria-label={playing ? MEDIA_PLAYER_TEXT.pause : MEDIA_PLAYER_TEXT.play}
            onClick={(e) => void togglePlay(e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void togglePlay(e);
              }
            }}
          >
            {playing ? MEDIA_PLAYER_TEXT.pauseGlyph : MEDIA_PLAYER_TEXT.playGlyph}
          </span>
        ) : null}
        {/* `gv-dur-badge`（原 510-512）：真实时长徽标（只有拿到真实时长才出现） */}
        {produced && data.resultUrl && realDur ? (
          <span
            className={`${styles.gvDurBadge}${realDur ? ` ${styles.gvDurReal}` : ''}`}
            aria-label={GEN_VIDEO_TEXT.durBadgeAria(durationLabel)}
          >
            {durationLabel}s
          </span>
        ) : null}
        {/* `gv-dl`（原 513-524）：下载结果（有结果即可，不要求 `resultUrl` —— 图片结果也能下） */}
        {produced ? (
          <button
            type="button"
            className={`${styles.gvDl} nodrag`}
            title={GEN_VIDEO_TEXT.download}
            aria-label={GEN_VIDEO_TEXT.download}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void download();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12" />
              <path d="m7 11 5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
          </button>
        ) : null}
        {/* `gv-tl`（原 525-555）：可拖动时间线 */}
        {produced && data.resultUrl ? (
          <div
            className={`${styles.gvTl} nodrag`}
            onPointerDown={(e) => {
              e.stopPropagation();
              draggingRef.current = true;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // catch-ok: 指针捕获失败不影响后续 move/up（源同此吞掉）
              }
              seekFromPointer(e);
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) seekFromPointer(e);
            }}
            onPointerUp={(e) => {
              draggingRef.current = false;
              e.stopPropagation();
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.gvTlTrack}>
              <div className={styles.gvTlFill} style={{ width: `${percent}%` }} />
              <span className={styles.gvTlKnob} style={{ left: `${percent}%` }} />
            </div>
          </div>
        ) : null}
      </div>
      {/* `gv-meta`（原 557-560）：★ 源在**卡片底部独立行**（不是头部右槽） */}
      <div className={styles.gvMeta}>
        {GEN_VIDEO_TEXT.metaInputs(inputCount)}
        {GEN_VIDEO_TEXT.metaSep}
        {accountLabel}
        {GEN_VIDEO_TEXT.metaSep}
        {normalizeModelLabel(data.model)}
        {GEN_VIDEO_TEXT.metaSep}
        <span className={styles.gvDur}>{durationLabel}s</span>
      </div>
      {/* `gv-apijob`（原 561-563）：API 通道任务状态条 —— 位于 `gv-meta` 之后、三帧按钮之前 */}
      {apiJobText !== null ? (
        <div
          className={`${styles.gvApijob}${apiJobStatus === 'failed' ? ` ${styles.gvApijobFailed}` : apiJobStatus === 'cancelled' ? ` ${styles.gvApijobCancelled}` : ''}`}
          title={GEN_VIDEO_TEXT.apiJobTitle}
        >
          {apiJobText}
        </div>
      ) : null}
      {/* `gv-frame-actions`（原 564-584）：三帧 → 画布参考图（源在 `gv-meta` / `gv-apijob` **之后**） */}
      {produced && data.resultUrl ? (
        <div
          className={`${styles.gvFrameActions} nodrag`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className={styles.gvFrameBtn} onClick={() => void extractFrame('head')}>
            {GEN_VIDEO_TEXT.frameHead}
          </button>
          <button type="button" className={styles.gvFrameBtn} onClick={() => void extractFrame('current')}>
            {GEN_VIDEO_TEXT.frameCurrent}
          </button>
          <button type="button" className={styles.gvFrameBtn} onClick={() => void extractFrame('tail')}>
            {GEN_VIDEO_TEXT.frameTail}
          </button>
        </div>
      ) : null}
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
      {/* `gv-hist-pop`（原 585-620）：历史版本弹层（portal 到 body，按按钮位置定位） */}
      {histOpen && attempts.length > 0
        ? createPortal(
            <div
              ref={histPopRef}
              className={styles.gvHistPop}
              style={histPos ?? undefined}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.gvHistTitle}>{GEN_VIDEO_TEXT.histTitle(attempts.length)}</div>
              {attempts.map((item, i) => {
                const a = asRecord(item);
                const view = versionItemView(item);
                const at = typeof a.at === 'number' ? a.at : undefined;
                return (
                  <button
                    type="button"
                    key={typeof a.id === 'string' ? a.id : i}
                    className={`${styles.gvHistItem}${i === curVer ? ` ${styles.gvHistItemSel}` : ''}${view.disabled ? ` ${styles.gvHistItemDisabled}` : ''}`}
                    title={
                      view.disabled
                        ? GEN_VIDEO_TEXT.histItemDisabledTitle
                        : GEN_VIDEO_TEXT.histItemTitle(i + 1)
                    }
                    disabled={view.disabled}
                    onClick={() => {
                      selectVersion(id, i);
                      setHistOpen(false);
                    }}
                  >
                    {view.poster ? (
                      <img
                        className={styles.gvHistThumb}
                        src={withThumb(view.poster, GEN_VIDEO_TEXT.histThumbWidth)}
                        alt=""
                      />
                    ) : (
                      <span
                        className={`${styles.gvHistThumb}${view.disabled ? ` ${styles.gvHistThumbEmpty}` : ''}`}
                      >
                        {view.disabled ? GEN_VIDEO_TEXT.histNoVideo : GEN_VIDEO_TEXT.histPlayGlyph}
                      </span>
                    )}
                    <span className={styles.gvHistMeta}>
                      <span className={styles.gvHistRow}>{`#${i + 1} · ${formatMonthDayMinute(at)} · ${view.account}`}</span>
                      <span className={styles.gvHistRow}>{`${view.ratio} · ${view.duration}s · ${view.model}`}</span>
                      <span className={styles.gvHistPrompt}>{view.prompt}</span>
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
