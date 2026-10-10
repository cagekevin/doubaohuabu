/**
 * 账号池选号（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据：docs/03-人类版.md §4（`doubao-account-pool-strategy` 34467 / 34482）
 *   - 策略 `round-robin` / `least-load`
 *   - 只从**可用**账号里选（`isAccountUsable`）
 *   - 可排除已失败的账号（配合 `core/rules/failure` 的 `retry-switch`）
 *
 * ⚠️ 纯决策，不做 IO；调用方拿结果去调 `SitePort`
 */

import type { Account, PoolStrategy } from '@/stable/model/account';
import { isAccountUsable } from '@/stable/model/account';

export interface PickOptions {
  /** 选号策略（默认 `round-robin`） */
  strategy?: PoolStrategy;
  /** 本轮已失败的账号（排除） */
  exclude?: readonly string[];
  /**
   * **正在忙**的账号（已在跑任务）—— W11 判据 ②：
   * 忙账号**跳过**；若全忙 ⇒ `all-busy`（调用方**排队**，不是报错）
   * （原实现：`accountConcurrency = 1`，一个账号同时只跑一个任务）
   */
  busy?: readonly string[];
  /** 指定账号（跳过池调度） */
  preferId?: string | null;
  /** round-robin 的游标（上次用到的下标） */
  cursor?: number;
}

export interface PickResult {
  account: Account | null;
  /** 下一个游标（round-robin 用；调用方存回 state） */
  nextCursor: number;
  /**
   * 为什么没选到（供上层透传原文）
   * | 值 | 含义 | 上层动作 |
   * |---|---|---|
   * | `ok` | 选到 | 直接发 |
   * | `no-account` | 池里**没有可用**账号（含全失效） | 提示人工（`no-account`） |
   * | `all-excluded` | 可用账号**本轮全失败过** | 停手 / 换批 |
   * | `all-busy` | 可用账号**全在忙** | ★ **排队等待**（W11 判据 ③） |
   */
  reason: 'ok' | 'no-account' | 'all-excluded' | 'all-busy';
}

/**
 * 选号
 *
 * | 策略 | 规则 |
 * |---|---|
 * | `round-robin` | 从 `cursor` 起**环形**找第一个可用且未被排除的 |
 * | `least-load` | 取 `loadOf` 最小者（未提供 `loadOf` 时退化为 `round-robin`） |
 */
export function pickAccount(
  accounts: readonly Account[],
  opts: PickOptions = {},
  loadOf?: (a: Account) => number,
): PickResult {
  const exclude = new Set(opts.exclude ?? []);
  const busy = new Set(opts.busy ?? []);
  const usable = accounts.filter((a) => isAccountUsable(a));

  if (usable.length === 0) return { account: null, nextCursor: 0, reason: 'no-account' };

  const free = (a: Account): boolean => !exclude.has(a.id) && !busy.has(a.id);

  // 指定账号：只要求它可用、未被排除、且不忙
  if (opts.preferId) {
    const hit = usable.find((a) => a.id === opts.preferId && free(a));
    if (hit) {
      const idx = accounts.findIndex((a) => a.id === hit.id);
      return { account: hit, nextCursor: (idx + 1) % Math.max(1, accounts.length), reason: 'ok' };
    }
    // 指定的不可用/忙 → 回落池调度（不报错，与原实现一致）
  }

  const candidates = usable.filter(free);
  if (candidates.length === 0) {
    // ★ 区分「全忙」与「全失败过」（W11 判据 ③：全忙 ⇒ 排队，不是报错）
    const busyAndNotExcluded = usable.some((a) => busy.has(a.id) && !exclude.has(a.id));
    return {
      account: null,
      nextCursor: opts.cursor ?? 0,
      reason: busyAndNotExcluded ? 'all-busy' : 'all-excluded',
    };
  }

  const strategy: PoolStrategy = opts.strategy ?? 'round-robin';

  if (strategy === 'least-load' && loadOf) {
    let best = candidates[0] as Account;
    let bestLoad = loadOf(best);
    for (const a of candidates) {
      const l = loadOf(a);
      if (l < bestLoad) {
        best = a;
        bestLoad = l;
      }
    }
    const idx = accounts.findIndex((a) => a.id === best.id);
    return { account: best, nextCursor: (idx + 1) % Math.max(1, accounts.length), reason: 'ok' };
  }

  // round-robin：从 cursor 起环形（跳过不可用 / 已排除 / 忙）
  const start = Math.max(0, opts.cursor ?? 0) % Math.max(1, accounts.length);
  for (let i = 0; i < accounts.length; i++) {
    const idx = (start + i) % accounts.length;
    const a = accounts[idx] as Account;
    if (isAccountUsable(a) && free(a)) {
      return { account: a, nextCursor: (idx + 1) % Math.max(1, accounts.length), reason: 'ok' };
    }
  }

  // 理论上不可达（candidates 非空 ⇒ 必然能环到）；兜底给 all-busy
  return { account: null, nextCursor: start, reason: 'all-busy' };
}

/** 可用账号数（供 UI 显示「可用/不可用」） */
export function countUsable(accounts: readonly Account[]): number {
  return accounts.reduce((n, a) => n + (isAccountUsable(a) ? 1 : 0), 0);
}
