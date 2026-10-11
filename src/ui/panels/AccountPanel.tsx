/**
 * 账号面板（原 `OP.jsx` 991 行的**最小可用子集**）
 *
 * ★★ **它修的是链上第 4 环那个断点**：`grep` 实测本工程此前
 *    **没有 `addAccount`**、`ui/` 里**没有任何账号界面** ⇒ 选号池永远为空
 *    ⇒ `generate` 必然报「未配置已登录的豆包 / Dola 账号」。
 *
 * ★ **与源版的顺序差异（有意，已留痕）**：
 *   源版「＋ 添加账号」= 先选平台（`_ComponentTP`）→ 再在登录表单（`$P`）里**先登录**
 *   → 登录成功后才 `addAccount`（所以源版账号一建出来就是 `已登录`）。
 *   本工程**顺序倒过来**：先建号（`未登录`）→ 在下方 `<webview>` 里真人登录 →
 *   点「检测登录」（`SitePort.probe`）回填状态。
 *   理由：源版那条路依赖 `$P` 的登录弹窗与 `webview` 的紧耦合编排；
 *   而我们的 `BackendView` 已经把 webview 渲染出来了 ⇒ 让它直接可见、由用户操作更简单，
 *   也**不需要**一个新弹窗。代价是多一句引导文案与一个探针按钮。
 *
 * ⚠️ 原则 1：本组件**不写 store**（全部经 `useAccountOps()`）
 * ⚠️ 未落地的：分组（`groups`）、导入/导出（`accountTransfer` 的 UI）、指纹诊断 / 体检 ——
 *    都已登记，本面板**不假装有**。
 */

import { useState } from 'react';
import { useAccountOps, useStore } from '@/state';
import { SITE_TYPES } from '@/stable/model/account';
import { GalleryPanel } from './GalleryPanel';
import { FingerprintScanPanel } from './FingerprintScanPanel';
import { ACCOUNT_PANEL_TEXT } from '@/constants/text';
import { BackendView } from './BackendView';
import styles from './AccountPanel.module.css';

export function AccountPanel() {
  const accounts = useStore((s) => s.accounts);
  const activeAccountId = useStore((s) => s.activeAccountId);
  const setActiveAccountId = useStore((s) => s.setActiveAccountId);
  const pushToast = useStore((s) => s.pushToast);
  const accountOps = useAccountOps();

  const [picking, setPicking] = useState(false);
  const [probing, setProbing] = useState<string | null>(null);
  /** ★ 正在查看哪个账号的画廊（`null` = 不显示）—— 原 `_Component23` 是覆盖层模态 */
  const [galleryFor, setGalleryFor] = useState<string | null>(null);
  /** ★ 是否打开指纹体检面板（原 `OP.jsx` 里的 `DP`） */
  const [scanOpen, setScanOpen] = useState(false);

  const add = (type: string): void => {
    const id = accountOps.addAccount({ type });
    setPicking(false);
    // 新建即设为「当前显示」—— 用户接着就要在那个页面里登录
    setActiveAccountId(id);
    const created = accounts.find((a) => a.id === id);
    pushToast(ACCOUNT_PANEL_TEXT.loginHint(created?.name ?? id), 6000);
  };

  const probe = async (id: string): Promise<void> => {
    setProbing(id);
    try {
      const ok = await accountOps.probeLogin(id);
      pushToast(ok ? ACCOUNT_PANEL_TEXT.loggedInOk : ACCOUNT_PANEL_TEXT.notLoggedIn, undefined, ok ? 'info' : 'warn');
    } finally {
      setProbing(null);
    }
  };

  const remove = async (id: string, name: string): Promise<void> => {
    // ⚠️ 源版 `OP.jsx:801` 自带确认；这里用最直接的 `confirm`（不引入新弹窗件）
    if (!window.confirm(ACCOUNT_PANEL_TEXT.confirmRemove(name))) return;
    if (activeAccountId === id) setActiveAccountId(null);
    await accountOps.removeAccount(id);
  };

  return (
    <div className={styles.panel}>
      {picking ? (
        <div className={styles.pick}>
          <div className={styles.pickTitle}>{ACCOUNT_PANEL_TEXT.pickType}</div>
          {SITE_TYPES.map((t) => (
            <button key={t} type="button" className={styles.pickItem} onClick={() => add(t)}>
              {t}
            </button>
          ))}
          <button type="button" className={styles.pickCancel} onClick={() => setPicking(false)}>
            ×
          </button>
        </div>
      ) : (
        <>
          <button type="button" className={styles.addBtn} onClick={() => setPicking(true)}>
            {ACCOUNT_PANEL_TEXT.addAccount}
          </button>
          {/* ★ 指纹体检（原 `OP.jsx` 里打开 `DP` 的动作）—— 它也是 `scanHistory` 的**唯一写入方** */}
          <button
            type="button"
            className={styles.addBtn}
            title={ACCOUNT_PANEL_TEXT.scanTitle}
            onClick={() => setScanOpen(true)}
          >
            {ACCOUNT_PANEL_TEXT.scan}
          </button>
        </>
      )}

      {/*
        ★ **后台视图必须常驻**（不随面板状态卸载）—— `findWebview` 靠这些 `<webview>`
          在 DOM 里；隐藏态的那些**也要在**，否则后台任务会「找不到 webview」。
      */}
      <BackendView />

      {accounts.length === 0 ? (
        <div className={styles.empty}>{ACCOUNT_PANEL_TEXT.emptyHint}</div>
      ) : (
        <ul className={styles.list}>
          {accounts.map((a) => (
            <li
              key={a.id}
              className={`${styles.row} ${a.id === activeAccountId ? styles.rowActive : ''}`}
            >
              <button
                type="button"
                className={styles.rowMain}
                title={a.type}
                onClick={() => setActiveAccountId(a.id === activeAccountId ? null : a.id)}
              >
                <span className={styles.name}>{a.name}</span>
                <span className={styles.meta}>
                  {a.type} · {a.status}
                </span>
              </button>
              <button
                type="button"
                className={styles.rowBtn}
                disabled={probing === a.id}
                onClick={() => void probe(a.id)}
              >
                {probing === a.id ? ACCOUNT_PANEL_TEXT.probing : ACCOUNT_PANEL_TEXT.probe}
              </button>
              <button
                type="button"
                className={styles.rowBtn}
                title={ACCOUNT_PANEL_TEXT.galleryTitle}
                onClick={() => setGalleryFor(a.id)}
              >
                {ACCOUNT_PANEL_TEXT.gallery}
              </button>
              <button
                type="button"
                className={styles.rowBtnDanger}
                title={ACCOUNT_PANEL_TEXT.removeTitle}
                onClick={() => void remove(a.id, a.name)}
              >
                {ACCOUNT_PANEL_TEXT.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* ★ 画廊面板（原 `_Component23`）—— 覆盖层，挂在列表之后即可 */}
      {galleryFor && <GalleryPanel accountId={galleryFor} onClose={() => setGalleryFor(null)} />}
      {/* ★ 指纹体检面板（覆盖层） */}
      {scanOpen && <FingerprintScanPanel onClose={() => setScanOpen(false)} />}
    </div>
  );
}
