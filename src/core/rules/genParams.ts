/**
 * 「发送前要不要把生成参数下发到页面底栏」—— 原 **`Be` 的 Phase 2c** 的取参与闸（`_Component43.jsx:1058-1063`）
 *
 * 源逐字：
 * ```
 * const st = me.params;
 * const dt = st && (st.aspectRatio || st.duration != null || st.modelLabel);
 * if (qe) { …跳过（dola 无生成参数控件）… }
 * else if (dt) { …应用… } else { …Phase 2c: 跳过（无生成参数）… }
 * ```
 * ⇒ 本文件只做**那两件事**：① 从 `params` 取三个值 ② 判「有没有任何一项」（没有 ⇒ 调用方跳过）。
 *    **dola 那一档不在本文件**（它是**账号类型**的判定，属调用方 —— 见 `adapters/site/doubao/index.ts`）。
 *
 * ⚠️ **`modelLabel` 读的是 `params.modelLabel`，而 payload 的 `params` 只有 `{aspectRatio, duration, model}`**
 *   （`shared.js:40658-40662`；模型标签被 `$L` 算在**顶层** `modelLabel`，`:41418`）⇒ **源侧该值恒为 `null`**，
 *   即**模型档其实从未被设置**。本仓**照抄**（不擅自改成 `io(params.model)`）—— 这是**疑似源笔误**，
 *   已登记待裁。**不要"顺手修正"它**：那样会与源行为不同。
 *
 * ⚠️ 本模块**不碰** `window`/`Date`/随机（原则 4）—— 纯取值 + 纯判定，故可单测（原则 7）。
 */

/** Phase 2c 要下发的三个值（源 `wt` 的入参形状） */
export interface GenParamsToApply {
  aspectRatio?: string | null;
  duration?: number | null;
  modelLabel?: string | null;
}

/**
 * 从 `payload.params` 取「页面脚本要的三个值」（源 `Be` `:1058-1063`）
 *
 * ⚠️ 三处**逐字对源**的取值口径：
 *   · `aspectRatio` / `modelLabel` 只认**字符串**（非字符串 ⇒ `null`）
 *   · `duration` 只认**数字**，**`0` 是有效值**（源判的是 `!= null`，不是真值）
 *   · `modelLabel` 读 `params.modelLabel`（**见文件头注：该键不存在 ⇒ 恒 `null`**）
 *
 * @returns `null` = **三项都没有** ⇒ 调用方走源那句 "Phase 2c: 跳过（无生成参数）"
 */
export function collectGenParams(
  params: Record<string, unknown> | null | undefined,
): GenParamsToApply | null {
  const p = params ?? {};
  const aspectRatio = typeof p.aspectRatio === 'string' ? p.aspectRatio : null;
  const duration = typeof p.duration === 'number' ? p.duration : null;
  const modelLabel = typeof p.modelLabel === 'string' ? p.modelLabel : null;
  if (!aspectRatio && duration == null && !modelLabel) return null;
  return { aspectRatio, duration, modelLabel };
}
