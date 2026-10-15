/**
 * 「一条站点视频 → 落画布」的**唯一写点**
 *
 * 依据（**逐行回源**）：`_Component43.jsx:1379-1444`（`it` 的 `Z`）＋ `:280-336`（`onDolaMedia`
 *   视频支那段）—— 两处**逐字同形**（`addVideoShare` → 取 `_pendingAttempts[accountId] ||
 *   _pendingAttempt` → `addVideoNode` → 清 `_pending*` → `releaseAccountBusy`）
 *   ⇒ 收口于此（判据 C1「三振出局」）。
 *
 * ⚠️ **原则 1**：只有 `state/**` 写 store —— 本文件属 `state/`，写的都是**具名 action**。
 * ⚠️ **原则 6**：不吞错 —— 本函数是这条链**错误的产生方**，故把失败收成 `Result` 交出去
 *   （`err` 按契约只许生产者调）；调用方（`postSendDetect` / `dolaMedia`）**只转发不加工**。
 * ★ 2026-10-15 收口：原先失败靠**抛**，两个调用方各写一个 `try/catch` + `log.warn`
 *   （同一命题抄 2 处），且返回值 `boolean` **恒为 `true`**（假契约，从不说失败）
 *   ⇒ 改成 `Result<void>`：`catch` 2 处 → 1 处（本函数内），失败从"调用方兜"变成**必须处理的值**。
 */

import type { AppStore } from './store';
import type { ApiJobAttempt } from '@/stable/model/gen';
import { err, ok, toMessage, type Result } from '@/core/model/result';

export interface LandVideoInput {
  url: string;
  /** 去重键（`it` 用站点 `key`；`onDolaMedia` 视频支用 **url** —— 源如此） */
  vid: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  poster: string | null;
  accountId: string;
  accountName: string;
  /** 节点 label（网格新建分支用；缺 ⇒ 「视频」） */
  name?: string;
  /** 归属节点（`null` ⇒ 无归属，仍会新建视频节点） */
  nodeId: string | null;
}

/**
 * 落一条视频（**唯一写点**）。
 *
 * ★ 失败**声明在返回值里**（`Result<void>`）：本函数是这条链错误的**产生方** ⇒ 按 `Result`
 *   契约，`err` 只许生产者调，调用方只转发不加工。
 * ⚠️ 为什么不再"抛给调用方 catch"：那条路上两个调用方各写一个 `try/catch` + `log.warn`
 *   （**同一命题抄 2 处**），且原返回值 `boolean` **恒为 `true`** —— 假契约，从不说失败。
 * ⚠️ **不保证原子性**：①~⑤ 是五个具名 action 的顺序写，中途失败则前几步已生效
 *   （与原先 `catch` 后的状态一致 —— 未扩大也未缩小）。
 * ⚠️ 幂等由 `addVideoNode` 的 `vid` 去重承担（源同）。
 */
export function landVideo(store: AppStore, input: LandVideoInput): Result<void> {
  try {
    const s = store.useStore.getState();
    const { accountId, nodeId } = input;

    // ① 进「无水印分享」列表（源 `addVideoShare`）
    s.addVideoShare({
      accountId,
      accountName: input.accountName,
      url: input.url,
      vid: input.vid,
      width: input.width,
      height: input.height,
      duration: input.duration,
      poster: input.poster,
    });

    // ② 归属节点的 `_pendingAttempts[accountId] ?? _pendingAttempt`（源 `Se` / `Le`）
    //   ⚠️ 这两个键只长在 `genvideo` 节点上 ⇒ 按判别联合收窄（形状真源 = `stable/model/node.GenVideoNodeData`）
    const srcNode = nodeId ? s.nodes.find((n) => n.id === nodeId) : null;
    const sd = srcNode?.type === 'genvideo' ? srcNode.data : undefined;
    const attempts = sd?._pendingAttempts;
    const pending: ApiJobAttempt | null = attempts?.[accountId] ?? sd?._pendingAttempt ?? null;

    // ③ 新建/更新画布视频节点（源 `addVideoNode`）—— ⚠️ 写完 `url` 的**本地化内建在该 action 里**
    //   （源 `addVideoNode` 末尾内建 `localizeNodeVideos`）⇒ 这里**不需要**、也**不许**再调一次。
    s.addVideoNode({
      url: input.url,
      vid: input.vid,
      width: input.width,
      height: input.height,
      duration: input.duration,
      poster: input.poster,
      accountId,
      accountName: input.accountName,
      name: input.name || '视频',
      sourceNodeId: nodeId,
      attempt: pending,
    });

    // ④ 清 `_pendingAttempt(s)`（源 `updateNodeData`，只清本次用掉的那个账号）
    if (nodeId && (sd?._pendingAttempt || attempts?.[accountId])) {
      const next = attempts ? { ...attempts } : null;
      if (next) delete next[accountId];
      s.patchNodeData(nodeId, {
        ...(sd?._pendingAttempt ? { _pendingAttempt: undefined } : {}),
        ...(next ? { _pendingAttempts: next } : {}),
      });
    }

    // ⑤ 释放账号占用（源 `releaseAccountBusy`）
    s.releaseAccount(accountId);
    return ok(undefined);
  } catch (e: unknown) {
    return err('unknown', toMessage(e), e);
  }
}
