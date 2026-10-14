/**
 * SitePort —— 站点适配（★ 最易变层；只有类型，零实现）
 *
 * 依据：docs/11 §4.2 + docs/过程.md-账号与站点集成.md
 * 铁律（来自 docs/过程.md 的硬约束，★ 必须体现在契约注释里）：
 *   - **选择器不外泄**：四级降级 / `data-input-engine-*` / `ability_type=17` 全在 adapter 内部
 *   - **不开自动轮询抓取**（#4）：`scan` 必须**显式调用**，不得自启定时器
 *   - **零注入**（#2）：不得用 JS 改 navigator/screen/webgl
 */

import type { Account, SiteType } from '@/stable/model/account';
import type { GenResult } from '@/stable/model/gen';
import type { Result } from '@/core/model/result';
// ★ **2026-10-11（TD-04-4）**：扫描枚举的**运行时真源**已搬到 `core/rules/scanChain.ts`
//   （端口只能有类型，原则 3）⇒ 本文件只 `import type` 转发给既有消费者。
import type { PageKind, ScanPhase, ScanScope } from '@/core/rules/scanChain';
// ★ 宿主面（`detectVideos` 的返回项 —— 形状真源在 `core/ports/host.port`）
import type { DetectedVideo } from '@/core/ports/host.port';
// ★ 发送入参 = **已组装形态**（品牌类型，只由 `toSitePayload` 产出）—— 见下方 `send` 的契约注释
import type { SiteSendPayload } from '@/core/rules/payload';

export type { ScanPhase, ScanScope };

/**
 * 扫描选项 —— **只留确实有落点的那几项**
 *
 * ⚠️ 源 `wp` 还有 `haveHashes` / `allowedScopes` / `skipNonCanvas`，本仓**不收**：
 *   · 「只留画布图」已是 `core/rules/scanClean.ts` 的**默认**（`SCAN_CLEAN_DEFAULT_SCOPE`），
 *     再开一个可覆盖的旋钮 = 同一件事两个入口；
 *   · 内容去重（`haveHashes`）由落库方 `addLovartImages` 按 `dataUrl` 承担（`h0` 的 `phash` 恒空
 *     ⇒ 源实际也只比精确哈希，两边等价）；
 *   · `skipNonCanvas`（拒非画布页）在源**手动**抓取那条路上就是 `false`（`_Component26.jsx:366`），
 *     而本仓值守只覆盖 Tapnow —— 源头 Tapnow 那条路用轻量探测（`Yl`/`dP`）判页、**不用**这个开关。
 *   ⇒ 三者在本仓**都没有调用方**（留着就是"看着支持、其实空转"）。
 */
export interface ScanOptions {
  /** 已在库 / 已取过的 url（原 `haveUrls` ＋ `seen`）—— 适配器在**取图之前**滤（原 `wp:32588`） */
  seenUrls?: readonly string[];
  /** 最小边长（px）—— 交页内脚本（原 `wp.minSide`） */
  minSide?: number;
  /**
   * 候选上限（原 `wP` 的 `v.slice(0, o)`）—— ⚠️ **只有 `scanCanvas` 用它**。
   *
   * ⚠️ 为什么不在 `scan` 上用：源里截断在 **`Yh` 清洗之后、取图之前**（`wp:32592`），
   *    而本仓的 `Yh`（`cleanScannedImages`）跑在**落盘之后**（用例侧）⇒ 在适配器里截断会
   *    截到"还没清洗过的候选"，与源不等价（见 `usecases/scanGallery` 的说明）。
   *    画布 API 那条链**没有 `Yh` 这一步**（源也不做）⇒ 截断可以、也应该在取图前做。
   */
  limit?: number;
  /** 阶段回调（只上报，不写 store —— 原则 2；形状对齐原 `onStatus({phase,message})`） */
  onPhase?: (event: ScanPhaseEvent) => void;
}

