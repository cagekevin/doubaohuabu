/**
 * 「排队追问」的**纯逻辑**（★ 必测）—— 原 `GR`(shared.js:36631-36659) 与追问文案映射
 *
 * ★★ **它为什么存在**（`TD-16-103`）：源 `_Component43.jsx:2200-2266` 的追问循环把「发完之后
 *   到底在排队还是真的在生成」这件事**追问页面**问出来 —— 它是 `queueProgress` 的**唯一生产者**。
 *   本仓此前**整条没落**，于是面板第三参恒 `null`、`deriveGenView` 恒走"生成中"兜底。
 *   本文件是那条链的**纯逻辑半**（节奏 + 文案），编排半在 `state/sendQueue.ts`。
 *
 * 依据（**逐行回源抄录**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `shouldPingQueueProgress` | `GR` 36631 | 该不该发这一次追问（节奏闸） |
 *   | `queuePingText` | `_Component43.jsx:2255-2262` 的 `st` | `kind` → 给用户看的一句话 |
 *
 * ⚠️ **本模块不接触** `Date` / `window` / 随机（原则 4）：`now` 由调用方注入。
 */

import { QUEUE_PING_FIRST_MS, QUEUE_PING_INTERVAL_MS, QUEUE_PING_MAX } from '@/constants';
import { QUEUE_PING_TEXT } from '@/constants/text';
import type { ReplyKind } from './replyKind';

/** 追问节奏闸的入参（原 `GR(e = {})` 的解构） */
export interface QueuePingGate {
  /** 已追问次数（源 `pings`） */
  pings?: number;
  /** 发出时刻（源 `ackedAt`）—— 首次追问以它为基准 */
  ackedAt?: number;
  /** 上次追问时刻（源 `lastPingAt`） */
  lastPingAt?: number;
  /** 当前时刻（**必须注入** —— 源内联 `Date.now()`） */
  now: number;
  /** 本轮是否已出终态（源 `finished`） */
  finished?: boolean;
  /** 是否已确认在生成（源 `generating`）⇒ 不必再追问 */
  generating?: boolean;
  /** 次数上限（默认 `QUEUE_PING_MAX` = 源 `Cp`） */
  maxPings?: number;
}

/**
 * 该不该发这一次追问（原 `GR` 36631-36659）
 *
 * 逐条对齐源（**顺序即语义**）：
 *   ① `pings >= maxPings` / `finished` / `generating` ⇒ **不问**（已经有了答案）
 *   ② `ackedAt` 为 0（还没发出） ⇒ **不问**
 *   ③ `pings === 0` ⇒ 距 `ackedAt` 满 `QUEUE_PING_FIRST_MS` 才问
 *   ④ 否则 ⇒ 距 `lastPingAt` 满 `QUEUE_PING_INTERVAL_MS` 才问；`lastPingAt` 为 0 ⇒ **不问**
 */
export function shouldPingQueueProgress(gate: QueuePingGate): boolean {
  const {
    pings = 0,
    ackedAt = 0,
    lastPingAt = 0,
    now,
    finished = false,
    generating = false,
    maxPings = QUEUE_PING_MAX,
  } = gate;

  // ① 原 36640-36642
  if (Number(pings) >= Number(maxPings) || finished || generating) return false;

  // ② 原 36643-36646
  const acked = Number(ackedAt) || 0;
  if (!acked) return false;

  // ③ 原 36647-36649：首次
  if (pings === 0) return now - acked >= QUEUE_PING_FIRST_MS;

  // ④ 原 36650-36656：之后
  const last = Number(lastPingAt) || 0;
  if (last) return now - last >= QUEUE_PING_INTERVAL_MS;
  return false;
}

/**
 * 追问结果 → 给用户看的一句话（原 `_Component43.jsx:2255-2262` 的 `st`）
 *
 * ⚠️ 源的 `other` 分支是 `` `助手回复：${String(He || '').slice(0, 80)}` `` —— **截断 80 字符**，
 *   防把一整篇回复塞进面板那行小字里。这里保持同一截断。
 */
export function queuePingText(kind: ReplyKind | string, replyText?: unknown): string {
  const T = QUEUE_PING_TEXT;
  if (kind === 'none') return T.none;
  if (kind === 'offer') return T.offer;
  if (kind === 'busy') return T.busy;
  if (kind === 'no-reply') return T.noReply;
  return T.other(String(replyText || '').slice(0, 80));
}
