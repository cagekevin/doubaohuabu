/**
 * Lovart 站点适配器（★ 最易变层 —— 站点改版只动这里）
 *
 * 依据：docs/过程.md §6 + docs/过程.md（后端硬约束）
 *   - `dk` shared.js:23619-23778 —— 两档降级（**C2 修正：chrome-cdp 已剔除**）
 *   - `hp` shared.js:22663-23233 —— 页面采集脚本（在 `../shared/scanScripts.ts`）
 *
 * 铁律（契约注释）：
 *   - ★ **宿主能力一律经 `HostPort` 注入**，**禁止直调 `window.api`**（TD-05-1）
 *   - ★ **不开自动轮询抓取**（docs/过程.md #4）：`scan` 只被**显式调用**，**不得**自启定时器
 *   - ★ **零注入**（docs/过程.md #2）：不得用 JS 改 `navigator`/`screen`/`webgl`
 *   - ★ **失败返回 `Result`，不得抛异常**（docs/过程.md #6）；**禁止 `.catch(() => 空)`**（TD-05-2）
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
import { asRecord } from '@/lib/object';
import { GEN_CANVAS_EXPORT_TIMEOUT_MS, SCAN_MAX_FRAMES } from '@/constants';
import { SCAN_DIAG_TEXT } from '@/constants/text';
// ★ 诊断摘要（原 `GT`）—— 纯层；本文件只**转发**它的结果，不自拼文案
import { formatScanDiag, shouldExportCanvas } from '@/core/rules/scanDiag';
import { PAGE_KINDS, SCAN_CHAIN, nextScanStrategy, summarizeScanAttempts, type ScanStrategy } from '@/core/rules/scanChain';
import { CANVAS_EXPORT_SCRIPT, SCAN_SCRIPT } from './scripts';
// ★ 页面类型判定（原 `_d`）—— 与 `tapnow/pageKind.ts` 同形各持一份（判据 A1：站点专属）
import { lovartPageKind } from './pageKind';
import { requireWebview, webviewEval } from '../shared/webview';
import { runProbe } from '../shared/waits';
// ★ 单档归一 + **逐张落盘**（`normalizeAttempt` 在 `site/shared/materializeScan.ts`，两档共用 —— 判据 C1）
import { scanAttemptFromRaw, type ScanAttempt, type ScanAttemptOptions } from '../shared/materializeScan';

/**
 * Lovart 站点地址（原 `_p`，`shared.js:36769`）
 *
 * ⚠️ 站点 URL **只能住适配器** —— 两个消费者都经 `SitePort.chatUrl` 取（同一个真源）：
 *   ① `BackendView` 的 `<webview src>`（此前未声明 ⇒ 落到 `about:blank`）；
 *   ② 「真实 Chrome」登录窗口的初始网址（原 `_Component25.jsx:217` 的 `url: _p`）。
 */
const LOVART_URL = 'https://www.lovart.ai/zh';

/** 跑一档（**不做自动重试**；重试是上层编排的事） */
async function tryScan(
  host: HostPort,
  account: Account,
  via: ScanStrategy,
  attemptOpts: ScanAttemptOptions,
): Promise<ScanAttempt> {
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
    const r = await host.media.scanFrames({ webContentsId: wcId, script: SCAN_SCRIPT, maxFrames: SCAN_MAX_FRAMES });
    if (!r.ok) return { via, ok: false, error: r.message }; // ★ 原样透传
    // ⚠️ `scanFrames` 的形状是 `{items, href}`（**无 `ok`/`skipped`/`unread`**）
    //    ⇒ 包成脚本形状，与 webview 那条路**共用同一处归一并落盘**
    return scanAttemptFromRaw(host, via, { ok: true, images: r.value.items, href: r.value.href }, attemptOpts);
  }

  // 单页：webview 直接执行（只能扫顶层文档）
  try {
    return await scanAttemptFromRaw(host, via, await webviewEval(view, SCAN_SCRIPT), attemptOpts);
  } catch (e) {
    return { via, ok: false, error: toMessage(e) };
  }
}

