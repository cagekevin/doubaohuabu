/**
 * 站点类型清单 —— ★ **唯一真源**（2026-10-14 从 `stable/model/account.ts` 搬来，**值一字未改**）
 *
 * ⚠️ **为什么必须住 L0**：`constants/text.ts` 的「选择账号类型」文案表（L0）**需要它**，
 *   而 **L0 不得依赖 L1（`stable`）** ⇒ 此前它住 `stable/model/account.ts`，L0 引不到，
 *   于是文案表只能**自己再抄一份站点清单**（`ACCOUNT_TYPE_PICKER_TEXT.cards[].type` 六个）。
 *   ⇒ 搬下来之后，文案表**没有位置**再抄一遍（它可以引本文件）。
 *
 * ⚠️ **搬家的半径 = 2 个文件**：所有既有 import（`@/stable/model/account`）**一律不变** ——
 *   那里改为**转发**本文件（同一份值，不是第二份）。
 *
 * ⚠️ 顺序**是语义**：源 `TP.jsx:17-60` 六张卡片的显示顺序就是它（「选择账号类型」弹窗按此渲染）。
 *
 * 原注释（`stable/model/account.ts`）：站点类型（原 `bT` 26399）。
 */
export const SITE_TYPES = ['doubao', 'dola', 'lovart', 'tapnow', 'gpt', 'other'] as const;

/** 站点类型（由清单派生 —— 清单只有一处，类型就不会漂） */
export type SiteType = (typeof SITE_TYPES)[number];
