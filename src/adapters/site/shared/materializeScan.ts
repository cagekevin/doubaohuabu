/**
 * 扫描结果**落盘** + 单档结果归一（★ 两档站点适配器共用）
 *
 * ★★ **它修的是什么**：`SitePort.scan` 的契约说 `ScannedImage.ref` 是「`img://` 引用（**已落盘**）」，
 *    但页面脚本只能给出 `{url, scope, natW, natH}`（它拿不到 `img://`）—— 于是 lovart / tapnow
 *    的适配器此前是 `raw.images as ScannedImage[]` **一句断言把 `ref` 谎报出去**，
 *    真正的落盘步骤**从来没有过**。本文件补上那一步。
 *
 * 依据（**逐行回源** `wp` 32493-32941 的取值半）：
 *   | 源 | 语义 | 本仓 |
 *   |---|---|---|
 *   | `Lc(account, url)` / `vP` | 取图 → `{ok, dataUrl}`。源的活路径是**页内取图**（`mp`/`pP`，在页面里 fetch ⇒ 带 cookie）；`e$`（`imageFetchDataUrl`）/ `vP`（批量 `fetchImages`）是降级 | 本仓**没有页内取图档** ⇒ 远端图走 `HostPort.media.fetchImages`（**批量 + 带账号 cookie**，原 `vP`）；`imageFetchDataUrl` 只服务文生图后台通道 |
 *   | `Tn(dataUrl)` 29261 | 内联 base64 → `img://` | `HostPort.media.saveImageSync`（**同步 IPC**，不得 await） |
 *   | `wp.failed` | 逐张失败计数 | `ScannedImage` 落不出来 ⇒ `failed++`（本文件返回给调用方） |
 *
 * ★ **逐张内容去重**（原 `sm.isDuplicate`，`:25787`；源调用点 `wp:32508` / `wP:33799` / `NR:36081`）：
 *   每轮在**落盘之前**过一遍 —— 同一轮内的**重复**与**近重复**（感知哈希，汉明距离 ≤ 8）；
 *   与**已有**条目的重复归 `excludeSeenImages`（URL 级）＋ 落库方 `addLovartImages`（`dataUrl` 级）。
 *   见下面 `materializeScannedImages` 里的 `dedupe` / `isDup`。
 *
 * ⚠️ **不静默**（原则 6）：落不出来就计入 `failed` **并就地留痕**（`log.warn`，读者 = 开发者），
 *    不塞假值、不回落成原 URL —— 契约说 `ref` 是「已落盘」，那就只能是 `img://`
 *    （已经是 `img://` 的原样透传）。★ TD-16-48：此前**只留一个 `failed` 计数**，
 *    「下载超时 / 非图片 / 宿主 IPC 失败」三者**不可分**（无日志无痕迹）。
 * ⚠️ 这也是 `docs/过程.md` §5「Lovart / Tapnow 图库抓取无落点」里**能独立完成的那一半**：
 *    页面脚本与四阶段编排不在本文件（见 `materializeScannedImages` 的头注）。
 */

