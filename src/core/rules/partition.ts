/**
 * 会话分区（Electron `partition`）的**产生方** —— 全仓唯一
 *
 * ★ **谁产生它**：账号诞生的那一刻。分区是**账号自己的身份字段**（与 `id` 同级）——
 *   产生一次、终身不变 ⇒ 天然只有一个产生方 = `accountRoster.buildNewAccount`
 *   （`addAccount` 与 `buildPendingAccount` 共用它）。
 *
 * ★ **源形状**（`$P.jsx:31-35`，逐字）：
 *   ```js
 *   const [E] = useState(() => `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
 *   const j = `persist:${…类型…}_${E}`;
 *   ```
 *   ⇒ `persist:<type>_d_<base36 时间>_<base36 随机>`（后缀 = 账号级唯一）。
 *
 * ⚠️ **为什么不能有「缺省兜底」**：`persist:<type>`（无后缀）是**整个站点共用一个会话**
 *   ⇒ 多账号**串味**（cookie / 登录态互相覆盖）。曾经那条 `defaultPartitionOf` 正是这个错形态：
 *   它把「缺省」当成了「默认」，掩盖的其实是「产生方缺位」——
 *   登录弹窗 `<webview>` 拿不到分区就落到 Electron **默认会话**、后台 `<webview>` 落 `persist:doubao`、
 *   发送侧直读 `null` 直接报错 ⇒ **同一个账号落在 3 个不同会话上**。
 *   ⇒ 正解是**补产生方**（本文件 + `buildNewAccount`），而不是让每个消费方各兜一份。
 *
 * ⚠️ **纯函数**（原则 4）：时间与随机一律由调用方注入 —— 本文件不碰 `Date` / `Math.random`。
 *
 * ★ **本文件是「分区键长什么样」的唯一落点** —— 两种形状都住这里，一眼可见：
 *   · `newAccountPartition` —— 建号/登录（源 `$P.jsx:35`，`persist:<type>_d_<ts36>_<rand36>`）
 *   · `makeImportedPartition` —— 导入（源 `OP.jsx:636`，`persist:import_<id>`）
 *   ⚠️ 两种形状**不合并**（源就是两套，各自逐字）；它们只是**搬到了同一处**，
 *      免得"分区键有几种写法"要翻两个模块才答得出。
 */

import { IMPORTED_PARTITION_PREFIX } from '@/stable/contracts/schemas';

/**
 * 新账号的专属分区（源 `$P.jsx:35`）
 *
 * @param type 站点类型（**原样进键**，不做白名单/归一 —— 与源一致，未知类型也照进）
 * @param now  时间戳（ms）
 * @param rand `[0, 1)` 随机数（注入；调用方给 `Math.random()`）
 */
export function newAccountPartition(type: string, now: number, rand: number): string {
  return `persist:${type}_d_${now.toString(36)}_${rand.toString(36).slice(2, 7)}`;
}

/**
 * **导入时补的会话分区**（源 `OP.jsx:636` 的 `` `persist:import_${id}` ``）
 *
 * ⚠️ 2026-10-14 从 `core/rules/accountTransfer.ts` **搬到这里**（原处与 `newAccountPartition`
 *   各写一种分区形状 ⇒ "分区键长什么样"要翻两个模块才答得出）。**值一字未改**。
 * ⚠️ 只在导入的条目**没自带 `partition`** 时用它（`accountTransfer` 的 `rawPartition || …`）。
 * ⚠️ 前缀 `IMPORTED_PARTITION_PREFIX` 是**冻结契约**（`stable/contracts/schemas.ts`）——
 *    它会随账号数据落盘，老数据要能直接读 ⇒ **不许改成内联字面量**。
 */
export function makeImportedPartition(accountId: string): string {
  return `${IMPORTED_PARTITION_PREFIX}${accountId}`;
}
