/**
 * 发送队列面板的**纯显示层件**（★ 必测）—— 原 `Qd`(42586)
 *
 * ⚠️⚠️ **⛔ 别在本文件转写 `tc`(42481) / `B0`(42493)** —— 那是 `core/rules/genProgress.ts` 的**第二份**：
 *   `formatElapsed` 抄一遍、`deriveGenView` 抄一遍（唯一"差别"是它把状态直接拼成 CSS 类名）。
 *   **2026-10-11 已删**（`TD-16-103`）：成片状态推导**唯一真源 = `core/rules/genProgress.ts`** ——
 *   面板改调 `resolveGenProgress`（`state` 是语义枚举），CSS 类名由 `ui` 用 `GEN_CLS` 表映射
 *   （判据 A1：`core` 不认识 CSS）。
 *   ⇒ **本文件从此只剩「面板几何」一件事**（同 `FingerprintScanPanel` 的 `clampPanelPosition` 用法）。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `clampPanelPosition` | `Qd` 42586 | 把面板坐标夹进视口（`max(0, …)` 与 `视口-尺寸` 之间） |
 */

import { clamp } from '@/lib/math';

/**
 * 把浮动面板的坐标夹进视口（原 `Qd` 42586-42593）
 *
 * ⚠️ 与源版的一处**必要差异**：源版直接从 `window.innerWidth/Height` 读（默认 `1280×800`），
 *   本实现把**视口尺寸作为入参**（原则 4：`core` 不收宿主）—— 调用方传
 *   `window.innerWidth/innerHeight` 即可，行为一致。
 * ⚠️ 与源一致：`x` 夹在 `[0, max(0, vw - w)]`（**面板比视口宽时夹到 0**，不是负值）。
 */
export function clampPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: clamp(Math.round(x), 0, Math.max(0, viewport.w - width)),
    y: clamp(Math.round(y), 0, Math.max(0, viewport.h - height)),
  };
}
