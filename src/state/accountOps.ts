/**
 * 账号操作控制器（★ 接线层）—— 把「**需要宿主参与的**那几半」与 store 动作拼起来
 *
 * 依据（**逐行回源抄录**）：`removeAccount` shared.js:30218-30247
 *
 * ★ **为什么纯列表动作在 slice、而这几个在控制器**：
 *   · `global.removeAccount`（sync）= 源版 30229-30236 的**列表半**（filter + `vo()` 重编号）
 *   · 本文件 = 源版 30224-30228 的**会话清理半**（要 await 宿主）+ 30237-30246 的
 *     `lovartGalleries` 清理（★ **2026-10-11 接线（`TD-07-7`）**：调切片动作
 *     `purgeLovartGallery`（= 源 `delete c[id]`，其纯层 `removeLovartAccount` 早有单测）；
 *     此前那句「该字段尚未落地」是**陈旧否定**，已按 `TD-07-5` 更正）
 *   ⇒ **分开放**：删号列表是**同步、必定成功**的，绝不能被宿主失败卡住。
 *
 * ⚠️ **一处有意偏离（留痕）**：源版清会话是 `try { window.api.clearAccountSession(partition) } catch {}`
 *   —— **fire-and-forget + 全吞**（原则 6 违规）。本实现**等它**并把失败原样上报
 *   （`pushBackendError`），但**仍然继续删除**（与源一致：宿主失败不阻断用户意图）。
 */

import type { AppStore } from './store';
import type { Ports } from '@/core/ports';
import { err, ok, type Result } from '@/core/model/result';
import type { HostOS } from '@/constants';
import {
  applyProxyAssignments,
  prepareSession,
  releaseSession,
  type SessionReady,
} from '@/core/usecases/prepareSession';
import { assignProxyPool, normalizeProxyPool } from '@/core/rules/proxy';
import {
  buildFingerprintDiagnosis,
  probeFromFingerprint,
  type DiagnosisSource,
  type FingerprintDiagnosis,
  type FingerprintNetProbe,
} from '@/core/rules/fingerprintDiagnosis';
import type { FingerprintPageProbe } from '@/core/ports/backendPage.port';
import {
  exportAccounts as runExportAccounts,
  importAccounts as runImportAccounts,
} from '@/core/usecases/accountTransfer';
// ★ 抓图入库用例（原 `wp` / `xp` / `NR` 的编排半 —— 扫页面 → 画廊入参）
import { scanGallery as runScanGallery } from '@/core/usecases/scanGallery';
import type { ScanPhaseEvent } from '@/core/ports/site.port';
// ★ 自动值守的**纯决策**（原 `_Component26` 的 `Ee` 取值半）—— 定时与 IO 在本文件（编排层）
import {
  advanceAutoWatch,
  autoWatchBaseDelay,
  autoWatchJitter,
  initialAutoWatchProgress,
  shouldAutoWatchScan,
  type AutoWatchProgress,
} from '@/core/rules/autoWatch';
import type { Cancel } from '@/core/ports/clock.port';
import type { NewAccountInput } from '@/core/rules/accountRoster';
import { ACCOUNT_STATUS, type Account } from '@/stable/model/account';
import { BACKEND_VIEW_TEXT, SEND_TEXT } from '@/constants/text';

/**
 * 账号导入 / 导出结果（UI 据此出提示）
 *
 * ⚠️ 原则 6：`message` 是**后端原文**（如 `已取消` / `文件格式错误`）—— **不改写、不加前缀**。
 * ⚠️ `warnings`（cookie 读取/恢复失败）已**同时**上报到 `backendErrors`（不静默），此处再带出供 UI 计数。
 */
export type AccountTransferResult =
  | { kind: 'canceled' }
  | { kind: 'failed'; message: string }
  | { kind: 'exported'; count: number; warnings: string[] }
  | { kind: 'imported'; imported: number; skipped: number; restored: number; warnings: string[] };

