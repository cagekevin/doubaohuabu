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
 *   | `wp({account, seen, haveUrls, haveHashes, light, minSide, limit, allowedScopes, skipNonCanvas, onStatus, onItem})` | 抓取编排 | `SitePort.scan(account, {onPhase, seenUrls})` ＋ 本函数的 `limit`（`seenHashes`/`allowedScopes`/`skipNonCanvas` 无落点，见端口注释） |
 *   | `onItem(Je)` → `s(re.id, [Je])` | 每张即时入库 | **本函数不回调** —— 收集成 `items` 一次性返回（由 `state` 落库） |
 *   | `{added, failed, skipped}` | 计数 | `failed`/`skipped` 原样带出；`added` 由落库方（`addLovartImages`）给 |
 *
 * ★ **两轮扫描侧清洗（源如此，本仓照落）**：
 *   ① **页内脚本侧**（`scanScripts.ts` 的 `buildLibraryScanScript`，原 `hp`）：打 scope 标签 ·
 *      画布内 `<140px` 丢弃 · 丢 `.svg` · 同 url 去重；
 *   ② **JS 侧**（`core/rules/scanClean.ts`，原 `Yh` `:23439`）：scope 白名单（默认只留 `canvas`）·
 *      尺寸下限 · URL 清洗（`Ad`/`YM`/`Id`/`Iy`）· 按规范化 url **打分择优**。
 *
 * ⚠️ **如实标注一处差异**：源 `Yh` 跑在**取图落盘之前**（`dk` 只采集 url，`Lc` 才取图）；本仓的落盘
 *   在适配器内部（`materializeScan.ts`）⇒ 清洗是**其后**的一步 ⇒ 被滤掉的图**已经落过盘**。
 *   用户可见结果一致（入库的是同一批图），只是多占了几张本地文件。
 *
 * ⚠️ **`qT`（取图并发池）刻意不落**：源用它限流「上百张」的批量；本仓 `materializeScan` 顺序取图，
 *   且 `limit` 已把每轮压到 6~20 张（裁定见该文件头注）。
 *
 * ★ **去重有两层（源如此，本仓照落）**：
 *   ① **内容去重**（事后）：源的 `sm`（`isDuplicate`）由 `h0`（`:36658`）喂参，而 `h0` 的 **`phash`
 *      恒为空** ⇒ 源实际只用精确哈希；本仓 `addLovartImages` 按 `dataUrl`（= `img://<hash>.ext`）
 *      去重**几乎等价**。
 *   ② **已在库过滤**（**下载前**，原 `wp:32588-32591`）：`opts.seenUrls` 交适配器，由
 *      `excludeSeenImages`（`core/rules/scanClean.ts`）在落盘之前滤掉 —— 少了它，值守每轮 /
 *      手动每次都会把**已在库的图重下一遍**（那时只剩事后去重，下载已经发生）。
 */

import type { Account } from '@/stable/model/account';
import type {
  ScanPhaseEvent,
  ScanResult,
  ScannedImage,
  SitePort,
  SiteRegistry,
} from '@/core/ports/site.port';
import { err, ok, type Result } from '@/core/model/result';
import { CANVAS_EXPORT_TEXT, NEW_IMAGES_TEXT, SEND_TEXT } from '@/constants/text';
import { log } from '@/lib/log';
import {
  captureCanvasImageName,
  captureImageName,
  captureSource,
  type LovartImageInput,
} from '@/core/rules/lovartGallery';
import { cleanScannedImages } from '@/core/rules/scanClean';

/** 注入（`bootstrap/container.ts` 组装；本用例只收端口，**不碰 store**） */
export interface ScanGalleryDeps {
  sites: SiteRegistry;
}

/**
 * 抓取互斥闩（原 `Xa`；Tapnow 侧源另有同形的 `Xl`）—— **刻意的模块级状态**
 *
 * ⚠️ 与 `usecases/sendQueue.ts` 的 `batchRunning`（原 `ec`）同族：**不是业务状态**（不进 store），
 *   而是「同一进程同时只允许一次抓取」的进程级闩 —— 源版就是模块级 `let Xa = false`（`:32419`）。
 *   为什么必须有：手动「立即抓取」与**自动值守**是**两条独立触发路径**（值守走 `ClockPort`），
 *   没有闩就会在**同一个 `<webview>` 上并发跑两份页内脚本 + 两份逐张取图**（源正是不允许）。
 * ⚠️ 测试复用 worker（`vite.config.ts` 的 `test.isolate:false`）⇒ 任何路径都必须放闩。
 */
let capturing = false;

/** 是否正在抓取（原 `Jy` / `o0`）—— 手动入口据此提示、值守据此顺延本轮 */
export function isScanGalleryRunning(): boolean {
  return capturing;
}

/**
 * 一次抓取的候选上限（源 `wp` 的 `FT`，`shared.js:32415`）—— 源 `x.slice(0, l)`（`:32592`）
 * ⚠️ 与 `skipped` 不是一回事：**截断不是"跳过"**（源也不计入），它只是"这轮不处理"。
 */
