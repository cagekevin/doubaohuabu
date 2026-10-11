/**
 * BackendPagePort 的实现 —— 后台页（账号 `<webview>`）的租约 / 就绪 / 命令
 *
 * 依据（**逐行回源抄录**）：`vr` shared.js:26024-26108（租约 + 就绪等待）
 *   + `rn` 26109-26126（释放）+ `gS` 39125-39154（「准备到可发送」那一段）
 *
 * ⚠️ **为什么落在 `adapters/site/shared/` 而不是 `adapters/host/electron/`**：
 *    本模块操作的是**渲染层自己的 `<webview>` DOM 元素**（不是 `window.api` IPC）
 *    —— 与 `webview.ts` / `waits.ts` / `inputLock.ts` 同一族。放 `host/electron` 会把
 *    「桥」与「DOM」两件事混在一层。
 *
 * ⚠️ 铁律：
 *   · **不自启轮询**（`docs/10` #4）—— `prepareForSend` 的轮询只在被调用期间存在
 *   · **零注入**（#2）—— 唯一例外是 `input-lock`（既有例外，见 `docs/16` 链 17）
 *   · 失败一律返 `Result`，**不抛**
 *
 * ⚠️ 纯决策（轮询节奏 / 重载判定 / 失败归因 / 租约状态）全在 `core/rules/backendPage.ts`，
 *    本文件只**驱动**它（判据 A1：纯的归 core，脏的归 adapters）。
 */

import type { Account } from '@/stable/model/account';
import type {
  BackendPagePort,
  BackendPagePrepareOptions,
  BackendPageReady,
  FingerprintPageProbe,
} from '@/core/ports/backendPage.port';
import { err, ok, type Result } from '@/core/model/result';
import { sleep } from '@/lib/async';
import { FILE_INPUT_TIMEOUT_MS } from './waits';
import { FP_DIAG_PROBE } from './fpProbe';
import { BACKEND_PAGE_TEXT } from '@/constants/text';
import { BACKEND_LOAD_TIMEOUT_MS, FP_DIAG_TIMEOUT_MS } from '@/constants';
import {
  backendFailure,
  backendPollDelayMs,
  createLease,
  isLeaseAlive,
  makeLeaseId,
  shouldReloadBackendPage,
  type BackendPageLease,
} from '@/core/rules/backendPage';
import { inputLockScript, inputLockSetupScript } from './inputLock';
import { findWebview, type WebviewElement } from './webview';
import { PAGE_READY_PROBE, navigateAndWait, runProbe, waitForFileInput, waitForPageReady } from './waits';



/** 租约 → 记录（原 `Jn` + `Du` 两张表合成一张；值里带 `accountId` 就够） */
const leases = new Map<string, BackendPageLease>();
/** 账号 → 已被标记为「曾经就绪」（原 `m.ready`，省掉重复探测） */
const readyAccounts = new Set<string>();
/** 账号 → 最近一次后端报错（原 `m.error`，驱动「自动重载一次」） */
const accountErrors = new Map<string, string>();

let leaseSeq = 0;

const viewOf = (account: Account): WebviewElement | null => findWebview(account);

/** 释放（原 `rn` 26109）—— **幂等** */
function releaseLease(leaseId: string): void {
  leases.delete(leaseId);
}

