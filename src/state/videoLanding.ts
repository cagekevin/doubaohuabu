/**
 * 「一条站点视频 → 落画布」的**唯一写点**
 *
 * 依据（**逐行回源**）：`_Component43.jsx:1379-1444`（`it` 的 `Z`）＋ `:280-336`（`onDolaMedia`
 *   视频支那段）—— 两处**逐字同形**（`addVideoShare` → 取 `_pendingAttempts[accountId] ||
 *   _pendingAttempt` → `addVideoNode` → 清 `_pending*` → `releaseAccountBusy`）
 *   ⇒ 收口于此（判据 C1「三振出局」）。
 *
 * ⚠️ **原则 1**：只有 `state/**` 写 store —— 本文件属 `state/`，写的都是**具名 action**。
 * ⚠️ **原则 6**：不吞错 —— 失败由调用方 `catch` 后**如实记日志**（源也是 `try{}catch{}` + console.error，
 *   但本仓要求留痕）。
 */

import type { AppStore } from './store';

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
 * 落一条视频（**唯一写点**）。返回是否真的落了。
 * ⚠️ 幂等由 `addVideoNode` 的 `vid` 去重承担（源同）。
 */
export function landVideo(store: AppStore, input: LandVideoInput): boolean {
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
  const srcNode = nodeId ? s.nodes.find((n) => n.id === nodeId) : null;
  const sd = srcNode?.data as Record<string, unknown> | undefined;
  const attempts = sd?._pendingAttempts as Record<string, unknown> | undefined;
  const pending = ((attempts ? attempts[accountId] : undefined) ?? sd?._pendingAttempt ?? null) as
    | { id: string }
    | null;

  // ③ 新建/更新画布视频节点（源 `addVideoNode`）
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
  if (nodeId && (sd?._pendingAttempt || (attempts ? attempts[accountId] : undefined))) {
    const next = attempts ? { ...attempts } : null;
    if (next) delete next[accountId];
    s.patchNodeData(nodeId, {
      ...(sd?._pendingAttempt ? { _pendingAttempt: undefined } : {}),
      ...(next ? { _pendingAttempts: next } : {}),
    });
  }

  // ⑤ 释放账号占用（源 `releaseAccountBusy`）
  s.releaseAccount(accountId);
  return true;
}
