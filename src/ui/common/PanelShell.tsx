/**
 * 面板外壳（★ 判据 C1 —— 「同一个面板写了十几处」的收口点）
 *
 * 依据：`docs/过程.md（原 plan/01）` §4 目标声明 + 刀 6 铁律；先例 = `nodes/NodeShell.tsx`
 *   （P13 对 8 类节点做的同一招：**组件收口 → 类名只住「组件 + 真源」两处**）。
 *
 * ── 骨架 ──
 *   （可选）`.overlay` 遮罩 → `.panel` → `.panelHead`（`panelTitle` / `panelHeadMid` /
 *   `panelHeadActions` / `.panelClose`）→ `.panelBody` → （可选）`.panelFoot`
 *
 * ── 谁用它 ──
 *   `Modal`（模态：加 `overlay` + ESC/点遮罩关闭）与各**停靠 / 浮层面板**（不加 `overlay`）。
 *
 * ⚠️ **真实差异只许两处表达**（刀 6 铁律）：
 *   ① `className` —— **只许追加真源未设的属性**（宽 / 高 / 定位）；**禁止用本地覆盖**表达差异
 *      （构建产物里使用方的规则在真源之前 ⇒ 本地 `padding` 会被真源**盖掉**，不报错、只是没生效）；
 *   ② `headVariant` / `bodyVariant` —— **真源内的具名变体**（同文件、写在基类之后 ⇒ 顺序有保证）。
 *
 * ⚠️ `Escape` / `role="dialog"` / `aria-modal` **只在 `Modal` 里**（`ui/common/` 是浮层语义唯一落点）
 *   —— 本组件**不处理键盘**，也不声明 dialog 语义（它同时服务非模态的停靠面板）。
 */

import { useEffect } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import { COMMON_TEXT } from '@/constants/text';
import shared from './shared.module.css';

/*
 * ⚠️ **暂不提供 `headVariant` / `bodyVariant`** —— 2026-10-12 曾按 plan 刀 6 的表落过
 * `panelHeadCompact`/`Bare`/`Stacked` + `panelBodyCompact`，值（4px/8px + xs）是**凭空想的**，
 * 已删。口径：**变体必须有真值出处才落** —— 视觉真值是 `docs/mockup/`
 * （观测到的「头」只有两种：`.lib-picker-title` 的 `12px 14px` + sm + semi、
 * `.api-settings-head` 的 `16px 18px 10px`，**都不是"紧凑档"**），
 * 或原版 CSS（`index-Dg_Oc7MR.css`，未入库）。真需要变体时**先取证再落**。
 */

export interface PanelShellProps {
  /** 头部左槽（面板标题）—— 三槽（`title`/`meta`/`actions`）**全空 ⇒ 不出头** */
  title?: ReactNode;
  /** 头部中槽（计数 / 账号 / 时长）—— 紧跟在标题之后，不靠右 */
  meta?: ReactNode;
  /** 头部右槽（关闭钮**之前**的动作） */
  actions?: ReactNode;
  /** 给 ⇒ 渲染关闭钮（`panelClose`）；不给 ⇒ 头部没有关闭钮 */
  onClose?: () => void;
  /** 关闭钮文案：同时给 `aria-label` 与 `title`（默认 `COMMON_TEXT.closeAria`） */
  closeLabel?: string;
  /** 头部透传（如 `SendQueuePanel` 把头部当拖拽把手：`onPointerDown` + `title`） */
  headProps?: HTMLAttributes<HTMLDivElement>;
  /** 根卡片 ref（如「点外部关闭」要判 `contains`） */
  wrapperRef?: Ref<HTMLDivElement>;
  /** 根卡片内联样式（定位用；**只许追加真源未设的属性**，与 `className` 同法） */
  style?: CSSProperties;
  /** 头部右侧的浮层操作组（绝对定位，不占头部布局） */
  titleRight?: ReactNode;
  /** 面板脚（不给 ⇒ 不渲染） */
  footer?: ReactNode;
  /** 外层遮罩：`true` = 包一层真源 `.overlay`（**只有一种**：全屏 + 居中 + 暗底）；缺省 = 不包 */
  overlay?: boolean;
  /** 点遮罩关闭（仅 `overlay` 时有意义；默认 `true`） */
  closeOnMask?: boolean;
  /** 根卡片类 —— **只许追加真源未设的属性**（宽 / 高 / 定位） */
  className?: string;
  /** 正文类 —— 同上口径（本地只许追加真源未设的属性，如 `display` / `gap`） */
  bodyClassName?: string;
  /* ★ 没有 `stopPropagation` 开关：卡片**一律**挡 `mousedown`（唯一做法）——
     遮罩用 `mousedown` 关闭，卡片不挡就会「点面板里面也把它关掉」。 */
  /**
   * 卡片级 a11y 透传 —— ⚠️ **值只在 `Modal` 里给**（`ui/common/` 是浮层语义唯一落点）；
   *   本组件只负责把它放到卡片根上（`role` 必须挂在卡片、不是遮罩）。
   */
  role?: string;
  ariaModal?: boolean;
  testId?: string;
  children: ReactNode;
}