/**
 * 可选的「**探测当前画布**」能力（原 `dP` 33430-33460 的画布支 = `Yl` + `qc`）
 *
 * ★ **一次调用给出值守需要的两个事实**（源里是 `Yl` 与 `dP` 两次调用；本仓合成一次，
 *   少一趟跨进程 `executeJavaScript` —— 两档 idle 语义**都在**）：
 *   · `canvasId === ''` ⇒ 当前**不在画布页**（源 `Ee:538-543`：`idleRounds = Math.max(idleRounds, xl-1)`）
 *   · `canvasId !== ''` 且 `urls` 为空 ⇒ 画布上**还没有图**（源 `Ee:554`：`idleRounds += 1`）
 * ⚠️ **缺项 ⇒ 该站点没有这个概念**（如 lovart 的画布 id 只活在 URL 路径里）⇒ 值守**不做**这道门槛。
 * ⚠️ 空画布/不在画布页**都不是错误** ⇒ 返回 `ok`（不拿错误表达"期望内的状态"）。
 */
export type PeekCanvasFn = (account: Account) => Promise<Result<PeekCanvasResult>>;

/** `peekCanvas` 的结果 */
export interface PeekCanvasResult {
  /** 当前画布 id —— **空串 = 不在画布页**（与源 `Yl` 的空串语义一致） */
  canvasId: string;
  /**
   * 当前画布里的图片 url
   * ⚠️ **不与 `seenUrls` 比对**（源 `dP` 只看它决定"攒满 12 张就早退"；本仓只用它判"空不空"）
   */
  urls: string[];
}

/**
 * 可选的「**扫当前画布（站点接口）**」能力（原 `wP` 的画布半 · `qc`）
 *
 * ★ 与 `scan` 的区别：`scan` 读**页面 DOM**（`hp` 脚本），本能力读**站点接口**（画布节点 API）
 *   ⇒ 两件事，结果的**形状相同**（`ScanResult`，`via: 'api'`）。
 * ⚠️ **缺项 ⇒ 该站点没有这条链** ⇒ 用例**明确报错**（`SEND_TEXT.noCapability`），不回落 DOM 扫描
 *   （源也没有这条回落：`xp` 与 `wp` 是两条独立函数）。
 * ⚠️ `opts.seenUrls` 同样有效：**取图之前**先滤（与 `scan` 的语义一致）。
 */
export type ScanCanvasFn = (account: Account, opts: ScanOptions) => Promise<Result<ScanResult>>;

/**
 * 可选的「**画布导出**」能力（原 `t$` → `YT` → 页内 `Ay`）—— 抓取链在 **canvas 渲染**页面上的兜底
 *
 * ★ **它解决什么**：Lovart 画布页是 `canvas` 渲染的（DOM 里没有 `<img>`）⇒ 常规扫描**一张也扫不到**；
 *   这时把画布本身导成一张 PNG，当一张图入库（源 `wp:32610-32651`）。
 *
 * ⚠️ **门是站点自己的**（原 `:32611-32613`：`pageKind === CANVAS` ∧ `diag.canvasCount > 0` ∧
 *   至少一个画布 ≥200px）⇒ 由适配器判，**不写成通用规则**（页面类型判定是站点专属）。
 * ⚠️ `kind: 'not-applicable'` **不是失败**：它表示"这一页不该导"（门不过）—— 与 `err` 严格区分。
 */
export type CanvasExportFn = (
  account: Account,
  /** 第几个画布（按**面积降序**；源 `YT(account, 0)` 恒传 0） */
  index: number,
  /**
   * 门的输入 —— **必须是刚扫的那一页**（调用方从 `ScanResult` 取，不重新读 `location`：
   * 页面若已跳走，重读会把门判在**另一页**上）
   */
  ctx: { href?: string; diag?: ScanDiag },
) => Promise<Result<CanvasExportOutcome>>;

