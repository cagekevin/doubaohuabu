/**
 * 「出新图」聚合（**纯函数**，★ 必测）—— 原 `_Component26.jsx` 的 `z`（100-130）+ 站点判定族
 *
 * ★★ **它是什么**：把 `lovartGalleries`（`{accountId: Item[]}`）**按账号聚合**成一条平铺列表，
 *    供「出新图」面板渲染。它**不改任何数据**，只做「挑账号 → 铺开 → 过滤 → 排序 → 截断」。
 *
 * ★ **为什么这一层必须纯**：源版这段是组件里的 `useMemo`（每次 `accounts`/`galleries` 变都重算）
 *    —— 本工程把它提成纯函数 ⇒ 可单测（源版那四个内联判定 `Ep`/`ho`/`Ud`/`x0` 与两条过滤规则
 *    在组件里**无法单独验证**）。
 *
 * 依据（**逐行回源** `shared.js:36693-36707` + `_Component26.jsx:100-130`）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `Ep` | 36693 | `type === 'lovart' || type === 'tapnow'` |
 *   | `ho` | 36696 | `type === 'lovart'` |
 *   | `Ud` | 36699 | `type === 'tapnow'` |
 *   | `tS` | 36702 | `type === 'other'` |
 *   | `x0` | 36705 | `Ep(e) || tS(e)`（= 可抓取的账号） |
 *   | `mo` | 36746 | `` `${_accId || ''}:${id}` ``（列表项的稳定键） |
 *
 * ⚠️ **一处如实标注（源版怪癖）**：源版对 **Tapnow** 账号在「只留本画布」下走
 *    `if (v && Ee.canvasId !== v) continue`（`v` = 当前画布 id）。但 `canvasId` **从未被写进画廊**
 *    —— 源版 `addLovartImages`（29267-29278）只写 10 个字段，**没有 `canvasId`**
 *    ⇒ 只要 `v` 非空，**所有 Tapnow 图都会被滤掉**。本实现**逐字照抄**该判据（测试锁住），
 *    并保留 `canvasId` 作为**可选**字段。
 * ⚠️ **这不是本仓缺写入方**：Tapnow 画布链（`scanCanvas` / `peekCanvas` / `tapnowCanvasNodes`）
 *    **已落**（`docs/plan/14:161`，2026-10-12）；源里同样**不把 `canvasId` 写进画廊条目**
 *    ⇒ 这条分支**源里即恒不生效**（源版怪癖，不是缺口）。
 */

import type { Account, SiteType } from '@/stable/model/account';
import type { LovartGalleries } from '@/core/rules/lovartGallery';
// ⚠️ 条目形状的**真源**在持久化契约层（`lovartGallery.ts` 只转发 `LovartImage`，不另定义）
import type { LovartGalleryImage } from '@/stable/contracts/lsValues';
import { NEW_IMAGES_FRESH_MS, NEW_IMAGES_LIMIT } from '@/constants';

/**
 * 站点判定（原 `Ep`）：是不是 Lovart / Tapnow（即「值得聚合」的账号）
 * ⚠️ 导出给面板判「抓取按钮该显示哪句话」（原 `De` 的四路三目）——
 *   只判**站点类型**，文案仍住 `NEW_IMAGES_TEXT`（`core` 不碰文案）。
 */
export function isAggregatableSite(account: Pick<Account, 'type'> | null | undefined): boolean {
  return !!account && (account.type === 'lovart' || account.type === 'tapnow');
}

/** 站点判定（原 `ho`） */
function isLovartSite(account: Pick<Account, 'type'> | null | undefined): boolean {
  return !!account && account.type === 'lovart';
}

/** 站点判定（原 `tS`）：`other`（自定义网站）—— 面板的抓取按钮据此显示「抓取本页图」 */
export function isOtherSite(account: Pick<Account, 'type'> | null | undefined): boolean {
  return !!account && account.type === 'other';
}

/** 站点判定（原 `Ud`） */
function isTapnowSite(account: Pick<Account, 'type'> | null | undefined): boolean {
  return !!account && account.type === 'tapnow';
}

/**
 * 站点判定（原 `x0`）：这个账号**能不能被抓取**（Lovart / Tapnow / 其它网站）
 *
 * ⚠️ 与源一致：`doubao` / `dola` / `gpt` **不在**聚合范围内（它们的页面里没有"图库"）。
 */
export function isFetchableSite(account: Pick<Account, 'type'> | null | undefined): boolean {
  return isAggregatableSite(account) || (!!account && account.type === 'other');
}

/**
 * 聚合后的一条（画廊条目 + 三个"归属"字段）
 *
 * ⚠️ `_accId` / `_accName` / `_accType` 是**源版 `z` 铺开时加的**（`_Component26.jsx:118-123`）
 *    —— 画廊条目本身**不知道自己属于哪个账号**（它在 `{accountId: []}` 的键上）。
 */
export interface NewImageItem extends LovartGalleryImage {
  _accId: string;
  _accName: string;
  _accType: SiteType;
  /** Tapnow 抓取可能带上的画布 id（⚠️ 本仓写入路径未落它 —— 见文件头「源版怪癖」） */
  canvasId?: string;
}

