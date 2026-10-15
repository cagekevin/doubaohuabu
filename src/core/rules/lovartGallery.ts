/**
 * Lovart 画廊（**纯函数**，★ 必测）—— 原 `addLovartImages`(29243) / `removeLovartImages`(29296)
 * / `clearLovartGallery`(29315) / `ET`(26637)
 *
 * ★★ **它是什么**：每个账号一个**图片池**（`{accountId: Item[]}`），存"这个 Lovart 账号
 *   能看到/导入过的图"。它被三处使用：① **素材改名**会同步改池里同名条目（27571-27604）；
 *   ② **删账号**要清掉该账号的池（30248-30285）；③ 画廊 UI —— ★ **2026-10-11 更正（TD-07-5）**：
 *   **已落地**（`ui/panels/GalleryPanel.tsx` + `GalleryLightbox`）。
 *
 * ★ **为什么这一层必须纯**：三个 action 都在改 `{accountId: Item[]}` 这个映射（去重 / 追加 /
 *   按 id 删 / 清空），而 `set` 与落盘是 state 的事（原则 1）⇒ 这里只**返回新映射**。
 *   源版把它们写在 action 里（中间还夹着 `Zr(d)` 落盘）。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `parseLovartGalleries` | `ET` 26637 | `JSON.parse` ⇒ 是对象就返回，否则 `{}`（**坏数据不抛**） |
 *   | `addLovartImages` | 29243-29295 | 三重守卫 ⇒ **按 `dataUrl` 与 `sourceUrl` 双去重** ⇒ 追加 ⇒ 返回**新增条数** |
 *   | `removeLovartImages` | 29296-29314 | 按 **`id`** 过滤（入参是 id 列表，不是 url） |
 *   | `clearLovartGallery` | 29315-29328 | 把该账号的键置成 **`[]`**（**保留键**，不是删除） |
 *
 * ⚠️ **`Tn` 必须注入**（原 29261）：它会调 `window.api.saveImageSync` 把**远程图落成本地文件**
 *   ⇒ **不纯**（与 `addAccount` 的指纹生成器同法）。本模块把它作为 `normalizeImage` 入参。
 * ⚠️ **`Date.now()` 必须注入**（原 29277）⇒ 收 `now`。
 */

// ⚠️ 持久化形状的**真源**在 `stable/contracts`（本文件只做转发，不再自己定义一份）
import type { LovartGalleryImage, LovartGalleriesMap } from '@/stable/contracts/lsValues';
import { asRecord } from '@/lib/object';
import { capsOf, siteTypesWhere } from './siteCaps';

/**
 * 画廊里的一张图 —— ⚠️ **形状真源在 `stable/contracts/lsValues.ts`**（持久化契约那个层），
 *   这里只**转发导出**（本文件再定义一份 = 与落盘形状**同一件事的两份**）
 *   ⇒ 两处定义迟早漂（同 `原则5/ssot` 的判据）。命名沿用本模块的短名。
 */
export type LovartImage = LovartGalleryImage;

/** 加入画廊时的**入参**（字段都可选 —— 源版逐个给默认值） */
export interface LovartImageInput {
  id?: string;
  name?: string;
  dataUrl?: string;
  natW?: number;
  natH?: number;
  sizeBytes?: number;
  source?: string;
  sourceUrl?: string;
  scope?: string;
  addedAt?: number;
}

/** `accountId → 图片列表`（同样转发自契约层） */
export type LovartGalleries = LovartGalleriesMap;

/**
 * 名字兜底（原 29269 的 `f.name || 'Lovart 图'`）
 * ⚠️ 导出给 `canvas.addMaterialsBatch` 复用（原 `addMaterialsBatch` 29192 用的是**同一句**
 *   `n[j].name || 'Lovart 图'`）—— 判据 C1：同一字面量不写两份。
 */