export function createBackendPage(): BackendPagePort {
  return {
    // ⚠️ **不实现 `isMounted`**：本仓 `BackendView` 常驻渲染 ⇒ 它对本仓存在的账号恒 `true` = 假判据

    release(leaseId: string): void {
      releaseLease(leaseId);
    },

    async runScript<T = unknown>(account: Account, script: string): Promise<Result<T>> {
      const view = viewOf(account);
      if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
      const r = await runProbe<T>(view, script);
      // ⚠️ 探针失败返 `page-error`（原文保留）—— 不静默
      return r.ok ? ok(r.value) : err('page-error', r.error);
    },

    async probeFingerprint(
      account: Account,
      timeoutMs: number = FP_DIAG_TIMEOUT_MS,
    ): Promise<Result<FingerprintPageProbe>> {
      const view = viewOf(account);
      // ⚠️ 找不到 webview 也是"探不到"（best-effort）—— 但**不静默**，用 Result 失败表达
      if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
      const r = await runProbe<FingerprintPageProbe>(view, FP_DIAG_PROBE, timeoutMs);
      return r.ok ? ok(r.value) : err('page-error', r.error);
    },

    reload(account: Account): Result<void> {
      const view = viewOf(account);
      if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
      const cmd = view as WebviewElement & { reload?: () => void };
      if (typeof cmd.reload !== 'function') {
        return err('page-error', BACKEND_PAGE_TEXT.webviewNoCommands);
      }
      try {
        cmd.reload();
        return ok(undefined);
      } catch (e: unknown) {
        return err('page-error', e instanceof Error ? e.message : String(e), e);
      }
    },

    // ⚠️ **不实现 `setMuted`**：**源里没有 webview 静音能力**（本仓曾造的 `setAudioMuted` 是凭空造物）；
    //    源的「静默/恢复」是账号级 `autoStart` 开关 ⇒ 落点在既有字段，不在端口

    async prepareForSend(
      account: Account,
      opts: BackendPagePrepareOptions,
    ): Promise<Result<BackendPageReady>> {
      const timeoutMs = opts.timeoutMs ?? BACKEND_LOAD_TIMEOUT_MS;
      const leaseId = makeLeaseId(Date.now(), (leaseSeq += 1));
      leases.set(
        leaseId,
        createLease({
          leaseId,
          accountId: account.id,
          jobId: opts.jobId ?? null,
          purpose: opts.purpose,
          now: Date.now(),
          leaseTtlMs: opts.leaseTtlMs,
        }),
      );

      // ── ① ② 等就绪（轮询 + 失败时自动重载一次）──
      const started = Date.now();
      const delay = backendPollDelayMs(timeoutMs);
      let reloadedOnce = false;
      let view: WebviewElement | null = null;

      while (Date.now() - started < timeoutMs) {
        // 租约被 TTL / 显式释放 ⇒ 立刻收工（原 26064-26070）
        if (!isLeaseAlive(leases.get(leaseId), Date.now())) {
          return err('page-error', BACKEND_PAGE_TEXT.leaseCanceled);
        }

        view = viewOf(account);
        const alreadyReady = readyAccounts.has(account.id);
        if (view && (alreadyReady || (await isPageReady(view)))) break;

        if (
          shouldReloadBackendPage({
            alreadyReloaded: reloadedOnce,
            hasWebview: view !== null,
            hasError: accountErrors.has(account.id),
            elapsedMs: Date.now() - started,
          })
        ) {
          // ★ **只重载一次**（原 `vr` 26085-26094 的哨兵 `c`）
          reloadedOnce = true;
          accountErrors.delete(account.id);
          // 原版走 `an.reloadAccount(e)`（组件注册的命令）；我们的等价物是元素自身的 `reload()`
          if (view) {
            const cmd = view as WebviewElement & { reload?: () => void };
            try {
              cmd.reload?.();
            } catch (e: unknown) {
              // ⚠️ 重载失败**不致命**（还在超时窗口内继续等）—— 记账后继续
              accountErrors.set(account.id, e instanceof Error ? e.message : String(e));
            }
          }
        }

        await sleep(delay);
        view = viewOf(account);
      }

      // ★ 循环结束仍未就绪 —— 统一归因（原 `vr` 26100-26107）
      if (view === null) {
        // 一个视图都没见过 ⇒ 记一条可读原因（原版这条来自组件的 `m.error`/`m.lastError`）
        accountErrors.set(account.id, BACKEND_PAGE_TEXT.webviewMissing);
        const f = backendFailure(accountErrors.get(account.id), timeoutMs);
        return err(f.reason, f.note);
      }
      if (!readyAccounts.has(account.id) && !(await isPageReady(view))) {
        const f = backendFailure(accountErrors.get(account.id), timeoutMs);
        return err(f.reason, f.note);
      }

      // ── ③ 页内脚本句柄 ──
      const webContentsId = safeWebContentsId(view);
      if (!webContentsId) return err('page-error', BACKEND_PAGE_TEXT.webContentsIdMissing);

      // ── ④ 注入 input-lock（唯一允许的注入）并置 unlock ──
      await runProbe(view, inputLockSetupScript());
      await runProbe(view, inputLockScript('unlock'));

      // ── ⑤ 导航到会话页并等加载 ──
      const before = safeHref(view);
      await navigateAndWait(view, opts.targetUrl);
      if (!before.startsWith(opts.targetUrl) && !(await waitForPageReady(view))) {
        accountErrors.set(account.id, BACKEND_PAGE_TEXT.navTimeout);
        return err('page-timeout', BACKEND_PAGE_TEXT.navTimeout);
      }

      // ── ⑥ 等 file input（原 `pS` 12000）──
      await waitForFileInput(view, FILE_INPUT_TIMEOUT_MS);

      readyAccounts.add(account.id);
      accountErrors.delete(account.id);
      return ok({ leaseId, webContentsId, href: safeHref(view) });
    },
  };
}

/** 「页面有内容」单次探测（`fS` 的单步版；`nT` 在本工程没有组件可问，故直接探页面） */
async function isPageReady(view: WebviewElement): Promise<boolean> {
  const r = await runProbe<boolean>(view, PAGE_READY_PROBE);
  return r.ok && r.value === true;
}

function safeWebContentsId(view: WebviewElement): number {
  try {
    const id = view.getWebContentsId?.();
    return typeof id === 'number' && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

function safeHref(view: WebviewElement): string {
  try {
    return view.getURL?.() ?? '';
  } catch {
    return '';
  }
}
