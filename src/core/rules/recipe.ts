/**
 * 生成配方（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `uR` shared.js:35611-35640 —— **一行摘要**（`模型 · 时长 · 比例 · 风格 · 参考图×N · 引用文本×N · 账号`）
 *   - `dR` shared.js:35641-35675 —— **多行详情**（`提示词：` / `参数：` / `风格：` / `参考图：` / `出片账号：`）
 *   - `io` shared.js:35411-35413 —— 模型 id → 展示名（已在 `prompt.ts` 的 `normalizeModelLabel`）
 *
 * ⚠️ **`oR`（35525-35563，配方对象的构造器）已落** —— `makeRecipe` ＋ 图片哈希 `recipeImageHash`（原 `aR`）。
 *   产出落进节点数据的形状（`{v, mediaType, prompt, model, duration, ratio, styleId, styleName,
 *   images[{label,hash}], textRefs[{id,label}], accountId, accountName, createdAt}`）。
 *   ⚠️ `createdAt` 由**调用方注入**（原则 4）· `aR` 是**独立的一份**哈希（不是 `lib/hash.hash32`）。
 * ⚠️ **`d0`（35576-35706，从源节点派生 `{recipe, sourceLabel}` 给新视频节点）** = `deriveNodeRecipe`。
 * ⚠️ **值形状真源 = `stable/model/recipe`**（`Recipe` ＋ `RECIPE_KEY`）：写入方 `makeRecipe`
 *   产出它、`VideoNodeData.recipe` 声明它；读侧 `readRecipe` 只保证「是非空对象」并收成
 *   `RecipeViewLite`（节点数据可能来自磁盘 ⇒ 读侧不假设形状合法）。
 *
 * ⚠️ 本模块**不接触** `window`/`document`/`Date`/随机（原则 4）。
 */

import { RECIPE_TEXT } from '@/constants/text';
import { NODE_DEFAULT_RATIO_LABEL } from '@/constants/models';
// ★ 文本节点默认标签的真源（`TD-16-149`：本文件原两处内联 `'文本框'`，与 `TEXT_NODE_LABEL` 同命题）
import { TEXT_NODE_LABEL } from '@/stable/model/node';
import { RECIPE_KEY, type Recipe } from '@/stable/model/recipe';
import { pad2 } from '@/lib/time';
import { asRecord } from '@/lib/object';
import { normalizeModelLabel } from './prompt';

/**
 * 配方视图（只取本模块需要的字段）
 * ⚠️ 这是**读取用的宽松视图**（节点数据可能来自磁盘）—— 落盘形状的真源 = `stable/model/recipe.Recipe`
 */
export interface RecipeViewLite {
  prompt?: string | null;
  model?: unknown;
  duration?: number | null;
  ratio?: string | null;
  /**
   * 风格 **id** —— ★ 「按配方重跑」要用它填新节点的 `styleIds`（源 `BL.jsx:176` 的 `it.styleId`）。
   * 配方里确实存了它（写入端 `state/batchSend` 的 `styleId: styleIds[0] ?? null`）；
   * 漏读它的症状 = 重跑出来的提示词**丢风格**（TD-16-127）。
   */
  styleId?: string | null;
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
  const raw = asRecord(data)[RECIPE_KEY];
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
  /** 该节点的 `data`（**不可信** —— 可能来自磁盘/旧版本）⇒ 读前过 `asRecord` */
  data?: unknown;
}

/** 「来源锚点」派生所需的节点 `data`（只读最小面） */
export interface SourceAnchorData {
  /** 网格锚点（`VideoNodeData.gridAnchor`） */
  gridAnchor?: string;
  /** 旧数据里的来源节点 id（`VideoNodeData.sourceNodeId`） */
  sourceNodeId?: string;
}

/**
 * 「来源」判据所需的**发起节点** `data`（只读最小面）
 * ★ 形状真源 = `stable/model` 的 `VideoNodeData`（`sourceLabel` / `gridAnchor` / `sourceNodeId`）
 */