export const LOVART_ITEM_DEFAULT_NAME = 'Lovart 图';
const DEFAULT_NAME = LOVART_ITEM_DEFAULT_NAME;
/**
 * 出处 `'import'` —— 源里**两处同一字面量**：`addLovartImages` 的兜底（原 29274 的
 *   `f.source || 'import'`）与画廊「导入图片」（原 `_Component23:320` 的 `source: 'import'`）
 *   ⇒ 导出复用（判据 C1）。
 */
export const LOVART_SOURCE_IMPORT = 'import';
const DEFAULT_SOURCE = LOVART_SOURCE_IMPORT;

// ─────────────── 站点能力（原 `OP.jsx:710-711`）───────────────

/**
 * **支持画廊的站点类型**（原 `OP.jsx:710` 的 `fe`）
 *
 * 它决定的是「账号行上那颗 📷 **出不出现**」—— 是**有/无**的判断，不是样式差异。
 *
 * ⚠️ **本仓此前丢了这条判据**（对所有账号都出 📷）⇒ 豆包账号也能打开那个面板，
 *   用户看到的就是「🎨 Tapnow 画廊 · 豆包01」。
 * ⚠️ 面板标题**不动**：源 `_Component23.jsx:417` 就是写死的 `🎨 Tapnow 画廊 · {名}`
 *    （本仓抄对了）—— 看着不合理的根因在**入口**，不在文案。
 */
export const GALLERY_SITES: readonly string[] = siteTypesWhere((c) => c.gallerySource !== null);

/** 该站点类型有没有画廊（原 `fe`） */
export function isGallerySite(type: string): boolean {
  return GALLERY_SITES.includes(type);
}

/**
 * 画廊的站点名（原 `OP.jsx:711` 的 `Te = type === 'tapnow' ? 'Tapnow' : 'Lovart'`）
 *
 * ⚠️ 只在 `isGallerySite` 为真时有意义 —— 调用方先过判据再用它（否则会得到「Lovart」这个默认档）。
 */
export function gallerySiteLabelOf(type: string): string {
  // ★ 判据看**画廊来源键**（能力表），不看账号类型字面量
  return capsOf(type).gallerySource === 'tapnow' ? 'Tapnow' : 'Lovart';
}

