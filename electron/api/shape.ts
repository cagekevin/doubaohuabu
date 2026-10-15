// ============================================================
// API 接入 · 形状收窄帮手（**全仓同一形状**，供后端 api/ 各文件共用）
// ------------------------------------------------------------
// 为什么单独一个文件：`asRecord` / `causeText` 这两个收窄点在 B2 会出现在 5 个 provider
// ＋ config-store ＋ job-manager ＋ bridge 里 —— 逐文件各写一份就是"同一形状 N 份"
// （本仓刚为 `transientErrorHints` 的 4 份重复付过代价，见 `providers/_shared.ts` 的头注）。
//
// ⛔ 本文件**只做形状收窄**，不含任何业务判断；⛔ 不导入 `electron`（保持可单测）。
// ============================================================

/**
 * 收窄到"可索引的记录"——**全仓唯一的收窄点**。
 * 用于「外部来的 JSON / IPC 回执」这类形状未知的值：之后一律走**逐字段 `typeof` 判定**，
 * ⛔ 不再用 `as SomeShape` 假装知道形状（那是本仓最贵的 bug 类）。
 */
function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** 失败原因的**原文**：`Error` 取 `message`，其余 `String` 化（全仓同一形状） */
function causeText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export { asRecord, causeText };
