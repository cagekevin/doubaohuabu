/**
 * 8 类节点的**公共外壳**（★ 判据 C1 —— 8 处重复的收口点）
 *
 * 依据：`docs/过程.md` §1.4 / §2.1 ——「8 类节点公共外壳（头部/圆点/Handles）」，
 *   写法为「**复合组件**（`children` 传功能区）」，验法为「**`'dot'` 类名只出现在 `NodeShell`**」。
 *
 * ── 骨架 ──
 *   根 div（`data-type` 决定类型圆点色）→ 头（四槽 `dot / title / mid / actions`）
 *   → 正文（`padded` 决定是否带内距）→ 左右端口（`CustomHandle`）。
 *
 * ── 尺寸（与 ReactFlow 一致）──
 *   根 div 的 inline `width/height` **订阅自 ReactFlow store**（`useNodeWidth/Height`）：
 *   端口与连线都基于节点整体中点定位，若尺寸只跟父容器 ⇒ 拖拽 / 缩放后端口跑偏。
 *   ⚠️ store 里没有尺寸的节点**不写 inline 尺寸**（保持按内容自适应）。
 *   ⚠️ `aspectRatio` 非空时由 `useSizeSync` 按比例写回尺寸（`'Auto'` / 空 ⇒ 不干预）。
 *
 * ── 组节点（`GroupNode`）的差异 ──
 *   它是**容器**（不挂 handle、头用图标代替圆点、选中态只描边不加光环、body 是子节点容器）
 *   —— 差异用 props 表达，不再各自拼一套外壳。
 *
 * ⚠️ 本文件是 **`dot` 类名的唯一落点**（判据 C1 的验法）。
 */

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from 'react';
import { NodeResizer, useNodeId } from '@xyflow/react';
import { ErrorBoundary } from '@/ui/shell/ErrorBoundary';
import { Icon, type IconName } from '@/ui/common/Icon';
import { SHELL_TEXT } from '@/constants/text';
import { CustomHandle, type CustomHandleVariant } from './CustomHandle';
import { useNodeHeight, useNodeWidth, useSizeSync } from './useNodeSize';
import styles from './shared.module.css';

export interface NodeShellProps {
  /** 节点类型（决定 `data-type` 属性 + 类型圆点色）—— `text/material/account/video/download/group/genvideo/imggen` */
  type: string;
  /**
   * 头部**类型图标**（★ 真值 = 设计稿的 8 个头：全是 `圆点 + 图标 + 标题`）。
   *
   * 它**不是**圆点的替代品，两者并存、各管一条通道：
   *   · 圆点 = **颜色**语言（与连线 / 端口 / 小地图同一套类型色 ⇒ 扫视层）
   *   · 图标 = **形状**语言（可辨认、不依赖记颜色 ⇒ 阅读层）
   */
  icon?: IconName;
  /** 头部左侧标题（如「文本」「账号」） */
  title: ReactNode;
  /** 中槽（状态 / 倒计时 / 账号 / 时长 / 数量）；不给则中槽为空 */
  meta?: ReactNode;
  /** 右槽（历史 / 保存预设 / 开关 / 取消组）；不给则右槽为空 */
  actions?: ReactNode;
  /** 选中态（由 ReactFlow 注入） */
  selected?: boolean;
  /**
   * 连接点：`true` = 全挂（默认）· `false` = 不挂 · **对象 = 细分**（**省略的那一侧按 `true` 处理**）。
   *   例：下载节点 `{ source: false }` = **仅 target**（原 `WL.jsx:149` 的 `<_Component30 source={false}/>`）；
   *   组节点 `false`（原 `GL.jsx` **没有** `_Component30` —— 组的连线锚点是 `_Component37`）。
   */
  handles?: boolean | { target?: boolean; source?: boolean };
  /** 端口尺寸档（`large` 48px / `small` 32px 的命中区，可见圆点 6 / 8px） */
  handleVariant?: CustomHandleVariant;
  /**
   * 正文是否带内边距（默认 `true`）
   * ⚠️ **素材节点传 `false`** —— 它的缩略图要**通栏**，被 `.nodeBody` 的 padding 一挤就不是通栏了
   */
  padded?: boolean;
  /**
   * 是否允许内容溢出到节点框**外**（默认 `false`）
   * ⚠️ **只有"有框外浮层"的节点才传 `true`**：生成节点把「分析提示词」浮动按钮与提示词浮层渲染在节点根内。
   * ⚠️ **素材节点绝不能开** —— 它的通栏缩略图正是靠这层 `hidden` 裁出圆角的。
   */
  overflowVisible?: boolean;
  /**
   * ★ **卡片级 `title`（HTML 属性）** —— 与上面的 `title`（头部文本）同名但语义不同，故另起一名。
   */
  cardTitle?: string;
  /** 卡片级指针/点击（整卡点击 → 打开生成面板） */
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onClick?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  /** 缩放边框最小尺寸（8 类都有；不传则不缩放） */
  minWidth?: number;
  minHeight?: number;
  /** 覆盖默认类型圆点（组节点传文件夹图标） */
  dot?: ReactNode;
  /** 根元素 `data-testid`（各节点的 e2e 锚点） */
  testId?: string;

