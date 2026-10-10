/**
 * 回复类型分类（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐条回源抄录**，非推断）：
 *   - `lm` shared.js:36554 —— 哨兵句 `现在有视频在生成吗`（页面常驻提示，**不算**新回复）
 *   - `ia` shared.js:36560-36562 —— 空白归一（已抽到 `lib/text`）
 *   - `FR` shared.js:36571-36578 —— 否定型（"没有在生成"）
 *   - `BR` shared.js:36579-36586 —— 询问型（"要不要开始生成"）
 *   - `HR` shared.js:36587-36594 —— 排队型（"排队生成中"）
 *   - `WR` shared.js:36595-36625 —— **分类器**（顺序 FR → BR → HR，命中即停；空 → `no-reply`）
 *   - `VR` shared.js:36626-36630 —— 「是否算新回复」
 *
 * ⚠️ 与 `failure.ts` **必须分开**（判据 H1）：
 *   · `failure` 分类的是**发送失败**（14 类）→ 决定 `give-up`/`retry-switch`/`retry`；
 *   · 本模块分类的是**模型回复内容**（5 类）→ 决定"生成到底开始了没"。
 *   两者混在一起 ⇒ 无法单独测试与扩展（`docs/04` 附表末尾明确要求不可混）。
 *
 * ⚠️ 本模块**不接触** `window` / `Date` / 随机（原则 4）。
 */

import { normalizeSpace } from '@/lib/text';

/** 回复类型（原 `WR` 的 `kind`） */
export const REPLY_KINDS = ['none', 'offer', 'busy', 'other', 'no-reply'] as const;
export type ReplyKind = (typeof REPLY_KINDS)[number];

/** 分类结果（原 `WR` 返回 `{kind, reply}`） */
export interface ReplyKindResult {
  kind: ReplyKind;
  /** 页面上**确实有**回复文本（`no-reply` 时恒为 `false`） */
  reply: boolean;
}

/** 哨兵句（原 `lm` 36554）—— 页面常驻提示，**不得**当成新回复 */
export const REPLY_SENTINEL = '现在有视频在生成吗';

/** 否定型（原 `FR` 中文半） */
const RE_NONE =
  /^没有[，,]?|目前没有.{0,16}视频|没有.{0,12}视频.{0,16}生成|没有正在生成|也不在生成队列|也没有正在生成|查不到有效任务|尚未正式提交|处于待启动/;
/** 否定型（原 `FR` 英文半） */
const RE_NONE_EN =
  /\bno\s+(?:video|task).{0,24}(?:generat|queue)|not\s+(?:currently\s+)?generat|nothing\s+(?:is\s+)?(?:being\s+)?generat|no\s+(?:active|pending)\s+(?:video|generation)/i;

/** 询问型（原 `BR` 中文半） */
const RE_OFFER = /需要我现在立刻|要不要现在.{0,12}开始生成|开始生成这个短视频吗/;
/** 询问型（原 `BR` 英文半） */
const RE_OFFER_EN =
  /shall\s+I\s+(?:start\s+)?generat|want\s+me\s+to\s+(?:start\s+)?generat|start\s+generating\s+(?:this\s+)?(?:short\s+)?video\s+now/i;

/** 排队型（原 `HR` 中文半） */
const RE_BUSY = /排队生成中|正在生成|还在排队|生成队列|已进入生成队列|预计等待|已提交|已经提交生成|生成中/;
/** 排队型（原 `HR` 英文半） */
const RE_BUSY_EN = /\b(?:is\s+)?(?:generating|rendering|in\s+(?:the\s+)?queue|queued|processing)\b/i;

/** 否定型判定（原 `FR`）—— 空文本 → `false`（源码即如此，**不**归 none） */
export function isNoGeneration(text: unknown): boolean {
  const t = normalizeSpace(text);
  if (!t) return false;
  return RE_NONE.test(t) || RE_NONE_EN.test(t);
}

/** 询问型判定（原 `BR`） */
export function isOfferToStart(text: unknown): boolean {
  const t = normalizeSpace(text);
  if (!t) return false;
  return RE_OFFER.test(t) || RE_OFFER_EN.test(t);
}

/** 排队型判定（原 `HR`） */
export function isGenerating(text: unknown): boolean {
  const t = normalizeSpace(text);
  if (!t) return false;
  return RE_BUSY.test(t) || RE_BUSY_EN.test(t);
}

/**
 * 分类（原 `WR`）
 * ⚠️ **分支顺序即优先级**：`none` → `offer` → `busy` → `other`（命中即停，不可重排）
 */
export function classifyReply(text: unknown): ReplyKindResult {
  const t = normalizeSpace(text);
  if (!t) return { kind: 'no-reply', reply: false };
  if (isNoGeneration(t)) return { kind: 'none', reply: true };
  if (isOfferToStart(t)) return { kind: 'offer', reply: true };
  if (isGenerating(t)) return { kind: 'busy', reply: true };
  return { kind: 'other', reply: true };
}

/**
 * 是否算「新回复」（原 `VR` 36626）
 *
 * 规则：当前文本非空、**不等于哨兵句**、且与上一次文本不同。
 */
export function isNewReply(prev: unknown, cur: unknown): boolean {
  const p = normalizeSpace(prev);
  const c = normalizeSpace(cur);
  return !!c && c !== REPLY_SENTINEL && (!p || c !== p);
}