import type { FetchImagesProgress, HostPort } from '@/core/ports/host.port';
import type { ScanDiag, ScanPhaseEvent, ScannedImage, UnreadRoot } from '@/core/ports/site.port';
// ★ 扫描枚举的**运行时真源**在 `core/rules/scanChain.ts`（从端口迁出，TD-04-4）——
//   本文件只消费真源，**不自持副本**（同一真相抄两份 = 母体 M3 / TD-16-24）。
import { SCAN_SCOPES, type ScanScope, type ScanStrategy } from '@/core/rules/scanChain';
// ★ 已见过滤（原 `wp:32588`）—— **必须在下面取图之前**（源顺序：清洗 → 过滤 → 截断 → 取图）
import { excludeSeenImages } from '@/core/rules/scanClean';
// ★ **垃圾图过滤**（原 `Dc`，`shared.js:32625/32681/34000`）—— 取图后按「尺寸 ＋ 字节」判（`TD-16-141`）
import { isLovartJunk } from '@/core/rules/lovartGallery';
// ★ **内容去重**（原 `sm.isDuplicate`，`shared.js:25787`）—— 同一轮内的重复 ＋ **近重复**（感知哈希）
import { createDedupe, emptyDedupeState } from '@/core/rules/dedupe';
// ★ 感知哈希的**浏览器实现**（DOM）—— 由适配器注入（`core` 不得碰 DOM，原则 4）
import { perceptualHash } from '@/lib/phash';
// ★ 诊断的**收窄**（页内脚本是运行时数据，形状不由 TS 保证）—— 缺字段 ⇒ `null`，不补默认值
import { normalizeScanDiag } from '@/core/rules/scanDiag';
import { log } from '@/lib/log';
import { isRecord } from '@/lib/object';
import { GALLERY_TEXT } from '@/constants/text';
import { isImgRef, isInlineImage } from '@/stable/protocols/img';

/**
 * 逐张落盘 / 归一**失败的原因**（★ 判别值 —— 调用方据此留痕，不再"三者不可分"）
 *
 * | why | 产生处 | 含义 |
 * |---|---|---|
 * | `bad-element` | `materializeScannedImages` | 数组元素**不是对象**（页面脚本是运行时数据） |
 * | `empty-url` | 同上 | 元素没有 `url` |
 * | `unknown-scope` | 同上 | `scope` 不在 `SCAN_SCOPES` 里（**不静默归 `site`**，TD-16-50） |
 * | `fetch-failed` | `materializeScannedImages` | 批量取图失败 / 未返回该图（原文进 `detail`） |
 * | `not-inline` | `materializeOne` | 取回的不是内联图 |
 * | `save-failed` | `saveInline` | 宿主落盘 IPC 失败（原文进 `detail`） |
 */
type MaterializeFailWhy =
  | 'bad-element'
  | 'empty-url'
  | 'unknown-scope'
  | 'fetch-failed'
  | 'not-inline'
  | 'save-failed';

/**
 * 单张落盘的结果（★ 判别联合 —— 原则 6：**不归一成 `null`**，TD-16-48）
 *
 * ⚠️ 为什么必须带 `why`：原先 4 条失败路径全部 `return null` ⇒ 调用方只能 `failed++`
 *    ⇒ 失败原因**全丢**。
 */
type MaterializeOutcome =
  | { ok: true; ref: string }
  | { ok: false; why: MaterializeFailWhy; detail?: unknown };

/**
 * 单档执行结果 —— ★ **两档适配器共用**（原先 `lovart` / `tapnow` 各写一份同形 interface，判据 C1）
 *
 * ⚠️ 结构上兼容 `core/rules/scanChain` 的 `summarizeScanAttempts`（只要 `via`/`ok`/`count`/`error`）。
 */
export interface ScanAttempt {
  via: ScanStrategy;
  ok: boolean;
  count?: number;
  error?: string;
  items?: ScannedImage[];
  href?: string;
  skipped?: number;
  /** ★ 读不到的 frame/root（原则 6：如实上报） */
  unread?: UnreadRoot[];
  /** ★ 逐张**落盘失败**的张数（原 `wp.failed`） */
  failed?: number;
  /**
   * ★ **抓取诊断**（原 `hp` 的 `p`）—— 只有**页内脚本**那条路会给
   *   （frames 通道的原始形状是 `{items, href}`，没有 diag ⇒ 该项缺省）
   */
  diag?: ScanDiag;
}

/**
 * 作用域判定 —— 未知值 ⇒ **`null`**（★ TD-16-50：**不静默归 `site`**）
 *
 * ⚠️ 为什么不能归 `site`：那是**编造**（我们并不知道它在页面哪个区域），而 `scope` 还参与
 *    「只留本画布」的纳 / 滤 ⇒ 编造会**静默改变过滤结果**。未知 ⇒ 交调用方计入 `failed`（如实）。
 * ⚠️ 实测：页面脚本的 `scopeOf` 恒返 `canvas|panel|feed|site`（`scanScripts.ts:142`）
 *    ⇒ 本分支**当前不可达**；它防的是"将来脚本换形状时被静默吞掉"。
 */
