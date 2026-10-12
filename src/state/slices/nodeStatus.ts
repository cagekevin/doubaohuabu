/**
 * 节点状态三族（`TD-16-93`）—— 原 `shared.js` 的 store 字段
 *
 * ⚠️ 原则 1：只有 state 写 store；本片只做「把纯层结果落到 store」。
 * ⚠️ 形状真源在 `core/rules/nodeStatus.ts`（`NodeNotice`/`NodeWaitTime`/`NodeSwitch`）。
 * ⚠️ 生产者 = `state/sendWatch`（「发送后监测」循环）；消费者 = `TextNode` 的三块 UI
 *   （`reply-notice` / `wait-countdown` / `switch-status`）。
 * ⚠️ **不落 Wy（通知 zIndex 联动）**：源 `setNodeNotice` 会调 `Wy` 把通知节点的 `zIndex` 提到最前——
 *   那是**另一个 UI 细节**（依赖 `Ca`/`yp` 常量），与三块 UI 同批落，本片不预支。
 */

import type { NodeNotice, NodeSwitch, NodeWaitTime } from '@/core/rules/nodeStatus';
import { noticeToWrite, switchToWrite, waitTimeToWrite } from '@/core/rules/nodeStatus';

/** 注入（`now` 供 `at`/`detectedAt` 时间戳） */
export interface NodeStatusSliceDeps {
  now(): number;
  /**
   * ★ **自动视频检测开关**的读盘（原 `autoVideoDetect`，键 `doubao-auto-video-detect`）
   * ⚠️ 由 `store.ts` 经 `PERSIST[LS_AUTO_VIDEO_DETECT]` 注入（`state` 不碰 `localStorage`）
   */
  readAutoDetect(): boolean;
  /** 写盘（原 `Fd(key, v ? '1' : '0')`）—— **先写盘再改状态** */
  writeAutoDetect(on: boolean): void;
}

/**
 * 发送后检测的**调试面板数据**（原 `setDetectDebugInfo` 的载荷，`_Component43.jsx:1327-1343` 的 `Ae`）
 *
 * ⚠️ `status` 是**用户可见文案** ⇒ 值由**调用方**从 `constants/text.ts` 取（`state` 不编文案）。
 */
export interface DetectDebugInfo {
  lastPollAt: number;
  accountsTotal: number;
  projectAccounts: number;
  webviewsReady: number;
  sentAccounts: number;
  baselineCount: number;
  apiOk: boolean;
  videosTotal: number;
  videosReady: number;
  newVideos: number;
  lastError: string | null;
  status: string;
}

export interface NodeStatusSlice {
  // ── state ──
  nodeNotices: Record<string, NodeNotice>;
  nodeWaitTimes: Record<string, NodeWaitTime>;
  nodeSwitches: Record<string, NodeSwitch>;

  // ── 节点计时器（原 `nodeTimers` / `nodePendingTimers`）——
  //    生产者 = `state/postSendDetect`（源 `it` 的 `xe`：探测到「已提交」或等满 90s 才启动）──
  /** 节点 → 计时起点（ms；`timer-inline` 的读源） */
  nodeTimers: Record<string, number>;
  /** 节点 → 入队时刻（ms；`postSendDetect` 判定何时转成正式计时） */
  nodePendingTimers: Record<string, number>;
  // ── 发送后检测（原 `autoVideoDetect` / `setDetectDebugInfo`）──
  /** 自动视频检测开关（原 `autoVideoDetect`；持久化于 `doubao-auto-video-detect`） */
  autoVideoDetect: boolean;
  /** 检测调试面板数据（`null` = 从未跑过） */
  detectDebugInfo: DetectDebugInfo | null;