export interface ProvenanceSourceData extends SourceAnchorData {
  /** 显式来源名（`VideoNodeData.sourceLabel`） */
  sourceLabel?: string;
}

/**
 * 节点的**来源锚点**（源 `fR` 35706 / `d0` 35676 的 `d.gridAnchor || d.sourceNodeId`）—— ★ 纯函数
 *
 * ★ **唯一实现**（判据 C1「三振出局」的前置判断）：这条派生链此前**抄在 2 处** ——
 *   本文件的 `provenanceLabel`（查锚点节点拿**来源标签**）与 `ui/nodes/VideoNode` 的
 *   「定位到源节点」（查锚点节点**居中视口**）⇒ 收成一处。
 * ⚠️ 两处**下游语义不同**、**取哪个 id 是同一命题** —— 所以要收的是「取 id」这半步，不是那两个动作。
 * ⚠️ 空结果返回 `''`（源的两级 `||` 落空）；两个字段在类型上都已是 `string`（`VideoNodeData`），
 *    对**脏值**的处置口径见 `docs/DATAFLOW.md` §二十一 与轮次文件「决策留痕」。
 */
export function sourceAnchorOf(data: SourceAnchorData | null | undefined): string {
  return data?.gridAnchor || data?.sourceNodeId || '';
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
  data: ProvenanceSourceData | null | undefined,
  nodes: readonly ProvenanceNodeLike[] = [],
): string {
  const explicit = typeof data?.sourceLabel === 'string' ? data.sourceLabel : '';
  if (explicit) return explicit;

  const anchor = sourceAnchorOf(data);
  if (!anchor) return '';

  const src = nodes.find((n) => n.id === anchor);
  if (!src) return '';

  const sd = asRecord(src.data);
  const label = typeof sd.label === 'string' ? sd.label : '';

  if (src.type === 'text') {
    const raw = typeof sd.text === 'string' ? sd.text : typeof sd.prompt === 'string' ? sd.prompt : '';
    const stripped = String(raw)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (stripped) return truncateText(stripped, 12);
    return label || TEXT_NODE_LABEL;
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
  return `${m}:${pad2(s)}`;
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

/**
 * 配方缺字段时的兜底（原 29485-29486 的 `|| 7` 与 `|| '16:9'`）
 *
 * ⚠️ **2026-10-12 收口**：`ratio` 此前**又写了一遍字面量 `'16:9'`** ——
 *   与 `NODE_DEFAULTS.text.aspectRatio`（现为 4:3）**不是同一个值** ⇒ 同一份"默认比例"
 *   在仓里有两处、改一处另一处静默漂。现吃 `NODE_DEFAULT_RATIO_LABEL` 这一处真源。
 * ⚠️ `duration` 的 `7` 与 `NODE_DEFAULTS.text.duration` 同值但**不是同一个语义槽**
 *   （这里是"配方缺字段"的兜底，那里是"新节点默认"）—— 暂各留一份，同值巧合。
 */
export const RECIPE_TEXT_FALLBACKS = { duration: 7, ratio: NODE_DEFAULT_RATIO_LABEL } as const;

// ─────────── 配方对象（原 `oR` 35525-35563 ＋ 图片哈希 `aR` 35564-35575）───────────
// ⚠️ 值形状（`Recipe` / `RecipeImageRef` / `RecipeTextRef` / `RECIPE_KEY`）的**真源在 `stable/model/recipe`**
//    （它是落进节点 `data.recipe` 的冻结契约，属 L1）—— 本文件只**引用**，不另立一份。

/**
 * 配方里的图片哈希（原 `aR`，`shared.js:35564-35575`）—— ★ 纯函数
 *
 * 逐字：DJB2（种子 `5381`，`n = ((n<<5)+n+charCode)>>>0`）→ `h${n.toString(36)}`；
 * **只取前 4096 字符**；空串 ⇒ `''`。
 * ⚠️ 与 `lib/hash.hash32`（FNV-1a）**不是一回事** —— 源为配方单独写了一份，照抄。
 */
export function recipeImageHash(dataUrl: unknown): string {
  const s = String(dataUrl || '');
  if (!s) return '';
  let n = 5381;
  const len = Math.min(s.length, 4096);
  for (let i = 0; i < len; i += 1) {
    n = ((n << 5) + n + s.charCodeAt(i)) >>> 0;
  }
  return `h${n.toString(36)}`;
}

export interface MakeRecipeInput {
  /** 组装后的正文（源 `oR` 的 `body`） */
  body: unknown;
  model?: string | null;
  duration?: number | null;
  ratio?: string | null;
  styleId?: string | null;
  /** 命中风格名 `join('、')`（源 `oR` 的 `styleName`） */
  styleName?: string;
  images?: ReadonlyArray<{ label?: unknown; dataUrl?: unknown }>;
  textRefs?: ReadonlyArray<{ id?: unknown; label?: unknown }>;
  accountId?: string | null;
  accountName?: string;
  /** 缺省 `'video'` */
  mediaType?: string;
}

/**
 * 构造生成配方（原 `oR`，`shared.js:35525-35563`）—— ★ 纯函数
 *
 * ⚠️ `createdAt` 由**调用方注入**（`core` 不读 `Date`，原则 4）。
 * ⚠️ `model` / `ratio` 用 `||`（空串 ⇒ `null`）；`duration` 用 `Number.isFinite`（非数 ⇒ `null`）—— 逐字对源。
 */
export function makeRecipe(input: MakeRecipeInput, now: number): Recipe {
  const num = Number(input.duration);
  return {
    v: 1,
    mediaType: input.mediaType || 'video',
    prompt: String(input.body ?? '').trim(),
    model: input.model || null,
    duration: Number.isFinite(num) ? num : null,
    ratio: input.ratio || null,
    styleId: input.styleId || null,
    styleName: input.styleName || '',
    images: (input.images ?? []).map((f) => ({
      label: f && f.label ? String(f.label) : '素材',
      hash: f && f.dataUrl ? recipeImageHash(f.dataUrl) : '',
    })),
    textRefs: (input.textRefs ?? []).map((f) => ({
      id: f && f.id ? String(f.id) : '',
      label: f && f.label ? String(f.label) : '',
    })),
    accountId: input.accountId || null,
    accountName: input.accountName || '',
    createdAt: now,
  };
}

/**
 * 从**源节点**派生要落进新视频节点的两样东西（原 `d0`，`shared.js:35676-35706`）—— ★ 纯函数
 *
 * 逐字：
 *   · `recipe` ← `nodeRecipes[sourceNodeId]`（有才给）
 *   · `sourceLabel` ← 源节点自己的标签：**`text` 节点** ⇒ 正文（剥标签 + 折空白）**截 12 字**，
 *     空则 `label || '文本框'`；**其它类型** ⇒ `label || name`（空则不给）
 *
 * ⚠️ 与 `provenanceLabel`（原 `fR`）**不是同一个函数**、**不合并**：那个从**视频节点**出发
 *   （读它的 `gridAnchor`/`sourceNodeId` 再回查源节点），本函数**直接吃源节点 id**；
 *   且两处 `else` 分支不同（`d0` 用 `name`、`fR` 用 `type`）。
 */
export function deriveNodeRecipe(
  nodes: readonly ProvenanceNodeLike[],
  nodeRecipes: Record<string, Recipe> | null | undefined,
  sourceNodeId: string | null | undefined,
): { recipe?: Recipe; sourceLabel?: string } {
  const out: { recipe?: Recipe; sourceLabel?: string } = {};
  if (!sourceNodeId) return out;
  const r = nodeRecipes ? nodeRecipes[sourceNodeId] : null;
  if (r) out.recipe = r;
  const s = nodes.find((n) => n.id === sourceNodeId);
  if (!s) return out;
  const d = asRecord(s.data);
  let label = '';
  if (s.type === 'text') {
    const raw = String(d.text || d.prompt || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    label = raw ? truncateText(raw, 12) : String(d.label || TEXT_NODE_LABEL);
  } else {
    label = String(d.label || d.name || '');
  }
  if (label) out.sourceLabel = label;
  return out;
}