export interface AccountOpsController {
  /**
   * 新增账号（原 `addAccount` 的整体效果）
   * @returns 新账号 id
   */
  addAccount(input: NewAccountInput): string;
  /** 移除账号（原 `removeAccount`）：先清会话（best-effort），再删列表 */
  removeAccount(accountId: string): Promise<void>;
  /**
   * ★ **检测登录态并写回 `status`**
   *
   * ⚠️ **源版没有这个动作** —— 源版的建号发生在登录成功之后（`$P.jsx`），
   *    所以从不需要"事后补判登录"。本工程改成「先建号 → 在 `BackendView` 的 `<webview>`
   *    里真人登录 → 探针判定」⇒ 需要这一步。
   *    判据用的是**既有端口** `SitePort.probe`（返回 `SiteProbe.loggedIn`），不是新造机制。
   *
   * @returns 是否已登录（同时已把 `status` 写成 `已登录` / `未登录`）
   */
  probeLogin(accountId: string): Promise<boolean>;
  /**
   * ★★ **对「还没入名册」的待建账号探一次登录**（原 `$P.jsx:199-249` 的 `pe` 轮询）
   *
   * 登录弹窗用它**轮询自动完成登录**：源版每 2s 读一次 webview 的 cookie；
   * 本仓受 `docs/10` #5（cookie 前端一律不碰）约束 ⇒ 走 `SitePort.probe`（同义、不同机制）。
   * @param account `buildPendingAccount` 产出的那个**未入册**账号（只用到 `id`/`type`/`partition`）
   * @returns 是否已登录（失败 ⇒ `false`，**不建号**）
   */
  probeLoginOf(account: Account): Promise<boolean>;
  /**
   * ★ **导出账号数据**（原 `PP.jsx:36-94`）
   * @param accountIds UI 已勾选的账号 id（空 ⇒ `failed`，转发源版 `请至少选择一个账号`）
   * @returns `exported`（含 cookie 失败 `warnings`）/ `failed`（后端原文，如 `已取消`）
   */
  exportAccounts(accountIds: readonly string[]): Promise<AccountTransferResult>;
  /**
   * ★ **导入账号数据**（原 `OP.jsx:585-699`）
   *
   * ★ 逐个入 store 用**既有** `addAccount`（`NewAccountInput` 收 `id`/`partition`/`fingerprint`
   *   ⇒ 保留导入字段 + 与源一致地 `vo()` 重编号）—— **不是**直接 `setAccounts` 追加。
   * ⚠️ 文件格式错误 / 无账号数据 ⇒ `failed`（转发源版文案）；用户取消 ⇒ `canceled`。
   */
  importAccounts(): Promise<AccountTransferResult>;
  /**
   * ★ **保存 Lovart 出口代理池**（原 `setProxyPool` 30320-30330 + `reassignLovartProxies` 30331+）
   *
   * 顺序（**逐行对源**）：归一 → 落 store → 纯层**轮询分配** → 账号写回 → **逐条落宿主**。
   * @param text 文本域原文（每行一个代理；空 ⇒ 全部直连）
   * @returns `count` = 归一后的代理数（0 ⇒ 直连）；`failures` = 落宿主失败清单（已上报，原则 6）
   */
  saveProxyPool(text: string): Promise<{ count: number; applied: number; failures: string[] }>;
  /**
   * ★ **指纹诊断**（原 `OP.jsx:59-125` 的 `h(W)`）
   *
   * 顺序（**逐行对源**）：
   *   ① 页面**实际生效**指纹（`BackendPagePort.probeFingerprint`，best-effort 2.5s 超时）
   *   ② 探不到 ⇒ **回落账号里存的指纹配置**（原 83-97，来源标 `configured`）
   *   ③ 真实出口网络（`AccountPort.fpNetDiag`）
   *   ④ 纯层拼摘要（`buildFingerprintDiagnosis`）
   *
   * ⚠️ **不弹错**：源版这两处失败都是 `catch {}` 后置 `null`（best-effort）——
   *    失败只体现在摘要的「伪装 / 出口」段，**不打断**诊断。
   * ⚠️ 调用方（UI）用 `diagnosisSegments()` + `FP_DIAG_TEXT.prefix` 拼 toast 文案
   *    （文案是 SSOT 的活，控制器只交**结构化结果**）。
   */
  diagnoseAccount(accountId: string): Promise<FingerprintDiagnosis>;

