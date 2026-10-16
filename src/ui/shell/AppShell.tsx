/**
 * 外壳 —— ★★ **两个互斥界面**：`首页`（`ui/pages/HomePage`）与 `豆包后台`（`ui/pages/BackendPage`）
 *
 * ⚠️ 职责：**只做界面切换 + 全局浮层**（错误横幅 / API 弹窗 / Toast）——
 *    页面级内容在 `ui/pages/`，布局词汇（`.mainArea` / `.side` / `.centerStage`）在本目录的 CSS。
 *
 * ⚠️ **为什么后台页常驻**（`BackendPage` 不随切换卸载）：`<webview>` 是后台页的子节点，
 *   而 `findWebview` 是 **DOM 查找**（画布侧「生成」发送也走它），且 guest 视口一塌就回不来
 *    ⇒ 切到首页时后台页只**停靠**（`pageParked`：出流 + 0 尺寸），DOM 仍在。首页没有 guest
 *    ⇒ 切到后台时可以安全 `display:none`（`pageHidden`）。
 */

import { useCallback, useState } from 'react';
import { ErrorBanner } from '@/ui/common/ErrorBanner';
import { ToastHost } from '@/ui/common/ToastHost';
import { ApiSettings } from '@/ui/panels/ApiSettings';
import { HomePage } from '@/ui/pages/HomePage';
import { BackendPage } from '@/ui/pages/BackendPage';
import { TopBar } from '@/ui/shell/TopBar';
import { pickActiveAccountFallback } from '@/core/rules/accountPick';
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
  /**
   * 「API 服务」弹窗开合 —— ★ **组件局部 state**（原 `_Component48` 的 `c` / `l`）
   * 依据：`docs/过程.md` §2.9「面板开合 … ⇒ `useState` 组件局部」（不入 store）。
   */
  const [apiOpen, setApiOpen] = useState(false);
  /**
   * 当前界面 —— ★ **组件局部 state**（原 `_Component48.jsx:56` 的 `const [o, a] = useState(false)`）
   *
   * ⚠️ **默认「首页」**（源初值 `false`）：靠顶栏「豆包后台」入口切到后台、靠后台头部的
   *   「返回画布」切回（源的 `onOpenDoubaoView` / `onClose`）。
   * ⚠️ 住 `AppShell` 而不是 store：源就是宿主的 `useState`（`docs/过程.md` §2.9：面板开合 ⇒ 组件局部）。
   */
  const [doubaoViewVisible, setDoubaoViewVisible] = useState(false);
  /** 在「豆包后台」界面（否则在「首页」）—— 两个界面互斥 */
  const isBackend = doubaoViewVisible;

  const accounts = useStore((s) => s.accounts);
  const activeAccountId = useStore((s) => s.activeAccountId);
  const lastSentAccountId = useStore((s) => s.lastSentAccountId);
  const setActiveAccountId = useStore((s) => s.setActiveAccountId);

  /**
   * 顶栏「豆包后台」按钮（原 `_Component42.jsx:1606` 的 `onClick={tt}`；`tt` 本体见 `:463-475`）
   *
   * 源 `tt` 两件事：**① 没选中账号就先补齐**（优先"上次发送过的（且该账号还在）"否则第一个已登录）
   * ＋ **② 切到后台界面**。
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

      {/* ★ 顶栏 —— **两个界面共用一份**（设计稿：全宽应用栏；此前它住在首页画布里、是浮动胶囊条）
          ⚠️ 位置在 `mainArea` **之上**：它现在是布局里的条（不是浮层），两页都看得见 */}
      <TopBar onOpenDoubaoView={openDoubaoView} />

      <div className={styles.mainArea}>
        {/* 首页界面（画布｜资源库）—— 切到后台时 `display:none`（画布无 guest，可安全收起） */}
        <HomePage canvas={canvas} hidden={isBackend} />
        {/* 豆包后台界面（账号栏｜后台视图）—— ★ 常驻（`<webview>` 宿主，切走只停靠） */}
        <BackendPage
          visible={isBackend}
          onClose={() => setDoubaoViewVisible(false)}
          onOpenApi={() => setApiOpen(true)}
        />
      </div>

      {/* 「API 服务」弹窗（原 `_Component48.jsx:199` 的 `{l && <_Component46 …/>}`） */}
      {apiOpen && <ApiSettings onClose={() => setApiOpen(false)} />}

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
