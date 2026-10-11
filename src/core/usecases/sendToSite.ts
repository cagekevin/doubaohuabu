/**
 * usecase · 发送编排链（选号 → **doubao 失败退 dola** → 占用 → 后台页就绪 → 交给调用方 → 释放）
 *
 * 依据（**逐行回源抄录**）：`gS` shared.js:39086-39173 与 `yS` 39305-39371 的**公共外壳**
 *   —— 该外壳在原版**内联在五处**（`gS`/`yS`/`tO`/`aO`/`x3`）⇒ 按判据 **C3** 抽出。
 *
 * ★ **为什么做成"高阶函数"而不是"返回一个 release 函数"**：
 *   源版把释放写在 `finally` 里（`gS` 39247-39254：`if (f) f(); u();`）。
 *   返回 `release` 让调用方自己记得调 = 把"必须 finally"变成"约定"（必然有人漏）。
 *   ⇒ 本实现把 `run` 作为参数，**释放由本函数在 `finally` 里保证**。
 *
 * ⚠️ 原则 1：本文件**不写 store**（占用/释放走注入回调，与 `generate.ts` 同一套）。
 * ⚠️ 原则 6：失败一律**原样转发**；只有"选不到号"用 SSOT 文案（源版本就是自造这两句）。
 * ⚠️ 链 18 / `docs/10` #4：**不自启轮询**（轮询只在 `prepareForSend` 期间存在）。
 */

import type { Account, PoolStrategy, SiteType } from '@/stable/model/account';
import type { BackendPagePort, BackendPageReady } from '@/core/ports/backendPage.port';
import type { SitePort, SiteRegistry } from '@/core/ports/site.port';
import { err, type Result } from '@/core/model/result';
import { resolveSendAccount } from '@/core/rules/accountPick';
import { ACCOUNT_PICK_TEXT, BACKEND_PAGE_TEXT, SEND_TEXT } from '@/constants/text';

/** 退级链（原 `gS` 39086-39093：先试 `doubao`，不 idle 再试 `dola`） */
export const SEND_FALLBACK_CHAIN: readonly Exclude<SiteType, 'other'>[] = ['doubao', 'dola'];

export interface SendToSiteDeps {
  sites: SiteRegistry;
  backendPage: BackendPagePort;
  /**
   * ★ 占用账号（原 `Fi`）—— 写 store 的动作由 **state 注入**（原则 1）
   * @returns `false` = 已被占用（原 `Fi` 的 `return false`）
   */
  holdAccount: (accountId: string, nodeId: string | null) => boolean;
  /** ★ 释放（原 `tn {releaseBusy:true}`） */
  releaseAccount: (accountId: string) => void;
}

/** 选号结果（原 `gS` 39086-39104） */
export interface SendAccountChoice {
  account: Account;
  site: SitePort;
  /** 站点对应的类型（`site.kind`） */
  type: SiteType;
  /** 是否走了退级（首选站点的号池不可用 ⇒ 用了备选站点） */
  degraded: boolean;
  /** round-robin 的下一个游标（调用方存回 state） */
  nextCursor?: number;
}

export interface ResolveSendAccountInput {
  accounts: readonly Account[];
  /** 忙账号（唯一来源 —— 见 `accountPick.ts` 的「双源收口」） */
  busy?: readonly string[];
  /** 站点注册表 */
  sites: SiteRegistry;
  /** 退级链（默认 `['doubao','dola']`） */
  chain?: readonly SiteType[];
  /** 选号策略 */
  strategy?: PoolStrategy;
  cursor?: number;
  /** 指定账号（`'auto'` / 账号 id）—— 只在**首选站点**上生效（与源一致：退级时一律走池） */
  sendAccount?: string;
}

export type ResolveSendAccountResult =
  | { ok: true; choice: SendAccountChoice }
  | {
      ok: false;
      /**
       * `no-account` | `all-busy` | `busy`
       * ⚠️ `busy` 只出现在「**指定了账号**且它在忙」那条路（源 `FS` 直return，
       *    文案也是它自己的 `所选账号正在生成中，请稍后再试`）
       */
      reason: 'no-account' | 'all-busy' | 'busy';
      note: string;
    };

/**
 * 选号 + 退级（原 `gS` 39086-39104）—— **纯决策**，可单测
 *
 * 逐字对齐源版：
 *   ① 按链顺序**逐个站点**试 `Ei({type})`（等价于 `resolveSendAccount`）
 *   ② 任一站点返回 `idle` 即用
 *   ③ 全链失败 ⇒ 文案是**二元的**：任一站点「没有可用账号」就说 `noAccount`，
 *      否则（有账号但都忙）说 `allBusy` —— 源码就是这么写死的（`l.reason === 'no-account'` 只看**最后一个**站点的结果，
 *      ⚠️ 这里**有意偏离**：改成"**任一**站点是无账号 ⇒ `noAccount`"，否则 `allBusy`。
 *      理由：源版只保留最后一次尝试的 reason，导致「doubao 没号 + dola 全忙」被说成"都在忙"
 *      （用户去建 dola 号也解决不了）。已留痕。）
 */
