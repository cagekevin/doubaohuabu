/**
 * 宿主事件订阅（★ **唯一写入点** —— 判据 D2 / 职责归位原则 2）
 *
 * 依据：`docs/过程.md` §1.8 + §4.1
 *   `adapters/host/electron` 暴露 `onXxx(cb): () => void`（**只有订阅，只转发**）；
 *   **写入 store 只允许在本文件**。
 *
 * **它修的是哪个真实缺陷**（`docs/过程.md` §4）：
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
import type { DolaMediaController } from './dolaMedia';
// ★ 开发者侧留痕的唯一入口（原则 6：回调抛错**不许消失**）
import { log } from '@/lib/log';

/**
 * 包一层「回调抛错必须留痕」（原则 6）
 *
 * ⚠️ 宿主事件的回调若抛错，会一路冒到 Electron 的派发链 ⇒ 变成 uncaught
 *   （生产里只进窗口控制台，用户完全无感，开发者也可能看不到）。
 *   ⇒ 一律**捕获 + 留痕**，且**不让它拖垮同一批的其余订阅**。
 */
function guarded<A extends unknown[]>(label: string, fn: (...args: A) => void): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args);
    } catch (e) {
      log.warn(`[subscriptions] ${label} 回调抛错：`, e);
    }
  };
}

export interface Subscriptions {
  /** 卸载全部订阅 */
  dispose(): void;
}

/**
 * 装配宿主事件订阅。**由 `bootstrap/container.ts` 调用一次**。
 *
 * **当前接线**：
 *   - `host.api.onJobEvent` → `settings.upsertApiJob`（API 任务状态进 store，**键 = `jobId`**）
 *   - ★ **落点生效**：同一条事件再走 `core/usecases/applyApiJobEvent`（**纯决策**）→
 *     `addToLibrary` / `pushImageGenFeed` / `addVideoNode` / `patchNodeData` /
 *     `attachImageResultToNode` / `pushToast`。
 *     ⇒ **API 通道的「出片落画布」闭环**（原 `applyApiJobEvent` 直接写 store 的六件事）。
 *
 * ★ **载荷字段是 `jobId`**（不是 `id`）：类型声明成 `ApiJobLite`（字段 `id`）⇒
 *   而后端事件字段名是 **`jobId`** ⇒ `upsertApiJob` 按 `id` 去重时恒拿到 `undefined`
 *   ⇒ **所有任务塌进同一条记录**（订阅等于失效）。现已改用 `ApiJobEvent`（`jobId`）。
 *
 * **待接线（各自用例落地时补，仍只在本文件）**：
 *   - ~~`host.clipboard.onChanged` → 剪贴板图片~~ ★ **已接**：走 `state/hostOps.ts:134`
 *     ← `ui/canvas/CanvasHost.tsx:225`（**不经本文件** —— 若日后要收口"订阅唯一写入点"，这是落点）
 *   - ★ `host.media.onDolaMedia` → `state/dolaMedia`（**已接**：视频支 + 图像支）
 */
/** 订阅要调到的控制器（由 `bootstrap/container` 给 —— 订阅本身**只在本文件**） */
export interface SubscriptionDeps {
  /** ★ CDP 媒体推送的消费者（原 `_Component43.jsx:130-345` 的 `onDolaMedia`） */
  dolaMedia: DolaMediaController;
}

export function createSubscriptions(
  store: AppStore,
  ports: Ports,
  deps: SubscriptionDeps,
): Subscriptions {
  const offs: Array<() => void> = [];

  // ── API 任务事件 → settings.apiJobs（快照）+ 画布/资源库（落点）──
  //    调 store 的 action（而不是直接 setState）：去重/覆盖逻辑只有一份（SSOT）
  offs.push(
    ports.host.api.onJobEvent(
      guarded('api.onJobEvent', (job) => {
        const st = store.useStore.getState();
        // ① 任务快照（键 = `jobId`）
        st.upsertApiJob(job);

        // ② 落点生效（原 `applyApiJobEvent` 的六件事）—— 决策在 core（纯），落点在这里（唯一写入点）
        const decision = applyApiJobEvent({ event: job, nodes: st.nodes, now: ports.clock.now() });
        // 缺 `jobId` ⇒ 什么都不做（与源版 `if (!n || !n.jobId) return;` 等价）
        // ⚠️ **必须留痕**：事件缺键 ⇒ **整条落点链不生效**，而用户侧毫无反馈
        //    （正是"漏了但没人知道"那一类；静默吞掉等于违约，原则 6）
        if (!decision) {
          log.warn('[subscriptions] API 任务事件缺 jobId ⇒ 整条落点链不生效：', job);
          return;
        }

        // ⚠️ 顺序**逐条对源**（30719-30836）：库 → 视频 → 节点补丁 → 图片附加 → 提示。
        //    顺序有意义：视频/图片附加与 `nodePatch` 都改**同一个节点的 data**，先后不能反。
        if (decision.library.length > 0) st.addToLibrary(decision.library);
        // ★ 生成图片流（原 `pushImageGenFeed`，`:30733-30739`）—— 源在「落库」那两支里各调一次
        if (decision.feed) st.pushImageGenFeed([decision.feed]);
        if (decision.videoNode) {
          // ★ 落库**内建**本地化（源 `addVideoNode` 末尾）⇒ 调用方不需要知道"写完要落盘"
          st.addVideoNode({
            url: decision.videoNode.url,
            vid: (decision.videoNode.attempt?.vid as string | undefined) ?? null,
            width: null,
            height: null,
            duration: null,
            poster: null,
            accountId: (decision.videoNode.attempt?.accountId as string | undefined) ?? null,
            // ★ name / accountName **必须用决策算好的**（源 `shared.js:30775-30776`：
            //   `o.data && o.data.label || 'API 视频'` · `API · ${n.providerName}`）
            accountName: decision.videoNode.accountName,
            name: decision.videoNode.name,
            sourceNodeId: decision.videoNode.sourceNodeId,
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
            // ★ BP-03：API 通道查表键 = `genKey || jobId`（原 `:27246`）
            jobId: decision.attachImage.jobId,
          });
        }
        if (decision.toast) st.pushToast(decision.toast.text, decision.toast.durationMs, decision.toast.level);
      }),
    ),
  );

  // ── CDP 媒体推送 → 无水印分享 / 画布（原 `onDolaMedia`，`_Component43.jsx:130`）──
  //    ⚠️ 订阅**只在本文件**；落 store 由 `state/dolaMedia` 控制器负责（原则 1/2）
  offs.push(
    ports.host.media.onDolaMedia(guarded('media.onDolaMedia', (event) => deps.dolaMedia.handle(event))),
  );

  // ── 后台页租约快照 → 「谁该保持挂载」（原 `sT` → `_Component43` 的 `d`，`shared.js:25962-25975`）──
  //    ★ 源那两句：`gp.add(e)` 后紧跟 `e(Ck())` ⇒ **订阅即回调一次当前快照**，
  //      store 的初值由此而来（不必在别处再补一次）。
  offs.push(
    ports.backendPage.subscribeLeases(
      guarded('backendPage.subscribeLeases', (accountIds) => {
        store.useStore.getState().setLeasedAccounts([...accountIds]);
      }),
    ),
  );

  return {
    dispose: () => {
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}
