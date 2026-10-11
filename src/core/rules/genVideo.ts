/**
 * 文生视频节点 —— 纯规则（原 `YL.jsx`）
 *
 * 依据：`docs/12` §1.7（源结构树）+ `docs/13` §1.7（缺口登记）
 * 归属：数据推导是纯逻辑 ⇒ 归 `core`（原则 4：本文件无 `window` / `Date.now()` / `Math.random()`）。
 *
 * ★ 本文件对应的源推导（逐字对源，行号 = `YL.jsx`）：
 *   | 本函数 | 源符号 | 行 | 含义 |
 *   | - | - | - | - |
 *   | `stageRatio` | `v` | 64-75 | `gv-stage` 的 `aspect-ratio` |
 *   | `hasResult` | `h` | 42 | 有结果（`resultUrl` 或 `resultPoster`） |
 *   | `nodeAccountLabel` | `y` | 62-109 | `gv-meta` 第 2 项：执行账号标签 |
 *   | `hasRealDuration` | `A` | 173 | 是否拿到了**真实时长**（决定 `gv-dur-badge` / `gv-dur-real`） |
 *   | `durationText` | `R`+`D` | 171-172 | 时长文案（真实时长优先；整数不带小数） |
 *   | `timelinePercent` | `X` | 545 | `gv-tl` 进度条百分比 |
 *   | `seekSeconds` | `ze`+`Qe` | 196-200 | 拖动时间线 → 目标秒数 |
 *   | `genVideoDownloadName` | `Ve` | 357 | 下载文件名（`<名>_<ts>.<ext>`） |
 *   | `apiJobLabel` | - | 561-563 | `gv-apijob` 状态条文案 |
 *   | `frameTargetRatio` | `ct` | 266-274 | 取帧裁切的**目标比例**（6 档 + `auto`） |
 *   | `frameSeekSeconds` | `Ve` | 212-213 | 三帧各自 seek 到的秒数 |
 *   | `frameCrop` | `wt`/`At`/`_t`/`Mt` | 275-288 | 居中裁切框 + 输出尺寸 |
 *   | `framePlacement` | `me`/`nt` | 304-324 | 参考图素材的尺寸与落点（每列 3 个） |
 *
 * ⚠️ **`nodeAccountLabel` 与 `accountPick.accountPickerLabel`（原 `Se`）是两套**：
 *   源在**两个地方**各写了一份账号标签，**格式不同**（`未分组 · 自动` vs `未分组（自动）`、
 *   `自动` vs `全部账号（自动）`）⇒ 各自逐字对各自的源，**不合并**（原则 8 的适用前提是"同一处"）。
 */

import { COMMON_TEXT, GEN_VIDEO_TEXT } from '@/constants/text';
import { asRecord } from '@/lib/object';
import { clamp } from '@/lib/math';
import type { Account } from '@/stable/model/account';
import { GEN_VIDEO_LABEL } from '@/stable/model/node';
import { UNGROUPED } from './accountPick';

/**
 * `gv-stage` 的 `aspect-ratio`（原 `v`，`YL.jsx:64-75`）
 *
 * ⚠️ 源**只有三个分支**：`9:16` → `9 / 16`，`1:1` → `1 / 1`，**其余一律** `16 / 9`
 *    （含空值、含 `4:3`/`3:4` —— 它们**不是**各自的比例，这是源的既有行为，逐字保留）。
 */
export function stageRatio(aspectRatio: string | undefined): string {
  const r = aspectRatio || '16:9';
  if (r === '9:16') return '9 / 16';
  if (r === '1:1') return '1 / 1';
  return '16 / 9';
}

/** 有结果（原 `h` = `!!resultUrl || !!resultPoster`，`YL.jsx:42`） */
export function hasResult(data: { resultUrl?: string; resultPoster?: string }): boolean {
  return !!data.resultUrl || !!data.resultPoster;
}

