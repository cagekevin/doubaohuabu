/**
 * 账号 / 分组 / 指纹模型 —— ★ 冻结契约（**值形状**不可改）
 * 依据：docs/03-人类版.md §0.4 + docs/06-账号与站点集成.md §3（7 维指纹）
 * 归属说明：数据形状属 `stable`（L1）—— 见 `./node.ts` 头部说明
 */

import { FINGERPRINT_VERSION } from '@/constants';

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
  hostOS: 'windows' | 'macos' | 'linux';
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
  uaClientHints?: unknown;
  userAgentData?: unknown;
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
  [k: string]: unknown;
}

/** 账号状态常量 */
export const ACCOUNT_STATUS = {
  loggedIn: '已登录',
  invalid: '已失效',
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
 * ⚠️ 为什么放 `stable/model`：它与 `isAccountUsable` / `isFingerprintStale` 同类
 *    —— 都是「对**账号形状**的纯判定」，且 `SITE_TYPES` 的真源就在本文件（SSOT 就近）。
 *    （原版 `Ps` 被 7 处跨模块复用 ⇒ 需要一个共享宿主，`stable/model` 正合适。）
 * ⚠️ 与源一致：**没有**「未知类型保留原文」的分支，未知一律变 `doubao`。
 */
export const normalizeAccountType = (type: unknown): SiteType => {
  const t = String(type ?? '');
  return isSiteType(t) ? t : 'doubao';
};

/** 指纹版本是否过期（过期需 M6 重算） */
export const isFingerprintStale = (f: Fingerprint | undefined): boolean =>
  !!f && f.ver !== FINGERPRINT_VERSION;
