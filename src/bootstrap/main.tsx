/**
 * 入口（docs/11 §二 bootstrap）
 *
 * ⚠️ 机器强制（docs/11 §9.1）：**必须**用 `<StrictMode>` 包裹
 *    —— 官方原话 "We strongly recommend using Strict Mode alongside React's ESLint plugin"
 *    —— 它会**双调用**渲染与 Effect，暴露副作用 bug（本项目大量轮询/订阅/持久化）
 */

import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// 样式加载顺序（docs/11 §2.1）：官方 → SSOT → 主题
import '@xyflow/react/dist/style.css';
import '@/styles/tokens.css';
import '@/styles/reset.css';
import '@/styles/theme.css';

import { createContainer } from './container';
import { StoreProvider, useLicenseOps, useStore } from '@/state';
import { AppShell } from '@/ui/shell/AppShell';
import { ErrorBoundary } from '@/ui/shell/ErrorBoundary';
import { SaveErrorBanner } from '@/ui/common/SaveErrorBanner';
import { StartPage } from '@/ui/pages/StartPage';
import { CanvasHost } from '@/ui/canvas/CanvasHost';
import { ActivatePage } from '@/ui/pages/ActivatePage';
import { isLicenseUsable } from '@/core/rules/license';
import type { LicenseStatus } from '@/core/model/license';
import { log } from '@/lib/log';
import { SHELL_TEXT } from '@/constants/text';

/** 根组件：按 `started` 切换启动页 / 画布外壳 */
/**
 * 根组件：**授权门** → 启动页 → 画布外壳
 *
 * ★★ **2026-10-11 补上授权门** —— 它此前**完全不存在**：`LicensePort` 与纯层早就落地，
 *   但没有任何页面把它接起来 ⇒ 授权状态对用户不可见、也没法激活（`docs/过程.md` 的 M13 首项）。
 *
 * ★ **门的判据不是这里定的**：`core/rules/license.ts` 的 `isLicenseUsable` 写明了
 *   **只有 `ok` 放行**（`none`/`invalid`/`expired`/`tampered` 一律落到激活页），
 *   并说明了那是**有意为之**的 fail-close（「拿不到授权时宁可不进画布」）⇒ 此处只**执行**它。
 *
 * ⚠️ **这是一处用户可见的行为变化**：从今往后**开发/自用也需要一个有效授权**才能进画布。
 *   若只想在正式版启用，把本段改成读一个开关即可（判据与页面都已就位，不必改别处）。
 * ⚠️ **读失败（端口报错）也停在激活页** —— 与源一致（源 `W3` 的 catch 只显示
 *   「获取授权信息失败：…」而**不放行**），且不静默（错误文案会显示在页内）。
 */
function Root() {
  const started = useStore((s) => s.started);
  // ⚠️ 走控制器，**不是** `usePorts()` —— ui/bootstrap 不得直调 `host.license.*`（铁律 2 / TD-16-8）
  const licenseOps = useLicenseOps();
  /** `undefined` = **还在查**（不渲染任何一边 —— 避免"先闪主界面再跳激活页"） */
  const [license, setLicense] = useState<LicenseStatus | null | undefined>(undefined);
  /**
   * 读失败的**原文**（原则 6：**错误不可被吞** —— 端口异常必须显示出来，
   *   而不是静默当成"没有授权"；`原则6/no-swallow` 正是这么拦下我第一版的）
   */
  const [licenseError, setLicenseError] = useState('');

  const refreshLicense = useCallback(async () => {
    try {
      // 业务状态在 `gate.info.status`（`used`/`tampered`/`invalid` 也是**成功的 IPC**）
      const r = await licenseOps.checkStatus();
      setLicense(r.ok ? r.value.info : null);
      // ⚠️ `r.ok === false` 也是失败（适配器把后端错误折进 `Result`）⇒ 原样带出来
      setLicenseError(r.ok ? '' : r.message);
    } catch (e) {
      // ⚠️ 端口抛异常 ⇒ 当成"读不到"（`null`）⇒ 停在激活页（fail-close，见上），
      //    **但不吞原因**（原则 6）
      setLicense(null);
      setLicenseError(e instanceof Error ? e.message : String(e));
    }
  }, [licenseOps]);

  /**
   * ⚠️ 这里**不** `void refreshLicense()`（那样是"在 effect 体里直接调带 setState 的函数"，
   *   `react-hooks/set-state-in-effect` 会拦 —— 本项目已因此改过三处）。
   *   改成在 **`.then` 回调**里 setState（规则正是要这个形态），并带一个取消位。
   */
  useEffect(() => {
    let alive = true;
    licenseOps
      .checkStatus()
      .then((r) => {
        if (alive) setLicense(r.ok ? r.value.info : null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLicense(null);
        setLicenseError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [licenseOps]);

  // ① 还在查 ⇒ 什么都不渲染（这一闪通常只有几毫秒）
  if (license === undefined) return null;

  // ② **授权门**（判据在 core/rules/license.ts）
  if (!license || !isLicenseUsable(license.status)) {
    return (
      <ActivatePage
        initialStatus={license}
        initialError={licenseError}
        onActivated={() => void refreshLicense()}
      />
    );
  }

  // ③ 过了门 ⇒ 启动页 / 画布外壳
  // ⚠️ **保存失败横幅（原 `Z0`）在这两个分支都挂** —— 源版即如此（它是 `.app` / 启动页
  //    的**同级浮层**，不属于任何一页）；它是全局的，故挂在这里而非某一页内部。
  if (!started) {
    return (
      <>
        <SaveErrorBanner />
        <StartPage />
      </>
    );
  }
  return (
    <>
      <SaveErrorBanner />
      <AppShell canvas={<CanvasHost />} />
    </>
  );
}

const container = createContainer();

// 启动加载 + 5 条迁移（M1）；迁移日志原样打印，不吞（原则 6）
const hydrated = container.hydrate();
if (hydrated.notes.length > 0) log.info('[hydrate]', hydrated.notes.join('\n'));

// ★ 视频本地化回填（源 `_Component48.jsx:92-99`）：启动后 5s 把已存的 `genvideo`/`video`
//   节点里的 `http(s)` 直链落盘成 `vid://`（链 18「视频必须落盘」）。
//   ⚠️ 定时器在控制器内部走**注入时钟**（原则 4）；这里只负责"启动时调一次"。
container.startVideoBackfill();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root 不存在');

createRoot(rootEl).render(
  <StrictMode>
    {/* 全局错误边界（docs/11 §9.9 的第一级） */}
    <ErrorBoundary area={SHELL_TEXT.areaApp}>
      <StoreProvider store={container.store} gen={container.gen} analyze={container.analyze} accountOps={container.accountOps} batchSend={container.batchSend} sendQueue={container.sendQueue} capture={container.capture} licenseOps={container.licenseOps} hostOps={container.hostOps} projectOps={container.projectOps} apiOps={container.apiOps} pullResult={container.pullResult}>
        <Root />
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);
