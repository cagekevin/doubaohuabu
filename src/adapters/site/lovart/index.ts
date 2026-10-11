/**
 * Lovart 站点适配器（★ 最易变层 —— 站点改版只动这里）
 *
 * 依据：docs/03-人类版.md §6 + docs/10（后端硬约束）
 *   - `dk` shared.js:23619-23778 —— 两档降级（**C2 修正：chrome-cdp 已剔除**）
 *   - `hp` shared.js:22663-23233 —— 页面采集脚本（在 `../shared/scanScripts.ts`）
 *
 * 铁律（契约注释）：
 *   - ★ **宿主能力一律经 `HostPort` 注入**，**禁止直调 `window.api`**（TD-05-1）
 *   - ★ **不开自动轮询抓取**（docs/10 #4）：`scan` 只被**显式调用**，**不得**自启定时器
 *   - ★ **零注入**（docs/10 #2）：不得用 JS 改 `navigator`/`screen`/`webgl`
 *   - ★ **失败返回 `Result`，不得抛异常**（docs/10 #6）；**禁止 `.catch(() => 空)`**（TD-05-2）
 *   - ★ **选择器不外泄**：全部在 `../shared/scanScripts.ts`
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
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { SCAN_CHAIN, nextScanStrategy, summarizeScanAttempts, type ScanStrategy } from '@/core/rules/scanChain';
import { SCAN_SCRIPT } from './scripts';
import { requireWebview, webviewEval } from '../shared/webview';
// ★ 单档归一 + **逐张落盘**（原先本文件自带一个同步 `normalizeAttempt`，现已提为两档共用 —— 判据 C1）
import { scanAttemptFromRaw, type ScanAttempt } from '../shared/materializeScan';

/** 跑一档（**不做自动重试**；重试是上层编排的事） */
async function tryScan(host: HostPort, account: Account, via: ScanStrategy): Promise<ScanAttempt> {
  let view;
  try {
    view = requireWebview(account.partition);
  } catch (e) {
    // ★ 原样透传（原则 6）
    return { via, ok: false, error: toMessage(e) };
  }

  if (via === 'frames') {
    // 多帧：主进程遍历全部 frame（含嵌套 / 跨域 iframe）—— **经 HostPort**（TD-05-1）
    const wcId = view.getWebContentsId?.() ?? 0;
    if (!wcId) return { via, ok: false, error: '无法取得 webview 的 webContentsId' };
    const r = await host.media.scanFrames({ webContentsId: wcId, script: SCAN_SCRIPT, maxFrames: 12 });
    if (!r.ok) return { via, ok: false, error: r.message }; // ★ 原样透传
    // ⚠️ `scanFrames` 的形状是 `{items, href}`（**无 `ok`/`skipped`/`unread`**）
    //    ⇒ 包成脚本形状，与 webview 那条路**共用同一处归一并落盘**
    return scanAttemptFromRaw(host, via, { ok: true, images: r.value.items, href: r.value.href });
  }

  // 单页：webview 直接执行（只能扫顶层文档）
  try {
    return await scanAttemptFromRaw(host, via, await webviewEval(view, SCAN_SCRIPT));
  } catch (e) {
    return { via, ok: false, error: toMessage(e) };
  }
}

export function createLovartSite(host: HostPort): SitePort {
  return {
    kind: 'lovart',
    // ⛔ **刻意不声明 `autoWatch`**（= 本站点**不参与无人值守**）—— 这不是遗漏：
    //   `docs/10` #11 · `electron/main.js:2749`「默认关闭 **Lovart** 自动抓取，避免每 3 秒执行
    //   一次页面脚本被判定为机器人」（那段就叫「Lovart 容器隔离」，讲的是 Lovart 的多账号检测）。
    //   ⚠️ 该约束**只点名 Lovart** —— 其余站点照常声明（见 `tapnow/index.ts` 的 `autoWatch`）。
    //   ⚠️ 注意区分：`scan` **仍在**（**手动**「立即抓取」可用）；被去掉的只是「**自动反复**抓」。

    async scan(account: Account, opts: ScanOptions): Promise<Result<ScanResult>> {
      const attempts: ScanAttempt[] = [];
      const tried: ScanStrategy[] = [];

      // ★ 降级链：frames → webview（顺序由 `core/rules/scanChain` 决定，非本文件硬编码）
      for (;;) {
        const via = nextScanStrategy(tried);
        if (!via) break;
        tried.push(via);
        opts.onPhase?.({ phase: 'scanning', message: `尝试 ${via} 通道…` });

        const a = await tryScan(host, account, via);
        attempts.push(a);
        if (a.ok) {
          opts.onPhase?.({ phase: 'found', message: `扫描到 ${a.count ?? 0} 张` });
          break;
        }
      }

      const summary = summarizeScanAttempts(attempts);
      if (!summary.ok) {
        // ★ 失败原因**原样拼接**（原则 6：不改写、不编造「网络异常」）
        const detail = summary.failures.map((f) => `[${f.via}] ${f.error}`).join(' | ');
        return err('page-error', detail || '抓取失败：全部通道不可用');
      }

      const hit = attempts.find((a) => a.ok)!;
      const items = hit.items ?? [];
      const skipped = hit.skipped ?? 0;
      const unread = hit.unread ?? [];
      // ★ 逐张落盘失败（原 `wp.failed`）—— 调用方据此报「已抓取 N 张，M 张失败」
      const failed = hit.failed ?? 0;

      // ★ 读不到的 frame **如实上报**（原则 6：不静默 —— 否则"没扫到"会被误当成"页面上没有"）
      opts.onPhase?.({
        phase: 'done',
        message: unread.length > 0 ? `完成：新增 ${items.length} 张（${unread.length} 个 frame 未读到）` : `完成：新增 ${items.length} 张`,
      });
      return ok({ items, skipped, href: hit.href, unread, failed });
    },

    async send(): Promise<Result<SendResult>> {
      // Lovart 只用于**抓取素材**，不发消息（原实现亦然）
      return err('unknown', 'Lovart 适配器不支持发送');
    },

    async probe(account: Account): Promise<Result<SiteProbe>> {
      let view;
      try {
        view = requireWebview(account.partition);
      } catch (e) {
        return err('page-error', toMessage(e), e);
      }
      try {
        const raw = (await webviewEval(view, '({ href: location.href })')) as { href?: string } | null;
        const href = raw?.href ?? '';
        const pageKind = /\/canvas|projectId=/.test(href) ? 'canvas' : /feed|plaza/.test(href) ? 'feed' : 'other';
        return ok({ usable: true, loggedIn: !!href, pageKind });
      } catch (e) {
        return err('page-error', toMessage(e), e);
      }
    },
  };
}

/** 供诊断/测试用：链定义（真源在 `core/rules/scanChain`） */
export { SCAN_CHAIN };
