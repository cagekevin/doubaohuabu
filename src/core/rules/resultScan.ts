/**
 * 生成结果轮询的**纯判定**（原 `DR`，`shared.js:36335-36553`）
 *
 * 依据（逐行回源）：
 *   - 去重键 = `Od`（**去签名参数**）—— `:36446` / `:36453` / `:36463`
 *   - **首轮只记基线、不产出** —— `:36444-36451`
 *   - 结束三档 —— `:36532-36541`（`settled` / `no-real-image` / `timeout`）
 *
 * ★ **为什么必须有基线**：扫描脚本（原 `Xk`，`:35949`）扫的是**整页所有 `<img>`**
 *   （只按 `minSide` 过滤）⇒ 首轮若直接产出，会把页面上**已有的旧图**全当成
 *   "本轮生成结果"推到节点上。
 * ★ **为什么去重键要去签名**：同一张图每次请求带的签名参数不同（`Od` 的 20+ 个参数名），
 *   拿原始 URL 当键 ⇒ **永远判不出重复** ⇒ 同一张图反复落节点。
 *
 * ⚠️ 三个阈值住 `constants`（SSOT）：静默 `ER` 9000 · 仅占位图 `jR` 180000 · 总超时 `_R` 600000。
 * ⚠️ 源三处判据都是**严格大于**（`z > ER` / `> jR` / `Date.now() - h > l`）—— 恰好等于不算。
 */

import { stripSignature } from '@/lib/url';
import { isRecord } from '@/lib/object';
import { hammingDistance } from '@/lib/hash';
import { NEAR_DUP_WINDOW, PHASH_DUPLICATE_DISTANCE, RECURRING_TABLE_KINDS, RECURRING_TABLE_MAX } from '@/constants/dedupe';
import {
  GEN_NO_REAL_IMAGE_MS,
  GEN_SCAN_DENY_URL_RE,
  GEN_SCAN_MAX_SIDE,
  GEN_SCAN_MIN_SIDE,
  GEN_SILENT_MS,
  GEN_TIMEOUT_MS,
} from '@/constants';
import type { ImggenDedupEntry, ImggenDedupTable } from '@/stable/contracts/lsValues';

/** 扫描项的最小形状（只要求有 `url` —— 真实项还带 `kind`/`w`/`h`，本模块原样透传） */
export interface ScannableScan {
  url: string;
}

/**
 * 扫描项 → **去重键**（原 `Od`，`:36307`）
 *
 * `blob:` / `data:` 原样返回（无签名可去）；解析失败也原样返回（源同法）。
 */
export function scanKeyOf(url: string): string {
  return stripSignature(url);
}

/**
 * 有效性滤网的入参形状（原 `RR` 的 `{url, w, h}`）
 *
 * ⚠️ `w`/`h` 可缺：源对**量不到尺寸**的项放行（`!n || !r || …` 两个子句都短路为真）。
 */
export interface ValidityScan {
  url: string;
  w?: number;
  h?: number;
}

/**
 * **有效性滤网**（原 `RR`，`:36323-36334`）
 *
 * 逐行对源的四道判据（任一不过 ⇒ 丢）：
 *   ① 必须 `http(s):`（**`data:` / `blob:` 也丢** —— 与 `scanKeyOf` 的"原样返回"不是一回事）
 *   ② 不能是 `.svg`
 *   ③ URL 不命中 `MR`（头像 / 表情 / 图标 / logo / 占位图…）
 *   ④ 尺寸：`min(w,h) >= Jk(220)` **且** `max(w,h) > 512`（量不到尺寸则跳过这条）
 *
 * ⚠️ ④ 的两个子句在源里都是 `!(…)`：`!(min < 220)` = `min >= 220`；`!(max <= 512)` = `max > 512`
 *    ⇒ **恰好 512 也算不合格**。
 */
export function isValidScan(item: ValidityScan | null | undefined): boolean {
  if (!item || !item.url) return false;
  const url = String(item.url);
  if (!/^https?:/i.test(url) || /\.svg(\?|$)/i.test(url) || GEN_SCAN_DENY_URL_RE.test(url)) return false;
  const w = Number(item.w) || 0;
  const h = Number(item.h) || 0;
  return (
    (!w || !h || !(Math.min(w, h) < GEN_SCAN_MIN_SIDE)) &&
    (!w || !h || !(Math.max(w, h) <= GEN_SCAN_MAX_SIDE))
  );
}

