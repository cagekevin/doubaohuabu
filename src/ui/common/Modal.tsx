/**
 * Modal —— 弹窗（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**遮罩点击空白关闭 + X 关闭 + ESC 关闭**
 * 原实现里这套逻辑散落在：创建面板 / 素材选择 / 遮脸面板 / 预设选择 / 关键词弹窗 / 图片编辑器 …
 *
 * ⚠️ `Escape` / `aria-modal` / `role="dialog"` **只允许出现在本文件所在目录**
 *    （约定：`ui/common/` 是浮层语义唯一落点。原 grep 型闸已于 2026-10-11 退役，现无机器守卫）
 *
 * 组合模式：复合组件（`Modal.Header` / `Modal.Body` / `Modal.Footer`），避免布尔 props 爆炸
 *           （依据技能 `vercel-composition-patterns` 的 `architecture-avoid-boolean-props`）
 */

import type { ReactNode } from 'react';
import { PanelShell } from './PanelShell';

export interface ModalProps {
  open: boolean;
  /** 关闭回调（遮罩点击 / X / ESC 三处共用同一个） */
  onClose: () => void;
  title?: ReactNode;
  /**
   * 头部**中槽**（计数 / 账号 / 元信息）—— 紧跟在标题之后，不靠右
   * ⚠️ **2026-10-12 补**：此前只有 `title` / `footer` ⇒ 需要"标题 + 元信息"的弹窗
   *   （如 `GalleryLightbox`）只能**把整个 `.panelHead` 塞进 `title`** —— 头里又套一个头
   *   （两层 padding、两份字号）。三槽齐了才不必自拼头。
   */
  meta?: ReactNode;
  /** 头部**右槽**（关闭钮之前的动作） */
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 点遮罩是否关闭，默认 true */
  closeOnMask?: boolean;
}

export function Modal({ open, onClose, title, meta, actions, children, footer, closeOnMask = true }: ModalProps) {
  if (!open) return null;

  /*
   * 结构（遮罩 + 卡片 + 三槽头 + 正文 + 脚）**全部交给 `PanelShell`** —— 本组件只剩一件它独有的：
   *   `role="dialog"` / `aria-modal`（浮层语义的唯一落点）。
   * ⚠️ 不再手写 `panelHead` / `panelClose` / `panelBody` / `panelFoot`（那是「合成 1 个」要消灭的重复）。
   * ⚠️ `Esc` 也不再住这里 —— 已上收到 `PanelShell`（**有 `overlay` 就有 `Esc`**，见那里的注释），
   *    否则"直接用 `PanelShell overlay` 的面板"与"经 `Modal` 的面板"行为不一致。
   */
  return (
    <PanelShell
      overlay
      closeOnMask={closeOnMask}
      onClose={onClose}
      title={title}
      meta={meta}
      actions={actions}
      footer={footer}
      role="dialog"
      ariaModal
    >
      {children}
    </PanelShell>
  );
}
