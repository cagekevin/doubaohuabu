/**
 * 节点状态五族的数据形状（原 `shared.js` 的 store 字段）
 *
 * ★ **2026-10-12（`TD-16-93` 数据层）**：通知三族（`nodeNotices`/`nodeWaitTimes`/`nodeSwitches`）
 *   + 计时器两族（`nodeTimers`/`nodePendingTimers`）的形状。它们是 **store 字段**（不是
 *   `node.data`），生产者 = 「发送后监测」循环（原 `_Component43` 的 `autoConfirm`/`watchSendReply`，
 *   **未移植**），消费者 = `TextNode` 的 `reply-notice`/`wait-countdown`/`switch-status` 三块 UI。
 *
 * ⚠️ **形状照抄源**（`shared.js`）：
 *   | 族 | 源 | 形状 | setter 守卫 |
 *   |---|---|---|---|
 *   | `nodeNotices` | 31199-31239 | `{level,code,accountId,title,text,at}` | `text` 有值才设，否则删 |
 *   | `nodeWaitTimes` | 31903-31936 | `{minutes,seconds,detectedAt,text}` | `seconds > 0` 才设，否则删 |
 *   | `nodeSwitches` | 31268-31299 | `{state,fromName,toName?,reason,at}` | `state` 有值才设，否则删 |
 *   | `nodeTimers` | 31845-31873 | `number`（时间戳） | `r != null` 才设，否则删 |
 *   | `nodePendingTimers` | 31874-31902 | `number`（时间戳） | 同上 |
 *
 * ⚠️ **本文件只放形状**，setter/clear 的**写入逻辑**在 `state/slices/nodeStatus.ts`
 *   （原则 1：只有 state 写 store）。这里的纯函数只供 setter 做「该不该写」的判定（可单测）。
 */

/** 节点通知（原 `setNodeNotice` 写入的形状） */
export interface NodeNotice {
  level: 'info' | 'warn';
  code: string;
  accountId: string | null;
  title: string;
  text: string;
  /** 写入时刻（原 `setNodeNotice` 的 `at: Date.now()`） */
  at: number;
}

/** 节点等待倒计时（原 `setNodeWaitTime` 写入的形状） */
export interface NodeWaitTime {
  minutes: number;
  seconds: number;
  detectedAt: number;
  text: string;
}

/** 节点换号状态（原 `setNodeSwitch` 写入的形状） */
export interface NodeSwitch {
  state: 'switching' | 'done' | 'failed';
  fromName: string;
  toName?: string;
  reason: string;
  /** 写入时刻（原 `setNodeSwitch` 的 `at: Date.now()`） */
  at: number;
}

/**
 * `setNodeNotice` 的「该不该写」守卫（原 31213-31221）
 *
 * @returns `notice | null` —— 有 `text` 则返回**带 `at`** 的完整通知，否则 `null`（= 删除）
 */
export function noticeToWrite(input: Omit<NodeNotice, 'at'>, at: number): NodeNotice | null {
  if (!input || !input.text) return null;
  return { ...input, at };
}

/**
 * `setNodeWaitTime` 的「该不该写」守卫（原 31911-31920）
 *
 * @returns `wait | null` —— `seconds > 0` 则返回完整倒计时，否则 `null`（= 删除）
 */
export function waitTimeToWrite(input: Omit<NodeWaitTime, 'detectedAt'> & { detectedAt?: number }, at: number): NodeWaitTime | null {
  if (!input || !(input.seconds > 0)) return null;
  return { minutes: input.minutes, seconds: input.seconds, detectedAt: input.detectedAt || at, text: input.text || '' };
}

/**
 * `setNodeSwitch` 的「该不该写」守卫（原 31276-31286）
 *
 * @returns `sw | null` —— 有 `state` 则返回**带 `at`** 的完整状态，否则 `null`（= 删除）
 */
export function switchToWrite(input: Omit<NodeSwitch, 'at'>, at: number): NodeSwitch | null {
  if (!input || !input.state) return null;
  return { ...input, at };
}
