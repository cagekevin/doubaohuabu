/**
 * 登录弹窗（原 `$P.jsx`，331 行）—— ★★ **建号真正发生的地方**
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 外壳 | `$P.jsx:250-251` | `.login-backdrop` + `.login-modal`（720px / 78% 高） |
 *   | 头 | `:252-268` | `.login-title`（`登录${m}账号`）+ `.login-actions`（在浏览器打开 / 完成登录 / 关闭） |
 *   | 身份 | `:22-35` | `id` = `acc_…` · `partition` = `persist:<type>_<rand>` · `fingerprint` = `zc(\`${id}#0\`)` |
 *   | 会话准备 | `:49-90` | lovart ⇒ `ensureLovartContainer`；否则 `ensureFingerprint` → `preloadUrl` |
 *   | 登录页 | `:17` | `SP`/`NP`/`CP`/`EP`/`jP`（**站点首页**，不是会话页） |
 *   | **建号** | `:102-156` | `addAccount({ id, type, partition, fingerprint, status:'已登录', addedAt })` |
 *   | 自动检测 | `:199-249` | 每 **2s** 探一次；已登录 ⇒ 自动 `se()` |
 *   | 收尾 | `:91-101` | 把 webview 卸掉 → **1.5s 后**关弹窗 |
 *   | 自定义网站 | `:269-284` / `:187-198` | 网址输入行 + 「进入」 |
 *   | tapnow 验证链接 | `:316-328` / `:157-186` | 粘贴链接 + 「确认进入」 |
 *   | 载入失败 | `:285-315` | `.login-load-error`（错误码 + 提示改用浏览器打开） |
 *
 * ★★ **它修的是用户点名的那处错**：此前「＋ 添加账号」是**先建号（`未登录`）**，
 *   于是左栏**立刻**多出一行「未登录」的账号（用户原话：「添加账户的左侧栏为什么还一直在出现」）。
 *   源版是**先登录、登录成功才建号**（所以左栏在那之前**什么都不多**）——
 *   本组件就是那条路：`buildPendingAccount` 算出一个**没入名册**的身份，
 *   登录成功后由 `addAccount` **一次性**入册。
 *
 * ⚠️ **两处如实差异（都因本仓既有的架构约束，不是偷懒）**：
 *   ① **自动检测的机制**：源版每 2s 读 `<webview>` 的 **cookie**（`session.cookies.get({})`）。
 *      本仓 `AccountPort` 的契约里写死了「**cookie 由后端管理，前端一律不碰**」（`docs/10` #5）
 *      ⇒ 改用**同义的 `SitePort.probe`**（`accountOps.probeLoginOf`）—— 行为一致、机制不同。
 *   ② **载入失败事件**：源版挂 React 的 `onLoadCommit`（`nativeEvent.errorCode`）；
 *      本仓用 ref + `addEventListener('did-fail-load')`（同一份字段，Electron 的标准事件名）。
 *
 * ⚠️ 原则 1：本组件**不写 store**（建号走 `addAccount` action；会话准备走 `accountOps`）
 * ⚠️ 弹窗外壳 / 关闭钮 / 遮罩一律走 `ui/common/PanelShell`（2026-10-12 口径：
 *    **遮罩只有一种、关闭钮只有一种 ✕、头只有一种**）—— 源版那个「关闭」文本钮并入 `✕`，
 *    「在浏览器打开 / 完成登录」两只是**动作**，住 `PanelShell` 的 `actions` 槽。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelShell } from '@/ui/common/PanelShell';
import { useAccountOps, useHostOps, useStore } from '@/state';
import { LOGIN_MODAL_TEXT } from '@/constants/text';
import { SITE_LOGIN_URL } from '@/constants/models';
import { ACCOUNT_STATUS, type SiteType } from '@/stable/model/account';
import styles from './LoginModal.module.css';

/** 自动检测的间隔（ms）—— 原 `$P.jsx:242` 的 `setInterval(pe, 2000)` */
const LOGIN_POLL_MS = 2000;
/** 建号后到关窗的延迟（ms）—— 原 `$P.jsx:98-100` 的 `setTimeout(() => e(), 1500)` */
const CLOSE_DELAY_MS = 1500;
/** tapnow 验证链接打开后的静置（ms）—— 原 `$P.jsx:172-176` 的 `setTimeout(…, 1500)` */
const VERIFY_SETTLE_MS = 1500;

