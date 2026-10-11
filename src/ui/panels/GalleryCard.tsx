/**
 * 画廊里的一张卡片（原 `_Component23.jsx:482-527` 的 `.lovart-card`）
 *
 * ★ **判据 C1**：从 `GalleryPanel` 抽出 —— 卡片自带 4 个交互（勾选 / 预览 / 移除 / 悬停）
 *   与 6 个元素，留在面板里会把面板顶过 `max-lines`。
 *
 * 交互（**逐行对源**）：
 *   · **单击卡片本体** ⇒ 切换勾选（原 485-488；点到复选框 / 删除 / 预览按钮时**不**切换）
 *   · **双击缩略图** 或点 `⤢` ⇒ 预览大图（原 497-509）
 *   · `✕` ⇒ 从画廊移除（原 521-526）
 *   · 命中「大图」判据 ⇒ 显示 `⚠ 大图` 徽标（原 501-503）
 *
 * ⚠️ **原则 1**：本组件**不碰 store** —— 四个动作全部经 props 回调（面板侧调 action）。
 */

import { GALLERY_TEXT } from '@/constants/text';
import { formatBytes } from '@/core/rules/downloadNode';
import { thumbUrl } from '@/core/rules/richText';
import { galleryItemDims, isBigGalleryItem } from '@/core/rules/materialGrid';
import { formatDateTimeMinute } from '@/lib/time';
import type { LovartImage } from '@/core/rules/lovartGallery';
import styles from './GalleryCard.module.css';

export interface GalleryCardProps {
  item: LovartImage;
  /** 预览时用它在**整份列表**里的下标（原 `F(id)` 的 `findIndex`） */
  index: number;
  selected: boolean;
  hovered: boolean;
  onToggle: (id: string) => void;
  onPreview: (index: number) => void;
  onRemove: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function GalleryCard({
  item,
  index,
  selected,
  hovered,
  onToggle,
  onPreview,
  onRemove,
  onHover,
}: GalleryCardProps) {
  const dims = galleryItemDims(item);
  const big = isBigGalleryItem(item);

  return (
    <div
      className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        // 原 486-488：点卡片本体**切换勾选**（复选框 / 删除 / 预览按钮除外）
        const t = e.target as HTMLElement;
        if (t.closest('[data-card-check]') || t.closest('[data-card-del]') || t.closest('[data-card-preview]')) {
          return;
        }
        onToggle(item.id);
      }}
    >
      {/* 原 490-496 的 `.lovart-card-check` */}
      <div className={styles.check} data-card-check onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} title={GALLERY_TEXT.checkTitle} onChange={() => onToggle(item.id)} />
      </div>

      {/* 原 497-510：**双击**缩略图预览；单击由卡片本体接管（切换勾选） */}
      <div className={styles.thumbWrap} onDoubleClick={() => onPreview(index)}>
        {/* ⚠️ 与素材节点同法：`thumbUrl` 只给**远程** URL 挂 `?w=` 参数 */}
        <img className={styles.thumb} src={thumbUrl(item.dataUrl, 320)} alt={item.name} loading="lazy" />
        {big && (
          <span className={styles.bigBadge} title={GALLERY_TEXT.bigBadge(formatBytes(item.sizeBytes), dims)}>
            ⚠ 大图
          </span>
        )}
        {hovered && (
          <>
            {/* 原 504-509 的 `.lovart-card-preview`（`⤢`） */}
            <button
              type="button"
              data-card-preview
              className={styles.previewBtn}
              title={GALLERY_TEXT.previewTitle}
              onClick={(e) => {
                e.stopPropagation();
                onPreview(index);
              }}
            >
              {GALLERY_TEXT.preview}
            </button>
            <button
              type="button"
              data-card-del
              className={styles.remove}
              title={GALLERY_TEXT.removeTitle}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
            >
              {GALLERY_TEXT.remove}
            </button>
          </>
        )}
      </div>

      <div className={styles.name} title={item.name}>
        {item.name}
      </div>
      {/* 原 515-519：`大小 · 尺寸 · 时间`（空项不渲染） */}
      <div className={styles.meta}>
        <span>{formatBytes(item.sizeBytes)}</span>
        {dims && <span>{dims}</span>}
        <span>{formatDateTimeMinute(item.addedAt)}</span>
      </div>
    </div>
  );
}
