/**
 * 三栏外壳（docs/11 §二 ui/shell）
 *
 * ⚠️ 职责收窄（审计越权 7）：`shell` **只做布局容器**；页面级内容在 `ui/pages/`
 *
 * 布局：左（账号栏）｜中（画布 + 顶栏）｜右（资源库）
 * 依据：docs/05-画布与交互.md §5（原 `.app > .main-area` 结构）
 */

import { ErrorBoundary } from './ErrorBoundary';
import { ErrorBanner } from '@/ui/common/ErrorBanner';
import { ToastHost } from '@/ui/common/ToastHost';
import { LibraryPanel } from '@/ui/panels/LibraryPanel';
import { GenPanel } from '@/ui/panels/GenPanel';
import { AccountPanel } from '@/ui/panels/AccountPanel';
import { BatchSendPanel } from '@/ui/panels/BatchSendPanel';
import { SendQueuePanel } from '@/ui/panels/SendQueuePanel';
import { TopBar } from './TopBar';
import { useStore } from '@/state';
import styles from './AppShell.module.css';

export interface AppShellProps {
  /** 中间画布区（M2 接 ReactFlow） */
  canvas: React.ReactNode;
}

export function AppShell({ canvas }: AppShellProps) {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);
  const backendErrors = useStore((s) => s.backendErrors);
  const dismissBackendError = useStore((s) => s.dismissBackendError);
  const clearBackendErrors = useStore((s) => s.clearBackendErrors);

  return (
    <div className={styles.app}>
      {/* 错误横幅：原始 message 原样透传（原则 6） */}
      <ErrorBanner
        errors={backendErrors}
        onDismiss={dismissBackendError}
        onClearAll={clearBackendErrors}
      />

      <div className={styles.mainArea}>
        {/*
          左栏：账号（原 `OP.jsx` 的 `.account-panel`）
          ★ 2026-10-10 起**不再是空壳** —— 之前它只是一个带 aria-label 的 `<aside />`：
            没有账号界面 ⇒ 加不了账号 ⇒ 选号池永远为空 ⇒ 生成必然报「未配置账号」。
        */}
        <aside className={styles.side} aria-label="账号栏">
          <AccountPanel />
        </aside>

        <div className={styles.centerStage}>
          <TopBar />
          {/* 画布级错误边界（docs/11 §9.9 的第二级） */}
          <ErrorBoundary area="画布">
            {canvas}
            {/* 生成面板（选中生成类节点时出现） */}
            <GenPanel />
            {/* 批量发送面板（选中 ≥2 个文本框/文生视频节点时出现） */}
            <BatchSendPanel />
            {/* 发送队列面板（有队列项或折叠态时常驻；可拖动） */}
            <SendQueuePanel />
          </ErrorBoundary>
        </div>

        {/* 右栏：资源库 */}
        <aside className={`${styles.side} ${styles.sideRight}`} aria-label="资源栏">
          <LibraryPanel />
        </aside>
      </div>

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
