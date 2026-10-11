/**
 * 宿主事件订阅（★ **唯一写入点** —— 判据 D2 / 职责归位原则 2）
 *
 * 依据：`docs/16` §1.8 + §4.1
 *   `adapters/host/electron` 暴露 `onXxx(cb): () => void`（**只有订阅，只转发**）；
 *   **写入 store 只允许在本文件**。
 *
 * **它修的是哪个真实缺陷**（`docs/14` §4）：
 *   `ApiPort.onJobEvent` 在适配器里**早已实现**，但 **state 侧从来没人订阅**
 *   ⇒ API 通道提交完任务只拿到 `job id`，`done` 事件**回不来** ⇒ 节点永远不落结果。
 *
 * ⚠️ **结构收口（替代 `subscribe-coverage` 闸）**：订阅**只允许出现在本文件** ——
 *    本文件本身就是「有哪些订阅」的清单，打开一眼看完；散落才需要闸。
 *
 * ⚠️ 原则 1：只有 state 能写 store；本文件属 `state/`，故可写。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';

export interface Subscriptions {
  /** 卸载全部订阅 */
  dispose(): void;
}

/**
 * 装配宿主事件订阅。**由 `bootstrap/container.ts` 调用一次**。
 *
 * **当前接线（M8 + 2026-10-10 修）**：
 *   - `host.api.onJobEvent` → `settings.upsertApiJob`（API 任务状态进 store，**键 = `jobId`**）
 *
 * ★ **2026-10-10 修**：原先 `ApiPort.onJobEvent` 的载荷类型声明成 `ApiJobLite`（字段 `id`），
 *   而后端事件字段名是 **`jobId`** ⇒ `upsertApiJob` 按 `id` 去重时恒拿到 `undefined`
 *   ⇒ **所有任务塌进同一条记录**（订阅等于失效）。现已改用 `ApiJobEvent`（`jobId`）。
 *
 * **待接线（各自用例落地时补，仍只在本文件）**：
 *   - ★ `onJobEvent` 的**落点生效**：`core/usecases/applyApiJobEvent.ts` 已给出决策，
 *     但 `addVideoNode` / `attachImageResultToNode` / `pushImageGenFeed` 三个 state action
 *     **尚未存在**（归 M13 面板批）⇒ 目前只记任务快照，产物落点待接。
 *   - `host.clipboard.onChanged` → 剪贴板图片（M11 `usecases`）
 *   - `host.media.onDolaMedia` → 无水印资源（**需先扩 `HostPort`**，见 `docs/16` §1.5）
 */
export function createSubscriptions(store: AppStore, ports: Ports): Subscriptions {
  const offs: Array<() => void> = [];

  // ── API 任务事件 → settings.apiJobs ──
  //    调 store 的 action（而不是直接 setState）：去重/覆盖逻辑只有一份（SSOT）
  offs.push(
    ports.host.api.onJobEvent((job) => {
      store.useStore.getState().upsertApiJob(job);
    }),
  );

  return {
    dispose: () => {
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}
