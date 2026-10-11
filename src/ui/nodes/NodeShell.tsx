/**
 * 8 类节点的**公共外壳**（★ 判据 C1 —— 8 处重复的收口点）
 *
 * 依据：`docs/16` §1.4 / §2.1 ——「8 类节点公共外壳（头部/圆点/Handles）」，
 *   写法明确为「**复合组件**（`children` 传功能区）」，
 *   验法为「**`'dot'` 类名只出现在 `NodeShell`**」。
 *
 * 收口掉的重复（改前逐文件实测）——**7 个**节点各自重复：
 *   `styles.node + styles.selected` · `<NodeHandles/>` · `styles.header`（左标题 + 右附加信息）
 *   · `styles.body`
 *
 * ⚠️ **组节点（`GroupNode`）不用本外壳**：它是**容器**（虚线框 + 绝对定位标签、**不挂 handle**），
 *   与「卡片」形态不同 —— 强行统一只会塞进一堆开关。
 * ⚠️ 本文件是 **`dot` 类名的唯一落点**（判据 C1 的验法）。
 */

import type { ReactNode } from 'react';
import { NodeHandles } from './NodeHandles';
import styles from './shared.module.css';

export interface NodeShellProps {
  /** 头部左侧标题（如「文本」「账号」） */
  title: ReactNode;
  /** 头部右侧附加信息（如 `16:9 · 7s`）；不给则右槽为空 */
  meta?: ReactNode;
  /** 选中态（由 ReactFlow 注入） */
  selected?: boolean;
  /** 是否挂 source/target 连接点（默认挂） */
  handles?: boolean;
  /**
   * 正文是否带内边距（默认 `true`）
   * ⚠️ **素材节点传 `false`** —— 它的缩略图要**通栏**，被 `.body` 的 padding 一挤就不是通栏了
   */
  padded?: boolean;
  /**
   * 是否允许内容溢出到节点框**外**（默认 `false`）
   *
   * ⚠️ **只有"有框外浮层"的节点才传 `true`**：生成节点把「分析提示词」浮动按钮（在框上方）
   *    与提示词浮层（在框下方）渲染在节点根内 ⇒ `.node` 的 `overflow: hidden` 会把它们**整块裁掉**。
   * ⚠️ **素材节点绝不能开** —— 它的通栏缩略图正是靠这层 `hidden` 裁出圆角的。
   */
  overflowVisible?: boolean;
  /** 正文（功能区） */
  children?: ReactNode;
}

/** 节点外壳：外框 + 选中态 + 连接点 + 头部 + 正文 */
export function NodeShell({
  title,
  meta,
  selected = false,
  handles = true,
  padded = true,
  overflowVisible = false,
  children,
}: NodeShellProps) {
  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ''} ${overflowVisible ? styles.overflowVisible : ''}`}
    >
      {handles && <NodeHandles />}
      <div className={styles.header}>
        <span>{title}</span>
        {meta != null && <span>{meta}</span>}
      </div>
      {padded ? <div className={styles.body}>{children}</div> : children}
    </div>
  );
}

/**
 * 状态圆点（正常 / 异常）
 *
 * ★ **`dot` 类名只在本文件出现**（判据 C1 的验法）——
 *   各节点要状态点时用本组件，**不要**自己拼 `styles.dot`。
 */
export function NodeStatusDot({ ok = true }: { ok?: boolean }) {
  return <span className={`${styles.dot} ${ok ? '' : styles.dotInvalid}`} />;
}
