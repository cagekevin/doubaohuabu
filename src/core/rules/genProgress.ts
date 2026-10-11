/**
 * 生成进度回显（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `tc` shared.js:42481-42492 —— 耗时格式化（`Ns` / `NmSSs`）
 *   - `B0` shared.js:42493-42567 —— 队列条目 + 节点 + 回复类型 → 进度文案
 *
 * ⚠️ 与原实现的**一处有意偏离**（判据 A1：UI 关注点不下沉到 core）：
 *   原版返回 `cls`（CSS 类名 `idle`/`na`/`unknown`/`failed`/`done`/`queued`/`generating`）。
 *   本模块改返回**状态枚举** `state`，由 `ui/` 映射成类名 —— 一一对应、行为等价，
 *   但 `core` 不再认识 CSS 类名。
 *
 * ⚠️ 窗口判据（原 **42513-42516**）：只认 `at >= startedAt - 1500` 且账号匹配的尝试记录
 *    —— 否则会把**上一轮**的失败/成功误当成本轮结果。
 * ⚠️ `now` 由调用方注入（原则 4）。
 */

import { GEN_ATTEMPT_WINDOW_MS } from '@/constants';
import { GEN_PROGRESS_TEXT } from '@/constants/text';
import { formatDuration } from '@/lib/time';

/** 进度状态（对应原 `cls`，一一映射；`ui` 负责转类名） */
export const GEN_PROGRESS_STATES = [
  'idle',
  'na',
  'unknown',
  'failed',
  'done',
  'queued',
  'generating',
] as const;
export type GenProgressState = (typeof GEN_PROGRESS_STATES)[number];

/** 队列条目（只取本规则需要的字段） */
export interface GenQueueEntryLite {
  status: string;
  accountId?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
}

/**
 * 节点 `data.genHistory.attempts` 的一条尝试记录
 * ⚠️ 数组元素允许 `null`/`undefined` —— 原版 filter 里就有 `!!p` 守卫（脏数据来自磁盘/旧版本）
 */
export interface GenAttemptLite {
  at?: number;
  status?: string;
  note?: string;
  accountId?: string | null;
}

/** 节点（只取本规则需要的字段） */
export interface GenNodeLite {
  data?: {
    genHistory?: { attempts?: Array<GenAttemptLite | null | undefined> };
    resultAt?: number;
  };
}

/** 回复类型（`replyKind.classifyReply` 的产物 + 原文） */
export interface GenReplyLite {
  kind?: string;
  text?: string;
}

/** 进度回显 */
export interface GenProgress {
  text: string;
  state: GenProgressState;
  /** 已耗时（`Ns` / `NmSSs`）；无 `startedAt` 时为空串 */
  elapsed: string;
  note: string;
}

/**
 * 耗时格式化（原 `tc` 42481）
 * `< 60s` → `Ns`；否则 `NmSSs`（秒数补零到 2 位）
 */
export function formatElapsed(
  from: number | null | undefined,
  to: number | null | undefined,
  now: number,
): string {
  if (!from) return '';
  const end = to || now;
  const sec = Math.max(0, Math.round((end - from) / 1000));
  return formatDuration(sec);
}

/** 进度回显（原 `B0` 42493） */
export function resolveGenProgress(
  entry: GenQueueEntryLite,
  node: GenNodeLite | null | undefined,
  reply: GenReplyLite | null | undefined,
  now: number,
): GenProgress {
  const running = entry.status === 'waiting' || entry.status === 'sending';

  // ① 还没成功过：waiting/sending → 「生成未开始」，其余 → 「—」
  if (entry.status !== 'success') {
    return {
      text: running ? GEN_PROGRESS_TEXT.notStarted : GEN_PROGRESS_TEXT.dash,
      state: running ? 'idle' : 'na',
      elapsed: '',
      note: '',
    };
  }

  // ② 成功但节点没了
  if (!node) {
    return {
      text: GEN_PROGRESS_TEXT.unknown,
      state: 'unknown',
      elapsed: '',
      note: GEN_PROGRESS_TEXT.nodeMissing,
    };
  }

  const data = node.data ?? {};
  const since = entry.finishedAt || entry.startedAt || 0;
  const attempts = Array.isArray(data.genHistory?.attempts) ? data.genHistory.attempts : [];
  const floorAt = (entry.startedAt || 0) - GEN_ATTEMPT_WINDOW_MS;
  const inWindow = attempts.filter((p) => {
    const at = p?.at;
    return (
      !!p &&
      typeof at === 'number' &&
      Number.isFinite(at) &&
      at >= floorAt &&
      (!entry.accountId || !p.accountId || p.accountId === entry.accountId)
    );
  });
  const last = inWindow.at(-1) ?? null;

  // ③ 本轮已有终态
  if (last && last.status === 'failed') {
    return {
      text: GEN_PROGRESS_TEXT.failed,
      state: 'failed',
      elapsed: since ? formatElapsed(since, null, now) : '',
      note: last.note || '',
    };
  }
  if (last && last.status === 'success') {
    return {
      text: GEN_PROGRESS_TEXT.done,
      state: 'done',
      elapsed: formatElapsed(since, data.resultAt || now, now),
      note: '',
    };
  }

  // ④ 无终态 → 按回复类型给「进行中」的语义
  const kind = reply?.kind;
  const elapsed = since ? formatElapsed(since, null, now) : '';
  const noteText = reply?.text ? String(reply.text) : '';

  if (kind === 'unknown') {
    return { text: GEN_PROGRESS_TEXT.unknown, state: 'unknown', elapsed, note: noteText || GEN_PROGRESS_TEXT.noProgress };
  }
  if (kind === 'offer') {
    return { text: GEN_PROGRESS_TEXT.queued, state: 'queued', elapsed, note: noteText || GEN_PROGRESS_TEXT.waitingStart };
  }
  if (kind === 'none') {
    return { text: GEN_PROGRESS_TEXT.idle, state: 'idle', elapsed, note: noteText || GEN_PROGRESS_TEXT.noRecord };
  }
  return { text: GEN_PROGRESS_TEXT.generating, state: 'generating', elapsed, note: noteText };
}
