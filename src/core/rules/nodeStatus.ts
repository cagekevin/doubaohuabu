/**
 * 节点状态三族的数据形状（原 `shared.js` 的 store 字段）
 *
 * ★ **2026-10-12（`TD-16-93`）**：`nodeNotices` / `nodeWaitTimes` / `nodeSwitches` 三族的形状。
 *   它们是 **store 字段**（不是 `node.data`）；生产者 = `state/sendWatch`（「发送后监测」循环），
 *   消费者 = `TextNode` 的 `reply-notice` / `wait-countdown` / `switch-status` 三块 UI。
 *
 * ⚠️ **形状照抄源**（`shared.js`）：
 *   | 族 | 源 | 形状 | setter 守卫 |
 *   |---|---|---|---|
 *   | `nodeNotices` | 31199-31239 | `{level,code,accountId,title,text,at}` | `text` 有值才设，否则删 |
 *   | `nodeWaitTimes` | 31903-31936 | `{minutes,seconds,detectedAt,text}` | `seconds > 0` 才设，否则删 |
 *   | `nodeSwitches` | 31268-31299 | `{state,fromName,toName?,reason,at}` | `state` 有值才设，否则删 |
 *
 * ⚠️ **本文件只放形状**，setter/clear 的**写入逻辑**在 `state/slices/nodeStatus.ts`
 *   （原则 1：只有 state 写 store）。这里的纯函数只供 setter 做「该不该写」的判定（可单测）。
 */

import { pad2 } from '@/lib/time';

/** 节点通知（原 `setNodeNotice` 写入的形状） */
export interface NodeNotice {
  /**
   * 语气档 —— **三档**（`error` 必须有）：源 `Qh` 里 `infringe` / `cannot-return` 两条是
   * `level: 'error'`（`shared.js:25032-25040`），`ye` 直接把它透传给 `setNodeNotice`（`:2602`）。
   */
  level: 'info' | 'warn' | 'error';
  code: string;
  /**
   * 产出这条通知的账号 —— **可选**：源 6 个 `setNodeNotice` 调用点里**只有 2 个**传它
   * （`_Component43.jsx:1806`/`:1824`），另外 4 个（`:2571`/`:2601`/`:2629`/`:2991`）**根本不传**
   * ⇒ 形状里不能强制它（源 `setNodeNotice` 是 `{...r, at}` 直接展开）。
   */
  accountId?: string | null;
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

// ─────────────────────────── 账号节点的「已过时长」计时器（原 `LL` + `OL.jsx:255-415`）───────────────────────────

/** 红档阈值（ms，原 `OL.jsx:415` 的 `600000` = 10 分钟） */
const TIMER_RED_MS = 600000;
/** 黄档阈值（ms，原 `OL.jsx:415` 的 `300000` = 5 分钟） */
const TIMER_YELLOW_MS = 300000;

/**
 * 毫秒 → 「已过时长」文本（原 `LL`，`shared.js:40736-40752`）
 *
 * ⚠️ **与 `formatCountdown`（原 `NL`）不是同一个**（判据 C1 管的是**同一形态**，这两个不同）：
 *   · 本函数用 **floor**（向下取整）；`NL` 用 **ceil**
 *   · 本函数的**时位补零**（`padStart(2,'0')`）；`NL` 的时位**不补**（`1:02:03` vs `01:02:03`）
 *   · 负值 / 非有限 ⇒ 源归 **0**（`NL` 是 `max(0, ceil(...))`）
 */
export function formatElapsed(ms: number): string {
  const v = ms < 0 || !Number.isFinite(ms) ? 0 : ms;
  const total = Math.floor(v / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** 计时器档位（原 `OL.jsx:415` 的 `timer-red` / `timer-yellow` / 无后缀 三支） */
export type TimerBand = 'red' | 'yellow' | 'normal';

/** 已过时长 → 档位（**顺序即语义**：先判红再判黄 —— 源就是嵌套三元） */
export function timerBand(elapsedMs: number): TimerBand {
  if (elapsedMs >= TIMER_RED_MS) return 'red';
  if (elapsedMs >= TIMER_YELLOW_MS) return 'yellow';
  return 'normal';
}
