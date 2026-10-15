/**
 * Lovart 画廊 slice（③ 独立成片）
 *
 * ★ **为什么独立成片而不是并进 `global`**：源版把它放在全局 store（26787），而本仓
 *   **`global` 已有 27 个字段**（`docs/11 §5.3` 的上限是 25）⇒ 按同一节的规定**另开一片**。
 *
 * ★★ **本片只有"写"的能力，没有"想"的能力**：全部判断（去重 / 清理判据 / 键的增删语义）
 *   都在 **已测**的 `core/rules/lovartGallery.ts`（**42 条单测**）；这里只把结果落到 store。
 *
 * 依据（**逐行回源**）：`addLovartImages` 29243 · `removeLovartImages` 29296 ·
 *   `clearLovartGallery` 29315 · `purgeLovartGallery` 29329。
 * ⚠️ `purgeLovartJunk` 29346 / `purgeLovartByScope` 29382 **有意不落**（源里 **0 调用** ⇒
 *   落它 = 死代码 + 第二份清理逻辑，见 `TD-16-141`）—— 连带纯层的 `purgeLovartImages` /
 *   `matchesLovartScope` 一并删除（它们原先只被这两个死 action 消费）。
 *
 * ⚠️ **每个 action 都遵守"无变化就不写"**（源版 `return {}` = 不写状态、不落盘）——
 *   纯层用"返回原引用"表达这件事，本片据此**跳过 `set`**。这不是优化，是**正确性**：
 *   否则每次空清理都会把整棵树写一遍盘（`pick()` 里会给它安排落盘）。
 */

import {
  addLovartImages as addPure,
  clearLovartGallery as clearPure,
  removeLovartAccount,
  removeLovartImages as removePure,
  type LovartGalleries,
  type LovartImageInput,
} from '@/core/rules/lovartGallery';

export interface GallerySlice {
  /** `accountId → 图片列表`（原 26787 的 `lovartGalleries: ET()`） */
  lovartGalleries: LovartGalleries;
  /** 加图（原 29243）@returns 真正新增的条数 */
  addLovartImages: (accountId: string, items: readonly LovartImageInput[]) => number;
  /** 按 **id** 删（原 29296） */
  removeLovartImages: (accountId: string, ids: readonly string[]) => void;
  /** 清空（**保留键**，置 `[]` —— 原 29315） */
  clearLovartGallery: (accountId: string) => void;
  /** **删键**（原 29329；与上一个不是同一件事） */
  purgeLovartGallery: (accountId: string) => void;
}

/** 本片需要的注入（原则 4：`core` 只收值，不收宿主） */
export interface GallerySliceDeps {
  now: () => number;
  /** 造图 id（原 `Pt('lg')`） */
  idFactory: () => string;
  /**
   * 把**内联 base64 图**落成本地 `img://` 引用（原 `Tn`）—— 其余（`img://` / 远程 / 空）
   * **原样返回**（⚠️ 2026-10-11 回源纠错：此前文档写的是「远程图」，判据写反了 —— 见
   * `stable/protocols/img.ts` 的 `isInlineImage`）。
   * ⚠️ **不纯**（内部走 `MediaPort.saveImageSync`，是个**同步 IPC**）⇒ 由 `bootstrap` 注入。
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
    };
  };
