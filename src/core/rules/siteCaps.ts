/**
 * 站点能力表 —— ★ **唯一真源**：所有「某个站点有没有 X」的答案都在这一张表里
 *
 * ── 为什么是**一张穷尽表**（2026-10-14 收口）──────────────────────────────
 * 此前"站点子集"散在**四个中心**：`accountPick.NEW_IMAGES_SITES` · `lovartGallery.GALLERY_SITES`
 * · `lovartSession.CHROME_SESSION_SITES` · 以及 `ui`／`state` 里十几处**内联**判断
 * （`type === 'other'` / `type !== 'tapnow'` / `type === 'dola' || 'doubao'` …）。
 * 每加一个站点要**记得改 N 处**，漏一处就是静默行为差。
 * ⇒ 收成**一张表**：站点名只在这里出现一次；其余模块**只问表**，或从表**派生**自己的领域视图。
 *
 * ★ **穷尽由类型保证**：`Record<SiteType, SiteCaps>` ⇒ **漏一个站点编译不过**（不是靠注释提醒）。
 * ★ **加站点的动作**：只改本文件（＋ 各自的 adapter）；`ui` / `state` **一行都不用动**。
 *
 * ⚠️ **它与 `SitePort` 的能力位不是一回事**（别合并）：端口能力位（`chatUrl?` / `autoWatch?` /
 *    `mediaSource?` / `detectVideos?` …）声明的是「**适配器实现了哪条链**」，住 adapter；
 *    本表回答的是「**界面/流程上要不要给这个站点那个东西**」，是**展示与流程策略**。
 *    `ui` 结构上拿不到 `Ports`（见 DATAFLOW §十八）⇒ 这类判断只能在 `core/rules` 有落点。
 *
 * ⚠️ **字段按"问题"分，不按"取值凑巧相同"合并**：如「画廊」与「会话条」当前恰好是同一批站点，
 *    但它们是两个问题（可以各自独立演进）⇒ **两个字段**。合并它们就是"靠值相等造耦合"。
 */

import { normalizeAccountType, SITE_TYPES, type SiteType } from '@/stable/model/account';

export interface SiteCaps {
  /**
   * 有没有**站点声明的固定地址**（登录页；会话页另见 `SitePort.chatUrl`）。
   * 为假 ⇒ 用账号自带的 `url`（用户手输）—— 源 `$P.jsx:17` 的 `c ? u.trim() : …` 那一支。
   */
  hasFixedUrl: boolean;
  /**
   * 这个账号**有没有指纹**（建号记录带 `fingerprint`，会话准备走 `ensureFingerprint`）
   *
   * 依据（回源 `$P.jsx:104-153`）：只有 `dola` / `doubao` / `tapnow` / `gpt` 的建号载荷带
   *   `fingerprint`（`:142-153`）；`lovart`（`:128-138`）与 `other`（`:115-122`）都不带。
   */
  needsFingerprintSession: boolean;
  /**
   * 这个站点的后台页走 **Lovart 专用容器**（`ensureLovartContainer`：自己的 UA + preload +
   *   `webpreferences`），而不是指纹会话
   *
   * 依据（回源）：`$P.jsx:56-75`（建号弹窗）+ `_Component25.jsx:21/55-74/355`（后台页）——
   *   两处的判据都是 `type === 'lovart'` 单查，且它是**与指纹互斥的另一条**（不是"多一个能力"）。
   *   挂 `<webview>` 时：容器 UA ⇒ `useragent`、`webpreferences`（源两处逐字同串）；**无 preload**
   *   （后端 `ensure-lovart-container` 恒返 `preloadUrl: null` —— 零注入）。
   */
  usesLovartContainer: boolean;
  /** 登录弹窗上有没有「在浏览器打开」那颗按钮（源 `$P.jsx:255` 的 `!a && …`：**tapnow 没有**） */
  loginCanOpenInBrowser: boolean;
  /** 登录弹窗上有没有「邮箱验证链接」那一行（源 `$P.jsx:316-328`：**只有 tapnow**） */
  loginHasVerifyRow: boolean;
  /** 后台视图头部有没有「无水印资源」那颗按钮（源 `_Component43.jsx:3255-3261`：`dola ‖ doubao`） */
  hasWatermarkButton: boolean;
  /** 无水印面板**允不允许出现**（源 `_Component43.jsx:3298` 的条件：**不是** "非 lovart"） */
  watermarkPanelAllowed: boolean;
  /**
   * **画廊来源键**：有 ⇒ `'lovart'` / `'tapnow'`，没有 ⇒ `null`。
   * 它同时表达「有没有画廊面板」（源 `OP.jsx:710` 的 `fe`）与「该类图的来源标记」（缩略图角标按它选）。
   */
  gallerySource: 'lovart' | 'tapnow' | null;
  /** 有没有「真实 Chrome 登录会话条」（源 `_Component25.jsx:359` 的条件 `p`） */
  hasChromeSession: boolean;
  /** 「出新图」条出不出现（源 `_Component26` 的站点条件）；也答"这账号能不能被抓图"（源里同一条件） */
  hasNewImagesPanel: boolean;
  /**
   * 能不能走**网页通道**执行（发送 / 出图）—— 即该站点有网页侧适配器。
   * 依据：源 `nf`（`shared.js:43363` = `['doubao', 'dola', 'gpt']`）。
   * ⚠️ 与 `channel` **不是同一个问题**：`channel` 答"归哪个通道"，本条答"能不能走网页通道"
   *    （当前两者恰好同集 `doubao` / `dola` / `gpt`，演进时会分开 ⇒ 不合并）。
   */
  webExecutable: boolean;
  /** 用不用 Lovart 代理池（源：代理池只作用于 lovart 账号） */
  usesProxyPool: boolean;
  /** 媒体**通道**（该类型提交到哪个通道；未指定时的默认源也取自这里） */
  channel: 'doubao' | 'dola' | 'gpt';
}

