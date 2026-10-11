/**
 * BackendPagePort —— 账号后台页（豆包 / Dola / Lovart 的后台 `<webview>`）
 *
 * ★ **它为什么必须是一个端口**（`docs/16` §3.1 的取舍 1）：
 *   后台页是渲染进程里的 **`<webview>` 标签** —— **标签**归 `ui`（`BackendView`，M13），
 *   而**命令**（找元素 / 跑脚本 / 刷新 / 静默 / 取 `webContentsId`）**必须经端口**，
 *   否则视图就直调宿主/直碰 DOM（破铁律②）。
 *
 * ⚠️ 原版这里没有端口 —— 它是 **`vr`(shared.js:26024) 的「后台页租约管理」**，靠
 *   `tT`/`nT` 去问 **`an.getWebview` / `an.isReady`**，而 `an` 由 `rT(e)`（`25954`）注册，
 *   注册者 = **`_Component43`（BackendView）** ⇒ 是个**组件间注册表**（`preload.js` 里
 *   根本没有 `reloadAccount`，已核实）。本端口即那条隐形桥的**显式契约**。
 *
 * ⚠️ 铁律（来自 `docs/10`，必须体现在契约里）：
 *   · **不开自动轮询**（#4）：`prepareForSend` / `probeFingerprint` 都**只在被调用时**跑，不自启定时器
 *   · **零注入**（#2）：本端口唯一的注入例外是 **`input-lock`**（那条链的既有例外，见 `docs/16` 链 17）
 *   · 失败一律返 `Result`，**不得抛异常**
 */

import type { Account } from '@/stable/model/account';
import type { Result } from '@/core/model/result';

/** 后台页就绪后的句柄 */
export interface BackendPageReady {
  /** 本次占用的租约 id（原 `vr` 的 `leaseId`）—— 由 `release` 消费 */
  leaseId: string;
  /**
   * 页内脚本的执行目标（原 `d.getWebContentsId()`）
   * ⚠️ `HostPort.media.scanFrames` 要的就是它（**不是 partition**）
   */
  webContentsId: number;
  /** 导航后的页面地址（原 `d.getURL()`） */
  href: string;
}

export interface BackendPagePrepareOptions {
  /**
   * 导航目标（站点会话页 —— 来自 `SitePort.chatUrl`）
   * ⚠️ 由**调用方**给：站点地址属 volatile，本端口不认识任何站点
   */
  targetUrl: string;
  /** 关联任务 id（原 `vr` 的 `jobId`，如 `analyze:<nodeId>`） */
  jobId?: string | null;
  /** 用途（原 `vr` 的 `purpose`，默认 `'task'`） */
  purpose?: string;
  /** 就绪超时（默认 SSOT 的 `BACKEND_LOAD_TIMEOUT_MS` = 30s） */
  timeoutMs?: number;
  /** 租约 TTL（默认 SSOT 的 `BACKEND_LEASE_TTL_MS` = 1h） */
  leaseTtlMs?: number;
}

/**
 * 页面**实际生效**指纹的探针结果（原 `AP` 脚本 shared.js:34211-34229 的返回值）
 *
 * ⚠️ 形状由**脚本**决定（契约在此）；字段**全部可选** —— 探针是 best-effort，
 *    页面可能只答一部分（源版也逐字段 `|| '?'` 兜底）。
 */
export interface FingerprintPageProbe {
  url?: string;
  ua?: string;
  platform?: string;
  languages?: string;
  uadPlatform?: string;
  screen?: string;
  tz?: string;
  cores?: number | string;
  gl?: string;
  /** 我们的 preload 是否已注入伪装（原 `window.__fpSpoofed`） */
  spoofed?: boolean;
}

export interface BackendPagePort {
  /**
   * ⚠️ **2026-10-11 已删 `isMounted(account)`** —— 它在本仓**没有真场景**，是个**假判据**：
   *   · 本仓 `ui/panels/BackendView` 由 `AccountPanel` **常驻**渲染（`AppShell` 的左 `<aside>` 无条件挂载），
   *     且它**为每个账号都渲染 `<webview>`** ⇒ `isMounted()` 对所有存在于 store 的账号**恒为 `true`**
   *     ⇒ 拿它做任何判断都等于写常量。
   *   · 它的**源消费者**（`an.isReady` ← `vr` 租约管理）在本仓已由 `prepareForSend` 内部覆盖 ⇒ 公开形态多余。
   *   ⚠️ 与 `StoragePort` 删 3 个幽灵方法（`TD-06-2`）同判据：**不留"声明了但用不上"的契约面**。
   */

