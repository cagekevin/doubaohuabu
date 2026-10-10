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
  ScannedImage,
  SendResult,
  SitePort,
  SiteProbe,
  UnreadRoot,
} from '@/core/ports/site.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { SCAN_CHAIN, nextScanStrategy, summarizeScanAttempts, type ScanStrategy } from '@/core/rules/scanChain';
import { SCAN_SCRIPT } from './scripts';
import { requireWebview, webviewEval } from '../shared/webview';

/** 单档执行结果（内部） */
interface Attempt {
  via: ScanStrategy;
  ok: boolean;
  count?: number;
  error?: string;
  items?: ScannedImage[];
  href?: string;
  skipped?: number;
  /** ★ 读不到的 frame/root（原则 6：如实上报） */
  unread?: UnreadRoot[];
}

/** 把宿主/脚本返回归一成内部形状（**只做形状收敛，不做业务判断**） */
function normalizeAttempt(via: ScanStrategy, raw: unknown): Attempt {
  const r = raw as
    | { ok?: boolean; error?: string; images?: unknown[]; href?: string; skipped?: number; unread?: UnreadRoot[] }
    | null;
  if (!r) return { via, ok: false, error: '通道返回空' };
  if (r.ok === false) return { via, ok: false, error: r.error ?? '通道返回失败' };
  const images = Array.isArray(r.images) ? (r.images as ScannedImage[]) : [];
  return {
    via,
    ok: true,
    count: images.length,
    items: images,
    href: r.href,
    skipped: r.skipped ?? 0,
    unread: Array.isArray(r.unread) ? r.unread : [],
  };
}

/** 跑一档（**不做自动重试**；重试是上层编排的事） */
async function tryScan(host: HostPort, account: Account, via: ScanStrategy): Promise<Attempt> {
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
    return normalizeAttempt('frames', { ok: true, images: r.value.items, href: r.value.href });
  }

  // 单页：webview 直接执行（只能扫顶层文档）
  try {
    return normalizeAttempt('webview', await webviewEval(view, SCAN_SCRIPT));
  } catch (e) {
    return { via, ok: false, error: toMessage(e) };
  }
}

export function createLovartSite(host: HostPort): SitePort {
  return {
    kind: 'lovart',

    async scan(account: Account, opts: ScanOptions): Promise<Result<ScanResult>> {
      const attempts: Attempt[] = [];
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

      // ★ 读不到的 frame **如实上报**（原则 6：不静默 —— 否则"没扫到"会被误当成"页面上没有"）
      opts.onPhase?.({
        phase: 'done',
        message: unread.length > 0 ? `完成：新增 ${items.length} 张（${unread.length} 个 frame 未读到）` : `完成：新增 ${items.length} 张`,
      });
      return ok({ items, skipped, href: hit.href, unread });
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