/**
 * 六站点的能力档（**唯一声明点**）
 *
 * ⚠️ 每项取值都对着**源**（行号见 `SiteCaps` 各字段注释）或对着本仓已裁定的行为；
 *    改一行前先回源，**不要按"看起来合理"改**。
 */
export const SITE_CAPS: Record<SiteType, SiteCaps> = {
  doubao: {
    hasFixedUrl: true,
    needsFingerprintSession: true,
    usesLovartContainer: false,
    loginCanOpenInBrowser: true,
    loginHasVerifyRow: false,
    hasWatermarkButton: true,
    watermarkPanelAllowed: true,
    gallerySource: null,
    hasChromeSession: false,
    hasNewImagesPanel: false,
    usesProxyPool: false,
    webExecutable: true,
    channel: 'doubao',
  },
  dola: {
    hasFixedUrl: true,
    needsFingerprintSession: true,
    usesLovartContainer: false,
    loginCanOpenInBrowser: true,
    loginHasVerifyRow: false,
    hasWatermarkButton: true,
    watermarkPanelAllowed: true,
    gallerySource: null,
    hasChromeSession: false,
    hasNewImagesPanel: false,
    usesProxyPool: false,
    webExecutable: true,
    channel: 'dola',
  },
  lovart: {
    hasFixedUrl: true,
    needsFingerprintSession: false,
    usesLovartContainer: true,
    loginCanOpenInBrowser: true,
    loginHasVerifyRow: false,
    hasWatermarkButton: false,
    // 源 `:3298` 的条件是 `!== 'lovart'`（**不是** `dola ‖ doubao` —— 源里两处条件本就不同）
    watermarkPanelAllowed: false,
    gallerySource: 'lovart',
    hasChromeSession: true,
    hasNewImagesPanel: true,
    usesProxyPool: true,
    webExecutable: false,
    channel: 'doubao',
  },
  tapnow: {
    hasFixedUrl: true,
    needsFingerprintSession: true,
    usesLovartContainer: false,
    // 源 `$P.jsx:255`：tapnow 是唯一没有「在浏览器打开」的站点
    loginCanOpenInBrowser: false,
    loginHasVerifyRow: true,
    hasWatermarkButton: false,
    watermarkPanelAllowed: true,
    gallerySource: 'tapnow',
    hasChromeSession: false,
    hasNewImagesPanel: true,
    usesProxyPool: false,
    webExecutable: false,
    channel: 'doubao',
  },
  gpt: {
    hasFixedUrl: true,
    needsFingerprintSession: true,
    usesLovartContainer: false,
    loginCanOpenInBrowser: true,
    loginHasVerifyRow: false,
    hasWatermarkButton: false,
    watermarkPanelAllowed: true,
    gallerySource: null,
    hasChromeSession: false,
    hasNewImagesPanel: false,
    usesProxyPool: false,
    webExecutable: true,
    channel: 'gpt',
  },
  other: {
    // `other` = 用户手输网址的未知站点：无固定地址、无指纹链、不挂 preload
    hasFixedUrl: false,
    needsFingerprintSession: false,
    usesLovartContainer: false,
    loginCanOpenInBrowser: true,
    loginHasVerifyRow: false,
    hasWatermarkButton: false,
    watermarkPanelAllowed: true,
    gallerySource: null,
    hasChromeSession: false,
    hasNewImagesPanel: true,
    usesProxyPool: false,
    webExecutable: false,
    channel: 'doubao',
  },
};

/**
 * 取某类型的站点能力
 *
 * ⚠️ 入参放宽为 `string`：调用方手上常是 `Account.type`（已归一）或账号条目里的裸串。
 *    未登记的类型**按 `normalizeAccountType` 的既有口径归一**（未知 ⇒ `doubao`）——
 *    **不在本函数另立一套兜底**（那会是第二套"未知类型怎么办"）。
 */
export function capsOf(type: string): SiteCaps {
  return SITE_CAPS[normalizeAccountType(type)];
}

/** 从表派生「满足某能力」的类型清单（供各领域模块出**自己的**子集视图，而不各自抄一份清单） */
export function siteTypesWhere(pick: (caps: SiteCaps) => boolean): readonly SiteType[] {
  return SITE_TYPES.filter((t) => pick(SITE_CAPS[t]));
}

/**
 * 挂 `<webview>` 前**要不要跑会话准备**（挂 preload / 等就绪）
 *
 * 依据：源 `_Component25.jsx:55-90` 的两支 —— `p`（= lovart）走容器、`else if (e.fingerprint)`
 *   走指纹，**两支都准备**；两者都没有（`other`）就都不走。
 */
export function needsSessionPrep(type: string): boolean {
  const c = capsOf(type);
  return c.needsFingerprintSession || c.usesLovartContainer;
}
