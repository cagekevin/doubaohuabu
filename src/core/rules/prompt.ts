/**
 * 提示词组装（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：
 *   - `io`  shared.js:35411-35413 —— 模型 id → 展示名（未知则原样，空则默认）
 *   - `tR`  shared.js:35414        —— 13 条「已生成痕迹」剥离模式
 *   - `nR`  shared.js:35415-35426  —— 是否已是「格式化过的」提示词
 *   - `Vk`  shared.js:35427-35435  —— 反复剥离直到稳定（上限 8 轮）
 *   - `rR`  shared.js:35436-35449  —— 视频参数后缀
 *   - `im`  shared.js:35451-35485  —— 通用组装（风格前缀 + 媒体类型）
 *   - `PL`  shared.js:40361-40410  —— 图片报文（含 5 条**幂等剥离**）
 *   - `TL`  shared.js:40318-40360  —— 视频报文
 *
 * ⚠️ **W7（幂等）**：正文里已含的「画一张：」「图片分辨率」「使用…模型」「生成 N 张图片」「画面比例」
 *    必须先**剥离**再组装，否则重复出现。
 * ⚠️ **W8（风格）**：风格 = **纯前缀拼接**（`${stylePrefix}${body}`），无分隔符。
 */

import { DEFAULT_VIDEO_MODEL, VIDEO_MODEL_LABELS } from '@/constants/models';
// ★ SSOT 收口：`@[id|label]` 正则与 `参考图N` token **只有一份**（`refs.ts` 是 `@图N` 协议的归属模块）
import { createRefChipRe, formatReferenceLabel } from './refs';

/** 模型 id → 展示名（原 `io`；未知 id 原样返回，空则回落默认） */
export function normalizeModelLabel(model: unknown): string {
  const id = String(model ?? '');
  return VIDEO_MODEL_LABELS[id] ?? (id || VIDEO_MODEL_LABELS[DEFAULT_VIDEO_MODEL]!);
}

/**
 * 「已生成痕迹」剥离模式（原 `tR`，13 条，顺序敏感）
 * ⚠️ 顺序即语义：先剥「视频生成」前缀，再剥参数后缀
 */
export const GENERATED_ARTIFACT_PATTERNS: readonly RegExp[] = [
  /^[\s，,。]*视频生成\s*[：:，,-]?\s*/i,
  /[，,]\s*画面比例\s*[\d.]+\s*[:：/]\s*[\d.]+/g,
  /[，,]?\s*--模型[：:]\s*[A-Za-z0-9 ._-]+/gi,
  /^[\s，,。]*使用[^，。；]{0,24}模型[，,]?\s*生成一段\s*\d+\s*秒的(?:视频|短片|片段)[，,]?\s*比例为\s*[0-9:]+\s*[，,]?\s*内容为[：:]\s*/,
  /^[\s，,。]*使用[^，。；]{0,24}模型[，,]?\s*生成[，,]?\s*比例为\s*[0-9:]+\s*的\s*\d+\s*秒(?:视频|短片)[，,]?\s*内容为[：:]\s*/,
  /[，,]?\s*请直接开始生成[^。；\n]*/g,
  /[，,]?\s*无需确认参数[^。；\n]*/g,
  /[，,]?\s*不要反问[^。；\n]*/g,
  /[，,]?\s*本轮内容生成时请不要进行澄清[^。；\n]*/g,
  /[，,]?\s*时长[：:]\s*\d+\s*秒/g,
  /[，,]?\s*duration\s*=\s*\d+/gi,
  /\s*--比例[：:]\s*[0-9:]+/g,
  /\s*--时长[：:]\s*\d+/g,
];

/**
 * 反复剥离「已生成痕迹」直到稳定（原 `Vk`）
 *
 * ⚠️ 与源码一致：**最多 8 轮**（防某些模式互相触发导致死循环）
 */
export function stripGeneratedArtifacts(text: unknown): string {
  let t = String(text ?? '');
  if (!t) return '';
  let prev: string;
  let rounds = 0;
  do {
    prev = t;
    for (const re of GENERATED_ARTIFACT_PATTERNS) t = t.replace(re, '');
    t = t.replace(/^[\s，,。：:]+/, '').replace(/[\s，,。]+$/, '');
    rounds += 1;
  } while (t !== prev && rounds < 8);
  return t.trim();
}

/** 是否已是「格式化过的」提示词（原 `nR`）—— 命中则**不再包装**，避免套娃 */
export function isPreformatted(text: unknown): boolean {
  const t = String(text ?? '');
  return (
    /使用[^，。；]{0,24}模型[，,]?\s*生成一段\s*\d+\s*秒的/.test(t) ||
    /请直接开始生成/.test(t) ||
    /无需确认参数/.test(t) ||
    /--模型[：:]/.test(t) ||
    /画面比例\s*[\d.]+\s*[:：/]\s*[\d.]+/.test(t) ||
    /duration\s*=\s*\d+/.test(t)
  );
}

/**
 * 视频参数后缀（原 `rR`）
 * 图片通道返回空串（图片的参数在正文里）
 */
export function videoParamsSuffix(opts: {
  model?: unknown;
  duration?: unknown;
  ratio?: unknown;
  mediaType?: 'video' | 'image';
}): string {
  if (opts.mediaType === 'image') return '';
  const model = normalizeModelLabel(opts.model);
  const duration = Number.isFinite(Number(opts.duration)) ? Number(opts.duration) : 5;
  const ratio = opts.ratio && opts.ratio !== 'auto' ? String(opts.ratio) : '16:9';
  return `，画面比例 ${ratio}，duration=${duration}，--模型:${model}`;
}

