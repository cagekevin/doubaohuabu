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
 * ⚠️ 原则 1：本组件**不写 store**（写全经 `useAccountOps()` / store action）
 *
 * ✅ **2026-10-11 更新**：此前的「未落地清单」已全部补齐 —— 分组管理（`GroupManagerModal`）·
 *    导入 / 导出（`.account-tool-row` + `ExportAccountsModal`）· 出口代理（`ProxyPoolPanel`）·
 *    指纹体检（`FingerprintScanPanel`）· **账号行 🔍 指纹诊断 + ↻ 重新生成指纹** ·
 *    **🧹 清理缓存**（`HostPort.media.clearBrowserCache`）· **实时隔离体检**（`fp-health` 状态按钮）·
 *    面板底部三件（网格吸附 / 返回首页 / 清空画布）。
 * ⚠️ 仍未落地的（见 `docs/13`）：`取消所有选中` —— 它**依赖账号列表多选**（源 `ae = Ie.size`），
 *    那是另一个特性（ctrl/meta 点选 + 拖拽入组），本面板没有 ⇒ **不假装有**。
 */

import { useEffect, useMemo, useState } from 'react';
import { useAccountOps, usePorts, useStore } from '@/state';
import { ACCOUNT_STATUS, SITE_TYPES } from '@/stable/model/account';
import { GalleryPanel } from './GalleryPanel';
import { FingerprintScanPanel } from './FingerprintScanPanel';
import { ExportAccountsModal } from './ExportAccountsModal';
import { ProxyPoolPanel } from './ProxyPoolPanel';
import { GroupManagerModal } from './GroupManagerModal';
import {
  ACCOUNT_PANEL_TEXT,
  ACCOUNT_TRANSFER_TEXT,
  EXPORT_TEXT,
  FP_DIAG_TEXT,
  FP_SCAN_TEXT,
  GROUP_MANAGER_TEXT,
  PROXY_TEXT,
} from '@/constants/text';
// ⚠️ 纯规则由组件直接调（与 `FingerprintScanPanel` 同法）—— 摘要拼装 / 体检统计都是**纯函数**
import { diagnosisSegments } from '@/core/rules/fingerprintDiagnosis';
import { scanFingerprintCollisions } from '@/core/rules/fingerprintScan';
import { BackendView } from './BackendView';
import { NewImagesPanel } from './NewImagesPanel';
import styles from './AccountPanel.module.css';

/** 状态行停留（ms）—— 逐条对齐源：导入结果 5000（本工程既定）/ 清缓存结果 4000（原 207-209） */
const IMPORT_MSG_MS = 5000;
const CACHE_MSG_MS = 4000;