  /**
   * 把后台页准备到**可发送**状态（原 `gS` 39125-39154 那一段，五处调用点共用）
   *
   * 顺序（**顺序即语义**）：
   *   ① 申请租约（并发任务不得共用同一页）
   *   ② 等就绪（轮询 + **失败时自动重载一次**）
   *   ③ 取 `webContentsId`（拿不到 ⇒ 失败）
   *   ④ 注入 **`input-lock`**（唯一允许的注入）并置为 `unlock`
   *   ⑤ 导航到 `targetUrl` 并等加载
   *   ⑥ 等 `input[type=file]` 挂上（原 `pS` 12s）
   *
   * ⚠️ 调用方**必须**在结束后 `release(leaseId)`（见 `core/usecases/sendToSite` 的 `finally`）。
   */
  prepareForSend(account: Account, opts: BackendPagePrepareOptions): Promise<Result<BackendPageReady>>;

  /** 释放租约（原 `rn` shared.js:26109）。重复释放**幂等**。 */
  release(leaseId: string, reason?: string): void;

  /**
   * 在后台页里跑一段脚本并取回结果（原 `On`）
   * ⚠️ 调用方须先 `prepareForSend`；本方法不自查就绪（省一次往返）
   */
  runScript<T = unknown>(account: Account, script: string): Promise<Result<T>>;

  /**
   * ★ 读取后台页**实际生效**的指纹（原 `OP.jsx:59-78` 的 `AP` 探针）
   *
   * ⚠️ **只读**（零注入）：脚本只读 `navigator` / `screen` / `window.__fpSpoofed`，
   *    不改环境（`__fpSpoofed` 是**我们自己的 preload** 置的标记，不是注入）
   * ⚠️ **best-effort**：找不到 webview / 超时（默认 `FP_DIAG_TIMEOUT_MS` = 2.5s）/
   *    脚本抛错 ⇒ 返 `Result` 失败。**调用方回落账号里存的指纹配置**（原版同，
   *    见 `OP.jsx:83-97`）—— 所以这不是"错误"，是"探不到"。
   * ⚠️ 不走租约（`prepareForSend`）：源版这条链就是**轻量直探**，不排队
   */
  probeFingerprint(account: Account, timeoutMs?: number): Promise<Result<FingerprintPageProbe>>;

  /** 强制刷新后台页（原 `an.reloadAccount`，`_Component43.jsx:428`） */
  reload(account: Account): Result<void>;

  /**
   * ⚠️ **2026-10-11 已删 `setMuted(account, muted)`** —— **源里没有这个能力**（造物）：
   *   · 本仓实现是 `view.setAudioMuted()`（**音频静音**）；而源全文 **`setAudioMuted` 0 命中**。
   *   · 源的「**静默 / 恢复**」是**账号级 `autoStart` 开关**（`_Component43.jsx:517-524` 的 `Ve(id)`
   *     = `Xy(id)` ＋ `updateAccount(id, {autoStart:true})`），其**机制**是 `:38-46` 那个过滤 ——
   *     `autoStart !== true` 的账号**根本不渲染 `<webview>`**（元素不在 ⇒ guest 进程不在 ⇒ 才叫"不占用内存 / CPU"）。
   *   ⇒ 正确落点是**既有字段 `Account.autoStart`**（本仓已有、且已被"自动值守"链消费），
   *     而不是一个凭空造的端口方法。
   *   ⚠️ 本仓对该能力有一处**刻意的架构偏离**：`BackendView` **常驻渲染全部账号**（注释原文：
   *     "隐藏态的也要在，否则后台任务会找不到 webview"）⇒ 源的"不渲染"式暂停在本仓**表达不了**。
   *     故「静默态」是**受该架构决策约束的未落项**（见 `docs/13` §2.3），不是"补个端口方法"能解决的。
   */
}