  // ── 尺寸 / 比例（原版节点尺寸管理）────────────────────────────────
  /** 当前宽高比（`'16:9'` / `'Auto'`）；非空时按比例写回节点尺寸 */
  aspectRatio?: string;
  /** `aspectRatio='Auto'` 时的默认高度 */
  defaultHeight?: number;
  /** 尺寸模式：`width-fixed`（默认，生图）| `area-fixed`（视频生成，面积固定） */
  sizeMode?: 'width-fixed' | 'area-fixed';
  /** `area-fixed` 的面积基准 */
  baseSize?: number;
  /** 是否按比例同步尺寸（默认 `true`；编组等特殊节点可关） */
  syncSize?: boolean;
  /** 拖拽缩放时保持比例（`aspectRatio` 有效时自动开启） */
  keepAspect?: boolean;

  // ── 插槽 / 透传 ──────────────────────────────────────────────────
  /** 浮在头部右侧的操作组（**绝对定位**，不占头部布局） */
  titleRight?: ReactNode;
  /**
   * 覆盖层端口：直接挂在**根 div**（含头部的整个节点）上。
   * ⚠️ 需要「相对整个节点居中」的端口走这个插槽（`children` 的定位基准只是正文区）。
   */
  overlayHandles?: ReactNode;
  /** 根 div ref（供右下角手柄拖拽改整体尺寸） */
  wrapperRef?: Ref<HTMLDivElement>;
  className?: string;
  style?: CSSProperties;
  /** 正文（功能区） */
  children?: ReactNode;
}

/** 节点外壳：外框 + 选中态 + 连接点 + 缩放边框 + 四槽头 + 正文 */
export function NodeShell({
  type,
  icon,
  title,
  meta,
  actions,
  selected = false,
  handles = true,
  handleVariant = 'large',
  padded = true,
  overflowVisible = false,
  cardTitle,
  onPointerDown,
  onClick,
  minWidth,
  minHeight,
  dot,
  testId,
  aspectRatio,
  defaultHeight = 420,
  sizeMode = 'width-fixed',
  baseSize,
  syncSize = true,
  keepAspect = false,
  titleRight,
  overlayHandles,
  wrapperRef,
  className,
  style,
  children,
}: NodeShellProps) {
  const id = useNodeId() ?? '';
  // ⚠️ 对象形态**必须补默认 `true`**：否则 `{ source: false }` 会让 `target` 变 `undefined`
  //    ⇒ **两侧都不渲染**（与上面的契约相反，且静默 —— 没有类型错、没有运行时报错）。
  const handleProps =
    typeof handles === 'object'
      ? { target: true, source: true, ...handles }
      : { target: handles, source: handles };
  const resizable = minWidth != null || minHeight != null;

  // 尺寸订阅（原始值，见 useNodeSize 头注）+ 比例同步
  const width = useNodeWidth(id);
  const height = useNodeHeight(id);
  const ratio = useSizeSync(id, syncSize ? (aspectRatio ?? '') : '', {
    mode: sizeMode,
    defaultHeight,
    baseSize,
  });
  const effectiveKeepAspect = keepAspect || !!ratio;

  const sizeStyle: CSSProperties = {};
  if (width != null) sizeStyle.width = typeof width === 'number' ? `${width}px` : width;
  if (height != null) sizeStyle.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      ref={wrapperRef}
      className={`${styles.node} ${selected ? styles.selected : ''} ${overflowVisible ? styles.overflowVisible : ''} ${className ?? ''}`}
      data-type={type}
      data-testid={testId}
      title={cardTitle}
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{ ...sizeStyle, ...style }}
    >
      {resizable && (
        <NodeResizer
          minWidth={minWidth}
          minHeight={minHeight}
          keepAspectRatio={effectiveKeepAspect}
          isVisible={!!selected}
        />
      )}
      <div className={styles.nodeHead}>
        <span className={styles.nodeDot}>{dot}</span>
        {icon !== undefined && <Icon name={icon} className={styles.nodeIcon} />}
        <span className={styles.nodeTitle}>{title}</span>
        {meta != null && <span className={styles.nodeHeadMid}>{meta}</span>}
        {actions != null && <span className={styles.nodeHeadActions}>{actions}</span>}
        {titleRight != null && <span className={styles.nodeTitleRight}>{titleRight}</span>}
      </div>
      {/* 单节点崩溃只降级本节点，不炸整个画布（原版的局部错误边界） */}
      <ErrorBoundary area={SHELL_TEXT.areaNode}>
        {padded ? <div className={styles.nodeBody}>{children}</div> : children}
      </ErrorBoundary>
      {handleProps.target && <CustomHandle position="left" variant={handleVariant} />}
      {handleProps.source && <CustomHandle position="right" variant={handleVariant} />}
      {overlayHandles}
    </div>
  );
}
