/**
 * 节点状态五族（`TD-16-93` 数据层）—— 原 `shared.js` 的 store 字段
 *
 * ⚠️ 原则 1：只有 state 写 store；本片只做「把纯层结果落到 store」。
 * ⚠️ 形状真源在 `core/rules/nodeStatus.ts`（`NodeNotice`/`NodeWaitTime`/`NodeSwitch`）。
 * ⚠️ **生产者未落**（原 `_Component43` 的 `autoConfirm`/`watchSendReply`，`TD-16-93`）——
 *   本片只是**写入点**；消费者（`TextNode` 三块 UI）**也未落**。数据形状先立，避免"落 UI 时再补形状"。
 * ⚠️ **不落 Wy（通知 zIndex 联动）**：源 `setNodeNotice` 会调 `Wy` 把通知节点的 `zIndex` 提到最前——
 *   那是**另一个 UI 细节**（依赖 `Ca`/`yp` 常量），与三块 UI 同批落，本片不预支。
 */

import type { NodeNotice, NodeSwitch, NodeWaitTime } from '@/core/rules/nodeStatus';
import { noticeToWrite, switchToWrite, waitTimeToWrite } from '@/core/rules/nodeStatus';

/** 注入（`now` 供 `at`/`detectedAt` 时间戳） */
export interface NodeStatusSliceDeps {
  now(): number;
}

export interface NodeStatusSlice {
  // ── state ──
  nodeNotices: Record<string, NodeNotice>;
  nodeWaitTimes: Record<string, NodeWaitTime>;
  nodeSwitches: Record<string, NodeSwitch>;
  nodeTimers: Record<string, number>;
  nodePendingTimers: Record<string, number>;

  // ── 通知（原 `setNodeNotice`/`clearNodeNotice` 31206-31239）──
  setNodeNotice: (nodeId: string, notice: Omit<NodeNotice, 'at'>) => void;
  clearNodeNotice: (nodeId: string) => void;
  // ── 等待（原 `setNodeWaitTime`/`clearNodeWaitTime` 31903-31936）──
  setNodeWaitTime: (nodeId: string, wait: Omit<NodeWaitTime, 'detectedAt'> & { detectedAt?: number }) => void;
  clearNodeWaitTime: (nodeId: string) => void;
  // ── 换号（原 `setNodeSwitch`/`clearNodeSwitch` 31268-31299）──
  setNodeSwitch: (nodeId: string, sw: Omit<NodeSwitch, 'at'>) => void;
  clearNodeSwitch: (nodeId: string) => void;
  // ── 计时器（原 `setNodeTimer`/`removeNodeTimer` 31845-31873 + pending 31874-31902）──
  setNodeTimer: (nodeId: string, ts: number | null) => void;
  removeNodeTimer: (nodeId: string) => void;
  setNodePendingTimer: (nodeId: string, ts: number | null) => void;
  removeNodePendingTimer: (nodeId: string) => void;
}

export function createNodeStatusSlice(deps: NodeStatusSliceDeps) {
  return (set: (partial: Partial<NodeStatusSlice>) => void, get: () => NodeStatusSlice): NodeStatusSlice => ({
    nodeNotices: {},
    nodeWaitTimes: {},
    nodeSwitches: {},
    nodeTimers: {},
    nodePendingTimers: {},

    setNodeNotice: (nodeId, notice) => {
      if (!nodeId) return;
      const written = noticeToWrite(notice, deps.now());
      const next = { ...get().nodeNotices };
      if (written) next[nodeId] = written;
      else delete next[nodeId];
      set({ nodeNotices: next });
    },

    clearNodeNotice: (nodeId) => {
      if (!nodeId || !(nodeId in get().nodeNotices)) return;
      const next = { ...get().nodeNotices };
      delete next[nodeId];
      set({ nodeNotices: next });
    },

    setNodeWaitTime: (nodeId, wait) => {
      if (!nodeId) return;
      const written = waitTimeToWrite(wait, deps.now());
      const next = { ...get().nodeWaitTimes };
      if (written) next[nodeId] = written;
      else delete next[nodeId];
      set({ nodeWaitTimes: next });
    },

    clearNodeWaitTime: (nodeId) => {
      if (!nodeId || !(nodeId in get().nodeWaitTimes)) return;
      const next = { ...get().nodeWaitTimes };
      delete next[nodeId];
      set({ nodeWaitTimes: next });
    },

    setNodeSwitch: (nodeId, sw) => {
      if (!nodeId) return;
      const written = switchToWrite(sw, deps.now());
      const next = { ...get().nodeSwitches };
      if (written) next[nodeId] = written;
      else delete next[nodeId];
      set({ nodeSwitches: next });
    },

    clearNodeSwitch: (nodeId) => {
      if (!nodeId || !(nodeId in get().nodeSwitches)) return;
      const next = { ...get().nodeSwitches };
      delete next[nodeId];
      set({ nodeSwitches: next });
    },

    setNodeTimer: (nodeId, ts) => {
      if (!nodeId) return;
      const next = { ...get().nodeTimers };
      if (ts != null) next[nodeId] = ts;
      else delete next[nodeId];
      set({ nodeTimers: next });
    },

    removeNodeTimer: (nodeId) => {
      if (!nodeId || !(nodeId in get().nodeTimers)) return;
      const next = { ...get().nodeTimers };
      delete next[nodeId];
      set({ nodeTimers: next });
    },

    setNodePendingTimer: (nodeId, ts) => {
      if (!nodeId) return;
      const next = { ...get().nodePendingTimers };
      if (ts != null) next[nodeId] = ts;
      else delete next[nodeId];
      set({ nodePendingTimers: next });
    },

    removeNodePendingTimer: (nodeId) => {
      if (!nodeId || !(nodeId in get().nodePendingTimers)) return;
      const next = { ...get().nodePendingTimers };
      delete next[nodeId];
      set({ nodePendingTimers: next });
    },
  });
}
