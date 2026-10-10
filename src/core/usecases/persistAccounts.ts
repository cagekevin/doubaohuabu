/**
 * usecase · 持久化账号族（**怎么存**）
 *
 * 依据：`docs/14` §2 的 ⭐ 缺口「`doubao-accounts` **只读不写**」——
 *   实测 `PERSIST[LS_ACCOUNTS]` **全仓只在 `bootstrap/hydrate` 被读**，无任何写入点
 *   ⇒ **账号增删改一刷新就丢**（用户级数据丢失，与「切项目串数据」同级）。
 *
 * ⚠️ 与 `persistProject` 同模式（职责分离，`docs/11` §6.5 审计错位 6）：
 *   - `state/persist`：**何时存**（订阅 + 防抖 600ms + `beforeunload`）
 *   - 本文件：**怎么存**（写哪几个键）
 *
 * ⚠️ 原则 1：**不写 store**，返回 `Result` 由 state 层处理。
 * ⚠️ 原则 6：错误 `message` **原样透传**（不改写、不加前缀）。
 *
 * ⚠️ **不是事务**：4 个键**独立**写，任一失败即返回（**前面成功的键已落盘**）。
 *    `localStorage` 本身没有事务，所以这里**不假装有** —— 失败时把「是哪个键」放进 `cause`
 *    便于诊断（`message` 保持原文）。
 */

import type { Account, AccountGroup, PoolStrategy } from '@/stable/model/account';
import type { StoragePort } from '@/core/ports/storage.port';
import type { LsKey } from '@/stable/contracts/keys';
import {
  LS_ACCOUNT_GROUPS,
  LS_ACCOUNT_POOL_STRATEGY,
  LS_ACCOUNTS,
  LS_PROXY_POOL,
} from '@/stable/contracts/keys';
import { err, ok, toMessage, type Result } from '@/core/model/result';

/** 账号族的落盘依赖 */
export interface AccountPersistDeps {
  storage: StoragePort;
}

/** 要落的账号族数据（与 `state` 的 `global` 片字段一一对应） */
export interface AccountPersistInput {
  accounts: Account[];
  groups: AccountGroup[];
  proxyPool: string[];
  poolStrategy: PoolStrategy;
}

export interface AccountPersistOk {
  /** 实际写入的键数 */
  written: number;
}

/**
 * 写账号族的 4 个键
 *
 * 键与字段的对应（**顺序即语义，与 `stable/contracts/keys.ts` 一致**）：
 *   `doubao-accounts` ← `accounts`
 *   `doubao-account-groups` ← `groups`
 *   `doubao-proxy-pool` ← `proxyPool`
 *   `doubao-account-pool-strategy` ← `poolStrategy`
 *
 * ⚠️ 用 `storage.write`（**与 `state/persistKeys` 的 `PERSIST[key].write` 是同一个调用**）
 *    —— 不是另造一条写路径。
 */
export function persistAccounts(
  input: AccountPersistInput,
  deps: AccountPersistDeps,
): Result<AccountPersistOk> {
  const writes: ReadonlyArray<readonly [LsKey, unknown]> = [
    [LS_ACCOUNTS, input.accounts],
    [LS_ACCOUNT_GROUPS, input.groups],
    [LS_PROXY_POOL, input.proxyPool],
    [LS_ACCOUNT_POOL_STRATEGY, input.poolStrategy],
  ];

  for (const [key, value] of writes) {
    try {
      deps.storage.write(key, value);
    } catch (e) {
      // ★ message 原样（原则 6）；「哪个键」放 cause 供诊断
      return err('unknown', toMessage(e), { key, error: e });
    }
  }

  return ok({ written: writes.length });
}
