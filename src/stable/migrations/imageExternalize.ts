/**
 * 迁移 1 · 图片外置（原 `mT` 26267-26302）
 *
 * 做什么：递归把工程数据里的 **base64 图片**换成 `img://` 引用
 * 为什么：docs/10 #37 —— **base64 全塞 JSON 是 localStorage 配额超限的根因**
 *
 * ⚠️ 幂等：已是 `img://` 的值不动；同 dataUrl 只落盘一次（靠 `saveImage` 的幂等）
 * ⚠️ 不可变：返回新结构，不改入参
 */

import type { NormalizeContext, MigrationOutcome } from './types';

/** 是不是内联图片 dataUrl */
export function isInlineImage(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/') && v.includes('base64,');
}

interface Stats {
  count: number;
  bytes: number;
  /** ★ 落盘失败的张数 + 原文（**不假装成功**） */
  failures: string[];
}

/**
 * 递归把内联 base64 图片换成 `img://` 引用
 *
 * ⚠️ 落盘失败时：**保留原内联值**（数据不丢 —— 用户的东西比 JSON 体积重要）
 *    并把失败**记进 `stats.failures`**（原则 6：不静默）。
 *    ⚠️ 这不是"兜底"：兜底是"悄悄回落"；这里是"回落 + **说出来**"。
 */
export function externalizeDeep(value: unknown, ctx: NormalizeContext, stats: Stats): unknown {
  if (isInlineImage(value)) {
    stats.count += 1;
    stats.bytes += value.length;
    const r = ctx.saveImage(value);
    if (r.ok) return r.value;
    stats.failures.push(r.message);
    return value; // 保持内联（数据不丢）
  }
  if (Array.isArray(value)) {
    return value.map((v) => externalizeDeep(v, ctx, stats));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = externalizeDeep(v, ctx, stats);
    return out;
  }
  return value;
}

/** 对工程数组跑图片外置（只动 `data`，其余字段原样保留） */
export function externalizeProjectImages<T extends { data?: unknown }>(
  projects: readonly T[],
  ctx: NormalizeContext,
): MigrationOutcome<T[]> {
  const stats: Stats = { count: 0, bytes: 0, failures: [] };
  const value = projects.map((p) => ({ ...p, data: externalizeDeep(p.data, ctx, stats) }) as T);
  const notes: string[] = [];
  const succeeded = stats.count - stats.failures.length;
  if (succeeded > 0) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    // 原实现日志：`[img-store] 图片外置迁移: X MB → Y MB`
    notes.push(`[img-store] 图片外置迁移: ${succeeded} 张 / ${mb(stats.bytes)} MB 已外置`);
  }
  return { value, changed: succeeded > 0, notes, failures: stats.failures };
}
