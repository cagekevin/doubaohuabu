/**
 * 授权激活页（授权门）—— 对应原 `W3.jsx`（**192 行**）
 *
 * ★★ **它补的是"能装能跑"的最后一环**：`LicensePort`（`getMachineCode`/`getStatus`/
 *   `activateWithCode`/`exportMachineCode`）与纯层（`isLicenseUsable`/`formatLicenseRemaining`/
 *   `formatDateTime`）**早就落地**，但**没有页面把它接起来** ⇒ 授权状态对用户不可见、
 *   也没法激活。
 *
 * ★ **门的判据是既有的**（`core/rules/license.ts:44`）：**只有 `ok` 放行**，
 *   `none`/`invalid`/`expired`/`tampered` 一律落到本页 —— 那是文件里写明的**有意 fail-close**
 *   （「拿不到授权时宁可不进画布」）。本页不重新定义这个判据。
 *
 * 逐条对源：
 *   | 件 | 源 | 说明 |
 *   |---|---|---|
 *   | 刷新（机器码 + 状态） | `m` 15-30 | 同时取两者；**状态 `ok` ⇒ 调 `onActivated`**（解锁进主界面） |
 *   | 复制机器码 | `w` 32-44 | `copyTextToClipboard` ⇒ 「已复制到剪贴板」/「复制失败，请手动选择复制」 |
 *   | 导出机器码 | `v` 45-62 | `exportMachineCode` ⇒ 「已导出：{path}」/ 后端原文 / 「导出已取消」 |
 *   | 激活 | `y` 63-102 | **四分支**：`ok`（成功 + **600ms 后 `onActivated`**）/ `tampered` / `used` / 其它 |
 *   | 四条 banner | 111-151 | `ok` / `expired`（warn）/ `invalid`（err）/ `tampered`（err） |
 *   | 重新检测按钮 | 152-155 | **只在 `expired`/`invalid`/`tampered` 时出现**（`C`） |
 *   | 机器码区 / 激活码区 / 页脚 | 157-189 | 逐字 |
 *
 * ⚠️ **原则 1 + 铁律 2**：本组件调 `useLicenseOps()`（state 控制器 → `core/usecases/license`），
 *   **不写 store**，也**不直调端口** —— 授权状态不住 store（它是一次性读取的页面数据，
 *   不是要与画布共享的状态）；而"不落 store"**不能**推出"ui 可直调端口"。
 *   ★ 2026-10-11：原先 6 处 `usePorts().host.license.*` 已收口到控制器（TD-16-8）。
 * ⚠️ 与源一致：**激活成功要等 600ms 才 `onActivated`** —— 否则那条「激活成功，有效期至…」
 *   会一闪而过（用户看不到自己成功了）。
 */

import { useCallback, useEffect, useState } from 'react';
import { useLicenseOps } from '@/state';
import type { LicenseStatus } from '@/core/model/license';
import { formatDateTime, formatLicenseRemaining, isLicenseUsable } from '@/core/rules/license';
import { LICENSE_TEXT } from '@/constants/text';
import styles from './ActivatePage.module.css';

export interface ActivatePageProps {
  /** 启动时已经读到的状态（`null` = 读失败/还不知道） */
  initialStatus: LicenseStatus | null;
  /**
   * 启动时读失败的**原文**（原 `W3.jsx` 的 `u('获取授权信息失败：' + …)`）
   * ⚠️ 加这个参数是为了**不吞错误**（`原则6/no-swallow`）：调用方 `catch` 到端口异常时
   *   必须把原因交出来显示，而不是静默当成"没授权"。
   */
  initialError?: string;
  /** 授权可用时调用（**由调用方决定"进主界面"这件事** —— 本页不碰路由） */
  onActivated: () => void;
}

/** 激活成功后进主界面的延迟（原 `W3.jsx:88` 的 `setTimeout(…, 600)`） */
const UNLOCK_DELAY_MS = 600;

