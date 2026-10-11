/**
 * 「出新图」面板 —— 对应原 `_Component26.jsx`（**694 行** = 全账号聚合的"出新图"条）
 *
 * ★★ **它是什么**：把 `lovartGalleries`（每个账号一个图池）**按账号聚合**成一条平铺缩略图条，
 *    点缩略图即**发送到画布**（`addMaterialsBatch` + `autoPlace`）。挂在后台视图（`<webview>` 区）
 *    上方 —— 源版的位置也是 `.doubao-view-webviews` 之上。
 *
 * ★ **聚合逻辑在纯层**：`core/rules/newImages.ts`（`aggregateNewImages`，**24 条单测**）
 *   —— 源版那四个内联站点判定（`Ep`/`ho`/`Ud`/`x0`）与两条过滤规则在组件里无法单独验证。
 *
 * ✅ **已落**：聚合列表 · **发送到画布**（含大图确认）· **从列表移除** · **折叠**
 *   （`doubao-newimages-folded`）· **只留本画布**（`doubao-newimages-current-only`）·
 *   `NEW` / `✓ 已发送` / `⚠` / 来源标签 四类徽标 · **「立即抓取」+ 四阶段状态机**
 *   （2026-10-11 接通：`accountOps.scanGallery` → `SitePort.scan`）。
 *
 * ⛔ **未落地的逐条标注（判据 B4/B5，不假装）**：
 *   | 缺 | 源 | 原因 |
 *   |---|---|---|
 *   | **自动值守轮询** | `Ee`（原 428-592） | 抖动 / 退避（3s/6s/10s/15s）/ 空转上限 / 单账号计数 —— 一整套定时器编排，**与「扫描链」是两件事**（后者已通） |
 *   | 长按拖出到系统 | `se`（原 152-192） | 走 `startFileDrag`（`MediaPort` 未用，见 `docs/14` §1.4） |
 *   | 「正在抓取中，请稍候」 | 原 336 | 源版有**模块级并发锁**（`Jy()`/`o0()`）；本工程只有本面板会发起，且按钮在忙时**禁用** ⇒ 该分支**不可达** ⇒ 不落（判据 B5） |
 *
 * ⚠️ **一处刻意的处理**：源版的 toast 是**面板内**的 `.dvl-toast`（3200ms 自动消失），
 *   本工程统一走 store 的 `pushToast`（与 `GalleryPanel` 同法），**时长逐条对源**。
 * ⚠️ **`currentCanvasId` 传 `null`**：源版由 `Yl(account)` 读页面地址取画布 id；纯层判据本身逐字保留
 *   （见 `newImages.ts` 文件头「源版怪癖」）。
 *
 * ⚠️ **原则 1**：本组件只调 `useStore` 暴露的 action 与 `useAccountOps()`，不写 store。
 */

import { useMemo, useState } from 'react';
import { useAccountOps, useStore } from '@/state';
import { NewImagesThumb } from './NewImagesThumb';
import { NEW_IMAGES_TEXT } from '@/constants/text';
import { GALLERY_GRID_GAP } from '@/constants';
import { formatBytes } from '@/core/rules/downloadNode';
import { galleryItemDims, isBigGalleryItem } from '@/core/rules/materialGrid';
import {
  aggregateNewImages,
  galleryItemKey,
  isAggregatableSite,
  isFetchableSite,
  isFreshItem,
  isOtherSite,
  type NewImageItem,
} from '@/core/rules/newImages';
import type { ScanPhaseEvent } from '@/core/ports/site.port';
import styles from './NewImagesPanel.module.css';

