/**
 * 撤销/重做栈（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：`commit` 26890-26929 / `undo` 26930-26950 / `redo` 26951-26975
 *
 * ⚠️ **快照时机 = 变更之前**（本重写统一的约定）：
 *   原实现在拖拽流程里是 `commit('graph-move')` **先于** setState（29001），
 *   而 `onConnect` 却是 setState **之后** commit（27013）——**原实现自相矛盾**。
 *   本重写统一采用「**变更前 commit**」：只有这个约定能让 undo 恢复"变更前的状态"。
 *   （差异已记入 `09-校验记录`）
 *
 * ⚠️ 合并规则（原实现）：**同 key 且间隔 < 800ms** ⇒ 不压新快照（只清 future）
 * ⚠️ 栈上限 **80**，超出 `shift()` 掉最旧的
 */

import { UNDO_LIMIT, UNDO_MERGE_MS } from '@/constants';

/** 撤销栈状态（原实现放在 store 里的 `past`/`future`/`_lastCommit`） */
export interface UndoStack<T> {
  past: T[];
  future: T[];
  /** 上一次 commit 的 key（原 `_lastCommit.key`） */
  lastKey: string | null;
  /** 上一次 commit 的时间戳（原 `_lastCommit.time`） */
  lastAt: number;
}

export const initialUndoStack = <T>(): UndoStack<T> => ({
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
});

/** 是否应合并进上一次提交（原：`n && _lastCommit && key === n && now - time < 800`） */
export function shouldMerge(
  stack: UndoStack<unknown>,
  key: string,
  now: number,
  windowMs: number = UNDO_MERGE_MS,
): boolean {
  return !!key && stack.lastKey === key && now - stack.lastAt < windowMs;
}

/**
 * 提交一次快照（原 `commit`）
 *
 * @param snapshot **变更前**的状态
 * @returns 新栈（合并时只清 `future`，不压栈）
 */
export function commitSnapshot<T>(
  stack: UndoStack<T>,
  snapshot: T,
  key: string,
  now: number,
  limit: number = UNDO_LIMIT,
): UndoStack<T> {
  if (shouldMerge(stack, key, now)) {
    // 合并：不压栈，只清 future + 刷新时间（原实现 `e({future: []}); return;`）
    return { ...stack, future: [], lastAt: now };
  }

  const past = [...stack.past, snapshot];
  if (past.length > limit) past.shift();

  return { past, future: [], lastKey: key, lastAt: now };
}

export interface UndoOutcome<T> {
  stack: UndoStack<T>;
  /** 要恢复到的状态 */
  restored: T;
}

/** 撤销（原 `undo`）—— 无可撤销时返回 `null` */
export function undo<T>(
  stack: UndoStack<T>,
  current: T,
  limit: number = UNDO_LIMIT,
): UndoOutcome<T> | null {
  if (stack.past.length === 0) return null;

  const restored = stack.past[stack.past.length - 1] as T;
  const past = stack.past.slice(0, -1);

  const future = [...stack.future, current];
  if (future.length > limit) future.shift();

  return { stack: { past, future, lastKey: null, lastAt: 0 }, restored };
}

/** 重做（原 `redo`）—— 无可重做时返回 `null` */
export function redo<T>(
  stack: UndoStack<T>,
  current: T,
  limit: number = UNDO_LIMIT,
): UndoOutcome<T> | null {
  if (stack.future.length === 0) return null;

  const restored = stack.future[stack.future.length - 1] as T;
  const future = stack.future.slice(0, -1);

  const past = [...stack.past, current];
  if (past.length > limit) past.shift();

  return { stack: { past, future, lastKey: null, lastAt: 0 }, restored };
}
