/**
 * 去重与有效性阈值（★ SSOT）
 *
 * 依据：docs/过程.md §五（逐条对照还原源码行号）
 */

/** 精确哈希位数（`nm` 返回 SHA-1 前 16 位；25730） */
export const EXACT_HASH_LEN = 16;

/** 感知哈希判**重复**：汉明距离 ≤ 此值（原 `kk`，25787） */
export const PHASH_DUPLICATE_DISTANCE = 8;

/** 感知哈希判**占位图**：汉明距离 ≤ 此值（原 `G$`，25776） */
export const PHASH_PLACEHOLDER_DISTANCE = 6;

/**
 * 出片近重复窗口长度（原 `wl`，36288）—— 只保留最近 N 个感知哈希（超出 `shift` 掉最旧）
 * ⚠️ 与持久化的跨会话表（`RECURRING_TABLE_MAX` 400）**不是一件事**：这是**进程内**、跨 send 保留
 */
export const NEAR_DUP_WINDOW = 120;

/** 感知哈希尺寸（原 `Bc(src, t = 8)` → 8×8 灰度） */
export const PHASH_SIZE = 8;

/**
 * 占位图黑名单（按**精确哈希**；原 `Sk`，25773）
 * ⚠️ 这两个值是**已知占位图的 SHA-1 前 16 位**（数据，非可调参数）
 */
export const PLACEHOLDER_EXACT_HASHES: readonly string[] = ['a1228ab1c4f684cf', 'fa7e8cdb71774fcc'];

/**
 * 占位图的**感知哈希基准**（原 `V$`，25775）
 * 与 `PHASH_PLACEHOLDER_DISTANCE` 配合判定"是不是那张默认占位图"
 */
export const PLACEHOLDER_PHASH = '3c66c3bdbddb663c';

/** 跨会话去重表的**两个桶**（源 `p0` 的 `t` 只取这两个值：`'urls'` / `'hashes'`） */
export const RECURRING_TABLE_KINDS = ['urls', 'hashes'] as const;

/** 一个桶的**条目上限**（原 `$R`，36237 = 400）—— 超出时按 `last` 升序**砍掉前一半** */
export const RECURRING_TABLE_MAX = 400;

/** 长边过小剔除阈值（px；`lovart-fetch.js`） */
export const MIN_IMAGE_SIDE = 200;

/** 文件过小剔除阈值（bytes；同上） */
export const MIN_IMAGE_BYTES = 4096;

/** 画布内图标：`0 < H < 140` 丢弃（原 22857） */
export const CANVAS_ICON_MAX_HEIGHT = 140;

/** 缩略图默认宽度（`?w=`） */
export const THUMB_WIDTH = 480;