export function NewImagesPanel() {
  const accounts = useStore((s) => s.accounts);
  const galleries = useStore((s) => s.lovartGalleries);
  const activeAccountId = useStore((s) => s.activeAccountId);
  const addMaterialsBatch = useStore((s) => s.addMaterialsBatch);
  const removeLovartImages = useStore((s) => s.removeLovartImages);
  const pushToast = useStore((s) => s.pushToast);
  const folded = useStore((s) => s.newImagesFolded);
  const currentOnly = useStore((s) => s.newImagesCurrentOnly);
  const setFolded = useStore((s) => s.setNewImagesFolded);
  const setCurrentOnly = useStore((s) => s.setNewImagesCurrentOnly);
  const accountOps = useAccountOps();

  /**
   * ⚠️ 时钟**只在挂载时取一次**（`useState(() => …)`）—— 渲染期禁 `Date.now()`（`docs/11` §9.1）。
   *    代价：`NEW` 徽标不会随时间自动褪去（源版每次渲染都重算）—— 可接受。
   */
  const [now] = useState(() => Date.now());
  /** ★ 已发送过的条目（原 `b.current` 的 `Set`）—— 键是 `galleryItemKey` */
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  /** ★ 抓取状态机（原 `N` 的 `{phase, message}`）—— `null` = 未扫过（显示「待机」） */
  const [phase, setPhase] = useState<ScanPhaseEvent | null>(null);
  /** ★ 抓取进行中（原 `q`）—— 用于按钮 `disabled` 与文案切换 */
  const [busy, setBusy] = useState(false);

  const items = useMemo(
    () =>
      aggregateNewImages(galleries, accounts, {
        currentOnly,
        activeAccountId,
        // ⚠️ 见文件头：画布 id 由抓取子系统读（`Yl`），本轮传 `null`
        currentCanvasId: null,
      }),
    [galleries, accounts, currentOnly, activeAccountId],
  );
  /** 「聚合 N 个账号」徽标（原 `c.length` = **可抓取**账号数，不是过滤后的数） */
  const fetchableCount = useMemo(() => accounts.filter((a) => isFetchableSite(a)).length, [accounts]);
  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  /** 状态文案（原 614 的三目：`scanning` ⇒ 固定句；`working`/其余 ⇒ 后端 message；全空 ⇒ 待机） */
  const statusText =
    phase === null
      ? NEW_IMAGES_TEXT.statusIdle
      : phase.phase === 'scanning'
        ? NEW_IMAGES_TEXT.statusScanning
        : phase.message || (phase.phase === 'working' ? NEW_IMAGES_TEXT.statusWorking : NEW_IMAGES_TEXT.statusIdle);
  const spinning = phase?.phase === 'scanning' || phase?.phase === 'working';

  /** 按钮文案（原 `De` 599 的四路三目） */
  const fetchLabel = isAggregatableSite(activeAccount)
    ? NEW_IMAGES_TEXT.fetch
    : isOtherSite(activeAccount)
      ? NEW_IMAGES_TEXT.fetchCurrentPage
      : fetchableCount > 1
        ? NEW_IMAGES_TEXT.fetchAll
        : NEW_IMAGES_TEXT.fetch;

  /**
   * ★ **立即抓取**（原 `oe` 333-421）
   *
   * 目标账号（**逐字对源**）：当前账号**可抓取** ⇒ 只扫它；否则扫**全部**可抓取的账号。
   * 结果 → 一条 toast（`ok`/`err`/`warn` 三档，时长对源）；失败账号由控制器 `pushBackendError` 上报。
   */
  const runFetch = async (): Promise<void> => {
    if (busy) return;
    const targets =
      activeAccount && isFetchableSite(activeAccount)
        ? [activeAccount.id]
        : accounts.filter((a) => isFetchableSite(a)).map((a) => a.id);
    if (targets.length === 0) {
      pushToast(NEW_IMAGES_TEXT.noAccounts, 2600, 'warn');
      return;
    }
    setBusy(true);
    try {
      const r = await accountOps.scanGallery(targets, { onPhase: setPhase });
      if (r.added > 0) pushToast(NEW_IMAGES_TEXT.fetched(r.added, r.failed), 4500, 'info');
      else if (r.failed > 0) pushToast(NEW_IMAGES_TEXT.failedOnly(r.failed), 6000, 'error');
      else pushToast(NEW_IMAGES_TEXT.noNew, 4000, 'warn');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 发送到画布（原 `ke` 193-223）
   * ⚠️ 与源一致：**命中大图判据就先 `window.confirm`**（meta = `大小 · 尺寸`），取消 ⇒ 不发。
   */
  const send = (item: NewImageItem): void => {
    if (isBigGalleryItem(item)) {
      const meta = [formatBytes(item.sizeBytes), galleryItemDims(item)].filter(Boolean).join(' · ');
      if (!window.confirm(NEW_IMAGES_TEXT.bigConfirm(item.name, meta))) return;
    }
    const ids = addMaterialsBatch(
      [
        {
          name: item.name,
          dataUrl: item.dataUrl,
          natW: item.natW,
          natH: item.natH,
        },
      ],
      // ★ 与源一致：`{autoPlace: true, gap: 24}`（画廊那条路**不传** autoPlace）
      { autoPlace: true, gap: GALLERY_GRID_GAP },
    );
    if (Array.isArray(ids) && ids.length > 0) {
      setSent((cur) => new Set(cur).add(galleryItemKey(item)));
      pushToast(NEW_IMAGES_TEXT.sent(item.name), 2600, 'info');
    } else {
      pushToast(NEW_IMAGES_TEXT.sendFailed, undefined, 'error');
    }
  };

  /** 从列表移除（原 `ne` 327-331）—— ⚠️ 只动列表，**不影响画布** */
  const remove = (item: NewImageItem): void => {
    removeLovartImages(item._accId, [item.id]);
    setSent((cur) => {
      const next = new Set(cur);
      next.delete(galleryItemKey(item));
      return next;
    });
    pushToast(NEW_IMAGES_TEXT.removed, 2000, 'info');
  };

  return (
    <div className={`${styles.wrap} ${folded ? styles.collapsed : ''}`} data-testid="new-images-panel">
      <div className={styles.strip}>
        <div className={styles.head}>
          <div className={styles.title}>
            {NEW_IMAGES_TEXT.title}
            <span className={styles.count}>{items.length}</span>
            {fetchableCount > 0 && (
              <span className={styles.agg} title={NEW_IMAGES_TEXT.aggTitle}>
                {NEW_IMAGES_TEXT.aggLabel(fetchableCount)}
              </span>
            )}
          </div>
          {/* 状态机（原 611-616）—— 阶段由 `onPhase` 上报（`scanning`/`found`/`working`/`done`） */}
          <div className={styles.status} title={statusText}>
            <span className={`${styles.statusDot} ${spinning ? styles.statusDotBusy : ''}`} />
            <span>{statusText}</span>
          </div>
        </div>

        <div className={styles.foldBody}>
          <div className={styles.body}>
            {items.length === 0 ? (
              <div className={styles.empty}>
                <span>{NEW_IMAGES_TEXT.emptyHint}</span>
                {/* 原 621-623：空态里那个抓取按钮（源版**没有** `title`） */}
                <button type="button" className={styles.fetch} disabled={busy} onClick={() => void runFetch()}>
                  {busy ? NEW_IMAGES_TEXT.fetchBusy : fetchLabel}
                </button>
              </div>
            ) : (
              <div className={styles.thumbs}>
                {items.map((item) => (
                  <NewImagesThumb
                    key={galleryItemKey(item)}
                    item={item}
                    isNew={isFreshItem(item, now)}
                    sent={sent.has(galleryItemKey(item))}
                    onSend={send}
                    onRemove={remove}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={styles.right}>
            <div className={styles.rightCol}>
              {/* ★ 「只留本画布」（原 663-670）—— 开时 toast 逐字 */}
              <button
                type="button"
                className={`${styles.onlyCurrent} ${currentOnly ? styles.onlyCurrentOn : ''}`}
                title={currentOnly ? NEW_IMAGES_TEXT.onlyCurrentOnTitle : NEW_IMAGES_TEXT.onlyCurrentOffTitle}
                onClick={() => {
                  const next = !currentOnly;
                  setCurrentOnly(next);
                  pushToast(
                    next ? NEW_IMAGES_TEXT.onlyCurrentSwitchedOn : NEW_IMAGES_TEXT.onlyCurrentSwitchedOff,
                    1800,
                    'info',
                  );
                }}
              >
                {currentOnly ? NEW_IMAGES_TEXT.onlyCurrentOn : NEW_IMAGES_TEXT.onlyCurrent}
              </button>
              {/* ★ 抓取（原 671-673）—— 这一处**带 `title`**（与空态那个不同，逐字对源） */}
              <button
                type="button"
                className={styles.fetch}
                disabled={busy}
                title={NEW_IMAGES_TEXT.fetchTitle}
                onClick={() => void runFetch()}
              >
                {busy ? NEW_IMAGES_TEXT.fetchBusy : fetchLabel}
              </button>
              {/* ⛔ 自动值守未落地 ⇒ 禁用 + 说明原因（判据 B4） */}
              <button type="button" className={styles.auto} disabled title={NEW_IMAGES_TEXT.pendingAuto}>
                {NEW_IMAGES_TEXT.autoPaused}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 折叠把手（原 683-685） */}
      <button
        type="button"
        className={styles.foldToggle}
        title={folded ? NEW_IMAGES_TEXT.foldExpand : NEW_IMAGES_TEXT.foldCollapse}
        onClick={() => setFolded(!folded)}
      >
        {folded ? NEW_IMAGES_TEXT.foldExpandGlyph : NEW_IMAGES_TEXT.foldCollapseGlyph}
      </button>
    </div>
  );
}