/**
 * `gv-meta` 第 2 项：**执行账号标签**（原 `y`，`YL.jsx:62-109`）
 *
 * ⚠️ 源共 4 档（顺序敏感，`auto:group:` **先于** `auto:`）：
 *   | 输入 | 输出 |
 *   | - | - |
 *   | 空 / `'auto'` | `全部账号（自动）` |
 *   | `auto:group:ungrouped` | `未分组（自动）` |
 *   | `auto:group:<id>` | `<组名 / 分组>（自动）` |
 *   | `auto:<channel>` | `<频道名 / 原文>账号（自动）` |
 *   | 其它（显式账号 id） | `<账号名 / 豆包账号（自动）>` |
 *
 * ⚠️ 源**不看 `channel`**（即便 `channel === 'api'`，`sendAccount === 'auto'` 也显示「全部账号（自动）」）
 *    —— 与 `accountPickerLabel`（那里 `api` 优先）**不同**，逐字保留。
 */
export function nodeAccountLabel(input: {
  sendAccount?: string;
  accounts?: readonly Account[];
  groups?: readonly { id: string; name?: string }[];
}): string {
  const v = input.sendAccount;
  if (!v || v === 'auto') return GEN_VIDEO_TEXT.accountAll;
  if (v.startsWith('auto:group:')) {
    const gid = v.slice('auto:group:'.length);
    if (gid === UNGROUPED) return GEN_VIDEO_TEXT.accountUngrouped;
    const g = (input.groups || []).find((x) => x.id === gid);
    return GEN_VIDEO_TEXT.accountInGroup(g?.name || GEN_VIDEO_TEXT.accountGroupFallback);
  }
  if (v.startsWith('auto:')) {
    const ch = v.slice('auto:'.length);
    // 原：`{…}[X.slice(5)] || X.slice(5)` —— 查不到频道名就**回落到原文**
    const label = GEN_VIDEO_TEXT.channelLabels[ch] || ch;
    return GEN_VIDEO_TEXT.accountAutoChannel(label);
  }
  const hit = (input.accounts || []).find((a) => a.id === v);
  return hit ? hit.name : GEN_VIDEO_TEXT.accountFallback;
}

/**
 * 是否拿到**真实时长**（原 `A` = `h && Number.isFinite(z) && z > 0`，`YL.jsx:173`）
 *
 * `z` = `<video>` 的 `onLoadedMetadata` 读到的秒数（原 `O(re.duration)`）。
 * ⚠️ 源要求 `hasResult`（`h`）**同时**成立 —— 没有结果时即便拿到时长也不算数。
 */
export function hasRealDuration(hasResult: boolean, realDuration: number): boolean {
  return hasResult && Number.isFinite(realDuration) && realDuration > 0;
}

/**
 * 时长文案（原 `R` + `D`，`YL.jsx:171-172`）
 *
 * 源分两步：
 *   ① `R = h && Number.isFinite(z) && z > 0 ? z : w` —— **真实时长优先**，否则用计划时长 `w`；
 *   ② `D = Number.isFinite(R) ? (Number.isInteger(R) ? String(R) : R.toFixed(1)) : String(w)`
 *      —— **整数不带小数、非整数保留 1 位**；`R` 非有限时回落 `String(w)`。
 * ⚠️ 第 ② 步的双重兜底是**源的既有写法**（`R` 恒为数字时走不到），逐字保留。
 */
export function durationText(hasResult: boolean, realDuration: number, plannedDuration: number): string {
  const effective = hasRealDuration(hasResult, realDuration) ? realDuration : plannedDuration;
  if (!Number.isFinite(effective)) return String(plannedDuration);
  return Number.isInteger(effective) ? String(effective) : effective.toFixed(1);
}

/**
 * `gv-tl` 进度条百分比（原 `X`，`YL.jsx:545`）
 *
 * `z ? Math.min(100, Math.max(0, F / z * 100)) : 0` —— ⚠️ 分母是**真实时长 `z`**
 *    （**不是**有效时长 `R`）；`z` 为 0 时直接 0（避开 `0/0`）。
 */
export function timelinePercent(currentTime: number, realDuration: number): number {
  if (!realDuration) return 0;
  return clamp((currentTime / realDuration) * 100, 0, 100);
}

