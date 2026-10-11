/**
 * 画廊大图预览（lightbox）—— 原 `_Component23.jsx:550-602` 的 `.tg-lightbox-*`
 *
 * ★ **它补的是画廊面板里那句自己都写着的能力**：「点缩略图可预览大图」
 *   （`GALLERY_TEXT.sub` 逐字对源 419-421，此前**没有实现** ⇒ 那句话在撒谎，本轮补上）。
 *
 * 源版结构 → 本工程落法：
 *   | 源 | 落法 |
 *   |---|---|
 *   | `.tg-lightbox-head`（标题 + 元信息 + `✕`） | `<Modal>` 的 `title` 槽 |
 *   | `.tg-lightbox-stage`（`‹` / `img` / `›`） | `<Modal>` 的 `children` |
 *   | `.tg-lightbox-foot`（四个按钮） | `<Modal>` 的 `footer` |
 *   | 全局 `keydown`：`Esc` / `←` / `→` | `Esc` 由 **`<Modal>`** 处理（`原则8/rule-of-three` 只允许它住 `ui/common/`）；`←`/`→` 在本组件挂**全局** `keydown`（源版同法） |
 *
 * ⚠️ **两处未落（如实标注，判据 B4）**：
 *   ① `勾选此图`（原 580-584）—— ★ **2026-10-11 更正（TD-09-3）**：此前给的理由是
 *      「选择态的用途（「添加到画布」）**尚未落地**」—— **该理由已不成立**：`GalleryPanel` 的
 *      选择态 + 「添加到画布 (N)」**均已落**（见其文件头）。⇒ 本按钮**仍不落**，但真因是
 *      「**lightbox 未接选择态**」（**待接线**），**不是**"选择态未落地"；
 *   ② `ao()`（原 126：去掉 URL 上的追踪参数）—— 本工程直接开 `sourceUrl` 原文。
 * ⚠️ **原则 1**：本组件只调 `useHostOps()`（`openExternal`）与 store 的 `pushToast`
 *    —— `ui` 不得直持 `Ports`（TD-16-8；`usePorts` 已从 `@/state` 移除）。
 */

import { useEffect } from 'react';
import { useHostOps, useStore } from '@/state';
import { Modal } from '@/ui/common/Modal';
import { GALLERY_TEXT } from '@/constants/text';
import { formatBytes } from '@/core/rules/downloadNode';
import { galleryItemDims } from '@/core/rules/materialGrid';
import { formatDateTimeMinute } from '@/lib/time';
import type { LovartImage } from '@/core/rules/lovartGallery';
import styles from './GalleryLightbox.module.css';

export interface GalleryLightboxProps {
  items: readonly LovartImage[];
  /** 当前看第几张（索引，`0..n-1`） */
  index: number;
  /** 当前这张是否已勾选（原 `c.has(A.id)`） */
  checked: boolean;
  onToggle: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  /** 从画廊移除当前这张（由面板调 store action） */
  onRemove: (id: string) => void;
}

export function GalleryLightbox({
  items,
  index,
  checked,
  onToggle,
  onPrev,
  onNext,
  onClose,
  onRemove,
}: GalleryLightboxProps) {
  const hostOps = useHostOps();
  const pushToast = useStore((s) => s.pushToast);

  /** `←` / `→` 翻页（**全局键**，与源版同法 —— `Esc` 由 `<Modal>` 负责） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

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

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className={styles.head}>
          <span className={styles.title} title={item.sourceUrl || item.name}>
            {item.name}
          </span>
          <span className={styles.meta}>
            {GALLERY_TEXT.lightboxMeta(
              galleryItemDims(item),
              formatBytes(item.sizeBytes),
              formatDateTimeMinute(item.addedAt),
              index + 1,
              items.length,
            )}
          </span>
        </span>
      }
      footer={
        <>
          {/* ★ 勾选此图（原 580-584）—— 勾选态现在有落点了（「添加到画布 (N)」） */}
          <button type="button" className={styles.btnGhost} onClick={() => onToggle(item.id)}>
            {checked ? GALLERY_TEXT.uncheckImage : GALLERY_TEXT.checkImage}
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={!item.sourceUrl}
            title={item.sourceUrl ? GALLERY_TEXT.openOriginalTitle(item.sourceUrl) : GALLERY_TEXT.openOriginalNone}
            onClick={() => void openOriginal()}
          >
            {GALLERY_TEXT.openOriginal}
          </button>
          <button type="button" className={styles.btnGhost} onClick={() => onRemove(item.id)}>
            {GALLERY_TEXT.removeFromGallery}
          </button>
        </>
      }
    >
      <div className={styles.stage}>
        <button type="button" className={styles.nav} title={GALLERY_TEXT.prev} onClick={onPrev}>
          ‹
        </button>
        <img className={styles.img} src={item.dataUrl} alt={item.name} />
        <button type="button" className={styles.nav} title={GALLERY_TEXT.next} onClick={onNext}>
          ›
        </button>
      </div>
    </Modal>
  );
}
