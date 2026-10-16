/**
 * **拖拽期间的全局监听**（按下之后跟指针、松开/取消时摘掉）—— ★ 唯一实现
 *
 * ★ **为什么住在这儿**：同一套机制此前有 **4 份手写**（`GroupConnectHandle` 拉线 ·
 *   `GenPanel` 拖高手柄 · `NewImagesPanel` 拖缩略图到画布 · `TextNode` 拖抓手排序），
 *   而且**各自漂移**：只有 `GenPanel` 挂了 `pointercancel`（其余三份在"指针被系统取消"时
 *   会**残留监听与拖拽态**）；`GroupConnectHandle` 还在 `pointerdown` 里**同步**挂，
 *   另外三份走 effect ⇒ 连"什么时候挂"都不一致。
 *
 * ⚠️ 两种事件族**都保留**（不是"统一成 pointer"）：mouse 那两处是**逐字对源**的实现，
 *   换成 pointer 会顺带把触摸/笔也纳入（本仓是桌面 Electron，虽无实际差别，但那是**行为变化**）
 *   ⇒ 由调用方按原样传 `events`，本函数只负责"挂什么、怎么摘"这套簿记。
 * ⚠️ 与 `useOutsideClose` 同族：那管"点外面"，这个管"拖的过程中"；两者都只搬一次机制、不做加工。
 */

type PointerHandlers = {
  events?: 'pointer';
  onMove: (e: PointerEvent) => void;
  onEnd: (e: PointerEvent) => void;
};
type MouseHandlers = {
  events: 'mouse';
  onMove: (e: MouseEvent) => void;
  onEnd: (e: MouseEvent) => void;
};

/**
 * 挂上拖拽监听，**返回解绑函数**（调用方负责在收尾/卸载时调一次；重复调是安全的）。
 *
 * `events: 'pointer'`（默认）⇒ `pointermove` + `pointerup` + **`pointercancel`**；
 * `events: 'mouse'` ⇒ `mousemove` + `mouseup`（mouse 族没有 cancel 一说）。
 */
export function bindDragListeners(h: PointerHandlers): () => void;
export function bindDragListeners(h: MouseHandlers): () => void;
export function bindDragListeners(
  h: PointerHandlers | MouseHandlers,
): () => void {
  const target = window;
  if (h.events === 'mouse') {
    target.addEventListener('mousemove', h.onMove);
    target.addEventListener('mouseup', h.onEnd);
    return () => {
      target.removeEventListener('mousemove', h.onMove);
      target.removeEventListener('mouseup', h.onEnd);
    };
  }
  target.addEventListener('pointermove', h.onMove);
  target.addEventListener('pointerup', h.onEnd);
  target.addEventListener('pointercancel', h.onEnd);
  return () => {
    target.removeEventListener('pointermove', h.onMove);
    target.removeEventListener('pointerup', h.onEnd);
    target.removeEventListener('pointercancel', h.onEnd);
  };
}