  /**
   * ★ **抓图入库**（原 `wp` / `xp` / `NR` 的**编排半**）—— 逐账号扫描 → 写 `lovartGalleries`
   *
   * ⚠️ 与源一致：**逐账号**进行，**单个账号失败不中断其余**（源 `oe` 的 `for` 里就是跳过）。
   *   但失败**原样上报**（`pushBackendError`）：源版只对 tapnow 那条出提示
   *   （`Tapnow「X」未打开画布页，已跳过`），其余站点**静默吞掉** —— 本工程统一不静默（原则 6）。
   * ⚠️ **去重**由 `addLovartImages` 兜底（按 `dataUrl` + `sourceUrl` 双去重），控制器不重复实现。
   * ⚠️ 文案（`已抓取 N 张新图` / `没有新的图` …）是 **UI 的活** —— 本方法只交**结构化计数**。
   */
  scanGallery(
    accountIds: readonly string[],
    opts?: { onPhase?: (event: ScanPhaseEvent) => void },
  ): Promise<ScanGallerySummary>;

  /**
   * ★ **自动值守开 / 关**（原 `_Component26` 的 `he` 开关 + `Ee` 循环）
   *
   * ★ **谁能值守、什么节奏**：由**适配器**声明（`SitePort.autoWatch`）—— 本控制器**不认站点名**。
   *    ⛔ `lovart` **不声明**该能力（风控，`docs/10` #11 / `electron/main.js:2749`）⇒ 它**不会**被值守；
   *    ✅ `tapnow` 等声明了的站点会被值守（源版 `Ee` 本就覆盖两者）。
   * ★ **参与条件**（与源一致，`Ee:434`）：账号的 `autoStart === true` **且** 其站点声明了 `autoWatch`。
   *
   * ⚠️ **幂等**：`setAutoWatch(true)` 会**先停再建**（账号增删 / `autoStart` 变化后由此重建）。
   * ⚠️ **刻意不落源版的一处**：源 `Ee` 在「正在手动抓取」（`Jy()`/`o0()`）时顺延；本工程手动抓取
   *    与值守共用 `scanGallery`，**不做互斥**（如实标注，见 `docs/16`）。
   */
  setAutoWatch(on: boolean): void;
  /**
   * ★ **准备 `<webview>` 的会话**（原 `_Component25.jsx:56-76` —— `usecases/prepareSession` 文件头
   *   点名的那个场景）；只走 `fingerprint` 模式。
   *
   * ⚠️ 入参是**窄接口**（三个字段，**不收整个 `Account`**）：调用方在 effect 里按字段做依赖，
   *    传整个对象会让 effect 因**对象标识变化**而重跑 ⇒ 重复打 IPC。
   * @returns 就绪后的 `preloadUrl`（`null` = 该模式没有 preload）；失败**原样转发**（原则 6）
   */
  prepareWebviewSession(input: WebviewSessionInput): Promise<Result<SessionReady>>;
  /**
   * 该账号 `<webview>` 的会话页地址（`SitePort.chatUrl`）
   * @returns 站点声明值，或 `about:blank`（**不编造 URL**，与源 `?? 'about:blank'` 一致）
   */
  chatUrlOf(type: Account['type']): string;
  /**
   * 指纹诊断按钮的显示判据（原 `_P`，`shared.js:34202-34210`：**源版只在 Windows 显示**）
   * ⚠️ 宿主读数由 `bootstrap` 注入（`AccountOpsDeps.os`），**不是** ui 去读 `ports.host.os`
   */
  readonly canDiagnoseFingerprint: boolean;
  /** 清理浏览器缓存（原 `OP.jsx:181-213` 的 `he()`）—— 单端口调用，**不建 usecase**（无编排） */
  clearBrowserCache(): Promise<Result<{ cleared: number; failed?: number }>>;
  /**
   * ★ **强制刷新该账号的后台页**（原 `_Component43.jsx:3235-3245` 头部「刷新」按钮里的
   *   `const ee = te(o); if (ee) ee.reload()`）
   *
   * ⚠️ `ui` 不得直调端口（铁律②）⇒ 经本控制器转发 `BackendPagePort.reload`。
   * ⚠️ **失败可见**（原则 6）：`Result` 原样返回，由调用方 toast —— **不静默**。
   * ⚠️ **与源的一处有意差异（留痕）**：源该按钮 `disabled={Ke.autoStart !== true}`；
   *    本仓的 `<webview>` **常驻渲染**、没有 `autoStart` 语义 ⇒ 改为「未选中账号就不渲染」
   *    （由 `BackendView` 守），避免伪造一个恒假的 `disabled` 判据。
   */
  reloadBackend(accountId: string): Result<void>;
}

