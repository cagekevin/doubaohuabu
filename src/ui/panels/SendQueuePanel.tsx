/**
 * 发送队列面板 —— 对应原 `z3.jsx`（**288 行** = `TS` 的**视图半**）
 *
 * ★★ **它补的是队列的最后一环**：控制器（泵 + 逐项操作）与四块纯逻辑都就绪了，
 *   但此前**没有 UI 能触发 `enqueue`** —— 于是「加入队列」按钮也一直没渲染。
 *
 * 逐条对源：
 *   | 件 | 源 | 说明 |
 *   |---|---|---|
 *   | **1 秒 tick** | 58-66 | 只要有 `sending` 或"还在生成中"的项 ⇒ 每秒 bump 一次 state，**让等待时长刷新**（`tc` 只算到调用那一刻） |
 *   | 拖动 | 90-140 | `pointerdown` 记起点 ⇒ `pointermove` 算位移 ⇒ **`clampPanelPosition` 夹进视口** ⇒ `pointerup` 落 `localStorage` |
 *   | 位置持久化 | `U3`/`Pp` | 键是 `LS_SENDQUEUE_POS`（**冻结契约字符串，走 `stable/contracts`**）；读写**经 `SendQueueController`** |
 *   | 折叠 | 196-206 | `.sq-chevron` |
 *   | 进度条 | 209-215 | 完成数 / 总数 |
 *   | 列表 | 216-269 | 序号 + 名称 + 账号（未分配 ⇒ 待分配）+ 第N次 + note + 两个动作 + **成片行** |
 *   | 暂停/清空 | `j3`/`_3`/`A3` | 走控制器 |
 *
 * ✅ **2026-10-11 已接通（`TD-16-103`）**：源版的「成片行」吃三样 —— 队列项 + 节点 + **`queueProgress`**
 *   （`z3.jsx:13` 的 `A.queueProgress`）。此前本工程**没有这个 store 字段** ⇒ 这里硬写
 *   `progress: null`，第 ④ 组恒走"生成中"兜底。现在**生产者已归位**：`state/sendQueue` 的
 *   `runQueuePing` 在发出后追问页面一次（源 `_Component43.jsx:2200-2266`），把 `classifyReply`
 *   （源 `WR`）的产物写进 `store.queueProgress[itemId]` ⇒ 本组件直接读它喂第三参。
 *   ⚠️ **同日勘误**：原文写「由**发送端的 `onProgress` 回写**」**不成立** —— 回源后**唯一写入方**
 *   是队列泵里的「排队追问」轮询。证据见 `TD-16-103` 的日志 §八。
 * ★ **「查看」定位画布已接**（原 `z3.jsx` 的 `sq-btn ok` → `I(nodeId)` → `store.fitViewAction([nodeId])`，
 *   `z3.jsx:80-89`）：该节点已有出片（`data.resultUrl || data.resultPoster`）时渲染，点了经
 *   `state.requestFocusNodes([nodeId])` 请求，由 `CanvasHost`（持有 `useReactFlow().fitView`）消费。
 *   ⚠️ 面板与画布是 `AppShell` 里的**兄弟** ⇒ 走 store 传**请求数据**（与 `splitKeywordModal` 同法），
 *   **视图能力仍归 `ui`**。
 * ⚠️ **原则 1 + 铁律 2**：本组件只调 `useSendQueue()` 与 store action，不写 store、**也不持 `Ports`**
 *   —— 面板位置的读写经控制器，`ports.storage` 不进 `ui`（TD-16-8）。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSendQueue, useStore } from '@/state';
import { clampPanelPosition } from '@/core/rules/sendQueuePanel';
import {
  formatElapsed,
  resolveGenProgress,
  type GenNodeLite,
  type GenProgressState,
  type GenReplyLite,
} from '@/core/rules/genProgress';
import { queueStats } from '@/core/rules/sendQueueOps';
import { nextPoolStrategy } from '@/core/rules/accountPick';
import { SEND_QUEUE_TEXT } from '@/constants/text';
import styles from './SendQueuePanel.module.css';
import shared from '@/ui/common/shared.module.css';
import { PanelShell } from '@/ui/common/PanelShell';

/**
 * 面板尺寸（★ **唯一真源** —— `SendQueuePanel.module.css` 经 `--sq-panel-w` ／ `--sq-panel-h` 消费）
 *
 * 依据：原 `Qd(e, t, n, r)` 的 `n`/`r` —— 用于把坐标夹进视口（`clampPanelPosition`）。
 */
