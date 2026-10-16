/**
 * 编辑器选区原语（★ 纯 DOM 工具 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：
 *   - `SL` shared.js:40116-40140 —— 取「插入点**之前**的文本」（`@` 引用菜单据此判断用户正在打什么）
 *
 * ★ **为什么只有 `SL`**：源里取「插入点 Range」有两个近似实现（`D0` 40093 · `Ia` 42788），
 *    都服务**站点页**的选区；本仓对应链路（`TextNode.pickRef` / `GenPanel.openAtPicker`）
 *    **刻意不用「存的插入点」**（用"末尾"这个确定位置，避免选区丢失后插到随机位置）
 *    ⇒ 那条能力在本仓**无链路**，不落。
 *
 * ★ **归属**：`SL` 用 `window.getSelection()` / `document.createRange()`，操作的是**我们自己文档**
 *    （画布文本框 / 生成面板编辑器），**不是站点页** ⇒ 按 A1「无状态工具 → `lib`」落在这里。
 *    （同类先例：`lib/image.ts`、`lib/editorText.ts` 也是 DOM 工具。）
 *
 * ⚠️ 本模块**不含业务规则**（不判断 `@`、不组装引用芯片）—— 只提供「拿光标前文本」。
 * ⚠️ **不返回 `Result`**：`lib` 是 L0，`Result` 在 `core/model`（L2）⇒ 上层依赖会反向（分层禁止）。
 *    故与 `lib/image.ts` 的 `loadImage` 一致：**要么抛，要么用语义明确的哨兵值**（见 `textBeforeCaret`）。
 */

/**
 * 取「插入点**之前**的文本」（原 `SL` 40116）
 *
 * 用法：`@` 引用菜单拿它判断用户刚打了什么（如 `@素材` 的前缀）。
 *
 * ⚠️ **返回空串的四种情形都是「没有可用的前缀文本」这一语义本身**（不是把错误吞掉）：
 *    ① 没有容器；② 没有选区；③ 光标不在容器内；④ `setEnd` 抛（Range 与节点不匹配）。
 *    四者对调用方的含义一致 ⇒ 用哨兵值 `''`，无需 `Result`。
 */
/**
 * 取「插入点」的**视口坐标**（`fixed` 定位用）—— 给 `@` 候选浮层"跟着 `@` 跑"用。
 *
 * 返回 `{ x, y }`（`x` = 光标左沿、`y` = 光标**下沿**，即浮层该贴的位置）；
 * 拿不到就返回 `null`（无容器 / 无选区 / 光标不在容器内 —— 与 `textBeforeCaret` 同一套哨兵语义）。
 *
 * ⚠️ **折叠光标**（没选中任何字符）的 `getBoundingClientRect()` 在部分浏览器里是全 0
 *    ⇒ 此时回退到 `fallback`（调用方传正文编辑器元素）的**左下角**，保证浮层不会跑到视口左上角。
 * ⚠️ 与 `textBeforeCaret` 同层同性质（纯 DOM 工具，无业务规则、不返回 `Result`）。
 */
export function caretViewportRect(
  fallback?: Element | null,
): { x: number; y: number } | null {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0 || rect.top > 0)) {
    return { x: rect.left, y: rect.bottom };
  }
  const fb = fallback?.getBoundingClientRect();
  if (fb) return { x: fb.left, y: fb.bottom };
  return null;
}

export function textBeforeCaret(container: Element | null | undefined): string {
  if (!container) return '';

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return '';

  const range = sel.getRangeAt(0);
  const startParent =
    range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
  if (!startParent || !container.contains(startParent)) return '';

  const probe = document.createRange();
  probe.selectNodeContents(container);
  try {
    probe.setEnd(range.startContainer, range.startOffset);
  } catch (e: unknown) {
    // ⚠️ 不吞：明确这是「Range 与当前节点不匹配」⇒ 无可用前缀（语义即空串）
    void e;
    return '';
  }
  return probe.toString();
}
