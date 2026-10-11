/**
 * SitePort —— 站点适配（★ 最易变层；只有类型，零实现）
 *
 * 依据：docs/11 §4.2 + docs/06-账号与站点集成.md
 * 铁律（来自 docs/10 的硬约束，★ 必须体现在契约注释里）：
 *   - **选择器不外泄**：四级降级 / `data-input-engine-*` / `ability_type=17` 全在 adapter 内部
 *   - **不开自动轮询抓取**（#4）：`scan` 必须**显式调用**，不得自启定时器
 *   - **零注入**（#2）：不得用 JS 改 navigator/screen/webgl
 */

import type { Account, SiteType } from '@/stable/model/account';
import type { GenResult } from '@/stable/model/gen';
import type { Result } from '@/core/model/result';
// ★ **2026-10-11（TD-04-4）**：扫描枚举的**运行时真源**已搬到 `core/rules/scanChain.ts`
//   （端口只能有类型，原则 3）⇒ 本文件只 `import type` 转发给既有消费者。
import type { ScanPhase, ScanScope } from '@/core/rules/scanChain';

export type { ScanPhase, ScanScope };

/** 扫描选项 */
export interface ScanOptions {
  /** 已见过的 URL（去重） */
  seenUrls?: readonly string[];
  /** 已见过的内容哈希（去重） */
  seenHashes?: readonly string[];
  /** 允许的作用域（默认只取画布） */
  allowedScopes?: readonly ScanScope[];
  /** 跳过非画布页 */
  skipNonCanvas?: boolean;
  /** 最小边长（px） */
  minSide?: number;
  /** 阶段回调（只上报，不写 store —— 原则 2；形状对齐原 `onStatus({phase,message})`） */
  onPhase?: (event: ScanPhaseEvent) => void;
}

/** 抓取阶段机（原 `onStatus`）—— `ScanPhase` 的类型见文件头说明（已迁至 `core/rules/scanChain.ts`） */
export interface ScanPhaseEvent {
  phase: ScanPhase;
  message: string;
}

/** 单张抓取结果 */
export interface ScannedImage {
  url: string;
  /** `img://` 引用（已落盘） */
  ref: string;
  scope: ScanScope;
  natW?: number;
  natH?: number;
  /** 走的哪条通道 */
  via: 'frames' | 'webview';
}

/**
 * 扫描时**读不到**的 frame / root（★ 原则 6：必须上报，不得静默）
 *
 * 典型：跨域 iframe 访问必然抛 `SecurityError` —— 那是预期内边界，
 * 但调用方必须知道「页面还有 N 个 frame 没读到」，否则会把"没扫到"误当成"页面上没有"。
 */
export interface UnreadRoot {
  /** 读不到的原因类别（`cross-origin-frame` / `img-query` / …） */
  kind: string;
  /** frame 的 src（有则给） */
  src?: string;
  /** 原始错误信息（**原样**，不改写） */
  why: string;
}

/** 扫描结果 */
export interface ScanResult {
  items: ScannedImage[];
  /** 跳过数（重复 / 过小 / 占位图） */
  skipped: number;
  /** 页面 URL（用于判断页面类型） */
  href?: string;
  /** ★ 读不到的 frame/root —— **如实上报**，不静默（原则 6） */
  unread?: UnreadRoot[];
  /**
   * ★ **逐张落盘失败**的张数（原 `wp.failed` 32493-32941）
   *
   * 页面扫到了图，但**没能落成本地引用**（下载失败 / 非图片 / 拿回来的不是内联图）——
   * 调用方要据此报「已抓取 N 张新图，M 张失败」（`_Component26.jsx:411`）。
   * ⚠️ 与 `skipped`（**扫描阶段**跳过：重复 / 过小 / 占位图）不是同一件事。
   */
  failed?: number;
}