/**
 * 拖动时间线得到的**目标秒数**（原 `J` 的 `ze` / `Qe`，`YL.jsx:196-200`）
 *
 * `ze = Number.isFinite(re.duration) && re.duration > 0 ? re.duration : z`；`Qe = ratio * ze`。
 * ⚠️ 源在 `!ze` 时**直接 `return`**（不写 `currentTime`）⇒ 调用方须判返回值
 *    （`0` 或 `NaN` 均为假值）再写 `video.currentTime`。
 */
export function seekSeconds(ratio: number, videoDuration: number, realDuration: number): number {
  const total = Number.isFinite(videoDuration) && videoDuration > 0 ? videoDuration : realDuration;
  return ratio * total;
}

/**
 * 下载文件名（原 `ke` 的 `Ve`，`YL.jsx:357`）
 *
 * `\`${d.label && d.label !== '文生视频' ? d.label : '文生视频'}_${Date.now()}.${je}\``
 * —— 用了自定义名就用它，否则回落 `文生视频`；后缀由调用方给（视频 `mp4` / 图片 `png`）。
 * ⚠️ 源**不做非法字符替换 / 截断**（与 `downloadNode.downloadFileName` 那套**不同**，
 *    各自逐字对各自的源，不合并）；`now` 由调用方注入（`core` 禁 `Date.now()`，原则 4）。
 */
export function genVideoDownloadName(label: string | undefined, ext: string, now: number): string {
  const base = label && label !== GEN_VIDEO_LABEL ? label : GEN_VIDEO_LABEL;
  return `${base}_${now}.${ext}`;
}

/**
 * `gv-apijob` 状态条文案（原 561-563）
 *
 * 源条件：`d.apiJob && d.apiJob.status && d.apiJob.status !== 'done'` 才渲染；
 * 文案按 `status` 分支，**未识别的状态 ⇒ 空串**（源仍渲染那个空 `<div>` —— 逐字保留）。
 *
 * ⚠️ 节点上的 `apiJob` 在本仓是 `unknown`（`GenVideoNodeData.apiJob?: unknown`），
 *    由 `applyApiJobEvent` 的 `nodePatch` patch 进来（形状 = `ApiJobNodePatch`，含 `progress`/`error`）。
 *
 * @returns `null` = **不渲染**（无 `apiJob` / 无 `status` / 已 `done`）；否则为文案（可能是 `''`）
 */
export function apiJobLabel(apiJob: unknown): string | null {
  const job = asRecord(apiJob);
  const status = typeof job.status === 'string' ? job.status : '';
  if (!status || status === 'done') return null;
  switch (status) {
    case 'queued':
      return GEN_VIDEO_TEXT.apiJobQueued;
    case 'submitting':
      return GEN_VIDEO_TEXT.apiJobSubmitting;
    case 'running':
      return typeof job.progress === 'number'
        ? GEN_VIDEO_TEXT.apiJobRunningProgress(job.progress)
        : GEN_VIDEO_TEXT.apiJobRunning;
    case 'downloading':
      return GEN_VIDEO_TEXT.apiJobDownloading;
    case 'failed': {
      // 原：`d.apiJob.error && d.apiJob.error.message || '未知错误'`
      const err = asRecord(job.error);
      const message = typeof err.message === 'string' && err.message ? err.message : COMMON_TEXT.unknownReason;
      return GEN_VIDEO_TEXT.apiJobFailed(message);
    }
    case 'cancelled':
      return GEN_VIDEO_TEXT.apiJobCancelled;
    default:
      return '';
  }
}

/**
 * 「三帧→画布参考图」用到的**目标比例**（原 `se` 内的 `ct` 表，`YL.jsx:266-274`）
 *
 * ⚠️ 与 `stageRatio`（原 `v`）**不是同一张表**：那个只有三分支、只管 CSS 串；
 *    这张是**取帧裁切**用的数值表（6 档 + `auto`），**查不到回落 `16/9`**。逐字对源，不合并。
 */