/** `<webview>` 的最小可写接口（只用到 `src`）—— 与 `webview.d.ts` 同策略：不拉 Electron 类型 */
interface WebviewLike extends HTMLElement {
  src: string;
}

/** 补协议（原 `$P.jsx:112-114` / `:164-166`：没写 `http(s)://` 就补 `https://`） */
function withProtocol(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export interface LoginModalProps {
  /** 要登录的站点类型（原 `$P` 的 `type`，默认 `doubao`） */
  type: SiteType;
  onClose: () => void;
}

export function LoginModal({ type, onClose }: LoginModalProps) {
  const buildPendingAccount = useStore((s) => s.buildPendingAccount);
  const addAccount = useStore((s) => s.addAccount);
  const pushBackendError = useStore((s) => s.pushBackendError);
  const accountOps = useAccountOps();
  const hostOps = useHostOps();

  /**
   * 待建账号的**身份三件套**（原 `$P.jsx:22-35`）—— **只算一次**（`useState` 惰性初值）。
   * ⚠️ 与源一致：它**不入名册**；`addAccount` 在登录成功时才把它落进去。
   */
  const [pending] = useState(() => buildPendingAccount(type));

  /** `other` 的网址输入（原 `u`/`d`） */
  const [url, setUrl] = useState('');
  /** `other` 的网址校验提示（原 `f`/`p`） */
  const [urlMsg, setUrlMsg] = useState('');
  /** tapnow 的验证链接（原 `I`/`z`） */
  const [verify, setVerify] = useState('');
  /** tapnow 的提示（原 `D`/`A`） */
  const [verifyMsg, setVerifyMsg] = useState('');
  /** tapnow 验证中（原 `O`/`R`） */
  const [verifying, setVerifying] = useState(false);
  /** 指纹 preload（原 `b`/`x`） */
  const [preloadUrl, setPreloadUrl] = useState<string | null>(null);
  /**
   * 会话是否已就绪（原 `C`/`S`）—— 未就绪时**不渲染 webview**
   * ⚠️ `other` 不需要指纹 ⇒ 恒就绪（源版 `$P` 对 `other` 也走 `ensureFingerprint`，
   *   但 `other` 的账号**没有指纹**，那条 preload 也无处可挂 ⇒ 本仓直接跳过，语义等价）。
   */
  const [ready, setReady] = useState(type === 'other');
  /** 载入失败（原 `F`/`M`） */
  const [loadError, setLoadError] = useState<{ code: number; description: string } | null>(null);
  /** 已建号 ⇒ 立刻卸掉 webview（原 `J` 的 `src='about:blank'`，见 `finish`） */
  const [closed, setClosed] = useState(false);

  const webviewRef = useRef<WebviewLike | null>(null);
  /** 建号防重入（原 `r.current`）—— 自动检测与手点「完成登录」可能同拍 */
  const createdRef = useRef(false);

  /** 登录页地址（原 `$P.jsx:17`）—— `other` 用用户输入，空则 `about:blank`（逐字对源） */
  const loginUrl =
    type === 'other' ? url.trim() || 'about:blank' : SITE_LOGIN_URL[type] ?? 'about:blank';

  // ① 会话准备（原 `$P.jsx:49-90`）—— **只在 `.then` 里回写状态**（effect 体里不同步 setState）
  useEffect(() => {
    if (type === 'other') return;
    let cancelled = false;
    void accountOps
      .prepareWebviewSession({
        accountId: pending.id,
        partition: pending.partition,
        ...(pending.fingerprint ? { fingerprint: pending.fingerprint } : {}),
      })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setPreloadUrl(r.value.preloadUrl);
        // ⚠️ 失败**不静默**（源版 `.catch(() => {})` 吞掉）—— 但**照常渲染**：
        //    没有 preload 只是"没有指纹伪装"，页面还能开（源版同样继续）
        else pushBackendError('unknown', r.message);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accountOps, type, pending, pushBackendError]);

  /**
   * ② 建号（原 `$P.jsx:102-156` 的 `se`）—— ★★ **本弹窗唯一写 store 的地方**
   *
   * 源版顺序：防重入 → `addAccount({...status:'已登录'})` → 卸 webview → 1.5s 后关窗。
   */
  const finish = useCallback(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    addAccount({
      id: pending.id,
      type,
      partition: pending.partition,
      ...(pending.fingerprint ? { fingerprint: pending.fingerprint } : {}),
      status: ACCOUNT_STATUS.loggedIn,
      addedAt: Date.now(),
      // 只有 `other` 记网址（原 `:119` 的 `url: q`）—— 其余站点的地址由站点声明
      ...(type === 'other' ? { url: withProtocol(url.trim()) } : {}),
    });
    // 原 `J`：先把 webview 卸掉（停掉 guest），再等 1.5s 关窗
    setClosed(true);
    window.setTimeout(onClose, CLOSE_DELAY_MS);
  }, [addAccount, onClose, pending, type, url]);

  // ③ 自动检测登录（原 `$P.jsx:199-249` 的 `pe` + `:228-249` 的轮询）
  //    ⚠️ 机制差异见文件头①：源读 cookie，本仓走 `SitePort.probe`
  useEffect(() => {
    if (!ready || loadError || closed) return;
    const timer = window.setInterval(() => {
      void accountOps.probeLoginOf(pending).then((loggedIn) => {
        if (loggedIn) finish();
      });
    }, LOGIN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [ready, loadError, closed, accountOps, pending, finish]);

  // ④ 载入失败（原 `$P.jsx:285-301` 的 `onLoadCommit` / `onDomReady`）
  useEffect(() => {
    const el = webviewRef.current;
    if (!el || closed) return;
    const onFail = (e: Event): void => {
      const d = (e as Event & { errorCode?: number; errorDescription?: string }).errorCode;
      const desc = (e as Event & { errorDescription?: string }).errorDescription ?? '';
      // `errorCode === 0` 是"正常结束"（源 `:291` 的 `if (q && q !== 0)`）—— 不算失败
      if (!d) return;
      setLoadError({ code: d, description: desc });
    };
    const onReady = (): void => setLoadError(null);
    el.addEventListener('did-fail-load', onFail);
    el.addEventListener('dom-ready', onReady);
    return () => {
      el.removeEventListener('did-fail-load', onFail);
      el.removeEventListener('dom-ready', onReady);
    };
  }, [ready, closed, loginUrl]);

  /** 「在浏览器打开」（原 `$P.jsx:255-260`）—— 失败**不静默**（源那行没有反馈） */
  const onOpenExternal = useCallback(() => {
    void hostOps.openExternal(loginUrl).then((r) => {
      if (!r.ok) pushBackendError('unknown', r.message);
    });
  }, [hostOps, loginUrl, pushBackendError]);

  /** `other` 的「进入」（原 `$P.jsx:187-198` 的 `V`）：归一网址并让 webview 导航过去 */
  const onEnterUrl = useCallback(() => {
    const raw = url.trim();
    if (!raw) {
      setUrlMsg(LOGIN_MODAL_TEXT.urlRequired);
      return;
    }
    setUrlMsg('');
    // 原 `d(ne)`：把**输入框**换成归一后的地址（webview 的 `src` 跟着变）
    setUrl(withProtocol(raw));
  }, [url]);

  /** tapnow 的「确认进入」（原 `$P.jsx:157-186` 的 `ke`） */
  const onVerify = useCallback(() => {
    const raw = verify.trim();
    const el = webviewRef.current;
    if (!raw || !el) {
      setVerifyMsg(LOGIN_MODAL_TEXT.verifyRequired);
      return;
    }
    setVerifying(true);
    setVerifyMsg(LOGIN_MODAL_TEXT.verifyOpening);
    const done = (): void => {
      el.removeEventListener('did-navigate', done);
      el.removeEventListener('did-navigate-in-page', done);
      window.setTimeout(() => {
        setVerifyMsg(LOGIN_MODAL_TEXT.verifyDone);
        setVerifying(false);
        finish();
      }, VERIFY_SETTLE_MS);
    };
    el.addEventListener('did-navigate', done);
    el.addEventListener('did-navigate-in-page', done);
    try {
      el.src = withProtocol(raw);
    } catch {
      setVerifying(false);
      setVerifyMsg(LOGIN_MODAL_TEXT.verifyFailed);
    }
  }, [verify, finish]);

  /** 「完成登录 / 保存」（原 `$P.jsx:261-263`） */
  const onSubmit = useCallback(() => {
    if (type === 'other' && !url.trim()) {
      setUrlMsg(LOGIN_MODAL_TEXT.urlRequired);
      return;
    }
    finish();
  }, [type, url, finish]);

  const title = type === 'other' ? LOGIN_MODAL_TEXT.otherTitle : `${LOGIN_MODAL_TEXT.titlePrefix}${LOGIN_MODAL_TEXT.siteName[type] ?? type}${LOGIN_MODAL_TEXT.titleSuffix}`;

  return (
    <PanelShell
      overlay
      onClose={onClose}
      className={styles.panel}
      bodyClassName={styles.body}
      testId="login-modal"
      title={title}
      actions={
        <>
          {/* tapnow **没有**「在浏览器打开」那一颗（原 `$P.jsx:255` 的 `!a && …`） */}
          {type !== 'tapnow' && (
            <button
              type="button"
              className={styles.btn}
              disabled={type === 'other' && !url.trim()}
              onClick={onOpenExternal}
            >
              {LOGIN_MODAL_TEXT.openExternal}
            </button>
          )}
          <button type="button" className={styles.btnPrimary} onClick={onSubmit}>
            {type === 'other' ? LOGIN_MODAL_TEXT.save : LOGIN_MODAL_TEXT.done}
          </button>
        </>
      }
    >
      {/* `other` 的网址行（原 `$P.jsx:269-284`） */}
      {type === 'other' && (
        <div className={styles.verifyRow}>
          <input
            type="text"
            className={styles.verifyInput}
            placeholder={LOGIN_MODAL_TEXT.urlPlaceholder}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (urlMsg) setUrlMsg('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEnterUrl();
            }}
          />
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!url.trim()}
            onClick={onEnterUrl}
          >
            {LOGIN_MODAL_TEXT.enter}
          </button>
          {urlMsg && <span className={styles.verifyMsg}>{urlMsg}</span>}
        </div>
      )}

      {/* webview（原 `$P.jsx:285-301`）—— ⚠️ 属性顺序有意义：`partition` 必须在 `src` 之前 */}
      {ready && !loadError && !closed && (
        <webview
          key={`login-${pending.id}`}
          ref={(el: WebviewLike | null) => {
            webviewRef.current = el;
          }}
          partition={pending.partition ?? undefined}
          src={loginUrl}
          {...(pending.fingerprint ? { useragent: pending.fingerprint.userAgent } : {})}
          {...(type !== 'other' && preloadUrl ? { preload: preloadUrl } : {})}
          /* ⚠️ 必须传字符串（React 不认它是布尔属性）—— 同 `BackendView` 的写法 */
          allowpopups={'true' as unknown as boolean}
          className={styles.webview}
        />
      )}

      {/* 载入失败（原 `$P.jsx:302-315`） */}
      {loadError && (
        <div className={styles.loadError}>
          <div className={styles.loadErrorTitle}>{LOGIN_MODAL_TEXT.loadErrorTitle}</div>
          <div className={styles.loadErrorDesc}>
            {LOGIN_MODAL_TEXT.loadErrorDesc(loadError.code, loadError.description)}
          </div>
          <button type="button" className={styles.btnPrimary} onClick={onOpenExternal}>
            {LOGIN_MODAL_TEXT.openExternal}
          </button>
        </div>
      )}

      {/* tapnow 的验证链接行（原 `$P.jsx:316-328`） */}
      {type === 'tapnow' && (
        <div className={styles.verifyRow}>
          <input
            type="text"
            className={styles.verifyInput}
            placeholder={LOGIN_MODAL_TEXT.verifyPlaceholder}
            value={verify}
            disabled={verifying}
            onChange={(e) => setVerify(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onVerify();
            }}
          />
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={verifying || !verify.trim()}
            onClick={onVerify}
          >
            {verifying ? LOGIN_MODAL_TEXT.verifyEntering : LOGIN_MODAL_TEXT.verifyEnter}
          </button>
          {verifyMsg && <span className={styles.verifyMsg}>{verifyMsg}</span>}
        </div>
      )}
    </PanelShell>
  );
}
