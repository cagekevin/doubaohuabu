/**
 * 抓图入库用例（原 `wp` 32493-32941 的**编排半** —— 同形覆盖 `xp` / `NR`）
 *
 * ★ **它做什么**：把一个账号的**页面图**扫出来 → 映射成**画廊入参**（`LovartImageInput`）。
 *   「写库」不在这里（那是 `state` 的活，原则 1）—— 本函数只返回**结构化结果**。
 *
 * ★ **为什么这一层薄但必须存在**（原则 7 的边界）：
 *   ① 站点查找 + 「无适配器」的**明确报错**（不回落、不静默）
 *   ② 把 `ScannedImage[]` 映射成画廊入参（**命名 / 出处 / 字段兜底**是纯规则，可测）
 *   ⇒ 有了它，`state` 层就只是「调它 → 写 store」，不需要知道站点与形状。
 *
 * 依据（**逐行回源** `wp` 的取值半）：
 *   | 源 | 语义 | 本仓 |
 *   |---|---|---|
 *   | `wp({account, seen, haveUrls, haveHashes, light, minSide, limit, allowedScopes, skipNonCanvas, onStatus, onItem})` | 抓取编排 | `SitePort.scan(account, {onPhase})` |
 *   | `onItem(Je)` → `s(re.id, [Je])` | 每张即时入库 | **本函数不回调** —— 收集成 `items` 一次性返回（由 `state` 落库） |
 *   | `{added, failed, skipped}` | 计数 | `failed`/`skipped` 原样带出；`added` 由落库方（`addLovartImages`）给 |
 *
 * ⚠️ **两处如实标注（源里有、本仓暂缺）**：
 *   1. `ScanOptions` 的 `seenUrls` / `haveHashes` / `allowedScopes` / `skipNonCanvas` / `minSide` —— 本仓
 *      两个扫描适配器的脚本是**固定串**（不读这些选项，见 `docs/14` §5 的余项）⇒ **不传**（传也是空转、
 *      反而像已经支持）。**去重由落库方 `addLovartImages` 兜底**（按 `dataUrl` + `sourceUrl` 双去重）。
 *   2. `limit` / 并发池 `qT` —— 同上属扫描侧未落项。
 */

import type { Account } from '@/stable/model/account';
import type { ScanPhaseEvent, ScannedImage, SiteRegistry } from '@/core/ports/site.port';
import { err, ok, type Result } from '@/core/model/result';
import { SEND_TEXT } from '@/constants/text';
import {
  captureImageName,
  captureSource,
  type LovartImageInput,
} from '@/core/rules/lovartGallery';

/** 注入（`bootstrap/container.ts` 组装；本用例只收端口，**不碰 store**） */
export interface ScanGalleryDeps {
  sites: SiteRegistry;
}

export interface ScanGalleryOptions {
  /** 阶段回调（原 `onStatus`）—— **只上报**，写 store 是调用方的事（原则 2） */
  onPhase?: (event: ScanPhaseEvent) => void;
}

/** 一次抓取的结果（`added` 不在这里 —— 它要等落库方去重后才算得出） */
export interface ScanGalleryOutcome {
  items: LovartImageInput[];
  /** 扫描阶段跳过（重复 / 过小 / 占位图） */
  skipped: number;
  /** 逐张**落盘失败**（原 `wp.failed`） */
  failed: number;
  /** 读不到的 frame 数（原则 6：如实上报，不静默） */
  unread: number;
}

/**
 * 扫一个账号的页面图 → 画廊入参
 *
 * @returns `err` 的两种来源：**无站点适配器**（`SEND_TEXT.noSiteAdapter`）/ **适配器失败**（原样透传）
 */
export async function scanGallery(
  deps: ScanGalleryDeps,
  account: Account,
  opts: ScanGalleryOptions = {},
): Promise<Result<ScanGalleryOutcome>> {
  const site = deps.sites[account.type];
  // ⚠️ 站点适配器缺失 ⇒ **明确报错**（不把"没适配器"当成"页面上没有图"）
  if (!site) return err('unknown', SEND_TEXT.noSiteAdapter(account.type));

  const r = await site.scan(account, { ...(opts.onPhase ? { onPhase: opts.onPhase } : {}) });
  if (!r.ok) return r; // ★ 原样透传（原则 6）

  const v = r.value;
  return ok({
    items: v.items.map((it, i) => toGalleryInput(it, i)),
    skipped: v.skipped,
    failed: v.failed ?? 0,
    unread: v.unread?.length ?? 0,
  });
}

/** 扫到的一张 → 画廊入参（原 `wp` 里喂给 `onItem` 的那个对象） */
function toGalleryInput(it: ScannedImage, index: number): LovartImageInput {
  const natW = it.natW;
  const natH = it.natH;
  return {
    // ⚠️ `ref` 是**已落盘的 `img://`**（适配器侧落好 —— 见 `adapters/site/shared/materializeScan.ts`）
    //    ⇒ 交给 `addLovartImages` 时 `normalizeImage` 会**原样放行**（不会二次外置）
    dataUrl: it.ref || it.url,
    name: captureImageName(it.url, index),
    sourceUrl: it.url,
    source: captureSource(it.url),
    scope: it.scope,
    ...(natW === undefined ? {} : { natW }),
    ...(natH === undefined ? {} : { natH }),
  };
}
