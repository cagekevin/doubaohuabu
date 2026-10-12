/**
 * 「发送后监测」的**纯判据**（原 `_Component43.jsx` 的 `watchSendReply` 里的判断段）
 *
 * 依据（**逐字回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `pickReplyNotice` | `ye` 2585-2607 | 从回复通知计数里挑**一条**要显示的（跳过已通知 / 无增量，取语气最高） |
 *   | `quotaExhaustedNotice` | `ye` 2569-2577 | 「今日免费次数用尽」的专用分支 |
 *   | `quotaLowNotice` | `Ne` 2621-2634 | 额度不足的通知（四种文案） |
 *   | `isSendEffective` | `:2669` | 「本次发送已生效」= 计数**超过监听起点的基线** |
 *
 * ⚠️ 本模块**不碰 `Date.now()`**（原则 4）：时间戳由 `state` 的 setter 补（`at`/`detectedAt`）。
 * ⚠️ 规则表 / 阈值 / 文案**全在 `constants/sendWatch.ts`**（SSOT：页面脚本与 app 侧共用一份）。
 * ⚠️ **不返回 `null` 冒充失败**：返回 `null` 一律表示"**本轮没有要显示的通知**"（成功语义）。
 */

import {
  QUOTA_EXHAUSTED_FALLBACK_TEXT,
  QUOTA_LOW_CODE,
  QUOTA_LOW_FALLBACK_TEXT,
  QUOTA_LOW_TITLE,
  REPLY_NOTICE_RULES,
  type ReplyNoticeLevel,
  type ReplyNoticeRule,
} from '@/constants/sendWatch';
import type {
  GenAckReading,
  QuotaUsageReading,
  ReplyNoticeReading,
  WaitTimeReading,
} from '@/core/ports/site.port';
import type { NodeNotice } from './nodeStatus';

/** 要写进 store 的通知（不含 `at` —— 由 `state/slices/nodeStatus` 的 setter 补） */
export type NoticePatch = Omit<NodeNotice, 'at'>;

/** 语气权重（原 `ye` 2580-2583 的 `Te`）—— 命中多条时取**最高级** */
const LEVEL_WEIGHT: Record<ReplyNoticeLevel, number> = { error: 3, warn: 2, info: 1 };

/** 「今日免费次数用尽」的 `code`（原 `ye` 2569 的字面量；也是 `Qh` 里那条规则的 `code`） */
export const QUOTA_EXHAUSTED_CODE = 'quota-exhausted';

/**
 * 挑一条要显示的回复通知（原 `ye` 2585-2607）
 *
 * 逐条对齐源版：
 *   · **跳过 `quota-exhausted`** —— 它走专用分支（见 `quotaExhaustedNotice`，那条还会触发换号）
 *   · **跳过已通知过的 `code`**（`seen`，源 `G`）
 *   · **跳过没有增量的**（`counts[code] <= baseline[code]`，源 `lt`）
 *   · 命中的取**语气最高**的一条（`error` > `warn` > `info`）；同级**先遍历到的先得**（源同）
 *   · `text` = `(sample || '').trim() || rule.title`
 *
 * @returns 要写的通知；**没有** ⇒ `null`
 */
export function pickReplyNotice(
  counts: Record<string, number>,
  samples: Record<string, string>,
  baseline: Record<string, number>,
  seen: ReadonlySet<string>,
  rules: readonly ReplyNoticeRule[] = REPLY_NOTICE_RULES,
): NoticePatch | null {
  let best: { rule: ReplyNoticeRule; sample: string } | null = null;

  for (const code of Object.keys(counts)) {
    if (code === QUOTA_EXHAUSTED_CODE) continue;
    if (seen.has(code)) continue;
    if ((counts[code] || 0) <= (baseline[code] || 0)) continue;

    const rule = rules.find((r) => r.code === code);
    if (!rule) continue; // 表里没有的 code ⇒ 不认（**不造**一条规则出来）
    if (!best || LEVEL_WEIGHT[rule.level] > LEVEL_WEIGHT[best.rule.level]) {
      best = { rule, sample: samples[code] ?? '' };
    }
  }

  if (!best) return null;
  return {
    level: best.rule.level,
    code: best.rule.code,
    title: best.rule.title,
    text: (best.sample || '').trim() || best.rule.title,
  };
}

