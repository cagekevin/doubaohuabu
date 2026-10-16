/**
 * 文生视频节点（`type: 'genvideo'`）—— 对应原 `YL.jsx`
 * 依据：`docs/12` §1.7（源结构树）+ `docs/过程.md` §1.7（缺口登记）
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
 *     原 `_Component42.jsx:1474-1488` 的 `.app-toast-action`）—— `docs/过程.md` §3 的那条缺口。
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
 * ★ **2026-10-13 · `gv-waiting` 四态齐（TD-16-81 结）**：
 *    · **触发 = 源 `m`**（`core/rules/genVideo.genVideoWaiting`）—— `apiJob` running ∨ 待归属尝试 ∧ 30 分钟窗口。
 *      此前本仓用 `data.generating` 布尔（2026-10-11 的临时取舍，理由是"`m` 的输入无生产者"）；
 *      该前提**已不成立**（`apiJob` 经 `applyApiJobEvent.nodePatch` patch 进节点、`_pendingAttempt` 由
 *      `state/pendingAttempt` 写）⇒ 回到源判据。⚠️ 源里 `generating` 只服务 **imggen**（写 `_Component45:740`）。
 *    · **后两态**（`p` = `nodeNotices[id]` 的 `generation-confirm`）—— 生产者 = `state/autoConfirm`。
 * ⚠️ 已知差异（均已登记）：`gv-play.is-playing`/`gv-dur-real`/`gv-apijob-<status>` 状态类未输出（**TD-16-87**）·
 *    历史版本弹层样式无源 CSS（**TD-16-92**）· 三帧新素材节点用默认尺寸（**TD-16-91**）。
 * ⚠️ 源的 `<video>` 带 `crossOrigin="anonymous"`（供三帧取帧的 canvas 不污染）—— 本刀**照抄**（同一后端）。
 * ⚠️ 源另有两个**状态类**（`gv-play.is-playing` / `gv-dur-real`）**未输出**（mockup 无样式）—— **TD-16-87**。
 * ⚠️ `_pendingAttempt` / `_pendingAttempts` / 未完成 `apiJob` 由**启动归位清理**
 *    （`stable/migrations/resetStaleJobs`）—— 重启即放弃，docs/过程.md 视角 4。
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
import { useGen, useStore } from '@/state';
import { HistPop } from './HistPop';
import { StageEmpty, StageHistBtn, StageWaiting } from './stageParts';
import { COMMON_TEXT, GEN_VIDEO_TEXT, MEDIA_PLAYER_TEXT, PROJECT_TEXT } from '@/constants/text';
import { GEN_PANEL_TEXT } from '@/constants/sendPanelText';
import { DEFAULT_VIDEO_DURATION } from '@/constants/models';
import { countInputs } from '@/core/rules/linkedMaterials';
import { isCardClick } from '@/core/rules/cardClick';
import {
  apiJobLabel,
  durationText,
  frameCrop,
  framePlacement,
  frameSeekSeconds,
  genVideoDownloadName,
  genVideoWaiting,
  genVideoWaitingAria,
  genVideoWaitingText,
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
import { generateVideoPoster } from '@/ui/lib/videoPoster';
import { useImagePreview, type LightboxItem } from '@/ui/common/ImageLightbox';

/** 「另存为」过滤器（源 `ke` 的视频支：`'视频文件'`；这一批条目**全是视频** ⇒ 单档即可） */
const VIDEO_DOWNLOAD_FILTER: { name: string; extensions: string[] } = {
  name: GEN_VIDEO_TEXT.videoFilter,
  extensions: ['mp4'],
};
import { withThumb } from '@/stable/protocols/img';
import { NodeShell } from './NodeShell';
import type { RFNodeProps } from './types';
import { useAnchoredLayer } from '@/ui/common/useAnchoredLayer';
import { useOutsideClose } from '@/ui/common/useOutsideClose';
import { parseRefChips } from '@/core/rules/refs';
import { stripHtml } from '@/lib/text';
import { PromptLine, usePromptLookup } from './PromptLine';
import styles from './shared.module.css';

/**
 * `gv-waiting` 的心跳间隔（ms）
 *
 * ⚠️ 只为推进 `m` 的 **30 分钟窗口**（`m` 里唯一随时间翻的条件）—— 比 `TextNode` 的 250ms 倒计时**粗得多**，
 *    因为它不显示秒数、只需在窗口过期时翻一次。
 */
const GEN_VIDEO_WAITING_TICK_MS = 5000;

