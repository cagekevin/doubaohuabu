/**
 * 跨账号指纹关联扫描（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：
 *   - `Jl` shared.js:34253-34294 —— 7 个指纹维度
 *   - `zk` shared.js:34296-34336 —— 两两比较 + 分级
 *
 * 做什么：找出**指纹重合**的账号对（同一台机器开多个号 ⇒ 平台可关联）
 *   - 全部 7 维相同 → `critical`（🔴 完全关联）
 *   - ≥ 70% 相同 → `warn`（🟡 高度相似）
 *   - 其它 → 不报
 *
 * ⚠️ 归属（审计 B3）：这是**纯规则**，不该埋在 UI 里 ⇒ `core/rules/fingerprint.ts`
 * ⚠️ 原则 4：不接触 window / Date.now
 */

import { FINGERPRINT_WARN_RATIO } from '@/constants';
import type { Account, Fingerprint } from '@/stable/model/account';

/** 一个指纹维度（原 `Jl` 的 `{key,label,get}`） */
export interface FingerprintDimension {
  key: string;
  label: string;
  /** 取该维度的值（返回 `null`/`''` 视为**无此维度**，不参与比较） */
  get(fp: Fingerprint): unknown;
}

/** 7 个维度（原 `Jl` 34253-34294，**顺序即语义**） */
export const FINGERPRINT_DIMENSIONS: readonly FingerprintDimension[] = [
  { key: 'ua', label: 'User-Agent', get: (f) => f.userAgent },
  { key: 'tz', label: '时区', get: (f) => f.timezone },
  { key: 'lang', label: '语言', get: (f) => (f.languages ?? []).join(', ') },
  {
    key: 'screen',
    label: '分辨率',
    get: (f) => (f.screen ? `${f.screen.width}×${f.screen.height}@${f.screen.pixelRatio}x` : ''),
  },
  { key: 'webgl', label: 'WebGL 渲染器', get: (f) => f.webgl?.renderer },
  { key: 'hcon', label: '并发核数', get: (f) => f.hardwareConcurrency },
  { key: 'mem', label: '内存', get: (f) => f.deviceMemory },
];

/** 重合级别（原 `w` 的 `'ok' | 'critical' | 'warn'`） */
export type CollisionLevel = 'ok' | 'critical' | 'warn';

/** 一对重合账号（原 `r.push({a,b,aId,bId,level,dims,ratio})`） */
export interface CollisionPair {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  level: CollisionLevel;
  /** 重合的维度 label */
  dims: string[];
  /** 重合比例（`dims.length / 7`） */
  ratio: number;
}

/** 维度分布（原 `s` 的 `{label, distinct}`）—— 「不同值数量，越少越容易被关联」 */
export interface DimensionSpread {
  label: string;
  /** 不同取值个数 */
  distinct: number;
}

export interface FingerprintReport {
  pairs: CollisionPair[];
  /** 各维度的取值分布 */
  spread: DimensionSpread[];
  /** **无指纹**的账号数（原 `n`） */
  missing: number;
  /** 参与比较的账号数（有指纹的） */
  compared: number;
}

/** 取维度值并归一成可比较字符串（`null` / `''` → `null` = 不参与） */
function valueOf(dim: FingerprintDimension, fp: Fingerprint): string | null {
  const v = dim.get(fp);
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

/** 两个指纹的重合判定（原 `zk` 的内层循环） */
export function comparePair(
  a: Fingerprint,
  b: Fingerprint,
): { level: CollisionLevel; dims: string[]; ratio: number } {
  const dims: string[] = [];
  for (const dim of FINGERPRINT_DIMENSIONS) {
    const va = valueOf(dim, a);
    const vb = valueOf(dim, b);
    if (va !== null && va === vb) dims.push(dim.label);
  }

  const total = FINGERPRINT_DIMENSIONS.length;
  const ratio = dims.length / total;
  let level: CollisionLevel = 'ok';
  if (dims.length === total) level = 'critical';
  else if (ratio >= FINGERPRINT_WARN_RATIO) level = 'warn';

  return { level, dims, ratio };
}

/**
 * 扫描全部账号（原 `zk`）
 *
 * ⚠️ 无指纹的账号**被跳过**（`missing` 计数），不参与比较
 * ⚠️ 两两组合（`C(n,2)`），`i < j` 只算一次
 */
export function scanFingerprintCollisions(accounts: readonly Account[]): FingerprintReport {
  const withFp = accounts.filter((a): a is Account & { fingerprint: Fingerprint } => !!a.fingerprint);
  const missing = accounts.length - withFp.length;

  // 维度分布：每个维度上出现过的**不同取值**个数
  const spread: DimensionSpread[] = FINGERPRINT_DIMENSIONS.map((dim) => {
    const seen = new Set<string>();
    for (const acc of withFp) {
      const v = valueOf(dim, acc.fingerprint);
      if (v !== null) seen.add(v);
    }
    return { label: dim.label, distinct: seen.size };
  });

  const pairs: CollisionPair[] = [];
  for (let i = 0; i < withFp.length; i++) {
    for (let j = i + 1; j < withFp.length; j++) {
      const a = withFp[i] as Account & { fingerprint: Fingerprint };
      const b = withFp[j] as Account & { fingerprint: Fingerprint };
      const r = comparePair(a.fingerprint, b.fingerprint);
      if (r.level === 'ok') continue;
      pairs.push({
        aId: a.id,
        aName: a.name,
        bId: b.id,
        bName: b.name,
        level: r.level,
        dims: r.dims,
        ratio: r.ratio,
      });
    }
  }

  return { pairs, spread, missing, compared: withFp.length };
}

/** 人类可读的分级标签（原 `DP.jsx` 的文案） */
export const COLLISION_LEVEL_LABEL: Record<CollisionLevel, string> = {
  ok: '未检测到任何指纹重合配对 ✓',
  critical: '🔴 完全关联(全维重合)',
  warn: '🟡 高度相似(≥70%重合)',
};