/**
 * 「今日免费次数用尽」的通知（原 `ye` 2569-2577 的专用分支）
 *
 * ⚠️ 与源的一处**结构性差异（留痕）**：源把 `title`/`level` **写死在调用处**（`:2572-2574`），
 *    而同一份值在 `Qh` 里**又有一份**（25028）⇒ 两处真相。本实现**只从表里取**（SSOT）。
 *
 * @returns 要写的通知；表里**没有**这条规则 ⇒ `null`（SSOT 缺项应当去改表，不在这里补）
 */
export function quotaExhaustedNotice(sample: string | undefined): NoticePatch | null {
  const rule = REPLY_NOTICE_RULES.find((r) => r.code === QUOTA_EXHAUSTED_CODE);
  if (!rule) return null;
  return {
    level: rule.level,
    code: rule.code,
    title: rule.title,
    text: sample || QUOTA_EXHAUSTED_FALLBACK_TEXT,
  };
}

/**
 * 额度不足的文案（原 `Ne` 2621-2628 的四分支）
 *
 * 源（逐字）：`consume` 有值 ⇒ 「本次创作消耗了 N 额度（≥ 阈值 T），额度已所剩不多。」；
 * 否则 `remain` 有值 ⇒ 「剩余额度仅 N（≤ 阈值 T），额度不足。」；
 * 否则 `reason === 'explicit'` ⇒ 「检测到「原文」，本次创作额度不足。」；否则初值兜底。
 */
export function quotaLowText(
  reading: QuotaUsageReading,
  consumeWarn: number,
  remainWarn: number,
): string {
  if (reading.reason === 'consume' && reading.consume != null) {
    return `本次创作消耗了 ${reading.consume} 额度（≥ 阈值 ${consumeWarn}），额度已所剩不多。`;
  }
  if (reading.reason === 'remain' && reading.remain != null) {
    return `剩余额度仅 ${reading.remain}（≤ 阈值 ${remainWarn}），额度不足。`;
  }
  if (reading.reason === 'explicit') {
    return `检测到「${reading.sample}」，本次创作额度不足。`;
  }
  return QUOTA_LOW_FALLBACK_TEXT;
}

/** 额度不足的通知（原 `Ne` 2629-2634） */
export function quotaLowNotice(
  reading: QuotaUsageReading,
  consumeWarn: number,
  remainWarn: number,
): NoticePatch {
  return {
    level: 'warn',
    code: QUOTA_LOW_CODE,
    title: QUOTA_LOW_TITLE,
    text: quotaLowText(reading, consumeWarn, remainWarn),
  };
}

/**
 * 「本次发送已生效」判定（原 `watchSendReply` 2669 的 `W.count > Ge`）
 *
 * ⚠️ 用**增量**而不是布尔：会话里往往残留着上一轮的回复 ⇒ 只判布尔会误判。
 */
export function isSendEffective(ack: GenAckReading, baselineCount: number): boolean {
  return ack.count > baselineCount;
}

// ─────────────────────────── 倒计时（原 `CL.jsx:37-64`）───────────────────────────

/** 倒计时读数（原 `CL.jsx:63-64` 的 `f`/`p`） */
export interface Countdown {
  /** 剩余**毫秒**（已钳到 `>= 0`） */
  remainingMs: number;
  /** 倒计时是否已结束（原 `p` = `!!c && f <= 0`） */
  ended: boolean;
}

/**
 * 由「等待时长记录 + 当前时刻」算倒计时（原 `CL.jsx:63-64`）
 *
 * 源（逐字）：`f = c ? Math.max(0, c.detectedAt + c.seconds * 1000 - Date.now()) : 0`；
 * `p = !!c && f <= 0` —— ★ 注意 `p` 要求 **`c` 存在**（没有记录时不算"已结束"）。
 *
 * ⚠️ 时刻**注入**（原则 4：`core` 不读 `Date.now()`）。
 */
