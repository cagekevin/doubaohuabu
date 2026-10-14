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
 *    ★ 2026-10-11 进展：**「归一 + 逐张落盘」那半已经抽走**（`shared/materializeScan.ts` ——
 *    两档各自那份同形 `Attempt` + `normalizeAttempt` 已删）；**剩下的重复**只有外面那层
 *    降级循环（`for(;;) nextScanStrategy → tryScan`），等 `gpt` 有抓取时一并判。
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
import { AUTO_WATCH_IDLE_BACKOFF_MS, AUTO_WATCH_INTERVAL_MS, TAPNOW_MIN_SIDE } from '@/constants';
import { GALLERY_TEXT, SEND_TEXT, SITE_CAP_TEXT, TAPNOW_TEXT } from '@/constants/text';
import { err, ok, type Result } from '@/core/model/result';
import { PAGE_KINDS, canvasIdFromHref } from '@/core/rules/scanChain';
// ★ 「已在库过滤」（原 `wp`/`wP` 的 `haveUrls`/`seen`）＋ 画布 DOM 那半的 `Yh` 清洗 —— 都走 `scanClean`
import { cleanScannedImages, excludeSeenImages } from '@/core/rules/scanClean';
// ★ 单档归一 + **逐张落盘**（`normalizeAttempt` 在 `site/shared/materializeScan.ts`，两档共用 —— 判据 C1）
import { materializeScannedImages, scanFetchContext } from '../shared/materializeScan';
// ★ 降级链**编排**（`scan` 那条）—— 与 `lovart` **共用一份**（`site/shared/scanRun.ts`，判据 C1）
import { runScanChain, tryScanOnce, type SiteScanSpec } from '../shared/scanRun';
import { buildResultScanScript } from '../shared/scanScripts';
import {
  canvasImageKey,
  isUsableCanvasImageUrl,
  stripVariantParams,
  tapnowCanvasNodes,
} from './api';
import { findWebview } from '../shared/webview';
import { tapnowCurrentCanvasId, tapnowCurrentHref } from './api';
import { tapnowPageKind } from './pageKind';

/**
 * Tapnow **会话页**地址（原 `rS`，`shared.js:36770`）—— 声明为 `SitePort.chatUrl`
 *
 * ⚠️ 站点 URL **只能住适配器**：两个消费者都经 `SitePort.chatUrl` 取（同一个真源）
 *   ① `BackendView` 的 `<webview src>`（原 `_Component25.jsx:355` 的 `src` 三目）；
 *   ② `core/usecases/sendToSite` 的导航目标（未声明 ⇒ 明确报错，不回落）。
 * ⚠️ 取值与登录页（`SITE_LOGIN_URL.tapnow` ← 原 `EP`，`shared.js:34200`）**相同**，
 *   但源里是**两个常量**（登录 / 会话）⇒ 两处各照各的，不跨表引用。
 */
const TAPNOW_URL = 'https://app.tapnow.media/home';

/** 批量取图冒充站内请求的 `referer`（原 `wP` 调 `vP` 的实参，`shared.js:34090`，逐字） */
const TAPNOW_REFERER = 'https://app.tapnow.media/';

/**
 * 本站的扫描差异（`SiteScanSpec` 的那三处）—— `scan` 与 `scanCanvas` 的 DOM 那半**共用同一组**
 */
function tapnowScanSpec(account: Account, script: string): SiteScanSpec {
  return {
    script,
    referer: TAPNOW_REFERER,
    // ⚠️ 与源一致（原 `Xn`）：**找不到页面返回 null 而不是抛**；两句文案都是本站自己的
    view: () => {
      const v = findWebview({ id: account.id, partition: account.partition });
      if (!v) return { ok: false as const, error: TAPNOW_TEXT.pageNotFound };
      if (typeof v.executeJavaScript !== 'function') {
        return { ok: false as const, error: TAPNOW_TEXT.webviewNotReady };
      }
      return { ok: true as const, view: v };
    },
  };
}

