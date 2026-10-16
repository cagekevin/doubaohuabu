/**
 * **生成节点舞台上共用的四件浮件** —— ★ 一件只此一份
 *
 * ★ **为什么住在这儿**：两个生成节点（`GenImageNode` 文字→图 · `GenVideoNode` 文字→视频）
 *   各自把舞台上这几件**同皮同构**的东西各写了一遍（`nodes/shared.module.css` 里那批
 *   `.gvWaiting` / `.gvwDots` / `.gvwText` / `.gvPreviewEmpty` / `.gvDl` / `.gvHistBtn` 类，
 *   **本来就同时服务这两个节点** —— 皮早就合了，**结构却各写一遍**）：
 *
 *   | 件 | 结构 | 两处的差异 |
 *   |---|---|---|
 *   | `StageWaiting` | `.gvWaiting` > `.gvwDots`(三点) + `.gvwText` | 文案不同；视频多一个 `title`（悬停看排队原因） |
 *   | `StageEmpty` | `.gvPreviewEmpty` > `.gvPreviewTitle` + `.gvPreviewSub` | **只有文案不同**（逐字同形） |
 *   | `StageDownloadBtn` | `.gvDl nodrag` + `Icon download` + 停指针传播 | 只有 `title`/`aria-label` 的来源不同 |
 *   | `StageHistBtn` | `.gvHistBtn nodrag`（+ 开态修饰符） | 只有计数字面量来源不同 |
 *
 *   ⚠️ **源版重复不是设计意图**：原版是**编译产物**（`ZL.jsx:227-255` 与 `YL.jsx:485-524`
 *   是同一份源码被拆成的两处）—— 本仓按**同一真相**收口（与 `HistPop` 同一条判据）。
 *   ⚠️ 其中三处带着**同一套交互不变式**（`nodrag` 防被画布拖走 · `onPointerDown` 停传播防
 *   顺带改节点选择）—— 这两条写两份，就等于让它们各漂一半。
 *
 * ⚠️ **只合"外壳"，不吞"数据"**：所有文案都由调用方传入（归 `constants`），本文件不碰文案；
 *   每件的 API 都 ≤5 个 prop —— **不做**那种"把整块舞台塞进来、给一打 render-prop"的写法
 *   （那是**为了合并写得更复杂**，见 `CSS规范` §5.1 的代价条）。
 */

import type { MouseEventHandler, ReactNode, RefObject } from 'react';
import { MATERIAL_NODE_TEXT } from '@/constants/text';
import { Icon } from '@/ui/common/Icon';
import styles from './shared.module.css';

/** 等待浮层（原 `.gv-waiting`）：三点跳动 + 一句文案，压在舞台上 */
export function StageWaiting({
  ariaLabel,
  title,
  children,
}: {
  ariaLabel: string;
  /** 悬停提示（源里只有视频那一侧给：排队原因） */
  title?: string;
  /** 文案（归 `constants`，由调用方算好） */
  children: ReactNode;
}) {
  return (
    <div className={styles.gvWaiting} aria-label={ariaLabel} title={title}>
      <div className={styles.gvwDots}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.gvwText}>{children}</div>
    </div>
  );
}

/** 舞台空态（原 `.gv-preview-empty`）：标题 + 副标两句 */
export function StageEmpty({ title, sub }: { title: string; sub: string }) {
  return (
    <div className={styles.gvPreviewEmpty}>
      <div className={styles.gvPreviewTitle}>{title}</div>
      <div className={styles.gvPreviewSub}>{sub}</div>
    </div>
  );
}

/**
 * 「编辑图片」浮钮（原 `.mat-edit-float`）：台上图片左下角那颗 —— `MaterialNode` 与
 * `GenImageNode` **共用**（同皮 `.matFloatBtn` · 同一句 `title/label` · 同一套停传播不变式）。
 *
 * ⚠️ 它常作为 `AnalyzePrompt` 的 `leading` 传入 —— 那个槽是"**先构造、后由 `showButton` 决定渲不渲染**"
 *   ⇒ 需要收窄的条件（如"当前图还在不在"）**留在调用方的 `onClick` 里**，本组件不猜。
 */
export function StageEditImageBtn({
  onClick,
}: {
  /** 点击（源里那颗自己吃事件：`e.stopPropagation()` 后才动作） */
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className={styles.matFloatBtn}
      title={MATERIAL_NODE_TEXT.editImageTitle}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {MATERIAL_NODE_TEXT.editImage}
    </button>
  );
}

/** 舞台上的下载钮（原 `.gv-dl`）：浮动、`nodrag`、不吃指针传播 */
export function StageDownloadBtn({
  title,
  ariaLabel,
  onClick,
}: {
  title: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.gvDl} nodrag`}
      title={title}
      aria-label={ariaLabel}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name="download" />
    </button>
  );
}

/** 历史版本入口钮（原 `.gv-hist-btn`）：开态带修饰符，点了开浮层（浮层见 `HistPop`） */
export function StageHistBtn({
  btnRef,
  open,
  label,
  title,
  onClick,
}: {
  /** 定位浮层要用它（`useAnchoredLayer` 锚在这个钮上） */
  btnRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  /** 按钮字面量（如 `TEXT.histBtn(3)`）—— 文案归 `constants` */
  label: string;
  title: string;
  /** **原样透传**（源版那两颗钮自己会吃事件：`e.stopPropagation()`），别在这里包一层 */
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      ref={btnRef}
      type="button"
      className={`${styles.gvHistBtn} nodrag${open ? ` ${styles.gvHistBtnOpen}` : ''}`}
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