export function countdownOf(
  wait: { detectedAt: number; seconds: number } | null | undefined,
  now: number,
): Countdown {
  if (!wait) return { remainingMs: 0, ended: false };
  const remainingMs = Math.max(0, wait.detectedAt + wait.seconds * 1000 - now);
  return { remainingMs, ended: remainingMs <= 0 };
}

// ─────────────────────────── 监测循环的跨轮状态机 ───────────────────────────

/** 一轮探测的读数（4 个探测；缺项 = 该站点没这个能力 / 本轮没跑） */
export interface WatchReading {
  /** 「已接单」计数（原 `ae('detect-gen-ack')`） */
  ack?: GenAckReading;
  /** 预计等待时长（原 `$('detect-wait-time')`）—— 只在 `waitTimeDone` 为假时才跑 */
  waitTime?: WaitTimeReading;
  /** 回复通知计数（原 `ye('detect-reply-notice')`） */
  notices?: ReplyNoticeReading;
  /** 额度用量（原 `Ne('detect-quota-usage')`）—— 只在 `quotaDone` 为假时才跑 */
  quota?: QuotaUsageReading;
}

/**
 * 监测的跨轮状态（原 `gt` 的闭包变量）
 *
 * | 字段 | 源 |
 * |---|---|
 * | `ackBaseline` | `Ge`（`:2368`，取「站点读数」与「模块级 `Wd[accountId]`」的**较大者**） |
 * | `noticeBaseline` | `lt`（`:2370`） |
 * | `quotaBaseline` | `dt`（`:2372`） |
 * | `seen` | `G`（`:2373`，已通知过的 `code`） |
 * | `waitTimeDone` | `Re`（`:2376`，"等待时长只解析一次"闩） |
 * | `quotaDone` | `Me`（`:2375`，"额度只预警一次"闩） |
 */
export interface WatchState {
  ackBaseline: number;
  noticeBaseline: Record<string, number>;
  quotaBaseline: number;
  seen: string[];
  waitTimeDone: boolean;
  quotaDone: boolean;
}

/** 初值（**还没建基线** —— 由 `seedWatchState` 用第一轮读数建） */
export function createWatchState(): WatchState {
  return {
    ackBaseline: 0,
    noticeBaseline: {},
    quotaBaseline: 0,
    seen: [],
    waitTimeDone: false,
    quotaDone: false,
  };
}

/**
 * 用**第一轮读数**建基线（原 `gt` 2366-2372）
 *
 * 源（逐字）：
 *   · `ge = ae('detect-gen-ack-base')`；`Le = Wd[Q] || 0`；`Ge = Math.max(ge ? ge.count : 0, Le)`
 *     ⇒ ★ **取较大者**：模块级的 `Wd[accountId]`（上一轮监测留下的计数）不能把基线压低，
 *       否则同一账号连发两次时，上一轮的计数会让本轮**立刻**误判成"已生效"。
 *   · `lt = we('detect-reply-notice-base')?.counts || {}`；`dt = Se('detect-quota-usage-base')?.lowCount || 0`
 *
 * @param persistedAckCount 模块级 `Wd[accountId]`（调用方传入；没有则传 `0`）
 */
export function seedWatchState(reading: WatchReading, persistedAckCount = 0): WatchState {
  return {
    ...createWatchState(),
    ackBaseline: Math.max(reading.ack ? reading.ack.count : 0, persistedAckCount),
    noticeBaseline: reading.notices ? { ...reading.notices.counts } : {},
    quotaBaseline: reading.quota ? reading.quota.lowCount : 0,
  };
}