export function ActivatePage({ initialStatus, initialError, onActivated }: ActivatePageProps) {
  const licenseOps = useLicenseOps();

  const [machineCode, setMachineCode] = useState('');
  const [status, setStatus] = useState<LicenseStatus | null>(initialStatus);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(
    initialError ? LICENSE_TEXT.msgFetchFailed(initialError) : '',
  );
  const [msgKind, setMsgKind] = useState<'ok' | 'err' | ''>(initialError ? 'err' : '');
  const [busy, setBusy] = useState(false);
  /**
   * 「现在几点」—— ★ **必须收进 state**：渲染期直接调 `Date.now()` 是**不纯调用**
   * （eslint `Cannot call impure function during render` 会拦，本项目已因此改过两处）。
   * ⚠️ 本页**不需要**每秒刷新（剩余有效期按天/小时显示，秒级跳动没有意义）。
   */
  const [nowMs] = useState(() => Date.now());

  /** 刷新（原 `m` 15-30）—— 机器码与状态一起取；**状态 `ok` ⇒ 解锁** */
  const refresh = useCallback(async () => {
    try {
      const mc = await licenseOps.readMachineCode();
      if (mc.ok) setMachineCode(mc.value);
      const st = await licenseOps.checkStatus();
      if (st.ok) {
        setStatus(st.value.info);
        if (st.value.info.status === 'ok') onActivated();
      }
    } catch (e) {
      setMsg(LICENSE_TEXT.msgFetchFailed(e instanceof Error ? e.message : String(e)));
      setMsgKind('err');
    }
  }, [licenseOps, onActivated]);

  /**
   * ⚠️ 与 `main.tsx` 同一形态：**不**在 effect 体里直接调带 setState 的函数
   *   （`react-hooks/set-state-in-effect` 会拦）⇒ 在 **`.then` 回调**里 setState + 取消位。
   */
  useEffect(() => {
    let alive = true;
    licenseOps
      .readMachineCode()
      .then((mc) => {
        if (alive && mc.ok) setMachineCode(mc.value);
        return licenseOps.checkStatus();
      })
      .then((st) => {
        if (!alive || !st.ok) return;
        setStatus(st.value.info);
        if (st.value.info.status === 'ok') onActivated();
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setMsg(LICENSE_TEXT.msgFetchFailed(e instanceof Error ? e.message : String(e)));
        setMsgKind('err');
      });
    return () => {
      alive = false;
    };
  }, [licenseOps, onActivated]);

  /** 复制机器码（原 `w` 32-44） */
  const copyMachineCode = useCallback(async () => {
    if (!machineCode) return;
    try {
      await navigator.clipboard.writeText(machineCode);
      setMsg(LICENSE_TEXT.msgMachineCopied);
      setMsgKind('ok');
    } catch {
      setMsg(LICENSE_TEXT.msgMachineCopyFailed);
      setMsgKind('err');
    }
  }, [machineCode]);

  /** 导出机器码（原 `v` 45-62） */
  const exportMachineCode = useCallback(async () => {
    if (!machineCode) return;
    try {
      const r = await licenseOps.exportMachineCode(machineCode);
      if (r.ok) {
        setMsg(LICENSE_TEXT.msgMachineExported(r.value.path ?? ''));
        setMsgKind('ok');
      } else {
        // ⚠️ 源版这里是 `(S?.error) || '导出已取消'` —— 后端取消导出时把「已取消」当 error 传
        setMsg(r.message === LICENSE_TEXT.exportCanceled ? LICENSE_TEXT.exportCanceled : LICENSE_TEXT.msgExportFailed(r.message || LICENSE_TEXT.exportCanceled));
        setMsgKind('err');
      }
    } catch (e) {
      setMsg(LICENSE_TEXT.msgExportFailed(e instanceof Error ? e.message : String(e)));
      setMsgKind('err');
    }
  }, [machineCode, licenseOps]);

  /** 激活（原 `y` 63-102） */
  const activate = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setMsg(LICENSE_TEXT.msgEnterCode);
      setMsgKind('err');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const r = await licenseOps.activate(trimmed);
      if (!r.ok) {
        setMsg(LICENSE_TEXT.msgActivateFailed(r.message || LICENSE_TEXT.unknownError));
        setMsgKind('err');
        return;
      }
      const v = r.value.info;
      if (v.status === 'ok') {
        setStatus({ status: 'ok', ...(v.expireAt === undefined ? {} : { expireAt: v.expireAt }), machineCode });
        setMsg(LICENSE_TEXT.msgActivated(formatDateTime(v.expireAt)));
        setMsgKind('ok');
        setCode('');
        // ⚠️ 与源一致：**等 600ms 再解锁**，否则这条成功消息一闪而过
        setTimeout(() => onActivated(), UNLOCK_DELAY_MS);
      } else if (v.status === 'tampered') {
        setMsg(LICENSE_TEXT.msgTampered(v.tamperReason || '时间篡改'));
        setMsgKind('err');
        void refresh();
      } else if (v.status === 'used') {
        setMsg(LICENSE_TEXT.msgUsed);
        setMsgKind('err');
        void refresh();
      } else {
        setMsg(LICENSE_TEXT.msgActivateFailed(v.error || LICENSE_TEXT.unknownError));
        setMsgKind('err');
      }
    } catch (e) {
      setMsg(LICENSE_TEXT.msgActivateFailed(e instanceof Error ? e.message : String(e)));
      setMsgKind('err');
    } finally {
      setBusy(false);
    }
  }, [code, licenseOps, machineCode, onActivated, refresh]);

  // 派生（原 103-107）
  const ok = !!status && status.status === 'ok';
  const expired = !!status && status.status === 'expired';
  const invalid = !!status && status.status === 'invalid';
  const tampered = !!status && status.status === 'tampered';
  const showRecheck = expired || invalid || tampered;
  void isLicenseUsable; // ⚠️ 门的判据由**调用方**（`main.tsx` 的 Root）用，本页只展示

  return (
    <div className={styles.screen} data-testid="activate-page">
      <div className={styles.card}>
        <div className={styles.top}>
          <div className={styles.brand}>{LICENSE_TEXT.brand}</div>
        </div>
        <div className={styles.sub}>{LICENSE_TEXT.sub}</div>

        {ok && (
          <div className={`${styles.banner} ${styles.ok}`}>
            <span className={styles.icon}>✓</span>
            <div>
              <div className={styles.bTitle}>{LICENSE_TEXT.bannerOk}</div>
              <div className={styles.bDesc}>
                {LICENSE_TEXT.bannerOkDesc(
                  formatDateTime(status?.expireAt),
                  formatLicenseRemaining(status?.expireAt ?? 0, nowMs),
                )}
              </div>
            </div>
          </div>
        )}
        {expired && (
          <div className={`${styles.banner} ${styles.warn}`}>
            <span className={styles.icon}>⏱</span>
            <div>
              <div className={styles.bTitle}>{LICENSE_TEXT.bannerExpired}</div>
              <div className={styles.bDesc}>
                {LICENSE_TEXT.bannerExpiredDesc(formatDateTime(status?.expireAt))}
              </div>
            </div>
          </div>
        )}
        {invalid && (
          <div className={`${styles.banner} ${styles.err}`}>
            <span className={styles.icon}>✕</span>
            <div>
              <div className={styles.bTitle}>{LICENSE_TEXT.bannerInvalid}</div>
              <div className={styles.bDesc}>{status?.reason || LICENSE_TEXT.bannerInvalidFallback}</div>
            </div>
          </div>
        )}
        {tampered && (
          <div className={`${styles.banner} ${styles.err}`}>
            <span className={styles.icon}>⚠</span>
            <div>
              <div className={styles.bTitle}>{LICENSE_TEXT.bannerTampered}</div>
              <div className={styles.bDesc}>{LICENSE_TEXT.bannerTamperedDesc}</div>
            </div>
          </div>
        )}

        {showRecheck && (
          <button type="button" className={styles.recheck} onClick={() => void refresh()}>
            {LICENSE_TEXT.recheck}
          </button>
        )}

        <div className={styles.section}>
          <div className={styles.label}>{LICENSE_TEXT.machineLabel}</div>
          <div className={styles.codeBox}>
            <code className={styles.codeText}>
              {machineCode || LICENSE_TEXT.machineGenerating}
            </code>
            <div className={styles.codeActions}>
              <button
                type="button"
                className={styles.sm}
                disabled={!machineCode}
                onClick={() => void copyMachineCode()}
              >
                {LICENSE_TEXT.machineCopy}
              </button>
              <button
                type="button"
                className={`${styles.sm} ${styles.ghost}`}
                disabled={!machineCode}
                onClick={() => void exportMachineCode()}
              >
                {LICENSE_TEXT.machineExport}
              </button>
            </div>
          </div>
          <div className={styles.hint}>{LICENSE_TEXT.machineHint}</div>
        </div>

        <div className={styles.section}>
          <div className={styles.label}>{LICENSE_TEXT.codeLabel}</div>
          <textarea
            className={styles.input}
            placeholder={LICENSE_TEXT.codePlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              // 原 178-180：**Ctrl/Cmd + Enter** 提交（单 Enter 留给换行）
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void activate();
            }}
            spellCheck={false}
          />
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => void activate()}
          >
            {busy ? LICENSE_TEXT.activating : ok ? LICENSE_TEXT.reactivate : LICENSE_TEXT.activate}
          </button>
        </div>

        {msg && <div className={`${styles.msg} ${msgKind ? styles[msgKind] : ''}`}>{msg}</div>}

        <div className={styles.foot}>{LICENSE_TEXT.foot}</div>
      </div>
    </div>
  );
}
