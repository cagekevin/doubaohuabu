/**
 * 截图元素注册表（原 `Lu` shared.js:32311-32320）
 *
 * ★★ **它为什么必须存在**：截图要做的是「把**某个节点的 DOM 元素**截成图」，
 *   而"截图的发起方"（视频节点上的按钮）与"被截的元素"（那个 `<video>`）
 *   **不一定是同一个组件** —— 源版靠一张**模块级 `Map<nodeId, HTMLElement>`** 把它们对上。
 *
 * 依据（**逐行回源**）：`const Lu = new Map()`(32311) + `Lu.set(e, t)`(32314) + `Lu.delete(e)`(32319)；
 *   消费者 `$T`(32329) 与 `Rk`(32363) 都走 `Lu.get(nodeId)`。
 *
 * ⚠️ 住 `lib/` 而不是 `ui/`：它只是**一张表 + 两个函数**（读写 DOM 元素引用），
 *   没有 React、不 import `stable`，与 `lib/selection.ts` 同类。
 * ⚠️ **注销必须做**（节点卸载/删除时）—— 否则表会攒住已脱离文档的元素
 *   （源版在节点卸载处调 `Lu.delete`；本工程由 `useCaptureElement` 的清理函数保证）。
 */

const elements = new Map<string, HTMLElement>();

/** 登记（原 `Lu.set`）—— 同一 id 重复登记 ⇒ **后来者胜**（源版也是如此） */
export function registerCaptureElement(nodeId: string, el: HTMLElement): void {
  if (!nodeId) return;
  elements.set(nodeId, el);
}

/**
 * 注销（原 `Lu.delete`）
 * ⚠️ 带 `el` 参数时**只在自己仍是当前那个时**才删 —— 避免"新元素已登记、旧元素的清理函数才跑到"
 *   把新的误删（React 严格模式会双调用 effect，这个守卫是必要的；源版没有，因为它那边是命令式注册）。
 */
export function unregisterCaptureElement(nodeId: string, el?: HTMLElement): void {
  if (!nodeId) return;
  if (el && elements.get(nodeId) !== el) return;
  elements.delete(nodeId);
}

/** 取元素（原 `Lu.get`）—— 没有则 `null`（调用方据此放弃截图） */
export function captureElementOf(nodeId: string): HTMLElement | null {
  return elements.get(nodeId) ?? null;
}

/** 仅供测试：清空注册表 */
export function clearCaptureRegistry(): void {
  elements.clear();
}
