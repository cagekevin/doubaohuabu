/**
 * **历史版本浮层**（`gv-hist-pop`）—— ★ 「外壳」只此一份
 *
 * ★ **为什么住在这儿**：真机里它被**写了两份**（`GenImageNode` 的"版本历史" · `GenVideoNode` 的
 *   "历次尝试"），各约 45 行，而且**共用同一批类**（`.gvHistPop` / `.gvHistTitle` / `.gvHistItem` /
 *   `.gvHistThumb` / `.gvHistMeta` / `.gvHistRow` / `.gvHistPrompt` 都在 `nodes/shared.module.css`）
 *   —— 皮早就合了，**结构却各写一遍**：
 *   `createPortal(…, document.body)` + 停指针传播 + 标题行 + 列表项。
 *
 * ⚠️ **只共享外壳，不共享列表项**：两处的**数据形状**本就不同（图片是 `dataUrl` / 视频是 `poster`
 *   且可能"没海报"），而"项"里的差异是**真差异**（视频多 `disabled` 与占位字形）。
 *   把"项"也塞进来会换来一个**十几个 render-prop 的适配器** —— 那是"为了合并写得更复杂"。
 *   判据：**外壳是同一件东西 ⇒ 合；项的内容是两套数据 ⇒ 各留**。
 *
 * ⚠️ `portal` 到 `document.body` 是**源同法**（`ZL.jsx:288` / `YL.jsx:585`）：节点的祖先链上有
 *   `overflow: hidden`，就地渲染会被裁。定位（`ref` / `style`）由调用方的 `useAnchoredLayer` 给 ——
 *   本组件只管"壳"。
 */

import type { CSSProperties, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './shared.module.css';

export interface HistPopProps {
  /** 开才渲染（调用方把"有内容"也并进来：`open={histOpen && n > 0}`） */
  open: boolean;
  /** 标题行文案（如 `TEXT.histTitle(3)`）—— 文案归 `constants`，这里只接值 */
  title: string;
  /** 定位用的 ref（来自 `useAnchoredLayer`） */
  popRef: RefObject<HTMLDivElement | null>;
  /** 定位用的内联样式（来自 `useAnchoredLayer`） */
  style: CSSProperties;
  /** 列表项（各自渲染：缩略图与 meta 行的**真差异**留在调用方） */
  children: ReactNode;
}

export function HistPop({ open, title, popRef, style, children }: HistPopProps) {
  if (!open) return null;
  return createPortal(
    <div
      ref={popRef}
      className={styles.gvHistPop}
      style={style}
      // 浮层内部的按下/点击**不许冒到画布**（否则点一层就顺带改了选择）
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.gvHistTitle}>{title}</div>
      {children}
    </div>,
    document.body,
  );
}