/** 画布导出的结果（原 `Ay` 的返回 ＋ 适配器侧的落盘） */
export type CanvasExportOutcome =
  /** 门不过 / 这一页不是画布页 ⇒ **不导**（不是失败） */
  | { kind: 'not-applicable' }
  /** 导出来了，且**已落盘**（`img://` 引用）—— 与其余扫描项同形，能直接进 `LovartImageInput` */
  | { kind: 'snapshot'; ref: string; natW: number; natH: number; sizeBytes: number };

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
  /** 走的哪条通道（`api` = 站点接口读画布节点，见 `ScanCanvasFn`） */
  via: 'frames' | 'webview' | 'api';
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

/**
 * **抓取诊断**（原 `hp` 的 `p` 对象，`shared.js:22663-23233`）
 *
 * ★ **它解决什么**：抓不到图时**说清为什么**（"页面上 0 个 img"与"32 个 img 但都量不到尺寸"
 *   是两件事），而不是笼统一句"没扫到图片"。由 `core/rules/scanDiag.formatScanDiag`（原 `GT`
 *   `:32453`）拼成一行摘要。
 *
 * ⚠️ **源里 19 个字段，本仓落 9 个** —— 其余在本仓**零消费者**（它们服务源的诊断弹窗与后端
 *   `lovartDiag`，本仓两者都没有）⇒ 按 M6「不为将来铺路」不落。逐条：
 *   · `samples` / `csp` / `title` / `readyState` / `visibility` / `href`：源的诊断弹窗 + `gl()` 上报用；
 *   · `svgImgCount` / `videoCount` / `perfTotal`：`GT` **不读**（`perfTotal` 只在源的诊断面板里露脸）；
 *   · `perfImg`：★ **2026-10-13 落** —— 随 `buildLibraryScanScript` 的 **perf 取图通道**（原 `:23057-23078`）；
 *   · `canvases`：随 BP-14（画布导出的门）落。
 * ⚠️ **源 `GT` 还读 `diag.frames`，那是个死分支**：`hp` **从不写** `p.frames`
 *   （只有 frames 通道的 diag 才带它，见 `:23725`）⇒ 本仓不设该字段。
 */
export interface ScanDiag {
  /** 读到的文档 / root 数（源 `p.docCount = k.length`，`:22958`） */
  docCount: number;
  /** 读到的 iframe 数（源 `p.iframeCount += P.length`，`:22927`） */
  iframeCount: number;
  /** 穿透的 shadowRoot 数（源 `p.shadowCount++`，`:22949`） */
  shadowCount: number;
  /** 页面上 `img` 总数（源 `p.imgTotal += j.length`，`:22969`） */
  imgTotal: number;
  /** 其中**量得到尺寸**的（源 `p.imgUsable++`：有自然尺寸或布局尺寸，`:22986`） */
  imgUsable: number;
  /**
   * 网络资源里**当成候选图收下**的（源 `p.perfImg++`，`:23073`）—— 摘要的「网络图 N」档
   *
   * ★ **2026-10-13 落**：此前本仓**没有 perf 取图通道** ⇒ 数了就是撒谎（"网络图 5" 而 5 张从未进候选）。
   */
  perfImg: number;
  /** 页面上的 `canvas` 数（源 `p.canvasCount += j.length`，`:23082`） */
  canvasCount: number;
  /** 候选 url 总数（源 `p.itemsRaw++`，`:22856` —— 进过滤器**之前**） */
  itemsRaw: number;
  /** 过滤后留下的（源 `p.itemsKept++`，`:22860`） */
  itemsKept: number;
  /**
   * 页面上的画布**逐个**（源 `p.canvases`，`:23083-23097` —— **最多 6 个**，按 DOM 顺序）
   *
   * ★ 用途：**画布导出的门**（原 `:32611-32613` —— 至少有一个 ≥200px 才值得导）。
   */
  canvases: readonly CanvasBox[];
}

