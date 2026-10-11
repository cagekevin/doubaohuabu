/**
 * Tapnow 站点适配器（★ 最易变层 —— 站点改版只动这里）
 *
 * 依据（**逐行回源抄录**）：
 *   - `fP` shared.js:33524-33615 —— 抓取（**两档降级** frames → webview）
 *   - `Ok` 33272-33327 · `Uk` 33328-33353 · `Yl` 33401-33420 —— 页内接口（在 `./api.ts`）
 *   - `n0` 33119-33139 —— 页面类型判定（在 `./pageKind.ts`）
 *
 * ★★ **复用而非重写（判据 C1）**：`fP` 用的页内脚本就是 `hp`（= Lovart 的采集脚本）——
 *   证据：`hp` 内部的页面类型判定写死的是 **`lovart.ai`**（`shared.js:22676`），
 *   却由 Tapnow 的 `fP` 调用 ⇒ 原版就是**一套脚本服务两个站点**。
 *   ⇒ 本适配器直接用 `../shared/scanScripts.ts`，与 `lovart/index.ts` 走**同一条降级链**。
 *
 * 铁律（与 `lovart/index.ts` 同）：
 *   - ★ 宿主能力一律经 `HostPort` 注入（原版 `fP` 里的 `window.api.lovartScanFrames` 属**越权**，已改）
 *   - ★ 不开自动轮询抓取 · 零注入 · 失败返 `Result` 不抛 · 选择器不外泄
 *
 * ⏳ **未实现**：`pP`(33616-33650) 的「页内取图」—— 它依赖 `mp`，而 `mp` **不在
 *   `shared-decls.json`** 里（压缩后的组件级函数）⇒ 需先从 bundle 探测才能忠实移植。
 *
 * ⚠️ **`scan` 的编排与 `lovart/index.ts` 目前是重复的**（现为**第 2 处**）。
 *    按 **C1 三振出局**：到**第三个**站点（`gpt`）时必须抽到 `site/shared/`（或 M11 的用例层）。
 */

import type { Account } from '@/stable/model/account';
import type { HostPort } from '@/core/ports/host.port';
import type {
  ScanOptions,
  ScanResult,
  SendResult,
  SitePort,
  SiteProbe,
} from '@/core/ports/site.port';
import { TAPNOW_MIN_SIDE } from '@/constants';
import { TAPNOW_TEXT } from '@/constants/text';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { nextScanStrategy, summarizeScanAttempts, type ScanStrategy } from '@/core/rules/scanChain';
// ★ 单档归一 + **逐张落盘**（原先本文件自带一个同步 `normalizeAttempt`，已提为两档共用 —— 判据 C1）
import { scanAttemptFromRaw, type ScanAttempt } from '../shared/materializeScan';
import { buildResultScanScript } from '../shared/scanScripts';
import { findWebview, webviewEval } from '../shared/webview';
import { tapnowCurrentHref } from './api';
import { tapnowPageKind } from './pageKind';

/** 跑一档（**不自动重试** —— 重试是上层编排的事） */
async function tryScan(
  host: HostPort,
  account: Account,
  via: ScanStrategy,
  script: string,
): Promise<ScanAttempt> {
  // ⚠️ 与源一致（原 `Xn`）：**找不到页面返回 null 而不是抛**
  const view = findWebview({ id: account.id, partition: account.partition, type: account.type });
  if (!view) return { via, ok: false, error: TAPNOW_TEXT.pageNotFound };

  if (via === 'frames') {
    // 多帧：主进程遍历全部 frame（含嵌套 / 跨域）—— **经 HostPort**（TD-05-1）
    const wcId = view.getWebContentsId?.() ?? 0;
    if (!wcId) return { via, ok: false, error: '无法取得 webview 的 webContentsId' };
    const r = await host.media.scanFrames({ webContentsId: wcId, script, maxFrames: 12 });
    if (!r.ok) return { via, ok: false, error: r.message }; // ★ 原样透传
    // ⚠️ `scanFrames` 的形状是 `{items, href}` ⇒ 包成脚本形状，与 webview 那条路共用同一处理
    return scanAttemptFromRaw(host, via, { ok: true, images: r.value.items, href: r.value.href });
  }

  if (typeof view.executeJavaScript !== 'function') {
    return { via, ok: false, error: TAPNOW_TEXT.webviewNotReady };
  }
  try {
    return await scanAttemptFromRaw(host, via, await webviewEval(view, script));
  } catch (e) {
    return { via, ok: false, error: toMessage(e) };
  }
}

export function createTapnowSite(host: HostPort): SitePort {
  return {
    kind: 'tapnow',

    async scan(account: Account, opts: ScanOptions): Promise<Result<ScanResult>> {
      // 脚本按 `minSide` 生成（原 `fP` 的 `{ light, minSide }` 入参；默认 `Kl` = 96）
      const script = buildResultScanScript(opts.minSide ?? TAPNOW_MIN_SIDE);
      const attempts: ScanAttempt[] = [];
      const tried: ScanStrategy[] = [];

      // ★ 降级链：frames → webview（顺序由 `core/rules/scanChain` 决定，不在此硬编码）
      for (;;) {
        const via = nextScanStrategy(tried);
        if (!via) break;
        tried.push(via);
        opts.onPhase?.({ phase: 'scanning', message: `尝试 ${via} 通道…` });

        const a = await tryScan(host, account, via, script);
        attempts.push(a);
        if (a.ok) {
          opts.onPhase?.({ phase: 'found', message: `扫描到 ${a.count ?? 0} 张` });
          break;
        }
      }

      const summary = summarizeScanAttempts(attempts);
      if (!summary.ok) {
        // ★ 失败原因**原样拼接**（原则 6：不改写、不编造）
        const detail = summary.failures.map((f) => `[${f.via}] ${f.error}`).join(' | ');
        return err('page-error', detail || '抓取失败：全部通道不可用');
      }

      const hit = attempts.find((a) => a.ok);
      const items = hit?.items ?? [];
      const skipped = hit?.skipped ?? 0;
      const unread = hit?.unread ?? [];
      // ★ 逐张落盘失败（原 `wp.failed`）—— 调用方据此报「已抓取 N 张，M 张失败」
      const failed = hit?.failed ?? 0;

      // ★ 读不到的 frame **如实上报**（原则 6：不静默）
      opts.onPhase?.({
        phase: 'done',
        message:
          unread.length > 0
            ? `完成：新增 ${items.length} 张（${unread.length} 个 frame 未读到）`
            : `完成：新增 ${items.length} 张`,
      });
      return ok({ items, skipped, href: hit?.href, unread, failed });
    },

    async send(): Promise<Result<SendResult>> {
      // Tapnow 只用于**抓取素材**，不发消息（原 `fP` 无发送路径）
      return err('unknown', 'Tapnow 适配器不支持发送');
    },

    async probe(account: Account): Promise<Result<SiteProbe>> {
      const href = await tapnowCurrentHref({
        id: account.id,
        partition: account.partition,
        type: account.type,
      });
      if (!href) return err('page-error', TAPNOW_TEXT.pageNotFound);

      // ⚠️ 页面类型判定用**站点自己的** `n0`（不是 Lovart 那套）
      return ok({ usable: true, loggedIn: true, pageKind: tapnowPageKind(href) });
    },
  };
}