export function GenVideoNode({ id, data, selected }: RFNodeProps<'genvideo'>) {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const accounts = useStore((s) => s.accounts);
  const groups = useStore((s) => s.groups);
  const pushToast = useStore((s) => s.pushToast);
  const openGeneratePanel = useStore((s) => s.openGeneratePanel);
  const addNode = useStore((s) => s.addNode);
  const connect = useStore((s) => s.connect);
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
  /**
   * 身内**提示词行**（`PromptLine`）的依赖 —— 全部走**既有真源**，不新增状态：
   *   · 生成动作 = `useGen().runForNode(id)`（与浮层 `GenPanel` 里那颗「生成」**同一条路**）
   *   · 提示词字段 = `data.text`（与面板**同一个字段**）
   *   · 芯片查表 = 共享 hook `usePromptLookup`
   */
  const gen = useGen();
  const patchNodeData = useStore((s) => s.patchNodeData);
  const promptSeed = parseRefChips(stripHtml(data.text ?? ''));
  const promptLookup = usePromptLookup(promptSeed.refs);

  // ── `gv-waiting`（原 `m` + `p`，`YL.jsx:43-67,488-497`）────────────────────────
  /**
   * `p`（原 33-41）：`nodeNotices[id]` 里 **`code === 'generation-confirm'`** 的那条，否则 `null`。
   * 生产者 = `state/autoConfirm`（后台要求二次确认时挂的 warn / info 通知）。
   */
  const notice = useStore((s) => {
    const n = s.nodeNotices[id];
    return n && n.code === 'generation-confirm' ? n : null;
  });
  /**
   * 时钟进 state（⚠️ 渲染期禁 `Date.now()`）—— **只在真会变时走心跳**：
   * `m` 里唯一随时间翻的只有「30 分钟窗口」，故 `waiting` 为假时**不挂定时器**。
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** 生成中（原 `m`，`core/rules/genVideo.genVideoWaiting`） */
  const waiting = genVideoWaiting(data, nowMs);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), GEN_VIDEO_WAITING_TICK_MS);
    return () => window.clearInterval(timer);
  }, [waiting]);
  /** 计划时长（原 `w = d.duration || ES`）—— 兜底吃 SSOT（原 `ES = 5`） */
  const plannedDuration = data.duration || DEFAULT_VIDEO_DURATION;
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
  /**
   * ★ **双击舞台上的视频 ⇒ 大图预览（视频档）**（照 maomao 的 `ImageZoomDialog kind='video'` 复刻）。
   *
   * · 列表 = **历次出片里有视频直链的那些**（`a.url`；`!url` 的条目与弹层的 `view.disabled` 同判据）
   * · 同一件通用件带 `kind`（**不是第二个灯箱**）：视频档 = 原生 `<video controls>` + 底栏
   *   「下载 / 截当前帧 / 截尾帧」，**不做缩放平移**（免得抢播放器）
   * · 下载名沿用本节点原来的命名（`genVideoDownloadName` = `<名>_<ts>.mp4`，`YL.jsx:357`）
   * ⚠️ 视频元素自身要**停传播**：卡片单击 = 打开生成面板，而双击会先发两次 click
   */
  const previewItems: LightboxItem[] = useMemo(
    () =>
      attempts.flatMap((item) => {
        const a = asRecord(item);
        const url = typeof a.url === 'string' ? a.url : '';
        if (!url) return [];
        const at = typeof a.at === 'number' ? a.at : 0;
        return [
          {
            src: url,
            kind: 'video' as const,
            title: versionItemView(item).prompt,
            downloadName: genVideoDownloadName(data.label, 'mp4', at),
            // 另存为过滤器：**这一批条目全是视频**（只收 `a.url` 有直链的）⇒ 恒为「视频文件」
            downloadFilter: VIDEO_DOWNLOAD_FILTER,
          },
        ];
      }),
    [attempts, data.label],
  );
  const preview = useImagePreview(previewItems);
  /** 当前播放的那条在列表里的序号（按 url 匹配；匹配不上退到第 1 条） */
  const previewIndex = Math.max(
    0,
    previewItems.findIndex((it) => it.src === data.resultUrl),
  );
  /** 当前版本下标（原 `pe`） */
  const curVer = currentVersionIndex(asRecord(data));
  const [histOpen, setHistOpen] = useState(false);
  const histBtnRef = useRef<HTMLButtonElement>(null);
  /* ★ 摆位交给**浮层定位原语**（`B06`）—— 见 `GenImageNode` 同处的说明：
     原来手算 `innerWidth - 264 - 8`（把面板宽硬编码进夹取）。 */
  const [histAnchor, setHistAnchor] = useState<{ x: number; y: number } | null>(null);
  const { ref: histPopRef, style: histStyle } = useAnchoredLayer({
    open: histOpen,
    anchor: histAnchor,
    depsKey: '',
  });
  /** 已发起过海报生成的 attempt url（原 `le` 的 `Set`）—— 避免重复发起 */
  const posterTriedRef = useRef<Set<string>>(new Set());

  /** 开合弹层（原 `De`，`YL.jsx:407-422`）—— 位置归原语，这里只量**锚点** */
  const toggleHistory = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!histOpen) {
      // ⚠️ 锚点必须在**事件里**量（渲染期读 ref 违反 React 规则，`react-hooks/refs` 会拦）
      const r = histBtnRef.current?.getBoundingClientRect();
      setHistAnchor(r ? { x: r.left, y: r.bottom + 8 } : null);
    }
    setHistOpen((v) => !v);
  };

  /** 弹层开着时：点外面关掉（原 `YL.jsx:423-438`；机制走 `ui/common/useOutsideClose`）
   *  ⚠️ "算里面"有**两个**：触发钮 + 弹层本身（源同判据）；`GenImageNode` 那份与这里此前**逐字相同** */
  useOutsideClose(histOpen, [histBtnRef, histPopRef], () => setHistOpen(false));

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
        // ⚠️ **必须把 `place` 算出的宽高传进去**：`addNode` 的默认框是「**空节点**」的 4:3，
        //   而这里的新节点**带着图**（且框是 `framePlacement` 按视频比例算的）——
        //   不传就会把三帧参考图塞进 200×150，连同列距/行距一起错位。
        const newId = addNode('material', place.position, { name: label, dataUrl }, { w: place.w, h: place.h });
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
      type="genvideo"
      title={
        <>
          {GEN_VIDEO_TEXT.title}
          {data.label && data.label !== GEN_VIDEO_TEXT.title ? (
            <span className={styles.gvLabel}>{data.label}</span>
          ) : null}
        </>
      }
      selected={selected}
      // 有框外浮层（分析按钮 / 提示词浮层）⇒ 不能被 `.node` 的 overflow 裁掉
      overflowVisible
      // `gv-hist-btn`（原 479-483）：有历史才显示，位于头部**最右**（右槽 actions）
      actions={
        attempts.length > 0 ? (
          <StageHistBtn
            btnRef={histBtnRef}
            open={histOpen}
            label={GEN_VIDEO_TEXT.histBtn(attempts.length)}
            title={GEN_VIDEO_TEXT.histBtnTitle}
            onClick={toggleHistory}
          />
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
      {/*
        `gv-stage`（原 485-530）：按比例撑开的舞台，等待浮层叠在其上
        ⚠️ **2026-10-12 对齐源**：此前舞台之上多印一行 `（空提示词）`（源卡片**没有**这行）。
      */}
      <div className={styles.gvStage} style={{ aspectRatio: stageRatio(data.aspectRatio) }}>
        {waiting && (
          <StageWaiting ariaLabel={genVideoWaitingAria(notice)} title={notice?.text || undefined}>
            {genVideoWaitingText(notice, produced)}
          </StageWaiting>
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
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={() => preview.open(previewIndex)}
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
          <StageEmpty title={GEN_VIDEO_TEXT.stageEmptyTitle} sub={GEN_VIDEO_TEXT.stageEmptySub} />
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
        {/* ⚠️ **原 `gv-dl` 舞台角上的下载钮已删**（2026-10-16 与图片侧同款：下载搬进大图预览）——
            视频侧现在也只在**双击打开的视频预览**里下（底栏「下载」），管线/文案同一份。
            详见 `ImageLightbox.download` 与本节点上方 `previewItems` 的 `downloadName/downloadFilter`。 */}
        {/* `gv-tl`（原 525-555）：舞台内的播放进度 —— ★ 形态 = 设计稿的 `.mk-stage-timeline`
            （**贴舞台底边的细条**，无圆角、无旋钮）；拖动 / 点击定位仍挂在本元素上（`seekFromPointer`）。 */}
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
      {/* ★ 提示词行（设计稿新增件）—— 修的是**真机空态文案自相矛盾**：
          文案写着「文生视频 · 在下方输入提示词」，而下方原本没有框。 */}
      <PromptLine
        text={data.text}
        lookup={promptLookup}
        onCommit={(next) => patchNodeData(id, { text: next })}
        onGenerate={() => gen.runForNode(id)}
        busy={apiJobStatus === 'running'}
        placeholder={GEN_PANEL_TEXT.promptPlaceholderVideo}
        generateLabel={produced ? PROJECT_TEXT.regenerating : PROJECT_TEXT.generate}
      />
      </NodeShell>
      {/* ★ 双击舞台视频 ⇒ 视频预览（通用件；`Modal` 自己 portal 到 body） */}
      {preview.node}
      {/* `gv-hist-pop`（原 585-620）：历史版本弹层 —— ★ **外壳**走 `HistPop`（与 `GenImageNode` 同一份） */}
      <HistPop
        open={histOpen && attempts.length > 0}
        title={GEN_VIDEO_TEXT.histTitle(attempts.length)}
        popRef={histPopRef}
        style={histStyle}
      >
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
      </HistPop>
    </>
  );
}