/** 列表项的稳定键（原 `mo` 36746）—— 用作 React key 与"已发送"集合的键 */
export function galleryItemKey(item: Pick<NewImageItem, 'id'> & { _accId?: string }): string {
  return `${item._accId || ''}:${item.id}`;
}

/**
 * 来源标签（原 `_Component26.jsx:642-644` 的三目）：Lovart → `L` · Tapnow → `T` · 其它 → `网`
 */
export function sourceTag(type: string | undefined): string {
  return type === 'lovart' ? 'L' : type === 'tapnow' ? 'T' : '网';
}

/**
 * 取来源 URL 的主机名（原 `nD` shared.js:36739）—— 解析失败 / 空 ⇒ **空串**（源版 `catch { return '' }`）
 *
 * ⚠️ 与源一致：只看 `new URL()` **成不成功** —— 相对路径 / 乱码 ⇒ 抛 ⇒ 空串（**不编造**）；
 *    而 `img://abc` 是**合法 URL**（scheme `img` + host `abc`）⇒ 会返回 `abc`（源版同）。
 */
export function hostnameFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * 「NEW」徽标判据（原 `_Component26.jsx:627`）：`addedAt >= now - 3600000`（1 小时内）
 *
 * ⚠️ 时钟**注入**（原则 4：`core` 不碰 `Date.now()`）。
 */
export function isFreshItem(
  item: Pick<LovartGalleryImage, 'addedAt'> | null | undefined,
  now: number,
): boolean {
  return (item?.addedAt || 0) >= now - NEW_IMAGES_FRESH_MS;
}

/** `aggregateNewImages` 的入参（原 `z` 闭包捕获的那几个值） */
export interface AggregateNewImagesOptions {
  /** 「只留本画布」（原 `m`） */
  currentOnly: boolean;
  /** 当前显示的账号（原 `e.id`；`null` ⇒ 无当前账号，「只留本画布」**不生效**） */
  activeAccountId?: string | null;
  /**
   * 当前 Tapnow 画布 id（原 `v`，来自 `Yl(account)` 读页面地址）
   *
   * ⚠️ 本仓**尚未读它**（那条链属抓取子系统）⇒ 调用方传 `null`；判据本身仍逐字保留（见文件头）。
   */
  currentCanvasId?: string | null;
  /** 截断上限（默认 `NEW_IMAGES_LIMIT` = 48；原 `JR`） */
  limit?: number;
}

/**
 * 把画廊按账号**聚合**成一条平铺列表（原 `_Component26.jsx:100-130` 的 `z`）
 *
 * 顺序（**顺序即语义**）：
 *   ① 只挑**可抓取**的账号（`x0`）
 *   ② 「只留本画布」且有当前账号 ⇒ 只留当前账号（`m && te && X.id !== te` ⇒ 跳过）
 *   ③ 「只留本画布」且有当前账号时，再按**站点类型**过滤该账号的图：
 *        · Lovart：`scope` 有值且不是 `'canvas'` ⇒ 跳过
 *        · Tapnow：`currentCanvasId` 非空且条目 `canvasId` 不等 ⇒ 跳过（见文件头「源版怪癖」）
 *   ④ 铺开时**附上归属**（`_accId`/`_accName`/`_accType`）
 *   ⑤ 按 `addedAt` **降序**排
 *   ⑥ 截断到 `limit`
 *
 * ⚠️ 与源一致：`currentOnly` 为真但**没有当前账号**时，②③ **都不生效**（源版 `m && te` 同款守卫）
 *    —— 即"没选中账号"时显示全部。
 */
export function aggregateNewImages(
  galleries: LovartGalleries,
  accounts: readonly Account[],
  opts: AggregateNewImagesOptions,
): NewImageItem[] {
  const { currentOnly, activeAccountId, currentCanvasId } = opts;
  const limit = opts.limit ?? NEW_IMAGES_LIMIT;
  const activeId = activeAccountId || '';
  const canvasId = currentCanvasId || '';

  const out: NewImageItem[] = [];
  for (const acc of accounts) {
    if (!isFetchableSite(acc)) continue;
    // ② 「只留本画布」+ 有当前账号 ⇒ 只留当前账号
    if (currentOnly && activeId && acc.id !== activeId) continue;

    const list = galleries?.[acc.id] ?? [];
    for (const img of list) {
      // ③ 站点相关的二次过滤（仅在「只留本画布」且有当前账号时生效）
      if (currentOnly && activeId) {
        if (isTapnowSite(acc)) {
          if (canvasId && (img as { canvasId?: string }).canvasId !== canvasId) continue;
        } else if (isLovartSite(acc) && img.scope && img.scope !== 'canvas') {
          continue;
        }
      }
      out.push({ ...img, _accId: acc.id, _accName: acc.name, _accType: acc.type });
    }
  }

  // ⑤ 新的在前（原 `(re.addedAt||0) - (X.addedAt||0)`）
  out.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  // ⑥ 截断
  return out.slice(0, limit);
}
