/**
 * 画廊面板 —— 对应原 `_Component23.jsx`（**605 行** = **单账号**画廊面板的视图半）
 *
 * ★★ **它是 `lovartGalleries` 这条链的最后一环**：纯规则（`rules/lovartGallery.ts`，35 条单测）
 *   → store 切片（`slices/gallery.ts`，7 个 action）→ **落盘（`persistGalleries` + hydrate）**
 *   → **本组件**。四者齐备后，这个字段才真正"能用"（此前有数据层、无界面）。
 *
 * ★ **源版的形态**：覆盖层模态（`.login-backdrop` + `.lovart-gallery`），从账号面板打开；
 *   头部有动作按钮（扫描 / 全选 / 反选 / 清空选择 / 导入 / 从画布收藏 / 清空 / 关闭），
 *   内容区是缩放网格（勾选 + 缩略图 + 大图徽标 + 预览），底部是「添加到画布 (N)」。
 *
 * ⛔ **仍未落地的逐条标注（判据 B4，不假装）**：
 *   | 缺 | 源 | 原因 |
 *   |---|---|---|
 *   | **扫描 Tapnow 画布** | `ce`（原 423） | 走**站点页内脚本**读画布节点 —— 与 M11 剩余三项**同一层**（转写量大且无运行时验证手段） |
 *   | 从磁盘导入 | `oe`（原 437） | 需要"多选文件 → 读成 dataUrl"一条链（`FilePort` 目前只有单文件选目录/下载） |
 *
 * ✅ **已落**（2026-10-11）：查看 / 单张移除 / 清空 / **从画布收藏**（原 `Ie` 440）/
 *   **大图预览**（`GalleryLightbox`）/ **选择态 + 全选·反选·清空选择**（原 427-435）/
 *   **「添加到画布 (N)」**（原 `le`+`De` 360-411 —— 走 `addMaterialsBatch`）/ **大图徽标** /
 *   **加载更多**（原 530-533）。
 *
 * ⚠️ **一处行为更正（2026-10-11）**：上一轮把「点缩略图 = 预览大图」做成了**单击** ——
 *   逐行回源后确认 `_Component23.jsx:485-499` 是**单击切换勾选**、**双击 / `⤢` 才预览**
 *   ⇒ 本轮改正（当时是**误读**，不是有意偏离）。
 *
 * ⚠️ **原则 1**：本组件只调 `useStore` 暴露的 action，不写 store。
 */

