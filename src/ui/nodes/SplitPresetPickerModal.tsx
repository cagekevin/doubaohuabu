/**
 * 「拆分并套用节点预设」弹窗 —— 原 `_Component42.jsx:1816-1863`（`.split-preset-*`）
 *
 * ★ **它补的是「节点预设」这条链的读取端**（`TD-16-…`，2026-10-12）。触发时机是**源定的**：
 *   拆分弹窗提交时若 `presets` 里有**图预设** ⇒ 先开本弹窗挑（源 `te`，`:191-206`）；
 *   一个图预设都没有 ⇒ 直接 `splitDirect`（本弹窗根本不开）。
 *
 * 列表项两类（源 1827-1854）：
 *   ① 每个**图预设**一个按钮：名字 ＋ `N 节点 · M 连线`；点击 ⇒ `splitApplyPreset(源节点, 预设id, 关键词)`
 *   ② 底部「**直接拆分（不使用预设）**」：走 `splitTextNode`（= 源的 `splitDirect`）
 *
 * ⚠️ **与源的一处如实差异（留痕）**：用 `<Modal>`（`ui/common`）代替源版自写的
 *   `.modal-overlay` / `.modal-box`（`role="dialog"` / `Escape` 只允许住 `ui/common/`）。
 * ⚠️ 源那两行说明文字里的 `<span class="split-preset-kw">` 保留为独立元素；`mockup.css`
 *   里**没有** `.split-preset-*` 的样式（抽取时未收）⇒ 本组件样式按 token 自写，未对 mockup。
 *
 * ⚠️ **原则 1**：本组件不写 store，只调 `splitApplyPreset` / `splitTextNode` 两个 action。
 */

import { useMemo } from 'react';
import { useStore } from '@/state';
import { Modal } from '@/ui/common/Modal';
import { SPLIT_TEXT } from '@/constants/text';
import { isGraphPreset } from '@/core/rules/preset';
import {
  SPLIT_FAIL_REASON_LABEL,
  type SplitFailReason,
} from '@/core/rules/splitText';
import type { SplitPresetFailReason } from '@/core/rules/splitPreset';
import styles from './SplitPresetPickerModal.module.css';

export interface SplitPresetPickerModalProps {
  /** 要拆的文本节点 id（原 `splitPresetPicker.sourceNodeId`） */
  sourceNodeId: string;
  /** 拆分关键词（原 `splitPresetPicker.keywords`）—— 传给两个动作，**不在这里重算** */
  keywords: readonly string[];
  onClose: () => void;
  /** 拆分成功后把**新节点 id** 交给宿主 —— 宿主负责 `fitView`（视图能力归 `ui`） */
  onSplit: (newIds: readonly string[]) => void;
}

export function SplitPresetPickerModal({
  sourceNodeId,
  keywords,
  onClose,
  onSplit,
}: SplitPresetPickerModalProps) {
  const presets = useStore((s) => s.presets);
  const splitApplyPreset = useStore((s) => s.splitApplyPreset);
  const splitTextNode = useStore((s) => s.splitTextNode);
  const pushToast = useStore((s) => s.pushToast);

  /** 只列**图预设**（`PromptPreset` 不能用来拆分 —— 它没有 `nodes`） */
  const graphPresets = useMemo(() => presets.filter(isGraphPreset), [presets]);

  /**
   * 失败原因 → 文案（原则 6：**原文照带**，不编造）
   * ⚠️ 预设侧多两档（`preset-missing` / `preset-empty`）—— 它们**不在** `SPLIT_FAIL_REASON_LABEL` 里
   *   （那张表是"按关键词拆分"那三档的真源）⇒ 显式分流，**不硬塞进那张表**。
   */
  const failLabel = (reason: SplitPresetFailReason | SplitFailReason): string => {
    if (reason === 'preset-missing') return SPLIT_TEXT.presetMissing;
    if (reason === 'preset-empty') return SPLIT_TEXT.presetEmpty;
    return SPLIT_FAIL_REASON_LABEL[reason];
  };

  /** 套用某个预设（源 1833-1837：成功才关弹窗） */
  const applyPreset = (presetId: string): void => {
    const r = splitApplyPreset(sourceNodeId, presetId, keywords);
    if (!r.ok) {
      if (r.reason) pushToast(failLabel(r.reason), undefined, 'warn');
      return;
    }
    pushToast(SPLIT_TEXT.done(r.count ?? 0));
    if (r.newIds && r.newIds.length > 0) onSplit(r.newIds);
    onClose();
  };

  /** 「直接拆分（不使用预设）」（源 1846-1849 → `splitDirect`） */
  const runDirect = (): void => {
    const r = splitTextNode(sourceNodeId, keywords);
    if (!r.ok) {
      if (r.reason) pushToast(failLabel(r.reason), undefined, 'warn');
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
      title={SPLIT_TEXT.presetTitle}
      footer={
        <button type="button" className={styles.btnGhost} onClick={onClose}>
          {SPLIT_TEXT.cancel}
        </button>
      }
    >
      <div className={styles.sub}>
        {SPLIT_TEXT.presetSub}
        {keywords.length > 0 && (
          <span className={styles.kw}>{SPLIT_TEXT.presetKeywords(keywords)}</span>
        )}
      </div>
      <div className={styles.list}>
        {graphPresets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.item}
            onClick={() => applyPreset(p.id)}
          >
            <span>{p.name}</span>
            <span className={styles.itemMeta}>
              {SPLIT_TEXT.presetMeta(p.nodes.length, p.edges.length)}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={styles.item}
          onClick={runDirect}
        >
          <span>{SPLIT_TEXT.presetDirect}</span>
          <span className={styles.itemMeta}>
            {SPLIT_TEXT.presetDirectMeta(keywords.length > 0)}
          </span>
        </button>
      </div>
    </Modal>
  );
}
