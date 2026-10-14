/**
 * 站点抓取的**降级链编排**（`SitePort.scan` 的共用实现）—— electron 之外的**唯一一份**
 *
 * ★ **为什么有它**：`lovart` / `tapnow` 两个适配器的 `scan()` 曾各写一份**逐字同形**的编排
 *   （降级循环 → `summarizeScanAttempts` → 失败拼接 → 取命中的那一档 → `done` 阶段 → `ScanResult`），
 *   差异只有三处**站点参数**（脚本 / referer / `done` 基句）⇒ 收成一条链，差异当参数进来。
 *   （同一轮收口的另一半在 `materializeScan.ts`：`ScanAttempt` 与逐档"归一 + 落盘"已是共用一份。）
 *
 * ★ **顺序**（frames → webview）由 `core/rules/scanChain` 决定 —— 本文件**不硬编码**；
 *   失败原因**原样拼接**（原则 6：不改写、不编造）。
 * ⚠️ 适配器仍**必须显式调用**（不得自启定时器 —— `docs/过程.md` #4）。
 */

import type { Account } from '@/stable/model/account';
import type { HostPort } from '@/core/ports/host.port';
import type { ScanOptions, ScanResult } from '@/core/ports/site.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { SCAN_MAX_FRAMES } from '@/constants';
import { SITE_SCAN_TEXT } from '@/constants/text';
import { nextScanStrategy, summarizeScanAttempts, type ScanStrategy } from '@/core/rules/scanChain';
import {
  scanAttemptFromRaw,
  scanFetchContext,
  type ScanAttempt,
  type ScanAttemptOptions,
} from './materializeScan';
import { webviewEval, type WebviewElement } from './webview';

/** 取视图的结果 —— 拿不到就**带上本站点自己的那句文案**（两站的"找不到"说法不同） */
export type ScanView =
  | { ok: true; view: WebviewElement }
  | { ok: false; error: string };

/** 站点差异（**只这三处**；其余全在下面那条链里） */
export interface SiteScanSpec {
  /** 扫描脚本（frames 与 webview 两条路共用同一个 —— 源里也是同一个） */
  script: string;
  /** 批量取图冒充站内请求的 referer（站点常量；源 `vP` 的实参） */
  referer: string;
  /** 取该账号的 `<webview>`：拿不到 ⇒ `{ok:false, error}`（**文案住在适配器**） */
  view: () => ScanView;
  /**
   * `done` 阶段的**基句** —— 不给就用共用的 `SITE_SCAN_TEXT.phaseDoneAdded`
   *   （`lovart` 给：一张都没扫到时要**说清诊断原因**，源 `wp:32652` 的第二档）
   * ⚠️ 后缀（`phaseUnreadSuffix`）两站相同 ⇒ 由本文件补，站点不重复写。
   * ⚠️ 文案真源在 `@/constants/text` —— 本文件与适配器都**只引用**，不写第二份。
   */
  doneBase?: (r: { items: number; diag?: ScanAttempt['diag'] }) => string;
}

/**
 * 跑一档（**不重试** —— 重试是 `runScanChain` 的事）
 *
 * ⚠️ 单独导出是给"只用一档"的调用方（`tapnow.scanCanvas` 的 DOM 那半 —— 那条链**不是**降级链）。
 */
export async function tryScanOnce(
  host: HostPort,
  account: Account,
  spec: SiteScanSpec,
  via: ScanStrategy,
  opts: ScanOptions,
): Promise<ScanAttempt> {
  // ★ 批量取图的会话上下文（原 `vP` 的实参：account + referer）—— 缺它 ⇒ 远端图取不到（如实计失败）
  const attemptOpts: ScanAttemptOptions = {
    ...(opts.seenUrls ? { seenUrls: opts.seenUrls } : {}),
    fetch: scanFetchContext(account, spec.referer, opts.onPhase),
  };
  const got = spec.view();
  if (!got.ok) return { via, ok: false, error: got.error };
  const view = got.view;

  if (via === 'frames') {
    // 多帧：主进程遍历全部 frame（含嵌套 / 跨域 iframe）—— **经 HostPort**（TD-05-1）
    const wcId = view.getWebContentsId?.() ?? 0;
    if (!wcId) return { via, ok: false, error: SITE_SCAN_TEXT.noWebContentsId };
    const r = await host.media.scanFrames({
      webContentsId: wcId,
      script: spec.script,
      maxFrames: SCAN_MAX_FRAMES,
    });
    if (!r.ok) return { via, ok: false, error: r.message }; // ★ 原样透传
    // ⚠️ `scanFrames` 的形状是 `{items, href}`（**无 `ok`/`skipped`/`unread`**）
    //    ⇒ 包成脚本形状，与 webview 那条路共用同一处"归一并落盘"
    return scanAttemptFromRaw(host, via, { ok: true, images: r.value.items, href: r.value.href }, attemptOpts);
  }

  // 单页：webview 直接执行（只能扫顶层文档）
  try {
    return await scanAttemptFromRaw(host, via, await webviewEval(view, spec.script), attemptOpts);
  } catch (e) {
    return { via, ok: false, error: toMessage(e) };
  }
}

/**
 * 降级链（顺序由 `core/rules/scanChain` 定）→ 汇总 → `ScanResult`
 *
 * ⚠️ 失败**不静默**：读不到的 frame **如实上报**（`unread`）、逐张落盘失败**计数**（`failed`）。
 */
export async function runScanChain(
  host: HostPort,
  account: Account,
  spec: SiteScanSpec,
  opts: ScanOptions,
): Promise<Result<ScanResult>> {
  const attempts: ScanAttempt[] = [];
  const tried: ScanStrategy[] = [];

  for (;;) {
    const via = nextScanStrategy(tried);
    if (!via) break;
    tried.push(via);
    opts.onPhase?.({ phase: 'scanning', message: SITE_SCAN_TEXT.phaseAttempting(via) });

    // ⚠️ 把 `opts` 交下去：`scanAttemptFromRaw` 要用 `seenUrls` 在**取图之前**过滤（原 `wp:32588`）
    const a = await tryScanOnce(host, account, spec, via, opts);
    attempts.push(a);
    if (a.ok) {
      opts.onPhase?.({ phase: 'found', message: SITE_SCAN_TEXT.phaseFound(a.count ?? 0) });
      break;
    }
  }

  const summary = summarizeScanAttempts(attempts);
  if (!summary.ok) {
    // ★ 失败原因**原样拼接**（原则 6：不改写、不编造「网络异常」）
    const detail = summary.failures.map((f) => `[${f.via}] ${f.error}`).join(' | ');
    return err('page-error', detail || SITE_SCAN_TEXT.allChannelsFailed);
  }

  const hit = attempts.find((a) => a.ok);
  const items = hit?.items ?? [];
  const skipped = hit?.skipped ?? 0;
  const unread = hit?.unread ?? [];
  // ★ 逐张落盘失败（原 `wp.failed`）—— 调用方据此报「已抓取 N 张，M 张失败」
  const failed = hit?.failed ?? 0;

  const base =
    spec.doneBase?.({ items: items.length, ...(hit?.diag ? { diag: hit.diag } : {}) }) ??
    SITE_SCAN_TEXT.phaseDoneAdded(items.length);
  opts.onPhase?.({
    phase: 'done',
    message:
      unread.length > 0 ? `${base}${SITE_SCAN_TEXT.phaseUnreadSuffix(unread.length)}` : base,
  });

  return ok({
    items,
    skipped,
    href: hit?.href,
    unread,
    failed,
    ...(hit?.diag ? { diag: hit.diag } : {}),
  });
}