export const SCAN_GALLERY_DEFAULT_LIMIT = 12;

/**
 * **画布扫描**的候选上限（源 `bP`，`:34155`，= 60）
 * ⚠️ 与 `SCAN_GALLERY_DEFAULT_LIMIT`（页面那半的 12）**不是一回事** —— 两个调用方各传各的。
 */
export const SCAN_CANVAS_GALLERY_LIMIT = 60;
/** 手动抓图的上限（源调用方 `_Component26.jsx:364` 传的 `limit: 20`） */
export const SCAN_GALLERY_MANUAL_LIMIT = 20;
/** 自动值守每轮的上限（源 `m0`，`shared.js:36677`；调用方 `_Component26.jsx:527` 用它） */
export const SCAN_GALLERY_AUTO_LIMIT = 6;

export interface ScanGalleryOptions {
  /** 阶段回调（原 `onStatus`）—— **只上报**，写 store 是调用方的事（原则 2） */
  onPhase?: (event: ScanPhaseEvent) => void;
  /**
   * 候选上限（原 `wp.limit`）—— 缺省 `SCAN_GALLERY_DEFAULT_LIMIT`（12）
   * ⚠️ 源里这是**调用方给的**：手动抓图 20（`_Component26.jsx:364`）/ 自动值守 6（`:527`）。
   */
  limit?: number;
  /**
   * 已在库 / 已取过的 url（原 `wp` 的 `haveUrls` ＋ `seen`）—— 交适配器**在取图之前**滤掉
   * （原 `wp:32588-32591`）。⚠️ 页面脚本不读它：它省的是**下载**，不是采集。
   */
  seenUrls?: readonly string[];
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
 * @returns `err` 的三种来源：**无站点适配器**（`SEND_TEXT.noSiteAdapter`）/ **正在抓取**（`busy`）/
 *   **适配器失败**（原样透传）
 */
export async function scanGallery(
  deps: ScanGalleryDeps,
  account: Account,
  opts: ScanGalleryOptions = {},
): Promise<Result<ScanGalleryOutcome>> {
  const site = deps.sites[account.type];
  // ⚠️ 站点适配器缺失 ⇒ **明确报错**（不把"没适配器"当成"页面上没有图"）
  if (!site) return err('unknown', SEND_TEXT.noSiteAdapter(account.type));

  // ★ **抓取互斥**（原 `wp:32531-32538`）：闩被占 ⇒ 明确 `busy`（源 `error:'busy'` + 那句 message）
  if (capturing) return err('busy', NEW_IMAGES_TEXT.busy);
  capturing = true;
  try {
    const r = await site.scan(account, {
      ...(opts.onPhase ? { onPhase: opts.onPhase } : {}),
      // ★ 交下去让适配器**在取图之前**滤（原 `wp:32588-32591` 的 `x`）—— 它省的是下载
      ...(opts.seenUrls ? { seenUrls: opts.seenUrls } : {}),
    });
    if (!r.ok) return r; // ★ 原样透传（原则 6）

    const v = r.value;
    // ★ JS 侧清洗（原 `Yh`）：scope 白名单 + 尺寸下限 + URL 清洗 + 择优
    const cleaned = cleanScannedImages(v.items);
    // 原 `wp`：`Yh` → url 过滤 → **`slice(0, limit)`**（`:32592`）—— 顺序即语义
    const limit = typeof opts.limit === 'number' ? opts.limit : SCAN_GALLERY_DEFAULT_LIMIT;
    const limited = cleaned.items.slice(0, limit);
    const items = limited.map((it, i) => toGalleryInput(it, i));
    // ★ **canvas 渲染页面的兜底**（原 `wp:32610-32651`）—— 见 `tryExportCanvas`
    const snapshot = await tryExportCanvas(site, account, v, items.length, opts.onPhase);
    if (snapshot) items.push(snapshot);
    return ok({
      items,
      // 被清洗掉的计入 `skipped`（`ScanResult.skipped` 的语义就是"扫描阶段跳过"）；
      // ⚠️ 被 `limit` 截断的**不计入**（源也不计 —— 那不是"跳过"，是"这轮不处理"）
      skipped: v.skipped + cleaned.skipped,
      failed: v.failed ?? 0,
      unread: v.unread?.length ?? 0,
    });
  } finally {
    // ★ **任何路径都要放闩**（源 `:32939` 的 `finally`）—— 留住闩会让**后续所有抓取**都变 `busy`
    capturing = false;
  }
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

/**
 * ★ **canvas 渲染页面的兜底**（原 `wp:32610-32651`）—— 一张新图都没扫到时，把画布导成一张图入库
 *
 * 三段门（**顺序即语义**）：
 *   ① 站点声明了 `exportCanvas`（**能力位**：`lovart` 声明、`tapnow` 没有）
 *   ② **本轮新图 = 0**（源 `k.length === 0`）
 *   ③ 适配器判的那两档（页面类型 = 画布页 ∧ 诊断里有 ≥200px 的画布）—— **站点专属，不在这里写**
 *
 * ⚠️ 失败**不中止**抓取（源把它整段包在 `try{}catch{}` 里）—— 但**留痕不吞**（原则 6）：
 *    开发者看 `log.warn`；用户已经看过适配器发的「没扫到图片（诊断）」。
 * ⚠️ 成功的那张**不参与 `limit` 截断**（源是提前 return；本仓在截断之后追加 —— 同一结果）。
 * ⚠️ **不发源的「正在导出画布…」**（`:32616`）：那句话在源里发在**门之后**，而本仓的门在适配器里
 *    ⇒ 调用前不知道会不会真的导，发了就会在**非画布页上撒谎**。改为成功后再报（见下）。
 * ⚠️ **这里不重做内容去重**：本仓的逐张内容去重（原 `sm.isDuplicate`）已落在**适配器的落盘处**
 *    （`adapters/site/shared/materializeScan.ts`）；而画布快照是**单个条目**、且在适配器那道**之后**追加
 *    ⇒ 在此再判一次就是**第二份去重**（判据 C1）。与**库内已有**条目的重复，仍由落库方
 *    `addLovartImages`（`dataUrl` 级）兜住。
 */
async function tryExportCanvas(
  site: SitePort,
  account: Account,
  scan: ScanResult,
  found: number,
  onPhase: ((event: ScanPhaseEvent) => void) | undefined,
): Promise<LovartImageInput | null> {
  const exportCanvas = site.exportCanvas;
  if (!exportCanvas || found > 0) return null;
  const r = await exportCanvas(account, 0, {
    ...(scan.href ? { href: scan.href } : {}),
    ...(scan.diag ? { diag: scan.diag } : {}),
  });
  if (!r.ok) {
    log.warn('[scanGallery] 画布导出失败：', r.message);
    return null;
  }
  // 门不过 ⇒ **正常**（不是失败）：静默返回，由适配器那句「没扫到图片（诊断）」交代
  if (r.value.kind !== 'snapshot') return null;
  onPhase?.({ phase: 'done', message: CANVAS_EXPORT_TEXT.done });
  return {
    dataUrl: r.value.ref,
    name: CANVAS_EXPORT_TEXT.name(1),
    sourceUrl: '',
    source: 'canvas',
    scope: 'canvas',
    natW: r.value.natW,
    natH: r.value.natH,
  };
}

/**
 * 扫**当前画布**（站点接口）→ 画廊入参（原 `wP` 33842-33871 的画布半）
 *
 * ★ 与 `scanGallery` 是**兄弟编排**（源里 `wp` 与 `wP` 也是两条独立函数）：
 *   同一把**抓取互斥闩**、同一份「已在库过滤」、同一个落库口（`addLovartImages`）——
 *   差别只在**取图通道**（页面 DOM vs 站点接口）。
 *
 * @returns `err` 的来源：无适配器 / 站点没有该能力 / 正在抓取（`busy`）/ 适配器失败（原样透传）
 */
export async function scanCanvasGallery(
  deps: ScanGalleryDeps,
  account: Account,
  opts: ScanGalleryOptions = {},
): Promise<Result<ScanGalleryOutcome>> {
  const site = deps.sites[account.type];
  if (!site) return err('unknown', SEND_TEXT.noSiteAdapter(account.type));

  const scanCanvas = site.scanCanvas;
  // ⚠️ 站点没有这条链 ⇒ **明确报错**（不回落 DOM 扫描：源里 `wp`/`wP` 是两条独立函数）
  if (!scanCanvas) return err('unknown', SEND_TEXT.noCapability(account.type, '扫描画布'));

  // ★ 与 `scanGallery` **共用同一把闩**（原 `Xl` 就管 tapnow 这半边：`xp` 与画廊扫描都走它）
  if (capturing) return err('busy', NEW_IMAGES_TEXT.busy);
  capturing = true;
  try {
    const r = await scanCanvas(account, {
      ...(opts.onPhase ? { onPhase: opts.onPhase } : {}),
      ...(opts.seenUrls ? { seenUrls: opts.seenUrls } : {}),
      // ★ 上限**交下去**（源 `wP` 的 `v.slice(0, o)` 在**取图之前** —— 与页面那半不同，那里截断在用例侧）
      limit: typeof opts.limit === 'number' ? opts.limit : SCAN_CANVAS_GALLERY_LIMIT,
    });
    if (!r.ok) return r; // ★ 原样透传（原则 6）

    const v = r.value;
    // ⚠️ 这里**不再**做 `cleanScannedImages` + `slice(limit)`：源 `wP` 的画布半也没有这一步
    //   （它的候选来自 **API**，不是页面 DOM ⇒ 没有"广告/图标/缩略图"那一堆噪声）。
    //   命名/出处走**另一套**（原 `s0` / `'tapnow-api'`）—— 源里两条路各有一份，不合并。
    return ok({
      items: v.items.map((it, i) => ({
        ...toGalleryInput(it, i),
        name: captureCanvasImageName(it.url, '', i),
        source: 'tapnow-api',
      })),
      skipped: v.skipped,
      failed: v.failed ?? 0,
      unread: 0,
    });
  } finally {
    capturing = false;
  }
}
