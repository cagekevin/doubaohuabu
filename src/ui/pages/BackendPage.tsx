/**
 * 豆包后台界面 —— ★★ 与「首页」（`ui/pages/HomePage`）是**两个互斥界面**
 *
 * 布局：左（账号栏）｜中（后台视图）
 *
 * ⚠️ 判据（用户裁定「界面彻底分成两个」）：**账号栏属后台、资源库属首页** —— 两侧栏不共存。
 *
 * ★★ **本页常驻（切走只停靠、不卸载）** —— 这是硬约束，不是偷懒：
 *   ① `findWebview` 是 **DOM 查找**（`adapters/site/shared/webview.ts`），而画布侧点「生成」
 *      发送也要走它 ⇒ `<webview>` 必须在 DOM；
 *   ② `<webview>` 的 guest 视口一塌就回不来（见 `BackendView.module.css` 的 `.viewHidden`）
 *      ⇒ 连 `display:none` 都不能用，只能出流 + 0 尺寸「停靠」。
 *   首页没有 guest，所以它可以安全 `display:none`。
 * ⚠️ 原则 1：本页**不写 store**（只读 + 调 action / 控制器）。
 */

import { useState } from 'react';
import { AccountPanel } from '@/ui/panels/AccountPanel';
import { BackendView } from '@/ui/panels/BackendView';
import { API_SETTINGS_TEXT, SHELL_TEXT } from '@/constants/text';
// ★ 布局词汇（`.centerStage` / `.side` / …）住 shell 的模块，两个界面共用同一套
import styles from '@/ui/shell/AppShell.module.css';

export interface BackendPageProps {
  /** 本页是否当前可见（不可见 ⇒ 停靠：出流 + 0 尺寸，DOM 仍在） */
  visible: boolean;
  /** 「返回画布」（后台头部那颗钮；原 `_Component48.jsx:178` 的 `onClose`） */
  onClose: () => void;
  /** 「API 服务」入口被点（弹窗由 `AppShell` 承载） */
  onOpenApi: () => void;
}

export function BackendPage({ visible, onClose, onOpenApi }: BackendPageProps) {
  /** 左栏（账号）收起态 —— 组件局部 state（源 `_Component48.jsx:56` 的 `useState`，不入 store） */
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  return (
    <div className={`${styles.pageRow}${visible ? '' : ` ${styles.pageParked}`}`}>
      {/* 左栏：账号（原 `OP.jsx` 的 `.account-panel`）—— 只在后台界面出现 */}
      {visible && (
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
                onClick={onOpenApi}
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
      )}

      <div className={styles.centerStage}>
        {/* ★★ **后台视图**（原 `_Component43`）—— DOM 常驻，`visible` 只切显隐（见文件头） */}
        <BackendView visible={visible} onClose={onClose} />
      </div>
    </div>
  );
}
