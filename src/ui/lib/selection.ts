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