export function createLovartSite(host: HostPort): SitePort {
  return {
    kind: 'lovart',
    chatUrl: LOVART_URL,
    // ⛔ **刻意不声明 `autoWatch`**（= 本站点**不参与无人值守**）—— 这不是遗漏：
    //   `docs/过程.md` #11 · `electron/main.js:2749`「默认关闭 **Lovart** 自动抓取，避免每 3 秒执行
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

        // ⚠️ 把 `opts` 交下去：`scanAttemptFromRaw` 要用 `seenUrls` 在**取图之前**过滤（原 `wp:32588`）
        const a = await tryScan(host, account, via, opts);
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
      /** ★ 抓取诊断（原 `hp` 的 `p`）—— 只有页内脚本那条路会给（frames 通道没有） */
      const diag = hit.diag;

      // ★ 读不到的 frame **如实上报**（原则 6：不静默 —— 否则"没扫到"会被误当成"页面上没有"）
      // ★ **一张都没扫到时说清为什么**（原 `wp:32652` 的第二档：`没扫到图片（${GT(N)}）`）——
      //   诊断由页内脚本产出，摘要由纯层 `formatScanDiag`（原 `GT`）拼。
      //   ⚠️ 没有诊断（走的是 frames 通道）⇒ 摘要落 `GT` 的 `（无诊断数据）` 档 —— 源同形。
      const base =
        items.length > 0
          ? `完成：新增 ${items.length} 张`
          : SCAN_DIAG_TEXT.empty(formatScanDiag(diag));
      opts.onPhase?.({
        phase: 'done',
        message: unread.length > 0 ? `${base}（${unread.length} 个 frame 未读到）` : base,
      });
      return ok({ items, skipped, href: hit.href, unread, failed, ...(diag ? { diag } : {}) });
    },

    /**
     * ★ **画布导出**（原 `t$` → `YT` → 页内 `Ay`）—— canvas 渲染页面的抓取兜底
     *
     * **门**（**站点专属**，原 `:32611-32613`）：
     *   ① `lovartPageKind(href) === CANVAS` —— 与 `probe`/`scan` **同一份真源**，不另写判定
     *   ② `shouldExportCanvas(diag)`（纯层：有画布 ∧ 至少一个 ≥200px）
     *   ⚠️ 源的**第三档**「本轮没扫到新图」由**调用方**判（`scanGallery`）—— 那是编排的知识。
     *
     * ⚠️ **CDP 那档是死代码**（源 `t$:23918-23945` 调 `window.api.lovartChromeEval`，而**后端没有这个方法**；
     *    `lovart-chrome-is-open` 后端还**明写恒返 `open:false`**，`main.js:2982`）⇒ **不移植**。
     * ⚠️ 页内失败 ⇒ **原样透传**（`没有找到有效画布` / `导出画布失败`），调用方据此留痕。
     */
    async exportCanvas(account, index, ctx) {
      if (lovartPageKind(ctx.href) !== PAGE_KINDS.CANVAS) return ok({ kind: 'not-applicable' });
      if (!shouldExportCanvas(ctx.diag)) return ok({ kind: 'not-applicable' });
      let view;
      try {
        view = requireWebview(account.partition);
      } catch (e) {
        return err('page-error', toMessage(e), e);
      }
      const probed = await runProbe<unknown>(
        view,
        `(${CANVAS_EXPORT_SCRIPT})(${JSON.stringify(index)})`,
        GEN_CANVAS_EXPORT_TIMEOUT_MS,
      );
      // 源 `gn(..., Vo, '画布导出')` 超时 ⇒ `画布导出超时`（`:23958`）
      if (!probed.ok) return err('page-error', '画布导出超时');
      const r = asRecord(probed.value);
      if (r.ok !== true) {
        return err('page-error', typeof r.error === 'string' ? r.error : '导出画布失败');
      }
      const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl : '';
      if (!dataUrl) return err('page-error', '导出画布失败：页内没有返回图片数据');
      // ★ **落盘**（`img://`）—— 与其余扫描项**同形**，下游 `LovartImageInput` 直接可用
      const saved = host.media.saveImageSync(dataUrl);
      if (!saved.ok) return saved;
      return ok({
        kind: 'snapshot',
        ref: saved.value,
        natW: typeof r.natW === 'number' ? r.natW : 0,
        natH: typeof r.natH === 'number' ? r.natH : 0,
        sizeBytes: typeof r.sizeBytes === 'number' ? r.sizeBytes : 0,
      });
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
        // ⚠️ 不再内联正则：改走真源 `lovartPageKind`（含**域校验**，此前缺 ⇒ 非 lovart 域也判）
        const pageKind = lovartPageKind(href);
        return ok({ usable: true, loggedIn: !!href, pageKind });
      } catch (e) {
        return err('page-error', toMessage(e), e);
      }
    },
  };
}

/** 供诊断/测试用：链定义（真源在 `core/rules/scanChain`） */
export { SCAN_CHAIN };
