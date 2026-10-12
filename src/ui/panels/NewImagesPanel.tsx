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
 *   （2026-10-11 接通：`accountOps.scanGallery` → `SitePort.scan`）·
 *   ★ **自动值守**（`doubao-newimages-autocap`；2026-10-11 接通 —— 纯层 `core/rules/autoWatch.ts`
 *   + 编排 `accountOps.setAutoWatch`；**谁能值守由 adapter 声明**：`tapnow` 声明、
 *   **`lovart` 刻意不声明**（风控 `docs/10` #11），本组件**不判站点名**）·
 *   ★ **长按拖出到系统**（`se`/`V`/`pe`；2026-10-11 接通 —— 位移 **6px** 阈值触发
 *   `hostOps.dragFileOut`，含**幽灵预览**与**拖后吞掉那次 click**）。
 *
 * ⛔ **未落地的逐条标注（判据 B4/B5，不假装）**：
 *   | 缺 | 源 | 原因 |
 *   |---|---|---|
 *   | `.nip-drop-active` 落点高亮 | 原 258-263 | 它要给**跨层容器**（`.doubao-view-webviews`）挂**全局**类，而本仓只有 CSS Modules ⇒ **不为它开全局 CSS 例外**；其源样式亦不可得。⚠️ 功能不受影响（只少一层视觉提示） |
 *   | 「正在抓取中，请稍候」 | 原 336 | 源版有**模块级并发锁**（`Jy()`/`o0()`）；本工程只有本面板会发起，且按钮在忙时**禁用** ⇒ 该分支**不可达** ⇒ 不落（判据 B5） |
 *   | 值守轮询**每轮 `limit`**（原 `m0`=6）/ **并发锁互斥**（原 486 的 `Jy()`/`o0()` 顺延） | `Ee` 498-521 | 本仓 `ScanOptions` 的 `limit` 属扫描侧未落项（`docs/14` §5）；互斥未做（手动抓取与值守共用 `scanGallery`）—— 已如实登记（`docs/16`） |
 *
 * ⚠️ **一处刻意的处理**：源版的 toast 是**面板内**的 `.dvl-toast`（3200ms 自动消失），
 *   本工程统一走 store 的 `pushToast`（与 `GalleryPanel` 同法），**时长逐条对源**。
 * ⚠️ **`currentCanvasId` 传 `null`**：源版由 `Yl(account)` 读页面地址取画布 id；纯层判据本身逐字保留
 *   （见 `newImages.ts` 文件头「源版怪癖」）。
 *
 * ⚠️ **原则 1**：本组件只调 `useStore` 暴露的 action 与 `useAccountOps()`，不写 store。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccountOps, useHostOps, useStore } from '@/state';
