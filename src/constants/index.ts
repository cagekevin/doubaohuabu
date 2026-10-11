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
/**
 * 指纹诊断的**页面探针超时**（ms，原 `OP.jsx:59-64` 的 `p(yt, AP, 2500)`）
 *
 * ⚠️ 探针是 **best-effort**：超时即放弃，回落账号里存的指纹配置（原版同）。
 */
export const FP_DIAG_TIMEOUT_MS = 2500;

// ── 文本拆分（原 `splitDirect` shared.js:28584-28586 的三个内联字面量）──

/** 拆出来的文本框宽度（px，原 `d = 600`） */
export const SPLIT_NODE_WIDTH = 600;
/** 拆出来的文本框高度（px，原 `f = 400`） */
export const SPLIT_NODE_HEIGHT = 400;
/** 相邻两个文本框的纵向间距（px，原 `p = 80`） */
export const SPLIT_NODE_GAP = 80;

// ── 画廊「添加到画布」的居中网格（原 `addMaterialsBatch` shared.js:29084-29160 的内联字面量）──

/** 网格间距（px，原 `r.gap ?? 24`） */
export const GALLERY_GRID_GAP = 24;
/** 缩放系数（原 `r.scale || 1`） */
export const GALLERY_GRID_SCALE = 1;
/** 素材**显示**长边上限（px，原 `(r.scale||1) * 260`） */
export const GALLERY_GRID_LONG_SIDE = 260;
/** 素材节点**头部**高度（px，原 `h: R + 64` —— 图片高度之外还要加这一截） */
export const GALLERY_NODE_HEADER_H = 64;
/** 缺 `natW`/`natH` 时的兜底显示尺寸（px，原 `j || 200` / `I || 160`） */
export const GALLERY_FALLBACK_W = 200;
export const GALLERY_FALLBACK_H = 160;

/**
 * 「大图」判据（原 `i0` 34157-34163）：体积 **> 10 MB** 或任一边 **≥ 4096 px**
 * ⚠️ 命中的图在「添加到画布」前会**先弹确认**（原 `De` 367-370）。
 */
export const GALLERY_BIG_BYTES = 10485760;
export const GALLERY_BIG_SIDE = 4096;

/** 画廊网格**首屏显示张数**（原 `Dd` 34156 = 60；「加载更多」每次再加这么多） */
export const GALLERY_PAGE_SIZE = 60;

// ── 「出新图」面板（原 `_Component26.jsx` 的内联字面量）──

/** 「出新图」列表**最多显示张数**（原 `JR` shared.js:36676 = 48） */
export const NEW_IMAGES_LIMIT = 48;
/** 「NEW」徽标的时效窗口（ms，原 `_Component26.jsx:627` 的 `3600000` = 1 小时） */
export const NEW_IMAGES_FRESH_MS = 3600000;

// ── 自动值守（原 `_Component26.jsx` 的 `Ee` 循环 428-592）──
//
// ⚠️ 源版按站点分两档节奏：`ho(acc) ? qR : KR`（Lovart 3000 / 其它 6000），退避同形
//    （`YR` 10000 / `XR` 15000）。本仓**只用「非 Lovart 档」** —— Lovart **不参与值守**
//    （`docs/10` #11 · `electron/main.js:2749`），所以 Lovart 那一档被刻意留空不用。

/** 值守轮询的**基础间隔**（原 `KR` shared.js:36672 = 6000；Lovart 档 `qR` = 3000 用不到） */
export const AUTO_WATCH_INTERVAL_MS = 6000;
/** 值守的**退避**间隔（原 `XR` = 15000；空转达上限 / 累计新增超限后转它。Lovart 档 `YR` = 10000 同前） */
export const AUTO_WATCH_IDLE_BACKOFF_MS = 15000;
/** 连续空转多少轮后转退避（原 `xl` 36675 = 4） */
export const AUTO_WATCH_IDLE_ROUNDS_MAX = 4;
/** 单账号累计新增上限，超过转退避（原 `QR` 36678 = 40） */
export const AUTO_WATCH_MAX_NEW = 40;
/** 抖动上界（原 `tD` 36685-36691 的 `t % 8000`）—— 各账号**错峰**，避免同时打页面 */
export const AUTO_WATCH_JITTER_MOD = 8000;

// ── 「出新图」缩略图的**拖出到系统**（原 `_Component26.jsx` 的 `V` 226-264 + 监听 274-326）──

/**
 * 触发系统拖拽的**位移阈值**（px，原 `eD` shared.js:36681 = 6）
 *
 * ⚠️ 源版叫「长按拖拽」，但**它不是计时** —— 按下后**移动超过这个距离**就起拖
 *    （`Math.hypot(dx, dy) > eD`）。
 */
export const NEW_IMAGES_DRAG_THRESHOLD_PX = 6;
/** 单张图下载超时（ms） */
export const IMAGE_FETCH_TIMEOUT_MS = 25000;
/** API 任务重试退避（ms） */
export const API_RETRY_BACKOFF_MS = [2000, 8000, 30000] as const;
/** API 轮询连续网络失败次数上限 */
export const API_POLL_NETWORK_FAIL_LIMIT = 5;
/** 失败提示停留（ms，原 `applyApiJobEvent` 30831 的 `5000`） */
export const API_TOAST_ERROR_MS = 5000;
/** 额度异常提示停留（ms，原 `applyApiJobEvent` 30831 的 `7000` —— 额度问题要用户看更久） */
export const API_TOAST_QUOTA_MS = 7000;
/** 域名冷却时长（ms） */
export const DOMAIN_COOLDOWN_MS = 5 * 60 * 1000;

