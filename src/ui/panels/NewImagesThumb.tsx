/**
 * 「出新图」列表里的一张缩略图（原 `_Component26.jsx:625-657` 的 `.dvl-thumb`）
 *
 * ★ **判据 C1**：从 `NewImagesPanel` 抽出 —— 一张缩略图自带 5 个元素与 2 个交互，
 *   留在面板里会把面板顶过 `max-lines`〔该规则 2026-10-11 已关闭；此处保留为"内聚拆分"的理由〕（`GalleryCard` 同因）。
 *
 * 交互（**逐行对源**）：
 *   · 点缩略图 ⇒ **发送到画布**（原 629-630 的 `pe`；⚠️ 源版的"长按拖出"未落 ⇒ 这里只有点击）
 *   · `✕` ⇒ 从列表移除（原 646-651）
 *
 * 徽标（与源一致）：
 *   · `NEW`（1 小时内且未发送）· `✓ 已发送` · `⚠`（大图，发送前会确认）· 来源 `L`/`T`/`网`
 *
 * ⚠️ **原则 1**：本组件**不碰 store** —— 两个动作全部经 props 回调。
 * ⚠️ **一处小差异（如实标注）**：源版算尺寸文本时要求 `natW && natH` **两个都在**
 *   （原 633/655），本工程复用已测的 `galleryItemDims`（**任一在**就给 `W×?`）
 *   ⇒ 只有**恰好一个**字段缺失时表现不同（罕见）。
 */

import { NEW_IMAGES_TEXT } from '@/constants/text';
import { formatBytes } from '@/core/rules/downloadNode';
import { withThumb } from '@/stable/protocols/img';
import { galleryItemDims, isBigGalleryItem } from '@/core/rules/materialGrid';
import { hostnameFromUrl, sourceTag, type NewImageItem } from '@/core/rules/newImages';
import styles from './NewImagesPanel.module.css';

export interface NewImagesThumbProps {
  item: NewImageItem;
  /** 是否算「NEW」（由面板按**挂载时**的时钟算好 —— 渲染期不调 `Date.now()`） */
  isNew: boolean;
  /** 是否已发送过（源版 `b.current` 集合） */
  sent: boolean;
  onSend: (item: NewImageItem) => void;
  onRemove: (item: NewImageItem) => void;
  /**
   * ★ **按下**（仅左键）—— 面板据此起「拖出到系统」的**待定态**（原 `V` 226-264）。
   * ⚠️ 拖出**不是本组件的活**：它需要面板级的 window 监听 + 端口调用（`ui` 不碰宿主实现）。
   */
  onPressStart: (item: NewImageItem, clientX: number, clientY: number) => void;
}

export function NewImagesThumb({ item, isNew, sent, onSend, onRemove, onPressStart }: NewImagesThumbProps) {
  const dims = galleryItemDims(item);
  const big = isBigGalleryItem(item);
  const from = item._accName || item._accId;
  const tagClass =
    item._accType === 'lovart' ? styles.srcLovart : item._accType === 'tapnow' ? styles.srcTapnow : '';

  return (
    <div className={`${styles.thumb} ${sent ? styles.thumbSent : ''}`}>
      <button
        type="button"
        className={styles.thumbBtn}
        title={NEW_IMAGES_TEXT.thumbTitle(item.name, dims, from)}
        onClick={() => onSend(item)}
        onMouseDown={(e) => {
          // ★ 与源逐字一致（原 `V:225-227`）：**非左键直接忽略**；`preventDefault()` 抑制
          //   原生图片拖拽与文本选中（源版同位置调用）
          if (e.button !== 0) return;
          e.preventDefault();
          onPressStart(item, e.clientX, e.clientY);
        }}
      >
        {/* ⚠️ 与素材节点同法：`withThumb`（原 `Xt`）只给 **`img://` 引用**挂 `?w=`（本地协议处理器缩放） */}
        <img className={styles.thumbCover} src={withThumb(item.dataUrl, 320)} alt={item.name} loading="lazy" />
        <span className={styles.caption}>{NEW_IMAGES_TEXT.overlay}</span>
        {isNew && !sent && <span className={styles.badgeNew}>{NEW_IMAGES_TEXT.badgeNew}</span>}
        {sent && <span className={styles.badgeSent}>{NEW_IMAGES_TEXT.badgeSent}</span>}
        {big && (
          <span className={styles.badgeBig} title={NEW_IMAGES_TEXT.badgeBigTitle}>
            {NEW_IMAGES_TEXT.badgeBig}
          </span>
        )}
        <span className={`${styles.sourceTag} ${tagClass}`}>{sourceTag(item._accType)}</span>
      </button>
      <button
        type="button"
        className={styles.thumbDel}
        title={NEW_IMAGES_TEXT.delTitle}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item);
        }}
      >
        ✕
      </button>
      <div className={styles.thumbMeta} title={NEW_IMAGES_TEXT.metaTitle(item.name, hostnameFromUrl(item.sourceUrl), from)}>
        {dims || formatBytes(item.sizeBytes)}
      </div>
    </div>
  );
}
