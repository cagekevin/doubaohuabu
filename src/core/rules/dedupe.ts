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

/**
 * 去重表（本仓形状：两个**数组**）
 *
 * ⚠️ 这是**会话内**去重器的形状 —— 对齐源 `sm` 的入参（`shared.js:25788-25789`：
 *   `new Set(e.exact||[])` ＋ `e.phash||[]`）。
 *   **别和另一张表混**：持久化那张（键 `imggen_recurring_assets_v1`，`Qk` `:36236`）是
 *   `{ urls: Record<_,{last}>, hashes: Record<_,{last}> }`（`TR()` `:36238` 读、`PR()` `:36251` 写，
 *   **> 400 条按 `last` 升序砍掉前一半**），管的是**跨会话**去重。
 *   ⇒ 两者是**两件事**，接线时各自要接，别把一张表当成另一张。
 *
 * ★ **本仓接线现状**（消费者各不相同，别当成一件）：
 *   - `isPlaceholder`（原 `Nk`，`:25776`）**已接** —— 出片轮询取回后先过它
 *     （`adapters/site/doubao` 的 `toGenResult`，感知哈希注入 `lib/phash.perceptualHash`）
 *     ⇒ **豆包默认占位图不入结果**。
 *   - `isDuplicate`（原 `sm`，`:25787`）**仍无生产消费者**：源里 `sm` 有 **3 个**调用点
 *     （`wp` `:32508` · `wP` `:33799` · `NR` `:36081`，**都在画廊 / 素材扫描链**，
 *     入参带 `allowedScopes`/`maxCanvases`/`haveHashes`），本仓那条链的去重由
 *     `addLovartImages` 按 `dataUrl` 承担 ⇒ **两条链尚未逐条对齐**（见 `docs/过程.md` §14）。
 */
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
