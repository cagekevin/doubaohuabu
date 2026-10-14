/**
 * BackendPagePort —— 账号后台页（豆包 / Dola / Lovart 的后台 `<webview>`）
 *
 * ★ **它为什么必须是一个端口**（`docs/过程.md` §3.1 的取舍 1）：
 *   后台页是渲染进程里的 **`<webview>` 标签** —— **标签**归 `ui`（`BackendView`，M13），
 *   而**命令**（找元素 / 跑脚本 / 刷新 / 静默 / 取 `webContentsId`）**必须经端口**，
 *   否则视图就直调宿主/直碰 DOM（破铁律②）。
 *
 * ⚠️ 原版这里没有端口 —— 它是 **`vr`(shared.js:26024) 的「后台页租约管理」**，靠
 *   `tT`/`nT` 去问 **`an.getWebview` / `an.isReady`**，而 `an` 由 `rT(e)`（`25954`）注册，
 *   注册者 = **`_Component43`（BackendView）** ⇒ 是个**组件间注册表**（`preload.js` 里
 *   根本没有 `reloadAccount`，已核实）。本端口即那条隐形桥的**显式契约**。
 *
 * ⚠️ 铁律（来自 `docs/过程.md`，必须体现在契约里）：
 *   · **不开自动轮询**（#4）：`prepareForSend` / `probeFingerprint` 都**只在被调用时**跑，不自启定时器
 *   · **零注入**（#2）：本端口唯一的注入例外是 **`input-lock`**（那条链的既有例外，见 `docs/过程.md` 链 17）
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
   *
   * ⚠️ 由**调用方**给：站点地址属 volatile，本端口不认识任何站点
   * ★ **可省**：不给 ⇒ **只等就绪、不导航**（原 `vr` 本来就是"只管租约 + 等就绪"，
   *   导航是**调用方另做**的 —— 见 `gS` 里 `vr` 之后的 `uS(d, m)`，`shared.js:39150`）。
   *   需要它的场景 = **续用当前页**（如「自动确认生成」要在**原会话页**上继续盯 ——
   *   再导航一次会把会话刷掉）。
   */
  targetUrl?: string;
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
   * ⚠️ ~~**2026-10-11 已删 `isMounted(account)`**~~ ★ **2026-10-13 复查：删它是对的，但当时给的理由已过期**。
   *
   * 当时写的是"`BackendView` **为每个账号都渲染 `<webview>`** ⇒ `isMounted` 恒 `true`（假判据）"——
   *   现在 `BackendView` **只挂 `mounted`**（`autoStart ∪ 租约快照`）⇒ **挂载集合是真的**，
   *   那条理由不再成立。**但 `isMounted` 仍不该存在**：挂载集合只有一个消费者（`BackendView` 自己的渲染），
   *   页面层要它没有意义；"谁还活着"由 **`subscribeLeases`** 的信号表达（表不导出 ⇒ M6），
   *   经 `state/subscriptions.ts` 落到 store 后给 `ui` 读（原则 1/2）。
   */

  /**
   * 把后台页准备到**可发送**状态（原 `gS` 39125-39154 那一段，五处调用点共用）
   *
   * 顺序（**顺序即语义**）：
   *   ① 申请租约（并发任务不得共用同一页）
   *   ② 等就绪（轮询 + **失败时自动重载一次**）
   *   ③ 取 `webContentsId`（拿不到 ⇒ 失败）
   *   ④ 注入 **`input-lock`**（唯一允许的注入）并置为 `unlock`
   *   ⑤ 导航到 `targetUrl` 并等加载（**给了 `targetUrl` 才做** —— 见该字段注释）
   *   ⑥ 等 `input[type=file]` 挂上（原 `pS` 12s）
   *
   * ⚠️ 调用方**必须**在结束后 `release(leaseId)`（见 `core/usecases/sendToSite` 的 `finally`）。
   */
  prepareForSend(account: Account, opts: BackendPagePrepareOptions): Promise<Result<BackendPageReady>>;

  /** 释放租约（原 `rn` shared.js:26109）。重复释放**幂等**。 */
  release(leaseId: string, reason?: string): void;

  /**
   * ★ **该租约是否仍活着**（原 `zy` shared.js:25976：`Du.has(leaseId)`）
   *
   * 用途：**长任务循环的存活判据** —— 「自动确认生成」（原 `kt` 的 `T()`）要在租约被释放
   *   （或 TTL 到期）时**立刻停**，否则会一直对着一个已被别人接管的页面点击。
   * ⚠️ 租约 TTL 到期会由端口自己 `release`（原 `vr` 的 `ttlTimer`）⇒ 本方法届时返 `false`。
   */
  isAlive(leaseId: string): boolean;

  /**
   * ★ **订阅租约快照**（原 `sT`，`shared.js:25962`）
   *
   * ⚠️ **订阅即回调一次当前快照**（源那两句：`gp.add(e)` 后紧跟 `e(Ck())`）⇒ 调用方不必自己补初值。
   * ⚠️ 订阅**只许在 `state/subscriptions.ts` 建立**（判据 D2 / 原则 2）。
   * @returns 退订函数
   */
  subscribeLeases(cb: (accountIds: readonly string[]) => void): () => void;

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
   * ★ **取该账号 `<webview>` 的 `webContentsId`**（**不占租约、不导航**）
   *
   * 用途：**发送后检测**（原 `it` 的 `Y.getWebContentsId()`，`_Component43.jsx:1561`）要在发送
   *   **之后**继续盯同一个页面 —— 而那时发送链的租约**已经释放** ⇒ 不能走 `prepareForSend`。
   *   源里 `te(ee)` 拿的就是**组件自己的**那个 webview。
   * ⚠️ 元素不在 / 取不到 ⇒ 返 `Result` 失败（调用方据此报「后台视图未初始化」）。
   */
  webContentsIdOf(account: Account): Result<number>;

  /**
   * ★ **读该账号 `<webview>` 当前地址**（**不占租约、不导航**）—— 原 `te(ee)` 的兄弟读数
   *
   * 用途：「生成确认」的**基线重置判据**（原 `kt` 的 `ge()`，`_Component43.jsx:1785-1795`）：
   *   页面 SPA 切进 `/chat/<id>` ⇒ 会话换了，旧基线作废。
   * ⚠️ best-effort：元素不在 / 读不到 ⇒ 返 `Result` 失败（调用方按"没读到"处理）。
   */
  hrefOf(account: Account): Result<string>;

  /**
   * ★ **给该账号的后台页截一张快照**（原 `je`，`_Component43.jsx:461-500`）
   *
   * 用途：**静默遮罩的底图** —— 账号被静默（`autoStart:false`）后 webview 会卸载，
   *   先把当时的样子截下来，遮罩上垫一张图（不然只剩纯色底）。
   * ⚠️ **必须在静默之前调**（webview 还在的时候）—— 见 `accountOps.toggleAutoStart`。
   * ⚠️ 表（原 `Wc`）由本端口**内部持有、不导出**（M6）：只能经这三个方法读写。
   * @returns `true` = 已存下（可 `snapshotOf` 取）；`false` = 截不到（无 `capturePage` /
   *   超时 / 空图 / dataURL 太短）—— **不是错误**（源也一律返 `false`，遮罩退化成纯色底）
   */
  captureSnapshot(account: Account): Promise<Result<boolean>>;

  /** ★ 读快照（原 `UT`，`shared.js:32400`）—— `null` = 没有 */
  snapshotOf(accountId: string): string | null;

  /** ★ 删快照（原 `Xy`，`shared.js:32410`）—— 幂等 */
  dropSnapshot(accountId: string): void;

  /**
   * ★ **导航某账号的 `<webview>` 到指定地址**（**不占租约、不做发送准备**）
   *
   * 用途：「拉取结果」的 **`conversationId` 支**（原 `es(Ae, 'https://www.doubao.com/chat/<id>')`，
   *   `_Component43.jsx:3204`）—— 先回会话页，再把任务交给**发送后检测**（`it`）。
   * ⚠️ 地址由**调用方**给（站点细节 —— `state` 不写站点 URL 字面量）。
   * ⚠️ 拿不到 webview / 导航超时 ⇒ 返 `Result` 失败（源把导航包在 `try{}catch{}` 里 best-effort
   *   —— 失败**不中止**后续检测；调用方自行决定）。
   */
  navigate(account: Account, url: string): Promise<Result<void>>;

  /**
   * ⚠️ **2026-10-11 已删 `setMuted(account, muted)`** —— **源里没有这个能力**（造物）：
   *   · 本仓实现是 `view.setAudioMuted()`（**音频静音**）；而源全文 **`setAudioMuted` 0 命中**。
   *   · 源的「**静默 / 恢复**」是**账号级 `autoStart` 开关**（`_Component43.jsx:517-524` 的 `Ve(id)`
   *     = `Xy(id)` ＋ `updateAccount(id, {autoStart:true})`），其**机制**是 `:38-46` 那个过滤 ——
   *     `autoStart !== true` 的账号**根本不渲染 `<webview>`**（元素不在 ⇒ guest 进程不在 ⇒ 才叫"不占用内存 / CPU"）。
   *   ⇒ 正确落点是**既有字段 `Account.autoStart`**（本仓已有、且已被"自动值守"链消费），
   *     而不是一个凭空造的端口方法。本仓同款：挂载集合 = 已登录 ∩ (`autoStart` ∪ 被租用)，
   *     见 `BackendView` 的 `mounted`。
   *     故「静默态」是**受该架构决策约束的未落项**（见 `docs/过程.md` §2.3），不是"补个端口方法"能解决的。
   */
}
