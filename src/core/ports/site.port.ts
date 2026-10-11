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

/** 抓取阶段机（原 `onStatus`） */
export const SCAN_PHASES = ['scanning', 'found', 'working', 'done'] as const;
export type ScanPhase = (typeof SCAN_PHASES)[number];
export interface ScanPhaseEvent {
  phase: ScanPhase;
  message: string;
}

/** 外部页面区域作用域（原 `hp` 22664-22669）—— ⚠️ 这是**外部页面**的区域，不是应用画布 */
export const SCAN_SCOPES = ['canvas', 'panel', 'feed', 'site'] as const;
export type ScanScope = (typeof SCAN_SCOPES)[number];

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