/** 抓来的图**命名**（原 `XT` 33039-33057）—— `wp` 32493-32941 逐张抓到时用它取名 */
export function captureImageName(url: string, index = 0): string {
  const fallback = `Lovart 生成图 ${index + 1}`;
  if (typeof url !== 'string' || !url) return fallback;
  if (/^blob:/i.test(url)) return fallback;
  if (/^data:/i.test(url)) return `Lovart 内联图 ${index + 1}`;
  try {
    const seg = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
      .replace(/[?#].*$/, '')
      .slice(0, 64);
    return seg && /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic)$/i.test(seg) ? seg : fallback;
  } catch {
    // ⚠️ 与源一致：解析不了（相对路径 / 乱码）⇒ 兜底名，**不抛**
    return fallback;
  }
}

/**
 * 抓来的图**出处标记**（原 `wp` 的 `M.kind === 'http' ? 'capture-page' : 'capture-blob'`）
 *
 * ⚠️ 源版的 `kind` 由**页面脚本**给出（`http` / `data` / `blob`）；本仓的采集脚本
 *    （`shared/scanScripts.ts` 的 `SCAN_SCRIPT`）**没带 `kind`** ⇒ 这里按 **URL 协议**等价划分
 *    （`blob:` / `data:` ⇒ `capture-blob`，其余 ⇒ `capture-page`）。两类下 `name` 的取值也与之同族。
 */
export function captureSource(url: string): string {
  return /^(blob|data):/i.test(url) ? 'capture-blob' : 'capture-page';
}

/**
 * **画布 API** 抓来的图的命名（原 `s0` 33669-33676）
 *
 * 规则（逐字）：取 url 末段、去掉 `?` 之后、**截前 8 个字符**；取不到就用 `index + 1` 顶上；
 * 有画布名 ⇒ `` `${画布名} · ${片段}` ``，没有 ⇒ `` `Tapnow 图 ${片段}` ``。
 *
 * ⚠️ 与 `captureImageName`（原 `XT`，页面扫描那条路）**不是同一套命名**：源里两条路各有一份
 *   （`XT` 用 URL 尾段的**完整文件名**；`s0` 用**前 8 字**并带画布名前缀）⇒ 照抄两份，不合并。
 */
export function captureCanvasImageName(url: string, canvasName: string, index = 0): string {
  const tail = String(url).split('/').pop() ?? '';
  const seg = (tail.split('?')[0] ?? '').slice(0, 8) || String(index + 1);
  return canvasName ? `${canvasName} · ${seg}` : `Tapnow 图 ${seg}`;
}

/**
 * 解析落盘的画廊 JSON（原 `ET` 26637-26649）
 * ⚠️ 与源一致：**空 / 坏数据 / 不是对象 ⇒ `{}`**（**不抛** —— 画廊丢了不该挡住启动）。
 * ⚠️ 数组也是 `'object'`（源版判据就是 `typeof === 'object'`）⇒ 会被返回；照抄。
 */
/**
 * ★ **`TD-07-3` 结清（2026-10-11，回源）**：本函数**当前 0 生产消费**（`grep` 全仓只有定义处与本文档行）。
 *   · 「坏数据 ⇒ `{}`」的兜底**逐字对源**（原 `ET` 26637 同形，见本文件 `:17` 的表）⇒ **不在此改**；
 *   · 它是否**删除 / 接线**归**死代码批**（`docs/过程.md` §1.9 一类），不属"兜底不留痕"。
 */
/**
 * 源 `ET` 26637 的**形状判据半**：「是对象才收，否则 `{}`」（**不抛** —— 画廊丢了不该挡住启动）
 *
 * ★ **2026-10-12（`TD-02-3`）由 `parseLovartGalleries` 拆出**：
 *   原 `ET` 是「**读原始串 → `JSON.parse` → 形状判定**」三合一；本仓的读取路径
 *   （`state/persistKeys` 的 `rw().read`）**已经做了 parse 且是三态**（`TD-06-1`）⇒
 *   原函数的 **parse 半与读层重复**（硬接＝双解析／绕过三态，故**删**）；
 *   而**判据半**此前**无任何消费者** ⇒ 盘上若是 `"null"` / `"[1,2]"` 这类**合法 JSON 但非对象**，
 *   会**漏进 store**（`readOrDefault` 的 ok 分支不做形状判定）⇒ 判据半抽成本函数并在 hydrate 接线。
 * ⚠️ 数组也是 `'object'`（源版判据就是 `typeof === 'object'`）⇒ 会被返回；照抄。
 */
export function ensureLovartGalleries(value: unknown): LovartGalleries {
  return value && typeof value === 'object' ? (value as LovartGalleries) : {};
}

/**
 * 往某账号的画廊里加图（原 `addLovartImages` 29243-29295）
 *
 * 三重守卫（**少一个就会写脏数据**）：
 *   ① 没有 `accountId` / 不是数组 / 空数组 ⇒ **返回 0 且不改任何东西**
 *   ② 每条：`!dataUrl` 跳过；**`sourceUrl` 已在池里** ⇒ 跳过（同一个远程图不重复导入）
 *   ③ 归一后（`normalizeImage`）**`dataUrl` 已在池里** ⇒ 跳过（同一张图不同地址也算重）
 *
 * ⚠️ 与源逐字一致的三处细节：
 *   · **两条去重集是"边遍历边加"的**（`l.add` / `c.add` 在循环内）⇒ **同一批里的重复也会被滤掉**；
 *   · **没新增 ⇒ 返回原引用**（源版 `return {}` 表示"状态不变"，这里用同一引用表达）；
 *   · `dataUrl` 存的是**归一后**的值（可能是 `img://`），而 `sourceUrl` 存原值。
 *
 * @param normalizeImage 原 `Tn`：把远程图落成本地引用（**不纯，注入**）
 * @returns `added` = 真正新增的条数（源版就是拿它当返回值的）
 */
export function addLovartImages(
  galleries: LovartGalleries,
  accountId: string,
  items: readonly LovartImageInput[],
  opts: { now: number; idFactory: () => string; normalizeImage: (dataUrl: string) => string },
): { galleries: LovartGalleries; added: number } {
  if (!accountId || !Array.isArray(items) || items.length === 0) {
    return { galleries, added: 0 };
  }

  const existing = galleries[accountId] ?? [];
  const seenData = new Set(existing.map((x) => x.dataUrl).filter(Boolean));
  const seenSource = new Set(existing.map((x) => x.sourceUrl).filter(Boolean));

  const addedItems: LovartImage[] = [];
  for (const f of items) {
    if (!f || !f.dataUrl) continue;
    if (f.sourceUrl && seenSource.has(f.sourceUrl)) continue;

    const normalized = opts.normalizeImage(f.dataUrl);
    // ⚠️ 归一后为空 ⇒ 整条丢弃（源版 `if (!!p && !l.has(p))`）
    if (!normalized || seenData.has(normalized)) continue;

    seenData.add(normalized);
    if (f.sourceUrl) seenSource.add(f.sourceUrl);
    addedItems.push({
      id: f.id || opts.idFactory(),
      name: f.name || DEFAULT_NAME,
      dataUrl: normalized,
      natW: f.natW || 0,
      natH: f.natH || 0,
      sizeBytes: f.sizeBytes || 0,
      source: f.source || DEFAULT_SOURCE,
      sourceUrl: f.sourceUrl || '',
      scope: f.scope || '',
      addedAt: f.addedAt || opts.now,
    });
  }

  // 没新增 ⇒ **原引用**（源版 `return {}` = 不写状态）
  if (addedItems.length === 0) return { galleries, added: 0 };

  return {
    galleries: { ...galleries, [accountId]: [...existing, ...addedItems] },
    added: addedItems.length,
  };
}

/**
 * 按 **`id`** 删图（原 `removeLovartImages` 29296-29314）
 * ⚠️ 入参是 **id 列表**（源版 `new Set(r)` 与 `u.id` 比对）—— **不是 url**。
 * ⚠️ 守卫与源一致：`accountId` 为空 / 不是数组 / 空数组 ⇒ **原样返回**。
 * ⚠️ 该账号**没有池**时也会写出一个空数组条目吗？—— 不会：`existing` 为空 ⇒ 过滤后仍是 `[]`，
 *   源版会照样写 `{...galleries, [accountId]: []}` ⇒ **凭空建键**。照抄（用测试锁住）。
 */
export function removeLovartImages(
  galleries: LovartGalleries,
  accountId: string,
  ids: readonly string[],
): { galleries: LovartGalleries } {
  if (!accountId || !Array.isArray(ids) || ids.length === 0) return { galleries };
  const existing = galleries[accountId] ?? [];
  const drop = new Set(ids);
  return { galleries: { ...galleries, [accountId]: existing.filter((x) => !drop.has(x.id)) } };
}

/**
 * 清空某账号的画廊（原 `clearLovartGallery` 29315-29328）
 * ⚠️ 与源一致：把键置成 **`[]`**（**保留键**）—— 不是 `delete`。
 *   两者在"这个账号有没有画廊"的判定上不同（`key in obj`），源版选了保留。
 * ⚠️ `accountId` 为空 ⇒ **原样返回**。
 */
export function clearLovartGallery(
  galleries: LovartGalleries,
  accountId: string,
): { galleries: LovartGalleries } {
  if (!accountId) return { galleries };
  return { galleries: { ...galleries, [accountId]: [] } };
}

/*
 * ★ **2026-10-11 删除 `shouldMaterializeImage`（回源纠错）**：
 *   原以为「该落盘的是**远程 http**」—— **恰好反了**。逐行回源：`Tn` 是
 *   `if (Kh(e) || !fp(e)) return e;`，其中 `Kh` = 「已是 `img://` 引用」（`qM = 'img://'`）、
 *   `fp` = 「是内联 base64 图片」⇒ 真判据是「**内联 base64 才落盘**」。
 *   正确实现已提为协议真源 `stable/protocols/img.ts` 的 **`isInlineImage`**（原 `fp`），
 *   由 `state/store.ts` 的 `normalizeImage` / `persistImage` 直接使用。
 *   （这也与宿主一致：`img-save-sync` 收的就是 dataUrl —— `electron/main.js`。）
 */

// ─────────────── 清理族（原 `purgeLovartGallery`；另两个源里 0 调用 ⇒ 有意不落）───────────────

/** 判定"图太小"的默认最小边长（原 `aa` 22630 的 `96`） */
export const LOVART_MIN_SIDE = 96;
const TINY_BYTES = 2048;
const SMALL_BYTES = 4096;
const SMALL_SIDE = 512;

/**
 * 这张图算不算"垃圾"（原 `Dc` 23537-23545）
 *
 * 三条**或**起来的判据（逐字对齐）：① 有尺寸但**最大边 < `minSide`**（默认 **96**）；
 * ② **没有尺寸**但文件 **>0 且 <2KB**；③ 文件 **>0 且 <4KB** **且** 最大边 **<512**。
 * ⚠️ 空条目 ⇒ **直接算垃圾**。★ **调用方**：源版 4 处（清理动作 + 三个筛选点
 *   `shared.js:32625/32681/34000`）⇒ 本仓已接进扫描落库链（`adapters/site/shared/materializeScan.ts`
 *   的远端取图段，`TD-16-141`）；清理族那两个 action（`purgeLovartJunk` / `purgeLovartByScope`）
 *   源里**同为 0 调用** ⇒ **有意不落**（落它 = 死代码 + 第二份清理逻辑，见 `TD-16-141`）。
 */
export function isLovartJunk(
  item: Pick<LovartImage, 'natW' | 'natH' | 'sizeBytes'> | null | undefined,
  minSide: number = LOVART_MIN_SIDE,
): boolean {
  if (!item) return true;
  const bytes = item.sizeBytes || 0;
  const side = Math.max(item.natW || 0, item.natH || 0);
  return (
    (side > 0 && side < minSide) ||
    (side === 0 && bytes > 0 && bytes < TINY_BYTES) ||
    (bytes > 0 && bytes < SMALL_BYTES && side < SMALL_SIDE)
  );
}

/**
 * **删掉**某账号的画廊条目（原 `purgeLovartGallery` 29329-29345）
 * ⚠️ 与 `clearLovartGallery` 是**两件不同的事**（源版两个都有）：那个把键置 `[]`（**保留键**），
 *   这个**`delete` 键**。⚠️ 与源一致：**键不存在 ⇒ 原样返回**（不无中生有 —— 与
 *   `removeLovartImages` 的"凭空建键"恰好相反，两处都照抄）。
 */
export function removeLovartAccount(
  galleries: LovartGalleries,
  accountId: string,
): { galleries: LovartGalleries } {
  if (!accountId || !galleries || !(accountId in galleries)) return { galleries };
  const next = { ...galleries };
  delete next[accountId];
  return { galleries: next };
}

/** 来自画布收藏的出处标记（原 `Ie` 350 的字面量） */
export const LOVART_SOURCE_CANVAS = 'canvas-bookmark';
/** 素材没有名字时的兜底（原 346 的 `'素材节点'`） */
const CANVAS_MATERIAL_FALLBACK = '素材节点';

/** 一条**已读好**的本地图片（原 `Pu` 的产物形状） */
export interface ImportedGalleryImage {
  /** 文件名（**已去扩展名** —— `lib/readDroppedFile.stripExtension`） */
  name: string;
  /** 内联 base64（读失败 ⇒ 空串 ⇒ 本条被丢） */
  dataUrl: string;
  natW: number;
  natH: number;
}

/** 「从磁盘导入」的默认名（原 `_Component23:316` 的 `|| 'Tapnow 图'`） */
const IMPORT_DEFAULT_NAME = 'Tapnow 图';

/**
 * 把**从磁盘读好的图片**转成画廊条目（原 `_Component23` 的 `he` 306-322 的 map 半）
 *
 * 过滤（源 `:312` 的 `.filter(Ve => Ve && Ve.dataUrl)`）：`dataUrl` 为空的**整条丢掉**；
 * 名字兜底 `'Tapnow 图'`；出处固定 `'import'`。
 * ⚠️ 与 `canvasMaterialBookmarks` 的差异是**有意的**（那个从**节点**取字段、名字取 `label || name`）
 *   —— 各自逐字对各自的源，**不合并**。
 */
export function importedGalleryItems(
  read: readonly ImportedGalleryImage[] | null | undefined,
): LovartImageInput[] {
  const out: LovartImageInput[] = [];
  for (const f of read || []) {
    if (!f || !f.dataUrl) continue;
    out.push({
      name: f.name || IMPORT_DEFAULT_NAME,
      dataUrl: f.dataUrl,
      natW: f.natW || 0,
      natH: f.natH || 0,
      source: LOVART_SOURCE_IMPORT,
    });
  }
  return out;
}

/**
 * 把**画布上选中的素材节点**转成画廊条目（原 `Ie` 337-352）
 *
 * 过滤（**三个条件都要满足**）：`selected` + `type === 'material'` + `data.dataUrl` 非空。
 * ⚠️ 与源一致：**不传 `sizeBytes`**（`addLovartImages` 会把缺的字段填 0）；
 *   `natW`/`natH` 缺省 **0**；名字取 `label || name || '素材节点'`。
 * ⚠️ 本函数**不判空**（选中 0 个就返回空数组）—— 那句提示由调用方发
 *   （原 `Ie` 341 的 toast 就在调用方）。
 */
export function canvasMaterialBookmarks(
  // ⚠️ 入参**故意放宽**成 `data?: unknown`：画布节点是 8 类联合，各族的 `data` 形状互不兼容
  //   ⇒ 在**内部**分支才是正解（在调用处写 `as` 又变成"看起来像在骗类型系统"）。
  nodes: readonly { selected?: boolean; type?: string; data?: unknown }[] | null | undefined,
): LovartImageInput[] {
  // ⚠️ 用 for-of 逐条挑（而不是 `map` + 类型谓词）：后者在"联合类型 + `null`"下要写
  //   `x is NonNullable<typeof x>` 这类绕口令，可读性反而差 —— 这里的挑法一目了然。
  const out: LovartImageInput[] = [];
  for (const n of nodes || []) {
    if (!n || !n.selected || n.type !== 'material' || !n.data) continue;
    // ⚠️ `n` 是**结构化最小视图**（不是 `CanvasNode`）⇒ `data` 是 `unknown`，走 `asRecord`
    const d = asRecord(n.data);
    if (!d.dataUrl) continue;
    const label = typeof d.label === 'string' ? d.label : '';
    const name = typeof d.name === 'string' ? d.name : '';
    out.push({
      name: label || name || CANVAS_MATERIAL_FALLBACK,
      dataUrl: String(d.dataUrl),
      natW: Number(d.natW) || 0,
      natH: Number(d.natH) || 0,
      source: LOVART_SOURCE_CANVAS,
    });
  }
  return out;
}