/** `prepareWebviewSession` 的入参（**窄接口**：只要这三个字段） */
export interface WebviewSessionInput {
  accountId: string;
  /** 允许 `null`（真实样本里有未设分区的账号）—— **如实传**，后端自己回落 */
  partition: string | null;
  fingerprint?: unknown;
}

/** `createAccountOps` 的注入（宿主/环境读数 —— `state` 不直碰 `document`/`navigator`，见 TD-16-54） */
export interface AccountOpsDeps {
  /** 页面是否被隐藏（原 `Ee:478` 的 `document.hidden`）—— 由 `bootstrap` 注入，`state` 不直读 DOM */
  isHidden: () => boolean;
  /**
   * 宿主平台（原 `_P` 读的 `window.api.hostOS`）—— 同样由 `bootstrap` 注入。
   * ⚠️ 若不注入就得在 `state` 里读 `navigator.platform` ⇒ 违反「宿主读数走端口/组合根」。
   */
  os: HostOS;
}

/** `scanGallery` 的结果（**结构化计数** —— UI 据此出提示，控制器不拼文案） */
export interface ScanGallerySummary {
  /** 实际扫了几个账号（`accountIds` 里存在的那些） */
  scanned: number;
  /** 真正**新增**的画廊条数（`addLovartImages` 的返回；已存在的被去重掉） */
  added: number;
  /** 逐张**落盘失败**（原 `wp.failed`） */
  failed: number;
  /** 扫描阶段跳过（重复 / 过小 / 占位图） */
  skipped: number;
}

