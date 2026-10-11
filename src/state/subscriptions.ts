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
import { applyApiJobEvent } from '@/core/usecases/applyApiJobEvent';

export interface Subscriptions {
  /** 卸载全部订阅 */
  dispose(): void;
}

/**
 * 装配宿主事件订阅。**由 `bootstrap/container.ts` 调用一次**。
 *
 * **当前接线（M8 + 2026-10-10 修 + 2026-10-11 落点接通）**：
 *   - `host.api.onJobEvent` → `settings.upsertApiJob`（API 任务状态进 store，**键 = `jobId`**）
 *   - ★ **落点生效**：同一条事件再走 `core/usecases/applyApiJobEvent`（**纯决策**）→
 *     `addToLibrary` / `attachVideoResultToNode` / `patchNodeData` / `attachImageResultToNode` / `pushToast`。
 *     ⇒ **API 通道的「出片落画布」至此闭环**（原 `applyApiJobEvent` 直接写 store 的六件事）。
 *
 * ★ **2026-10-10 修**：原先 `ApiPort.onJobEvent` 的载荷类型声明成 `ApiJobLite`（字段 `id`），
 *   而后端事件字段名是 **`jobId`** ⇒ `upsertApiJob` 按 `id` 去重时恒拿到 `undefined`
 *   ⇒ **所有任务塌进同一条记录**（订阅等于失效）。现已改用 `ApiJobEvent`（`jobId`）。
 *
 * **待接线（各自用例落地时补，仍只在本文件）**：
 *   - `host.clipboard.onChanged` → 剪贴板图片（M11 `usecases`）
 *   - `host.media.onDolaMedia` → 无水印资源（**需先扩 `HostPort`**，见 `docs/16` §1.5）
 *   - ⚠️ `applyApiJobEvent` 决策的 **`feed` 字段未落**（`pushImageGenFeed`）：源把它当 state 维护，
 *     但 119 个展开组件里**无读者** ⇒ `docs/16` §2.9 裁定「派生视图」⇒ 不落（TD-16-85）。
 */
export function createSubscriptions(store: AppStore, ports: Ports): Subscriptions {
  const offs: Array<() => void> = [];

  // ── API 任务事件 → settings.apiJobs（快照）+ 画布/资源库（落点）──
  //    调 store 的 action（而不是直接 setState）：去重/覆盖逻辑只有一份（SSOT）
  offs.push(
    ports.host.api.onJobEvent((job) => {
      const st = store.useStore.getState();
      // ① 任务快照（键 = `jobId`）
      st.upsertApiJob(job);

      // ② 落点生效（原 `applyApiJobEvent` 的六件事）—— 决策在 core（纯），落点在这里（唯一写入点）
      const decision = applyApiJobEvent({ event: job, nodes: st.nodes, now: ports.clock.now() });
      // 缺 `jobId` ⇒ 什么都不做（与源版 `if (!n || !n.jobId) return;` 等价）
      if (!decision) return;

      // ⚠️ 顺序**逐条对源**（30719-30836）：库 → 视频 → 节点补丁 → 图片附加 → 提示。
      //    顺序有意义：视频/图片附加与 `nodePatch` 都改**同一个节点的 data**，先后不能反。
      if (decision.library.length > 0) st.addToLibrary(decision.library);
      if (decision.videoNode) {
        st.attachVideoResultToNode(decision.videoNode.sourceNodeId, {
          url: decision.videoNode.url,
          attempt: decision.videoNode.attempt,
        });
      }
      if (decision.nodePatch) st.patchNodeData(decision.nodePatch.nodeId, decision.nodePatch.patch);
      if (decision.attachImage) {
        st.attachImageResultToNode(decision.attachImage.nodeId, {
          dataUrl: decision.attachImage.dataUrl,
          source: decision.attachImage.source,
          accountName: decision.attachImage.accountName,
          genKey: decision.attachImage.genKey,
        });
      }
      if (decision.toast) st.pushToast(decision.toast.text, decision.toast.durationMs, decision.toast.level);
    }),
  );

  return {
    dispose: () => {
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}
