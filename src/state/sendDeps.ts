/**
 * `SendToSiteDeps` 的**唯一组装点**（原 `Fi` / `tn` 的 state 侧接线）
 *
 * ★ 为什么收成一处：`sites` / `backendPage` / `holdAccount` / `releaseAccount` 这四样
 *   原先在 `generate` · `analyze` · `sendWatch` · `pullResult` **四个控制器里各写一遍**
 *   （判据 C1「三振出局」）—— 消费者**各自造依赖**，既重复又会漂移。
 *
 * ⚠️ 原则 1：占用 / 释放的**真正写入**仍是 state 的那两个 action
 *    （`holdAccount` / `releaseAccount`，见 `slices/global.ts`）；本文件只**接线**，不新增写入口。
 */

import type { Ports } from '@/core/ports';
import type { SendToSiteDeps } from '@/core/usecases/sendToSite';
import type { AppStore } from './store';

export function sendToSiteDeps(store: AppStore, ports: Ports): SendToSiteDeps {
  return {
    sites: ports.sites,
    backendPage: ports.backendPage,
    // 占用 / 释放（原 `Fi` / `tn`）—— 真正的 `set` 在 state
    holdAccount: (accountId, nodeId) =>
      store.useStore.getState().holdAccount(accountId, { itemId: null, nodeId }),
    releaseAccount: (accountId) => {
      store.useStore.getState().releaseAccount(accountId);
    },
  };
}
