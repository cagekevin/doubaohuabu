/**
 * 数组工具（★ 无状态原语，L0）
 *
 * ⚠️ **为什么放 `lib/`**（判据 A1）：通用数组原语（纯函数、不读时钟、无副作用）——
 *    `core`／`state`／`ui` 各层都能依赖，与 `lib/math.ts` 的 `clamp` 同性质。
 *
 * ⚠️ **唯一实现**（判据 C1 三振出局）：`pop` / `shift` 的「取值 + 空表检查」只在本文件 ——
 *    别处再写一份 = 同一真相两份。此前三处调用点
 *    （`core/rules/accountNode.ts:157` · `:182` · `core/rules/graph.ts:162`）各写
 *    `pop() as string` / `shift() as string` ⇒ 把 `Array#pop` 的 `T | undefined` **压成 `T`**，
 *    **空表时 `undefined` 静默流过**（`TD-02-30`）。
 *
 * ⚠️ 语义：调用方由循环守卫（`while (xs.length)`）**已保证非空** ⇒ 这里把「非空」这条不变式
 *    **编码一次**：空 ⇒ **抛**（失败可见）—— 不是把 `undefined` 藏进类型里。
 *    与「`??` / `return null` 兜底」的区别：那种让缺失**看不出**，这里让缺失**响**。
 */

/** 弹出栈顶（末位）；**空表 ⇒ 抛**（把 `Array#pop` 的 `T | undefined` 收成 `T`） */
export function popOrThrow<T>(list: T[]): T {
  const v = list.pop();
  if (v === undefined) throw new Error('popOrThrow: 空表');
  return v;
}

/** 弹出队首（首位）；**空表 ⇒ 抛**（把 `Array#shift` 的 `T | undefined` 收成 `T`） */
export function shiftOrThrow<T>(list: T[]): T {
  const v = list.shift();
  if (v === undefined) throw new Error('shiftOrThrow: 空表');
  return v;
}
