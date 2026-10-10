/**
 * 业务常量（★ SSOT：网格 / 超时 / 阈值 / 上限的唯一真源）
 *
 * 依据：docs/07-领域规则.md §八「业务常量表」（逐条对照还原源码行号）
 * 铁律：各处**不得写魔法数**，一律引用本文件
 */

// ─────────────────────────── 画布 ───────────────────────────

/** 网格大小（原 `Bs`，shared.js:26148） */
export const GRID_SIZE = 20;
/** 网格透明度（原 `uT`，26149） */
export const GRID_OPACITY = 0.4;
/** 素材拖拽 MIME（原 `ql`，32373） */
export const DRAG_MIME_MATERIAL = 'application/x-doubao-mat';
/** 缩放范围（ReactFlow props） */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** 连线命中半径 */
export const CONNECTION_RADIUS = 60;
/** 组节点 zIndex（原 31577） */
export const GROUP_Z_INDEX = -1001;
/** 边单击防抖（ms） */
export const EDGE_CLICK_DEBOUNCE_MS = 220;

/**
 * 连线样式（原 `Mr` 26724-26744）
 * ⚠️ 颜色用 **CSS 变量**引用 `styles/tokens.css`（原则 5 SSOT：此处不得写死色值）
 */
export const EDGE_STYLE = { stroke: 'var(--color-edge)', strokeWidth: 2 } as const;
export const EDGE_MARKER = {
  type: 'arrowclosed',
  color: 'var(--color-edge)',
  width: 16,
  height: 16,
} as const;
/** 切项目后 fitView 延迟（ms） */
export const FITVIEW_DELAY_MS = 250;

// ─────────────────────────── 撤销 / 持久化 ───────────────────────────

/** 撤销栈上限（原 26890-26911） */
export const UNDO_LIMIT = 80;
/** 撤销合并窗口（ms，原 26890-26929） */
export const UNDO_MERGE_MS = 800;
/** 持久化防抖（ms） */
export const PERSIST_DEBOUNCE_MS = 600;
/** 工程体积告警阈值（原 26188-26190） */
export const PROJECT_SIZE_WARN_BYTES = 20 * 1024 * 1024;

// ─────────────────────────── 生成 ───────────────────────────

/** 生成轮询间隔（ms，原 `CR` 36228） */
export const GEN_POLL_MS = 3000;
/** 生成静默阈值（ms，原 `ER` 36229）—— 超时判「无真实图片」 */
export const GEN_SILENT_MS = 9000;
/**
 * 生成总超时（ms，原 `Vo` 23618 = 25000）
 * ⚠️ 与静默阈值不同：静默 = 「不再有新结果」；总超时 = 「整体放弃」
 */
export const GEN_TIMEOUT_MS = 25000;
/** 发送重试次数（原 `Bu` maxRetries） */
export const SEND_MAX_RETRIES = 1;
/** 分类驱动的重试上限（原 `g3` maxRetry） */
export const FAILURE_MAX_RETRY = 2;
/** 发送防重窗口（ms，原 `N3` 41835 = 90000）—— 90 秒内内容相同则跳过入队（`$S`） */
export const SEND_DEDUP_MS = 90000;
/**
 * 生成尝试记录窗口的前置偏移（ms，原 `B0` **42513** 的 `- 1500`）
 * ⚠️ 作用：只认「本轮」的尝试记录，避免把**上一轮**的失败/成功误当本轮结果
 */
export const GEN_ATTEMPT_WINDOW_MS = 1500;

// ─────────────────────────── 页面 / 抓取 ───────────────────────────

/** 页面无响应超时（ms，原 `hl` 23617） */
export const PAGE_TIMEOUT_SHORT_MS = 12000;
/** 页面无响应超时（ms，原 `Vo` 23618） */
export const PAGE_TIMEOUT_LONG_MS = 25000;
/** 抓取并发（原 `wR` 35946） */
export const SCAN_CONCURRENCY = 3;
/**
 * 发送任务的有效时效（ms，原 `qk` 35734 = 3000000 = 50 分钟）
 * ⚠️ 用途：视频回填匹配时，只认「最近 50 分钟内发过」的任务（原 `Kk` 的第三个过滤条件）
 */
export const MAX_JOB_AGE_MS = 3000000;

// ── Tapnow 站点（原 `cP` 33271 · `Yl` 内联 · `r0` 33523 · `Kl` 33107）──

/** Tapnow 接口调用超时（ms，原 `cP` = 20000） */
export const TAPNOW_API_TIMEOUT_MS = 20000;
/** Tapnow 读页面地址超时（ms，原 `Yl` 内联 `8000`） */
export const TAPNOW_HREF_TIMEOUT_MS = 8000;
/** Tapnow 页面扫描超时（ms，原 `r0` = 12000） */
export const TAPNOW_SCAN_TIMEOUT_MS = 12000;
/** Tapnow 抓图最小边长（px，原 `Kl` = 96） */
export const TAPNOW_MIN_SIDE = 96;

// ── GPT 站点（原 `nO` 42975）──

/** GPT 页内发送超时（ms，原 `nO` = 30000）—— 原 `oO` 调 `gn(..., nO, 'GPT 发送')` */
export const GPT_SEND_TIMEOUT_MS = 30000;
/** webview 多帧扫描上限 */
export const SCAN_MAX_FRAMES = 12;
/** 单 frame 扫描超时（ms） */
export const SCAN_FRAME_TIMEOUT_MS = 8000;
/** 单张图下载超时（ms） */
export const IMAGE_FETCH_TIMEOUT_MS = 25000;
/** API 任务重试退避（ms） */
export const API_RETRY_BACKOFF_MS = [2000, 8000, 30000] as const;
/** API 轮询连续网络失败次数上限 */
export const API_POLL_NETWORK_FAIL_LIMIT = 5;
/** 域名冷却时长（ms） */
export const DOMAIN_COOLDOWN_MS = 5 * 60 * 1000;

// ─────────────────────────── 去重 / 有效性 ───────────────────────────
// ⚠️ 真源在 `./dedupe`（SSOT：同一常量不得定义两次）
export * from './dedupe';
export * from './facemask';
export * from './fingerprint';
/** 拖拽预览 icon 尺寸（px，原 1237-1238） */
export const DRAG_ICON_SIZE = 64;

// ─────────────────────────── 账号 ───────────────────────────
// ⚠️ `FINGERPRINT_VERSION` 的真源在 `./fingerprint`（SSOT：同一常量不得定义两次）

/** 账号忙超时（ms，原 `HP` 34477 = 1h） */
export const ACCOUNT_BUSY_TIMEOUT_MS = 3600000;
/** 账号池默认并发 */
export const DEFAULT_ACCOUNT_CONCURRENCY = 1;
/** API 任务默认并发 */
export const DEFAULT_API_CONCURRENCY = 3;

// ─────────────────────────── 资源上限 ───────────────────────────

/** 生成图片流上限（原 27132-27160） */
export const IMAGE_GEN_FEED_LIMIT = 80;

export * from './failure';
export * from './text';
export * from './models';
export * from './stylePresets';
export * from './dedupe';
export * from './facemask';
export * from './fingerprint';