export function createTapnowSite(host: HostPort): SitePort {
  return {
    kind: 'tapnow',
    chatUrl: TAPNOW_URL,

    // ★ **无人值守轮询**能力声明（注册制：站点细节住 adapter —— 见 `site.port.ts` 的注释）
    //   源版的 `Ee` 循环对 Tapnow **也跑**（`_Component26.jsx:451` 的 `ho(acc) ? wp : xp` 走 else）。
    //   节奏取源版的「**非 Lovart 档**」（`KR` 6000 / `XR` 15000）：
    //   ⚠️ Lovart 档（`qR`/`YR`）在本仓**用不到** —— Lovart 不值守（`docs/过程.md` #11，见 `lovart/index.ts`）。
    autoWatch: { intervalMs: AUTO_WATCH_INTERVAL_MS, idleBackoffMs: AUTO_WATCH_IDLE_BACKOFF_MS },

    /**
     * ★ **探测当前画布**（原 `dP` 33430-33460 的画布支）—— 值守门槛（原 `Ee:536-557`）。
     *
     * 顺序（逐字对源）：`Yl`（当前画布 id）→ 取不到就返回"不在画布页" → `qc`（画布节点，不带预览）
     *   → 回图片 url 列表。
     * ⚠️ 与源一致：**不在画布页 / 画布上没有图都不是错误**（源用空值表达，本仓用 `ok` + 空值）。
     * ⚠️ `qc` 真失败（401 / 网络）**原样透传**（原则 6）—— 调用方按"本轮顺延"处理，不打扰用户。
     */
    async peekCanvas(account) {
      const canvasId = await tapnowCurrentCanvasId(account);
      if (!canvasId) return ok({ canvasId: '', urls: [] });
      const r = await tapnowCanvasNodes(account, canvasId, { includePreview: false });
      if (!r.ok) return r;
      return ok({ canvasId, urls: r.value.images.map((img) => img.url) });
    },

    /**
     * ★ **扫当前画布**（原 `wP` 33842-33990：**画布节点 API** + **页面 DOM 兜底/合并**）—— 画廊面板用它。
     *
     * 顺序（逐字对源）：
     *   ① `Yl` 取当前画布 id —— 取不到 ⇒ 「没停在画布页」（**不是失败**，源 `_Component23:204-208`）
     *   ② `qc` 读画布节点 → `onStatus(found)`
     *   ③ **收着的图 < `limit` 时**再扫一遍页面 DOM（源 `l && v.length < o`），且**页面画布 id
     *      必须与请求的那个相同**（源 `:33930` 的 gate）；DOM 那半按 `Yh`（`minSide 96` ·
     *      `allowedScopes: ['canvas','site']`）清洗、并按 `Ci` 过滤（源 `:33934-33947`）
     *   ④ 两半**按归一键合并** → 滤"已在库" → **截断 `limit`**（源 `:33966` 的 `v.slice(0, o)`）→ 逐张落盘
     *
     * ⚠️ 与源的三处差异（如实标注）：
     *   ① 取的图走**主进程批量取图** `HostPort.media.fetchImages`（原 `vP`；带账号 cookie + 进度），
     *      不移植页内脚本 `mp`/`pP`（本仓没有页内取图档）；
     *   ② 源的 `useDom` 是**入参**（值守那半传 `false`）—— 本仓唯一的调用方（画廊按钮）传的是 `true`
     *      ⇒ **固定走"接口 + DOM 合并"**，不开那个开关（开了也没人用另一档 = 幽灵开关）；
     *   ③ 截断在**落盘之前**（与源一致）—— 与 `scan` 那条链不同（那里 `Yh` 在落盘后）。
     */
    async scanCanvas(account: Account, opts: ScanOptions): Promise<Result<ScanResult>> {
      opts.onPhase?.({ phase: 'scanning', message: GALLERY_TEXT.scanPhaseReading });

      const canvasId = await tapnowCurrentCanvasId(account);
      // ⚠️ 取不到画布 id = 用户没停在画布页（**不是失败**，源 `_Component23.jsx:204-208` 也是这么判的）
      //   ⚠️ 用 `page-error`：分类表（`SendFailKind`）是**发送域**的 14 项，没有"没开画布页"这一档
      //      ⇒ 不硬塞一个新 kind（那会把扫描域的词塞进发送域）；`message` 走 SSOT，
      //      调用方按**同一张 SSOT 常量**判定它是"没在画布页"而非真出错。
      if (!canvasId) return err('page-error', GALLERY_TEXT.scanNeedCanvas);

      const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : Number.POSITIVE_INFINITY;

      // ② 接口那半（原 `qc`）
      const r = await tapnowCanvasNodes(account, canvasId, { includePreview: false });
      if (!r.ok) return r; // ★ 原样透传（原则 6）
      opts.onPhase?.({ phase: 'found', message: GALLERY_TEXT.scanPhaseFound(r.value.images.length) });

      /** 归一键 → 候选（两半共用；源用 `Vc` 的键去重）· `ref` 只在候选**已落过盘**时才带 */
      const byKey = new Map<string, { url: string; ref?: string }>();
      for (const img of r.value.images) {
        const key = canvasImageKey(img.url);
        if (!byKey.has(key)) byKey.set(key, { url: img.url });
      }

      // ③ DOM 那半（原 `:33923-33958`）—— 只在"接口给的不够 + 页面确实停在**同一个**画布"时合并
      if (byKey.size < limit) {
        const dom = await tryScanOnce(host, account, tapnowScanSpec(account, buildResultScanScript(TAPNOW_MIN_SIDE)), 'webview', opts);
        if (dom.ok) {
          const sameCanvas = canvasIdFromHref(dom.href ?? '') === canvasId;
          if (sameCanvas) {
            // 源 `Yh(O.items, {minSide: Kl, allowedScopes: ['canvas','site']})`
            const cleaned = cleanScannedImages(dom.items ?? [], {
              minSide: TAPNOW_MIN_SIDE,
              allowedScopes: ['canvas', 'site'],
            });
            for (const it of cleaned.items) {
              if (!isUsableCanvasImageUrl(it.url)) continue; // 源 `Ci(F.url)` 过滤
              const url = stripVariantParams(it.url); // 源 `ao(F.url)`
              const key = canvasImageKey(url);
              // ⚠️ DOM 那半**已经落过盘**（`tryScan` 内部走的是同一处落盘）⇒ 带上 `ref`，
              //    下一步的落盘会**原样采用**它、不重复下载（`materializeScan` 的幂等判据）
              if (!byKey.has(key)) byKey.set(key, { url, ref: it.ref });
            }
          }
        }
        // ⚠️ 与源一致：DOM 那半**失败/不匹配都不算错误**（源只往 `channels` 里记一笔），不打断整条链
      }

      // ④ 合并 → 滤"已在库" → 截断（源 `:33966`）
      const raws = [...byKey.values()].map((c) =>
        c.ref ? { url: c.url, ref: c.ref, scope: 'canvas' as const } : { url: c.url, scope: 'canvas' as const },
      );
      const fresh = excludeSeenImages(raws, opts.seenUrls);
      const picked = Number.isFinite(limit) ? fresh.items.slice(0, limit) : fresh.items;
      if (picked.length > 0) {
        opts.onPhase?.({ phase: 'working', message: GALLERY_TEXT.scanPhasePrepare(picked.length) });
      }
      const m = await materializeScannedImages(
        host,
        picked,
        'api',
        scanFetchContext(account, TAPNOW_REFERER, opts.onPhase),
      );

      // 跳过 = 已在库（`fresh.skipped`）+ 宿主批量取图报的占位 / 杂图（`m.skipped`，原 `vP` 的 `S`）
      const skipped = fresh.skipped + m.skipped;
      opts.onPhase?.({
        phase: 'done',
        message: GALLERY_TEXT.scanOk(m.items.length, skipped, m.failed),
      });
      return ok({ items: m.items, href: undefined, skipped, failed: m.failed });
    },

    async scan(account: Account, opts: ScanOptions): Promise<Result<ScanResult>> {
      // 脚本按 `minSide` 生成（原 `fP` 的 `{ light, minSide }` 入参；默认 `Kl` = 96）
      // ⚠️ `done` 基句与 `lovart` 相同 ⇒ 不给 `doneBase`，用共用那句（链路自带"（M 个 frame 未读到）"后缀）
      return runScanChain(
        host,
        account,
        tapnowScanSpec(account, buildResultScanScript(opts.minSide ?? TAPNOW_MIN_SIDE)),
        opts,
      );
    },

    async send(): Promise<Result<SendResult>> {
      // Tapnow 只用于**抓取素材**，不发消息（原 `fP` 无发送路径）
      return err('unknown', SEND_TEXT.noCapability('tapnow', SITE_CAP_TEXT.send));
    },

    async probe(account: Account): Promise<Result<SiteProbe>> {
      const href = await tapnowCurrentHref({ id: account.id, partition: account.partition });
      if (!href) return err('page-error', TAPNOW_TEXT.pageNotFound);

      // ⚠️ 页面类型判定用**站点自己的** `n0`（不是 Lovart 那套）
      // ★ 登录判据 = **停在站点内容页**（画布 / 广场）—— 未登录访问这两处会被重定向到登录页（那是 `other`）。
      //   ⚠️ 源无此探针（本仓自造）；原写 `loggedIn: true` 硬编码 ⇒ 会话过期测不出。
      const pageKind = tapnowPageKind(href);
      const onContent = pageKind !== PAGE_KINDS.OTHER;
      return ok({ usable: onContent, loggedIn: onContent, pageKind });
    },
  };
}