// ── 宿主环境 ──

/**
 * 宿主操作系统（原 `Uc` shared.js:25080 的三个取值）
 *
 * ★ **2026-10-10 收口（原则 5）**：这个联合原先在**三处**各写一遍 ——
 *   `Fingerprint.hostOS`（`stable/model/account.ts:31`）· `HostPort.os`
 *   （`core/ports/host.port.ts:303`）· `window.api.hostOS`（`window-api.d.ts:25`）。
 *   三者必须一致（指纹复用判定要拿 `Fingerprint.hostOS` 与当前 OS 比），
 *   各写一遍迟早会漂 ⇒ 提到 L0 只留一处。
 */
export const HOST_OS = ['windows', 'macos', 'linux'] as const;
export type HostOS = (typeof HOST_OS)[number];

// ── 后台页（豆包 / Dola / Lovart 的后台 `<webview>`）──

/**
 * 后台页加载的默认超时（ms，原 `vr` 的 `q$` shared.js:25834 = 30000）
 * ⚠️ 与「页面无响应超时 `PAGE_TIMEOUT_LONG_MS`」**不是一回事**：
 *    后者等的是单帧加载，本项等的是**后台账号页就绪**（含一次自动重载）。
 */
export const BACKEND_LOAD_TIMEOUT_MS = 30000;
/**
 * 后台页租约 TTL（ms，原 `vr` 的 `Y$` shared.js:25836 = 3600000）
 * ⚠️ 与 `ACCOUNT_BUSY_TIMEOUT_MS` **同值但不同义**：那个管「账号忙」，
 *    这个管「后台页被某个任务独占」——两者是不同生命周期，**不合并**（改一个不该动另一个）。
 */
export const BACKEND_LEASE_TTL_MS = 3600000;
/**
 * 首次失败后**只自动重载一次**的阈值（ms，原 `vr` 逐字：`Date.now() - l >= 7000`）
 * ⚠️ 源版把它**写在内联表达式里**（`26085`），此处提为具名常量（原则 5）。
 */
export const BACKEND_RELOAD_AFTER_MS = 7000;

// ── 附参考图（原 `hS` shared.js:38893-38947）──

/** CDP 直喂的重试次数（原 `hS` 的 `for (let s = 0; s < 3; s++)`，每次间隔 `fr(1500)`） */
export const ATTACH_IMAGE_ATTEMPTS = 3;
/** 两次 CDP 直喂之间的间隔（ms，原 `hS` 38915 的 `fr(1500)`） */
export const ATTACH_IMAGE_RETRY_MS = 1500;
/** 剪贴板粘贴后的静置（ms，原 `hS` 38930 的 `fr(2500)`） */
export const ATTACH_IMAGE_PASTE_SETTLE_MS = 2500;
/**
 * 发送图片后到「开始等回复」之间的静置（ms，原 `gS` 39173 / `yS` 39375 的 `fr(1200)`）
 * ⚠️ 给页面时间把气泡渲染出来，否则回复轮询会读到"还没出现"直接空转
 */
export const ASK_IMAGE_SETTLE_MS = 1200;
/** 「读回复」轮询的间隔（ms，原 `mS` 39022 的 `fr(3000)`） */
export const ASK_REPLY_POLL_MS = 3000;
/** 「读回复」轮询的最大轮数（原 `mS` 39021 的 50 轮 ⇒ 最长 150s） */
export const ASK_REPLY_MAX_POLLS = 50;
/** 回复「连续稳定」判定所需的次数（原 `mS` 39028 的 `d >= 2`） */
export const ASK_REPLY_STABLE_READS = 2;
/** 点发送的重试次数（原 `mS` 39003 的 3 次，间隔 `fr(800)`） */
export const ASK_SEND_CLICK_ATTEMPTS = 3;
/** 点发送重试间隔（ms，原 `mS` 39009 的 `fr(800)`） */
export const ASK_SEND_CLICK_RETRY_MS = 800;
/** 填文本后到「校验输入框非空」之间的静置（ms，原 `MD` 38956 的 `fr(600)`） */
export const FILL_TEXT_SETTLE_MS = 600;

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

/** 文生图节点 `results` 上限（原 `attachImageResultToNode` 27273 的 `slice(0, 40)`） */
export const IMAGE_GEN_RESULT_LIMIT = 40;

/** `genHistory.attempts` 上限（原 `U$` 25568 的 `slice(-20)`） */
export const GEN_HISTORY_ATTEMPT_LIMIT = 20;

export * from './failure';
export * from './text';
export * from './models';
export * from './stylePresets';
// ⚠️ TD-16-12：此处曾**再抄一遍** dedupe / facemask / fingerprint 的 star-export
//   （与上文「去重 / 有效性」段重复）—— 同一模块被导出两次 ⇒ 名字来源二义。已删。