const asScope = (v: unknown): ScanScope | null =>
  typeof v === 'string' && (SCAN_SCOPES as readonly string[]).includes(v) ? (v as ScanScope) : null;

const asSide = (v: unknown): number | undefined => (typeof v === 'number' && v > 0 ? v : undefined);

/**
 * `unread` 的**元素级**收窄 + 归一（★ TD-16-50）
 *
 * ⚠️ `as UnreadRoot[]` 是**假收窄** —— 它虚报了元素有 `kind` / `why: string`，
 *    而这是**页面脚本**给的运行时数据（`scanScripts.ts` 的 `collected.unread`）。
 * ⚠️ 实测：脚本恒推 `{kind, why}` ⇒ 本函数在真实数据上是 no-op；它防的是形状漂移。
 */
const toUnreadRoot = (v: unknown): UnreadRoot | null => {
  if (!isRecord(v) || typeof v.kind !== 'string' || typeof v.why !== 'string') return null;
  const src = typeof v.src === 'string' ? v.src : undefined;
  return { kind: v.kind, why: v.why, ...(src === undefined ? {} : { src }) };
};

/** 内联 base64 → `img://`（原 `Tn` 的落盘半）；失败 ⇒ **判别原因**（**不编造引用**） */
function saveInline(host: HostPort, dataUrl: string): MaterializeOutcome {
  const r = host.media.saveImageSync(dataUrl); // ⚠️ 同步 IPC，不得 await
  return r.ok ? { ok: true, ref: r.value } : { ok: false, why: 'save-failed', detail: r.message };
}

/**
 * 批量取图所需的**会话上下文**（原 `vP` 的 `t` = account —— 拿 `id` + `partition`）
 *
 * ⚠️ **不能省**：`partition` 是账号会话隔离键 ⇒ 主进程据此带上该账号 cookie
 *   （站点 CDN 的图**必须**靠它才取得到 —— 见 `MediaPort.fetchImages`）。缺它 ⇒ 如实计失败。
 */
export interface ScanFetchContext {
  accountId: string;
  partition?: string;
  referer?: string;
  /** 进度回调（原 `vP` 的 `p({phase:'working', …})`）—— 只上报，不写 store（原则 2） */
  onProgress?: (p: FetchImagesProgress) => void;
}

/**
 * 由**账号 + 站点 referer** 造批量取图上下文（原 `vP` 的实参：`t` = account · `referer`，`shared.js:34090`）
 *
 * ⚠️ `onPhase` 只把批量取图进度**转成** `working` 阶段消息（原 `vP` 的 `p({phase:'working', …})`）——
 *   本函数**不写 store**（原则 2）。
 * ⚠️ `partition` 为 `null`（未落会话）时**不传**（主进程退回默认会话），**不编造**空串。
 */
export function scanFetchContext(
  account: { id: string; partition: string | null },
  referer: string,
  onPhase?: (event: ScanPhaseEvent) => void,
): ScanFetchContext {
  return {
    accountId: account.id,
    ...(account.partition ? { partition: account.partition } : {}),
    referer,
    ...(onPhase
      ? {
          onProgress: (p: FetchImagesProgress) =>
            onPhase({ phase: 'working', message: GALLERY_TEXT.scanPhaseReceived(p.okCount) }),
        }
      : {}),
  };
}

