/**
 * 首页界面 —— ★★ 与「豆包后台」（`ui/pages/BackendPage`）是**两个互斥界面**
 *
 * 布局：中（画布 + 顶栏）｜右（资源库）
 *
 * ⚠️ 判据（用户裁定「界面彻底分成两个」）：**资源库属首页、账号栏属后台** —— 两侧栏不共存。
 * ⚠️ 切走时由 `AppShell` 加 `pageHidden`（`display:none`）收起：画布**没有 guest**，
 *   收起安全；重新显示时 ReactFlow 自会重测尺寸（视口状态不丢）。
 * ⚠️ 原则 1：本页**不写 store**（只读 + 调 action / 控制器）。
 */

import { useState } from 'react';
import { Icon } from '@/ui/common/Icon';
import shared from '@/ui/common/shared.module.css';
import { ErrorBoundary } from '@/ui/shell/ErrorBoundary';
import { LibraryPanel } from '@/ui/panels/LibraryPanel';
import { SendQueuePanel } from '@/ui/panels/SendQueuePanel';
import { SHELL_TEXT } from '@/constants/text';
// ★ 布局词汇（`.centerStage` / `.side` / …）住 shell 的模块，两个界面共用同一套
import styles from '@/ui/shell/AppShell.module.css';

export interface HomePageProps {
  /** 中间画布区（M2 接 ReactFlow） */
  canvas: React.ReactNode;
  /** 本页是否被切走（切走 ⇒ 整体 `display:none`） */
  hidden: boolean;
}

export function HomePage({ canvas, hidden }: HomePageProps) {
  /** 右栏（资源库）收起态 —— 组件局部 state（源 `_Component48.jsx:56` 的 `useState`，不入 store） */
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div className={`${styles.pageRow}${hidden ? ` ${styles.pageHidden}` : ''}`}>
      <div className={styles.centerStage}>
        {/* ★ 顶栏不在这里 —— 它是**全宽应用栏**、由 `AppShell` 渲染（两页共用）。 */}
        {/* 画布级错误边界（docs/11 §9.9 的第二级） */}
        <ErrorBoundary area={SHELL_TEXT.areaCanvas}>
          {canvas}
          {/* 发送队列面板（有队列项时常驻；可拖动） */}
          <SendQueuePanel />
        </ErrorBoundary>
      </div>

      {/* 右栏：资源库（原 `_Component48.jsx:181-194`）—— 折叠钮在 `.side-clip` **之前** */}
      <aside
        className={`${styles.side} ${styles.sideRight}${rightCollapsed ? ` ${styles.sideCollapsed}` : ''}`}
        aria-label={SHELL_TEXT.libraryAria}
      >
        <button
          type="button"
          className={styles.sideToggle}
          title={rightCollapsed ? SHELL_TEXT.expandLibrary : SHELL_TEXT.collapseLibrary}
          aria-label={rightCollapsed ? SHELL_TEXT.expandLibrary : SHELL_TEXT.collapseLibrary}
          onClick={() => setRightCollapsed((v) => !v)}
        >
          {/* 方向 = **旋转同一颗箭头**。
              ★ 这里原写「展开态朝左、收起态朝右」—— **反了**：这一栏在**右边**，
              "收起"是把栏**往右**收 ⇒ 收起态该朝右（`»` = 箭头默认向）、**展开**态朝左（`«`）。
              几何验证：栏收起后钮仍在栏的**左**缘（`.sideRight .sideToggle { right: 100% }`）——
              朝左才是"把它拉出来"。⚠️ 左栏（后台的账号栏）**是相反的那一套**，
              两处表达式**必须不同**（此前两处逐字相同 ⇒ 必有一处错；按几何，后台那处是对的）。 */}
          <Icon name="chevron" className={rightCollapsed ? shared.iconLeft : undefined} />
        </button>
        <div className={styles.sideClip}>
          <LibraryPanel />
        </div>
      </aside>
    </div>
  );
}