/** 发送载荷（原 `$L` 40236-40317） */
export interface SendPayload {
  /** 已组装的最终文本（换行合并后） */
  text: string;
  /** 参考图引用（`img://`） */
  images: readonly string[];
  /** 参数（模型 / 时长 / 比例…） */
  params: Record<string, unknown>;
  autoSend: boolean;
  /** 来源标记（原 40230+） */
  source: 'canvas-account-node' | 'canvas-text-node' | 'canvas-image-gen';
}

/** 发送结果 */
export interface SendResult {
  /** 幂等键（防重复点菜单） */
  sessionId: string;
  /** 生成轮询终止原因 */
  endReason: 'settled' | 'no-real-image' | 'timeout' | 'already-finished' | 'manual';
  results: GenResult[];
}

/** 站点可用性探测 */
export interface SiteProbe {
  usable: boolean;
  /** 登录态是否有效 */
  loggedIn: boolean;
  /** 探测到的页面类型 */
  pageKind?: 'canvas' | 'feed' | 'other';
}

/** 站点适配器（每个站点一个实现） */
export interface SitePort {
  readonly kind: SiteType;

  /**
   * 该站点的「会话页」地址 —— 后台页导航目标（原 `aS`/`iS` shared.js:38717-38718）
   *
   * ⚠️ 这是**站点细节** ⇒ 必须由 adapter 声明（不得写进 `core`）。
   * ⚠️ 可选：`tapnow` / `gpt` 这类「不靠后台页发消息」的站点没有会话页。
   *    缺项时 `sendToSite` **明确报错**，不回落。
   */
  readonly chatUrl?: string;

  /**
   * 可选的「**附原图 + 提问 + 等回复**」能力（原 `hS` 38893 + `mS` 38990）
   *
   * 只有**豆包 / Dola** 有这条链路（提示词分析 / 调整）。
   * 缺项时 `core/usecases/analyzePrompt` **明确报错**，不回落、不静默返回空。
   *
   * ⚠️ **只收「喂什么图 + 问什么」**，不收业务语义：
   *    分析指令 / 调整指令是**模型指令**（`constants/analyzePrompts.ts`），由 core 侧构造；
   *    本方法只管页面动作（附图 → 填字 → 点发送 → 读回复）。
   *
   * @param ctx 账号 + `webContentsId`（来自 `BackendPagePort.prepareForSend`，**必须已就绪**）
   * @param imageUrl 原素材图（`data:` 或 `img://`）
   * @param instruction 要发出去的指令文本
   * @returns 模型回复**原文**（解析成 `zh_prompt`/`en_prompt` 是 core 的纯函数活）
   */
  readonly askWithImage?: (
    ctx: ImageQuestionContext,
    imageUrl: string,
    instruction: string,
  ) => Promise<Result<{ text: string }>>;

  /**
   * 可选的「**追问排队进度**」能力（原 `_Component43.jsx:2200-2266` 的 `queue-ping-*` 那一跳）
   *
   * ★★ **它是 `store.queueProgress` 的唯一生产者**（`TD-16-103`）：发送成功后问页面一句
   *   「现在有视频在生成吗」，把助手回复**原文**交回调用方 —— 分类归
   *   `core/rules/replyKind.classifyReply`，落 store 归 `state/sendQueue` 的追问循环。
   *
   * ⚠️ **与 `askWithImage` 的关系**：同一套页内编排，差别只有两点 ——
   *   ① **不带图**；② 源的这一步**只读一次**（页面此刻已驻留答案，不必等稳定）。
   *   ⇒ 本仓**复用同一实现**（`adapters/site/doubao` 里就是 `askAndWaitReply`），不另写第二份页内编排。
   *
   * ⚠️ 缺项时调用方（`state/sendQueue`）**明确跳过并留痕**，不回落、不静默。
   *
   * @param ctx 账号 + `webContentsId`（后台页**必须已就绪**，同 `askWithImage`）
   * @param instruction 要问的那句话（SSOT 文案由 core 侧给：源 `aD` 写进去的就是哨兵句）
   * @returns 助手回复**原文**
   */
  readonly pingQueueProgress?: (
    ctx: ImageQuestionContext,
    instruction: string,
  ) => Promise<Result<{ text: string }>>;

