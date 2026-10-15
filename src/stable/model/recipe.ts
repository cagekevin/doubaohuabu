/**
 * 生成配方（`recipe`）—— ★ 冻结契约（**落进节点 `data.recipe` 的值形状**）
 *
 * 归属：与 `./node` 的 `GenHistory` 同类 —— 「值形状」属 `stable`（L1），不属 `core`（L2）
 *   （放 `core` 会造出 `stable/migrations → core/rules` 的**反向依赖**）。
 *
 * ★ **唯一产生方** = `core/rules/recipe.makeRecipe`（原 `oR` `shared.js:35525-35563`）——
 *   本类型就是它的**输出形状**。读侧由同文件的 `readRecipe`（原 `lR`）收回。
 */

/**
 * 配方在节点 `data` 上的**键名**（原 `iR` `shared.js:35576`，**逐字** `'recipe'`）
 * ⚠️ 冻结键名（旧工程数据里就是这个字面量）⇒ SSOT 只此一处（与 `node.ts` 的 `GEN_HISTORY_KEY` 同法）。
 */
export const RECIPE_KEY = 'recipe';

/** 配方里的一张参考图（原 `oR` 的 `images` 元素） */
export interface RecipeImageRef {
  /** 素材名（缺省 `'素材'`） */
  label: string;
  /** 源 `aR(dataUrl)` 的 DJB2 短哈希（`h<base36>`）—— 无 `dataUrl` ⇒ 空串 */
  hash: string;
}

/** 配方里的一条引用文本（原 `oR` 的 `textRefs` 元素） */
export interface RecipeTextRef {
  id: string;
  label: string;
}

/** 生成配方（原 `oR` 的产物形状）—— 落进节点 `data.recipe`，由 `readRecipe` 读回 */
export interface Recipe {
  /** 版本号（源固定 `1`） */
  v: 1;
  mediaType: string;
  prompt: string;
  model: string | null;
  duration: number | null;
  ratio: string | null;
  styleId: string | null;
  styleName: string;
  images: RecipeImageRef[];
  textRefs: RecipeTextRef[];
  accountId: string | null;
  accountName: string;
  /** 构造时刻（源 `Date.now()` ⇒ 本仓**由调用方注入**，原则 4） */
  createdAt: number;
}