/**
 * 把一批原始图落成本地引用（★ 远端图走**批量取图** `MediaPort.fetchImages`）
 *
 * 分流（原 `wp` 的取值半，`32493-32941`）：
 *   · 已是 `img://` ⇒ 原样（**幂等** —— 不会二次外置）
 *   · 内联 base64 ⇒ 直接落盘（原 `Tn`）
 *   · 远端 http(s) ⇒ **批量取图**（原 `vP` 33677；Lovart 侧对应 `Lc` 的 `e$` 档）
 *
 * ★★ **为什么远端图必须走 `fetchImages`**：它是 `session.fromPartition(partition).fetch`
 *    ⇒ **带上账号 cookie**；而 `imageFetchDataUrl` 是**裸 `fetch`（无 cookie）**
 *    ⇒ 站点 CDN 的图**取不到**（BP-34）。两档**不是同一个能力**，别混。
 *
 * ⚠️ **逐张失败就地留痕**（`log.warn`，读者 = 开发者）：`why` 是分类、第三参是**原文** ——
 *    ★ TD-16-48：此前只有 `failed++`，原因**全丢**（下载超时 / 非图片 / 宿主 IPC 失败不可分）。
 */
export async function materializeScannedImages(
  host: HostPort,
  raws: readonly unknown[],
  via: ScannedImage['via'],
  fetch?: ScanFetchContext,
): Promise<{ items: ScannedImage[]; failed: number; skipped: number }> {
  const items: ScannedImage[] = [];
  let failed = 0;
  let skipped = 0;
  /**
   * 逐张失败：计数 + 留痕（**唯一**的 `failed` 自增点 —— 避免"计数与明细两份真相"）
   * ⚠️ 不写 `url || '(无 url)'` / `detail ?? ''` 这类默认值（那会掩盖"这一项到底有没有值"）
   */
  const fail = (why: MaterializeFailWhy, url: string, detail?: unknown): void => {
    failed += 1;
    log.warn('[scan] 落盘失败:', { why, url, detail });
  };

  /**
   * ★ **内容去重**（原 `sm.isDuplicate`，`shared.js:25787`；源调用点 `wp:32508` / `wP:33799` / `NR:36081`）
   *
   * ⚠️ **状态范围 = 本次调用**（源 `h = sm(s)` 建在 `wp` **整轮**内）。本仓「一轮」≈「一档」：
   *   失败的档**早退且不落盘**，`summarizeScanAttempts` 只取首个 `ok` ⇒ **只有一档产出条目**。
   * ⚠️ **种子为空**：源 `h0`（`:36658`）的 `exact` 是「已有条目的哈希」—— 与**已有**条目的重复，
   *   本仓已由 `excludeSeenImages`（URL 级）＋ 落库方 `addLovartImages`（`dataUrl` 级）承担。
   *   这里补的是**同一轮内**的重复与**近重复**（感知哈希，汉明距离 ≤ `PHASH_DUPLICATE_DISTANCE`）。
   */
  const dedupe = createDedupe(emptyDedupeState(), { phash: perceptualHash });
  /** 命中重复 ⇒ 计入 `skipped` 并返回 `true`（调用方 `continue`，**不落盘**） */
  const isDup = async (src: string): Promise<boolean> => {
    const dup = await dedupe.isDuplicate(src);
    if (dup) skipped += 1;
    return dup;
  };

  /** 待批量取图的远端候选（原 `vP` 的 `j` 列表） */
  const pending: { url: string; scope: ScanScope; natW?: number; natH?: number }[] = [];

  // ① 逐元素收窄 + 分流（★ TD-16-50：不做 `as` 断言，逐层收窄）
  for (const raw of raws) {
    if (!isRecord(raw)) {
      fail('bad-element', '');
      continue;
    }
    const url = typeof raw.url === 'string' ? raw.url : '';
    if (!url) {
      fail('empty-url', '');
      continue;
    }
    // ★ TD-16-50：未知 scope **不静默归 `site`**（编造会静默改变「只留本画布」的过滤）
    const scope = asScope(raw.scope);
    if (!scope) {
      fail('unknown-scope', url, raw.scope);
      continue;
    }
    const natW = asSide(raw.natW);
    const natH = asSide(raw.natH);
    // ★ 候选**已带 `img://`**（如画布扫描的 DOM 那半已经落过盘）⇒ 原样采用，**不重复下载**
    if (typeof raw.ref === 'string' && isImgRef(raw.ref)) {
      // ★ 内容去重（原 `sm.isDuplicate`）—— `img://` 已落盘，去重省的是画廊条目
      if (await isDup(raw.ref)) continue;
      items.push({
        url,
        ref: raw.ref,
        scope,
        via,
        ...(natW === undefined ? {} : { natW }),
        ...(natH === undefined ? {} : { natH }),
      });
      continue;
    }
    // 内联 base64 ⇒ 直接落盘
    if (isInlineImage(url)) {
      // ★ 内容去重（原 `sm.isDuplicate`）—— **必须在 `saveInline` 之前**（否则重复图照样写一次盘）
      if (await isDup(url)) continue;
      const out = saveInline(host, url);
      if (out.ok) {
        items.push({
          url,
          ref: out.ref,
          scope,
          via,
          ...(natW === undefined ? {} : { natW }),
          ...(natH === undefined ? {} : { natH }),
        });
      } else {
        fail(out.why, url, out.detail);
      }
      continue;
    }
    // 远端 http(s) ⇒ 收进批量
    pending.push({
      url,
      scope,
      ...(natW === undefined ? {} : { natW }),
      ...(natH === undefined ? {} : { natH }),
    });
  }

  // ② 远端图：**一次批量取图**（原 `vP`；带账号 cookie + 进度）
  if (pending.length > 0) {
    if (!fetch) {
      // ⚠️ 没有会话上下文 ⇒ **不能**退回 `imageFetchDataUrl`（裸 fetch 无 cookie ⇒ 需登录态的图取不到）
      //    ⇒ 如实计失败，不静默用错的通道
      for (const p of pending) fail('fetch-failed', p.url, '缺少账号会话上下文（无法带 cookie 取图）');
    } else {
      const r = await host.media.fetchImages(
        {
          accountId: fetch.accountId,
          ...(fetch.partition === undefined ? {} : { partition: fetch.partition }),
          ...(fetch.referer === undefined ? {} : { referer: fetch.referer }),
          urls: pending.map((p) => p.url),
          limit: pending.length,
        },
        fetch.onProgress,
      );
      if (!r.ok) {
        // 整批失败 ⇒ 逐张如实计失败（原则 6：不静默）
        for (const p of pending) fail('fetch-failed', p.url, r.message);
      } else {
        const byUrl = new Map(r.value.items.map((it) => [it.sourceUrl, it]));
        for (const p of pending) {
          const it = byUrl.get(p.url);
          if (!it) {
            fail('fetch-failed', p.url, '批量取图未返回该图');
            continue;
          }
          // ⚠️ 拿回来的必须**真的是内联图**，否则不落
          if (!isInlineImage(it.dataUrl)) {
            fail('not-inline', p.url);
            continue;
          }
          const natW = asSide(it.natW) ?? p.natW;
          const natH = asSide(it.natH) ?? p.natH;
          // ★ **垃圾图过滤**（原 `Dc`，`shared.js:32625` 的 `if (!Dc(H,{minSide:a}))` 与 `:32681`
          //   的 `if (Dc(M,{minSide:a})) { P++; … }`）—— 取图后按「最大边 <96 ／ 无尺寸且 <2KB ／
          //   <4KB 且 <512」判（`core/rules/lovartGallery.isLovartJunk`），命中 ⇒ **不落盘、计 `skipped`**
          //   （源同法）。⚠️ 必须在 `saveInline` **之前** —— 否则垃圾图照样写一次盘。
          if (isLovartJunk({ natW: natW ?? 0, natH: natH ?? 0, sizeBytes: it.sizeBytes ?? 0 })) {
            skipped += 1;
            continue;
          }
          // ★ 内容去重（原 `sm.isDuplicate`）—— 同上，**先于 `saveInline`**；在 junk 之后（junk 是同步且更便宜）
          if (await isDup(it.dataUrl)) continue;
          const out = saveInline(host, it.dataUrl);
          if (!out.ok) {
            fail(out.why, p.url, out.detail);
            continue;
          }
          items.push({
            url: p.url,
            ref: out.ref,
            scope: p.scope,
            via,
            ...(natW === undefined ? {} : { natW }),
            ...(natH === undefined ? {} : { natH }),
          });
        }
        // 宿主报的**跳过**（占位图 / 站点杂图）计入 `skipped`（源 `vP` 的 `S++`）
        skipped += r.value.skipCount;
      }
    }
  }

  return { items, failed, skipped };
}