/**
 * 一批扫描项过有效性滤网（原 `DR` 的 `E.filter(RR)`，`:36441`）
 *
 * ★ **必须在记基线之前**：源先 `filter(RR)` 再 `map(O => O.url)` 记基线 ——
 *   否则被滤掉的项会**占住基线键**，同一张图以后出现也不会被当新图。
 */
export function filterValidScans<T extends ValidityScan>(items: readonly T[]): T[] {
  return items.filter(isValidScan);
}

/** 一批扫描项的去重键（**首轮基线**用它 —— 源 `j.forEach(O => c.add(Od(O)))`） */
export function stripScanKeys(items: readonly ScannableScan[]): string[] {
  return items.map((it) => scanKeyOf(it.url));
}

/** 一条"本轮新项"（原 `I` 的元素 + 它的键） */
export interface FreshScanItem<T> {
  /** ★ **原始扫描项**（不剥字段 —— `kind` 决定要不要走网络取回） */
  item: T;
  /** 去签名后的去重键 */
  key: string;
}

/**
 * 挑出**本轮新项**（原 `:36452-36455` 的 `j.filter(R => !c.has(R) && !u.has(R))`）
 *
 * - `c` = 基线（`stripScanKeys` 的产物 —— ★ **必须是已去签名的键，不是原始 URL**）
 * - `u` = 已处理过的键（含被后续判据跳过、不再重试的项）
 *
 * ⚠️ 保序（源是 `filter` ⇒ 保持页面顺序）。
 * ⚠️ **同一批里的重复不在这里去**（源也没有）—— 交给调用方累进 `processedKeys`。
 */
export function freshScannedItems<T extends ScannableScan>(
  items: readonly T[],
  baselineKeys: readonly string[],
  processedKeys: readonly string[],
): FreshScanItem<T>[] {
  const baseline = new Set(baselineKeys);
  const processed = new Set(processedKeys);
  const out: FreshScanItem<T>[] = [];
  for (const item of items) {
    const key = scanKeyOf(item.url);
    if (baseline.has(key) || processed.has(key)) continue;
    out.push({ item, key });
  }
  return out;
}

/** `decideScanEnd` 的输入（每个字段都对应源里的一个局部量） */
export interface ScanEndInput {
  /** 距**上一次处理到新图**的时间（源 `z = Date.now() - m`） */
  sinceLastProgressMs: number;
  /** 已**产出**的结果数（源 `w`）—— 占位图/抓取失败不算 */
  emitted: number;
  /** 是否见过占位图（源 `f`，由 `Nk` 置位） */
  sawPlaceholder: boolean;
  /** 距**基线建立**的时间（源 `Date.now() - h`） */
  sinceStartMs: number;
}

export type ScanEndReason = 'settled' | 'no-real-image' | 'timeout';

/**
 * 本轮要不要收工（原 `:36532-36541`）—— `null` = 继续轮询
 *
 * 顺序即优先级（源同序）：`settled` → `no-real-image` → `timeout`。
 * ⚠️ `no-real-image` 只认「**一张真图都没出**且**见过占位图**」——
 *   否则"还没出图"会被误报成"只有占位图"。
 */
export function decideScanEnd(input: ScanEndInput): ScanEndReason | null {
  if (input.emitted > 0 && input.sinceLastProgressMs > GEN_SILENT_MS) return 'settled';
  if (input.emitted === 0 && input.sawPlaceholder && input.sinceLastProgressMs > GEN_NO_REAL_IMAGE_MS) {
    return 'no-real-image';
  }
  if (input.sinceStartMs > GEN_TIMEOUT_MS) return 'timeout';
  return null;
}

// ─────────────────────── 出片近重复窗口（原 `wl`）───────────────────────

/**
 * 近重复窗口（原 `wl`，`:36288` + `DR` 的 `k` 里的判定 `:36390-36397`）
 *
 * 语义：**进程内**记住最近 `NEAR_DUP_WINDOW`(120) 个感知哈希；新哈希与其中任一个的
 * 汉明距离 `<= PHASH_DUPLICATE_DISTANCE`(8) ⇒ 判近重复。
 *
 * ★ **为什么它不是 `createDedupe`**：`createDedupe`（原 `sm`）是**素材抓取链**的去重器
 *   （入参带 `allowedScopes`/`haveHashes`，见 `core/rules/dedupe.ts` 头注）；本窗口是
 *   **出片链**的、跨 send 保留、只存感知哈希的那一份（源 `wl` 就是独立一个数组）。
 *   ⇒ 两件事，别合并。
 *
 * ⚠️ 状态**住调用方**（适配器模块级）—— 源 `wl` 也是模块级常量，只 `shift` 不重置。
 */
