/**
 * 后台页（豆包 / Dola / Lovart 的后台 `<webview>`）—— **纯决策半**（★ 必测）
 *
 * 依据（**逐行回源抄录**）：`vr` shared.js:26024-26108（后台页租约 + 就绪等待）+ `rn` 26109-26126（释放）
 *
 * ★ **为什么要有这一层**（这条链在原版没有名字，容易被漏）：
 *   `gS`/`yS`/`tO`/`aO`/`x3` 五处都要「先把某账号的后台页弄就绪，再跑页内脚本」。
 *   原版把它写成一个**渲染层无障碍模块**：`tT`/`nT` 去问 **`an.getWebview` / `an.isReady`**，
 *   而 `an` 由 `rT(e)` 注册 —— 注册者就是 **`_Component43`（BackendView）**（`_Component43.jsx:428` 的 `reloadAccount`）。
 *   ⇒ 它是**组件间注册表**，不是 `window.api` 能力（`electron/preload.js` 里没有 `reloadAccount`，已核实）。
 *
 * ⇒ 本工程把它拆成三块：
 *   · **纯决策（本文件）**：轮询节奏 / 重载判定 / 失败归因 / 租约状态机 —— 可单测
 *   · **端口**（`core/ports/backendPage.port.ts`）：把「找 webview / 跑脚本 / 刷新 / 静默」抽象掉
 *   · **实现**（`adapters/`）：DOM 查 `<webview>`（复用既有 `findWebview`）+ 驱动本文件的计划
 *
 * ⚠️ 原则 4：`now` / `timeoutMs` 一律注入，本模块不碰 `Date.now`。
 * ⚠️ 本文件**不含**任何 DOM / 宿主调用。
 */

import {
  BACKEND_LEASE_TTL_MS,
  BACKEND_LOAD_TIMEOUT_MS,
  BACKEND_RELOAD_AFTER_MS,
} from '@/constants';

/** 租约 id 前缀（原 `vr` 26034：`` `rt_${Date.now().toString(36)}_${++seq}` ``） */
export const LEASE_ID_PREFIX = 'rt_';

/**
 * 轮询步长（原 `vr` 26061：`Math.min(250, Math.max(10, Math.floor(a / 20)))`）
 *
 * ⚠️ 与源逐字一致：**随超时自适应** —— 30s 超时 ⇒ 250ms；200ms 超时 ⇒ 10ms（下限）。
 */
export function backendPollDelayMs(timeoutMs: number = BACKEND_LOAD_TIMEOUT_MS): number {
  const t = Number.isFinite(timeoutMs) ? timeoutMs : BACKEND_LOAD_TIMEOUT_MS;
  return Math.min(250, Math.max(10, Math.floor(t / 20)));
}

/** 超时文案（原 `vr` 26101：`` `后台页面加载超过 ${Math.ceil(a / 1000)} 秒` ``） */
export function backendTimeoutNote(timeoutMs: number = BACKEND_LOAD_TIMEOUT_MS): string {
  const t = Number.isFinite(timeoutMs) ? timeoutMs : BACKEND_LOAD_TIMEOUT_MS;
  return `后台页面加载超过 ${Math.ceil(t / 1000)} 秒`;
}

export interface ShouldReloadInput {
  /** 本轮是否**已经**重载过（原 `vr` 的哨兵 `c`）—— 只重载**一次** */
  alreadyReloaded: boolean;
  /** 当前是否找得到 webview（原 `w`）—— 找不到就无从 reload */
  hasWebview: boolean;
  /** 是否已有后端报错（原 `m.error` 非空） */
  hasError: boolean;
  /** 本租约等待了多久 */
  elapsedMs: number;
}

/**
 * 现在该不该**自动重载一次**（原 `vr` 26085：`if (!c && w && (m.error || Date.now() - l >= 7000))`）
 *
 * ⚠️ 与源逐字一致：**最多一次**（`alreadyReloaded` 后永不再重载）。
 */
export function shouldReloadBackendPage(input: ShouldReloadInput): boolean {
  if (input.alreadyReloaded || !input.hasWebview) return false;
  return input.hasError || input.elapsedMs >= BACKEND_RELOAD_AFTER_MS;
}

/**
 * 等待结束时的失败归因（原 `vr` 26100-26106）
 *
 * 源版：`const f = d.error || d.lastError`；`reason = f ? 'load-failed' : 'load-timeout'`。
 * 本工程直接映射到 **SSOT 的失败分类**（`constants/failure.ts`）：
 *   `load-failed` → `page-error`；`load-timeout` → `page-timeout`（**不新增 kind**）。
 */
export function backendFailure(
  backendError: string | null | undefined,
  timeoutMs: number = BACKEND_LOAD_TIMEOUT_MS,
): { reason: 'page-error' | 'page-timeout'; note: string } {
  const err = typeof backendError === 'string' && backendError ? backendError : '';
  return {
    reason: err ? 'page-error' : 'page-timeout',
    // 有后端错误 ⇒ note 用**它原文**；否则用超时文案（原 26101）
    note: err || backendTimeoutNote(timeoutMs),
  };
}

// ─────────────────────────── 租约（原 `vr` 26034-26056 + `rn`）───────────────────────────

/** 一条后台页租约 */
export interface BackendPageLease {
  leaseId: string;
  accountId: string;
  /** 业务用途（原 `purpose`，默认 `'task'`） */
  purpose: string;
  /** 关联任务 id（原 `jobId`） */
  jobId: string | null;
  acquiredAt: number;
  /** 到期时刻（原 `ttlTimer` 的软等价物 —— 用时刻而非定时器，便于纯测） */
  expiresAt: number;
}

/** 租约 id（原 26034：`rt_<base36(now)>_<seq>`） */
export function makeLeaseId(now: number, seq: number): string {
  return `${LEASE_ID_PREFIX}${now.toString(36)}_${seq.toString(36)}`;
}

/** 建租约（原 `vr` 26035-26056 的构造段） */
export function createLease(input: {
  leaseId: string;
  accountId: string;
  jobId?: string | null;
  purpose?: string;
  now: number;
  leaseTtlMs?: number;
}): BackendPageLease {
  const ttl = input.leaseTtlMs ?? BACKEND_LEASE_TTL_MS;
  return {
    leaseId: input.leaseId,
    accountId: input.accountId,
    purpose: input.purpose || 'task',
    jobId: input.jobId ?? null,
    acquiredAt: input.now,
    expiresAt: input.now + ttl,
  };
}

/** 租约是否仍有效（原 `rn` 前的那句 `if (!m || !m.leases.has(r))` ⇒ 已取消） */
export function isLeaseAlive(lease: BackendPageLease | undefined, now: number): boolean {
  return !!lease && now < lease.expiresAt;
}