/** 归一 + 落盘的入参（原 `ScanOptions` 里与**取图**有关的那几项） */
export interface ScanAttemptOptions {
  /** 已在库 / 已取过的 url（原 `haveUrls` ＋ `seen`）—— **下载前**滤掉，省掉重复下载 */
  seenUrls?: readonly string[];
  /** ★ 批量取图的**会话上下文**（原 `vP` 的 account）—— 缺它 ⇒ 远端图取不到（如实计失败） */
  fetch?: ScanFetchContext;
}

/**
 * 把「一档的原始返回」归一成 `ScanAttempt` **并落盘**（**两档共用此一份**）
 *
 * `scanFrames` 的 `{items, href}` 与页内脚本的 `{images, href}` 形状不同 ⇒ 调用方把它们
 * **包装成脚本形状**（`{ok:true, images, href}`）再进来，两条路共用这一处。
 *
 * ★ **下载前过滤**（原 `wp:32588-32592` 的顺序：`Yh` → 已见 / 已在库过滤 → `slice(limit)` → **取图**）：
 *   源的页面脚本只采集 url，取图在编排里；本仓取图在本函数 ⇒ 过滤必须落在这里，
 *   否则"已在库的图"会被真真切切地重下一遍（值守每轮 / 手动每次）。
 */
