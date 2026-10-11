/**
 * 生成配方（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `uR` shared.js:35611-35640 —— **一行摘要**（`模型 · 时长 · 比例 · 风格 · 参考图×N · 引用文本×N · 账号`）
 *   - `dR` shared.js:35641-35675 —— **多行详情**（`提示词：` / `参数：` / `风格：` / `参考图：` / `出片账号：`）
 *   - `io` shared.js:35411-35413 —— 模型 id → 展示名（已在 `prompt.ts` 的 `normalizeModelLabel`）
 *
 * ⚠️ **暂未实现 `oR`（35525-35563，配方对象的构造器）**，原因**如实说明**：
 *   `oR` 产出的是**要落进节点数据的形状**（`{v:1, mediaType, prompt, model, duration, ratio,
 *   styleId, styleName, images[{label,hash}], textRefs[{id,label}], accountId, accountName, createdAt}`），
 *   而 `stable/model/node.ts:114` 现在是 `recipe?: unknown`。
 *   把它变成**类型化形状**属改**冻结契约**（要保证与老数据逐字段一致）⇒ 与 M11 的「配方落盘」同批做，
 *   避免在此处先猜形状。`oR` 还依赖 `aR(dataUrl)`（图片哈希）与 `createdAt`（需注入 `now`）。
 *
 * ⚠️ 本模块**不接触** `window`/`document`/`Date`/随机（原则 4）。
 */

import { RECIPE_TEXT } from '@/constants/text';
import { normalizeModelLabel } from './prompt';

/**
 * 配方在节点 `data` 上的**键名**（原 `iR` shared.js:35576，**逐字** `'recipe'`）
 * ⚠️ 提为常量而不是散落的字面量：`lR`/落盘（`oR`）/视频节点三处都要用它。
 */
export const RECIPE_KEY = 'recipe';

/**
 * 配方视图（只取本模块需要的字段）
 * ⚠️ 这是**读取用的宽松视图**，不是落盘形状 —— 落盘形状待 `oR` 落地时在 `stable/model` 定义
 */
export interface RecipeViewLite {
  prompt?: string | null;
  model?: unknown;
  duration?: number | null;
  ratio?: string | null;
  styleName?: string | null;
  images?: ReadonlyArray<{ label?: string | null }> | null;
  textRefs?: ReadonlyArray<{ id?: string | null; label?: string | null }> | null;
  accountName?: string | null;
}

/**
 * 一行摘要（原 `uR` 35611）
 *
 * ⚠️ 字段**顺序即语义**：模型 → 时长 → 比例 → 风格 → 参考图×N → 引用文本×N → 账号
 * ⚠️ 各项**按真值判断**（`if (e.model)` 等）—— 空串 / `0` / `null` 都不出现
 */
export function recipeSummaryLine(recipe: RecipeViewLite | null | undefined): string {
  if (!recipe) return '';
  const parts: string[] = [];

  if (recipe.model) parts.push(normalizeModelLabel(recipe.model));
  // ⚠️ 摘要用 `durationShort`（`5s`）；`dR` 才用带前缀的 `时长 5s` —— 两者格式不同
  if (recipe.duration) parts.push(RECIPE_TEXT.durationShort(recipe.duration));
  if (recipe.ratio) parts.push(String(recipe.ratio));
  if (recipe.styleName) parts.push(String(recipe.styleName));

  const imageCount = (recipe.images || []).length;
  if (imageCount) parts.push(RECIPE_TEXT.imagesCount(imageCount));

  const refCount = (recipe.textRefs || []).length;
  if (refCount) parts.push(RECIPE_TEXT.textRefsCount(refCount));

  if (recipe.accountName) parts.push(String(recipe.accountName));

  return parts.join(RECIPE_TEXT.inlineSep);
}

/**
 * 多行详情（原 `dR` 35641）
 *
 * ⚠️ 与原实现一致的两处细节：
 *   ① 「参数」是一个**整体**：只要有 模型/时长/比例 任一，就输出 `参数：A / B / C`
 *   ② 「参考图」用 `、` 连接**各图 label**（不是计数）；label 为空时会出现空项（源码不滤）
 */
