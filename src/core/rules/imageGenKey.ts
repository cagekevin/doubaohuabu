/**
 * 图像生成键表（原 `imageGenKeyNode` / `imageGenKeyTarget` / `imageGenKeyParams` /
 * `imageGenJobNode` / `imageGenDeliveredKeys` / `imageGenFeed` 的**纯规则半**）
 *
 * 依据（**逐行回源抄录**）：
 *   - `bindImageGenKey`   shared.js:27171-27194 —— 网页通道：`key → 节点 + 期望张数 + 提交参数`
 *   - `bindImageGenJobs`  shared.js:27196-27225 —— API 通道：`jobId → 节点 + 提交参数`
 *   - `addImageGenResult` shared.js:27352-27453 —— 占位图判定 / 张数推导 / 计数与 200 上限
 *   - `pushImageGenFeed`  shared.js:27132-27161 —— 生成图片流（去重 + 上限 80）
 *   - `attachImageResultToNode` 查表回填 shared.js:27246-27257 · 消费后删键 `:27280-27288`
 *
 * ⚠️ 本文件**零 store 依赖**（纯决策）；落 store 由 `state/slices/apiLanding.ts` 负责。
 */

import { NODE_DEFAULT_RATIO_LABEL } from '@/constants/models';
import { IMAGE_GEN_DELIVERED_MAX, IMAGE_GEN_FEED_LIMIT } from '@/constants';
import { PLACEHOLDER_EXACT_HASHES } from '@/constants/dedupe';
import { IMAGE_GEN_TEXT } from '@/constants/text';
import { exactHashFromDataUrl } from '@/lib/hash';
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

/** 提交参数表（原 `imageGenKeyParams`，`:27170`）：`genKey` / `jobId` → 提交参数 */
export type ImageGenKeyParams = Record<string, ImageGenParams>;

/** 网页通道：`genKey → 节点 id`（原 `imageGenKeyNode`，`:27168`） */
export type ImageGenKeyNodes = Record<string, string>;

/** 网页通道：`genKey → 期望张数`（原 `imageGenKeyTarget`，`:27169`） */
export type ImageGenKeyTargets = Record<string, number>;

/**
 * 网页通道图像任务的**作业前缀**（原 `const w = \`imggen:${m}\``，`shared.js:42921`）
 *
 * ⚠️ 它同时是两件事的键：① 账号占用的 `nodeId`（`Fi(h.id, { nodeId: w })`）
 *    ② CDP 待归属队列的 `nodeId`（`C.current.push({ nodeId: w })`，`_Component43.jsx:2964`）。
 *    `_Component43` 的图像支据此 `startsWith('imggen:')` 挑项、`slice(7)` 取回 key。
 */
export const IMG_GEN_JOB_PREFIX = 'imggen:';

/** 由生成键造作业 id（原 `` `imggen:${m}` ``） */
export function imageGenJobId(key: string): string {
  return `${IMG_GEN_JOB_PREFIX}${key}`;
}

/** 是否图像作业（原 `String(nodeId || '').startsWith('imggen:')`，`_Component43.jsx:166`） */
export function isImageGenJobId(nodeId: string | null | undefined): boolean {
  return String(nodeId || '').startsWith(IMG_GEN_JOB_PREFIX);
}

/** 由作业 id 取回生成键（原 `String(ge.nodeId).slice(7)`，`_Component43.jsx:208`） */
export function imageGenKeyOfJobId(nodeId: string): string {
  return isImageGenJobId(nodeId) ? nodeId.slice(IMG_GEN_JOB_PREFIX.length) : '';
}

/** 已交付计数（原 `imageGenDeliveredKeys` 的 value，`:27417-27421`） */
export interface ImageGenDelivered {
  ts: number;
  /** 期望张数（原 `f`，由 `imageGenKeyTarget` / 上一轮的 `target` / `1` 推导） */
  target: number;
  /** 已收张数 */
  got: number;
}

export type ImageGenDeliveredKeys = Record<string, ImageGenDelivered>;

/** 生成图片流的一项（原 `pushImageGenFeed` 的产物形状，`:27134-27143`） */
export interface ImageGenFeedItem {
  id: string;
  name: string;
  dataUrl: string;
  source: string;
  accountName: string | null;
  genKey: string | null;
  ts: number;
}

