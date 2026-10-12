/**
 * usecase · 账号会话准备（指纹 / 普通 / Lovart 容器 / 代理 / 体检）
 *
 * 依据（**逐行回源抄录**）：
 *   - 登录弹窗的会话准备：`$P.jsx:49-90`（lovart ⇒ `ensureLovartContainer`；否则 `ensureFingerprint`）
 *   - Lovart 会话面板：`_Component25.jsx:56-76`（同款）
 *   - 移除账号清会话：`shared.js:30218-30247`（`removeAccount`）
 *     · `clearLovartAccountCache` `30248-30285`（同款 + 清 `lovartGalleries`）
 *   - 代理落地：`shared.js:30331-30361`（`reassignLovartProxies` 的**宿主半**）
 *   - 指纹体检：`OP.jsx:100-101`（`fpNetDiag(partition)`）
 *
 * ⚠️ 纯分配半已在 `core/rules/proxy.ts`（`assignProxyPool`）—— 本文件只做**调用与上报**。
 * ⚠️ 约束 #5（`docs/过程.md`）：**cookie 由后端管理，前端不碰** —— 这里只调「准备会话」，
 *    不读不写任何 cookie。
 * ⚠️ 原则 1：本文件**不写 store**（返回结果由 state 落）。
 */

import type {
  AccountPort,
  FingerprintSessionPayload,
  LovartContainerPayload,
  PlainSessionPayload,
} from '@/core/ports/host.port';
import type { ProxyAssignment } from '@/core/rules/proxy';
import { ok, type Result } from '@/core/model/result';
import { SESSION_TEXT } from '@/constants/text';

export interface PrepareSessionDeps {
  account: Pick<
    AccountPort,
    'ensureFingerprint' | 'ensurePlainSession' | 'ensureLovartContainer' | 'clearSession' | 'setProxy' | 'fpNetDiag'
  >;
}

/**
 * 会话准备的三种模式（原 `$P.jsx` 用 `o`（是否 Lovart 自定义登录）分支 —— 这里做成显式判别）
 *
 * ⚠️ **不按 `account.type` 自动推导**：源版的分支依据是**场景**（登录哪种容器），
 *    不是账号类型本身 ⇒ 保持调用方显式声明（同一 lovart 账号也可能走普通会话）。
 */
export type SessionMode = 'fingerprint' | 'plain' | 'lovart';

export interface PrepareSessionInput {
  mode: SessionMode;
  accountId: string;
  /** 允许 `null`（真实样本里就有未设分区的账号）—— **如实传**，后端自己回落 */
  partition: string | null;
  /** `mode='fingerprint'` 用：要注入的环境指纹 */
  fingerprint?: unknown;
  /** `mode='lovart'` 用：容器 id 与出口代理 */
  containerId?: string;
  proxy?: string;
}

/** 会话就绪后的归一结果（三种后端返回形状 → 一个） */
export interface SessionReady {
  mode: SessionMode;
  /** 注入脚本（指纹 / Lovart 容器）的 preload URL；普通会话没有 */
  preloadUrl: string | null;
  /** 会话 UA（后端可能给；不给则 `null`） */
  userAgent: string | null;
}

/**
 * 准备账号会话（原 `$P.jsx:56-86`）
 *
 * ⚠️ 源版**两处 `catch` 都吞错**（`.catch(() => {})` / `console.error`）⇒
 *    重写**如实转发**（原则 6），由 state/UI 决定提示。
 */
export async function prepareSession(
  deps: PrepareSessionDeps,
  input: PrepareSessionInput,
): Promise<Result<SessionReady>> {
  if (input.mode === 'lovart') {
    const payload: LovartContainerPayload = {
      id: input.accountId,
      partition: input.partition,
      ...(input.containerId === undefined ? {} : { containerId: input.containerId }),
      ...(input.proxy === undefined ? {} : { proxy: input.proxy }),
    };
    const res = await deps.account.ensureLovartContainer(payload);
    if (!res.ok) return res;
    return ok({
      mode: 'lovart',
      preloadUrl: res.value.preloadUrl,
      userAgent: res.value.userAgent ?? null,
    });
  }

  if (input.mode === 'plain') {
    const payload: PlainSessionPayload = { id: input.accountId, partition: input.partition };
    const res = await deps.account.ensurePlainSession(payload);
    if (!res.ok) return res;
    return ok({
      mode: 'plain',
      preloadUrl: res.value.preloadUrl ?? null,
      userAgent: res.value.userAgent ?? null,
    });
  }

  const payload: FingerprintSessionPayload = {
    id: input.accountId,
    partition: input.partition,
    ...(input.fingerprint === undefined ? {} : { fingerprint: input.fingerprint }),
  };
  const res = await deps.account.ensureFingerprint(payload);
  if (!res.ok) return res;
  return ok({ mode: 'fingerprint', preloadUrl: res.value.preloadUrl ?? null, userAgent: null });
}

/**
 * 清掉某分区的会话数据（原 `removeAccount` 30224-30228 / `clearLovartAccountCache` 30260-30264）
 *
 * ⚠️ 源版两处都是 `try{}catch{}` **静默吞掉** ⇒ 重写如实转发。
 * ⚠️ **调用时机由 state 决定**（源版是"移除账号前"顺带清）；本用例只管清，不管账号列表。
 * ⚠️ 空分区**直接返回 `ok`**（源版 `if (s.partition)` 守卫）—— 不去清一个不存在的分区。
 */
export async function releaseSession(
  deps: PrepareSessionDeps,
  partition: string | null,
): Promise<Result<void>> {
  if (!partition) return ok(undefined);
  return deps.account.clearSession(partition);
}

/** 代理落地的结果（原 `reassignLovartProxies` 30347-30351） */
export interface ApplyProxiesOutcome {
  applied: number;
  /**
   * 失败清单（**后端原文**，已加前缀）
   * ⚠️ 源版是 `.catch(() => {})` **完全吞掉** ⇒ 重写如实上报（原则 6），但**不中断**其余账号
   */
  failures: string[];
}

/**
 * 把 `assignProxyPool` 算出来的清单**逐条落到宿主**（原 30347-30351 的宿主半）
 *
 * ⚠️ 与源版一致：**逐条 set**，一条失败不影响其余。
 */
export async function applyProxyAssignments(
  deps: PrepareSessionDeps,
  assignments: readonly ProxyAssignment[],
): Promise<ApplyProxiesOutcome> {
  let applied = 0;
  const failures: string[] = [];

  for (const a of assignments) {
    const res = await deps.account.setProxy(a.partition, a.proxy);
    if (!res.ok) {
      failures.push(SESSION_TEXT.proxyApplyFailed(a.accountId, res.message));
      continue;
    }
    applied += 1;
  }

  return { applied, failures };
}

/**
 * 指纹网络体检（原 `OP.jsx:100-101` 的 `fpNetDiag(partition)`）
 *
 * ⚠️ 返回 `unknown` —— 后端返回什么就是什么（判据 D1：适配器不解释，用例也不解释）。
 */
export async function diagnoseSession(
  deps: PrepareSessionDeps,
  partition: string,
): Promise<Result<unknown>> {
  return deps.account.fpNetDiag(partition);
}