import { toMessage } from '@/core/model/result';
import { NewImagesThumb } from './NewImagesThumb';
import { NEW_IMAGES_TEXT } from '@/constants/text';
import { GALLERY_GRID_GAP, NEW_IMAGES_DRAG_THRESHOLD_PX } from '@/constants';
import { withThumb } from '@/stable/protocols/img';
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
import shared from '@/ui/common/shared.module.css';

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
  const autoWatchOn = useStore((s) => s.newImagesAutoWatch);
  const setAutoWatchFlag = useStore((s) => s.setNewImagesAutoWatch);
  const accountOps = useAccountOps();
  // ★ 宿主能力走控制器（`ui` 不持 `Ports` —— TD-16-8）
  const hostOps = useHostOps();

  /** 开了「自启动」的账号 id（排序后拼串）—— 它一变就要**重建**值守链（源版 effect 依赖 `l` 同理） */
  const autoStartSig = useMemo(
    () =>
      accounts
        .filter((a) => a.autoStart)
        .map((a) => a.id)
        .sort()
        .join(','),
    [accounts],
  );

  /**
   * ★ **把开关落到定时器上**（原 `_Component26.jsx` 的 `he` + `useEffect(428)`）
   *
   * ⚠️ 本组件**不知道哪些站点能值守** —— 那是**适配器**的 `SitePort.autoWatch` 声明；
   *    控制器 `accountOps.setAutoWatch` 只问注册表（注册制）。
   * ⚠️ 控制器内部**幂等**（先停再建）⇒ 依赖变化时"停→建"就是一次重建；卸载时全停。
   */
  useEffect(() => {
    accountOps.setAutoWatch(autoWatchOn);
    return () => accountOps.setAutoWatch(false);
  }, [accountOps, autoWatchOn, autoStartSig]);

  // ── 长按拖出到系统（原 `_Component26.jsx` 的 `se` 152-192 + `V` 226-264 + window 监听 274-326）──
  //
  // ⚠️ **源版的「长按」不是计时**：按下后**位移超过 6px**（原 `eD`；`NEW_IMAGES_DRAG_THRESHOLD_PX`）
  //    就起系统拖拽（`Math.hypot(dx, dy) > eD`）。
  // ⚠️ **拖拽成败本仓无从判定** —— 端口走 `send` 无回执（TD-16-63）⇒ 只报「宿主缺失 / 调用抛出」。
  /** 本次按下的起点 + 待拖条目（原 `O.current`） */
  const pressRef = useRef<{ x: number; y: number; item: NewImageItem } | null>(null);
  /** 这一次「按下→抬起」里**已经起过拖**——用来**吞掉紧随其后的 click**（原 `F.current` + `pe`） */
  const draggedRef = useRef(false);
  const dragStartedRef = useRef(false);
  /** 拖拽预演幽灵（原 `M` 的 `{x,y,src,name}`）—— 只在「按下 → 过阈值」之间可见 */
  const [ghost, setGhost] = useState<{ x: number; y: number; src: string; name: string } | null>(null);
  /** 是否处于按下态（**它才是挂 window 监听的开关**） */
  const [pressing, setPressing] = useState(false);

  useEffect(() => {
    if (!pressing) return;
    const onMove = (e: MouseEvent): void => {
      const p = pressRef.current;
      if (!p || dragStartedRef.current) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > NEW_IMAGES_DRAG_THRESHOLD_PX) {
        // ★ 过阈值 ⇒ 起系统拖拽（原 `A.current = true; se(re.it)`）
        dragStartedRef.current = true;
        setGhost(null); // 原 `se` 开头的 `U(null)`
        // ⚠️ 端口只可能报「宿主缺失 / 调用抛出」；**拖拽是否真的成功无从得知**（TD-16-63）
        const r = hostOps.dragFileOut({ dataUrl: p.item.dataUrl, name: p.item.name });
        if (!r.ok) pushToast(NEW_IMAGES_TEXT.dragFailed(r.message), 4000, 'error');
      } else {
        // 未过阈值 ⇒ 幽灵跟着光标走（原 `U(Ve => ({...Ve, x, y}))`）
        setGhost({ x: e.clientX, y: e.clientY, src: p.item.dataUrl, name: p.item.name });
      }
    };
    const onUp = (): void => {
      // 原 `te`（mouseup）：收尾，并把「这次有没有拖过」交给 click 抑制（原 `F.current = A.current`）
      draggedRef.current = dragStartedRef.current;
      pressRef.current = null;
      setGhost(null);
      setPressing(false);
    };
    // ⚠️ 与源的一处**有意差异**（写明）：源版**常挂** window 监听（effect 空依赖、内部判 `O.current`）；
    //    本实现**只在按下期间挂**（等价、更省）。二者语义相同：都由 `mouseup` 收尾。
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pressing, hostOps, pushToast]);

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
    } catch (e) {
      // ★ **TD-16-53 清偿**：此前是 `try/finally` **无 `catch`** ⇒ 一旦抛出就成 unhandledRejection
      //   （界面还把 busy 复位了，看不出出过事）。原则 6：不静默 —— **原文透传**上报。
      pushToast(toMessage(e), 6000, 'error');
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

  /**
   * 缩略图**按下**（原 `V` 226-264）：记待定态 + 起幽灵预览。
   * （「仅左键」由 `NewImagesThumb` 那侧判过 —— 与源同一个位置 `V:225-227`。）
   * ⚠️ 源版此处还会给 webview 容器加 `.nip-drop-active`（落点高亮）—— 本仓**不落**，
   *    理由见 `NewImagesPanel.module.css` 头注（需跨层全局类，不为它开全局 CSS 例外）。
   */
  const startPress = (item: NewImageItem, x: number, y: number): void => {
    draggedRef.current = false; // 原 `F.current = false`
    dragStartedRef.current = false; // 原 `D.current = false`
    pressRef.current = { x, y, item };
    setGhost({ x, y, src: item.dataUrl, name: item.name });
    setPressing(true);
  };

  /**
   * 缩略图**点击**（原 `pe` 265-273）：★ **刚拖过一次就吞掉这次 click**
   *
   * ⚠️ 少了这一步，「拖出去」在缩略图上松手后会**紧接着补一次"发送到画布"**
   *    （源版那个 `F.current` 就是为此存在的）。
   */
  const handleThumbClick = (item: NewImageItem): void => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    send(item);
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
        <div className={shared.panelHead}>
          <div className={styles.title}>
            {NEW_IMAGES_TEXT.title}
            <span className={styles.count}>{items.length}</span>
            {/* 值守中的小圆点（原 606）—— 与状态机圆点**不是**一个东西（这个表示"值守开着"） */}
            {autoWatchOn && <span className={styles.live} title={NEW_IMAGES_TEXT.liveTitle} />}
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
          <div className={shared.panelBody}>
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
                    onSend={handleThumbClick}
                    onRemove={remove}
                    onPressStart={startPress}
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
              {/*
                ★ **自动值守开关**（原 674-677）—— 2026-10-11 接通。
                ⚠️ 谁能值守 / 什么节奏由**适配器**声明（`SitePort.autoWatch`）：`tapnow` 声明、
                  **`lovart` 刻意不声明**（风控：`docs/10` #11 只点名 Lovart）⇒ 本组件**不知道** Lovart 是谁。
                ⚠️ 开关只写 store（`setAutoWatchFlag`）；**真的起停**由上面那个 effect 交给控制器。
              */}
              <button
                type="button"
                className={styles.auto}
                title={autoWatchOn ? NEW_IMAGES_TEXT.autoOnTitle : NEW_IMAGES_TEXT.autoOffTitle}
                onClick={() => {
                  const next = !autoWatchOn;
                  setAutoWatchFlag(next);
                  // ★ 与源一致（原 426/427，逐字 + 2000ms）
                  pushToast(
                    next ? NEW_IMAGES_TEXT.autoOnToast : NEW_IMAGES_TEXT.autoOffToast,
                    2000,
                    'info',
                  );
                }}
              >
                <span className={`${styles.autoDot} ${autoWatchOn ? styles.autoDotOn : ''}`} />
                {autoWatchOn ? NEW_IMAGES_TEXT.autoRunning : NEW_IMAGES_TEXT.autoPaused}
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

      {/*
        拖拽预演幽灵（原 687-693 的 `.nip-ghost`）—— **只在「按下 → 过 6px 阈值」之间可见**
        （过阈值后系统拖拽接管，源版同法 `U(null)`）。
        ⚠️ `left/top` 是**动态值**（跟随光标 + 12px 偏移，与源一致）⇒ 行内 style；其余样式走 token。
      */}
      {ghost && (
        <div className={styles.ghost} style={{ left: ghost.x + 12, top: ghost.y + 12 }}>
          <img
            className={styles.ghostImg}
            src={withThumb(ghost.src, 64)}
            alt={ghost.name}
            draggable={false}
          />
          <span className={styles.ghostTip}>{NEW_IMAGES_TEXT.ghostTip}</span>
        </div>
      )}
    </div>
  );
}
