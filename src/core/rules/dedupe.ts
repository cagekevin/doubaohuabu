/**
 * 图片去重（★ 纯逻辑，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：
 *   - `sm`  shared.js:25787-25812 —— 去重器工厂 `{exact, phash}` → `isDuplicate`
 *   - `Nk`  shared.js:25777-25786 —— 占位图判定
 *   - `nm` / `W$` / `rm` → 见 `lib/hash.ts`
 *
 * 算法：
 *   1. 精确哈希命中 → 重复
 *   2. 感知哈希与**任一**已存哈希的汉明距离 ≤ 8 → 重复
 *   3. 都不是 → 记录（exact + phash），返回 false
 *
 * ⚠️ 原则 4：`core` **不得碰 DOM** ⇒ 感知哈希由外部**注入**
 *    （浏览器侧实现见 `lib/phash.ts`；测试里注入假实现）
 */

import {
  EXACT_HASH_LEN,
  PHASH_DUPLICATE_DISTANCE,
  PHASH_PLACEHOLDER_DISTANCE,
  PLACEHOLDER_EXACT_HASHES,
  PLACEHOLDER_PHASH,
} from '@/constants/dedupe';
import { exactHashFromDataUrl, hammingDistance, hashFromImgRef } from '@/lib/hash';

/** 去重表（对应 localStorage `imggen_recurring_assets_v1` = `{urls, hashes}`） */
export interface DedupeState {
  /** 精确哈希（SHA-1 前 16 位） */
  exact: string[];
  /** 感知哈希（16 位 hex） */
  phash: string[];
}

export const emptyDedupeState = (): DedupeState => ({ exact: [], phash: [] });

/** 注入的依赖 */
export interface DedupeDeps {
  /** 感知哈希（异步；失败返回 `null`） */
  phash(src: string): Promise<string | null>;
}

export interface Dedupe {
  /** 是否重复（**命中会写入状态**，与源码一致） */
  isDuplicate(src: string): Promise<boolean>;
  /** 是否占位图（原 `Nk`） */
  isPlaceholder(src: string): Promise<boolean>;
  /** 取当前状态（供持久化） */
  snapshot(): DedupeState;
}

/**
 * 创建去重器（原 `sm` 25787）
 *
 * ⚠️ 副作用语义与源码一致：`isDuplicate` 在**判为不重复时会把哈希记入状态**。
 */
export function createDedupe(state: DedupeState, deps: DedupeDeps): Dedupe {
  const exact = new Set(state.exact.filter((h) => typeof h === 'string' && h.length === EXACT_HASH_LEN));
  const phash: string[] = state.phash.filter((h) => typeof h === 'string' && h.length > 0);

  const hashOf = (src: string): string | null => {
    // 既支持 `data:image/...`，也支持 `img://<hash>.ext`（原 `W$`）
    return exactHashFromDataUrl(src) ?? hashFromImgRef(src);
  };

  return {
    async isDuplicate(src: string): Promise<boolean> {
      if (!src || typeof src !== 'string') return false;

      const h = hashOf(src);
      if (h && exact.has(h)) return true;

      const p = await deps.phash(src);
      if (p) {
        for (const known of phash) {
          if (hammingDistance(p, known) <= PHASH_DUPLICATE_DISTANCE) return true;
        }
        phash.push(p);
      }
      if (h) exact.add(h);
      return false;
    },

    async isPlaceholder(src: string): Promise<boolean> {
      if (!src || typeof src !== 'string') return false;

      const h = hashOf(src);
      if (h && PLACEHOLDER_EXACT_HASHES.includes(h)) return true;

      const p = await deps.phash(src);
      return !!p && hammingDistance(p, PLACEHOLDER_PHASH) <= PHASH_PLACEHOLDER_DISTANCE;
    },

    snapshot(): DedupeState {
      return { exact: [...exact], phash: [...phash] };
    },
  };
}
