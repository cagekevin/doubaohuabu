/**
 * 批量发送面板（原 `L3.jsx` 256 行 —— `x3` 的**视图半**）
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 目标集合 | `L3.jsx:14-19` | **选中**且 `text`/`genvideo` |
 *   | 触发按钮 | `174-190` | 「批量发送 · {n}」+「加入队列」 |
 *   | 运行中标题 | `197` | `批量发送中 · {done}/{total}` |
 *   | 完成标题 | `197` | `批量发送完成 · 成功 {k} · 失败 {N}${C ? ` · 跳过 ${C}` : ''}` |
 *   | 全部中止 | `199` | 置 abort 闩（原 `w`） |
 *   | 进度条 | `207-211` | `width: done/total*100%` |
 *   | 列表项 | `212-226` | 序号 + 名称 + 状态 chip（`D3`）+ msg |
 *   | 决策区 | `228-246` | 「{name}」发送失败：{msg}（还有 n 个…）+ 继续/中止 |
 *   | 汇总 | `247-252` | aborted 提示 + 执行顺序说明 |
 *
 * ★ **触发条落点 = 视口数学**（原 `L3.jsx:20-49`，**逐行**）：
 *   用 `useViewport()` 的 `{x,y,zoom}` 把选中节点包围盒（`useReactFlow().getNodesBounds`）
 *   换算成视口坐标，浮在包围盒**上/下方**（常量 `Xd/Yd/Jd/R3` 见 `@/constants`）。
 *   ⚠️ 因此本组件**必须住在 `ReactFlowProvider` 内**（与 `GenPanel` 同因）——
 *      由 `CanvasHost` 渲染，**不在** `AppShell`。
 *
 * ⚠️ 「加入队列」按钮（原 `L3.jsx:187-189`）**已接通并渲染**（队列子系统：纯逻辑 / store /
 *    控制器 / 面板均就位，见下方 `:146-149`）。
 *
 * ⚠️ 原则 1：本组件**不写 store**（状态写回走 `setNodeSendState` 这个 **action**，
 *    批量编排走 `useBatchSend()`）—— 与源版把两者就地 `setState` 不同，但结论一致。
 */

import { useMemo, useRef, useState } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { useBatchSend, useSendQueue, useStore } from '@/state';
import type { BatchDecision, BatchResultItem, BatchSummary } from '@/core/usecases/sendQueue';
import {
  BS_TRIGGER_GAP,
  BS_TRIGGER_MARGIN_X,
  BS_TRIGGER_MIN_TOP,
  BS_TRIGGER_OFFSET_Y,
} from '@/constants';
import { BATCH_SEND_TEXT } from '@/constants/text';
import { log } from '@/lib/log';
import styles from './BatchSendPanel.module.css';
import shared from '@/ui/common/shared.module.css';
import { PanelShell } from '@/ui/common/PanelShell';

type Phase = 'idle' | 'running' | 'done';