/** 页面上一个画布的尺寸（原 `p.canvases` 的元素，`:23092-23096`） */
export interface CanvasBox {
  /** 画布**像素**尺寸（`canvas.width` / `canvas.height`） */
  w: number;
  h: number;
  /** **布局**尺寸（`getBoundingClientRect` 四舍五入） */
  dw: number;
  dh: number;
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
  /** ★ **抓取诊断**（原 `hp` 的 diag）—— 抓不到时用来说清原因，见 `ScanDiag` */
  diag?: ScanDiag;
  /**
   * ★ **逐张落盘失败**的张数（原 `wp.failed` 32493-32941）
   *
   * 页面扫到了图，但**没能落成本地引用**（下载失败 / 非图片 / 拿回来的不是内联图）——
   * 调用方要据此报「已抓取 N 张新图，M 张失败」（`_Component26.jsx:411`）。
   * ⚠️ 与 `skipped`（**扫描阶段**跳过：重复 / 过小 / 占位图）不是同一件事。
   */
  failed?: number;
}

/**
 * 发送入参 = `core/rules/payload` 的 **`SiteSendPayload`**（原 `$L` 40236-40317 的**已组装**形态）
 *
 * ⚠️ **它不在这里定义**（结构约束 M1，`docs/11` §六·六）：形状与**品牌**都住
 *   `core/rules/payload`，且**只由 `toSitePayload()` 产出** —— 端口只**引用类型**。
 *   ⇒ 「把跨进程报文直接传给 `send`」**编译不过**（此前此处另有一个同名 `SendPayload`，
 *     两者靠名字区分 ⇒ `as` 一糊就传错，正是 `payload.images.length` 抛异常的根因）。
 */

/** 发送结果 */
export interface SendResult {
  /** 幂等键（防重复点菜单） */
  sessionId: string;
  /**
   * 生成轮询终止原因
   *
   * ★ **2026-10-12 加 `'filled-only'`**：账号节点的「**仅填入**」（`autoSend === false`）
   *   —— 只把文本/图填进对话框，**不点发送**、也就**没有轮询**（原 `Be` 的 Phase 3）。
   * ⚠️ 该字段**目前没有消费者**（各实现写、无人读）—— 如实记在 `docs/过程.md（原 plan/02）` §4。
   */
  endReason: 'settled' | 'no-real-image' | 'timeout' | 'already-finished' | 'manual' | 'filled-only';
  results: GenResult[];
  /**
   * ★ **2026-10-12（账号节点「填入」）** —— 源 `Be` 的**回执字段**（`_Component43:1288-1302`）：
   *   账号节点据此拼那条摘要（原 `OL.jsx:340-359`，本仓纯层
   *   `core/rules/accountNode.accountSendFeedback`）。
   *
   * ⚠️ **全部可选**：图片/视频通道只关心 `results`，不填这些（它们没有"只填入"这个概念）。
   */
  /** 只填不点（原 `fillOnly`） */
  fillOnly?: boolean;
  /** 有没有**真的点到**发送按钮（原 `autoClicked`；`autoSend=false` 时恒 `false`） */
  autoClicked?: boolean;
  /** 实际贴上去的参考图数（原 `imagesAttached`） */
  imagesAttached?: number;
  /** 参考图总数（原 `imagesTotal`） */
  imagesTotal?: number;
  /** 文本有没有填进输入框（原 `textInserted`） */
  textInserted?: boolean;
  /** 参考图**去重后**张数（原 `imagesUnique` = `K.length`，`:1324`） */
  imagesUnique?: number;
  /** 去重掉的张数（原 `duplicatesRemoved` = `de`，`:1325`） */
  duplicatesRemoved?: number;
  /**
   * ★ **Phase 3a 校验结果**（原 `Be` 回执的 `precheck`，`:1209-1216` / `:1329`）
   *
   * ⚠️ 它是**唯一**能把「图数/图序没通过但没到硬闸」这件事告诉上层的东西 ——
   *    `autoSend=false`（只填入）时源**照走 `ok`** 但带 `pass:false`，
   *    由账号节点显示成 `err` + 警告（`OL.jsx:353-355`）。
   */
  precheck?: {
    pass: boolean;
    text: boolean;
    imagesExpected: number;
    imagesAttached: number;
    imagesOk: boolean;
    /** 源 `$`（`'ok' | 'mismatch' | 'unknown'`） */
    order: string;
  };
  /** ★ 校验明细（原 `precheckIssue`，`:1304` / `:1330`）—— 无问题 ⇒ `null` */
  precheckIssue?: string | null;
}

