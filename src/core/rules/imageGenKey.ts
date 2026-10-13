/**
 * 图像生成键表（原 `imageGenKeyParams` / `imageGenKeyNode` 的**纯规则半**）
 *
 * 依据（**逐行回源抄录**）：
 *   - `bindImageGenKey` `shared.js:27171-27194` —— 网页通道：`genKey → 节点 + 期望张数 + 提交参数`
 *   - `bindImageGenJobs` `shared.js:27196-27225` —— API 通道：`jobId[] → 提交参数`
 *   - `attachImageResultToNode` 查表回填 `shared.js:27247-27257`（`u = genKey || jobId`）
 *   - 结果消费后删键 `shared.js:27280-27288`（防键表无限膨胀）
 *
 * ⚠️ **源里 `imageGenJobNode`（`bindImageGenJobs` 写、无任何读者）不落** —— 判据 B5：
 *   API 通道的节点 id 由 `applyApiJobEvent` 的 `event.nodeId` 直接给，**无需反查表**。
 * ⚠️ 本文件**零 store 依赖**（纯决策）；落 store 由 `state/slices/apiLanding.ts` 负责（键表 SSOT）。
 * ⚠️ 网页通道还要 `imageGenKeyNode`（`key → 节点 id`）＋ `imageGenKeyTarget`（期望张数）＋
 *   `imageGenDeliveredKeys`（去重计数）—— 那是 CDP 回流链（`state/dolaMedia` 图像支）的事，不在此表。
 */

import { NODE_DEFAULT_RATIO_LABEL } from '@/constants/models';
import { clampImageCount } from './prompt';

/** 提交参数（原 `_Component45.jsx:900-909` 的 `fe`） */
export interface ImageGenParams {
  text: string;
  channel: string;
  aspectRatio: string;
  styleIds: readonly string[];
  imageCount: number;
  igModel: string;
  igResolution: string;
  sendAccount: string;
}

/** 提交参数表（原 `imageGenKeyParams`）：`genKey` / `jobId` → 提交参数 */
export type ImageGenKeyParams = Record<string, ImageGenParams>;

/** 已交付计数（原 `imageGenDeliveredKeys` 的 value，`:27417-27421`） */
export interface ImageGenDelivered {
  ts: number;
  /** 期望张数（原 `target`，`bindImageGenKey` 时的 `Math.max(1, Math.min(4, count))`） */
  target: number;
  /** 已收张数 */
  got: number;
}

export type ImageGenDeliveredKeys = Record<string, ImageGenDelivered>;

/** 是否已收满（原 `addImageGenResult` 的去重判定 `d && (d.got || 0) >= f`，`:27370`） */
export function isImageGenSatisfied(table: ImageGenDeliveredKeys, key: string | null): boolean {
  const d = key ? table[key] : undefined;
  return !!d && d.got >= d.target;
}

/**
 * 递增已交付计数并判定「收满」（原 `addImageGenResult` 的 `:27416-27423`）——
 * `target` 在 `bindImageGenKey` 时写入；此处只 `got + 1` 并夹取 `target`（源 `f`）。
 */
export function tickImageGenDelivered(
  table: ImageGenDeliveredKeys,
  key: string,
  now: number,
): { table: ImageGenDeliveredKeys; got: number; target: number; satisfied: boolean } {
  const prev = key ? table[key] : undefined;
  const target = Math.max(1, Math.min(4, prev?.target || 1));
  const got = (prev?.got || 0) + 1;
  return {
    table: { ...table, [key]: { ts: now, target, got } },
    got,
    target,
    satisfied: got >= target,
  };
}

/** 一批 jobId 绑定同一份提交参数（原 `bindImageGenJobs` 的 params 半，`:27207-27215`） */
export function bindImageGenJobs(
  table: ImageGenKeyParams,
  jobIds: readonly string[],
  params: ImageGenParams,
): ImageGenKeyParams {
  const next = { ...table };
  for (const id of jobIds) {
    if (id) next[id] = params;
  }
  return next;
}

/** 单键绑定（原 `bindImageGenKey` 的 params 半，`:27186-27191`）—— 网页通道用 */
export function bindImageGenKey(
  table: ImageGenKeyParams,
  key: string,
  params: ImageGenParams,
): ImageGenKeyParams {
  if (!key) return table;
  return { ...table, [key]: params };
}

/** 结果到达后删键（原 `attachImageResultToNode` 的 `:27280-27288`，防键表无限膨胀） */
export function dropImageGenKey(table: ImageGenKeyParams, key: string): ImageGenKeyParams {
  if (!key || !(key in table)) return table;
  const next = { ...table };
  delete next[key];
  return next;
}

/** 节点上的兜底字段（原 `attachImageResultToNode` 里的 `l` = `node.data`） */
export interface ImageGenNodeFallback {
  text?: unknown;
  channel?: unknown;
  aspectRatio?: unknown;
  styleIds?: unknown;
  imageCount?: unknown;
  igModel?: unknown;
  igResolution?: unknown;
  sendAccount?: unknown;
}

/**
 * 查表回填提交参数（原 `attachImageResultToNode` 的 `:27248-27257`）：
 * `bound = table[genKey || jobId]`；有 ⇒ 用提交值，无 ⇒ 用节点当前值兜底。
 *
 * ⚠️ `aspectRatio` 兜底用**默认比例真源**（`NODE_DEFAULT_RATIO_LABEL`）—— 与源 `'1:1'` 的
 *    差异是本仓既有口径（见 `apiLanding.ts` 原注释），照旧。
 */
export function resolveImageGenParams(
  bound: ImageGenParams | null | undefined,
  node: ImageGenNodeFallback,
): ImageGenParams {
  const bText = bound?.text;
  const bChannel = bound?.channel;
  const bAspect = bound?.aspectRatio;
  const bStyleIds = bound?.styleIds;
  const bCount = bound?.imageCount;
  const bModel = bound?.igModel;
  const bRes = bound?.igResolution;
  const bAccount = bound?.sendAccount;

  return {
    text: (bText != null ? bText : (typeof node.text === 'string' ? node.text : '')) || '',
    channel: bChannel || (typeof node.channel === 'string' && node.channel) || 'doubao',
    aspectRatio:
      bAspect || (typeof node.aspectRatio === 'string' && node.aspectRatio) || NODE_DEFAULT_RATIO_LABEL,
    styleIds: Array.isArray(bStyleIds)
      ? bStyleIds
      : Array.isArray(node.styleIds)
        ? node.styleIds
        : [],
    imageCount: bCount || clampImageCount(node.imageCount),
    igModel: bModel || (typeof node.igModel === 'string' && node.igModel) || '',
    igResolution: bRes || (typeof node.igResolution === 'string' && node.igResolution) || '',
    sendAccount: bAccount || (typeof node.sendAccount === 'string' && node.sendAccount) || 'auto',
  };
}
