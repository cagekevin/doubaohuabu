/**
 * 20 个 localStorage 键的**值形状**（★ 冻结契约 · 唯一真源）
 *
 * 依据：`docs/03-人类版.md` §0.8（键表）+ `docs/15-数据与持久化缺口登记.md` §1（落地矩阵）
 *      `docs/11` §六 把「20 键 + **值形状**」列为 ❌ 冻结项（老用户数据在磁盘上）。
 *
 * ⚠️ **为什么不塞进 `schemas.ts`**：
 *    `schemas.ts` 是**零依赖的字面量 SSOT**；本文件要引用 `../model/*` 的**值形状**。
 *    若合并 ⇒ 与 `model/project.ts → contracts/schemas.ts`（引 `SNAPSHOT_FORMAT`）形成**环**
 *    （depcruise `no-circular` 会拦）。故单独成文件。
 *
 * ⚠️ **结构穷尽（这是"不建闸"的替代物，见 `docs/16` §4.1）**：
 *    `LsValueMap` 的键必须与 `keys.ts` 的 `LsKey` 联合**双向相等** —— 少一个键**编译不过**。
 *    ⇒ 「键声明了却没有值形状」在结构上不可能发生，**不需要 `keys-coverage` 闸**。
 *
 * ⚠️ 标 `[待确认]` 的形状**没有回源证据**（只证明"有读"）⇒ 落地消费前必须回读原实现。
 */

import type { Account, AccountGroup, PoolStrategy } from '../model/account';
import type { Preset, Project } from '../model/project';
import type { StylePreset } from '@/constants/stylePresets';
import type { LsKey } from './keys';

// ─────────────────────────── 值形状（原版逐键回源） ───────────────────────────

/** 画布默认值（`doubao-canvas-defaults`；原 `ST` 26484 读 / `NT` 26491 写） */
export interface CanvasDefaults {
  model: string;
  duration: number;
  ratio: string;
}

/** 文生图去重表（`imggen_recurring_assets_v1`；原 `TR` 36238 / `PR` 36251） */
export interface ImggenDedupTable {
  urls: string[];
  hashes: string[];
}

/** 发送队列浮窗位置（`doubao-sendqueue-pos-v2`；原 `Pp` 42568） */
export interface SendQueuePos {
  x: number;
  y: number;
}

/** 开关型键的值（`'1'` 开 / `'0'` 关；原 `jT` 26650 / `_T` 26662） */
export type FlagValue = '1' | '0';

/**
 * 人脸遮罩选项（`doubao-face-mask-opts`；原 25463 / 25493）
 * ⚠️ 形状 `[待确认]` —— `docs/03` §0.8 只记了行号，未记字段。
 *    默认值在 `constants/facemask.ts` 的 `FACE_MASK_DEFAULTS`（那是**默认**，不是**持久化形状**）。
 */
export type FaceMaskOpts = Readonly<Record<string, unknown>>;

// ─────────────────────────── 键 → 值 ───────────────────────────

/**
 * ⚠️ 类型从 `core/rules/scanHistory` **反向**引入是不允许的（`stable` 是底层）⇒
 *   这里只声明**结构等价**的最小形状（字段与那张表逐字一致，注释里指向真源）。
 *   两处必须同步：`LsValueMapIsExhaustive` 与 `core/rules/scanHistory.ts` 的 `ScanHistoryEntry`。
 */
export interface ScanHistoryPair {
  /** 参与撞车的一方（账号 id）；⚠️ `a`/`b`/`level` 的确切语义待"指纹体检"转写时校正 */
  a: string;
  b: string;
  /** 告警级别 */
  level: string;
}

export interface ScanHistoryEntry {
  ts: number;
  sig: string;
  total: number;
  totalPairs: number;
  critical: number;
  warn: number;
  pairs: ScanHistoryPair[];
}

