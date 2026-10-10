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