export interface NearDupWindow {
  /** 命中近重复 ⇒ `true`（**不记入窗口**）；否则记入并返回 `false`（原 `k` 的 `wl` 半） */
  check(phash: string): boolean;
}

export function createNearDupWindow(
  limit: number = NEAR_DUP_WINDOW,
  distance: number = PHASH_DUPLICATE_DISTANCE,
): NearDupWindow {
  const hashes: string[] = [];
  return {
    check(phash: string): boolean {
      if (!phash) return false;
      if (hashes.some((h) => hammingDistance(phash, h) <= distance)) return true;
      hashes.push(phash);
      if (hashes.length > limit) hashes.shift();
      return false;
    },
  };
}

// ─────────────────────── 跨会话去重表（原 `TR`/`PR`/`p0`）───────────────────────
//
// 源住 `localStorage`（键 `imggen_recurring_assets_v1`）：**同一 URL / 同一感知哈希
// 反复出现 ≥2 次** ⇒ 判为「固有素材」（页面自带的头像、推荐图、模板图…）⇒ 跳过。
// 表在**每次发送开始时读一次**、**结束时写一次**（源 `DR` 的 `TR()` `:36353` / `PR(p)` `:36367`）。

/** 桶名（源 `p0` 的 `t`） */
export type RecurringKind = (typeof RECURRING_TABLE_KINDS)[number];

/** 空表（源 `TR` 读失败 / 形状不对时的返回值） */
export function emptyRecurringTable(): ImggenDedupTable {
  return { urls: {}, hashes: {} };
}

/**
 * 形状守卫（源 `TR` 的 `t && typeof t == 'object' && t.urls && t.hashes`）
 *
 * ⚠️ **必须有**：`StoragePort.read` 只保证「JSON 解析成功」，不保证是我们的形状
 *   （旧版本 / 手改过的数据）。形状不对就**当空表**，否则 `countRecurringAsset` 会写坏它。
 */
export function isRecurringTable(value: unknown): value is ImggenDedupTable {
  return isRecord(value) && isRecord(value.urls) && isRecord(value.hashes);
}

/**
 * 记一次命中并返回**命中后的计数**（原 `p0`，`:36273-36285`）
 *
 * - `key` 为空 ⇒ 直接返回 0（源 `if (!n) …`）；
 * - **本轮已计过**（`seen` 里已有 `kind:key`）⇒ 返回**原计数、不重复加**
 *   —— `seen` 是整场轮询共用的一个集合（源 `d`，`:36351`），不是每轮一个；
 * - 否则计数 `+1`、`last = now`，并把 `kind:key` 记进 `seen`。
 *
 * ⚠️ **就地改表**（源同法）——调用方拿到的 `table` 就是要写回 localStorage 的那份。
 * ⚠️ `now` 由调用方给（原则 4：`core` 不碰 `Date.now()`）；源在这里用的是 `Date.now()`。
 */
export function countRecurringAsset(
  table: ImggenDedupTable,
  kind: RecurringKind,
  key: string,
  seen: Set<string>,
  now: number,
): number {
  if (!key) return 0;
  const mark = `${kind}:${key}`;
  if (seen.has(mark)) return table[kind][key]?.n ?? 0;
  seen.add(mark);
  const bucket = table[kind];
  const prev = bucket[key]?.n ?? 0;
  bucket[key] = { n: prev + 1, last: now };
  return prev + 1;
}

/**
 * 写回前裁剪（原 `PR` 的 `t` 函数，`:36251-36266`）
 *
 * 一个桶超过 `RECURRING_TABLE_MAX`(400) 条 ⇒ 按 `last` **升序**排、**只留后半**（丢掉较旧的一半）。
 * ⚠️ 判据是 **`>`**（源 `if (r.length <= $R) return n` ⇒ 恰好 400 不裁）。
 * ⚠️ **就地改表**（源是造新对象再赋值 —— 可观察结果相同）。
 */
export function pruneRecurringAssets(table: ImggenDedupTable): void {
  for (const kind of RECURRING_TABLE_KINDS) {
    const bucket = table[kind];
    const keys = Object.keys(bucket);
    if (keys.length <= RECURRING_TABLE_MAX) continue;
    keys.sort((a, b) => (bucket[a]?.last ?? 0) - (bucket[b]?.last ?? 0));
    const kept: Record<string, ImggenDedupEntry> = {};
    for (const k of keys.slice(Math.floor(keys.length / 2))) {
      kept[k] = bucket[k] as ImggenDedupEntry;
    }
    table[kind] = kept;
  }
}
