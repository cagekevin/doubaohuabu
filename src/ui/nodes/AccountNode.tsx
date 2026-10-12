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
 * ⚠️⛔ **未接通（如实标注，不假装）**：源版的「填入」动作走 `Bu(pe, {onProgress})`
 *   （`OL.jsx:329`），返回里带 `imagesAttached`/`imagesTotal`/`autoClicked`/`precheck`；
 *   而本工程已落的 `SitePort.send` 是**「发送 + 等生成结果」**（`doubao/index.ts:185` 有
 *   `pollResults`）⇒ **两者不是同一个操作**，拿它冒充会把「仅填入」变成「真发出去并等出片」。
 *   ⇒ 按钮**禁用**、原因写在 `title` 里（判据 B4：不对用户承诺不存在的能力）。
 *   待接通的是 `Bu` 的**填入半**（`docs/16` 的「站点页内脚本」那一层）。
 */

import { useMemo } from 'react';
import { useStore } from '@/state';
import { NodeShell, NodeStatusDot } from './NodeShell';
import { AccountPicker } from '@/ui/common/AccountPicker';
import { collectAccountNodeInputs } from '@/core/rules/accountNode';
import { ACCOUNT_NODE_TEXT, REF_TEXT } from '@/constants/text';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function AccountNode({ id, data, selected }: RFNodeProps<'account'>) {
  const account = useStore((s) => s.accounts.find((a) => a.id === data.accountId));
  const accounts = useStore((s) => s.accounts);
  const groups = useStore((s) => s.groups);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const library = useStore((s) => s.library);
  const patchNodeData = useStore((s) => s.patchNodeData);
  const sendState = useStore((s) => s.nodeSendStates[id]);

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

  return (
    <NodeShell
      title={ACCOUNT_NODE_TEXT.title}
      meta={account?.type ?? '—'}
      selected={selected}
    >
      <div className={styles.accountBody}>
        {/* ① 绑号（原 `OL.jsx:434` 的 `foot-btn-account`） */}
        <div className={styles.accountRow}>
          {/* 登录态圆点（原 `.gp-acc-dot` 同族） */}
          <NodeStatusDot ok={!!account} />
          <AccountPicker
            value={data.accountId ?? ''}
            channel="doubao"
            accounts={accounts}
            groups={groups}
            apiReady={false}
            // 绑定模式下不用 `onChange` / `apiReady`
            onChange={() => undefined}
            onBind={(accountId) => patchNodeData(id, { accountId })}
          />
          {/* ② 自动发送开关（原 418-427：一个滑块 + `title`，**无可见文字**） */}
          <label className={styles.autoSend} title={ACCOUNT_NODE_TEXT.autoSendTitle}>
            <input
              type="checkbox"
              checked={!!data.autoSend}
              onChange={(e) => patchNodeData(id, { autoSend: e.target.checked })}
            />
          </label>
        </div>

        {/*
          ③ 输入预览（**本工程新增**：源版只在按钮上给一行状态，看不到"将要填入什么"）
          ⚠️ 它同时是"这个节点到底在做什么"的唯一可视解释 ⇒ 数量、来源、参数都摆出来
        */}
        <div className={styles.accountPreview}>
          <div className={styles.accountPreviewTitle}>{ACCOUNT_NODE_TEXT.previewTitle}</div>
          {inputs.total === 0 ? (
            <div className={styles.accountEmpty}>{ACCOUNT_NODE_TEXT.noInput}</div>
          ) : (
            <>
              {inputs.texts.map((t) => (
                <div key={t.id} className={styles.accountItem} title={t.text}>
                  {`${REF_TEXT.previewSep}文本 · ${t.text || '（空）'}`}
                </div>
              ))}
              {inputs.materials.map((m) => (
                <div
                  key={m.id}
                  className={m.dataUrl ? styles.refOk : styles.refMissing}
                  title={m.dataUrl ? m.label : REF_TEXT.previewMissing}
                >
                  {`参考图${m.refIndex}${REF_TEXT.previewSep}${m.dataUrl ? m.label : REF_TEXT.previewMissing}`}
                </div>
              ))}
            </>
          )}
        </div>

        {/* ④ 状态行（原 `OL.jsx:511` 的 `account-feedback`） */}
        {sendState?.msg && (
          <div className={`${styles.accountFeedback} ${styles[`st_${status}`] ?? ''}`}>
            {sendState.msg}
          </div>
        )}

        {/*
          ⑤ 动作按钮（原 `OL.jsx:498-501`）
          ⛔ **禁用** —— 「填入」通道未接通（见文件头）。`title` **同时**给出源版语义与本工程原因：
             不写源版那句会让用户以为按下去就是"填入"，写上去又不说明就是撒谎。
        */}
        <button
          type="button"
          className={styles.accountSend}
          /*
           * ⚠️ 与源版的一处偏离：源版**只在 `status === 'sending'` 时禁用**（`OL.jsx:501`），
           *   本工程因为「填入」通道未接通（见文件头）⇒ **恒禁用**。
           * ⚠️ 标签照抄源版（就是「发送」，语义由 `title` 补）——
           *   源版自己就是"标签写发送、title 写不触发发送"，不擅自改文案。
           */
          disabled
          title={`${ACCOUNT_NODE_TEXT.sendTitle}\n${ACCOUNT_NODE_TEXT.channelPending}`}
        >
          {status === 'sending' ? ACCOUNT_NODE_TEXT.sendBusy : ACCOUNT_NODE_TEXT.send}
        </button>

        {/*
          ⚠️ 未接通的原因**必须可见** —— 只写在 `title` 里＝要悬停才知道，
             而"按钮为什么点不动"是用户第一眼就会问的事（判据 B4 的落实）
        */}
        <div className={styles.accountPending}>{ACCOUNT_NODE_TEXT.channelPending}</div>
      </div>
    </NodeShell>
  );
}
