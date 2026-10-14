/**
 * 账号节点（`type: 'account'`）—— 对应原 `OL.jsx`（525 行）
 *
 * ★★ **它的语义**（源 `OL.jsx:498-501` 的按钮 `title` **逐字**）：
 *    **同步比例/时长/模型，并把文本框与素材填入所选账号对话框（不触发发送）**
 *    ⇒ 它是**「填表」节点**，不是「发送」节点。可选 `autoSend` 会连点击发送一起做。
 *
 * ★★ **2026-10-10 补的三处（此前都是断链）**：
 *   ① **绑号** —— `data.accountId` **从来没有任何地方写过** ⇒ 建出来的账号节点永远渲染
 *      「账号不存在」（旧实现的占位）。现在接 `AccountPicker`（**绑定模式**）。
 *   ② **输入收集** —— `x = RL(state, nodeId)`（原 `OL.jsx:177`）：沿**入边反向**收集全部上游、
 *      拓扑排序、汇总上游文本框与它们的 `@` 引用素材。移植到 `core/rules/accountNode.ts`。
 *      （`buildAccountNodePayload`（原 `$L`）**只有测试调用、零运行时消费者**，正是缺了它。）
 *   ③ **`autoSend` 开关**（原 `OL.jsx:418-427`，一个滑块 + `title`）。
 *
 * ★★ **2026-10-12 接通**（原来是恒禁用的占位）：按钮 → `accountOps.sendAccountNode(id)` ——
 *   上游文本/素材 → 报文（原 `$L`）→ `withBackendPage`（租约）→ `site.send`；
 *   `site.send` 现在**尊重 `payload.autoSend`**（关 ⇒ **只填不点**，原 `Be` 的 Phase 3）。
 *   反馈条（`sending`/成功摘要/失败原文）+ 4s 自动清 + `err` 时的 ✕ 也一并落地（原 `:509-520`）。
 * ⚠️ 与源的一处差异（如实标注）：无 `retrying` 档（本仓传输层没有重试循环）。
 *   ★ 源的 `precheck && !precheck.pass` 那档摘要**已落**（`accountSendFeedback` 翻成 `error` +
 *     警告，原 `OL.jsx:340`/`:353-355`）—— `autoSend=false`（只填入）时 `send` 照走 `ok` 但带
 *     `pass:false`，本节点据此显示成 `err`（`TD-16-117`）。
 */

import { useEffect, useMemo, useState } from 'react';
// ★ 默认通道的唯一真源（数据层：`core/model/defaults`）
import { DEFAULT_CHANNEL } from '@/core/model/defaults';
import { useAccountOps, useStore } from '@/state';
import { NodeShell } from './NodeShell';
import { AccountPicker } from '@/ui/common/AccountPicker';
import { collectAccountNodeInputs } from '@/core/rules/accountNode';
import { formatElapsed, timerBand, type TimerBand } from '@/core/rules/nodeStatus';
import { hasVideoDescendant } from '@/core/rules/genDetect';
import { ACCOUNT_NODE_TEXT } from '@/constants/text';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

/** 「已过时长」的重渲染心跳（ms，原 `OL.jsx:240` 的 `setInterval(V, 250)`） */
const TIMER_TICK_MS = 250;

/**
 * 档位 → `title`（原 `OL.jsx:415` 的嵌套三元）
 * ⚠️ 与 `timerBand` 的档位**一一对应**（判断只写一份，这里只做映射）
 */
const TIMER_TITLE: Record<TimerBand, string> = {
  red: ACCOUNT_NODE_TEXT.timerTitleRed,
  yellow: ACCOUNT_NODE_TEXT.timerTitleYellow,
  normal: ACCOUNT_NODE_TEXT.timerTitleNormal,
};

