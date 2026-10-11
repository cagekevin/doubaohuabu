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
 * ★ **两处有意偏离（都留痕）**：
 *   ① **位置**：源版用 `useReactFlow().getNodesBounds` + 画布 transform 把触发按钮
 *      **浮在选中节点包围盒的上方/下方**（`L3.jsx:20-49`，常量 `Yd=40/Xd=10/Jd=6/R3=6`）。
 *      本实现改成**固定在画布右下角**的卡片 —— 少一套视口数学（那套只有在 ReactFlow 内部
 *      才能算），行为（点得到、看得见）不变。
 *   ② **「加入队列」按钮不渲染**：它调 `TS({sendOne: PS()})` —— 那是**另一套子系统**
 *      （`sendQueue.items` + `z3.jsx` 的发送队列，可暂停/取消单条/失败重跑），**尚未落地**。
 *      源版按钮有 `title` 说明，但**做出来就是个没反应的按钮** ⇒ 宁可不渲染（判据 B4：
 *      不对用户承诺不存在的能力）。
 *
 * ⚠️ 原则 1：本组件**不写 store**（状态写回走 `setNodeSendState` 这个 **action**，
 *    批量编排走 `useBatchSend()`）—— 与源版把两者就地 `setState` 不同，但结论一致。
 */

import { useMemo, useRef, useState } from 'react';
import { useBatchSend, useSendQueue, useStore } from '@/state';
import type { BatchDecision, BatchResultItem, BatchSummary } from '@/core/usecases/sendQueue';
import { BATCH_SEND_TEXT } from '@/constants/text';
import styles from './BatchSendPanel.module.css';

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
  if (phase === 'idle' && targetIds.length < 2) return null;

  const settled = items.filter((i) => ['success', 'error', 'skipped'].includes(i.status)).length;
  const okCount = items.filter((i) => i.status === 'success').length;
  const failCount = items.filter((i) => i.status === 'error').length;
  const skipCount = items.filter((i) => i.status === 'skipped').length;

  return (
    <div className={styles.root} data-testid="batch-send-panel">
      {phase === 'idle' ? (
        <>
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
        </>
      ) : (
        <div className={styles.card}>
          <div className={styles.head}>
            <div className={styles.title}>
              {phase === 'running'
                ? BATCH_SEND_TEXT.running(settled, items.length)
                : BATCH_SEND_TEXT.done(okCount, failCount, skipCount)}
            </div>
            {phase === 'running' ? (
              <button type="button" className={styles.abort} onClick={abortAll}>
                {BATCH_SEND_TEXT.abortAll}
              </button>
            ) : (
              <button type="button" className={styles.close} onClick={() => setPhase('idle')}>
                {BATCH_SEND_TEXT.close}
              </button>
            )}
          </div>

          {phase === 'running' && (
            <div className={styles.progress}>
              <div
                className={styles.progressBar}
                style={{ width: `${items.length ? (settled / items.length) * 100 : 0}%` }}
              />
            </div>
          )}

          <div className={styles.list}>
            {items.map((it, i) => (
              <div className={`${styles.item} ${styles[`st_${it.status}`] ?? ''}`} key={it.nodeId}>
                <span className={styles.idx}>{i + 1}.</span>
                <span className={styles.name} title={it.name}>
                  {it.name}
                </span>
                <span className={styles.chip}>{BATCH_SEND_TEXT.status[it.status] ?? it.status}</span>
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
        </div>
      )}
    </div>
  );
}
