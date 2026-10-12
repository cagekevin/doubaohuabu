/**
 * 账号 / 分组 / 指纹模型 —— ★ 冻结契约（**值形状**不可改）
 * 依据：docs/过程.md §0.4 + docs/过程.md-账号与站点集成.md §3（7 维指纹）
 * 归属说明：数据形状属 `stable`（L1）—— 见 `./node.ts` 头部说明
 */

import type { HostOS } from '@/constants';

/** 站点类型（原 `bT` 26399） */
export const SITE_TYPES = ['doubao', 'dola', 'lovart', 'tapnow', 'gpt', 'other'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

/** 账号池选号策略（原 34468-34474） */
export const POOL_STRATEGIES = ['round-robin', 'least-load'] as const;
export type PoolStrategy = (typeof POOL_STRATEGIES)[number];

/** 屏幕指纹维度 */
export interface ScreenFingerprint {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  colorDepth: number;
  pixelRatio: number;
}

/** 环境指纹（7 维 + 扩展；原 `zc` 25397-25462） */
export interface Fingerprint {
  /** 指纹版本号（当前 FINGERPRINT_VERSION = 3） */
  ver: number;
  hostOS: HostOS;
  userAgent: string;
  appVersion: string;
  platform: string;
  vendor: string;
  language: string;
  languages: string[];
  timezone: string;
  screen: ScreenFingerprint;
  webgl: { vendor: string; renderer: string };
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  uaPlatformVersion?: string;
  uaArchitecture?: string;
  uaBitness?: string;
  uaWow64?: boolean;
  /** Sec-CH-UA 系列请求头（原 `P$` 25372）—— ⚠️ 会**逐字**进 `<id>.js` ⇒ 冻结形状 */
  uaClientHints?: SecChUaHints;
  /** `navigator.userAgentData` 的伪装值（原 `R$` 25380） */
  userAgentData?: UserAgentDataLike;
}

/** Sec-CH-UA 请求头组（原 `P$` 25372-25379 的四个键） */
export interface SecChUaHints {
  'Sec-CH-UA': string;
  'Sec-CH-UA-Mobile': string;
  'Sec-CH-UA-Platform': string;
  'Sec-CH-UA-Full-Version': string;
}

/** `navigator.userAgentData` 的冻结形状（原 `R$` 25380-25396） */
export interface UserAgentDataLike {
  brands: Array<{ brand: string; version: string }>;
  mobile: boolean;
  platform: string;
  /** ⚠️ 带下划线前缀 —— 源版就写作 `_fullVersion`（内部字段，照抄） */
  _fullVersion: string;
}

/** 账号（原 30184-30196） */
export interface Account {
  /** `acc_<base36>` */
  id: string;
  name: string;
  type: SiteType;
  /** 默认 `'已登录'` */
  status: string;
  /** Electron session partition（会话隔离键） */
  partition: string | null;
  addedAt: number;
  groupId: string | null;
  autoStart: boolean;
  /** 指纹盐（默认 0）；+1 即换指纹 */
  fpSalt: number;
  /** 环境指纹（type === 'other' 时为 undefined） */
  fingerprint?: Fingerprint;
  /** 仅 type === 'other' */
  url?: string;
  /** 仅 type === 'lovart' */
  proxy?: string;
  /** 读取时会被剥离 */
  credits?: unknown;
}

/** 账号分组（原 `doubao-account-groups`） */
export interface AccountGroup {
  id: string;
  name: string;
  /** 建组时间（原 `addGroup` 31942） */
  createdAt?: number;
  /** 颜色（原 `setGroupColor` 31952；`null` = 无颜色） */
  color?: string | null;
  [k: string]: unknown;
}

/** 账号状态常量 */
export const ACCOUNT_STATUS = {
  loggedIn: '已登录',
  invalid: '已失效',
  /**
   * ★ **新增（源版没有这个值）**：`未登录`
   *
   * 源版的建号**必然发生在登录成功之后**（`$P.jsx` 先在 `<webview>` 里登录、再 `addAccount`），
   * 所以它只需要 `已登录`/`已失效`。
   * 本工程的建号是**先建号、再登录**（登录要在 `BackendView` 的 `<webview>` 里真人操作）
   * ⇒ 中间必然存在"建了但还没登录"的账号。
   *
   * ⚠️ **它的意义正是被 `isAccountUsable` 排除** —— 这样未登录的账号**不会**被选号池选中，
   *    于是用户看到的是"没有可用账号"而不是"发送到未登录的账号后失败"。
   *    （反过来说：**不能**给新建账号填 `已登录` —— 那是撒谎，且会让选号池选中一个必然失败的账号。）
   */
  loggedOut: '未登录',
} as const;

/** 账号可用性统一判定（原实现：`(status || '已登录') === '已登录'`） */
export const isAccountUsable = (a: Account): boolean =>
  (a.status || ACCOUNT_STATUS.loggedIn) === ACCOUNT_STATUS.loggedIn;

/** 站点类型白名单（`Set` 查表：免 `as`、语义直白） */
const SITE_TYPE_SET: ReadonlySet<string> = new Set(SITE_TYPES);

/**
 * 是不是合法站点类型（**类型谓词** —— 收窄由类型系统完成，不用 `as`）
 * ⚠️ 与 `SITE_TYPES` 同源（同文件），是「类型白名单」的唯一判定入口。
 */
export const isSiteType = (v: unknown): v is SiteType =>
  typeof v === 'string' && SITE_TYPE_SET.has(v);

/**
 * 账号类型归一化（原 `Ps` 26441-26447）
 *
 * 规则：**在 `SITE_TYPES` 里就原样返回，否则一律回落 `'doubao'`**
 * ⚠️ 为什么放 `stable/model`：它与 `isAccountUsable` 同类
 *    —— 都是「对**账号形状**的纯判定」，且 `SITE_TYPES` 的真源就在本文件（SSOT 就近）。
 *    （原版 `Ps` 被 7 处跨模块复用 ⇒ 需要一个共享宿主，`stable/model` 正合适。）
 * ⚠️ 与源一致：**没有**「未知类型保留原文」的分支，未知一律变 `doubao`。
 */
export const normalizeAccountType = (type: unknown): SiteType => {
  const t = String(type ?? '');
  return isSiteType(t) ? t : 'doubao';
};