export function AccountPanel() {
  const accounts = useStore((s) => s.accounts);
  const activeAccountId = useStore((s) => s.activeAccountId);
  const setActiveAccountId = useStore((s) => s.setActiveAccountId);
  const pushToast = useStore((s) => s.pushToast);
  const accountOps = useAccountOps();
  const ports = usePorts();
  /** ★ 重新生成指纹（原 `OP.jsx:757-765` 的 ↻） */
  const regenerateFingerprint = useStore((s) => s.regenerateFingerprint);
  /**
   * ★ 🔍 指纹诊断按钮的**显示判据**（原 `_P`，`shared.js:34202-34210`）
   *
   * ⚠️ **源版只在 Windows 显示它**（`window.api.hostOS === 'windows'`，无则看 `navigator.platform`）
   *    —— 指纹伪装那条链是 Windows 向的，照抄此门（**不擅自放开**）。
   */
  const canDiagnose = ports.host.os === 'windows';
  // ★ 底部操作条（原 `OP.jsx:925-941`）：网格吸附 / 返回首页 / 清空画布
  const snap = useStore((s) => s.snap);
  const setSnap = useStore((s) => s.setSnap);
  const setStarted = useStore((s) => s.setStarted);
  const setActiveId = useStore((s) => s.setActiveId);
  const clearCanvas = useStore((s) => s.clearCanvas);

  const [picking, setPicking] = useState(false);
  const [probing, setProbing] = useState<string | null>(null);
  /** ★ 正在查看哪个账号的画廊（`null` = 不显示）—— 原 `_Component23` 是覆盖层模态 */
  const [galleryFor, setGalleryFor] = useState<string | null>(null);
  /** ★ 是否打开指纹体检面板（原 `OP.jsx` 里的 `DP`） */
  const [scanOpen, setScanOpen] = useState(false);
  /** ★ 导出弹窗（原 `PP.jsx`）是否打开 */
  const [exportOpen, setExportOpen] = useState(false);
  /** ★ 出口代理池面板（原 `LP.jsx`）是否打开 */
  const [proxyOpen, setProxyOpen] = useState(false);
  /** ★ 分组管理弹窗是否打开 */
  const [groupOpen, setGroupOpen] = useState(false);
  /**
   * ★ 行内状态行（原 `OP.jsx` 的 `_` / `setMsg`）—— 导入 / 清缓存**共用**
   * ⚠️ 带**各自的停留时长**：源版导入 5s、清缓存结果 4s（原 207-209）
   */
  const [status, setStatus] = useState<{ text: string; ms: number } | null>(null);
  /** ★ 清缓存进行中（原 `ce`）—— 用于按钮 `disabled` 与文案切换 */
  const [cacheBusy, setCacheBusy] = useState(false);

  /**
   * ★ **实时隔离体检**的状态（原 `OP.jsx:22-24` 的 `useMemo(() => zk(n), [n])`）
   *
   * ⚠️ 与源一致：报告**实时算、不进 store**（只有 `scanHistory` 是持久化的）。
   */
  const health = useMemo(() => scanFingerprintCollisions(accounts), [accounts]);

  /** 写一条状态行（原 `setMsg(...)` + 各处 `setTimeout(() => setMsg(''), ms)`） */
  const showStatus = (text: string, ms: number): void => setStatus({ text, ms });

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

  /**
   * ★ 指纹诊断（原 `OP.jsx:59-125` 的 `h(W)`）—— 结果拼成**一条 toast**
   *
   * ⚠️ 与源一致：**成功才出 toast**（`success` 若伪装生效，否则 `warn`）；探不到页面/网络
   *    不算失败，只体现在摘要的「伪装 / 出口」段（源版那两处就是 `catch {}` 置 null）。
   */
  const runDiagnose = async (id: string, name: string): Promise<void> => {
    const d = await accountOps.diagnoseAccount(id);
    const text = FP_DIAG_TEXT.prefix(name) + diagnosisSegments(d).join(FP_DIAG_TEXT.separator);
    // ⚠️ 源版成功那档是 `'success'`，而本工程的 toast 等级只有 info / warn / error
    //    ⇒ 落到最近的一档 `'info'`（与 `GalleryPanel` 的同一处理口径）
    pushToast(text, undefined, d.spoofed ? 'info' : 'warn');
  };

  const remove = async (id: string, name: string): Promise<void> => {
    // ⚠️ 源版 `OP.jsx:801` 自带确认；这里用最直接的 `confirm`（不引入新弹窗件）
    if (!window.confirm(ACCOUNT_PANEL_TEXT.confirmRemove(name))) return;
    if (activeAccountId === id) setActiveAccountId(null);
    await accountOps.removeAccount(id);
  };

  /** 已登录账号数（原 `OP.jsx:835-837` 的导出按钮禁用判据） */
  const loggedInCount = accounts.filter(
    (a) => (a.status || ACCOUNT_STATUS.loggedIn) === ACCOUNT_STATUS.loggedIn,
  ).length;

  /** 导入（原 `OP.jsx:585-699`）—— 结果写进**行内状态行**（原版同法，不是 toast） */
  const runImport = async (): Promise<void> => {
    showStatus(ACCOUNT_TRANSFER_TEXT.openingFile, IMPORT_MSG_MS);
    const r = await accountOps.importAccounts();
    if (r.kind === 'canceled') {
      setStatus(null);
      return;
    }
    if (r.kind === 'failed') {
      // 原则 6：后端原文（`文件格式错误` / `文件中无账号数据` 等）
      showStatus(r.message, IMPORT_MSG_MS);
      return;
    }
    if (r.kind === 'imported') {
      const parts = [ACCOUNT_TRANSFER_TEXT.imported(r.imported)];
      if (r.skipped > 0) parts.push(ACCOUNT_TRANSFER_TEXT.skippedExisting(r.skipped));
      if (r.restored > 0) parts.push(ACCOUNT_TRANSFER_TEXT.restoredCredentials(r.restored));
      showStatus(parts.join(ACCOUNT_TRANSFER_TEXT.summarySep), IMPORT_MSG_MS);
    }
  };

  /**
   * ★ **清理浏览器缓存**（原 `OP.jsx:181-213` 的 `he()`）
   *
   * ⚠️ 源版先探「`window.api.clearBrowserCache` 在不在」（原 184-190）再给一句
   *    「当前环境不支持清理缓存」—— 本工程该能力**是端口契约的一部分**
   *    （`HostPort.media.clearBrowserCache` 恒存在）⇒ 那条分支**不可达**，故**不落**
   *    （判据 B5：不留没有落点的文案）。宿主缺失时由端口的 `err` 走 `clearCacheFailed`。
   */
  const runClearCache = async (): Promise<void> => {
    if (cacheBusy) return;
    // ⚠️ 源版 `OP.jsx:191` 自带 confirm（与「移除账号」同法，不引入新弹窗件）
    if (!window.confirm(ACCOUNT_PANEL_TEXT.clearCacheConfirm)) return;
    setCacheBusy(true);
    try {
      const r = await ports.host.media.clearBrowserCache();
      if (r.ok) {
        showStatus(ACCOUNT_PANEL_TEXT.clearCacheDone(r.value.cleared, r.value.failed ?? 0), CACHE_MSG_MS);
      } else {
        // 原则 6：后端原文
        showStatus(ACCOUNT_PANEL_TEXT.clearCacheFailed(r.message), CACHE_MSG_MS);
      }
    } finally {
      setCacheBusy(false);
    }
  };

  // 状态行自动消失（时长逐条对齐源，见 `status.ms`）
  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), status.ms);
    return () => window.clearTimeout(t);
  }, [status]);

  return (
    <div className={styles.column}>
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
          {/* ★ 工具条（原 `OP.jsx:829-843` 的 `.account-tool-row`）：导入 / 导出 / 关联扫描 */}
          <div className={styles.toolRow}>
            <button
              type="button"
              className={styles.toolBtn}
              title={EXPORT_TEXT.importTitle}
              onClick={() => void runImport()}
            >
              {EXPORT_TEXT.importBtn}
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              title={EXPORT_TEXT.exportTitle}
              disabled={loggedInCount === 0}
              onClick={() => setExportOpen(true)}
            >
              {EXPORT_TEXT.exportBtn}
            </button>
            {/* 指纹体检（原「🔗 关联扫描」，打开 `DP`）—— 它也是 `scanHistory` 的**唯一写入方** */}
            <button
              type="button"
              className={styles.toolBtn}
              title={ACCOUNT_PANEL_TEXT.scanTitle}
              disabled={accounts.length < 2}
              onClick={() => setScanOpen(true)}
            >
              {ACCOUNT_PANEL_TEXT.scan}
            </button>
            {/* 出口代理池（原「🌐 出口代理」，打开 `LP`） */}
            <button
              type="button"
              className={styles.toolBtn}
              title={PROXY_TEXT.triggerTitle}
              onClick={() => setProxyOpen(true)}
            >
              {PROXY_TEXT.trigger}
            </button>
            {/* 清理浏览器缓存（原「🧹 清理缓存」，`OP.jsx:850-852`） */}
            <button
              type="button"
              className={styles.toolBtn}
              title={ACCOUNT_PANEL_TEXT.clearCacheTitle}
              disabled={cacheBusy}
              onClick={() => void runClearCache()}
            >
              {cacheBusy ? ACCOUNT_PANEL_TEXT.clearCacheBusy : ACCOUNT_PANEL_TEXT.clearCache}
            </button>
            {/* 分组管理（原 `OP.jsx` 的分组工具条 + `RP.jsx`） */}
            <button
              type="button"
              className={styles.toolBtn}
              title={GROUP_MANAGER_TEXT.triggerTitle}
              onClick={() => setGroupOpen(true)}
            >
              {GROUP_MANAGER_TEXT.trigger}
            </button>
          </div>
          {/* ★ 实时隔离体检（原 `OP.jsx:854-858`）—— 与工具条的「关联扫描」打开**同一个**面板，
              区别只是这个入口**自带状态摘要**（🔴 / 🟡 / ✅ 三态） */}
          {accounts.length >= 2 && (
            <button
              type="button"
              className={`${styles.fpHealth} ${
                health.critical > 0 ? styles.fpHealthCrit : health.warn > 0 ? styles.fpHealthWarn : styles.fpHealthOk
              }`}
              title={FP_SCAN_TEXT.healthTitle}
              onClick={() => setScanOpen(true)}
            >
              {health.critical > 0
                ? FP_SCAN_TEXT.healthCrit(health.critical)
                : health.warn > 0
                  ? FP_SCAN_TEXT.healthWarn(health.warn)
                  : FP_SCAN_TEXT.healthOk}
            </button>
          )}
          {status && <div className={styles.toolMsg}>{status.text}</div>}
        </>
      )}

      {/*
        ★ **「出新图」条**（原 `_Component26`）—— 源版位置在 `.doubao-view-webviews` **之上**
          （它靠"把图拖进后台页面"来交互 ⇒ 必须紧贴 webview 区）。
      */}
      <NewImagesPanel />

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
              {/* ★ 指纹诊断（原 `OP.jsx:751-756` 的 🔍）—— ⚠️ 只在 Windows 显示（源 `_P`） */}
              {canDiagnose && (
                <button
                  type="button"
                  className={styles.rowBtn}
                  title={FP_DIAG_TEXT.diagTitle}
                  onClick={() => void runDiagnose(a.id, a.name)}
                >
                  {FP_DIAG_TEXT.diagLabel}
                </button>
              )}
              {/* ★ 重新生成指纹（原 `OP.jsx:757-765` 的 ↻） */}
              <button
                type="button"
                className={styles.rowBtn}
                title={FP_DIAG_TEXT.regenTitle}
                onClick={() => {
                  // ⚠️ 源版 `OP.jsx:759` 自带 confirm（与「移除账号」同法，不引入新弹窗件）
                  if (window.confirm(FP_DIAG_TEXT.regenConfirm(a.name))) regenerateFingerprint(a.id);
                }}
              >
                {FP_DIAG_TEXT.regenLabel}
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
      {/* ★ 画廊面板（原 `_Component23`）—— 覆盖层，挂在列表之后即可
          ⚠️ `key={galleryFor}`：切账号时**强制重挂载** ⇒ 面板内的局部态（选择 / 预览 / 已显示张数）
          自然重置（源版是用 `useEffect` 重置的，那会撞上 `react-hooks/set-state-in-effect`） */}
      {galleryFor && <GalleryPanel key={galleryFor} accountId={galleryFor} onClose={() => setGalleryFor(null)} />}
      {/* ★ 指纹体检面板（覆盖层） */}
      {scanOpen && <FingerprintScanPanel onClose={() => setScanOpen(false)} />}
      {/* ★ 导出账号弹窗（原 `PP.jsx`） */}
      {exportOpen && <ExportAccountsModal onClose={() => setExportOpen(false)} />}
      {/* ★ 出口代理池面板（原 `LP.jsx`） */}
      {proxyOpen && <ProxyPoolPanel onClose={() => setProxyOpen(false)} />}
      {/* ★ 分组管理弹窗（原 `OP.jsx` 分组工具条 + `RP.jsx`） */}
      {groupOpen && <GroupManagerModal onClose={() => setGroupOpen(false)} />}

      {/* ★ 面板底部操作条（原 `OP.jsx:925-941` 的 `.panel-foot`） */}
      <div className={styles.foot}>
        <label className={styles.snapToggle} title={ACCOUNT_PANEL_TEXT.snapTitle}>
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
          {ACCOUNT_PANEL_TEXT.snapLabel}
        </label>
        <button
          type="button"
          className={styles.footBtn}
          onClick={() => {
            // 原 `showStartup`：回到启动页（`bootstrap/main.tsx` 的 `Root` 按 `started` 切换）
            setStarted(false);
            setActiveId(null);
          }}
        >
          {ACCOUNT_PANEL_TEXT.backHome}
        </button>
        <button
          type="button"
          className={styles.footDanger}
          onClick={() => {
            // ⚠️ 源版 `OP.jsx:936` 自带 confirm（与「移除账号」同法，不引入新弹窗件）
            if (window.confirm(ACCOUNT_PANEL_TEXT.clearCanvasConfirm)) clearCanvas();
          }}
        >
          {ACCOUNT_PANEL_TEXT.clearCanvas}
        </button>
      </div>
    </div>
  );
}
