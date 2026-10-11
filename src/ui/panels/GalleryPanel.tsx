/**
 * 画廊面板 —— 对应原 `_Component23.jsx`（**605 行** = **单账号**画廊面板的视图半）
 *
 * ★★ **它是 `lovartGalleries` 这条链的最后一环**：纯规则（`rules/lovartGallery.ts`，35 条单测）
 *   → store 切片（`slices/gallery.ts`，7 个 action）→ **落盘（`persistGalleries` + hydrate）**
 *   → **本组件**。四者齐备后，这个字段才真正"能用"（此前有数据层、无界面）。
 *
 * ★ **源版的形态**：覆盖层模态（`.login-backdrop` + `.lovart-gallery`），从账号面板打开；
 *   头部有 8 个动作按钮（扫描 / 全选 / 反选 / 移除选中 / 导入 / 加入画布素材 / 清空 / 关闭），
 *   内容区是缩放网格（勾选 + 缩略图 + 尺寸徽标 + 预览）。
 *
 * ⛔ **本工程落「最小可用」版，未落地的逐条标注（判据 B4，不假装）**：
 *   | 缺 | 源 | 原因 |
 *   |---|---|---|
 *   | **扫描 Tapnow 画布** | `ce`（原 423） | 走**站点页内脚本**读画布节点 —— 与 M11 剩余三项**同一层**（转写量大且无运行时验证手段） |
 *   | 从磁盘导入 | `oe`（原 437） | 需要"多选文件 → 读成 dataUrl"一条链（`FilePort` 目前只有单文件选目录/下载） |
 *   | 加入画布选中素材 | `Ie`（原 440） | 需要"把素材节点的 `dataUrl` 合成一条 `LovartImage`"的编排 —— 但**它的写入方已就位**（`addLovartImages`），只差选择来源 |
 *   | 全选 / 反选 | `ke`/`pe`（原 427/430） | 与"移除选中"是一组；本版改为**逐张移除**，不需要选择态 |
 *   | 大图预览 | 缩略图双击 / 预览按钮（原 497/504） | 独立浮层（本工程已有 `ui/common` 的浮层范式，属另一单元） |
 *
 * ⚠️ **原则 1**：本组件只调 `useStore` 暴露的 action，不写 store。
 */

import { useMemo, useState } from 'react';
import { useStore } from '@/state';
import { GALLERY_TEXT } from '@/constants/text';
import { formatBytes } from '@/core/rules/downloadNode';
import { thumbUrl } from '@/core/rules/richText';
import { canvasMaterialBookmarks } from '@/core/rules/lovartGallery';
import styles from './GalleryPanel.module.css';

export interface GalleryPanelProps {
  /** 画廊归属的账号 id */
  accountId: string;
  onClose: () => void;
}

export function GalleryPanel({ accountId, onClose }: GalleryPanelProps) {
  const galleries = useStore((s) => s.lovartGalleries);
  const accounts = useStore((s) => s.accounts);
  const removeLovartImages = useStore((s) => s.removeLovartImages);
  const clearLovartGallery = useStore((s) => s.clearLovartGallery);
  const addLovartImages = useStore((s) => s.addLovartImages);
  const pushToast = useStore((s) => s.pushToast);
  /** ⚠️ 取**全量**节点：源版是 `nodes.filter(selected && type === 'material' && data.dataUrl)` */
  const nodes = useStore((s) => s.nodes);

  /** 面板内**临时**选择态（源版有勾选 + 全选/反选；本版只保留"移除"单张 ⇒ 仅用于高亮） */
  const [hover, setHover] = useState<string | null>(null);

  const accountName = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name ?? accountId,
    [accounts, accountId],
  );
  const items = useMemo(() => galleries?.[accountId] ?? [], [galleries, accountId]);

  return (
    // ⚠️ 点背板关闭（原 412）—— 与源一致：面板内点击**不**冒泡（否则点内容就关）
    <div className={styles.backdrop} onClick={onClose} data-testid="gallery-panel">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>{GALLERY_TEXT.title(accountName)}</span>
          <span className={styles.sub}>{GALLERY_TEXT.sub(0, items.length)}</span>
          <div className={styles.actions}>
            <span className={styles.count}>{GALLERY_TEXT.count(items.length)}</span>
            {/* ⛔ 扫描：**禁用 + 说明原因**（走站点页内脚本，与 M11 剩余三项同一层） */}
            <button type="button" className={styles.btn} disabled title={GALLERY_TEXT.pendingScan}>
              {GALLERY_TEXT.scan}
            </button>
            {/*
              ★ 「加入画布选中素材」（原 `Ie` 336-359）—— 2026-10-11 接通：
                写入方（`addLovartImages`）早已就位，缺的只是"从选中节点取字段"这一步
                （现在落在纯层 `canvasMaterialBookmarks`，可测）。
              ⚠️ 三条提示与源版**逐字相同**（含那条 4500ms 的"尚未选中"）。
            */}
            <button
              type="button"
              className={styles.btn}
              title={GALLERY_TEXT.addSelectedTitle}
              onClick={() => {
                const picked = canvasMaterialBookmarks(nodes);
                if (picked.length === 0) {
                  pushToast(GALLERY_TEXT.addSelectedNone, 4500, 'warn');
                  return;
                }
                const added = addLovartImages(accountId, picked);
                // ⚠️ 源版这句的 `'ok'` 是**面板内本地 banner** 的语气（它那个 `h` 是 `setMsg`），
                //   不是 store toast 的等级 ⇒ 落到最近的一档 `info`（成功）。
                if (added > 0) pushToast(GALLERY_TEXT.addSelectedOk(added), undefined, 'info');
                else pushToast(GALLERY_TEXT.addSelectedDup, undefined, 'warn');
              }}
            >
              {GALLERY_TEXT.addSelected}
            </button>
            <span className={styles.sep} />
            <button
              type="button"
              className={`${styles.btn} ${styles.danger}`}
              disabled={items.length === 0}
              title={GALLERY_TEXT.clearTitle}
              onClick={() => clearLovartGallery(accountId)}
            >
              {GALLERY_TEXT.clear}
            </button>
            <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={onClose}>
              {GALLERY_TEXT.close}
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>{GALLERY_TEXT.emptyIcon}</div>
            <div className={styles.emptyTitle}>{GALLERY_TEXT.emptyTitle}</div>
            <div className={styles.emptyDesc}>{GALLERY_TEXT.emptyDesc}</div>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.grid}>
              {items.map((item) => (
                <div
                  className={styles.card}
                  key={item.id}
                  onMouseEnter={() => setHover(item.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div className={styles.thumbWrap}>
                    {/* ⚠️ 与素材节点同法：`thumbUrl` 只给**远程** URL 挂 `?w=` 参数 */}
                    <img
                      className={styles.thumb}
                      src={thumbUrl(item.dataUrl, 320)}
                      alt={item.name}
                      loading="lazy"
                    />
                    {hover === item.id && (
                      <button
                        type="button"
                        className={styles.remove}
                        title={GALLERY_TEXT.removeTitle}
                        onClick={() => removeLovartImages(accountId, [item.id])}
                      >
                        {GALLERY_TEXT.remove}
                      </button>
                    )}
                  </div>
                  <div className={styles.name} title={item.name}>
                    {item.name}
                  </div>
                  <div className={styles.meta}>
                    {formatBytes(item.sizeBytes)}
                    {item.natW > 0 && item.natH > 0 ? ` ${item.natW}×${item.natH}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
