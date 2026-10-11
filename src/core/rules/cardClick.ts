/**
 * 生成节点「整卡点击 → 打开生成面板」的**点击 / 拖动**判定
 *
 * 依据：原 `YL.jsx:112-125`（文生视频）与 `ZL.jsx`（文生图）**同法**——
 *   `x = e => { b.current = { x: e.clientX, y: e.clientY } }`（`onPointerDown` 记起点）
 *   `k = e => { const re = b.current; b.current = null;
 *               if (!re || !(Math.abs(e.clientX - re.x) + Math.abs(e.clientY - re.y) > 6)) open(e) }`
 * ⇒ **没记到起点也照开**（`!re`）；**曼哈顿距离 > 6px 视为拖动，不开**（这样拖节点不会误开面板）。
 *
 * 归属：纯判定（无 `window` / 时间 / 随机）⇒ `core`（原则 4）。
 */

/** 拖动阈值（原 `k` 里的字面量 `6`，曼哈顿距离，px）—— 模块私有（不外泄一个没人用的常量） */
const DRAG_PX = 6;

/**
 * @param start `onPointerDown` 记下的起点；`null` = 没记到（原 `b.current`）
 * @param end 本次 `click` 的坐标
 * @returns 是否应当**打开生成面板**（`true` = 当点击处理；`false` = 当拖动，忽略）
 */
export function isCardClick(
  start: { x: number; y: number } | null,
  end: { x: number; y: number },
): boolean {
  if (!start) return true;
  return !(Math.abs(end.x - start.x) + Math.abs(end.y - start.y) > DRAG_PX);
}