export async function scanAttemptFromRaw(
  host: HostPort,
  via: ScanStrategy,
  raw: unknown,
  opts: ScanAttemptOptions = {},
): Promise<ScanAttempt> {
  if (!isRecord(raw)) return { via, ok: false, error: '通道返回空' };
  // ★ **TD-05-3**：用 `ok !== true` —— 漏 `ok` 或形状变了都**不能当成功**（否则 0 张会被读成"没扫到"）；
  //   照 `adapters/host/electron/api.ts:78` 的正写法。
  if (raw.ok !== true) {
    return { via, ok: false, error: typeof raw.error === 'string' ? raw.error : '通道返回失败' };
  }
  // ★ TD-16-50：`Array.isArray` 只保证"是数组" ⇒ **不做 `as` 断言**（元素形状在下面逐层收窄）
  const raws = Array.isArray(raw.images) ? raw.images : [];
  const unread: UnreadRoot[] = Array.isArray(raw.unread)
    ? raw.unread.map(toUnreadRoot).filter((u): u is UnreadRoot => u !== null)
    : [];
  // ★ 已在库的**不下载**（原 `wp` 的 `x = b.filter(...)`）
  const fresh = excludeSeenImages(raws, opts.seenUrls);
  const m = await materializeScannedImages(host, fresh.items, via, opts.fetch);
  // ★ 诊断（原 `hp` 的 `diag`）—— 页内脚本是**运行时数据** ⇒ 必须**收窄**（缺字段 ⇒ `null`，不补默认值）
  const diag = normalizeScanDiag(raw.diag);
  return {
    via,
    ok: true,
    count: m.items.length,
    items: m.items,
    href: typeof raw.href === 'string' ? raw.href : undefined,
    // 被"已见"滤掉的也算扫描阶段跳过（`ScanResult.skipped` 的语义＝重复 / 过小 / 占位）
    // ★ 加上宿主批量取图报的跳过（占位图 / 站点杂图，原 `vP` 的 `S++`）
    skipped: (typeof raw.skipped === 'number' ? raw.skipped : 0) + fresh.skipped + m.skipped,
    unread,
    failed: m.failed,
    ...(diag ? { diag } : {}),
  };
}