  // ── 通知（原 `setNodeNotice`/`clearNodeNotice` 31206-31239）──
  setNodeNotice: (nodeId: string, notice: Omit<NodeNotice, 'at'>) => void;
  clearNodeNotice: (nodeId: string) => void;
  // ── 等待（原 `setNodeWaitTime`/`clearNodeWaitTime` 31903-31936）──
  setNodeWaitTime: (nodeId: string, wait: Omit<NodeWaitTime, 'detectedAt'> & { detectedAt?: number }) => void;
  clearNodeWaitTime: (nodeId: string) => void;
  // ── 换号（原 `setNodeSwitch`/`clearNodeSwitch` 31268-31299）──
  setNodeSwitch: (nodeId: string, sw: Omit<NodeSwitch, 'at'>) => void;
  clearNodeSwitch: (nodeId: string) => void;

  // ── 计时器（原 `setNodeTimer` / `setNodePendingTimer` / `removeNodePendingTimer`）──
  /** 启动/更新节点计时（原 `setNodeTimer` 31846；★ `at == null` ⇒ **删除**） */
  setNodeTimer: (nodeId: string, at: number | null) => void;
  /** 登记「待启动计时」（原 `setNodePendingTimer` 31875；★ `at == null` ⇒ **删除**） */
  setNodePendingTimer: (nodeId: string, at: number | null) => void;
  /** 转成正式计时后清除待启动登记（原 `removeNodePendingTimer(id)`） */
  removeNodePendingTimer: (nodeId: string) => void;
  // ── 检测调试 ──
  /**
   * 合并写调试数据（原 `Ae(patch)`：源每次都带一套默认值再覆盖 patch）
   * ⚠️ 只做「合并 + 落 store」；`status` 文案由调用方从 `constants/text.ts` 给。
   */
  setDetectDebugInfo: (patch: Partial<DetectDebugInfo>) => void;
  /** 切自动检测开关（原 `setAutoVideoDetect`）—— **先写盘再改状态** */
  setAutoVideoDetect: (on: boolean) => void;
}

export function createNodeStatusSlice(deps: NodeStatusSliceDeps) {
  return (set: (partial: Partial<NodeStatusSlice>) => void, get: () => NodeStatusSlice): NodeStatusSlice => ({
    nodeNotices: {},
    nodeWaitTimes: {},
    nodeSwitches: {},
    nodeTimers: {},
    nodePendingTimers: {},
    // ★ 初值**读盘**（原 `autoVideoDetect: jT()` —— 键 `doubao-auto-video-detect`）
    autoVideoDetect: deps.readAutoDetect(),
    detectDebugInfo: null,

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

    // ── 计时器（原 `setNodeTimer` 31846 / `setNodePendingTimer` 31875 / `removeNodePendingTimer` 31891）──
    setNodeTimer: (nodeId, at) => {
      if (!nodeId) return;
      const next = { ...get().nodeTimers };
      if (at != null) next[nodeId] = at;
      else delete next[nodeId];
      set({ nodeTimers: next });
    },

    setNodePendingTimer: (nodeId, at) => {
      if (!nodeId) return;
      const next = { ...get().nodePendingTimers };
      if (at != null) next[nodeId] = at;
      else delete next[nodeId];
      set({ nodePendingTimers: next });
    },

    removeNodePendingTimer: (nodeId) => {
      if (!nodeId || !(nodeId in get().nodePendingTimers)) return;
      const next = { ...get().nodePendingTimers };
      delete next[nodeId];
      set({ nodePendingTimers: next });
    },

    // 原 `Ae(patch)`（`_Component43.jsx:1327-1343`）：**每次都带一套默认值再覆盖 patch**
    setDetectDebugInfo: (patch) => {
      set({
        detectDebugInfo: {
          lastPollAt: deps.now(),
          accountsTotal: 0,
          projectAccounts: 1,
          webviewsReady: 1,
          sentAccounts: 1,
          baselineCount: 0,
          apiOk: false,
          videosTotal: 0,
          videosReady: 0,
          newVideos: 0,
          lastError: null,
          status: '',
          ...patch,
        },
      });
    },

    // 原 `setAutoVideoDetect`：**先写盘再改状态**（同 `setViewHeadCollapsed`）
    setAutoVideoDetect: (on) => {
      deps.writeAutoDetect(on);
      set({ autoVideoDetect: on });
    },

  });
}