/**
 * 通用组装（原 `im`）
 *
 * | mediaType | 行为 |
 * |---|---|
 * | `image` | **纯前缀拼接**：`${stylePrefix}${body}`（无分隔符） |
 * | `video`（已格式化） | 补前缀（若正文里还没有），**不套娃** |
 * | `video`（未格式化） | `视频生成 ${stylePrefix}${body}${参数后缀}` |
 */
export function composeBody(opts: {
  body?: unknown;
  model?: unknown;
  duration?: unknown;
  ratio?: unknown;
  stylePrefix?: unknown;
  mediaType?: 'video' | 'image';
}): string {
  const body = String(opts.body ?? '').trim();
  if (!body) return '';
  const prefix = String(opts.stylePrefix ?? '').trim();

  if (opts.mediaType === 'image') {
    return prefix ? `${prefix}${body}` : body;
  }

  if (isPreformatted(body)) {
    // 已是格式化结果：只在「正文里还没含该前缀」时补上
    return prefix && body.indexOf(prefix) === -1 ? `${prefix}${body}` : body;
  }

  const suffix = videoParamsSuffix({
    model: opts.model,
    duration: opts.duration,
    ratio: opts.ratio,
    mediaType: 'video',
  });
  return `视频生成 ${prefix || ''}${body}${suffix}`;
}

/** 图片张数夹取（原 `PL`：`Math.max(1, Math.min(4, s | 0 || 1))`） */
export function clampImageCount(count: unknown): number {
  return Math.max(1, Math.min(4, (Number(count) | 0) || 1));
}

/** 分辨率白名单（原 `PL`：`/^(1K|2K|4K)$/`） */
export function normalizeResolution(resolution: unknown): string {
  const s = String(resolution ?? '').trim();
  return /^(1K|2K|4K)$/.test(s) ? s : '';
}

/**
 * 图片提示词（原 `PL` 的文本部分）
 *
 * **幂等剥离 5 条**（顺序即语义）：
 *   ① `^画一张[:：]\s*`                        （前缀）
 *   ② `[,，]\s*图片分辨率\s*(?:1K|2K|4K)\s*$`   （后缀）
 *   ③ `[,，]\s*使用\s*[^，,]{1,40}模型\s*$`     （后缀）
 *   ④ `[,，]\s*(?:只|仅)?\s*生成\s*\d+\s*张图片\s*$`（后缀）
 *   ⑤ `[,，]\s*画面比例\s*\d+\s*:\s*\d+\s*$`    （后缀）
 *
 * 组装：`画一张：${body}${，画面比例 X}，${生成 N 张图片|只生成 1 张图片}${，使用 M 模型}${，图片分辨率 R}`
 */
export function composeImagePrompt(opts: {
  text?: unknown;
  stylePrefix?: unknown;
  ratio?: unknown;
  count?: unknown;
  model?: unknown;
  resolution?: unknown;
}): string {
  let body = String(opts.text ?? '').trim();
  body = body
    .replace(/^画一张[:：]\s*/, '')
    .replace(/[,，]\s*图片分辨率\s*(?:1K|2K|4K)\s*$/, '')
    .replace(/[,，]\s*使用\s*[^，,]{1,40}模型\s*$/, '')
    .replace(/[,，]\s*(?:只|仅)?\s*生成\s*\d+\s*张图片\s*$/, '')
    .replace(/[,，]\s*画面比例\s*\d+\s*:\s*\d+\s*$/, '')
    .trim();

  const withStyle = composeBody({ body, stylePrefix: opts.stylePrefix, mediaType: 'image' });
  const count = clampImageCount(opts.count);
  const countText = count > 1 ? `生成 ${count} 张图片` : '只生成 1 张图片';
  const ratio = opts.ratio && opts.ratio !== 'auto' ? String(opts.ratio) : '';
  const model = String(opts.model ?? '').trim();
  const resolution = normalizeResolution(opts.resolution);

  return (
    `画一张：${withStyle}` +
    (ratio ? `，画面比例 ${ratio}` : '') +
    `，${countText}` +
    (model ? `，使用 ${model} 模型` : '') +
    (resolution ? `，图片分辨率 ${resolution}` : '')
  );
}

/**
 * 视频提示词（原 `TL` 的文本部分）
 * 组装：`composeBody({mediaType:'video'})`（已格式化则不套娃）
 */
export function composeVideoPrompt(opts: {
  text?: unknown;
  model?: unknown;
  duration?: unknown;
  ratio?: unknown;
  stylePrefix?: unknown;
}): string {
  return composeBody({
    body: opts.text,
    model: opts.model,
    duration: opts.duration,
    ratio: opts.ratio,
    stylePrefix: opts.stylePrefix,
    mediaType: 'video',
  });
}

/**
 * 引用替换（原 `Qc`）—— `@[id|label]` → `参考图N`
 *
 * ⚠️ 正则与 token 都复用 `refs.ts`（原 `U0` / `参考图N`）—— 协议只有一份定义（SSOT）。
 *    `refs.ts` 的头部有**协议全景表**（5 个操作各在哪），改协议请先看那里。
 *
 * @param text 含 `@[nodeId|显示名]` 的文本
 * @param refMap `nodeId → 序号`（1 起）
 */
export function resolveReferences(text: string, refMap: Record<string, number> | null | undefined): string {
  if (!text) return '';
  return text.replace(createRefChipRe(), (whole, id: string, label: string) => {
    const n = refMap && Object.prototype.hasOwnProperty.call(refMap, id) ? refMap[id] : null;
    if (n != null) return formatReferenceLabel(n);
    return label || whole;
  });
}

/** 风格前缀拼接（原 `im` 的 image 分支）—— 纯前缀，**无分隔符**（W8） */
export function applyStylePrefix(body: string, stylePrefix: string): string {
  const prefix = String(stylePrefix ?? '').trim();
  return prefix ? `${prefix}${body}` : body;
}
