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
 *   | 位置持久化 | `U3`/`Pp` | 键是 `LS_SENDQUEUE_POS`（**冻结契约字符串，走 `stable/contracts`**） |
 *   | 折叠 | 196-206 | `.sq-chevron` |
 *   | 进度条 | 209-215 | 完成数 / 总数 |
 *   | 列表 | 216-269 | 序号 + 名称 + 账号（未分配 ⇒ 待分配）+ 第N次 + note + 两个动作 + **成片行** |
 *   | 暂停/清空 | `j3`/`_3`/`A3` | 走控制器 |
 *
 * ⚠️ **一处如实标注（未接通）**：源版的「成片行」吃三样 —— 队列项 + 节点 + **`queueProgress`**
 *   （第 13 行的 `A.queueProgress`，由**发送端的 `onProgress` 回写**）。本工程**没有这个 store 字段**
 *   ⇒ 这里传 `progress: null`。后果：`deriveGenView` 会走它的**兜底分支**（"生成中"）——
 *   **不会**区分出「排队中 / 未在生成」（那两档要 `progress.kind`）。
 *   `queueProgress` 的写入方属**发送适配器**那一层，已登记。
 * ⚠️ **一处有意省略**：源版点队列项能 `fitViewAction([nodeId])` 把画布定位过去（80-89）。
 *   本工程的 `CanvasHost` 还没暴露 fitView（属另一件事）⇒ **不做**（不做一个没反应的按钮）。
 * ⚠️ **原则 1**：本组件只调 `useSendQueue()` 与 store action，不写 store。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSendQueue, useStore } from '@/state';
import { LS_SENDQUEUE_POS } from '@/stable/contracts/keys';
import {
  clampPanelPosition,
  deriveGenView,
  formatElapsed,
  type QueueProgressLike,
} from '@/core/rules/sendQueuePanel';
import { queueStats } from '@/core/rules/sendQueueOps';
import { SEND_QUEUE_TEXT } from '@/constants/text';
import styles from './SendQueuePanel.module.css';

/** 面板假想尺寸（原 `Qd(e, t, n, r)` 的 `n`/`r`）—— 用于把坐标夹进视口 */
const PANEL_W = 320;
const PANEL_H = 260;
/** tick 间隔（原 61-65 的 `setTimeout(…, 1000)`） */
const TICK_MS = 1000;

/** 读回面板位置（原 `U3` 42570-42585）—— 解析失败/字段不是有限数 ⇒ `null` */
function readPanelPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(LS_SENDQUEUE_POS);
    if (!raw) return null;
    const v = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x as number, y: v.y as number };
  } catch {
    // ⚠️ 与源一致：坏数据**静默忽略**（位置丢了不影响功能）
  }
  return null;
}

function writePanelPos(pos: { x: number; y: number }): void {
  try {
    localStorage.setItem(LS_SENDQUEUE_POS, JSON.stringify(pos));
  } catch {
    // ⚠️ 存不进去（配额/隐私模式）也**不影响使用**，只影响"下次记住位置"
  }
}

export function SendQueuePanel() {
  const q = useSendQueue();
  const queue = useStore((s) => s.sendQueue);
  const concurrency = useStore((s) => s.accountConcurrency);
  const nodes = useStore((s) => s.nodes);

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
    const p = readPanelPos();
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
        if (cur) writePanelPos(cur);
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
  }, [dragging]);

  if (items.length === 0 && collapsed) return null;

  const done = stats.success + stats.failed + stats.cancelled;

  return (
    <div
      ref={panelRef}
      className={`${styles.panel} ${dragging ? styles.dragging : ''}`}
      data-testid="send-queue-panel"
      // 没拖过时贴左下角（源版默认也是屏幕左下，位置来自 `U3` 的兜底）
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <div
        className={styles.head}
        title={SEND_QUEUE_TEXT.dragTitle}
        onPointerDown={onPointerDown}
      >
        <span className={styles.title}>{SEND_QUEUE_TEXT.title}</span>
        <span className={styles.conc} title={SEND_QUEUE_TEXT.concurrencyTitle(concurrency)}>
          {`×${concurrency}`}
        </span>
        <span className={styles.statusline}>
          {paused ? SEND_QUEUE_TEXT.paused : SEND_QUEUE_TEXT.running(done, stats.total)}
        </span>
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
      </div>

      {!collapsed && (
        <>
          <div className={styles.bar}>
            <div
              className={styles.progress}
              style={{ width: `${stats.total ? Math.round((done / stats.total) * 100) : 0}%` }}
            />
          </div>

          {items.length === 0 ? (
            <div className={styles.empty}>{SEND_QUEUE_TEXT.empty}</div>
          ) : (
            <div className={styles.list}>
              {items.map((it, idx) => {
                const node = nodeById.get(it.nodeId);
                // ⚠️ `progress` 传 `null` —— 见文件头的如实标注
                const progress: QueueProgressLike | null = null;
                const gen = deriveGenView(
                  { status: it.status, ...(it.startedAt == null ? {} : { startedAt: it.startedAt }), ...(it.finishedAt == null ? {} : { finishedAt: it.finishedAt }), ...(it.accountId == null ? {} : { accountId: it.accountId }) },
                  node ? { data: node.data as { genHistory?: { attempts?: readonly { at?: number; status?: string; accountId?: string; note?: string }[] } | null; resultAt?: number } } : null,
                  progress,
                  nowMs,
                );
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
          )}

          <div className={styles.foot}>
            <button type="button" className={styles.btn} onClick={() => (paused ? q.resume() : q.pause())}>
              {paused ? SEND_QUEUE_TEXT.resume : SEND_QUEUE_TEXT.pause}
            </button>
            <button type="button" className={styles.btn} onClick={() => q.clearFinished()}>
              {SEND_QUEUE_TEXT.clearDone}
            </button>
            <span className={styles.footHint}>{formatElapsed(items[0]?.startedAt ?? null, nowMs)}</span>
          </div>
        </>
      )}
    </div>
  );
}
