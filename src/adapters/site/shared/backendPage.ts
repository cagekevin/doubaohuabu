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
 *   · **不自启轮询**（`docs/过程.md` #4）—— `prepareForSend` 的轮询只在被调用期间存在
 *   · **零注入**（#2）—— 唯一例外是 `input-lock`（既有例外，见 `docs/过程.md` 链 17）
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
import { log } from '@/lib/log';
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
/**
 * 账号 → **静默快照**（原 `Wc`，`shared.js:32379`）—— 表**不导出**（M6），只经端口三个方法读写
 * ⚠️ 值是 dataURL（960px 宽 PNG，量级百 KB）⇒ 只对有快照的账号占内存；`dropSnapshot` 及时清。
 */
const snapshots = new Map<string, string>();

/** 截前静置（ms，原 `je` 的 `setTimeout(tt, 400)`，`_Component43.jsx:470`） */
const SNAPSHOT_SETTLE_MS = 400;
/** 截取超时（ms，原 `je` 的 `setTimeout(…Ae(new Error('capture-timeout')), 4000)`） */
const SNAPSHOT_TIMEOUT_MS = 4000;
/** 缩到多宽（原 `je` 的 `ve.resize({ width: 960 })`） */
const SNAPSHOT_WIDTH = 960;
/** dataURL 最短长度（原 `je` 的 `qe.length < 64` 判定） */
const SNAPSHOT_MIN_LEN = 64;

/** `Promise.race` 超时（原 `je` 里那段 race 的实现） */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_res, rej) => {
      setTimeout(() => rej(new Error('capture-timeout')), ms);
    }),
  ]);
}
/** 账号 → 已被标记为「曾经就绪」（原 `m.ready`，省掉重复探测） */
const readyAccounts = new Set<string>();
/** 账号 → 最近一次后端报错（原 `m.error`，驱动「自动重载一次」） */
const accountErrors = new Map<string, string>();

let leaseSeq = 0;

/**
 * 账号 → **后台页状态记录**（原 `Jn` 的值，`shared.js:25837`）—— 表**不导出**（M6）
 *
 * ★ **它就是「谁该保持挂载」的真源**（源 `oT()` = `Array.from(Jn.keys())`）：
 *   · 记录**建立于取租约**（原 `Q$`）；末条租约释放 ⇒ 进 **drain 宽限**（`K$ = 1500ms`，
 *     `shared.js:25835`）—— 宽限内**记录仍在** ⇒ 页面**仍挂载**；宽限到点才删记录 ⇒ 页面卸载。
 *   · ⚠️ **卸载事件（原 `lT` `:26011-26022`）不删记录**（只置 `ready=false`）——
 *     这正是"卸载 ≠ 卸挂载"的区别，也是本仓此前用 `accountBusy` 顶时漏掉的那一半。
 */
const pageRecords = new Map<
  string,
  { leases: Set<string>; drainTimer: ReturnType<typeof setTimeout> | null }
>();
/** 租约快照的订阅者（原 `gp`，`shared.js:25839`） */
const leaseSubscribers = new Set<(accountIds: readonly string[]) => void>();
/** drain 宽限（ms，原 `K$`，`shared.js:25835`） */
const DRAIN_DELAY_MS = 1500;

/** 快照（原 `oT` 25973 = `Array.from(Jn.keys())`） */
function leaseSnapshot(): string[] {
  return [...pageRecords.keys()];
}

/** 通知订阅者（原 `Fr` 25867 —— 源也是逐个 `try/catch {}` 吞） */
function notifyLeases(): void {
  const ids = leaseSnapshot();
  for (const cb of leaseSubscribers) {
    try {
      cb(ids);
    } catch {
      // catch-ok: 源 `Fr`（shared.js:25867-25874）就是**逐个 `try/catch {}`** 吞 ——
      //   一个订阅回调抛错不该拖垮其余回调。照抄源；不是"忘了处理"。
    }
  }
}

