/**
 * 画廊大图预览 —— ★ 现在是**通用件 `ImageLightbox` 的薄消费者**
 *
 * 源版：`_Component23.jsx:550-602` 的 `.tg-lightbox-*`（头 + 舞台 + 脚三块）。
 * ⚠️ **2026-10-16 收口**：通用件（`ui/common/ImageLightbox`）出现后，本文件只留**画廊专属**的那三颗钮
 *   （勾选 / 打开原图 / 移出画廊）与"把 `LovartImage` 映成通用项"这一段 ——
 *   `‹ ›` 翻页、`←`/`→` 键、`Esc`、大图与「复制」都归通用件（**同一件东西一处解**）。
 *   ⇒ 原先的 `GalleryLightbox.module.css` **整份删掉**（皮随件走，提进真源 `shared.module.css` 的 `.lightbox*`）。
 *
 * ⚠️ 底栏顺序**照源保持**：勾选 → 打开原图 → 移出画廊，通用件的「复制」**追加在最后**
 *   （不插进源那三颗中间 ⇒ 源序不被破坏；「复制」本就是新增能力，见通用件头注）。
 *
 * ⚠️ **原则 1**：本组件只调 `useHostOps()`（`openExternal`）与 store 的 `pushToast` —— `ui` 不得直持 `Ports`。
 */

import { GALLERY_TEXT } from '@/constants/text';
import { formatBytes } from '@/core/rules/downloadNode';
import { galleryItemDims } from '@/core/rules/materialGrid';
import { formatDateTimeMinute } from '@/lib/time';
import type { LovartImage } from '@/core/rules/lovartGallery';
import { useHostOps, useStore } from '@/state';
import { ImageLightbox, type LightboxItem } from '@/ui/common/ImageLightbox';
import shared from '@/ui/common/shared.module.css';

export interface GalleryLightboxProps {
  items: readonly LovartImage[];
  /** 当前看第几张（索引，`0..n-1`） */
  index: number;
  /** 当前这张是否已勾选（原 `c.has(A.id)`） */
  checked: boolean;
  onToggle: (id: string) => void;
  /** 翻到第几张（**绝对索引**；通用件已把 `‹ ›` 的环绕算好） */
  onIndex: (i: number) => void;
  onClose: () => void;
  /** 从画廊移除当前这张（由面板调 store action） */
  onRemove: (id: string) => void;
}

export function GalleryLightbox({
  items,
  index,
  checked,
  onToggle,
  onIndex,
  onClose,
  onRemove,
}: GalleryLightboxProps) {
  const hostOps = useHostOps();
  const pushToast = useStore((s) => s.pushToast);

  const item = items[index];
  if (!item) return null;

  /** 打开原始图片（原 `_` 117-137） */
  const openOriginal = async (): Promise<void> => {
    const url = item.sourceUrl ?? '';
    if (!url) {
      pushToast(GALLERY_TEXT.openOriginalNone, 4000, 'warn');
      return;
    }
    const r = await hostOps.openExternal(url);
    if (r.ok) pushToast(GALLERY_TEXT.openOriginalOk, 2500);
    else pushToast(GALLERY_TEXT.openOriginalFailed(r.message), 4000, 'error');
  };

  /**
   * `LovartImage[]` → 通用项（元信息那句**每项按自己的序号算** —— 通用件只渲染当前那张，
   * 所以"第 n/m 张"永远是对的）。
   */
  const list: LightboxItem[] = items.map((it, i) => ({
    src: it.dataUrl,
    title: it.name,
    // 下载默认名 = 条目名（画廊条目本来就带名字；通用件没给会用 `COMMON_TEXT.downloadImageName`）
    downloadName: it.name,
    meta: GALLERY_TEXT.lightboxMeta(
      galleryItemDims(it),
      formatBytes(it.sizeBytes),
      formatDateTimeMinute(it.addedAt),
      i + 1,
      items.length,
    ),
  }));

  return (
    <ImageLightbox
      items={list}
      index={index}
      onIndex={onIndex}
      onClose={onClose}
      actions={
        <>
          {/* ★ 勾选此图（原 580-584）—— 勾选态现在有落点了（「添加到画布 (N)」） */}
          <button
            type="button"
            className={`${shared.btn} ${shared.btnSm} ${shared.btnGhost}`}
            onClick={() => onToggle(item.id)}
          >
            {checked ? GALLERY_TEXT.uncheckImage : GALLERY_TEXT.checkImage}
          </button>
          <button
            type="button"
            className={`${shared.btn} ${shared.btnSm}`}
            disabled={!item.sourceUrl}
            title={
              item.sourceUrl
                ? GALLERY_TEXT.openOriginalTitle(item.sourceUrl)
                : GALLERY_TEXT.openOriginalNone
            }
            onClick={() => void openOriginal()}
          >
            {GALLERY_TEXT.openOriginal}
          </button>
          <button
            type="button"
            className={`${shared.btn} ${shared.btnSm} ${shared.btnGhost}`}
            onClick={() => onRemove(item.id)}
          >
            {GALLERY_TEXT.removeFromGallery}
          </button>
        </>
      }
    />
  );
}