export function AccountNode({ id, data, selected }: RFNodeProps<'account'>) {
  const accounts = useStore((s) => s.accounts);
  const groups = useStore((s) => s.groups);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const library = useStore((s) => s.library);
  const patchNodeData = useStore((s) => s.patchNodeData);
  const sendState = useStore((s) => s.nodeSendStates[id]);
  /** ★ 「填入」的编排在控制器（`state/accountOps`）—— 本组件**不写 store**（原则 1） */
  const accountOps = useAccountOps();

  /**
   * ★ 上游输入（原 `OL.jsx:177-179` 的 `x = RL(state, nodeId)`）
   * ⚠️ `total` 正是源版判「未连接文本框或素材」的依据（`OL.jsx:302`）
   */
  const inputs = useMemo(
    () => collectAccountNodeInputs({ nodeId: id, nodes, edges, library }),
    [id, nodes, edges, library],
  );

  /** 状态行的四态（原 `OL.jsx:498-501` 的 `account-send-btn` 类名） */
  const status = sendState?.status ?? 'idle';

  /**
   * ★ **「已过时长」计时器**（原 `OL.jsx:211-255`）—— 数据源 `nodeTimers[nodeId]`，
   *   写方 = `state/postSendDetect`（探到「已提交」时把 pending 转正）· `state/autoConfirm` ·
   *   `accountOps.sendAccountNode`（无视频后代时登记 `setNodePendingTimer`）。
   */
  const timerStart = useStore((s) => s.nodeTimers[id] ?? null);
  const setNodeTimer = useStore((s) => s.setNodeTimer);
  /**
   * 「有没有视频后代」（原 `OL.jsx:232` 的 `F = O0(V, e)`）
   * ★ 源在 `F && z != null` 时**主动删掉计时器**（`:244-249` 的 `O(e)`）：片到了，不必再计时。
   */
  const hasVideo = useMemo(() => hasVideoDescendant(nodes, edges, id), [nodes, edges, id]);
  useEffect(() => {
    // ⚠️ **不新增 `removeNodeTimer` 动作**：源确实另有 `removeNodeTimer`（31862），
    //    但它与 `setNodeTimer(id, null)` **同效** ⇒ 按「能一种的别搞两种」并掉（不影响用户功能）。
    if (hasVideo && timerStart != null) setNodeTimer(id, null);
  }, [hasVideo, timerStart, id, setNodeTimer]);
  /**
   * ★ **重渲染心跳**（原 `OL.jsx:233-243` 的 `[D, A]` + `setInterval(V, 250)`）——
   *   源在**渲染期**读 `Date.now()` 算已过时长（`docs/11` §9.1 禁渲染期读时钟）
   *   ⇒ 本仓把"现在"收进 state（与 `TextNode` 的倒计时同一法）。
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (timerStart == null) return;
    const t = window.setInterval(() => setNowMs(Date.now()), TIMER_TICK_MS);
    return () => window.clearInterval(t);
  }, [timerStart]);
  /**
   * 已过时长 + 档位（`timerStart == null` ⇒ 不渲染，值恒 0 无所谓）
   * ⚠️ `nowMs` 在"计时起点刚变"时最多**旧 250ms** ⇒ 夹到 0（显示 `00:00` 一瞬，下一拍纠正）——
   *   与 `TextNode` 的倒计时同一法；**不在 effect 里同步 `setState`**（会触发级联渲染，eslint 挡）。
   */
  const elapsed = timerStart != null ? Math.max(0, nowMs - timerStart) : 0;
  const band = timerBand(elapsed);

  return (
    /*
     * ── 骨架（**逐行对源** `OL.jsx:408-525`）──
     *   `.node-head`：`dot.account-dot` · `发送节点` · `timer-inline` · **`auto-send-toggle`（滑块）**
     *   `.account-body`：
     *     `.account-top-row` → `[账号下拉] [发送按钮]`
     *     → `.account-feedback`（`msg` + 失败时的关闭钮）
     *     → `.account-summary`（有输入时：`已链接 N 张素材 · N 个文本框`）
     *
     * ⚠️ **2026-10-12 清掉三处"本工程新增"**（源里都没有，且都在卡片上显眼）：
     *   ① 头部 `meta` 的账号类型（未绑号时印一个 `—`）；
     *   ② `.account-preview`「将填入 …」整块；
     *   ③ `.account-pending` 那句开发说明（现在只留在按钮 `title` 里）。
     */
    <NodeShell
      type="account"
      title={ACCOUNT_NODE_TEXT.title}
      /*
        中槽 = 「已过时长」计时器 + 自动发送开关（源顺序：`发送节点` · `timer-inline` · `auto-send-toggle`）
      */
      meta={
        <>
          {/*
            已过时长（原 `OL.jsx:415`）—— **只在「没有视频后代」且有时计时起点时**出现；
            档位（红/黄）与 `title` 由 `timerBand` 一处判定，别在类名与 title 里各写一遍。
          */}
          {!hasVideo && timerStart != null && (
            <span
              className={`${styles.timerInline}${
                band === 'red'
                  ? ` ${styles.timerRed}`
                  : band === 'yellow'
                    ? ` ${styles.timerYellow}`
                    : ''
              }`}
              title={TIMER_TITLE[band]}
            >
              {formatElapsed(elapsed)}
            </span>
          )}
          <label className={styles.autoSend} title={ACCOUNT_NODE_TEXT.autoSendTitle}>
            <input
              type="checkbox"
              checked={!!data.autoSend}
              onChange={(e) => patchNodeData(id, { autoSend: e.target.checked })}
            />
          </label>
        </>
      }
      selected={selected}
    >
      <div className={styles.accountBody}>
        <div className={styles.accountTopRow}>
          {/* 绑号（原 `OL.jsx:434` 的 `foot-btn-account`）—— 绑定模式，落值回调的是**账号 id** */}
          <AccountPicker
            value={data.accountId ?? ''}
            channel={DEFAULT_CHANNEL}
            accounts={accounts}
            groups={groups}
            apiReady={false}
            // 绑定模式下不用 `onChange` / `apiReady`
            onChange={() => undefined}
            onBind={(accountId) => patchNodeData(id, { accountId })}
          />
          {/*
            「发送」（原 `OL.jsx:498-507`）—— 标签照抄源版（`↑ 发送` / `⟳ 发送中…`），
            `title` 用源 `:501` 逐字那句。★ **2026-10-12 起按钮已启用**（「填入」通道落地）。
          */}
          <button
            type="button"
            className={styles.accountSend}
            disabled={status === 'sending'}
            title={ACCOUNT_NODE_TEXT.sendTitle}
            onClick={() => void accountOps.sendAccountNode(id)}
          >
            {status === 'sending' ? (
              <>
                <span className={styles.sendSpinner}>⟳</span>
                {ACCOUNT_NODE_TEXT.sendBusy}
              </>
            ) : (
              <>
                <span className={styles.sendIcon}>↑</span>
                {ACCOUNT_NODE_TEXT.send}
              </>
            )}
          </button>
        </div>

        {/* 状态行（原 `OL.jsx:509-520`）—— 只在非 `idle` 时出现；`err` 时带一颗 ✕ */}
        {sendState?.msg && status !== 'idle' && (
          <div className={`${styles.accountFeedback} ${styles[`st_${status}`] ?? ''}`}>
            <span className={styles.accountFeedbackMsg}>{sendState.msg}</span>
            {status === 'error' && (
              <button
                type="button"
                className={styles.accountFeedbackClose}
                title={ACCOUNT_NODE_TEXT.closeTitle}
                onClick={(e) => {
                  // 原 `:512-516`：先 `stopPropagation`（别让画布跟着点），再清状态（顺手撤自动清定时器）
                  e.stopPropagation();
                  accountOps.dismissAccountFeedback(id);
                }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* 汇总行（原 `OL.jsx:521-523`）—— **有输入才出现** */}
        {inputs.total > 0 && (
          <div className={styles.accountSummary}>
            {ACCOUNT_NODE_TEXT.linkedSummary(inputs.materials.length, inputs.texts.length)}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