export function createAccountOps(
  store: AppStore,
  ports: Ports,
  deps: AccountOpsDeps,
): AccountOpsController {
  /**
   * 扫**一个**账号并落库（原 `wp` 的「单账号」那份）
   *
   * ★ 抽成局部函数供**两处**共用（判据 C1）：
   *   ① `scanGallery`（**手动**「立即抓取」，逐账号）② 值守循环（`setAutoWatch`）
   * ⚠️ 失败**原样上报**（原则 6：`pushBackendError`），返回 `null` 让调用方决定是否继续。
   */
  const scanOne = async (
    account: Account,
    onPhase?: (event: ScanPhaseEvent) => void,
  ): Promise<{ added: number; failed: number; skipped: number } | null> => {
    const r = await runScanGallery({ sites: ports.sites }, account, onPhase ? { onPhase } : {});
    if (!r.ok) {
      store.useStore.getState().pushBackendError('unknown', r.message);
      return null;
    }
    return {
      added: store.useStore.getState().addLovartImages(account.id, r.value.items),
      failed: r.value.failed,
      skipped: r.value.skipped,
    };
  };

  // ── 自动值守（原 `_Component26` 的 `Ee` 428-592）────────────────────────────
  /** 在跑的中途取消句柄（按账号 id）—— `setAutoWatch(false)` 即全清 */
  const watchTimers = new Map<string, Cancel>();
  /** 每账号进度（原 `je.idleRounds` / `je.autoCount`） */
  const watchProgress = new Map<string, AutoWatchProgress>();
  /** 值守是否开启（异步回调里据此自停 —— 关掉后到达的 tick 不再续排） */
  let watching = false;

  const stopWatch = (): void => {
    for (const cancel of watchTimers.values()) cancel();
    watchTimers.clear();
    watchProgress.clear();
  };

  const scheduleWatch = (accountId: string, delayMs: number): void => {
    // ⚠️ 走 **`ClockPort`**（原则 4 的延伸：时序可注入）—— **不直调 `setTimeout`**，
    //    也**不碰 `window`**（TD-16-54 的教训）。
    const cancel = ports.clock.setTimeout(() => {
      void tickWatch(accountId);
    }, delayMs);
    watchTimers.set(accountId, cancel);
  };

  /** 一个账号的一轮（原 `Ee` 471-592 的骨架） */
  const tickWatch = async (accountId: string): Promise<void> => {
    if (!watching) return;
    const account = store.useStore.getState().accounts.find((a) => a.id === accountId);
    // ★ 能力**问注册表**（`ports.sites[type].autoWatch`）—— **不判站点名**（注册制）
    const cadence = account ? ports.sites[account.type]?.autoWatch : undefined;
    if (!account || !cadence) {
      // 账号被删 / 换成了不支持的站点 ⇒ 这条链自行退出（下次 `setAutoWatch` 重建）
      watchTimers.delete(accountId);
      return;
    }
    const prev = watchProgress.get(accountId) ?? initialAutoWatchProgress();
    // ① 页面**隐藏** ⇒ 本轮不扫，按基础节奏顺延（原 `Ee:478` 的 `document.hidden`）
    if (deps.isHidden()) {
      scheduleWatch(accountId, autoWatchBaseDelay(prev, cadence));
      return;
    }
    // ② 已**喂饱**（`autoCount` 达上限）⇒ 不扫，按退避顺延（原 `Ee:486`）
    if (!shouldAutoWatchScan(prev)) {
      scheduleWatch(accountId, autoWatchBaseDelay(prev, cadence));
      return;
    }
    const r = await scanOne(account);
    if (!watching) return; // 这轮跑的过程中被关掉了 ⇒ 不再续排
    const next = advanceAutoWatch(prev, r?.added ?? 0);
    watchProgress.set(accountId, next);
    // ③ 基础 / 退避 + **按账号 id 错峰抖动**（原 `re(je, X(Ve) + je.jitter)`）
    scheduleWatch(accountId, autoWatchBaseDelay(next, cadence) + autoWatchJitter(accountId));
  };

  /**
   * 对一个账号跑一次**登录态探针**（原 `SitePort.probe`）
   *
   * ★ **判据 C1**：`probeLogin`（已入册的账号）与 `probeLoginOf`（**还没入册**的待建账号）
   *   共用这一处 —— 登录弹窗要在建号**之前**轮询"登录好了没"，用的必须是**同一条判据**。
   * ⚠️ 失败**原样上报**（原则 6），并返回 `Err` ⇒ 调用方**不改状态**（缺证据就别下结论）。
   */
  const probeAccountLogin = async (account: Account): Promise<Result<boolean>> => {
    // ⚠️ 站点适配器缺失 ⇒ **明确报错**，不把"没适配器"当成"未登录"
    const site = ports.sites[account.type];
    if (!site) {
      store.useStore.getState().pushBackendError('unknown', SEND_TEXT.noSiteAdapter(account.type));
      return err('unknown', SEND_TEXT.noSiteAdapter(account.type));
    }
    const r = await site.probe(account);
    if (!r.ok) {
      store.useStore.getState().pushBackendError('unknown', r.message);
      return err(r.reason, r.message);
    }
    return ok(r.value.loggedIn);
  };

  return {
    addAccount: (input) => store.useStore.getState().addAccount(input),

    /**
     * ★ **对「还没入名册」的待建账号探一次登录**（原 `$P.jsx:199-249` 的 `pe` 轮询）
     *
     * 源版每 2s 读一次 `<webview>` 的 **cookie** 判断登录（`session.cookies.get({})`）。
     * ⚠️ 那条路在本仓**走不通**：`docs/10` #5「**cookie 由后端管理，前端一律不碰**」是
     *   `AccountPort` 契约里写死的红线（端口里明确禁止新增读 cookie 的方法）
     *   ⇒ 本仓改用**同义的 `SitePort.probe`**（本项目为"判登录态"专门建的能力，
     *   `probeLogin` 走的就是它）—— 行为一致（页面就绪 ⇒ 判登录），机制不同（不碰 cookie）。
     * ⚠️ 探针失败 ⇒ `false`（**不建号**）：登录弹窗靠它决定"自动完成登录"，判错会建出一个
     *   实际没登录的账号 —— 宁可让用户点「完成登录」。
     */
    async probeLoginOf(account) {
      const r = await probeAccountLogin(account);
      return r.ok ? r.value : false;
    },

    async removeAccount(accountId) {
      const account = store.useStore.getState().accounts.find((a) => a.id === accountId);
      // ⚠️ 没有分区 ⇒ **不调宿主**（源版 `if (s && s.partition && …)`）——
      //    这与 `releaseSession` 内部的「空分区直接成功」是同一条约束
      if (account?.partition) {
        const r = await releaseSession({ account: ports.host.account }, account.partition);
        if (!r.ok) {
          // 原则 6：不静默。⚠️ 但**不 return** —— 删号必须成功（见文件头）
          store.useStore.getState().pushBackendError('unknown', r.message);
        }
      }
      // ★ **`TD-07-7` 接线**：清该账号的 Lovart 画廊池 —— 逐字对源 `shared.js:30237-30246`：
      //   `if (galleries && id in galleries) { 拷贝 ⇒ delete c[id] ⇒ set({lovartGalleries}) ⇒ 落盘 }`
      //   ⚠️ 与「清会话」不同：这一步**纯本地、必定成功** ⇒ 放在删列表**之前**，与源同序；
      //   ⚠️ 落盘不用手写 —— `lovartGalleries` 在 `persist` 的 5 步写回清单里（防抖自动落）。
      //   ⚠️ 幂等：键不存在时切片动作自身会跳过（与源的 `id in galleries` 判据一致）。
      store.useStore.getState().purgeLovartGallery(accountId);
      store.useStore.getState().removeAccount(accountId);
    },

    async probeLogin(accountId) {
      const s = store.useStore.getState();
      const account = s.accounts.find((a) => a.id === accountId);
      if (!account) return false;

      const r = await probeAccountLogin(account);
      if (!r.ok) return false;
      const loggedIn = r.value;
      const next = store.useStore.getState().accounts.map((a) =>
        a.id === accountId
          ? { ...a, status: loggedIn ? ACCOUNT_STATUS.loggedIn : ACCOUNT_STATUS.loggedOut }
          : a,
      );
      // ★ 只有 state 能写 store（原则 1）—— 且只能经**具名 action**
      //   （`AppStoreHook` 已从对外类型摘掉 `setState`，直写=编译错误）
      store.useStore.getState().setAccounts(next);
      // ⚠️ `accounts` 已在 `container.ts` 的自动落盘监听列表里 ⇒ 无需显式 persist
      return loggedIn;
    },

    async exportAccounts(accountIds) {
      const s = store.useStore.getState();
      const selected = s.accounts.filter((a) => accountIds.includes(a.id));
      const r = await runExportAccounts(
        { account: ports.host.account, clock: ports.clock },
        { accounts: selected },
      );
      if (!r.ok) return { kind: 'failed', message: r.message };
      // ★ 原则 6：cookie 失败**不静默**（源版 `PP.jsx:61` 是 `console.warn`）
      for (const w of r.value.warnings) s.pushBackendError('unknown', w);
      return { kind: 'exported', count: r.value.count, warnings: r.value.warnings };
    },

    async importAccounts() {
      const s = store.useStore.getState();
      const r = await runImportAccounts(
        { account: ports.host.account, clock: ports.clock },
        { existing: s.accounts },
      );
      if (!r.ok) return { kind: 'failed', message: r.message };
      if (r.value.kind === 'canceled') return { kind: 'canceled' };
      const { accounts, skipped, restored, warnings } = r.value;
      // ★ 只有 state 能写 store（原则 1）—— 逐个走既有 `addAccount`
      //   （`NewAccountInput` 收 id/partition/fingerprint ⇒ 保留导入字段 + `vo()` 重编号）
      for (const acc of accounts) store.useStore.getState().addAccount(acc);
      const s2 = store.useStore.getState();
      // ★ 原则 6：cookie 恢复失败**不静默**（源版 `OP.jsx:660` 是 `console.warn`）
      for (const w of warnings) s2.pushBackendError('unknown', w);
      return { kind: 'imported', imported: accounts.length, skipped, restored, warnings };
    },

    async saveProxyPool(text) {
      const pool = normalizeProxyPool(text);
      const s0 = store.useStore.getState();
      // ① 落 store（原则 1）；`proxyPool` 已在 `container.ts` 的自动落盘监听列表里
      s0.setProxyPool(pool);
      // ② 纯层轮询分配（原 `reassignLovartProxies` 30331-30346）
      const r = assignProxyPool(s0.accounts, pool);
      // ③ 账号写回（`proxy` 字段）—— 经具名 action（同上）
      store.useStore.getState().setAccounts(r.accounts);
      // ④ 逐条落宿主（原 30347-30351）—— 源版 `.catch(() => {})` **全吞** ⇒ 这里如实上报（原则 6）
      const out = await applyProxyAssignments({ account: ports.host.account }, r.assignments);
      for (const f of out.failures) store.useStore.getState().pushBackendError('unknown', f);
      return { count: pool.length, applied: out.applied, failures: out.failures };
    },

    async diagnoseAccount(accountId) {
      const account = store.useStore.getState().accounts.find((a) => a.id === accountId);
      // 找不到账号 ⇒ 什么都不知道（**不编造**，全段落 `?` / `页面未加载`）
      if (!account) return buildFingerprintDiagnosis(null, null, 'live');

      // ① 页面**实际生效**指纹（best-effort，2.5s 超时）
      let page: FingerprintPageProbe | null = null;
      let source: DiagnosisSource = 'live';
      const r = await ports.backendPage.probeFingerprint(account);
      if (r.ok) {
        page = r.value;
      } else if (account.fingerprint) {
        // ② 探不到 ⇒ 回落账号里**存的**指纹配置（原 `OP.jsx:83-97`，`rt = 'configured'`）
        page = probeFromFingerprint(account.fingerprint);
        source = 'configured';
      }
      // ⚠️ 与源一致：探针失败**不弹错**（它本就是 best-effort）—— 只体现在摘要的「伪装」段

      // ③ 真实出口网络（原 98-107）—— 无分区 / 失败 ⇒ `null`（源版 `catch` 后置 null）
      let net: FingerprintNetProbe | null = null;
      if (account.partition) {
        const nr = await ports.host.account.fpNetDiag(account.partition);
        if (nr.ok) net = nr.value as FingerprintNetProbe;
      }

      return buildFingerprintDiagnosis(page, net, source);
    },

    async scanGallery(accountIds, opts) {
      const targets = store.useStore.getState().accounts.filter((a) => accountIds.includes(a.id));
      let added = 0;
      let failed = 0;
      let skipped = 0;
      for (const account of targets) {
        // ⚠️ `onPhase` 只做转发（阶段机归 UI；本控制器不存它）
        // ⚠️ 原则 6：单账号失败**原样上报但不中断**其余（源 `oe` 的 `for` 就是跳过）
        const r = await scanOne(account, opts?.onPhase);
        if (!r) continue;
        added += r.added;
        failed += r.failed;
        skipped += r.skipped;
      }
      return { scanned: targets.length, added, failed, skipped };
    },

    setAutoWatch(on) {
      // ★ 幂等：**先停再建**（账号增删 / `autoStart` 变化后由调用方再调一次即可重建）
      stopWatch();
      watching = on;
      if (!on) return;
      for (const account of store.useStore.getState().accounts) {
        // ★ 参与条件（与源 `Ee:434` 一致）：账号开了「自启动」**且** 其站点适配器声明了值守能力。
        //   ⚠️ 这里**只问注册表**（`ports.sites[type].autoWatch`）—— **不写 `type === 'lovart'`**：
        //      「Lovart 不值守」是**站点细节**，住 `adapters/site/lovart`（它压根不声明该能力）。
        const cadence = ports.sites[account.type]?.autoWatch;
        if (account.autoStart !== true || !cadence) continue;
        watchProgress.set(account.id, initialAutoWatchProgress());
        // 首发也带抖动（原 `re(je, te(Ve) + je.jitter)`）—— 多账号不会被同拍叫醒
        scheduleWatch(account.id, cadence.intervalMs + autoWatchJitter(account.id));
      }
    },

    /**
     * ★ **准备 `<webview>` 的会话**（原 `_Component25.jsx:56-76`）
     *
     * ⚠️ 只走 `fingerprint` 模式：调用方（`BackendView`）**仍自行**守卫 `type !== 'other'`
     *    —— 本方法**不接管**那个判据（保持行为等价；`other` 类型本来就没有指纹）。
     * ⚠️ 失败**原样转发**（原则 6）—— 由调用方决定"要不要挂 preload"。
     */
    async prepareWebviewSession(input) {
      return prepareSession(
        { account: ports.host.account },
        {
          mode: 'fingerprint',
          accountId: input.accountId,
          partition: input.partition,
          ...(input.fingerprint === undefined ? {} : { fingerprint: input.fingerprint }),
        },
      );
    },

    /**
     * 该账号 `<webview>` 的会话页地址（`SitePort.chatUrl`）
     *
     * ⚠️ 站点细节**住适配器**（不在这里写死站点名）；未声明 ⇒ `about:blank`（与源一致，**不编造**）。
     */
    chatUrlOf(type) {
      return ports.sites[type]?.chatUrl ?? 'about:blank';
    },

    /** 指纹诊断按钮的显示判据（原 `_P`：**源版只在 Windows 显示**）—— 宿主流派由注入决定 */
    canDiagnoseFingerprint: deps.os === 'windows',

    /**
     * 清理浏览器缓存（原 `OP.jsx:181-213` 的 `he()`）
     *
     * ⚠️ **不建 usecase**：它是**单端口调用、无编排** —— 再包一层就是"纯中转层"
     *    （7 步法 Step 6 第 0 关：删/不建它，暴露面一项没变）。源版那条「当前环境不支持」
     *    分支**不可达**（端口契约恒存在），故不落（判据 B5）。
     */
    async clearBrowserCache() {
      return ports.host.media.clearBrowserCache();
    },

    /**
     * 刷新后台页（原 `ee.reload()`）—— 单端口调用、**无编排** ⇒ 同 `clearBrowserCache`，不建 usecase
     * ⚠️ 账号在"点击渲染"与"执行"之间被删 ⇒ **明确报错**，不把 `undefined` 漏给端口
     */
    reloadBackend(accountId) {
      const account = store.useStore.getState().accounts.find((a) => a.id === accountId);
      if (!account) return err('unknown', BACKEND_VIEW_TEXT.accountGone);
      return ports.backendPage.reload(account);
    },
  };
}
