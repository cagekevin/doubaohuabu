/**
 * 三栏外壳（docs/11 §二 ui/shell）
 *
 * ⚠️ 职责收窄（审计越权 7）：`shell` **只做布局容器**；页面级内容在 `ui/pages/`
 *
 * 布局：左（账号栏）｜中（画布 + 顶栏）｜右（资源库）
 * 依据：docs/05-画布与交互.md §5（原 `.app > .main-area` 结构）
 */

import { useCallback, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorBanner } from '@/ui/common/ErrorBanner';
import { ToastHost } from '@/ui/common/ToastHost';
import { LibraryPanel } from '@/ui/panels/LibraryPanel';
import { AccountPanel } from '@/ui/panels/AccountPanel';
import { SendQueuePanel } from '@/ui/panels/SendQueuePanel';
import { ApiSettings } from '@/ui/panels/ApiSettings';
import { TopBar } from './TopBar';
import { BackendView } from '@/ui/panels/BackendView';
import { pickActiveAccountFallback } from '@/core/rules/accountPick';
import { useStore } from '@/state';
import { API_SETTINGS_TEXT, SHELL_TEXT } from '@/constants/text';
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
  /**
   * 「API 服务」弹窗开合 —— ★ **组件局部 state**（原 `_Component48` 的 `c` / `l`）
   * 依据：`docs/过程.md` §2.9「面板开合 … ⇒ `useState` 组件局部」（不入 store）。
   */
  const [apiOpen, setApiOpen] = useState(false);
  /**
   * 后台视图显隐 —— ★ **组件局部 state**（原 `_Component48.jsx:56` 的 `const [o, a] = useState(false)`）
   *
   * ⚠️ **默认隐藏**（源初值 `false`）：后台视图是**与画布并列**的视图块，靠顶栏「豆包后台」入口打开、
   *   靠它头部的「返回画布」关闭（源的 `onOpenDoubaoView` / `onClose`）。
   * ⚠️ 住 `AppShell` 而不是 store：源就是宿主的 `useState`（`docs/过程.md` §2.9：面板开合 ⇒ 组件局部）。
   */
  const [doubaoViewVisible, setDoubaoViewVisible] = useState(false);
  /**
   * 左右栏收起态 —— ★ **组件局部 state**（源 `_Component48.jsx:56` 的 `const [u, d] = useState(false)` /
   * `const [f, p] = useState(false)`，两个都住在宿主的 `useState` 里，**不入 store**）。
   * 依据：`docs/mockup/README.md` §3.2「两栏均可收起：`.side.collapsed` → 宽 0；`.side-toggle` 是 22×52 骑马钮」。
   */
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const accounts = useStore((s) => s.accounts);
  const activeAccountId = useStore((s) => s.activeAccountId);
  const lastSentAccountId = useStore((s) => s.lastSentAccountId);
  const setActiveAccountId = useStore((s) => s.setActiveAccountId);

  /**
   * 顶栏「豆包后台」按钮（原 `_Component42.jsx:1606` 的 `onClick={tt}`；`tt` 本体见 `:463-475`）
   *
   * 源 `tt` 两件事：**① 没选中账号就先补齐**（优先"上次发送过的（且该账号还在）"否则第一个已登录）
   * ＋ **② 打开后台视图**。
   * ⚠️ ①的判据在**纯层**（`core/rules/accountPick.pickActiveAccountFallback`，**逐字对源**）——
   *   本组件只调用，不写第二份。
   */
  const openDoubaoView = useCallback(() => {
    const pick = pickActiveAccountFallback({ activeAccountId, lastSentAccountId, accounts });
    if (pick) setActiveAccountId(pick);
    setDoubaoViewVisible(true);
  }, [accounts, activeAccountId, lastSentAccountId, setActiveAccountId]);

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
        <aside
          className={`${styles.side}${leftCollapsed ? ` ${styles.sideCollapsed}` : ''}`}
          aria-label={SHELL_TEXT.accountsAria}
        >
          <div className={styles.sideClip}>
            <AccountPanel />
            {/* ★ 「API 服务」入口（原 `_Component48.jsx:155-159` 的 `.side-api-btn`） */}
            <div className={styles.sideApiCol}>
              <button
                type="button"
                className={styles.sideApiBtn}
                title={API_SETTINGS_TEXT.entryTitle}
                onClick={() => setApiOpen(true)}
              >
                <span className={styles.sideApiIcon}>⚡</span>
                {API_SETTINGS_TEXT.entryLabel}
              </button>
            </div>
          </div>
          {/* ★ 折叠钮（原 `_Component48.jsx:163-169` 的 `.side-toggle`）—— 22×52 骑马钮 */}
          <button
            type="button"
            className={styles.sideToggle}
            title={leftCollapsed ? SHELL_TEXT.expandAccounts : SHELL_TEXT.collapseAccounts}
            aria-label={leftCollapsed ? SHELL_TEXT.expandAccounts : SHELL_TEXT.collapseAccounts}
            onClick={() => setLeftCollapsed((v) => !v)}
          >
            {leftCollapsed ? '»' : '«'}
          </button>
        </aside>

        <div className={styles.centerStage}>
          {/* ★ 顶栏收到的 `onOpenDoubaoView` = 源 `_Component48.jsx:173-175` 传给 `_Component42` 的那个 */}
          <TopBar onOpenDoubaoView={openDoubaoView} />
          {/* 画布级错误边界（docs/11 §9.9 的第二级） */}
          <ErrorBoundary area={SHELL_TEXT.areaCanvas}>
            {canvas}
            {/* 发送队列面板（有队列项或折叠态时常驻；可拖动） */}
            <SendQueuePanel />
          </ErrorBoundary>
          {/*
            ★★ **后台视图**（原 `_Component43`）—— **2026-10-12 从账号栏移到这里**：
              源里它与画布**并列**在 `.center-stage`（`_Component48.jsx:171-178`：
              `<FP><_Component42 …/></FP>` ＋ `<_Component43 ref={s} visible={o} onClose={…} />`），
              由宿主的本地态 `o` 控制显隐。
            ⚠️ **DOM 常驻**：隐藏时只是切 `dv-hidden` 类，`<webview>` 仍在 → `findWebview` 照旧找得到。
          */}
          <BackendView
            visible={doubaoViewVisible}
            onClose={() => setDoubaoViewVisible(false)}
          />
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

      {/* 「API 服务」弹窗（原 `_Component48.jsx:199` 的 `{l && <_Component46 …/>}`） */}
      {apiOpen && <ApiSettings onClose={() => setApiOpen(false)} />}

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