/** 一轮的**要落 store 的东西**（`state` 只负责把这几样写进去 —— 原则 1） */
export interface WatchEffects {
  /** 要写的通知（按顺序覆盖；空数组 = 不写） */
  notices: NoticePatch[];
  /** 要写的等待倒计时（原 `$` 的 `setNodeWaitTime`） */
  waitTime: (WaitTimeReading & { hit: true }) | null;
  /** 「已接单」的最新计数（供调用方记进模块级 `Wd`；`null` = 本轮没读到） */
  ackCount: number | null;
}

/**
 * 推进一轮（原 `watchSendReply` 2650-2672 的判断段）—— **纯函数**，不碰 store / 不读时间
 *
 * 逐条对齐源版的**顺序即语义**：
 *   ① `ack`（`ae`）—— 只更新计数（不写 store）
 *   ② `waitTime`（`$`）—— 仅当 `!waitTimeDone` 且 `hit && seconds > 0` ⇒ 写；写完置闩
 *   ③ `quota`（`Ne`）—— 仅当 `!quotaDone`；`hit && lowCount > quotaBaseline` ⇒ 写「额度不足」通知 + 置闩
 *   ④ `notices`（`ye`）—— 先看 `quota-exhausted`（增量 ⇒ 写「今日免费次数用尽」）；否则取**语气最高**的一条
 *   ⑤ `ack` 增量 ⇒ 「本次发送已生效」（调用方据此打日志 / 记 `Wd`）
 *
 * ⚠️ **与源的一处有意偏离（留痕）**：源在 ③④ 命中后 `return`（因为紧接着要**换号重发**，
 *   见 `be`）。本工程**换号重发未落** ⇒ 这两支**只通知、不终止循环、也不假装已切换**
 *   （`stop` 恒为 `false`）—— 否则用户会以为已经换过号了。
 *
 * @returns `state` = 新一轮状态（不可变）· `effects` = 要落的 store 写 · `stop` = 是否结束监测
 */
export function reduceWatchRound(
  state: WatchState,
  reading: WatchReading,
  consumeWarn: number,
  remainWarn: number,
): { state: WatchState; effects: WatchEffects; stop: boolean } {
  const next: WatchState = { ...state, seen: [...state.seen] };
  const effects: WatchEffects = { notices: [], waitTime: null, ackCount: null };

  // ① 「已接单」计数（原 2650 / 2669）
  if (reading.ack) effects.ackCount = reading.ack.count;

  // ② 等待时长：只解析一次（原 2651 + `$` 的 `Re` 闩）
  if (!next.waitTimeDone && reading.waitTime && reading.waitTime.hit) {
    effects.waitTime = reading.waitTime;
    next.waitTimeDone = true;
  }

  // ③ 额度预警：只预警一次（原 2652 + `Ne` 的 `Me` 闩）
  if (!next.quotaDone && reading.quota) {
    const q = reading.quota;
    if (q.lowCount > next.quotaBaseline) {
      effects.notices.push(quotaLowNotice(q, consumeWarn, remainWarn));
      next.quotaDone = true;
    }
  }

  // ④ 回复通知（原 2658 → `ye`）
  if (reading.notices) {
    const counts = reading.notices.counts;
    // ④a `quota-exhausted` 的专用分支（原 2569-2577）
    const exhausted = counts[QUOTA_EXHAUSTED_CODE] || 0;
    if (exhausted > (next.noticeBaseline[QUOTA_EXHAUSTED_CODE] || 0)) {
      next.seen.push(QUOTA_EXHAUSTED_CODE);
      const notice = quotaExhaustedNotice(reading.notices.samples[QUOTA_EXHAUSTED_CODE]);
      if (notice) effects.notices.push(notice);
    } else {
      // ④b 其余规则：取语气最高的一条（原 2585-2607）
      const picked = pickReplyNotice(
        counts,
        reading.notices.samples,
        next.noticeBaseline,
        new Set(next.seen),
      );
      if (picked) {
        next.seen.push(picked.code);
        effects.notices.push(picked);
      }
    }
  }

  // ⚠️ 源在 ③④ 命中后会终止（因为要换号）；本工程**换号未落** ⇒ 恒不终止（见函数头注）
  return { state: next, effects, stop: false };
}
