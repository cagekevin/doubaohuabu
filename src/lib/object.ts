/**
 * 对象工具（★ 无状态，L0）
 *
 * ⚠️ **抽出的理由 = 判据 C1 三振出局**：`isRecord` 原先在
 *    `adapters/site/gpt/index.ts` · `adapters/site/tapnow/api.ts` · `adapters/site/tapnow/index.ts`
 *    **各写了一遍**（三处实现逐字相同）。第 3 次出现即必须抽出（`AGENTS.md` §四 原则 8）。
 *
 * ⚠️ 语义与三处原实现**逐字一致**：`!!v && typeof v === 'object' && !Array.isArray(v)`
 *    —— 即「非 null 的对象且不是数组」。`null` 不算对象，数组不算（数组另有 `Array.isArray`）。
 */

/** 是不是「普通对象」（类型谓词 —— 收窄由类型系统完成，不用 `as`） */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 安全取对象（非对象给空表 —— 免 `as`） */
export function asRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}