/** 生成图片流的**入参项**（源里缺省字段由 `pushImageGenFeed` 补） */
export interface ImageGenFeedInput {
  id?: string;
  name?: string;
  dataUrl: string;
  source?: string;
  accountName?: string | null;
  genKey?: string | null;
  ts?: number;
}

/** 网页通道的三张表（`bindImageGenKey` 一次写三张） */
export interface ImageGenKeyTables {
  keyNodes: ImageGenKeyNodes;
  keyTargets: ImageGenKeyTargets;
  keyParams: ImageGenKeyParams;
}

/**
 * API 通道的绑定表（`bindImageGenJobs` 只写 `imageGenKeyParams`）
 *
 * ⚠️ 源里同时写 `imageGenJobNode`（`jobId → 节点 id`，`:27200/27218`），但**全仓 0 读者**
 *    ⇒ 本仓**不落**该表（判据 B5），差异已记账。
 */
export type ImageGenJobTables = ImageGenKeyParams;

/**
 * 网页通道绑定（原 `bindImageGenKey`，`:27171-27194`）
 *
 * ```js
 * if (!n || !r) return;                       // 缺 key 或 nodeId ⇒ 什么都不做
 * const a = Math.max(1, Math.min(4, s | 0 || 1));
 * ```
 *
 * @returns `null` = 源里的提前 `return`（调用方**不写** store）
 */
export function bindImageGenKey(
  tables: ImageGenKeyTables,
  key: string,
  nodeId: string,
  target: number,
  params: ImageGenParams | null | undefined,
): ImageGenKeyTables | null {
  if (!key || !nodeId) return null;
  const clamped = Math.max(1, Math.min(4, target | 0 || 1));
  return {
    keyNodes: { ...tables.keyNodes, [key]: nodeId },
    keyTargets: { ...tables.keyTargets, [key]: clamped },
    keyParams: params ? { ...tables.keyParams, [key]: params } : tables.keyParams,
  };
}

/**
 * API 通道绑定（原 `bindImageGenJobs`，`:27196-27225`）
 *
 * ```js
 * if (!!r && !!Array.isArray(n) && n.length !== 0) { … }
 * ```
 *
 * ⚠️ `nodeId` **只作源版守卫**（`!!r`）—— 源用它写 `imageGenJobNode`，本仓不落那张表（见类型注释）。
 *
 * @returns `null` = 源里的条件不成立（调用方**不写** store）
 */
export function bindImageGenJobs(
  keyParams: ImageGenJobTables,
  jobIds: readonly (string | null | undefined)[],
  nodeId: string | null | undefined,
  params: ImageGenParams | null | undefined,
): ImageGenKeyParams | null {
  if (!nodeId || !Array.isArray(jobIds) || jobIds.length === 0) return null;
  if (!params) return keyParams;

  const next = { ...keyParams };
  for (const id of jobIds) if (id) next[id] = params;
  return next;
}

/**
 * 期望张数推导（原 `addImageGenResult` 的 `f`，`:27369`）
 *
 * ```js
 * const f = n ? Math.max(1, Math.min(4, (u.imageGenKeyTarget || {})[n] || d && d.target || 1)) : 1;
 * ```
 * ⚠️ 无 key ⇒ **恒 1**（不进夹取）。
 */
export function deliveredTarget(
  keyTargets: ImageGenKeyTargets,
  delivered: ImageGenDeliveredKeys,
  key: string | null,
): number {
  if (!key) return 1;
  const d = delivered[key];
  return Math.max(1, Math.min(4, keyTargets[key] || (d && d.target) || 1));
}

/** 是否已收满（原 `:27370` 的去重判定 `d && (d.got || 0) >= f`） */
export function isImageGenSatisfied(
  delivered: ImageGenDeliveredKeys,
  keyTargets: ImageGenKeyTargets,
  key: string | null,
): boolean {
  if (!key) return false;
  const d = delivered[key];
  return !!d && (d.got || 0) >= deliveredTarget(keyTargets, delivered, key);
}

