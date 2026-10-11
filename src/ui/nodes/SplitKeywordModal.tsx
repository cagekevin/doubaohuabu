/**
 * 「按关键词拆分」弹窗 —— 原 `_Component42.jsx:1774-1815`（`.modal-overlay` / `.modal-box` / `.split-keyword-input`）
 *
 * ★ **它补的是「拆分」这条链的最后一环**：纯层（`core/rules/splitText.ts`：`Ty`/`$y`/`Na`）
 *   + store action（`splitTextNode`）已就位，但**没有任何地方调它**。
 *
 * ⚠️ **渲染位置**：由 `CanvasHost.Inner` 渲染（**不在文本节点内**）——
 *    因为拆分会**删掉源节点**（渲染在节点里的弹窗会随之卸载），
 *    且节点在 ReactFlow 的**变换容器**内（`position: fixed` 的浮层会被 transform 带偏）。
 *    源版也正是把它挂在画布宿主上（`store.splitKeywordModal` 驱动）。
 *
 * ⚠️ **与源的三处如实差异**（留痕）：
 *   ① 用 `<Modal>`（`ui/common`）代替源版自写的 `.modal-overlay` / `.modal-box`
 *      —— `role="dialog"` / `Escape` **只允许**住 `ui/common/`（`原则8/rule-of-three`）；
 *   ② 说明文字**不加粗**（源版那段有三处 `<b>` 强调）；
 *   ③ 结果用 **toast** 报告（源版写 `splitFeedback` 改按钮文字 —— 而其中「✓ 已拆分」那档
 *      **不可达**：源节点已被删、`TextNode` 已卸载）。
 *
 * ⚠️ **原则 1**：本组件只调 store 暴露的 action 与**纯规则**（`parseKeywords` 是纯函数）。
 */

import { useMemo, useState } from 'react';
import { useStore } from '@/state';
import { Modal } from '@/ui/common/Modal';
import { SPLIT_TEXT } from '@/constants/text';
import {
  DEFAULT_SPLIT_KEYWORDS,
  SPLIT_FAIL_REASON_LABEL,
  parseKeywords,
} from '@/core/rules/splitText';
import styles from './SplitKeywordModal.module.css';

export interface SplitKeywordModalProps {
  /** 要拆的文本节点 id（原 `splitKeywordModal.sourceNodeId`） */
  sourceNodeId: string;
  onClose: () => void;
  /** 拆分成功后把**新节点 id** 交给宿主 —— 宿主负责 `fitView`（视图能力归 `ui`） */
  onSplit: (newIds: readonly string[]) => void;
}

export function SplitKeywordModal({ sourceNodeId, onClose, onSplit }: SplitKeywordModalProps) {
  const splitTextNode = useStore((s) => s.splitTextNode);
  const pushToast = useStore((s) => s.pushToast);
  const [text, setText] = useState('');
  /** 输入框里的关键词（原 `Na(ne)`，每次渲染现算） */
  const keywords = useMemo(() => parseKeywords(text), [text]);

  /** 拆分（原 `te(...)` → `splitDirect(sourceNodeId, keywords)`） */
  const run = (kws: readonly string[]): void => {
    const r = splitTextNode(sourceNodeId, kws);
    if (!r.ok) {
      // ★ 原则 6：失败原因用 core 的 label 真源，不编造
      if (r.reason) pushToast(SPLIT_FAIL_REASON_LABEL[r.reason], undefined, 'warn');
      return;
    }
    pushToast(SPLIT_TEXT.done(r.count ?? 0));
    if (r.newIds && r.newIds.length > 0) onSplit(r.newIds);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={SPLIT_TEXT.title}
      footer={
        <>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            {SPLIT_TEXT.cancel}
          </button>
          {/* ⚠️ 与源一致：**输入框里有词就用输入的**，否则用默认那五个（原 1804 的三目） */}
          <button
            type="button"
            className={styles.btn}
            title={SPLIT_TEXT.useDefaultTitle}
            onClick={() => run(keywords.length ? keywords : [...DEFAULT_SPLIT_KEYWORDS])}
          >
            {SPLIT_TEXT.useDefault}
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={keywords.length === 0}
            onClick={() => run(keywords)}
          >
            {SPLIT_TEXT.submit}
          </button>
        </>
      }
    >
      <div className={styles.sub}>{SPLIT_TEXT.sub}</div>
      <textarea
        className={styles.input}
        placeholder={SPLIT_TEXT.placeholder}
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  );
}
