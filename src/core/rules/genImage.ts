/**
 * 文生图节点 —— 纯规则（原 `ZL.jsx`）
 *
 * 依据：`docs/12` §1.8（源结构树）+ `docs/13` §1.8（缺口登记）
 * 归属：数据推导是纯逻辑 ⇒ 归 `core`（原则 4：本文件无 `window` / `Date.now()` / `Math.random()`）。
 *
 * ★ 本文件对应的源推导（逐字对源，行号 = `ZL.jsx`）：
 *   | 本函数 | 源符号 | 行 | 含义 |
 *   | - | - | - | - |
 *   | `genImageCurrentUrl` | `d` | 25-27 | 当前**展示**的图（`viewUrl` 优先，但必须仍在 `results` 里） |
 *   | `imageApiChipLabel` | - | 218-220 | `ig-chip-status` 芯片文案 |
 *   | `imageVersionView` | - | 297-311 | 历史版本弹层里一张的展示字段 |
 */

import { COMMON_TEXT, GEN_IMAGE_TEXT } from '@/constants/text';
import { asRecord } from '@/lib/object';

/**
 * 当前展示的图（原 `d`，`ZL.jsx:25-27`）
 *
 * `` l.viewUrl && c.some(V => V.dataUrl === l.viewUrl) ? l.viewUrl : l.resultUrl || (c[0] && c[0].dataUrl) || null ``
 *
 * ⚠️ `viewUrl` **只在它仍是 `results` 里的一员时**才优先 —— 否则（历史遗留 / 结果已被替换）
 *    回落到 `resultUrl`，再回落第一条结果的 `dataUrl`。
 * ⚠️ 这是**展示与下载共用的同一个值**（`gv-video` 的 `<img>` 与 `gv-dl` 都取它），
 *    收口在此 ⇒ 两处不会再各推一遍（判据 C1）。
 */
export function genImageCurrentUrl(data: {
  viewUrl?: string;
  resultUrl?: string;
  results?: readonly { dataUrl?: string }[];
}): string | null {
  const results = data.results ?? [];
  const viewUrl = data.viewUrl;
  if (viewUrl && results.some((r) => r.dataUrl === viewUrl)) return viewUrl;
  return data.resultUrl || results[0]?.dataUrl || null;
}

/**
 * `gv-meta` 的**频道显示名**（原 `QL[l.channel] || '豆包后台'`，`ZL.jsx:961`）
 *
 * ⚠️ `QL` 只有 3 项（`doubao` / `dola` / `api`）⇒ 其余频道（如 `lovart`）走**兜底 `豆包后台`**。
 */
export function imageChannelLabel(channel: string | undefined): string {
  return (channel && GEN_IMAGE_TEXT.channelLabels[channel]) || GEN_IMAGE_TEXT.metaChannelFallback;
}

/**
 * `ig-chip-status` 芯片文案（原 `ZL.jsx:218-220`）
 *
 * 源条件：`l.apiJob && l.apiJob.status && l.apiJob.status !== 'done'`；
 * 文案 = `` `API ${status === 'failed' ? '失败' : '进行中'}` ``（**其余状态一律「进行中」**）。
 *
 * @returns `null` = **不渲染**（无 `apiJob` / 无 `status` / 已 `done`）
 */
export function imageApiChipLabel(apiJob: unknown): string | null {
  const job = asRecord(apiJob);
  const status = typeof job.status === 'string' ? job.status : '';
  if (!status || status === 'done') return null;
  return status === 'failed' ? GEN_IMAGE_TEXT.apiChipFailed : GEN_IMAGE_TEXT.apiChipRunning;
}

/** 历史版本弹层里**一张**的展示字段（原 `ZL.jsx:297-311` 的渲染表达式） */
export interface ImageVersionView {
  /** 缩略图地址（源恒取 `V.dataUrl`，不判空） */
  dataUrl: string;
  /** 是否**当前展示**的那张（原 298：`V.dataUrl === d`） */
  selected: boolean;
  /**
   * 时间戳（原 305 的 `S(V.ts)` 的**入参**）
   * ⚠️ **格式化不在这里** —— `core` 不得出现 `new Date`（见 `lib/time.ts` 头注），由 UI 调 `formatDateTimeMinute`。
   */
  ts: number | undefined;
  account: string;
  ratio: string;
  prompt: string;
}

/**
 * 一张历史结果的展示字段（原 `ZL.jsx:297-311`）
 *
 * 源逐项：`V.dataUrl` / `V.ts` / `V.accountName || '—'` / `V.ratio || '自动'` /
 * `V.prompt ? V.prompt.slice(0, 24) : '（无提示词）'`。
 */
export function imageVersionView(result: unknown, currentUrl: string | null): ImageVersionView {
  const r = asRecord(result);
  const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl : '';
  return {
    dataUrl,
    selected: !!currentUrl && dataUrl === currentUrl,
    ts: typeof r.ts === 'number' ? r.ts : undefined,
    account: typeof r.accountName === 'string' && r.accountName ? r.accountName : COMMON_TEXT.dash,
    ratio: typeof r.ratio === 'string' && r.ratio ? r.ratio : COMMON_TEXT.autoLabel,
    prompt:
      typeof r.prompt === 'string' && r.prompt ? r.prompt.slice(0, 24) : COMMON_TEXT.noPrompt,
  };
}
