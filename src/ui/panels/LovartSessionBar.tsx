/**
 * Lovart 会话条（原 `_Component25.jsx:358-382` 的 `.lsb-clip` 块）
 *
 * ★ **它是什么**：Lovart 账号的后台视图顶部那条「在真实 Chrome 登录 / 同步会话到画布 / 关闭 Chrome」。
 *   目的（源注释）：内嵌 webview 会被设备信任识别 ⇒ 改用**本机真实 Chrome**（每账号独立 profile）
 *   人工登录，再把会话 cookie 同步进 webview 分区。
 *
 * ★ **为什么单独一个文件**：它自带一套状态机（打开态 4 档 + 同步态 3 档）与三个 handler，
 *   与 `BackendView` 的「容器 / 头部 / 遮罩」是两件事（源里同在 `_Component25` 内，
 *   但那是 358 行的单文件；本仓按职责拆）。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 本文件 |
 *   |---|---|---|
 *   | 打开 | `:229-275`（`z`） | `onOpen` → `accountOps.openLovartChrome` |
 *   | 同步 | `:276-327`（`O`） | `onSync` → `accountOps.syncLovartSession` + `reloadBackend` |
 *   | 关闭 | `:328-340`（`R`） | `onClose` → `accountOps.closeLovartChrome` |
 *   | 折叠 | `:359-363` | `headCollapsed` 时高度归 0（与头部同步折叠） |
 *
 * ⚠️ **判据全在纯层** `core/rules/lovartSession`（提示行 / 三键禁用 / 两处错误行）—— 本组件只**转发**。
 * ⚠️ `ui` **不持端口**（铁律②）：三条都经 `accountOps`。
 * ⚠️ 两处**有意差异**（见 `accountOps` 接口注释）：① 关闭失败源是空吞 ⇒ 本仓 `log.warn` 留痕；
 *    ② 同步后 `reload` 失败源是空吞 ⇒ 本仓 toast 出来。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccountOps, useStore } from '@/state';
import type { Account } from '@/stable/model/account';
import { LOVART_SESSION_TEXT } from '@/constants/text';
import {
  lovartCloseDisabled,
  lovartHint,
  lovartOpenDisabled,
  lovartOpenErrorText,
  lovartSyncDisabled,
  lovartSyncErrorText,
  lovartSyncLabel,
  type LovartOpenState,
  type LovartSyncState,
} from '@/core/rules/lovartSession';
import styles from './BackendView.module.css';

/** toast 停留（与 `BackendView` 同一口径） */
const TOAST_MS = 4000;

export function LovartSessionBar({ account, partition }: { account: Account; partition: string }) {
  const accountOps = useAccountOps();
  const pushToast = useStore((s) => s.pushToast);
  /** 头部折叠态（原 `_Component25` 的 `a`）—— 与头部**同步折叠**（源 `:359-363`） */
  const headCollapsed = useStore((s) => s.viewHeadCollapsed);

  const [open, setOpen] = useState<LovartOpenState>({ status: 'idle' });
  const [sync, setSync] = useState<LovartSyncState | null>(null);

  /** 条自身高度（原 `j`，`:60-77` 的 ResizeObserver）—— 折叠过渡用 */
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 打开真实 Chrome（原 `z`）—— `Result` 的**内层**才是业务结果（`error` 是后端错误码） */
  const onOpen = useCallback(() => {
    setOpen({ status: 'opening' });
    void accountOps
      .openLovartChrome(account.id, accountOps.chatUrlOf(account.type), account.proxy ?? '')
      .then((r) => {
        if (!r.ok) {
          // IPC 通道故障（源 `catch` ⇒ `error:'exception'`，文案表里有这一档）
          setOpen({ status: 'error', error: 'exception', message: r.message });
          return;
        }
        setOpen(
          r.value.ok
            ? { status: 'open', alreadyOpen: r.value.alreadyOpen }
            : { status: 'error', error: r.value.error, message: r.value.message },
        );
      });
  }, [accountOps, account.id, account.type, account.proxy]);

  /** 同步会话到画布（原 `O`）—— 成功后 toast + 刷新画布内窗口（源 `l.current.reload()`） */
  const onSync = useCallback(() => {
    setSync({ status: 'syncing' });
    void accountOps.syncLovartSession(account.id, partition).then((r) => {
      if (!r.ok) {
        // IPC 通道故障（与外层 `Result` 同形，文案直接给）
        setSync({ status: 'error', message: r.message });
        return;
      }
      if (!r.value.ok) {
        setSync({ status: 'error', message: r.value.message });
        return;
      }
      setSync(null);
      pushToast(LOVART_SESSION_TEXT.syncedToast(r.value.count, r.value.total), TOAST_MS, 'success');
      // ⚠️ 源把 `reload()` 包在空 catch 里 ⇒ 本仓**留痕**（失败 toast 出来）
      const reloaded = accountOps.reloadBackend(account.id);
      if (!reloaded.ok) pushToast(reloaded.message, TOAST_MS, 'error');
    });
  }, [accountOps, account.id, partition, pushToast]);

  /** 关闭真实 Chrome（原 `R`）—— 无论成败都复位本地态（源同；关窗失败的留痕在 `accountOps` 内） */
  const onClose = useCallback(() => {
    void accountOps.closeLovartChrome(account.id).then(() => {
      setOpen({ status: 'idle' });
      setSync(null);
    });
  }, [accountOps, account.id]);

  const syncErr = lovartSyncErrorText(sync);
  const openErr = lovartOpenErrorText(open);

  return (
    <div
      className={styles.sessionClip}
      style={headCollapsed ? { height: 0 } : barH ? { height: barH } : undefined}
    >
      <div className={styles.sessionBar} ref={barRef}>
        <span className={styles.sessionHint}>{lovartHint(open)}</span>
        <div className={styles.sessionActions}>
          <button
            type="button"
            className={styles.sessionBtn}
            onClick={onOpen}
            disabled={lovartOpenDisabled(open)}
          >
            {LOVART_SESSION_TEXT.open}
          </button>
          <button
            type="button"
            className={styles.sessionBtnPrimary}
            onClick={onSync}
            disabled={lovartSyncDisabled(sync)}
          >
            {lovartSyncLabel(sync)}
          </button>
          <button
            type="button"
            className={styles.sessionBtn}
            onClick={onClose}
            disabled={lovartCloseDisabled(open)}
          >
            {LOVART_SESSION_TEXT.close}
          </button>
        </div>
        {syncErr ? <span className={`${styles.sessionStatus} ${styles.sessionErr}`}>{syncErr}</span> : null}
        {openErr ? <span className={`${styles.sessionStatus} ${styles.sessionErr}`}>{openErr}</span> : null}
      </div>
    </div>
  );
}
