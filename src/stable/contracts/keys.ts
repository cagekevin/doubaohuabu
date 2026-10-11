/**
 * localStorage 键（★ SSOT：20 个键的唯一真源）
 *
 * 依据：docs/03-人类版.md §0.8 + docs/09-校验记录.md C3（回源补录 4 个）
 * 铁律：**键名与值格式冻结** —— 后端不改 ⇒ 老用户数据必须能直接读（docs/08 W2，P0）
 *
 * ⚠️ 本文件是**唯一**允许出现键名字符串字面量的地方
 *    （由 eslint 的 `no-restricted-syntax`（`doubao-*` 字面量选择器）强制）
 */

/** 工程数组（全量 JSON） */
export const LS_PROJECTS = 'doubao-projects';
/** 账号列表 */
export const LS_ACCOUNTS = 'doubao-accounts';
/** 账号分组 */
export const LS_ACCOUNT_GROUPS = 'doubao-account-groups';
/** 节点图预设 */
export const LS_PRESETS = 'doubao-presets';
/** 风格预设 */
export const LS_STYLES = 'doubao-styles';
/** 画布默认值 `{model,duration,ratio}` */
export const LS_CANVAS_DEFAULTS = 'doubao-canvas-defaults';
/** Lovart 图库 */
export const LS_LOVART_GALLERIES = 'doubao-lovart-galleries';
/** 扫描历史 */
export const LS_SCAN_HISTORY = 'doubao-scan-history';
/** 代理池 */
export const LS_PROXY_POOL = 'doubao-proxy-pool';
/** 自动视频检测 `'1' | '0'` */
export const LS_AUTO_VIDEO_DETECT = 'doubao-auto-video-detect';
/** 人脸遮罩选项 */
export const LS_FACE_MASK_OPTS = 'doubao-face-mask-opts';
/** 账号池策略 */
export const LS_ACCOUNT_POOL_STRATEGY = 'doubao-account-pool-strategy';
/** 发送队列浮窗位置 */
export const LS_SENDQUEUE_POS = 'doubao-sendqueue-pos-v2';
/** 文生图去重表 `{urls,hashes}` */
export const LS_IMGGEN_DEDUP = 'imggen_recurring_assets_v1';

/** ⚠️ 旧版单工程（**仅读**，用于迁移；不得写入） */
export const LS_LEGACY_CANVAS = 'doubao-canvas';
/** 令牌（**只读**） */
export const LS_ACCESS_TOKEN = 'access_token';

/** 新图面板：自动捕获开关 `[校验补录 C3]` */
export const LS_NEWIMAGES_AUTOCAP = 'doubao-newimages-autocap';
/** 新图面板：仅当前 `[校验补录 C3]` */
export const LS_NEWIMAGES_CURRENT_ONLY = 'doubao-newimages-current-only';
/** 新图面板：折叠态 `[校验补录 C3]` */
export const LS_NEWIMAGES_FOLDED = 'doubao-newimages-folded';
/** 后台视图头部折叠态 `[校验补录 C3]` */
export const LS_VIEW_HEAD_COLLAPSED = 'doubao-view-head-collapsed';

/**
 * 全部键的字面量联合 —— 让 `StoragePort.read(key)` **拼错键名编译期就报错**
 */
export type LsKey =
  | typeof LS_PROJECTS
  | typeof LS_ACCOUNTS
  | typeof LS_ACCOUNT_GROUPS
  | typeof LS_PRESETS
  | typeof LS_STYLES
  | typeof LS_CANVAS_DEFAULTS
  | typeof LS_LOVART_GALLERIES
  | typeof LS_SCAN_HISTORY
  | typeof LS_PROXY_POOL
  | typeof LS_AUTO_VIDEO_DETECT
  | typeof LS_FACE_MASK_OPTS
  | typeof LS_ACCOUNT_POOL_STRATEGY
  | typeof LS_SENDQUEUE_POS
  | typeof LS_IMGGEN_DEDUP
  | typeof LS_LEGACY_CANVAS
  | typeof LS_ACCESS_TOKEN
  | typeof LS_NEWIMAGES_AUTOCAP
  | typeof LS_NEWIMAGES_CURRENT_ONLY
  | typeof LS_NEWIMAGES_FOLDED
  | typeof LS_VIEW_HEAD_COLLAPSED;

/** 全部键（20 个）—— 用于「清空本地数据」等操作 */
export const ALL_LS_KEYS: readonly LsKey[] = [
  LS_PROJECTS,
  LS_ACCOUNTS,
  LS_ACCOUNT_GROUPS,
  LS_PRESETS,
  LS_STYLES,
  LS_CANVAS_DEFAULTS,
  LS_LOVART_GALLERIES,
  LS_SCAN_HISTORY,
  LS_PROXY_POOL,
  LS_AUTO_VIDEO_DETECT,
  LS_FACE_MASK_OPTS,
  LS_ACCOUNT_POOL_STRATEGY,
  LS_SENDQUEUE_POS,
  LS_IMGGEN_DEDUP,
  LS_LEGACY_CANVAS,
  LS_ACCESS_TOKEN,
  LS_NEWIMAGES_AUTOCAP,
  LS_NEWIMAGES_CURRENT_ONLY,
  LS_NEWIMAGES_FOLDED,
  LS_VIEW_HEAD_COLLAPSED,
];

/** 只读键（不得写入） */
export const READONLY_LS_KEYS: readonly LsKey[] = [LS_LEGACY_CANVAS, LS_ACCESS_TOKEN];