/** 建/取记录，并**取消 drain**（原 `Q$` 25875 里 `clearTimeout(n.drainTimer)` 那半步） */
function touchRecord(accountId: string): void {
  let rec = pageRecords.get(accountId);
  if (!rec) {
    rec = { leases: new Set<string>(), drainTimer: null };
    pageRecords.set(accountId, rec);
  }
  if (rec.drainTimer) {
    clearTimeout(rec.drainTimer);
    rec.drainTimer = null;
  }
}

/** 末条租约释放 ⇒ 起 drain 定时器（原 `eT` 25916）—— 宽限内又来租约则撤销删除 */
function scheduleDrain(accountId: string): void {
  const rec = pageRecords.get(accountId);
  if (!rec || rec.leases.size > 0 || rec.drainTimer) return;
  notifyLeases();
  rec.drainTimer = setTimeout(() => {
    const cur = pageRecords.get(accountId);
    if (!cur) return;
    cur.drainTimer = null;
    if (cur.leases.size > 0) {
      notifyLeases();
      return;
    }
    pageRecords.delete(accountId);
    notifyLeases();
  }, DRAIN_DELAY_MS);
}

const viewOf = (account: Account): WebviewElement | null => findWebview(account);

/** 释放（原 `rn` 26109）—— **幂等**；末条释放 ⇒ 该账号的记录进 drain 宽限 */
function releaseLease(leaseId: string): void {
  const rec = leases.get(leaseId);
  leases.delete(leaseId);
  const accountId = rec?.accountId;
  if (!accountId) return;
  const page = pageRecords.get(accountId);
  if (!page) return;
  page.leases.delete(leaseId);
  scheduleDrain(accountId);
}