/** 面板外壳：卡片 + 三槽头 + 正文 +（可选）脚 +（可选）遮罩 */
export function PanelShell({
  title,
  meta,
  actions,
  onClose,
  closeLabel,
  headProps,
  wrapperRef,
  style,
  titleRight,
  footer,
  overlay = false,
  closeOnMask = true,
  className,
  bodyClassName,
  role,
  ariaModal,
  testId,
  children,
}: PanelShellProps) {
  /** 头**按需渲染**：三槽全空时不出头（`Modal` 无标题时就是这个形态 —— 关闭靠 ESC / 点遮罩） */
  const hasHead = title != null || meta != null || actions != null;

  /**
   * ★ **`Esc` 关闭 —— 全应用唯一的落点**（`ui/common/` 是 `Escape` 语义唯一允许住的地方）。
   *
   * ⚠️ **2026-10-12 上收**：这条监听原先只住在 `Modal` 里 ⇒ **所有直接用
   *   `PanelShell overlay` 的面板**（指纹体检 / 无水印资源 / 遮脸参数 / 素材选择 / 批量发送）
   *   **按 Esc 一点反应都没有**。现按「遮罩只有一个」的同一条口径上收到本组件：
   *   **有 `overlay` 就有 Esc**，`Modal` 不再自己挂一份（否则一次 Esc 关两遍）。
   * ⚠️ 与点遮罩**同一条守卫**（`closeOnMask === false` ⇒ 两者都不关）——
   *   免得出现"点外面关不掉、按 Esc 却关掉了"的不一致。
   */
  useEffect(() => {
    if (!overlay || !onClose || !closeOnMask) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, onClose, closeOnMask]);

  const card = (
    <div
      ref={wrapperRef}
      className={`${shared.panel}${className ? ` ${className}` : ''}`}
      style={style}
      data-testid={testId}
      role={role}
      aria-modal={ariaModal ? true : undefined}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {hasHead && (
        <div className={shared.panelHead} {...headProps}>
          {title != null && <span className={shared.panelTitle}>{title}</span>}
          {meta != null && <span className={shared.panelHeadMid}>{meta}</span>}
          {actions != null && <div className={shared.panelHeadActions}>{actions}</div>}
          {onClose && (
            <button
              type="button"
              className={shared.panelClose}
              onClick={onClose}
              title={closeLabel ?? COMMON_TEXT.closeAria}
              aria-label={closeLabel ?? COMMON_TEXT.closeAria}
            >
              ✕
            </button>
          )}
          {titleRight}
        </div>
      )}
      <div className={bodyClassName ? `${shared.panelBody} ${bodyClassName}` : shared.panelBody}>
        {children}
      </div>
      {footer != null && <div className={shared.panelFoot}>{footer}</div>}
    </div>
  );

  if (!overlay) return card;
  return (
    <div className={shared.overlay} onMouseDown={closeOnMask ? onClose : undefined} role="presentation">
      {card}
    </div>
  );
}