export function BatchSendPanel() {
  const nodes = useStore((s) => s.nodes);
  const setNodeSendState = useStore((s) => s.setNodeSendState);
  const batch = useBatchSend();

  const [phase, setPhase] = useState<Phase>('idle');
  const [items, setItems] = useState<BatchResultItem[]>([]);
  const [decision, setDecision] = useState<BatchDecision | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  /** 原 `h.current`：决策的 resolve（同一个时刻只可能有一个未决） */
  const resolveRef = useRef<((a: 'continue' | 'abort') => void) | null>(null);
  /** 原 `m.current`：已中止闩（一旦置位，后续节点全跳过） */
  const abortedRef = useRef(false);

  /** 原 `L3.jsx:13-19`：选中且 `text`/`genvideo` */
  const q = useSendQueue();
  /** 入队要节点名（与批量列表同口径）⇒ 从 store 取一次全量，再按 id 找 */
  const allNodes = useStore((s) => s.nodes);
  const targetIds = useMemo(
    () => nodes.filter((n) => n.selected && (n.type === 'text' || n.type === 'genvideo')).map((n) => n.id),
    [nodes],
  );

  /** 画布视口（原 `Tu()`）—— 把 flow 坐标换算成视口坐标 */
  const viewport = useViewport();
  /** `getNodesBounds`（原 `Kr()`）—— 传 **id** 即可（xyflow 从内部 store 解析，免类型断言） */
  const { getNodesBounds } = useReactFlow();

  /**
   * ★ 触发条落点（原 `L3.jsx:20-49`，**逐行**）—— 相对 `.wrap`/`.react-flow` 原点的视口坐标。
   *
   * 源逐行：
   * ```js
   * if (r.length < 2) return null;                       // r = 选中的 text/genvideo
   * const S = e.filter(R => R.selected);
   * if (S.length < 2) return null;                       // 选中总数 < 2 也不出
   * let E; try { E = n(S); } catch { return null; }
   * const P = t.zoom || 1;
   * const j = (E.x + E.width / 2) * P + t.x;             // 中心 X
   * const I = E.y * P + t.y;                             // 上边 Y
   * const z = (E.y + E.height) * P + t.y;                // 下边 Y
   * const O = I - Xd - Yd - Jd >= R3;                    // 上方放得下吗
   * return { left: j, top: O ? I - Xd - Yd - Jd : z + Xd + Yd + Jd,
   *          transform: O ? 'translate(-50%, -100%)' : 'translate(-50%, 0)' };
   * ```
   * ⚠️ 源的 `catch {}` 是**空吞**（ReactFlow 实例未就绪时会抛）—— 本实现**留痕**（原则 6），
   *    语义等价（失败 ⇒ 不出触发条，不重试）。
   */
  const triggerPos = useMemo(() => {
    if (targetIds.length < 2) return null;
    const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
    if (selectedIds.length < 2) return null;
    let bounds: { x: number; y: number; width: number; height: number };
    try {
      bounds = getNodesBounds(selectedIds);
    } catch (err) {
      log.warn('[BatchSendPanel] getNodesBounds 失败（画布未就绪？）:', err);
      return null;
    }
    const zoom = viewport.zoom || 1;
    const centerX = (bounds.x + bounds.width / 2) * zoom + viewport.x;
    const topY = bounds.y * zoom + viewport.y;
    const bottomY = (bounds.y + bounds.height) * zoom + viewport.y;
    const offset = BS_TRIGGER_MARGIN_X + BS_TRIGGER_OFFSET_Y + BS_TRIGGER_GAP;
    const above = topY - offset >= BS_TRIGGER_MIN_TOP;
    return {
      left: centerX,
      top: above ? topY - offset : bottomY + offset,
      transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    };
  }, [nodes, targetIds, viewport, getNodesBounds]);

  const abortAll = (): void => {
    abortedRef.current = true;
    resolveRef.current?.('abort');
    resolveRef.current = null;
  };

  const decide = (answer: 'continue' | 'abort'): void => {
    resolveRef.current?.(answer);
    resolveRef.current = null;
    setDecision(null);
  };

  const run = async (): Promise<void> => {
    abortedRef.current = false;
    setItems([]);
    setSummary(null);
    setDecision(null);
    setPhase('running');

    await batch.run(targetIds, {
      onNodeState: (e) => {
        // ① 写回 store（节点上的状态圆点 / 防重复发送守卫都读它）
        setNodeSendState(e.nodeId, {
          status: e.status,
          msg: e.msg,
          ...(e.accountId ? { accountId: e.accountId } : {}),
          ...(e.accountName ? { accountName: e.accountName } : {}),
        });
        // ② 面板自己的列表（原 `c(I => I.map(...))`）
        setItems((prev) => {
          const hit = prev.find((x) => x.nodeId === e.nodeId);
          const next: BatchResultItem = {
            nodeId: e.nodeId,
            name: e.name,
            status: e.status,
            msg: e.msg,
            ...(e.accountId ? { accountId: e.accountId } : {}),
            ...(e.accountName ? { accountName: e.accountName } : {}),
          };
          return hit ? prev.map((x) => (x.nodeId === e.nodeId ? next : x)) : [...prev, next];
        });
      },
      // 原 `onDecision`：把 resolve 存起来，等用户点「继续 / 中止」
      onDecision: (d) =>
        new Promise<'continue' | 'abort'>((resolve) => {
          if (abortedRef.current) {
            resolve('abort');
            return;
          }
          resolveRef.current = resolve;
          setDecision(d);
        }),
      shouldAbort: () => abortedRef.current,
      onSummary: (s) => {
        setSummary(s);
        setDecision(null);
        resolveRef.current = null;
        setPhase('done');
      },
    });
  };

  // 原 `L3.jsx:170-172`：没有触发位置且空闲 ⇒ 不渲染
  if (phase === 'idle' && !triggerPos) return null;

  const settled = items.filter((i) => ['success', 'error', 'skipped'].includes(i.status)).length;
  const okCount = items.filter((i) => i.status === 'success').length;
  const failCount = items.filter((i) => i.status === 'error').length;
  const skipCount = items.filter((i) => i.status === 'skipped').length;

  return (
    <>
      {phase === 'idle' && triggerPos ? (
        <div
          className={styles.triggerGroup}
          data-testid="batch-send-panel"
          style={{ left: triggerPos.left, top: triggerPos.top, transform: triggerPos.transform }}
        >
          <button
            type="button"
            className={styles.trigger}
            title={BATCH_SEND_TEXT.triggerTitle(targetIds.length)}
            onClick={() => void run()}
          >
            {BATCH_SEND_TEXT.trigger(targetIds.length)}
          </button>
          {/*
            ★ **「加入队列」**（原 `L3.jsx:187-189`）—— 2026-10-11 接通。
            ⚠️ 它此前**不渲染**：队列子系统（`sendQueue.items` + `z3.jsx`）尚未落地，
              做出来就是个**没反应的按钮**（判据 B4）。现在纯逻辑/store/控制器/面板都已就位。
            ⚠️ 与左键的分工（源版就这么分的）：**批量发送立刻跑**、跑完给决策弹窗；
              **队列排进去**、由泵按「每账号并发上限」慢慢跑，可暂停 / 取消单条 / 失败重跑。
          */}
          <button
            type="button"
            className={styles.trigger}
            title={BATCH_SEND_TEXT.triggerQueueTitle}
            onClick={() => {
              // ★ 入队（原 `$S`）—— 防重复由纯层判定（正文指纹 + 90s 窗口）
              q.enqueue(
                targetIds.map((id) => {
                  const n = allNodes.find((x) => x.id === id);
                  const label = n ? String((n.data as { label?: string }).label || '') : '';
                  // 名字与批量列表同口径：节点标签，缺则用类型名
                  return { nodeId: id, name: label || n?.type || '' };
                }),
              );
            }}
          >
            {BATCH_SEND_TEXT.triggerQueue}
          </button>
        </div>
      ) : (
        <PanelShell
          overlay
          testId="batch-send-panel"
          className={styles.card}
          title={
            phase === 'running'
              ? BATCH_SEND_TEXT.running(settled, items.length)
              : BATCH_SEND_TEXT.done(okCount, failCount, skipCount)
          }
          actions={
            phase === 'running' ? (
              <button type="button" className={styles.abort} onClick={abortAll}>
                {BATCH_SEND_TEXT.abortAll}
              </button>
            ) : undefined
          }
          onClose={phase === 'running' ? undefined : () => setPhase('idle')}
          closeLabel={BATCH_SEND_TEXT.close}
        >

          {phase === 'running' && (
            <div className={shared.progressTrack}>
              <div
                className={shared.progressFill}
                style={{ width: `${items.length ? (settled / items.length) * 100 : 0}%` }}
              />
            </div>
          )}

          <div className={styles.list}>
            {items.map((it, i) => (
              <div className={`${shared.listItem} ${styles[`st_${it.status}`] ?? ''}`} key={it.nodeId}>
                <span className={styles.idx}>{i + 1}.</span>
                <span className={styles.name} title={it.name}>
                  {it.name}
                </span>
                <span className={shared.pill}>{BATCH_SEND_TEXT.status[it.status] ?? it.status}</span>
                <span className={styles.msg} title={it.msg || ''}>
                  {it.msg || ''}
                </span>
              </div>
            ))}
          </div>

          {phase === 'running' && decision && (
            <div className={styles.decision}>
              <div className={styles.decisionMsg}>
                {BATCH_SEND_TEXT.decisionReason(decision.name, decision.msg)}
                {decision.remaining > 0
                  ? BATCH_SEND_TEXT.decisionRemaining(decision.remaining)
                  : BATCH_SEND_TEXT.decisionLast}
              </div>
              <div className={styles.decisionActions}>
                {decision.remaining > 0 && (
                  <button type="button" className={styles.continue} onClick={() => decide('continue')}>
                    {BATCH_SEND_TEXT.continueRest(decision.remaining)}
                  </button>
                )}
                <button type="button" className={styles.abort} onClick={() => decide('abort')}>
                  {BATCH_SEND_TEXT.abortNow}
                </button>
                {decision.remaining === 0 && (
                  <span className={styles.hint}>{BATCH_SEND_TEXT.decisionNoNeed}</span>
                )}
              </div>
            </div>
          )}

          {phase === 'done' && summary && (
            <div className={styles.summary}>
              {summary.aborted ? <div className={styles.note}>{BATCH_SEND_TEXT.summaryAborted}</div> : null}
              <div className={styles.note}>{BATCH_SEND_TEXT.summaryNote}</div>
            </div>
          )}
        </PanelShell>
      )}
    </>
  );
}