export function recipeDetailLines(recipe: RecipeViewLite | null | undefined): string {
  if (!recipe) return '';
  const lines: string[] = [];

  if (recipe.prompt) lines.push(RECIPE_TEXT.prompt(String(recipe.prompt)));

  const params: string[] = [];
  if (recipe.model) params.push(RECIPE_TEXT.model(normalizeModelLabel(recipe.model)));
  if (recipe.duration) params.push(RECIPE_TEXT.duration(recipe.duration));
  if (recipe.ratio) params.push(RECIPE_TEXT.ratio(String(recipe.ratio)));
  if (params.length) lines.push(RECIPE_TEXT.params(params.join(RECIPE_TEXT.paramSep)));

  if (recipe.styleName) lines.push(RECIPE_TEXT.style(String(recipe.styleName)));

  const images = recipe.images || [];
  if (images.length) {
    lines.push(RECIPE_TEXT.refImages(images.map((img) => String(img?.label ?? '')).join(RECIPE_TEXT.labelSep)));
  }

  if (recipe.accountName) lines.push(RECIPE_TEXT.account(String(recipe.accountName)));

  return lines.join('\n');
}

/**
 * 读节点的配方（原 `lR` 35577-35587）
 *
 * ⚠️ 与源逐字一致的三道判：**没有 `data` ⇒ `null`**；**键值不是非空对象 ⇒ `null`**
 *   （数组也算 `'object'` ⇒ 会被当配方返回 —— 源版如此，因为不会有数组配方）。
 * ⚠️ 返回的是**宽松视图**（只保证是对象）—— 调用方按 `RecipeViewLite` 的字段读。
 */