/**
 * Lovart 画廊里的一张图（原 `addLovartImages` 29267-29278 逐字段写出的形状）
 *
 * ★ **2026-10-11 定形**：`LsValueMap` 此前把它标成 `[待确认]`（`docs/15` §1 #7 ——
 *   当时只证明了「有读」）。源实现的**写侧**（29267-29278）给出了完整字段表 ⇒ 现在定形。
 * ⚠️ 放 `stable/contracts` 而不是 `core/rules`：**持久化形状是契约**，
 *   而 `stable` 是底层（`core` 可以 import 它，反过来不行）。
 */
export interface LovartGalleryImage {
  id: string;
  name: string;
  /** ⚠️ 已归一（源版 `Tn` 会把远程图落成本地引用） */
  dataUrl: string;
  natW: number;
  natH: number;
  sizeBytes: number;
  source: string;
  sourceUrl: string;
  scope: string;
  addedAt: number;
}

/** 画廊：`账号 id → 图片列表`（原 29285-29288 的 `{...galleries, [accountId]: [...]}`） */
export type LovartGalleriesMap = Record<string, LovartGalleryImage[]>;

/**
 * 键 → 值形状。
 *
 * ⚠️ 键名必须是**字面量**（不能写成 `[K in LsKey]`）—— 本文件靠它与 `LsKey` 做**双向穷尽断言**。
 */
export interface LsValueMap {
  'doubao-projects': Project[];
  'doubao-accounts': Account[];
  'doubao-account-groups': AccountGroup[];
  /** **联合**：提示词预设（无 `kind`）与图预设（`kind:'graph'`）混装 —— 源里两者 push 进同一键 */
  'doubao-presets': Preset[];
  'doubao-styles': readonly StylePreset[];
  'doubao-canvas-defaults': CanvasDefaults;
  /** 形状按源写侧定形：读 `Pk` 26629 / `ET` 26637，写 `addLovartImages` 29285 */
  'doubao-lovart-galleries': LovartGalleriesMap;
  /**
   * ★ **2026-10-11 定形**（原 `jk` 26223 读 / `Fy` 26225 写 / `recordScan` 30362 写侧）
   * —— 此前是 `unknown[]` + `[待确认]`（`docs/15` §1 #8）。
   * ⚠️ 它是**指纹撞车体检**的历史，**不是**画廊扫描（两者别混）。
   */
  'doubao-scan-history': ScanHistoryEntry[];
  'doubao-proxy-pool': string[];
  'doubao-auto-video-detect': FlagValue;
  'doubao-face-mask-opts': FaceMaskOpts;
  'doubao-account-pool-strategy': PoolStrategy;
  'doubao-sendqueue-pos-v2': SendQueuePos;
  'imggen_recurring_assets_v1': ImggenDedupTable;
  /** 旧版单工程（**只读**；`docs/15` §5 已裁定不做迁移 ⇒ 保留形状仅为"能读"） */
  'doubao-canvas': unknown;
  /** 令牌（**只读**；原 33237） */
  access_token: string;
  'doubao-newimages-autocap': FlagValue;
  'doubao-newimages-current-only': FlagValue;
  'doubao-newimages-folded': FlagValue;
  'doubao-view-head-collapsed': FlagValue;
}

/** 取某键的值形状（供 `state/persistKeys` 与各消费方复用） */
export type LsValue<K extends LsKey> = LsValueMap[K];

// ─────────────────────────── 编译期穷尽断言 ───────────────────────────

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** `Expect<T>` 只在 `T === true` 时成立 ⇒ 不相等即**编译报错** */
type Expect<T extends true> = T;

/**
 * ⚠️ **本类型只要存在就在检查**：`LsValueMap` 的键与 `LsKey` 必须**完全一致**
 * （20 个，一个不漏、一个不多）。缺键 ⇒ `AssertEqual` 得 `false` ⇒ `Expect<false>` 报错。
 */
export type LsValueMapIsExhaustive = Expect<AssertEqual<keyof LsValueMap, LsKey>>;
