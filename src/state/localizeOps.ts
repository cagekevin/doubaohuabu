/**
 * 视频本地化控制器 —— ★ 它是 `core/usecases/localizeVideos` 的**唯一调用方**
 *
 * ★★ **为什么需要它**：`core/usecases/localizeVideos.ts`（**有实现、有测试**）此前**零调用方** ——
 *   而链 18 硬约束（`docs/10` #9）是「**视频必须落盘**」：站点直链会过期 / 需要 referer。
 *   缺了这条接线 ⇒ `MediaPort.saveVideoFromUrl` 也一直"无人消费"（`docs/14` §1.4）。
 *
 * 依据（**逐行回源**，四处触发点）：
 *   | 源调用点 | 语义 | 本仓落点 |
 *   |---|---|---|
 *   | `_Component48.jsx:92-99` | 挂载后 **5s** ⇒ `backfillLocalVideos()` | `container.startVideoBackfill()`（经注入时钟） |
 *   | `_Component43.jsx:3160` | **「拉取结果」**（`pullResult`）写完 `url` 后 ⇒ `localizeNodeVideos(ee)` | `state/pullResult` 写完 `url` 后调 `localizeNodeInto`（`state/generate` 同族：写完 `resultUrl` 后调同一个） |
 *   | `shared.js:28308` | **新增节点**后 ⇒ `localizeNodeVideos(q)` | 同一族（"写 url 后即刻"） |
 *   | `shared.js:28140` | 版本海报落定后 ⇒ `localizeNodeVideos(j.id)` | 同一族 |
 *
 * ⚠️ **原则 1**：用例返回 `{rewrites, failures}`，**落 store 只在本文件**（`patchNodeData`）。
 * ⚠️ **原则 6**：源是逐条 `try{}catch{}` **静默吞**；本仓如实上报 ——
 *   用户 → toast（只报条数，不刷屏）；开发者 → `log.warn`（带全量原文，走唯一入口）。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import {
  backfillLocalVideos,
  localizeNodeVideos,
  type LocalizeOutcome,
} from '@/core/usecases/localizeVideos';
import { selectVideoNodesToLocalize } from '@/core/rules/videoLocalize';
import { VIDEO_TEXT } from '@/constants/text';
import { log } from '@/lib/log';

/** 视频本地化控制器 */
export interface LocalizeOpsController {
  /** 本地化**单个**节点（写完 `url` / `resultUrl` 后立刻调 —— 源 3 处调用点都是这个时机） */
  localizeNode(nodeId: string): Promise<void>;
  /** **全量**回填（源 `backfillLocalVideos` 31055；启动 5s 后调一次） */
  backfill(): Promise<void>;
}

/** 把用例产物落进 store ＋ 上报失败（**唯一落点**） */
function applyOutcome(store: AppStore, outcome: LocalizeOutcome): void {
  const s = store.useStore.getState();
  for (const r of outcome.rewrites) s.patchNodeData(r.nodeId, r.data);
  if (outcome.failures.length > 0) {
    // 读者分流：开发者看全量原文（唯一日志入口）；用户只被告知"有 N 条没落盘"
    log.warn('[localizeOps] 视频落盘失败：', outcome.failures);
    s.pushToast(VIDEO_TEXT.localizeFailed(outcome.failures.length), 4000, 'error');
  }
}

/** 本地化**一个**节点（查节点 → 挑目标 → 跑用例 → 落 store） */
async function runNode(store: AppStore, ports: Ports, nodeId: string): Promise<void> {
  const node = store.useStore.getState().nodes.find((n) => n.id === nodeId);
  if (!node) return;
  // ⚠️ 复用**同一张挑选规则**（`selectVideoNodesToLocalize`）：非 `genvideo`/`video` ⇒ 无事可做，
  //   免得在这里再写一份"哪些类型有视频直链"的判断（那会是第二个真相）。
  const [target] = selectVideoNodesToLocalize([node]);
  if (!target) return;
  applyOutcome(store, await localizeNodeVideos({ media: ports.host.media }, target));
}

/**
 * ★ 供 `state/generate` **直接**调用（它已持有 `store` / `ports`，无需再经控制器注入）。
 *
 * ⚠️ 用 `void` 调（**不 await**）：落盘是**收尾动作**，不该拖住"生成成功"这条主链的返回。
 */
export async function localizeNodeInto(
  store: AppStore,
  ports: Ports,
  nodeId: string,
): Promise<void> {
  await runNode(store, ports, nodeId);
}

export function createLocalizeOps(store: AppStore, ports: Ports): LocalizeOpsController {
  return {
    localizeNode: (nodeId) => runNode(store, ports, nodeId),
    backfill: async () => {
      applyOutcome(
        store,
        await backfillLocalVideos(
          { media: ports.host.media },
          store.useStore.getState().nodes,
        ),
      );
    },
  };
}
