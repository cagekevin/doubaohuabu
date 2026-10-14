/**
 * 拖拽悬停判据 —— ★ **全仓唯一**（此前 `CanvasHost` 与 `LibraryPanel` 各写一份同样的表达式）
 *
 * 判据：「指针是否已**离开容器**」（HTML5 DnD 的标准问法）
 *   · 容器内子元素之间移动 ⇒ `relatedTarget` 仍在容器内 ⇒ **不算离开**
 *   · 移出窗口（`relatedTarget` 为 `null`）/ 移到别的面板 ⇒ **算离开**
 *
 * ⚠️ **为什么不写 `e.currentTarget === e.target`**（源 `_Component42.jsx:1333` 的守卫）：
 *    容器里的子元素**既铺满又层层冒泡**（`<ReactFlow>`、`<webview>`、各浮层）⇒
 *    `dragleave` 的 `target` 恒为**子元素**、`currentTarget` 恒为**容器** ⇒ 该条件**恒假**
 *    ⇒ 悬停提示 / 落点高亮**没有任何一条路能收掉**（除开恰好落在容器上的 `drop`）。
 *    ⚠️ **源本身就是这个形状** ⇒ 这是本仓**有意偏离源**的一处（按「既有约定 ＜ 正确性」）。
 *
 * ⚠️ 本函数是**纯判据**：不碰 React、不碰 DOM 全局；入参只取用得到的两个字段（最小面）。
 *    调用方各自决定"离开之后做什么"（`setDropActive(false)` / `setDragOver(false)`）。
 */

/** 指针是否已离开 `currentTarget` 容器（`true` = 该收掉悬停态了） */
export function dragLeftContainer(e: {
  currentTarget: EventTarget | null;
  relatedTarget: EventTarget | null;
}): boolean {
  const host = e.currentTarget;
  // 没有容器（脱离文档的合成事件）⇒ **不判"离开"**：调用方本来也不该走到这里
  if (!(host instanceof Node)) return false;
  const to = e.relatedTarget;
  // `relatedTarget` 为 `null` = 移出了窗口/文档 ⇒ 算离开
  return !(to instanceof Node) || !host.contains(to);
}
