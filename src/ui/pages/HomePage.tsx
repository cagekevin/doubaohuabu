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
import { TopBar } from '@/ui/shell/TopBar';
import { ErrorBoundary } from '@/ui/shell/ErrorBoundary';
import { LibraryPanel } from '@/ui/panels/LibraryPanel';
import { SendQueuePanel } from '@/ui/panels/SendQueuePanel';
import { SHELL_TEXT } from '@/constants/text';
// ★ 布局词汇（`.centerStage` / `.side` / …）住 shell 的模块，两个界面共用同一套
import styles from '@/ui/shell/AppShell.module.css';

export interface HomePageProps {
  /** 中间画布区（M2 接 ReactFlow） */
  canvas: React.ReactNode;
  /** 顶栏「豆包后台」入口被点（切到后台界面；宿主负责补齐当前账号） */
  onOpenBackend: () => void;
  /** 本页是否被切走（切走 ⇒ 整体 `display:none`） */
  hidden: boolean;
}

export function HomePage({ canvas, onOpenBackend, hidden }: HomePageProps) {
  /** 右栏（资源库）收起态 —— 组件局部 state（源 `_Component48.jsx:56` 的 `useState`，不入 store） */
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div className={`${styles.pageRow}${hidden ? ` ${styles.pageHidden}` : ''}`}>
      <div className={styles.centerStage}>
        {/* ★ 顶栏是**画布的头**（项目名 / 保存路径 / 豆包后台入口）—— 后台界面自带头部，不用它 */}
        <TopBar onOpenDoubaoView={onOpenBackend} />
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
          {rightCollapsed ? '«' : '»'}
        </button>
        <div className={styles.sideClip}>
          <LibraryPanel />
        </div>
      </aside>
    </div>
  );
}
