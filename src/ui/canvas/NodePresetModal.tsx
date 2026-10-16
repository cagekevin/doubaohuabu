/**
 * 「保存为节点预设」弹窗 —— 原 `_Component42.jsx:1745-1773`（`.modal-overlay` / `.modal-box` / `.modal-input`）
 *
 * ★ **它补的是「节点预设」这条链的写入端**（`TD-16-…`，2026-10-12）：
 *   纯层（`core/rules/preset.makeGraphPreset`）＋ store action（`global.addNodePreset`）
 *   此前**已就位但没有任何地方调它** ⇒ 用户**存不了节点预设**（`presets` 里 `kind:'graph'` 那一半没数据）。
 *
 * ⚠️ **载荷由宿主抓**（原 `rt`，`_Component42.jsx:1138-1155`）：本组件只收 `{nodes, edges}` 快照。
 *   那个快照与「复制」用的是**同一份计算**（`core/rules/clipboard.buildClipboard`）——
 *   源里 `copyNodes` 与 `rt` 也是同一套（多选才带边，且只带**两端都在选中集合里**的边；单选 ⇒ 空边）。
 *
 * ⚠️ **渲染位置**：由 `CanvasHost.Inner` 渲染（**不在**节点内，也不在右键菜单内）——
 *   菜单点完就卸载、节点在 ReactFlow 的变换容器内（`position: fixed` 的浮层会被 transform 带偏）。
 *   源版也正是挂在 `_Component42` 上。
 *
 * ⚠️ **与源的一处如实差异（留痕）**：用 `<Modal>`（`ui/common`）代替源版自写的
 *   `.modal-overlay` / `.modal-box` —— `role="dialog"` / `Escape` **只允许**住 `ui/common/`。
 *
 * ⚠️ **原则 1**：本组件不写 store，只调 `global.addNodePreset`。
 */

import { useState } from 'react';
import { useStore } from '@/state';
import { Modal } from '@/ui/common/Modal';
import { PRESET_TEXT } from '@/constants/text';
import type { ClipboardPayload } from '@/core/rules/clipboard';
import styles from './NodePresetModal.module.css';

export interface NodePresetModalProps {
  /** 选中子图快照（原 `ae`）—— 宿主已保证非空（源在"没选中任何节点"时**直接不开模态**） */
  payload: ClipboardPayload;
  onClose: () => void;
}

export function NodePresetModal({ payload, onClose }: NodePresetModalProps) {
  const addNodePreset = useStore((s) => s.addNodePreset);
  /** 名称输入（原 `Se`）—— ⚠️ 宿主是**条件渲染** ⇒ 每次打开都是新实例，名字天然从空开始（源也是 `ge('')` 清） */
  const [name, setName] = useState('');

  /** 保存（原 `ot`，`_Component42.jsx:1163-1172`）：`addNodePreset({name, nodes, edges})` → 关 */
  const save = (): void => {
    addNodePreset({ name, nodes: payload.nodes, edges: payload.edges });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={PRESET_TEXT.saveNodeTitle}
      footer={
        <>
          {/* 源顺序：`保存`（primary）在前、`取消`（ghost）在后（原 1764-1771） */}
          <button type="button" className={styles.btnPrimary} onClick={save}>
            {PRESET_TEXT.modalSave}
          </button>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            {PRESET_TEXT.modalCancel}
          </button>
        </>
      }
    >
      <div className={styles.sub}>
        {PRESET_TEXT.selectedSummary(payload.nodes.length, payload.edges.length)}
      </div>
      <input
        className={styles.input}
        placeholder={PRESET_TEXT.namePlaceholder}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // 原 1756-1762：`Enter` ⇒ 保存。
          // ⚠️ `Escape` **不在这里** —— `Modal` → `PanelShell` 已按「有 overlay 就有 Esc」处理
          //   （此前两边各处理一次 ⇒ 同一个 `onClose` 被触发两遍；`Esc` 的唯一落点是 `ui/common`）。
          if (e.key === 'Enter') save();
        }}
      />
    </Modal>
  );
}