export function readRecipe(data: unknown): RecipeViewLite | null {
  if (!data || typeof data !== 'object') return null;
  const raw = (data as Record<string, unknown>)[RECIPE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return raw as RecipeViewLite;
}

/**
 * 单行截断（原 `Gk` 35599-35610）
 *
 * ⚠️ 与源逐字一致：先**把所有空白折成一个空格**再 `trim()`；空 ⇒ `''`；
 *   **超长才加省略号**（`…`，**单字符**不是 `...`）；不超长 ⇒ 原样（**已折叠过**）。
 */
export function truncateText(text: unknown, max = 46): string {
  const collapsed = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return '';
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/** 来源标签解析所需的最小节点形状 */
export interface ProvenanceNodeLike {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
}

/**
 * 「来自：X」的那个 `X`（原 `fR` 35706-35732）
 *
 * 规则（**顺序即语义**）：
 *   ① `data.sourceLabel` **优先**（显式记录了来源名就不再去查）
 *   ② 锚点 = `data.gridAnchor || data.sourceNodeId`；都没有 ⇒ `''`
 *   ③ 按 id 找节点；**找不到 ⇒ `''`**（悬空来源不编造）
 *   ④ 来源是 **`text` 节点** ⇒ 取 `text || prompt`，**剥标签 + 折空白**后
 *      **截 12 个字符**（`truncateText(…, 12)`）；正文为空 ⇒ 回落 `data.label || '文本框'`
 *   ⑤ 其它类型 ⇒ `data.label || 类型名 || ''`
 *
 * ⚠️ 两条**照抄**的细节：**(a)** 截断长度是 **12**（比 `uR` 摘要的默认 46 短得多 ——
 *   它是给 chip 用的）；**(b)** 剥标签用的是**源版那行内联正则** `/ <[^>]*> /g`，
 *   **不是** `lib/text.ts` 的 `stripHtml`（后者还会解实体）——
 *   这里要的是"一眼能读的来源名"，不是正文归一，故**不合并**（合并会改行为）。
 */
export function provenanceLabel(
  data: unknown,
  nodes: readonly ProvenanceNodeLike[] = [],
): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;

  const explicit = typeof d.sourceLabel === 'string' ? d.sourceLabel : '';
  if (explicit) return explicit;

  const anchor = d.gridAnchor || d.sourceNodeId;
  if (typeof anchor !== 'string' || !anchor) return '';

  const src = nodes.find((n) => n.id === anchor);
  if (!src) return '';

  const sd = (src.data ?? {}) as Record<string, unknown>;
  const label = typeof sd.label === 'string' ? sd.label : '';

  if (src.type === 'text') {
    const raw = typeof sd.text === 'string' ? sd.text : typeof sd.prompt === 'string' ? sd.prompt : '';
    const stripped = String(raw)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (stripped) return truncateText(stripped, 12);
    return label || '文本框';
  }

  return label || src.type || '';
}

/**
 * 视频时长显示（原 `qd` shared.js:40754-40761）
 *
 * ⚠️ **与 `RECIPE_TEXT.durationShort`（`5s`）不是同一个格式** —— 这里是 **`m:ss`**：
 *   `Math.floor(s/60)` + `:` + `String(Math.floor(s%60)).padStart(2,'0')`。
 *   两个都保留是因为源版两处都用：**配方摘要**用 `5s`（原 `uR`），**视频节点角标**用 `m:ss`（原 `BL.jsx:322`）。
 * ⚠️ 与源逐字一致：`null`/`undefined` ⇒ `''`（`if (!e && e !== 0)`），而 **`0` ⇒ `'0:00'`**。
 *   负数会得到 `-1:59` 这类串（源版不防）—— **照抄**。
 */
export function formatClock(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─────────────────────────── 按配方重跑（原 `addTextNodeFromRecipe` 29450-29494）───────────────────────────

/** 网格步长（原 `Bs` 26148 的 `20`，与本工程 `GRID_SIZE` 同值 —— 已核对） */
export const RECIPE_GRID = 20;
/** 锚点节点**没有高度**时的兜底（原 29468 的 `|| 240`） */
const FALLBACK_ANCHOR_H = 240;
/** 落在锚点**下方**的间距（原 29468 的 `+ 40`） */
const GAP_BELOW_ANCHOR = 40;
/** 没有锚点时的落点（原 29470-29471 的 `{x:120, y:120}`） */
export const RECIPE_FALLBACK_POS = { x: 120, y: 120 } as const;

/** 吸附到网格（原 `mr` 26150-26155）—— 四舍五入到最近的一格 */
export function snapToGrid(pos: { x: number; y: number }, step = RECIPE_GRID): { x: number; y: number } {
  return { x: Math.round(pos.x / step) * step, y: Math.round(pos.y / step) * step };
}

/** 本模块只要锚点的这几个字段 */
export interface RecipeAnchorLike {
  position: { x: number; y: number };
  height?: number;
  measured?: { height?: number } | null;
}

/**
 * 「按配方重跑」时新文本框的落点（原 29462-29472）
 *
 * 规则（**顺序即语义**）：
 *   ① 有锚点（`anchorNodeId` 指向的节点存在）⇒ 落在它**正下方**：
 *      `x = 锚点 x`、`y = 锚点 y + 高 + 40`（高取 `height ?? measured.height ?? **240**`）
 *   ② 没锚点 ⇒ `{120, 120}`
 *   ③ `snap` 为真 ⇒ 吸附到 **20** 的网格（原 `mr`）
 *
 * ⚠️ 与源一致：**只加 `height`，不改 `x`**（不会像"田字格铺开"那样错位排布）。
 * ⚠️ 时间/随机都不涉及 ⇒ 纯函数，可测。
 */
export function recipeTextNodePosition(
  anchor: RecipeAnchorLike | null | undefined,
  snap: boolean,
): { x: number; y: number } {
  const raw = anchor
    ? {
        x: anchor.position?.x || 0,
        y: (anchor.position?.y || 0) + (anchor.height || anchor.measured?.height || FALLBACK_ANCHOR_H) + GAP_BELOW_ANCHOR,
      }
    : { x: RECIPE_FALLBACK_POS.x, y: RECIPE_FALLBACK_POS.y };
  return snap ? snapToGrid(raw) : raw;
}

/** 配方缺字段时的兜底（原 29485-29486 的 `|| 7` 与 `|| '16:9'`） */
export const RECIPE_TEXT_FALLBACKS = { duration: 7, ratio: '16:9' } as const;