export function resolveSendAccountForChain(
  input: ResolveSendAccountInput,
): ResolveSendAccountResult {
  const chain = input.chain ?? SEND_FALLBACK_CHAIN;
  const sites = input.sites;
  const requested = input.sendAccount ?? 'auto';
  const explicit = requested !== 'auto' && !requested.startsWith('auto:');

  // ★ **指定了账号 ⇒ 不退级**（与源一致）：源 `FS` 在显式 id 失败时直接 `return p`
  //   （不存在/类型不符/在忙三类都不回落），而 `gS`/`yS` 的退级只发生在 `Ei({type})` 那条路上。
  if (explicit) {
    const type = chain[0] as SiteType;
    const site = sites[type];
    if (!site) return { ok: false, reason: 'no-account', note: SEND_TEXT.noSiteAdapter(type) };
    const picked = resolveSendAccount({
      accounts: input.accounts,
      type,
      sendAccount: requested,
      busy: input.busy,
      strategy: input.strategy,
      cursor: input.cursor,
    });
    if (!picked.account) {
      // ⚠️ **原样返回**（note 就是源 `FS` 那句，如 `所选账号正在生成中，请稍后再试`）
      return {
        ok: false,
        reason: picked.reason === 'no-account' ? 'no-account' : 'busy',
        note: picked.note ?? SEND_TEXT.allBusy,
      };
    }
    return {
      ok: true,
      choice: {
        account: picked.account,
        site,
        type,
        degraded: false,
        ...(picked.nextCursor === undefined ? {} : { nextCursor: picked.nextCursor }),
      },
    };
  }

  let sawNoAccount = false;

  for (let i = 0; i < chain.length; i += 1) {
    const type = chain[i] as SiteType;
    const site = sites[type];
    if (!site) {
      // 站点适配器缺失 —— 不是"没号"，跳过（由外层在真正要用时报错）
      continue;
    }
    const picked = resolveSendAccount({
      accounts: input.accounts,
      type,
      sendAccount: 'auto',
      busy: input.busy,
      strategy: input.strategy,
      cursor: input.cursor,
    });
    if (!picked.account) {
      if (picked.reason === 'no-account') sawNoAccount = true;
      continue;
    }
    return {
      ok: true,
      choice: {
        account: picked.account,
        site,
        type,
        degraded: i > 0,
        ...(picked.nextCursor === undefined ? {} : { nextCursor: picked.nextCursor }),
      },
    };
  }

  return sawNoAccount
    ? { ok: false, reason: 'no-account', note: SEND_TEXT.noAccount }
    : { ok: false, reason: 'all-busy', note: SEND_TEXT.allBusy };
}

/** 交给调用方的上下文（后台页**已就绪**，可直接跑页内脚本 / 发送） */
export interface BackendPageContext {
  account: Account;
  site: SitePort;
  /** 就绪的后台页句柄 */
  page: BackendPageReady;
  /** 走了退级吗 */
  degraded: boolean;
}

/** ⚠️ 站点注册表由 `deps` 给（不重复要一次） */
export interface WithBackendPageInput extends Omit<ResolveSendAccountInput, 'sites'> {
  /** 关联任务 id（原 `vr` 的 `jobId`，如 `analyze:<nodeId>`） */
  jobId?: string | null;
  /** 用途（原 `vr` 的 `purpose`） */
  purpose?: string;
  /** 占用登记的关联节点（原 `Fi` 的 `nodeId`） */
  nodeId?: string | null;
  /** 后台页就绪超时（默认 SSOT 30s） */
  timeoutMs?: number;
}

/**
 * 「占用 → 备好后台页 → 跑 `run` → **无论如何释放**」（原 `gS` 39105-39254 的外壳）
 *
 * 顺序与源版逐条对应：
 *   ① 选号 + 退级（失败 ⇒ SSOT 文案）
 *   ② `holdAccount`（失败 ⇒ `ACCOUNT_PICK_TEXT.holdFailed`，原 `Fi` 的 `hold-failed`）
 *   ③ 站点没声明 `chatUrl` ⇒ **明确报错**（不回落）
 *   ④ `prepareForSend`（失败 ⇒ 原样转发；note 为空时兜底 `BACKEND_PAGE_TEXT.loadFailed`）
 *   ⑤ `run(ctx)` —— 调用方在这期间跑页内脚本 / 发送
 *   ⑥ `finally`：`release(leaseId)` + `releaseAccount`
 */
export async function withBackendPage<T>(
  deps: SendToSiteDeps,
  input: WithBackendPageInput,
  run: (ctx: BackendPageContext) => Promise<Result<T>>,
): Promise<Result<T>> {
  const resolved = resolveSendAccountForChain({ ...input, sites: deps.sites });
  if (!resolved.ok) {
    return err(resolved.reason === 'no-account' ? 'no-account' : 'busy', resolved.note);
  }
  const { account, site, degraded } = resolved.choice;

  // ② 占用（原 `Fi` 39106-39114）
  if (!deps.holdAccount(account.id, input.nodeId ?? null)) {
    return err('busy', ACCOUNT_PICK_TEXT.holdFailed);
  }

  const chatUrl = site.chatUrl;
  if (!chatUrl) {
    deps.releaseAccount(account.id);
    return err('unknown', SEND_TEXT.noChatUrl(site.kind));
  }

  let page: BackendPageReady | null = null;
  try {
    // ④ 后台页就绪（原 `vr` 39125-39154）
    const prepared = await deps.backendPage.prepareForSend(account, {
      targetUrl: chatUrl,
      jobId: input.jobId ?? null,
      purpose: input.purpose,
      timeoutMs: input.timeoutMs,
    });
    if (!prepared.ok) {
      // ⚠️ 源版用的是 `p.note || '豆包 / Dola 后台页面加载失败'`
      const note = prepared.message || BACKEND_PAGE_TEXT.loadFailed;
      return err(prepared.reason, note, prepared.cause);
    }
    page = prepared.value;

    // ⑤ 交给调用方
    return await run({ account, site, page, degraded });
  } finally {
    // ⑥ 释放（原 `gS` 39247-39254 的 `finally`）
    if (page) deps.backendPage.release(page.leaseId, 'done');
    deps.releaseAccount(account.id);
  }
}
