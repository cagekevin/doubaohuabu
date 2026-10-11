/**
 * Lovart 画廊 slice（③ 独立成片）
 *
 * ★ **为什么独立成片而不是并进 `global`**：源版把它放在全局 store（26787），
 *   本工程的 `global.ts` 头注释也写着"本清单还要往本片加 `lovartGalleries`" —— 但
 *   **`global` 现在已有 27 个字段**（`docs/11 §5.3` 的上限是 25）⇒ 按同一节的规定**另开一片**。
 *   （已在该文件头记明这处偏离。）
 *
 * ★★ **本片只有"写"的能力，没有"想"的能力**：全部判断（去重 / 清理判据 / 键的增删语义）
 *   都在 **已测**的 `core/rules/lovartGallery.ts`（**35 条单测**）；这里只把结果落到 store。
 *
 * 依据（**逐行回源**）：`addLovartImages` 29243 · `removeLovartImages` 29296 ·
 *   `clearLovartGallery` 29315 · `purgeLovartGallery` 29329 · `purgeLovartJunk` 29346 ·
 *   `purgeLovartByScope` 29382。
 *
 * ⚠️ **每个 action 都遵守"无变化就不写"**（源版 `return {}` = 不写状态、不落盘）——
 *   纯层用"返回原引用"表达这件事，本片据此**跳过 `set`**。这不是优化，是**正确性**：
 *   否则每次空清理都会把整棵树写一遍盘（`pick()` 里会给它安排落盘）。
 */

import {
  addLovartImages as addPure,
  clearLovartGallery as clearPure,
  purgeLovartImages,
  isLovartJunk,
  matchesLovartScope,
  removeLovartAccount,
  removeLovartImages as removePure,
  type LovartGalleries,
  type LovartImageInput,
} from '@/core/rules/lovartGallery';

export interface GallerySlice {
  /** `accountId → 图片列表`（原 26787 的 `lovartGalleries: ET()`） */
  lovartGalleries: LovartGalleries;
  /** 整体替换（给"删账号时清池"这类外部编排用） */
  setLovartGalleries: (galleries: LovartGalleries) => void;
  /** 加图（原 29243）@returns 真正新增的条数 */
  addLovartImages: (accountId: string, items: readonly LovartImageInput[]) => number;
  /** 按 **id** 删（原 29296） */
  removeLovartImages: (accountId: string, ids: readonly string[]) => void;
  /** 清空（**保留键**，置 `[]` —— 原 29315） */
  clearLovartGallery: (accountId: string) => void;
  /** **删键**（原 29329；与上一个不是同一件事） */
  purgeLovartGallery: (accountId: string) => void;
  /** 清垃圾（原 29346）@returns 清掉的条数 */
  purgeLovartJunk: (accountId?: string | null) => number;
  /** 按 scope 清（原 29382，默认哨兵 `'!canvas'`）@returns 清掉的条数 */
  purgeLovartByScope: (accountId?: string | null, scope?: string) => number;
}

/** 本片需要的注入（原则 4：`core` 只收值，不收宿主） */
export interface GallerySliceDeps {
  now: () => number;
  /** 造图 id（原 `Pt('lg')`） */
  idFactory: () => string;
  /**
   * 把远程图**落成本地引用**（原 `Tn`）—— ⚠️ **不纯**（内部走 `MediaPort.saveImageSync`，
   * 是个**同步 IPC**）⇒ 由 `bootstrap` 注入，不在 `core` 里碰宿主。
   */
  normalizeImage: (dataUrl: string) => string;
}

export const createGallerySlice =
  (deps: GallerySliceDeps) =>
  (
    set: (partial: Partial<GallerySlice>) => void,
    get: () => GallerySlice,
  ): GallerySlice => {
    /** ⚠️ **只在引用真的变了**才写（见文件头：「无变化就不写」是正确性，不是优化） */
    const commit = (next: LovartGalleries, current: LovartGalleries): void => {
      if (next !== current) set({ lovartGalleries: next });
    };

    return {
      lovartGalleries: {},

      setLovartGalleries: (galleries) => set({ lovartGalleries: galleries }),

      addLovartImages: (accountId, items) => {
        const cur = get().lovartGalleries;
        const r = addPure(cur, accountId, items, {
          now: deps.now(),
          idFactory: deps.idFactory,
          normalizeImage: deps.normalizeImage,
        });
        commit(r.galleries, cur);
        return r.added;
      },

      removeLovartImages: (accountId, ids) => {
        const cur = get().lovartGalleries;
        const r = removePure(cur, accountId, ids);
        commit(r.galleries, cur);
      },

      clearLovartGallery: (accountId) => {
        const cur = get().lovartGalleries;
        const r = clearPure(cur, accountId);
        commit(r.galleries, cur);
      },

      purgeLovartGallery: (accountId) => {
        const cur = get().lovartGalleries;
        const r = removeLovartAccount(cur, accountId);
        commit(r.galleries, cur);
      },

      purgeLovartJunk: (accountId) => {
        const cur = get().lovartGalleries;
        const r = purgeLovartImages(cur, accountId, (x) => isLovartJunk(x));
        commit(r.galleries, cur);
        return r.removed;
      },

      purgeLovartByScope: (accountId, scope) => {
        const cur = get().lovartGalleries;
        // ⚠️ `scope` 不传 ⇒ 用纯层的哨兵默认值（`'!canvas'`）
        const r = purgeLovartImages(cur, accountId, (x) => matchesLovartScope(x, scope));
        commit(r.galleries, cur);
        return r.removed;
      },
    };
  };
