/**
 * `window.api` 的类型（**由契约表派生** —— 不再手写）
 *
 * ★ 2026-10-15（B1-b）：本文件此前是**手写面**（81 个成员一条条写），现在换成
 *   「契约真源 `@/stable/ipc-channels` 的 `WindowApi`」的**别名** —— 名面/参数面/回执面
 *   全部由那张表派生（§5：真源 → 派生 → 适配层，三段式没有第四段）。
 *   ⇒ 由此**删掉**了 `./host-api.ts` 顶部那条「名面同源守卫」：两张面已是同一张（§12 规矩寿命：
 *     手写面被派生面替换后即失效 —— 前提消失，守卫即僵尸约束）。
 *
 * ⚠️ **本文件仍是唯一允许触碰 `window.api` 的类型出处**（全仓唯一读者 = `./host-api.ts`，
 *    它用**局部** `(window as { api?: HostApi })` 取用 ⇒ ⛔ 本文件不声明 `declare global`，
 *    否则任何层写 `window.api.X` 都能编译，红线①（原则 3 / `TD-05-1`）就失守）。
 *
 * 逐条语义仍由表承载（表里每条都带 `note` 与取证锚点）：
 *   · **两个 `sendSync` 是同步调用**（返回结果而非 Promise）：`activateProjectStorage` · `saveImageSync`
 *   · **5 个 `on*` 订阅返回取消函数**，必须调用（否则泄漏）
 *   · `hostOS` 是**非 IPC 的普通值**（`preload` 由 `process.platform` 直接算）
 */
import type { WindowApi } from '@/stable/ipc-channels';

export type HostApi = WindowApi;
