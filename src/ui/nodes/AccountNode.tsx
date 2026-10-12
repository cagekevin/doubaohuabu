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
import { NodeShell } from './NodeShell';
import { AccountPicker } from '@/ui/common/AccountPicker';
import { collectAccountNodeInputs } from '@/core/rules/accountNode';
import { ACCOUNT_NODE_TEXT } from '@/constants/text';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function AccountNode({ id, data, selected }: RFNodeProps<'account'>) {
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
      /* 中槽 = 自动发送开关（原 418-427：一个滑块 + `title`，**无可见文字**，紧跟标题之后） */
      meta={
        <label className={styles.autoSend} title={ACCOUNT_NODE_TEXT.autoSendTitle}>
          <input
            type="checkbox"
            checked={!!data.autoSend}
            onChange={(e) => patchNodeData(id, { autoSend: e.target.checked })}
          />
        </label>
      }
      selected={selected}
    >
      <div className={styles.accountBody}>
        <div className={styles.accountTopRow}>
          {/* 绑号（原 `OL.jsx:434` 的 `foot-btn-account`）—— 绑定模式，落值回调的是**账号 id** */}
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
          {/*
            「发送」（原 `OL.jsx:498-507`）—— 标签照抄源版（`↑ 发送` / `⟳ 发送中…`）。
            ⛔ **恒禁用** —— 「填入」通道未接通（见文件头）；`title` 同时给出源版语义与本工程原因。
          */}
          <button
            type="button"
            className={styles.accountSend}
            disabled
            title={`${ACCOUNT_NODE_TEXT.sendTitle}\n${ACCOUNT_NODE_TEXT.channelPending}`}
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

        {/* 状态行（原 `OL.jsx:509-520`）—— 只在非 `idle` 时出现 */}
        {sendState?.msg && status !== 'idle' && (
          <div className={`${styles.accountFeedback} ${styles[`st_${status}`] ?? ''}`}>
            {sendState.msg}
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
