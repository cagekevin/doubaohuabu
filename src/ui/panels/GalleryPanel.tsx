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
 * ★ **「导入图片」已落**（原 `oe` 436 + `he` 306-322）：走 `hostOps.importFiles`（系统对话框，
 *   与本仓「＋ 添加素材」同一个入口）→ 逐张量尺寸 → `addLovartImages`（出处 `'import'`）。
 *   ⚠️ 与源两处差异（如实标注）：① 源用**隐藏 `<input type=file>`**、本仓走**端口**（判据 C1）；
 *   ② 源把「量尺寸失败」的兜底 `200 × 160` 写在 `Pu` 里，本仓同一份在 `lib/readDroppedFile`。
 *   ⚠️ 《此前那版头注写着「`FilePort` 只有单文件选目录/下载」⇒ 导入做不了》 —— 那句是**错的**：
 *     `FilePort.importFiles` 一直返回**多文件**，且 `readImageFile`（原 `Pu`）早已在仓里。
 *
 * ★ **「扫描 Tapnow 画布」已落**（原 `ce` ＝ `Yl` + `qc`）：走 `accountOps.scanCanvas`
 *   （站点**接口**读画布节点 → 逐张落盘 → 入库）—— 见下方 `onScan`。⚠️ 与源两处差异（如实标注）：
 *   ① 源的取图走页内脚本（`pP`/`mp`，失败再回落主进程），本仓**直接走主进程**；
 *   ② 源的 `useDom: true` 还会再扫一遍页面 DOM 并合并，本仓**只走接口**（DOM 那半是另一条链）。
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
import { useAccountOps, useHostOps, useStore } from '@/state';
import type { ScanPhaseEvent } from '@/core/ports/site.port';
import { toMessage } from '@/core/model/result';
import { GalleryCard } from './GalleryCard';
import { GalleryLightbox } from './GalleryLightbox';
import { GALLERY_TEXT } from '@/constants/text';
import { GALLERY_GRID_GAP, GALLERY_GRID_SCALE, GALLERY_PAGE_SIZE } from '@/constants';
import { formatBytes } from '@/core/rules/downloadNode';
import {
  canvasMaterialBookmarks,
  importedGalleryItems,
  type ImportedGalleryImage,
  type LovartImage,
} from '@/core/rules/lovartGallery';
import { measureImageSize, stripExtension } from '@/lib/readDroppedFile';
import { galleryItemDims, isBigGalleryItem } from '@/core/rules/materialGrid';
import styles from './GalleryPanel.module.css';
import shared from '@/ui/common/shared.module.css';
// ★ 浮层壳走**共享件**（遮罩 / 头三槽 / ✕ / 正文 / 脚只有一种）
import { PanelShell } from '@/ui/common/PanelShell';

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
  /** ★ 扫描阶段机（原 `y` 的 `{phase, message}`；`null` = 没在扫） */
  const [phase, setPhase] = useState<ScanPhaseEvent | null>(null);
  /**
   * ★ **面板忙**（原 `m`，`_Component23:30`）—— 源是**一个**标志：扫描与导入共用它，
   *   并同时禁用「导入图片 / 从画布收藏 / 清空画廊」三颗钮（`disabled={m}`）。
   */
  const [busy, setBusy] = useState(false);
  const accountOps = useAccountOps();
  const hostOps = useHostOps();

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

  /**
   * ★ **扫描 Tapnow 画布**（原 `ce` 333-300 的编排半）—— 走 `accountOps.scanCanvas`
   *   （站点**接口**读画布节点：`Yl` + `qc`），扫到的图直接入库本账号画廊。
   *
   * ⚠️ 三档 toast 的**文案 / 时长 / 语气逐字对源**（原 `:271-289`）；`!ok` **原文透传**（原则 6）。
   * ⚠️ **一处如实差异**：源首档「没停在画布页」是 `warn`，本仓**按消息来源**认它
   *   （比的是同一张 SSOT 常量，不是字面量）—— 分类表 `SendFailKind` 属**发送域**，没有这一档。
   * ⚠️ **另一处**：源只失败时会带**首条失败原因**（`failures[0].error`），本仓 `ScanResult.failed`
   *   只有计数（逐张原因进 `log.warn`）⇒ 只报张数（见 `GALLERY_TEXT.scanFailedOnly` 的注释）。
   */
  const onScan = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await accountOps.scanCanvas(accountId, { onPhase: setPhase });
      if (!r.ok) {
        const notOnCanvas = r.message === GALLERY_TEXT.scanNeedCanvas;
        pushToast(r.message, notOnCanvas ? 6500 : 6000, notOnCanvas ? 'warn' : 'error');
      } else if (r.value.added > 0) {
        pushToast(
          GALLERY_TEXT.scanOk(r.value.added, r.value.skipped, r.value.failed),
          5000,
          r.value.failed > 0 ? 'warn' : 'success',
        );
      } else if (r.value.failed > 0) {
        pushToast(GALLERY_TEXT.scanFailedOnly(r.value.failed), 7000, 'error');
      } else {
        pushToast(GALLERY_TEXT.scanNone, 6000, 'warn');
      }
    } catch (e) {
      // ★ 原则 6：不静默 —— 原文透传（与「出新图」面板同法）
      pushToast(GALLERY_TEXT.scanException(toMessage(e)), 6000, 'error');
    } finally {
      setBusy(false);
      setPhase(null);
    }
  };

  /**
   * ★ **从磁盘导入图片**（原 `oe` 436 的按钮 + `he` 306-322 的处理）
   *
   * 顺序（逐字对源）：`importFiles()` → 逐张 `Pu`（**读成 dataUrl 且量原始尺寸**）
   *   → 滤掉读不出来的 → `addLovartImages`（出处 `'import'`）
   *   → 三档提示（`已导入 N 张…` / `这些图片已在画廊中（重复跳过）` / `导入失败：…`）。
   *
   * ⚠️ 与源两处差异（如实标注）：
   *   ① 源是**隐藏 `<input type=file multiple>`**（`v.current.click()`），本仓走端口
   *      `hostOps.importFiles`（系统对话框）—— 与本仓「＋ 添加素材」同一个入口（判据 C1）；
   *   ② 源的「导入失败」只有 **catch** 一条路（`Pu` 从不 reject，源那两个失败分支里能走到
   *      的只有它）；本仓多一条 `!ok`（对话框被取消 / 失败是**端口**才有的形态），
   *      两者共用**同一句** `导入失败：` —— 不另造文案。
   */
  const onImport = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await hostOps.importFiles();
      if (!res.ok) {
        pushToast(GALLERY_TEXT.importFailed(res.message), GALLERY_TEXT.msgMs, 'error');
        return;
      }
      const read: ImportedGalleryImage[] = [];
      for (const f of res.value) {
        const dataUrl = f.dataUrl ?? '';
        // ⚠️ 读不出来（`dataUrl` 空）的**不量尺寸**，交给 `importedGalleryItems` 丢掉（源同法）
        const size = dataUrl ? await measureImageSize(dataUrl) : { natW: 0, natH: 0 };
        read.push({ name: stripExtension(f.name), dataUrl, ...size });
      }
      const added = addLovartImages(accountId, importedGalleryItems(read));
      if (added > 0) pushToast(GALLERY_TEXT.importOk(added), GALLERY_TEXT.msgMs, 'success');
      else pushToast(GALLERY_TEXT.importDup, GALLERY_TEXT.msgMs, 'warn');
    } catch (e) {
      // ★ 原则 6：原文透传；拿不到 message 才用源那两句兜底里的那句
      pushToast(
        GALLERY_TEXT.importFailed(toMessage(e) || GALLERY_TEXT.importUnknownError),
        GALLERY_TEXT.msgMs,
        'error',
      );
    } finally {
      setBusy(false);
    }
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
    /*
     * ★★ **2026-10-12 收口到共享壳**：此前它自拼 `.backdrop` + `.panel` + `.panelHead`
     *   + 一个文本「关闭」钮 —— 遮罩虽然 `composes: overlay`，但**头/脚/关闭钮**都是自己一套。
     *   ⇒ 现全部归 `PanelShell`（**遮罩 / 头三槽 / ✕ / 正文 / 脚只有一种**）：
     *     · 中槽 = `sub`（已选 N / 共 M）· 右槽 = 那一排工具钮 · 脚 = 提示 + 取消 + 添加到画布。
     *   ⚠️ 源版右槽末尾那颗**文本「关闭」**并入真源 `✕`（2026-10-12 口径）。
     */
    <PanelShell
      overlay
      onClose={onClose}
      className={styles.panel}
      testId="gallery-panel"
      title={GALLERY_TEXT.title(accountName)}
      meta={<span className={styles.sub}>{GALLERY_TEXT.sub(selected.size, items.length)}</span>}
      actions={
        <div className={styles.actions}>
            <span className={styles.count}>{GALLERY_TEXT.count(items.length)}</span>
            {/* ★ 扫描：走**站点接口**读当前画布节点（原 `ce`；阶段文案逐字对源 `:424`） */}
            <button
              type="button"
              className={shared.btn}
              disabled={busy}
              title={GALLERY_TEXT.scan}
              onClick={() => void onScan()}
            >
              {busy && phase ? (phase.phase === 'working' ? phase.message : GALLERY_TEXT.scanReading) : GALLERY_TEXT.scan}
            </button>
            <span className={styles.sep} />
            {/* ★ 全选 / 反选 / 清空选择（原 427-435，**禁用条件逐字**） */}
            <button
              type="button"
              className={shared.btn}
              disabled={items.length === 0 || selected.size === items.length}
              onClick={() => setSelected(new Set(items.map((it) => it.id)))}
            >
              {GALLERY_TEXT.selectAll}
            </button>
            <button
              type="button"
              className={shared.btn}
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
              className={shared.btn}
              disabled={selected.size === 0}
              onClick={() => setSelected(new Set())}
            >
              {GALLERY_TEXT.clearSelection}
            </button>
            <span className={styles.sep} />
            {/* ★ 「导入图片」（原 436：源是隐藏 file input，本仓走端口 —— 见 `onImport`） */}
            <button
              type="button"
              className={shared.btn}
              disabled={busy}
              title={GALLERY_TEXT.importTitle}
              onClick={() => void onImport()}
            >
              {GALLERY_TEXT.importImages}
            </button>
            {/*
              ★ 「加入画布选中素材」（原 `Ie` 336-359）—— 2026-10-11 接通：
                写入方（`addLovartImages`）早已就位，缺的只是"从选中节点取字段"这一步
                （现在落在纯层 `canvasMaterialBookmarks`，可测）。
              ⚠️ 三条提示与源版**逐字相同**（含那条 4500ms 的"尚未选中"）；语气/时长对齐
                `onImport`（同一个源 `h`：`'ok'` → `success`、默认 3500ms）。
            */}
            <button
              type="button"
              className={shared.btn}
              disabled={busy}
              title={GALLERY_TEXT.addSelectedTitle}
              onClick={() => {
                const picked = canvasMaterialBookmarks(nodes);
                if (picked.length === 0) {
                  pushToast(GALLERY_TEXT.addSelectedNone, 4500, 'warn');
                  return;
                }
                const added = addLovartImages(accountId, picked);
                if (added > 0) pushToast(GALLERY_TEXT.addSelectedOk(added), GALLERY_TEXT.msgMs, 'success');
                else pushToast(GALLERY_TEXT.addSelectedDup, GALLERY_TEXT.msgMs, 'warn');
              }}
            >
              {GALLERY_TEXT.addSelected}
            </button>
            <span className={styles.sep} />
            <button
              type="button"
              className={`${shared.btn} ${styles.danger}`}
              disabled={busy || items.length === 0}
              title={GALLERY_TEXT.clearTitle}
              onClick={() => clearLovartGallery(accountId)}
            >
              {GALLERY_TEXT.clear}
            </button>
        </div>
      }
      /* 脚（原 `.lovart-gallery-foot`）—— 提示靠 `margin-right: auto` 顶左（真源脚是右对齐） */
      footer={
        <>
          <div className={styles.footHint}>{GALLERY_TEXT.footHint}</div>
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
        </>
      }
    >
      {items.length === 0 ? (
        <div className={shared.empty}>
          <div className={styles.emptyIcon}>{GALLERY_TEXT.emptyIcon}</div>
          <div className={styles.emptyTitle}>{GALLERY_TEXT.emptyTitle}</div>
          <div className={styles.emptyDesc}>{GALLERY_TEXT.emptyDesc}</div>
        </div>
      ) : (
        <>
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
              className={`${shared.btn} ${styles.ghost}`}
              onClick={() => setVisible((v) => v + GALLERY_PAGE_SIZE)}
            >
              {GALLERY_TEXT.loadMore(shown.length, items.length)}
            </button>
          </div>
        )}
        </>
      )}

      {/*
        ★ 大图预览（原 `_Component23.jsx:550-602` 的 `.tg-lightbox`）
        ⚠️ 挂在**卡片内**（不是遮罩的兄弟）：卡片自带 `stopPropagation`，
          否则点 lightbox 的遮罩会**同时**把画廊也关掉（React 事件走**组件树**冒泡）。
      */}
      {preview !== null && (
        <GalleryLightbox
          items={items}
          index={preview}
          checked={items[preview] ? selected.has(items[preview].id) : false}
          onToggle={toggle}
          /* ⚠️ 通用件已把 `‹ ›` 的**环形取模**算好、给的是**绝对索引** ⇒ 这里直接落 state
             （原 `stepPreview(delta)` 那份取模已随之删掉 —— 同一件事不再两处算） */
          onIndex={(i) => setPreview(i)}
          onClose={() => setPreview(null)}
          onRemove={(id) => {
            removeLovartImages(accountId, [id]);
            // ⚠️ 与源一致：移除后当前项可能没了 ⇒ 直接关掉（源版靠 `{A && …}` 隐式关闭）
            setPreview(null);
          }}
        />
      )}
    </PanelShell>
  );
}