/** 站点可用性探测 */
export interface SiteProbe {
  usable: boolean;
  /** 登录态是否有效 */
  loggedIn: boolean;
  /** 探测到的页面类型（真源 = `core/rules/scanChain.ts` 的 `PageKind`） */
  pageKind?: PageKind;
}

/** 站点适配器（每个站点一个实现） */
/** 「生成确认」链的**回复计数**读数（原 `Hd`/`A0` 的返回；探针失败时**只带 `error`**） */
export interface ReplyCountReading {
  hit?: boolean;
  count?: number;
  /** **最后一条**命中的原文（原 `text`；`Hd` 里是 `sample`） */
  text?: string;
  bodyLen?: number;
  inputLen?: number;
  error?: string;
}

/** 输入框内容读数（原 `j0`：`{found, text}`；探针失败时只带 `error`） */
export interface ComposerTextReading {
  found?: boolean;
  text?: string;
  error?: string;
}

/** 点内联「确认生成」按钮的返回（原 `lD`：`{found, clicked, label, strategy}`） */
export interface ClickConfirmReading {
  found?: boolean;
  clicked?: boolean;
  label?: string;
  strategy?: string;
  error?: string;
}

/**
 * 「把一段文本填进输入框并点发送」的结果
 *
 * ⚠️ **只说卡在哪一步**（`stage`），**不自造文案**（原则 6）——
 *   用户可见文案由调用方（`state`）从 `constants/text.ts` 取。
 */
export type ComposerSendOutcome =
  | { ok: true }
  | { ok: false; stage: 'no-view' | 'clipboard' | 'paste' | 'mismatch' | 'click'; detail?: string };

export interface SitePort {
  readonly kind: SiteType;

  /**
   * ★ 可选的「**探测当前画布**」能力（原 `dP` = `Yl` + `qc`）—— 值守轮次的门槛。
   *    缺项 ⇒ 该站点没有这个概念 ⇒ 值守不做门槛（见 `PeekCanvasFn` 的说明）。
   */
  readonly peekCanvas?: PeekCanvasFn;

  /**
   * ★ 可选的「**扫当前画布（站点接口）**」能力（原 `wP` 的画布半 · `qc`）——
   *   画廊面板的「扫描 Tapnow 画布」用它（见 `ScanCanvasFn` 的说明）。
   */
  readonly scanCanvas?: ScanCanvasFn;

  /**
   * ★ 可选的「**画布导出**」能力（原 `t$` / `YT` / 页内 `Ay`）—— 抓取链在 canvas 页面上的**兜底**。
   *    缺项 ⇒ 该站点没有这条兜底（见 `CanvasExportFn` 的说明）。
   */
  readonly exportCanvas?: CanvasExportFn;

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
   * 可选的「**无水印视频拉取**」能力（原 `_Component43` 的 `xt` 里 `mD` 页内脚本）
   *
   * ★ 只有**豆包 / Dola** 有这条链（走 `/samantha/aispace/` 三步链拉无水印直链）。
   *   缺项时 `core/usecases/fetchWatermarkFree` **明确报错**，不回落。
   * ⚠️ **脚本封装在 adapter 内部**（`adapters/site/doubao/scripts.ts` 的 `WATERMARK_FREE_BY_VID`）
   *   —— 本方法只收「按哪个 vid 拉」，不收脚本（与 `askWithImage` 同法）。
   * @param ctx 账号 + `webContentsId`（来自 `BackendPagePort.prepareForSend`，**必须已就绪**）
   * @param vid 视频 id（`v0…`）
   */
  readonly fetchWatermarkFree?: (ctx: ImageQuestionContext, vid: string) => Promise<Result<WatermarkVideo>>;

