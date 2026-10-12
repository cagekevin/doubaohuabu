/**
 * 会话分区（Electron `partition`）的**默认分区真源**
 *
 * ★ **2026-10-12（`TD-04-11` · 高息母体）建**：此前**同一语义有 5 处定义、3 套值** ——
 *
 * | 处 | 原写法 | 后果（建号时 `partition: null`） |
 * |---|---|---|
 * | `ui/panels/BackendView.tsx` 的 `partitionOf` | `account.partition \|\| persist:${account.type}` | ✅ 唯一 type-aware 的 |
 * | `core/rules/payload.ts` 的 `DEFAULT_PARTITION` | 写死 `'persist:doubao'` | 非豆包号的发送载荷**错标**成 doubao 会话 |
 * | `electron/main.js` `fp-net-diag` | 写死 `'persist:doubao'` | lovart 号的诊断**探的是别的会话**的出口 |
 * | `electron/main.js` `ensure-plain-session` · `ensure-lovart-container` | 写死 `'persist:lovart'` | 非 lovart 号**落到错的 session** |
 * | `electron/main.js` `ensure-fingerprint`（HTTP 层） | **无兜底** ＋ 失败只 `console.error` 却仍回 ok | `fromPartition(null)` ⇒ 头注入**静默跳过但报成功** |
 *
 * ⚠️ **源版同病（回源结论）**：源里那条 type-aware 的三目**只存在于渲染处**（本仓 `BackendView`
 *   的对位），后端三个 handler 是**继承代码** ⇒ 本函数把「**碰巧对**」变成「**必然对**」，
 *   **不改变任何已对路径的行为**（豆包号仍是 `persist:doubao`）。
 * ⚠️ `docs/11` §后端边界**允许改**后端默认值 —— 后端那几处已同步改成同一条规则（**并回写 `docs/05`**）。
 *
 * ⚠️ **后端不能 import 前端模块**（`electron/main.js` 是独立 JS）⇒ 那几处按探债段处方
 *   **就地内联同一条规则**（`acc.partition || \`persist:${acc.type}\``）—— 规则只有这一行，
 *   **不需要**（也不该）造一份共享函数。
 */

/** 账号类型 ⇒ 默认会话分区（源那条 type-aware 三目的**通用形态**：`persist:<type>`） */
export function defaultPartitionOf(type: string): string {
  return `persist:${type}`;
}