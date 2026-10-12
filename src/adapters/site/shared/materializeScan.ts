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
 *   | `Lc(account, url)` | 取图 → `{ok, dataUrl}`。**活路径是「页内取图」**（`mp` 脚本在页面里把图转成 dataUrl，超时 `Vo`）；`chrome-cdp` 那档按 `docs/过程.md` C2 是**死代码**（`lovartChromeIsOpen` 恒 false） | `HostPort.media.imageFetchDataUrl(url)`（**主进程**下载转 base64 —— 端口注释就是为它写的，且不受跨源 canvas 污染影响） |
 *   | `Tn(dataUrl)` 29261 | 内联 base64 → `img://` | `HostPort.media.saveImageSync`（**同步 IPC**，不得 await） |
 *   | `wp.failed` | 逐张失败计数 | `ScannedImage` 落不出来 ⇒ `failed++`（本文件返回给调用方） |
 *
 * ⚠️ **不静默**（原则 6）：落不出来就计入 `failed` **并就地留痕**（`log.warn`，读者 = 开发者），
 *    不塞假值、不回落成原 URL —— 契约说 `ref` 是「已落盘」，那就只能是 `img://`
 *    （已经是 `img://` 的原样透传）。★ TD-16-48：此前**只留一个 `failed` 计数**，
 *    「下载超时 / 非图片 / 宿主 IPC 失败」三者**不可分**（无日志无痕迹）。
 * ⚠️ 这也是 `docs/过程.md` §5「Lovart / Tapnow 图库抓取无落点」里**能独立完成的那一半**：
 *    页面脚本与四阶段编排不在本文件（见 `materializeScannedImages` 的头注）。
 */

import type { HostPort } from '@/core/ports/host.port';
import type { ScannedImage, UnreadRoot } from '@/core/ports/site.port';
// ★ 扫描枚举的**运行时真源**在 `core/rules/scanChain.ts`（从端口迁出，TD-04-4）——
//   本文件只消费真源，**不自持副本**（同一真相抄两份 = 母体 M3 / TD-16-24）。
import { SCAN_SCOPES, type ScanScope, type ScanStrategy } from '@/core/rules/scanChain';
// ★ 已见过滤（原 `wp:32588`）—— **必须在下面取图之前**（源顺序：清洗 → 过滤 → 截断 → 取图）
import { excludeSeenImages } from '@/core/rules/scanClean';
import { log } from '@/lib/log';
import { isRecord } from '@/lib/object';
import { isImgRef, isInlineImage } from '@/stable/protocols/img';

/**
 * 逐张落盘 / 归一**失败的原因**（★ 判别值 —— 调用方据此留痕，不再"三者不可分"）
 *
 * | why | 产生处 | 含义 |
 * |---|---|---|
 * | `bad-element` | `materializeScannedImages` | 数组元素**不是对象**（页面脚本是运行时数据） |
 * | `empty-url` | 同上 | 元素没有 `url` |
 * | `unknown-scope` | 同上 | `scope` 不在 `SCAN_SCOPES` 里（**不静默归 `site`**，TD-16-50） |
 * | `fetch-failed` | `materializeOne` | `imageFetchDataUrl` 失败（原文进 `detail`） |
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
 * 单张：落成本地引用
 *   · 已是 `img://` ⇒ 原样（**幂等** —— 不会二次外置）
 *   · 内联 base64 ⇒ 直接落盘
 *   · 其余（远程 http(s) 等）⇒ 先下载成 dataUrl 再落盘（原 `Lc`）
 * @returns 判别联合 —— **落不出来时带 `why` + 原始 `detail`**（原则 6：不归一成 `null`）
 */
async function materializeOne(host: HostPort, url: string): Promise<MaterializeOutcome> {
  if (isImgRef(url)) return { ok: true, ref: url };
  if (isInlineImage(url)) return saveInline(host, url);
  const fetched = await host.media.imageFetchDataUrl(url);
  if (!fetched.ok) return { ok: false, why: 'fetch-failed', detail: fetched.message };
  // ⚠️ 拿回来的必须**真的是内联图**，否则不落
  if (typeof fetched.value !== 'string' || !isInlineImage(fetched.value)) {
    return { ok: false, why: 'not-inline' };
  }
  return saveInline(host, fetched.value);
}

/**
 * 把一批原始图落成本地引用
 *
 * ⚠️ **顺序执行**（不并发）：源 `wp` 有并发池 `qT`，但那是为「上百张 + 限流」设计的；
 *    本函数只服务**一次扫描**的几十张，顺序更简单、也更容易把失败逐张归因。
 *    （若将来确有吞吐需求，在**这里**加池即可 —— 调用方不用改。）
 * ⚠️ **逐张失败就地留痕**（`console.warn`，读者 = 开发者）：`why` 是分类、第三参是**原文** ——
 *    ★ TD-16-48：此前只有 `failed++`，原因**全丢**（下载超时 / 非图片 / 宿主 IPC 失败不可分）。
 */
export async function materializeScannedImages(
  host: HostPort,
  raws: readonly unknown[],
  via: ScannedImage['via'],
): Promise<{ items: ScannedImage[]; failed: number }> {
  const items: ScannedImage[] = [];
  let failed = 0;
  /**
   * 逐张失败：计数 + 留痕（**唯一**的 `failed` 自增点 —— 避免"计数与明细两份真相"）
   * ⚠️ 不写 `url || '(无 url)'` / `detail ?? ''` 这类默认值（那会掩盖"这一项到底有没有值"）
   */
  const fail = (why: MaterializeFailWhy, url: string, detail?: unknown): void => {
    failed += 1;
    log.warn('[scan] 落盘失败:', { why, url, detail });
  };

  for (const raw of raws) {
    // ★ TD-16-50：`Array.isArray` 只保证"是数组"，**不保证元素是对象** ⇒ 逐元素收窄
    if (!isRecord(raw)) {
      fail('bad-element', '');
      continue;
    }
    const url = typeof raw.url === 'string' ? raw.url : '';
    if (!url) {
      fail('empty-url', '');
      continue;
    }
    // ★ 候选**已带 `img://`**（如画布扫描的 DOM 那半已经落过盘）⇒ 原样采用，**不重复下载**
    //   （与 `materializeOne` 的幂等同一判据：`isImgRef`）
    const out =
      typeof raw.ref === 'string' && isImgRef(raw.ref)
        ? ({ ok: true, ref: raw.ref } as const)
        : await materializeOne(host, url);
    if (!out.ok) {
      fail(out.why, url, out.detail);
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
    items.push({
      url,
      ref: out.ref,
      scope,
      via,
      ...(natW === undefined ? {} : { natW }),
      ...(natH === undefined ? {} : { natH }),
    });
  }
  return { items, failed };
}

/** 归一 + 落盘的入参（原 `ScanOptions` 里与**取图**有关的那几项） */
export interface ScanAttemptOptions {
  /** 已在库 / 已取过的 url（原 `haveUrls` ＋ `seen`）—— **下载前**滤掉，省掉重复下载 */
  seenUrls?: readonly string[];
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
  const m = await materializeScannedImages(host, fresh.items, via);
  return {
    via,
    ok: true,
    count: m.items.length,
    items: m.items,
    href: typeof raw.href === 'string' ? raw.href : undefined,
    // 被"已见"滤掉的也算扫描阶段跳过（`ScanResult.skipped` 的语义＝重复 / 过小 / 占位）
    skipped: (typeof raw.skipped === 'number' ? raw.skipped : 0) + fresh.skipped,
    unread,
    failed: m.failed,
  };
}