  /**
   * 可选的「**发送后检测视频**」能力（原 `detect-videos` handler 的取数，`electron/main.js:2224`）
   *
   * ★ **只有豆包 / Dola** 有这条链（host `detectVideos` 打的是 `/samantha/aispace/` 的 API）。
   *   缺项时 `state/postSendDetect` **直接不跑**（不回落、不报假成功）。
   * ⚠️ **必须先站到 aispace 页**（源注释：homepage API 在 `/chat/` 页返回空数据）—— 本方法
   *   内部**只在必要时导航**（已在 aispace ⇒ 不导航）；**不还原**（整个检测会话只站一次，
   *   收尾由 `leaveDetectPage` 负责 —— 逐轮「站过去又站回来」会 4s 一次抖动）。
   * ⚠️ `ctx.webContentsId` 由 `BackendPagePort.webContentsIdOf` 给（**不占租约** —— 检测可能跑
   *   50 分钟，占租约会把账号锁死）。
   * @param seenKeys 已见键（传给后端当跳过集合）
   */
  readonly detectVideos?: (
    ctx: ImageQuestionContext,
    seenKeys: readonly string[],
  ) => Promise<Result<{ videos: DetectedVideo[] }>>;

  /** 检测结束 ⇒ 把页面**站回去**（原 `it` 的 `finally` 里 `es(de, La)`）。未站过去 ⇒ 无操作 */
  readonly leaveDetectPage?: (ctx: ImageQuestionContext) => void;

  /**
   * ★ **「自动确认生成」用的页内能力**（原 `kt` 的 `Hd`/`A0`/`lD`/`j0`/`Zl`，`_Component43.jsx:1738-2052`）
   *
   * ★ **只有豆包 / Dola** 有这条链 —— 后台会先回一句「确认后我再开始生成视频」，
   *   必须再点一次内联按钮（或回一句确认语）它才真正开工。
   *   缺项 ⇒ `state/autoConfirm` **直接不跑**（不回落、不报假成功）。
   * ⚠️ 每个方法都**要求调用方已持有该账号的后台页租约**，且那份租约必须是
   *   `prepareForSend` **不给 `targetUrl`** 取的（＝**续用当前会话页**，不能把会话刷掉）。
   */
  readonly genConfirm?: {
    /** 读「已提交 / 正在生成」回复**计数**（原 `Hd`，`shared.js:37494`） */
    probeSubmitted(ctx: ImageQuestionContext): Promise<Result<ReplyCountReading>>;
    /** 读「请先确认再生成视频」回复**计数**（原 `A0`，`shared.js:37519`） */
    probeConfirmRequest(ctx: ImageQuestionContext): Promise<Result<ReplyCountReading>>;
    /** 点**回复消息内联**的「确认生成」按钮（原 `lD`，`shared.js:37223`） */
    clickConfirm(ctx: ImageQuestionContext): Promise<Result<ClickConfirmReading>>;
    /** 读输入框**内容**（原 `j0`，`shared.js:37252`） */
    readComposer(ctx: ImageQuestionContext): Promise<Result<ComposerTextReading>>;
    /** 把 `text` 填进输入框并点发送（原 `copyTextToClipboard` + `Qe` + `Zl`） */
    sendComposer(ctx: ImageQuestionContext, text: string): Promise<ComposerSendOutcome>;
  };

