/**
 * Lovart 出口代理池分配（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：`reassignLovartProxies` shared.js:30331-30362（store action 的**纯逻辑半**）
 *
 * 源码逻辑：
 *   1. `pool = proxyPool || []`
 *   2. `lovart = accounts.filter(a => Ps(a.type) === 'lovart')` —— **只数 lovart 账号**（顺序即入池顺序）
 *   3. 逐个账号：非 lovart → 原样；lovart → `idx = lovart.findIndex(id)`，`proxy = pool.length ? pool[idx % pool.length] : ''`
 *      ⇒ **轮询分配**（第 i 个 lovart 账号拿 `pool[i % n]`）
 *   4. 给账号写上 `proxy`，并对**有 partition** 的账号调 `setAccountProxy(partition, proxy)`
 *
 * ⚠️ 本模块只做**分配**（纯）；`setAccountProxy` 的**调用**归 `core/usecases`（原则 1：规则不碰宿主）。
 * ⚠️ **与原版的一处有意偏离**：原版对 `setAccountProxy` 的失败是 `.catch(() => {})`（**吞错**），
 *    违反原则 6（错误不可被掩盖）⇒ 重写时**必须上报**。故本模块把「需要设置代理的清单」
 *    显式返回（`assignments`），由用例逐个调用并**如实上报失败**。
 * ⚠️ 本模块**不接触** `window`/`Date`/随机（原则 4）。
 */

import type { Account } from '@/stable/model/account';
import { normalizeAccountType } from '@/stable/model/account';

/** 需要落到宿主的一条代理设置（原版 `window.api.setAccountProxy(partition, proxy)`） */
export interface ProxyAssignment {
  accountId: string;
  partition: string;
  proxy: string;
}

/** 分配结果 */
export interface ProxyAssignResult {
  /** 写入 `proxy` 之后的账号列表（**新数组**，不改入参） */
  accounts: Account[];
  /**
   * 需要调宿主设置的清单
   * ⚠️ 只含**有 `partition`** 的 lovart 账号（与源码 `if (o.partition)` 一致）
   */
  assignments: ProxyAssignment[];
}

/**
 * 轮询分配 Lovart 出口代理（原 `reassignLovartProxies` 的纯逻辑半）
 *
 * @param accounts 全量账号（非 lovart 的原样保留）
 * @param proxyPool 代理池（空 / null ⇒ 分配空串 = **直连**）
 */
export function assignProxyPool(
  accounts: readonly Account[],
  proxyPool: readonly string[] | null | undefined,
): ProxyAssignResult {
  const pool = proxyPool || [];
  const lovart = accounts.filter((a) => normalizeAccountType(a.type) === 'lovart');

  const assignments: ProxyAssignment[] = [];
  const next = accounts.map((a) => {
    if (normalizeAccountType(a.type) !== 'lovart') return a;

    const idx = lovart.findIndex((f) => f.id === a.id);
    const proxy = pool.length ? String(pool[idx % pool.length]) : '';

    if (a.partition) assignments.push({ accountId: a.id, partition: a.partition, proxy });

    return { ...a, proxy };
  });

  return { accounts: next, assignments };
}
