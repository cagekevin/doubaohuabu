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
 *   | `Lc(account, url)` | 取图 → `{ok, dataUrl}`。**活路径是「页内取图」**（`mp` 脚本在页面里把图转成 dataUrl，超时 `Vo`）；`chrome-cdp` 那档按 `docs/09` C2 是**死代码**（`lovartChromeIsOpen` 恒 false） | `HostPort.media.imageFetchDataUrl(url)`（**主进程**下载转 base64 —— 端口注释就是为它写的，且不受跨源 canvas 污染影响） |
 *   | `Tn(dataUrl)` 29261 | 内联 base64 → `img://` | `HostPort.media.saveImageSync`（**同步 IPC**，不得 await） |
 *   | `wp.failed` | 逐张失败计数 | `ScannedImage` 落不出来 ⇒ `failed++`（本文件返回给调用方） |
 *
 * ⚠️ **不静默**（原则 6）：落不出来就计入 `failed`，不塞假值、不回落成原 URL
 *    —— 契约说 `ref` 是「已落盘」，那就只能是 `img://`（已经是 `img://` 的原样透传）。
 * ⚠️ 这也是 `docs/14` §5「Lovart / Tapnow 图库抓取无落点」里**能独立完成的那一半**：
 *    页面脚本与四阶段编排不在本文件（见 `materializeScannedImages` 的头注）。
 */

import type { HostPort } from '@/core/ports/host.port';
import type { ScannedImage, UnreadRoot } from '@/core/ports/site.port';
// ★ **2026-10-11 收口**：扫描枚举的**运行时真源**在 `core/rules/scanChain.ts`（TD-04-4 从端口迁出）。
//   本文件原先自己抄了一份 `['canvas','panel','feed','site']`（**同一真相抄两份**，母体 M3 /
//   TD-16-24）—— 正是端口不该放运行时值所诱导出来的。现在只消费真源，不再自持副本。
import { SCAN_SCOPES, type ScanScope, type ScanStrategy } from '@/core/rules/scanChain';
import { isRecord } from '@/lib/object';
import { isImgRef, isInlineImage } from '@/stable/protocols/img';

/** 页面脚本扫出来的一条原始图（`{url, scope, natW, natH}` —— **没有** `ref`） */
interface RawScannedImage {
  url?: unknown;
  scope?: unknown;
  natW?: unknown;
  natH?: unknown;
}

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
}

const asScope = (v: unknown): ScanScope =>
  typeof v === 'string' && (SCAN_SCOPES as readonly string[]).includes(v) ? (v as ScanScope) : 'site';

const asSide = (v: unknown): number | undefined => (typeof v === 'number' && v > 0 ? v : undefined);

/** 内联 base64 → `img://`（原 `Tn` 的落盘半）；失败 ⇒ `null`（**不编造引用**） */
function saveInline(host: HostPort, dataUrl: string): string | null {
  const r = host.media.saveImageSync(dataUrl); // ⚠️ 同步 IPC，不得 await
  return r.ok ? r.value : null;
}

/**
 * 单张：落成本地引用
 *   · 已是 `img://` ⇒ 原样（**幂等** —— 不会二次外置）
 *   · 内联 base64 ⇒ 直接落盘
 *   · 其余（远程 http(s) 等）⇒ 先下载成 dataUrl 再落盘（原 `Lc`）
 * @returns `img://` 引用；**落不出来 ⇒ `null`**（调用方计入 `failed`）
 */
async function materializeOne(host: HostPort, url: string): Promise<string | null> {
  if (isImgRef(url)) return url;
  if (isInlineImage(url)) return saveInline(host, url);
  const fetched = await host.media.imageFetchDataUrl(url);
  // ⚠️ 拿回来的必须**真的是内联图**，否则不落（`imageFetchDataUrl` 失败会返 `null`）
  if (!fetched.ok || typeof fetched.value !== 'string' || !isInlineImage(fetched.value)) return null;
  return saveInline(host, fetched.value);
}

/**
 * 把一批原始图落成本地引用
 *
 * ⚠️ **顺序执行**（不并发）：源 `wp` 有并发池 `qT`，但那是为「上百张 + 限流」设计的；
 *    本函数只服务**一次扫描**的几十张，顺序更简单、也更容易把失败逐张归因。
 *    （若将来确有吞吐需求，在**这里**加池即可 —— 调用方不用改。）
 */
async function materializeScannedImages(
  host: HostPort,
  raws: readonly RawScannedImage[],
  via: ScanStrategy,
): Promise<{ items: ScannedImage[]; failed: number }> {
  const items: ScannedImage[] = [];
  let failed = 0;
  for (const raw of raws) {
    const url = typeof raw?.url === 'string' ? raw.url : '';
    if (!url) {
      failed += 1;
      continue;
    }
    const ref = await materializeOne(host, url);
    if (!ref) {
      failed += 1;
      continue;
    }
    const natW = asSide(raw.natW);
    const natH = asSide(raw.natH);
    items.push({
      url,
      ref,
      scope: asScope(raw.scope),
      via,
      ...(natW === undefined ? {} : { natW }),
      ...(natH === undefined ? {} : { natH }),
    });
  }
  return { items, failed };
}

/**
 * 把「一档的原始返回」归一成 `ScanAttempt` **并落盘**（原先两档各自一个同步 `normalizeAttempt`）
 *
 * `scanFrames` 的 `{items, href}` 与页内脚本的 `{images, href}` 形状不同 ⇒ 调用方把它们
 * **包装成脚本形状**（`{ok:true, images, href}`）再进来，两条路共用这一处。
 */
export async function scanAttemptFromRaw(
  host: HostPort,
  via: ScanStrategy,
  raw: unknown,
): Promise<ScanAttempt> {
  if (!isRecord(raw)) return { via, ok: false, error: '通道返回空' };
  // ★ **2026-10-11 收口（TD-05-3）**：原写 `raw.ok === false` —— **fail-open**：脚本漏 `ok`
  //   或换了形状时会被**当成成功**（0 张，"没扫到"）。统一为 `ok !== true`（照
  //   `adapters/host/electron/api.ts:78` 的本仓正写法）。
  if (raw.ok !== true) {
    return { via, ok: false, error: typeof raw.error === 'string' ? raw.error : '通道返回失败' };
  }
  const raws = Array.isArray(raw.images) ? (raw.images as RawScannedImage[]) : [];
  const unread: UnreadRoot[] = Array.isArray(raw.unread) ? (raw.unread as UnreadRoot[]) : [];
  const m = await materializeScannedImages(host, raws, via);
  return {
    via,
    ok: true,
    count: m.items.length,
    items: m.items,
    href: typeof raw.href === 'string' ? raw.href : undefined,
    skipped: typeof raw.skipped === 'number' ? raw.skipped : 0,
    unread,
    failed: m.failed,
  };
}