export function createBackendPage(): BackendPagePort {
  return {
    // ⚠️ **不实现 `isMounted`**：本仓 `BackendView` 常驻渲染 ⇒ 它对本仓存在的账号恒 `true` = 假判据

    release(leaseId: string): void {
      releaseLease(leaseId);
    },

    // ★ 长任务循环的存活判据（原 `zy` 25976 = `Du.has(leaseId)`）—— TTL 到期即 false
    isAlive(leaseId: string): boolean {
      return isLeaseAlive(leases.get(leaseId), Date.now());
    },

    // ★ 后台页租约快照（原 `oT` 25973）—— 表不导出（M6），只此一个读数口
    leases(): readonly string[] {
      return leaseSnapshot();
    },

    // ★ 订阅租约快照（原 `sT` 25962）—— **立即用当前快照回调一次**（源 `e(Ck())`）
    subscribeLeases(cb: (accountIds: readonly string[]) => void): () => void {
      leaseSubscribers.add(cb);
      try {
        cb(leaseSnapshot());
      } catch {
        // catch-ok: 初值回调抛错**不外溢**（否则 `container` 装配期就炸）；
        //   与 `Fr` 同一条口径 —— 订阅者自己的问题，不该让注册失败。
      }
      return () => {
        leaseSubscribers.delete(cb);
      };
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
        // ★ **先撤「就绪」标记，再 reload**（逐字对源 `_Component43.jsx:428-435` 的
        //   `reloadAccount`：`const Q = te(ee); u.current.delete(ee); Q?.reload?.()`）。
        //   ⚠️ 不撤的话 `prepareForSend` 会命中 `readyAccounts` 的短路 ⇒ 页面**正在重载**也被
        //      当成"已就绪"，紧接着的页内脚本会打在**白屏/半载**的页面上。
        readyAccounts.delete(account.id);
        cmd.reload();
        return ok(undefined);
      } catch (e: unknown) {
        return err('page-error', e instanceof Error ? e.message : String(e), e);
      }
    },

    // ★ 发送后检测用（原 `it` 的 `Y.getWebContentsId()`）—— **不占租约、不导航**
    webContentsIdOf(account: Account): Result<number> {
      const view = viewOf(account);
      if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
      const id = safeWebContentsId(view);
      if (!id) return err('page-error', BACKEND_PAGE_TEXT.webContentsIdMissing);
      return ok(id);
    },

    // ★ 基线重置判据用（原 `kt` 的 `ge()` 读 `ae.getURL()`）—— **不占租约、不导航**
    hrefOf(account: Account): Result<string> {
      const view = viewOf(account);
      if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
      return ok(safeHref(view));
    },

    // ★ 静默遮罩的底图（原 `je`，`_Component43.jsx:461-500`）—— 逐条对源
    async captureSnapshot(account: Account): Promise<Result<boolean>> {
      const view = viewOf(account);
      if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
      // ⚠️ 环境没有该能力（非 Electron / DEV）⇒ **不是错误**，只是"截不到"
      if (typeof view.capturePage !== 'function') return ok(false);
      try {
        await sleep(SNAPSHOT_SETTLE_MS);
        const img = await withTimeout(view.capturePage(), SNAPSHOT_TIMEOUT_MS);
        if (!img || (typeof img.isEmpty === 'function' && img.isEmpty())) return ok(false);
        let dataUrl = '';
        try {
          dataUrl = img.resize ? img.resize({ width: SNAPSHOT_WIDTH }).toDataURL() : img.toDataURL();
        } catch {
          // ⚠️ 源同：`resize` 失败 ⇒ 回落到原尺寸 `toDataURL()`
          dataUrl = img.toDataURL();
        }
        if (!dataUrl || dataUrl.length < SNAPSHOT_MIN_LEN) return ok(false);
        snapshots.set(account.id, dataUrl);
        return ok(true);
      } catch (e: unknown) {
        // ⚠️ 源 `je` **一律返 `false`**（含超时），不抛 ⇒ 这里也当"截不到"。
        //    但**留痕**（原则 6：不静默吞）—— 失败只影响底图，遮罩照常显示纯色底。
        log.warn('[backendPage] 静默快照失败（遮罩将退化为纯色底）：', e);
        return ok(false);
      }
    },

    snapshotOf(accountId: string): string | null {
      return snapshots.get(accountId) ?? null;
    },

    dropSnapshot(accountId: string): void {
      snapshots.delete(accountId);
    },

    // ★ `conversationId` 支回会话页用（原 `es(Ae, '…/chat/<id>')`）—— **不占租约**
    async navigate(account: Account, url: string): Promise<Result<void>> {
      const view = viewOf(account);
      if (!view) return err('page-error', BACKEND_PAGE_TEXT.webviewMissing);
      const navigated = await navigateAndWait(view, url);
      if (!navigated) return err('page-timeout', BACKEND_PAGE_TEXT.navTimeout);
      return ok(undefined);
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
      // ★ 取租约 ⇒ 建立/续命该账号的记录（原 `Q$` 25875）⇒ 它进「保持挂载」集合
      touchRecord(account.id);
      pageRecords.get(account.id)?.leases.add(leaseId);
      notifyLeases();

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

      // ── ⑤ 导航到会话页并等加载（**只在调用方给了 `targetUrl` 时做**）──
      //    ⚠️ 源 `vr` 本来就**不导航**（导航是调用方另做的，`gS` 的 `uS(d, m)`）⇒ 不给就不动页面。
      //       需要"续用当前页"的调用方（「自动确认生成」）正是靠这一点，别自作主张导航。
      const targetUrl = opts.targetUrl;
      if (targetUrl) {
        const before = safeHref(view);
        await navigateAndWait(view, targetUrl);
        if (!before.startsWith(targetUrl) && !(await waitForPageReady(view))) {
          accountErrors.set(account.id, BACKEND_PAGE_TEXT.navTimeout);
          return err('page-timeout', BACKEND_PAGE_TEXT.navTimeout);
        }
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
