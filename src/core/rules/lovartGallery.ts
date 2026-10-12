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
/** 出处兜底（原 29274 的 `f.source || 'import'`） */
const DEFAULT_SOURCE = 'import';

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
 * 解析落盘的画廊 JSON（原 `ET` 26637-26649）
 * ⚠️ 与源一致：**空 / 坏数据 / 不是对象 ⇒ `{}`**（**不抛** —— 画廊丢了不该挡住启动）。
 * ⚠️ 数组也是 `'object'`（源版判据就是 `typeof === 'object'`）⇒ 会被返回；照抄。
 */
/**
 * ★ **`TD-07-3` 结清（2026-10-11，回源）**：本函数**当前 0 生产消费**（`grep` 全仓只有定义处与本文档行）。
 *   · 「坏数据 ⇒ `{}`」的兜底**逐字对源**（原 `ET` 26637 同形，见本文件 `:17` 的表）⇒ **不在此改**；
 *   · 它是否**删除 / 接线**归**死代码批**（`docs/14` §1.9 一类），不属"兜底不留痕"。
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
 *   （这也与宿主一致：`img-save-sync` 收的就是 dataUrl —— `electron/main.js:679`。）
 */

// ─────────────── 清理族（原 `purgeLovartGallery`/`purgeLovartJunk`/`purgeLovartByScope`）───────────────

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
 * ⚠️ 空条目 ⇒ **直接算垃圾**。⚠️ 源版**有 4 处调用方**（清理 + 三个筛选点）⇒ 是**共享谓词**，
 *   落在纯层可测；那三处将来直接复用。
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

/** `purgeLovartByScope` 的哨兵：**"不是 canvas 的都算"**（原 29397） */
export const LOVART_SCOPE_NOT_CANVAS = '!canvas';
const CANVAS_SCOPE = 'canvas';

/**
 * 这条图该不该被某个 scope 规则清掉（原 29395-29397）
 * ⚠️ 哨兵语义**容易读反**：`'!canvas'` 表示"**清掉所有非画布的**"（即**保留** canvas）。
 */
export function matchesLovartScope(
  item: Pick<LovartImage, 'scope'>,
  scope: string = LOVART_SCOPE_NOT_CANVAS,
): boolean {
  const own = item.scope || '';
  return scope === LOVART_SCOPE_NOT_CANVAS ? own !== CANVAS_SCOPE : own === scope;
}

/**
 * 按谓词批量清图（原 `purgeLovartJunk` 29346-29381 与 `purgeLovartByScope` 29382-29418 的**公共体**）
 *
 * ★ 这两个 action **结构逐字相同**（取键 → 逐键过滤 → 计数 → 有变化才落盘），只差一个谓词
 *   ⇒ 判据 C1 要求抽出公共体。
 *
 * 规则：① `accountId` 给了 ⇒ 只看那一个键，否则**遍历全部键**；② 每个键**不是数组/空数组 ⇒ 跳过**
 *   （⚠️ **空键留在原地**，不被删 —— 源版如此）；③ **该键有变化才写回**；④ **整体无变化 ⇒ 原引用**
 *   （源版 `return {}` = 不写状态、不落盘）。
 * @returns `removed` = 清掉的条数（源版的返回值就是它）
 */
export function purgeLovartImages(
  galleries: LovartGalleries,
  accountId: string | null | undefined,
  shouldDrop: (item: LovartImage) => boolean,
): { galleries: LovartGalleries; removed: number } {
  const next = { ...(galleries || {}) };
  const keys = accountId ? [accountId] : Object.keys(next);
  let removed = 0;
  let changed = false;

  for (const key of keys) {
    const list = next[key];
    if (!Array.isArray(list) || list.length === 0) continue;
    const kept = list.filter((item) => {
      const drop = shouldDrop(item);
      if (drop) removed += 1;
      return !drop;
    });
    if (kept.length !== list.length) {
      next[key] = kept;
      changed = true;
    }
  }

  return { galleries: changed ? next : galleries, removed };
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
    const d = n.data as Record<string, unknown>;
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