  /**
   * 可选的「**按分享链接批量拉无水印**」能力（原 `resolveThreadAndFetch` 里 `gD` 页内脚本）
   *
   * ⚠️ `threadId` 由**调用方**从分享链接里剥出（`/thread/<id>`），本方法只收 id。
   * ⚠️ 脚本封装在 adapter 内部（`WATERMARK_FREE_BY_THREAD`）。
   */
  readonly fetchWatermarkFreeByThread?: (
    ctx: ImageQuestionContext,
    threadId: string,
  ) => Promise<Result<WatermarkThreadOutcome>>;

  // ─────────────────────────── 发送后监测的 4 个页内探测 ───────────────────────────
  //
  // 依据（**逐字回源**）：`_Component43.jsx:2638-2700` 的 `watchSendReply` 每 2s 一轮，
  // 依次跑这 4 个页内脚本（源 `dD`/`fD`/`pD`/`hD`，`shared.js:37544-37734`）。
  //
  // ★ **为什么拆成 4 个窄方法**（而不是一个"读快照"）：循环**自己控制**跑哪几个 ——
  //   源在「已解析到等待时长」后就不再跑它（`Re` 闩）、「已命中额度」后不再跑额度（`Me` 闩）
  //   ⇒ 探测的**时机**是调用方的判断，端口只提供"读一次"的能力（判据 B4：接口窄而深）。
  // ★ **缺项 ⇒ 调用方跳过该探测**（不回落、不报错）—— 与 `autoWatch` 同法。
  // ⚠️ 每个方法的**脚本**封装在 adapter 内部（`adapters/site/doubao/scripts.ts`），端口只收 `ctx`。

  /**
   * 读「已接单」回复的**命中次数**（原 `dD`，`shared.js:37544`）
   *
   * ⚠️ 返回**计数**而非布尔：源用「本轮次数 > 监听起点的基线」做**增量判定**
   *    （会话里往往残留着上一轮的回复，只判布尔会误判成"本轮新回复"）。
   */
  readonly probeGenAck?: (ctx: ImageQuestionContext) => Promise<Result<GenAckReading>>;

  /** 读「预计等待 N 分钟/秒」（原 `fD`，`shared.js:37577`）—— 没命中 ⇒ `{hit:false}` */
  readonly probeWaitTime?: (ctx: ImageQuestionContext) => Promise<Result<WaitTimeReading>>;

  /** 读额度用量预警（原 `hD`，`shared.js:37652`） */
  readonly probeQuotaUsage?: (ctx: ImageQuestionContext) => Promise<Result<QuotaUsageReading>>;

  /** 读回复通知命中计数（原 `pD`，`shared.js:37617`） */
  readonly probeReplyNotice?: (ctx: ImageQuestionContext) => Promise<Result<ReplyNoticeReading>>;

  /**
   * ★ **读「已提交 / 正在生成」回复**（原 `Hd`，`shared.js:37494-37518`）
   *
   * ⚠️ **与上面 4 个不是同一族**：那 4 个服务 `sendWatch`（发送后监测的**旁路读数**），
   *    本项服务 **`postSendDetect` 的计时器启动**（源 `ze(Y, Hd, 'detect-gen-submit')`，
   *    `_Component43.jsx:1565`）—— 命中 ⇒ 计时器**立刻**起，不命中 ⇒ 等满兜底档。
   * ⚠️ **缺项 ⇒ 调用方退回兜底档**（不回落、不报错）—— 与其余探测同法。
   */
  readonly probeGenSubmitted?: (ctx: ImageQuestionContext) => Promise<Result<GenSubmittedReading>>;

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
   * ⚠️ **`lovart` 故意不声明**：风控 —— `docs/过程.md` #11 · `electron/main.js:2749`「默认关闭
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
   * ⚠️ **必须显式调用**，不得自启定时器（docs/过程.md #4：每 3 秒执行页面脚本会被判机器人）
   * ⚠️ 降级链（frames → webview）在**实现内部**，不外泄
   */
  scan(account: Account, opts: ScanOptions): Promise<Result<ScanResult>>;