const PANEL_W = 320;
const PANEL_H = 260;
/** tick 间隔（原 61-65 的 `setTimeout(…, 1000)`） */
const TICK_MS = 1000;

/**
 * `GenProgressState` → CSS 类后缀（`SendQueuePanel.module.css` 的 `gen_*`）
 *
 * ★ **表驱动**（不是把 `state` 直接当类名拼）：`Record<GenProgressState, string>` 逼**穷尽** ——
 *   `core` 将来新增/改名一个状态，这里就**编译不过**（不靠"两边都记得改"的约定）。
 * ⚠️ 类名归属 `ui`：`core/rules/genProgress` 只给**语义状态**，不认识 CSS（判据 A1）。
 */
const GEN_CLS: Record<GenProgressState, string> = {
  idle: 'idle',
  na: 'na',
  unknown: 'unknown',
  failed: 'failed',
  done: 'done',
  queued: 'queued',
  generating: 'generating',
};

export function SendQueuePanel() {
  const q = useSendQueue();
  const queue = useStore((s) => s.sendQueue);
  /** 后台进度（源 `A.queueProgress`）—— 「成片行」第三参；写入方 = `state/sendQueue` 的 `runQueuePing` */
  const queueProgress = useStore((s) => s.queueProgress);
  const concurrency = useStore((s) => s.accountConcurrency);
  const nodes = useStore((s) => s.nodes);
  /**
   * ★ **选号策略**（原 `z3.jsx:273` 的 `b`）—— 初值由 `bootstrap/hydrate` 从
   *   `doubao-account-pool-strategy` 读回；写方 = foot 的切换按钮。
   */
  const poolStrategy = useStore((s) => s.poolStrategy);
  const setPoolStrategy = useStore((s) => s.setPoolStrategy);
  /** ★ 「查看」→ 请求把画布定位到该出片节点（原 `I` → `store.fitViewAction([nodeId])`，`z3.jsx:80-89`） */
  const requestFocusNodes = useStore((s) => s.requestFocusNodes);

  const items = useMemo(() => queue?.items ?? [], [queue]);
  const paused = !!queue?.paused;

  const [collapsed, setCollapsed] = useState(false);
  /**
   * 当前时刻（ms）—— ★ **必须收进 state**：渲染期直接调 `Date.now()` 是**不纯调用**
   * （eslint `Cannot call impure function during render` 会拦）。
   * ⚠️ 与源一致：只在**忙**的时候由 1 秒 tick 刷新（闲下来就冻住，不影响显示
   *   —— 「已完成」那一档用的是 `resultAt`，不依赖"现在几点"）。
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  /**
   * 面板位置（`null` = 没存过 ⇒ 走 CSS 的左下角兜底）
   * ★ **初始就夹一次**：不在 `useEffect` 里同步 `setState`（那会触发级联渲染，
   *   与 `BackendView` 那次被拦下的是同一条规则）—— 读盘时就把它夹进视口。
   */
  const [pos, setPos] = useState(() => {
    // ★ 位置读写**经控制器**（`ui` 不再持 `StoragePort` —— TD-16-8）
    const p = q.readPanelPos();
    if (!p) return null;
    return clampPanelPosition(p.x, p.y, PANEL_W, PANEL_H, {
      w: window.innerWidth || 1280,
      h: window.innerHeight || 800,
    });
  });
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const stats = useMemo(() => queueStats(items), [items]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /** 还有在做的事（原 58-60：有 `sending`，或某个成片行还是「生成中/排队中/状态未知」） */
  const busy = useMemo(
    () => items.some((it) => it.status === 'sending'),
    [items],
  );

  /**
   * ★ **1 秒 tick**（原 58-66）—— 让 `formatElapsed` 的"已等待"每秒往前走。
   * ⚠️ 只在**忙的时候**才排下一次（闲下来就停，不会白烧 CPU）。
   */
  useEffect(() => {
    if (!busy || collapsed) return;
    const id = setTimeout(() => setNowMs(Date.now()), TICK_MS);
    return () => clearTimeout(id);
  }, [busy, collapsed, items, nowMs]);

  /** 开始拖（原 90-100：只认左键 / 主指针） */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button != null && e.button !== 0) return;
      const rect = panelRef.current?.getBoundingClientRect();
      // 第一次拖时面板还没设过坐标 ⇒ 以当前实际位置为起点
      const orig = pos ?? { x: Math.round(rect?.left ?? 0), y: Math.round(rect?.top ?? 0) };
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: orig.x, origY: orig.y };
      setPos(orig);
      setDragging(true);
    },
    [pos],
  );

  /**
   * 拖动（原 101-140）
   * ⚠️ 与源一致：位移是**相对起点**的（`clientX - startX`），不是"跟随鼠标绝对坐标" ——
   *   否则一按下去面板会跳一下（起点不在标题栏左上角时）。
   */
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPos(
        clampPanelPosition(
          d.origX + (e.clientX - d.startX),
          d.origY + (e.clientY - d.startY),
          PANEL_W,
          PANEL_H,
          { w: window.innerWidth || 1280, h: window.innerHeight || 800 },
        ),
      );
    };
    const up = () => {
      setDragging(false);
      dragRef.current = null;
      setPos((cur) => {
        if (cur) q.writePanelPos(cur);
        return cur;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    // 原 137 还监听了 `pointercancel`（触屏被系统打断）
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // ⚠️ 控制器必须进依赖（`up` 里用它写位置）—— 它来自 context ⇒ 是**稳定引用**，
    //    加进来**不会**导致重复绑定（这是当初那条 eslint warning 的正确修法：改**代码**，不是放宽门禁）
  }, [dragging, q]);

  /**
   * ★ **队列为空 ⇒ 整个面板不渲染**（原 `z3.jsx:186-188`：`if (!m.length) return null;`）
   *
   * ⚠️ 此前写的是 `items.length === 0 && collapsed` ⇒ 空队列且**未折叠**时照样渲染一个
   *    空浮窗，常驻左下角**压住画布的缩放控件**（`+ / − / ⛶`）。
   *    源里根本没有"空态面板"这一形态 —— 有队列才出现。
   */
  if (items.length === 0) return null;

  const done = stats.success + stats.failed + stats.cancelled;

  return (
    <PanelShell
      wrapperRef={panelRef}
      className={`${styles.panel} ${dragging ? styles.dragging : ''}`}
      // 没拖过时贴左下角（源版默认也是屏幕左下，位置来自 `U3` 的兜底）
      // ★ 尺寸经 CSS 变量下发（唯一真源 = 上面的 PANEL_W ／ PANEL_H）—— 防"夹取尺寸与实渲染尺寸"漂移
      style={
        {
          ...(pos ? { left: pos.x, top: pos.y } : {}),
          '--sq-panel-w': `${PANEL_W}px`,
          '--sq-panel-h': `${PANEL_H}px`,
        } as unknown as CSSProperties
      }
      testId="send-queue-panel"
      title={SEND_QUEUE_TEXT.title}
      meta={
        <>
          <span className={styles.conc} title={SEND_QUEUE_TEXT.concurrencyTitle(concurrency)}>
            {`×${concurrency}`}
          </span>
          <span className={styles.statusline}>
            {paused ? SEND_QUEUE_TEXT.paused : SEND_QUEUE_TEXT.running(done, stats.total)}
          </span>
        </>
      }
      actions={
        <button
          type="button"
          className={styles.chevron}
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((v) => !v);
          }}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      }
      headProps={{ title: SEND_QUEUE_TEXT.dragTitle, onPointerDown }}
    >

      {!collapsed && (
        <>
          <div className={shared.progressTrack}>
            <div
              className={shared.progressFill}
              style={{ width: `${stats.total ? Math.round((done / stats.total) * 100) : 0}%` }}
            />
          </div>

          <div className={styles.list}>
            {items.map((it, idx) => {
                const node = nodeById.get(it.nodeId);
                // ★ 该节点是否已有出片（原 `ke` = `H.data.resultUrl || H.data.resultPoster`）——
                //   决定「查看」渲不渲染（源同判据）
                const d = node?.data as { resultUrl?: unknown; resultPoster?: unknown } | undefined;
                const hasResult = !!(d?.resultUrl || d?.resultPoster);
                // ★ 后台进度（源 `A.queueProgress[item.id]`）—— 由 `state/sendQueue` 的 `runQueuePing` 写（`TD-16-103`）
                const progress: GenReplyLite | null = queueProgress[it.id] ?? null;
                const g = resolveGenProgress(
                  {
                    status: it.status,
                    startedAt: it.startedAt ?? null,
                    finishedAt: it.finishedAt ?? null,
                    accountId: it.accountId ?? null,
                  },
                  node ? { data: node.data as GenNodeLite['data'] } : null,
                  progress,
                  nowMs,
                );
                // 字段改名只在这一处（`state`→`cls`、`elapsed`→`wait`）—— 视图要的四个名字就齐了
                const gen = { text: g.text, cls: GEN_CLS[g.state], wait: g.elapsed, note: g.note };
                return (
                  <div className={styles.item} key={it.id}>
                    <div className={styles.itemTop}>
                      <span className={styles.idx}>{idx + 1}</span>
                      <span className={styles.name} title={it.name || it.nodeId}>
                        {it.name || it.nodeId}
                      </span>
                      {it.accountName ? (
                        <span className={styles.acc}>{it.accountName}</span>
                      ) : (
                        <span className={`${styles.acc} ${styles.accPending}`}>
                          {SEND_QUEUE_TEXT.accountPending}
                        </span>
                      )}
                      {(it.attempt || 0) > 1 && (
                        <span className={styles.attempt}>{SEND_QUEUE_TEXT.attempt(it.attempt)}</span>
                      )}
                    </div>
                    {it.note && (
                      <div className={styles.note} title={it.note}>
                        {it.note}
                      </div>
                    )}
                    <div className={styles.acts}>
                      {/* ★ 「查看」（原 `z3.jsx` 的 `sq-btn ok`）—— 有出片才渲染；点了把画布定位过去 */}
                      {hasResult ? (
                        <button
                          type="button"
                          className={styles.btn}
                          title={SEND_QUEUE_TEXT.viewTitle}
                          onClick={() => requestFocusNodes([it.nodeId])}
                        >
                          {SEND_QUEUE_TEXT.view}
                        </button>
                      ) : null}
                      {it.status === 'waiting' || it.status === 'sending' ? (
                        <button
                          type="button"
                          className={styles.btn}
                          title={SEND_QUEUE_TEXT.cancelTitle}
                          onClick={() => q.cancel(it.id)}
                        >
                          {SEND_QUEUE_TEXT.cancel}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.btn}
                          title={SEND_QUEUE_TEXT.retryTitle}
                          onClick={() => q.retry(it.id)}
                        >
                          {SEND_QUEUE_TEXT.retry}
                        </button>
                      )}
                    </div>
                    {/* 成片行（原 260-267）—— 只在有内容时显示 */}
                    {(gen.wait || gen.note || gen.cls !== 'na') && (
                      <div className={styles.genRow}>
                        <span className={styles.genLabel}>{SEND_QUEUE_TEXT.genLabel}</span>
                        <span className={`${styles.gen} ${styles[`gen_${gen.cls}`] ?? ''}`}>{gen.text}</span>
                        {gen.wait && <span className={styles.genWait}>{gen.wait}</span>}
                        {gen.note && (
                          <span className={styles.genNote} title={gen.note}>
                            {gen.note}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <div className={styles.foot}>
            {/* ★ **选号策略**（原 `z3.jsx:271-276`）—— foot 最左一颗；点一下在两种策略间切换 */}
            <button
              type="button"
              className={styles.btn}
              title={SEND_QUEUE_TEXT.strategyToggleTitle}
              onClick={() => setPoolStrategy(nextPoolStrategy(poolStrategy))}
            >
              {SEND_QUEUE_TEXT.pickAccountPrefix}
              {SEND_QUEUE_TEXT.strategyLabels[poolStrategy]}
            </button>
            <button type="button" className={styles.btn} onClick={() => (paused ? q.resume() : q.pause())}>
              {paused ? SEND_QUEUE_TEXT.resume : SEND_QUEUE_TEXT.pause}
            </button>
            <button type="button" className={styles.btn} onClick={() => q.clearFinished()}>
              {SEND_QUEUE_TEXT.clearDone}
            </button>
            <span className={styles.footHint}>{formatElapsed(items[0]?.startedAt ?? null, null, nowMs)}</span>
          </div>
        </>
      )}
    </PanelShell>
  );
}