const FRAME_RATIOS: Record<string, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '3:4': 3 / 4,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
  auto: 16 / 9,
};

/** 取帧的目标比例（原 `ct`，`YL.jsx:266-274`） */
export function frameTargetRatio(aspectRatio: string | undefined): number {
  return (aspectRatio && FRAME_RATIOS[aspectRatio]) || 16 / 9;
}

/** 三帧的取帧时刻（原 `Ve`，`YL.jsx:212-213`） */
export type FrameKind = 'head' | 'current' | 'tail';

/**
 * 取帧要 seek 到的秒数（原 `Ve`，`YL.jsx:212-213`）
 *
 * `je = Number.isFinite(re.duration) && re.duration > 0 ? re.duration : z`；
 * `Ve = kind === 'head' ? 0 : kind === 'tail' ? Math.max(0, je - 0.05) : re.currentTime`
 */
export function frameSeekSeconds(
  kind: FrameKind,
  currentTime: number,
  videoDuration: number,
  fallbackDuration: number,
): number {
  const total = Number.isFinite(videoDuration) && videoDuration > 0 ? videoDuration : fallbackDuration;
  if (kind === 'head') return 0;
  if (kind === 'tail') return Math.max(0, total - 0.05);
  return currentTime;
}

/** 取帧的**裁切框**（原 `wt`/`At`/`_t`/`Mt`/`Rt`/`Be`，`YL.jsx:275-288`） */
export interface FrameCrop {
  /** 源矩形（`drawImage` 的 4 参） */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 目标画布尺寸（≥2，四舍五入） */
  outW: number;
  outH: number;
}

/**
 * 按目标比例**居中裁切**视频帧（原 `YL.jsx:275-288`）
 *
 * 源：视频比 `>` 目标 ⇒ 裁两侧；`<` 目标 ⇒ 裁上下；相等 ⇒ 原样。
 * 输出尺寸 = `Math.max(2, Math.round(裁后宽/高))`。
 */
export function frameCrop(videoW: number, videoH: number, aspectRatio: string | undefined): FrameCrop {
  const target = frameTargetRatio(aspectRatio);
  let sw = videoW;
  let sh = videoH;
  let sx = 0;
  let sy = 0;
  const ratio = videoW / videoH;
  if (ratio > target) {
    sw = videoH * target;
    sx = (videoW - sw) / 2;
  } else if (ratio < target) {
    sh = videoW / target;
    sy = (videoH - sh) / 2;
  }
  return { sx, sy, sw, sh, outW: Math.max(2, Math.round(sw)), outH: Math.max(2, Math.round(sh)) };
}

/** 新素材节点的尺寸与落点（原 `me` + `nt`，`YL.jsx:304-324`） */
export interface FramePlacement {
  w: number;
  h: number;
  position: { x: number; y: number };
}

/**
 * 参考图素材的**尺寸 + 落点**（原 `me`/`nt`，`YL.jsx:304-324`）
 *
 * 源：宽 `max(220, 源宽 - 24)`、高 `round(54 + (宽 - 18) / 比例)`；
 * 落点 = 源节点**右侧一列**（`x + 源宽 + 60`），**每列 3 个**（超出换列、列距 `宽+40`），
 * 列内 `y + 行号 * (高 + 24)`；行号 = 已有参考图数 `% 3`，列号 = `floor(数 / 3)`。
 */
export function framePlacement(
  source: { position?: { x: number; y: number }; width?: number; measured?: { width?: number } } | undefined,
  neighborCount: number,
  aspectRatio: string | undefined,
): FramePlacement {
  const x = source?.position?.x ?? 0;
  const y = source?.position?.y ?? 0;
  const width = source?.measured?.width ?? source?.width ?? 380;
  const w = Math.max(220, width - 24);
  const h = Math.round(54 + (w - 18) / frameTargetRatio(aspectRatio));
  const col = Math.floor(neighborCount / 3);
  const row = neighborCount % 3;
  return { w, h, position: { x: x + width + 60 + col * (w + 40), y: y + row * (h + 24) } };
}