  /**
   * 发送到站点。
   * ⚠️ 选择器策略（四级降级）在**实现内部**
   * ⚠️ 失败必须返回 Result，**不得抛异常**（docs/过程.md #6）
   */
  send(account: Account, payload: SiteSendPayload): Promise<Result<SendResult>>;

  /** 探测账号在该站点的可用性 */
  probe(account: Account): Promise<Result<SiteProbe>>;
}

/** 页内问答的上下文（`webContentsId` 来自已就绪的后台页） */
export interface ImageQuestionContext {
  account: Account;
  webContentsId: number;
}

/** 单个视频的无水印直链（原 `mD` 页内脚本的返回形状） */
export interface WatermarkVideo {
  url: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  poster?: string | null;
  definition?: string | null;
  source?: string | null;
}

/** 按分享链接批量拉取的单个结果（原 `gD` 的 `videos[]` 项） */
export interface WatermarkVideoResult {
  vid: string;
  url: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  poster?: string | null;
  error?: string;
}

/** 按分享链接批量拉取的返回（原 `gD`） */
export interface WatermarkThreadOutcome {
  videos: WatermarkVideoResult[];
  total: number;
  success: number;
  note?: string;
}

/** 「已接单」回复读数（原 `dD` 的返回，`shared.js:37573`） */
export interface GenAckReading {
  /** 命中次数（增量判定用计数） */
  count: number;
  /** 第一条命中的原文片段（无 ⇒ `''`） */
  text: string;
}

/** 等待时长读数（原 `fD` 的返回，`shared.js:37612-37613`）—— **判别联合**，不用 `null` 冒充"没读到" */
export type WaitTimeReading =
  | { hit: true; minutes: number; seconds: number; text: string }
  | { hit: false };

/**
 * 「已提交」回复读数（原 `Hd` 的返回，`shared.js:37494-37518`）
 *
 * ★ **用途**：`postSendDetect` 每轮拿它判「这条消息已经提交给豆包了」——
 *   命中 ⇒ **立刻**启动节点计时器（`setNodeTimer(nodeId, now)`）；不命中 ⇒ 等满兜底档。
 * ⚠️ 源还返回 `count` / `bodyLen` / `inputLen` / `src` —— 消费端**只读 `hit` 与 `text`**
 *    （`text` 进日志）⇒ 按判据 B4（接口窄而深）只收这两个。
 */
export interface GenSubmittedReading {
  /** 是否命中「已提交 / 正在生成」完成态 */
  hit: boolean;
  /** 命中的那句原文（无 ⇒ `''`；仅用于日志） */
  text: string;
}

/** 额度用量读数（原 `hD` 的返回，`shared.js:37667`） */
export interface QuotaUsageReading {
  /** 命中次数（**增量判定**用；数值型信号记 `1`） */
  lowCount: number;
  /** 本次消耗（同一回复里多次出现取**最大**；无 ⇒ `null`） */
  consume: number | null;
  /** 剩余额度（取**最小**；无 ⇒ `null`） */
  remain: number | null;
  /** 命中来源：`'explicit'`（明确话术）/ `'consume'` / `'remain'` / `''`（未命中） */
  reason: string;
  /** 命中片段（无 ⇒ `''`） */
  sample: string;
}

/** 回复通知读数（原 `pD` 的返回，`shared.js:37648`） */
export interface ReplyNoticeReading {
  /** `rule.code → 命中次数`（同一规则内多 pattern 取**最大值**，不是求和） */
  counts: Record<string, number>;
  /** `rule.code → 原文片段` */
  samples: Record<string, string>;
}

/** 站点适配器注册表（由 bootstrap 组装） */
export type SiteRegistry = Readonly<Partial<Record<SiteType, SitePort>>>;
