/**
 * 账号「忙」标记（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `Fi` shared.js:34596-34610 —— 占用（`Er` Set + `Kc` 计数 + `markAccountBusy(id, HP)`）
 *   - `tn` shared.js:34614-34629 —— 释放（`itemId` 校验 + `releaseAccountBusy`）
 *   - `Hk` shared.js:34611 —— 是否忙
 *   - `HP` = `ACCOUNT_BUSY_TIMEOUT_MS`（1h，`docs/过程.md` §3）
 *
 * ⚠️ **双源收口（有意偏离，与 `accountPick.ts` 同一决策）**：
 *    原版「忙」有**两个来源** —— store 的 `accountBusy`（**带 1h TTL**）与模块级
 *    `Set Er`（**不带 TTL**，只存 `{itemId,nodeId,since}`）。
 *    `Ei`/`Hk` 都 `||` 了它们 ⇒ 必然出现"store 说闲、Set 说忙"的不一致。
 *    本实现**合成一个** `BusyMap`：既保留 `Er` 的占用者元数据（`tn` 的 `itemId` 校验要用），
 *    又保留 store 的 TTL。⇒ 带来的**唯一行为差异**：原版 `Er` 里的条目**永不自动过期**
 *    （即使 store 那边 TTL 到了，`Hk` 仍说忙）；本实现**过期即可再占用**。
 *    这一差异是**收口的目的**（TTL 1h 自动释放 = G1 要求），已留痕。
 *
 * ⚠️ 原则 4：`now` / `ttlMs` 一律由调用方注入，本模块不碰 `Date.now`。
 */

import { ACCOUNT_BUSY_TIMEOUT_MS } from '@/constants';

/** 一条占用记录（= 原 `Er` 的值 + store `accountBusy` 的到期时刻） */
export interface BusyEntry {
  /** 占用者标识（原 `Fi` 的 `t.itemId`；`tn` 靠它校验「是不是我占的」） */
  itemId: string | null;
  /** 关联节点（原 `Fi` 的 `t.nodeId`） */
  nodeId: string | null;
  /** 占用开始时间（ms，原 `since: Date.now()`） */
  since: number;
  /** 到期时刻（ms，原 `markAccountBusy(id, HP)` 的 TTL 落点） */
  expiresAt: number;
}

/** 账号 id → 占用记录 */
export type BusyMap = Record<string, BusyEntry>;

/** 丢掉已过期的条目（不改原对象；无变化时**返回同一引用**） */
export function pruneBusy(map: BusyMap, now: number): BusyMap {
  const keep: BusyMap = {};
  let changed = false;
  for (const [id, entry] of Object.entries(map)) {
    if (now < entry.expiresAt) keep[id] = entry;
    else changed = true;
  }
  return changed ? keep : map;
}

/** 是否忙（原 `Hk` + store `accountBusy` 的合并判定）—— **按 TTL 判** */
export function isAccountBusy(map: BusyMap, accountId: string, now: number): boolean {
  const entry = map[accountId];
  return !!entry && now < entry.expiresAt;
}

/** 当前忙账号 id 列表（喂 `pickAccount({ busy })` / `resolveSendAccount({ busy })`） */
export function busyIdsOf(map: BusyMap, now: number): string[] {
  const out: string[] = [];
  for (const [id, entry] of Object.entries(map)) {
    if (now < entry.expiresAt) out.push(id);
  }
  return out;
}

export interface HoldOptions {
  /** 占用者标识（用于 `releaseAccount` 的所有权校验） */
  itemId?: string | null;
  /** 关联节点 */
  nodeId?: string | null;
  now: number;
  /** 占用时长（默认 SSOT 的 `ACCOUNT_BUSY_TIMEOUT_MS` = 1h） */
  ttlMs?: number;
}

/**
 * 占用账号（原 `Fi` 34596）
 *
 * @returns 新 `BusyMap`；**已被占用（未过期）⇒ `null`** ——
 *          调用方据此报 `该账号刚被占用，请重试`（原 `gS` 39109 / `tO` 的 `hold-failed`）
 */
export function holdAccount(map: BusyMap, accountId: string, opts: HoldOptions): BusyMap | null {
  // 原：`if (!e || Er.has(e)) return false;`（空 id 也拒）
  if (!accountId) return null;

  const pruned = pruneBusy(map, opts.now);
  // ⚠️ 原版不看过期（`Er` 无比对 TTL）；本实现按 TTL 判 —— 见文件头「双源收口」
  if (isAccountBusy(pruned, accountId, opts.now)) return null;

  const ttlMs = opts.ttlMs ?? ACCOUNT_BUSY_TIMEOUT_MS;
  return {
    ...pruned,
    [accountId]: {
      itemId: opts.itemId ?? null,
      nodeId: opts.nodeId ?? null,
      since: opts.now,
      expiresAt: opts.now + ttlMs,
    },
  };
}

export interface ReleaseOptions {
  /**
   * 只释放「属于我的」那条（原 `tn` 的 `t.itemId && (!n || n.itemId !== t.itemId)` ⇒ 不动）
   *
   * ⚠️ 这正是原版**同时维护 `Er` 与 store 两处**的原因：没有 `itemId` 就分不清
   *    "释放自己占的" 与 "把别人占的也放了"。
   */
  itemId?: string | null;
}

/**
 * 释放账号（原 `tn` 34614）
 *
 * @returns `released` = 原来**确实有**这条记录（原 `Er.delete(e)` 的返回值）
 */
export function releaseAccount(
  map: BusyMap,
  accountId: string,
  opts: ReleaseOptions = {},
): { map: BusyMap; released: boolean } {
  if (!accountId) return { map, released: false };

  const cur = map[accountId];
  // 原：`if (t && t.itemId && (!n || n.itemId !== t.itemId)) return false;`
  if (opts.itemId && (!cur || cur.itemId !== opts.itemId)) return { map, released: false };

  if (!cur) return { map, released: false };
  const rest: BusyMap = { ...map };
  delete rest[accountId];
  return { map: rest, released: true };
}


