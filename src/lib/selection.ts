/**
 * 编辑器选区原语（★ 纯 DOM 工具 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：
 *   - `D0` shared.js:40093-40115 —— 取「插入点 Range」：选区在容器内则**克隆**，否则造一个「全选后折叠到末尾」
 *   - `SL` shared.js:40116-40140 —— 取「插入点**之前**的文本」（`@` 引用菜单据此判断用户正在打什么）
 *
 * ★ **归属更正**：`docs/过程.md` §1.7 原把这两个放在 `adapters/site/shared/` —— **判错了**。
 *    它们用的是 `window.getSelection()` / `document.createRange()`，操作的是**我们自己文档**
 *    （画布文本框编辑器），**不是站点页**。⇒ 按 A1「无状态工具 → `lib`」落在这里。
 *    （同类先例：`lib/image.ts` 也是 DOM 工具。）
 *
 * ⚠️ 本模块**不含业务规则**（不判断 `@`、不组装引用芯片）—— 只提供「拿 Range / 拿光标前文本」。
 * ⚠️ **不返回 `Result`**：`lib` 是 L0，`Result` 在 `core/model`（L2）⇒ 上层依赖会反向（分层禁止）。
 *    故与 `lib/image.ts` 的 `loadImage` 一致：**要么抛，要么用语义明确的哨兵值**（见 `textBeforeCaret`）。
 */

/** 节点是否落在容器内（原 `D0` 的 `s`；文本节点取其父元素） */
function within(container: Node, node: Node | null): boolean {
  if (!node) return false;
  const target = node.nodeType === 3 ? node.parentNode : node;
  return !!target && container.contains(target);
}

/**
 * 取「插入点 Range」（原 `D0` 40093）
 *
 * 规则（与源一致）：
 *   ① 容器为空 ⇒ `null`
 *   ② 当前选区**两端都在容器内** ⇒ 返回该 Range 的**克隆**（不改原选区）
 *   ③ 否则 ⇒ 造一个 Range：**选中容器全部内容后折叠到末尾**（= 追加到末尾）
 */
export function caretRangeIn(container: Element | null | undefined): Range | null {
  if (!container) return null;

  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const r = sel.getRangeAt(0);
    if (within(container, r.startContainer) && within(container, r.endContainer)) {
      return r.cloneRange();
    }
  }

  const fallback = document.createRange();
  fallback.selectNodeContents(container);
  fallback.collapse(false);
  return fallback;
}

/**
 * 取「插入点**之前**的文本」（原 `SL` 40116）
 *
 * 用法：`@` 引用菜单拿它判断用户刚打了什么（如 `@素材` 的前缀）。
 *
 * ⚠️ **返回空串的三种情形都是「没有可用的前缀文本」这一语义本身**（不是把错误吞掉）：
 *    ① 没有选区；② 光标不在容器内；③ `setEnd` 抛（Range 与节点不匹配）。
 *    三者对调用方的含义一致 ⇒ 用哨兵值 `''`，无需 `Result`。
 */
export function textBeforeCaret(container: Element): string {
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