  /**
   * ★ **无人值守轮询**能力（原 `_Component26` 的 `Ee` 428-592）—— **注册制：站点细节由 adapter 声明**
   *
   * ★★ **为什么它是「能力声明」而不是 `core`/`state`/`ui` 里的站点判断**：
   *    「这个站点能不能被自动反复扫、以什么节奏」是**站点细节**（与 `chatUrl?` / `askWithImage?` 同族）
   *    ⇒ 必须住 adapter。`core`/`state`/`ui` **一律不得**写「**站点能力**」判断
   *      （如 `type === 'lovart' ? 能自动扫 : 不能`）。
   * ★ **2026-10-11 精确化（`TD-02-15`）**：原文写「一律不得写 `type === 'lovart'` 之类的判断」——
   *    **措辞过宽**：实测全仓 16 处 `=== 'lovart'` 命中**全是 `account.type`（账号**类型**的领域逻辑**，
   *    如 `normalizeAccountType(a.type) === 'lovart'` 决定入池 / 命名 / 展示），**没有一处**是"站点能力判断"。
   *    ⇒ 红线**只针对站点能力**（本项 `autoWatch` 那类）；账号类型的领域判断**本来就在 `core/rules`** ✓。
   *    遵守红线的实例见 `state/accountOps.ts:436`（"只问注册表 `ports.sites[type].autoWatch`，**不写** `type === 'lovart'`"）。
   * ⚠️ **缺项 ⇒ 不支持**（调用方**跳过**该站点，不回落、不报错）。
   * ⚠️ **`lovart` 故意不声明**：风控 —— `docs/10` #11 · `electron/main.js:2749`「默认关闭
   *    **Lovart** 自动抓取，避免每 3 秒执行一次页面脚本被判定为机器人」。⚠️ 该约束**只点名 Lovart**
   *    （那段就叫「Lovart 容器隔离」）；其余站点照常声明（见 `tapnow/index.ts`）。
   * ⚠️ **与 `scan` 的关系**：`scan` = 「能不能抓」；本项 = 「能不能**自动反复**抓 + 什么节奏」。
   *    二者独立 —— 可以有 `scan` 而无本项（= 只能**手动**抓）。
   * ⚠️ **本项只是「能力 + 节奏」声明，不含任何定时器**：定时器在**编排层**（`state`），
   *    `scan` 仍是被**显式调用**（`docs/11` §六 约束 4：适配器不得自启定时器）。这条**与站点无关**。
   */
  readonly autoWatch?: {
    /** 基础间隔（ms）—— 原 `KR` = 6000 */
    intervalMs: number;
    /** 空转 / 超限后的**退避**间隔（ms）—— 原 `XR` = 15000 */
    idleBackoffMs: number;
  };

  /**
   * 抓取素材。
   * ⚠️ **必须显式调用**，不得自启定时器（docs/10 #4：每 3 秒执行页面脚本会被判机器人）
   * ⚠️ 降级链（frames → webview）在**实现内部**，不外泄
   */
  scan(account: Account, opts: ScanOptions): Promise<Result<ScanResult>>;

  /**
   * 发送到站点。
   * ⚠️ 选择器策略（四级降级）在**实现内部**
   * ⚠️ 失败必须返回 Result，**不得抛异常**（docs/10 #6）
   */
  send(account: Account, payload: SendPayload): Promise<Result<SendResult>>;

  /** 探测账号在该站点的可用性 */
  probe(account: Account): Promise<Result<SiteProbe>>;
}

/** 页内问答的上下文（`webContentsId` 来自已就绪的后台页） */
export interface ImageQuestionContext {
  account: Account;
  webContentsId: number;
}

/** 站点适配器注册表（由 bootstrap 组装） */
export type SiteRegistry = Readonly<Partial<Record<SiteType, SitePort>>>;