/**
 * 递增已交付计数并判定「收满」（原 `:27416-27438`）
 *
 * ⚠️ 表超 `IMAGE_GEN_DELIVERED_MAX` 时按 `ts` 升序**砍掉最旧**（原 `:27427-27435`）。
 */
export function tickImageGenDelivered(
  delivered: ImageGenDeliveredKeys,
  key: string,
  target: number,
  now: number,
): { table: ImageGenDeliveredKeys; got: number; target: number; satisfied: boolean } {
  const d = delivered[key];
  const f = Math.max(1, Math.min(4, target || (d && d.target) || 1));
  const got = ((d && d.got) || 0) + 1;
  const table: ImageGenDeliveredKeys = { ...delivered, [key]: { ts: now, target: f, got } };

  const keys = Object.keys(table);
  if (keys.length > IMAGE_GEN_DELIVERED_MAX) {
    keys.sort((a, b) => (table[a] as ImageGenDelivered).ts - (table[b] as ImageGenDelivered).ts);
    for (const k of keys.slice(0, keys.length - IMAGE_GEN_DELIVERED_MAX)) delete table[k];
  }

  return { table, got, target: f, satisfied: got >= f };
}

/** 精确哈希是否命中占位图黑名单（原 `v && Sk.has(v)`，`:27379`） */
export function isPlaceholderHash(hash: string | null | undefined): boolean {
  return !!hash && PLACEHOLDER_EXACT_HASHES.includes(hash);
}

/**
 * 占位图判定（原 `addImageGenResult` 里的同步半，`:27377-27385`）
 *
 * ```js
 * const v = nm(r);
 * if (v && Sk.has(v)) return { ok: false, error: 'placeholder' };
 * ```
 * ⚠️ 只做**精确哈希**这一半；异步的感知哈希半在出片轮询里（`core/rules/dedupe` 的 `isPlaceholder`）。
 */
export function isPlaceholderDataUrl(dataUrl: string): boolean {
  return isPlaceholderHash(exactHashFromDataUrl(dataUrl));
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
 * ⚠️ `aspectRatio` 的**末档兜底**用本仓节点默认比例真源（`NODE_DEFAULT_RATIO_LABEL` = 4:3，
 *    用户裁定「所有节点初始比例 4:3」）—— 源那里写的是 `'1:1'`。**已记账**（见债务）。
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

/** `planImageGenFeed` 的注入（宿主 / 时间 —— 原则 4） */
export interface ImageGenFeedDeps {
  /** 原 `Pt('ig')` */
  nextId(): string;
  now(): number;
  /** 原 `Tn`：内联 `data:` 图落成本地引用 */
  persistImage(dataUrl: string): string;
}

/**
 * 生成图片流入表（原 `pushImageGenFeed`，`:27132-27161`）
 *
 * 顺序（逐行对源）：① 补缺省字段（`id`/`name`/`dataUrl` 落盘/`source`/`accountName`/`genKey`/`ts`）
 * ② 空表 ⇒ 什么都不做 ③ 按 `dataUrl` 去重（**空 dataUrl 丢弃** —— 与 `addToLibrary` 不同）
 * ④ **倒序插到最前**、上限 `IMAGE_GEN_FEED_LIMIT`。
 *
 * @returns `null` = 源里的 `return {}`（调用方**不写** store）
 */
export function planImageGenFeed(
  table: readonly ImageGenFeedItem[],
  items: readonly ImageGenFeedInput[],
  deps: ImageGenFeedDeps,
): ImageGenFeedItem[] | null {
  const mapped = (Array.isArray(items) ? items : []).filter(Boolean).map((l) => ({
    id: l.id || deps.nextId(),
    name: l.name || IMAGE_GEN_TEXT.feedFallbackName,
    dataUrl: l.dataUrl ? deps.persistImage(l.dataUrl) : l.dataUrl,
    source: l.source || 'api',
    accountName: l.accountName || null,
    genKey: l.genKey || null,
    ts: l.ts || deps.now(),
  }));
  if (mapped.length === 0) return null;

  const seen = new Set(table.map((l) => l.dataUrl));
  const added = mapped.filter((l) => l.dataUrl && !seen.has(l.dataUrl));
  if (added.length === 0) return null;

  return [...added.reverse(), ...table].slice(0, IMAGE_GEN_FEED_LIMIT);
}