import { useMemo, useState } from 'react';
import { useStore } from '@/state';
import { GalleryCard } from './GalleryCard';
import { GalleryLightbox } from './GalleryLightbox';
import { GALLERY_TEXT } from '@/constants/text';
import { GALLERY_GRID_GAP, GALLERY_GRID_SCALE, GALLERY_PAGE_SIZE } from '@/constants';
import { formatBytes } from '@/core/rules/downloadNode';
import { canvasMaterialBookmarks, type LovartImage } from '@/core/rules/lovartGallery';
import { galleryItemDims, isBigGalleryItem } from '@/core/rules/materialGrid';
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
  const addMaterialsBatch = useStore((s) => s.addMaterialsBatch);
  const pushToast = useStore((s) => s.pushToast);
  /** ⚠️ 取**全量**节点：源版是 `nodes.filter(selected && type === 'material' && data.dataUrl)` */
  const nodes = useStore((s) => s.nodes);

  /** 悬停高亮（本工程自己的，源版用 CSS `:hover`） */
  const [hover, setHover] = useState<string | null>(null);
  /**
   * ★ **选择态**（原 `c`）—— 唯一用途就是底部「添加到画布 (N)」+ lightbox 的「勾选此图」
   *   （这正是上一轮**先不落**它的理由：缺了写入方，三个按钮只是装饰）
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** ★ 大图预览的**当前索引**（`null` = 不显示；原 `R`/`A` 的对应物） */
  const [preview, setPreview] = useState<number | null>(null);
  /** ★ 已显示张数（原 `C`；首屏 `Dd` = 60，「加载更多」每次再加） */
  const [visible, setVisible] = useState(GALLERY_PAGE_SIZE);

  const accountName = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name ?? accountId,
    [accounts, accountId],
  );
  const items = useMemo(() => galleries?.[accountId] ?? [], [galleries, accountId]);
  /** 本屏显示的切片（原 `E = N.slice(0, C)`） */
  const shown = useMemo(() => items.slice(0, visible), [items, visible]);
  const hasMore = items.length > visible;

  /** 勾选 / 取消勾选（原 `se` 140-150） */
  const toggle = (id: string): void => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 大图预览翻页（原 `U` 90-98：**环形**取模） */
  const stepPreview = (delta: number): void => {
    setPreview((i) => (i === null || items.length === 0 ? i : (i + delta + items.length) % items.length));
  };

  /**
   * 大图确认（原 `De` 362-371）—— **命中任一张大图就逐个问**；任一取消 ⇒ **中止整批**
   * ⚠️ 与源一致：提示里的 meta 是 `大小 · 尺寸`（`[vl, ja].filter(Boolean).join(' · ')`）
   */
  const confirmBig = (list: readonly LovartImage[]): boolean => {
    for (const it of list) {
      if (!isBigGalleryItem(it)) continue;
      const meta = [formatBytes(it.sizeBytes), galleryItemDims(it)].filter(Boolean).join(' · ');
      if (!window.confirm(GALLERY_TEXT.bigConfirm(it.name, meta))) return false;
    }
    return true;
  };

  /**
   * 添加到画布（原 `le` 401-411 + `De` 360-400）
   *
   * ⚠️ 与源逐字一致：**只传 `{gap:24, scale:1}`**（不传 `autoPlace`）。
   * ⚠️ 源版那两处失败分支（`已添加 N 张，M 张失败（数据无效）` / `添加失败：…`）**不可达**
   *    —— `addMaterialsBatch` 对每张入参都返回一个 id（`H.length - J.length` 恒为 0）
   *    ⇒ 按判据 B5 **不落**这两句文案。
   */
  const addToCanvas = (): void => {
    const list = items.filter((it) => selected.has(it.id));
    if (list.length === 0) return;
    if (!confirmBig(list)) return;
    addMaterialsBatch(
      list.map((it) => ({
        name: it.name,
        dataUrl: it.dataUrl,
        ...(it.natW === undefined ? {} : { natW: it.natW }),
        ...(it.natH === undefined ? {} : { natH: it.natH }),
      })),
      { gap: GALLERY_GRID_GAP, scale: GALLERY_GRID_SCALE },
    );
    pushToast(GALLERY_TEXT.addOk(list.length));
    // 原 410：加完清空选择
    setSelected(new Set());
  };

  return (
    // ⚠️ 点背板关闭（原 412）—— 与源一致：面板内点击**不**冒泡（否则点内容就关）
    <div className={styles.backdrop} onClick={onClose} data-testid="gallery-panel">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>{GALLERY_TEXT.title(accountName)}</span>
          <span className={styles.sub}>{GALLERY_TEXT.sub(selected.size, items.length)}</span>
          <div className={styles.actions}>
            <span className={styles.count}>{GALLERY_TEXT.count(items.length)}</span>
            {/* ⛔ 扫描：**禁用 + 说明原因**（走站点页内脚本，与 M11 剩余三项同一层） */}
            <button type="button" className={styles.btn} disabled title={GALLERY_TEXT.pendingScan}>
              {GALLERY_TEXT.scan}
            </button>
            <span className={styles.sep} />
            {/* ★ 全选 / 反选 / 清空选择（原 427-435，**禁用条件逐字**） */}
            <button
              type="button"
              className={styles.btn}
              disabled={items.length === 0 || selected.size === items.length}
              onClick={() => setSelected(new Set(items.map((it) => it.id)))}
            >
              {GALLERY_TEXT.selectAll}
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={items.length === 0}
              onClick={() =>
                setSelected((cur) => {
                  const next = new Set<string>();
                  for (const it of items) if (!cur.has(it.id)) next.add(it.id);
                  return next;
                })
              }
            >
              {GALLERY_TEXT.invert}
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={selected.size === 0}
              onClick={() => setSelected(new Set())}
            >
              {GALLERY_TEXT.clearSelection}
            </button>
            <span className={styles.sep} />
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
              {shown.map((item, idx) => (
                <GalleryCard
                  key={item.id}
                  item={item}
                  index={idx}
                  selected={selected.has(item.id)}
                  hovered={hover === item.id}
                  onToggle={toggle}
                  onPreview={setPreview}
                  onRemove={(id) => removeLovartImages(accountId, [id])}
                  onHover={setHover}
                />
              ))}
            </div>
            {/* 原 530-533：分页「加载更多」 */}
            {hasMore && (
              <div className={styles.more}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.ghost}`}
                  onClick={() => setVisible((v) => v + GALLERY_PAGE_SIZE)}
                >
                  {GALLERY_TEXT.loadMore(shown.length, items.length)}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 原 537-548：底部提示 + 取消 / 添加到画布 (N) */}
        <div className={styles.foot}>
          <div className={styles.footHint}>{GALLERY_TEXT.footHint}</div>
          <div className={styles.footActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>
              {GALLERY_TEXT.cancel}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={selected.size === 0}
              title={selected.size === 0 ? GALLERY_TEXT.addToCanvasNone : GALLERY_TEXT.addToCanvasTitle(selected.size)}
              onClick={addToCanvas}
            >
              {GALLERY_TEXT.addToCanvas(selected.size)}
            </button>
          </div>
        </div>

        {/*
          ★ 大图预览（原 `_Component23.jsx:550-602` 的 `.tg-lightbox`）
          ⚠️ 挂在 `.panel` 内（而不是 `.backdrop` 的兄弟）：`.panel` 已有 `stopPropagation`，
            否则点 lightbox 的遮罩会**同时**把画廊也关掉（React 事件走**组件树**冒泡）。
        */}
        {preview !== null && (
          <GalleryLightbox
            items={items}
            index={preview}
            checked={items[preview] ? selected.has(items[preview].id) : false}
            onToggle={toggle}
            onPrev={() => stepPreview(-1)}
            onNext={() => stepPreview(1)}
            onClose={() => setPreview(null)}
            onRemove={(id) => {
              removeLovartImages(accountId, [id]);
              // ⚠️ 与源一致：移除后当前项可能没了 ⇒ 直接关掉（源版靠 `{A && …}` 隐式关闭）
              setPreview(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
