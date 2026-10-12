/**
 * 「拉取结果」控制器 —— ★ 它是 `core/usecases/fetchWatermarkFree` 的**唯一生产消费者**
 *
 * 依据（**逐行回源**）：`_Component43.jsx:3125-3173` 的 `pullResult`（`vid` 分支）
 *   + `BL.jsx:355-381` 的 `vn-pull-chip`（视频节点上那个按钮）。
 *
 * ★★ **它补的是哪笔账**：`core/usecases/fetchWatermarkFree.ts`（有实现、有测试）此前
 *   **零生产消费者**（判据 B5，见 `docs/19` §3.4 的登记）。
 *   ⚠️ **回源更正一处描述失真**：原版的真实触发点是**视频节点上的「拉取结果」按钮**（用户动作），
 *   **不是**「发送后自动监测」—— 实测 `xt`（按 vid 拉无水印）只有 2 个调用点：
 *   `pullResult`（`:3145`）与 BackendView 暴露的 API 字段 `fetchWatermarkFree`（`:3043`）；
 *   **均不在** `postSendDetect` 里（`postSendDetect` 调的是 `addVideoShare`，那是另一件事）。
 *
 * ⚠️ **原则 1**：用例只返回 `Result`，**落 store 只在本文件**（`patchNodeData`）。
 * ⚠️ **原则 6**：`fetchWatermarkFreeByVid` 的失败**原样透传** —— 不改写、不兜底、不编文案。
 * ★ **两条分支都落了**（原 `pullResult`）：
 *   ① **按 `vid`** ⇒ `fetchWatermarkFreeByVid` 直接拉无水印直链；
 *   ② **只有 `conversationId`** ⇒ **回会话页**（`BackendPagePort.navigate`）→ 登记任务 →
 *      交给**发送后检测**（`postSendDetect`，原 `it`）去捡（`:3180-3210`）。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import { sendToSiteDeps } from './sendDeps';
import type { SendToSiteDeps } from '@/core/usecases/sendToSite';
import { fetchWatermarkFreeByVid } from '@/core/usecases/fetchWatermarkFree';
import { patchGenHistoryAttempt, pullTargetOf } from '@/core/rules/genHistory';
import { err, ok, type Result } from '@/core/model/result';
import { GEN_HISTORY_KEY } from '@/stable/model/node';
import { VIDEO_NODE_TEXT } from '@/constants/text';
import { localizeNodeInto } from './localizeOps';
import type { PostSendDetectController } from './postSendDetect';
import { log } from '@/lib/log';

export interface PullResultController {
  /** 拉取某个视频节点「这一次生成」的结果（原 `pullResult`） */
  pull(nodeId: string): Promise<Result<void>>;
}

/** 本控制器的注入（`bootstrap/container` 给） */
export interface PullResultDeps {
  /**
   * ★ **发送后检测**（原 `it`）—— `conversationId` 支把任务交给它
   * ⚠️ 必须是 `container` 里的**单例**（它自己持有待归属队列）
   */
  postSendDetect: PostSendDetectController;
}

export function createPullResultController(
  store: AppStore,
  ports: Ports,
  pullDeps: PullResultDeps,
): PullResultController {
  const deps: SendToSiteDeps = sendToSiteDeps(store, ports);

  return {
    async pull(nodeId) {
      const s = store.useStore.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node) return err('unknown', VIDEO_NODE_TEXT.pullNoNode);

      const data = node.data as Record<string, unknown>;
      const target = pullTargetOf(data);
      // 不可拉（已有 `url` / 没有尝试 / 尝试里既无 vid 也无 conversationId）
      if (!target) return err('unknown', VIDEO_NODE_TEXT.pullNotAvailable);

      // 账号：原 `ve.accountId || o`（`o` = 当前显示账号，本仓 = `activeAccountId`）
      const accountId = target.accountId ?? s.activeAccountId;
      const account = accountId ? s.accounts.find((a) => a.id === accountId) : undefined;
      if (!account) return err('no-account', VIDEO_NODE_TEXT.pullNoAccount);

      // ★ **`conversationId` 支**（原 `pullResult` 的 `:3180-3210`）：这次生成**只记了会话 id**
      //   ⇒ 回会话页 → 登记 `pull:true` 任务 → 交给**发送后检测**（`it`）去捡。
      if (!target.vid) {
        if (!target.conversationId) return err('unknown', VIDEO_NODE_TEXT.pullNotAvailable);
        const chatUrl = ports.sites[account.type]?.chatUrl;
        if (!chatUrl) return err('unknown', VIDEO_NODE_TEXT.pullNotAvailable);
        // ① 回会话页（源把导航包在 `try{}catch{}` 里 ⇒ **失败不中止**后续检测）
        const nav = await ports.backendPage.navigate(account, `${chatUrl}${target.conversationId}`);
        if (!nav.ok) log.warn('[pullResult] 回会话页失败：', nav.message);
        // ② 登记任务 ＋ 起检测（原 `k.current.push({…, pull:true})` ＋ `it(qe, ee)`）
        pullDeps.postSendDetect.notifySent({
          accountId: account.id,
          sourceNodeId: nodeId,
          ...(target.at > 0 ? { sentAt: target.at } : {}),
        });
        return ok(undefined);
      }

      const res = await fetchWatermarkFreeByVid(deps, { account, vid: target.vid, nodeId });
      if (!res.ok) return res; // ★ 原样透传（原则 6）

      const v = res.value;
      const patch: Record<string, unknown> = {
        url: v.url,
        width: v.width ?? undefined,
        height: v.height ?? undefined,
        duration: v.duration ?? undefined,
        poster: v.poster ?? undefined,
      };
      // 原 `patchVideoAttempt(ee, ve.id, { status:'success', url, vid })`
      if (target.attemptId) {
        const merged = patchGenHistoryAttempt({ ...data, ...patch }, target.attemptId, {
          status: 'success',
          url: v.url,
          vid: target.vid,
        });
        patch[GEN_HISTORY_KEY] = merged[GEN_HISTORY_KEY];
      }
      // ★ **一次**写：原版是 `updateNodeData` + `patchVideoAttempt` 两次，但结果是一个整体 ——
      //   分两次会在中间留下「有 `url` 但尝试仍是 `pending`」的半态（已留痕）。
      store.useStore.getState().patchNodeData(nodeId, patch);

      // 原 3160：写完 `url` 立刻本地化（直链会过期 / 需要 referer ⇒ 必须落盘）
      void localizeNodeInto(store, ports, nodeId);
      return ok(undefined);
    },
  };
}
