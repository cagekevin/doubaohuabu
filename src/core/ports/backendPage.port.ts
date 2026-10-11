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
 *   · **不开自动轮询**（#4）：`isMounted` / `prepareForSend` 都**只在被调用时**跑，不自启定时器
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

export interface BackendPagePort {
  /**
   * 后台视图**当前是否已挂载**（原 `tT(accountId) !== null`）
   *
   * ⚠️ **同步 + 纯查询**：只在被调用时看一眼 DOM，**不自启轮询**（`docs/10` #4）
   * ⚠️ 用途：UI 决定「要不要提示用户先打开后台视图」，而不是拿它当就绪判据
   */
  isMounted(account: Account): boolean;

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

  /** 强制刷新后台页（原 `an.reloadAccount`，`_Component43.jsx:428`） */
  reload(account: Account): Result<void>;

  /** 静默 / 恢复（原 §3.1「创建 / 静默 / 恢复 / 刷新」命令集） */
  setMuted(account: Account, muted: boolean): Result<void>;
}
