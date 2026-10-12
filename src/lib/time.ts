/**
 * 时间工具（无状态 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：`pR` shared.js:35735-35757 —— 站点时间戳 → 毫秒
 *
 * ⚠️ 为什么放 `lib/`（判据 A1）：它是**纯解析**（不读时钟、无副作用）⇒ 无状态工具。
 *    放 `core/rules` 也能跑，但 `lib` 更贴"通用工具"的归属，且避免 `core` 里出现 `new Date`。
 */

// ★ 相对时间的四句是**用户可见文案** ⇒ 走 SSOT（原则 5；`lib` → `constants` 与
//   `lib/url.ts` → `constants/dedupe.ts` 同法，它俩同属 L0、不成环）。
import { RELATIVE_TIME_TEXT } from '@/constants/text';

/** 秒/毫秒的分界（原实现写死 `1000000000000`）：小于它按**秒**处理 */
const SECOND_CUTOFF = 1000000000000;

/**
 * 纪元毫秒 → ISO 时间戳（`2026-10-12T08:30:00.000Z`）
 *
 * ★ **2026-10-12（`TD-16-109`）收口**：此前 `core/rules/payload.ts` ×3 ＋
 *   `core/usecases/accountTransfer.ts` ×1 各写一份 `new Date(x).toISOString()`。
 * ⚠️ **原则 4 不被破坏**：调用方注入的**仍是 `now`（毫秒数）**，本函数只做「毫秒 → 字符串」
 *   的格式化（与同文件的 `formatClockTime(ms)` 同一站位）；⚠️ 它是 **UTC** ——
 *   要本地时区请用 `formatDateTimeMinute`（见 `core/rules/license.ts` 那条注释的教训）。
 */
export function toIsoTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * 站点时间戳 → 毫秒（原 `pR` 35735）
 *
 * 规则（**顺序即语义**）：
 *   1. `null`/`undefined` → `NaN`
 *   2. 能 `Number()` 成有限数：`> 0` 时 —— `< 1e12` 视为**秒**（×1000），否则视为**毫秒**；
 *      `<= 0` → `NaN`
 *   3. 否则按日期字符串 `new Date(v).getTime()`；`> 0` 才有效，否则 `NaN`
 *
 * ⚠️ 与源一致：**没有**"解析失败给当前时间"的兜底 —— 失败一律 `NaN`，
 *    由调用方（`matchVideosToNodes`）据此走"无时间戳"分支。
 *
 * @public 跨边界消费者：src/core/rules/media.ts
 *   ⚠️ **为什么需要这行**：消费者 `core/rules/media.ts` 自己**尚未接线**
 *   （它在死代码基线里）⇒ knip 看不到这条引用，会把本导出报成"新增死代码"。
 *   ⇒ 它**不是死代码**（有真实消费者 + 单测），按闸的正道打 `@public` 而非删。
 */
export function parseSiteTimestamp(value: unknown): number {
  if (value == null) return NaN;

  const n = Number(value);
  if (isFinite(n)) {
    if (n > 0) return n < SECOND_CUTOFF ? n * 1000 : n;
    return NaN;
  }

  const ms = new Date(String(value)).getTime();
  return ms > 0 ? ms : NaN;
}

/**
 * 数字 ⇒ 两位补零字符串（`String(n).padStart(2, '0')`）
 *
 * ⚠️ **导出**（原为文件内私有）：`core/rules` 的 `license`／`fingerprintScan`／`capture`／
 *    `recipe`／`accountName` 此前各自抄了一份同句 `String(n).padStart(2, '0')`（5 处）⇒ 收口于此。
 */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 时长 `Xs` / `Xm YYs`（原 `tc` shared.js:42481）
 *
 * `< 60`（含负数，调用方一般已 `Math.max(0, …)`）⇒ `'{n}s'`；否则 `'{m}m{ss}s'`（秒**补零 2 位**）。
 * ⚠️ 收口 `core/rules` 的 `sendQueuePanel.formatElapsed` 与 `genProgress.formatElapsed` 两处**逐字相同**的尾段。
 */
export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${pad2(sec % 60)}s`;
}

/**
 * 本地时钟时刻 `HH:MM:SS`（原 `applyApiJobEvent` 的
 * `new Date().toLocaleTimeString('zh-CN', { hour12: false })`）
 *
 * ⚠️ 为什么手写而不用 `toLocaleTimeString`：后者的输出**受 ICU 数据与 locale 实现影响**，
 *    同一段代码在 Node（单测）与 Chromium（运行）里可能给出不同形态 ⇒ 无法断言。
 *    手写 `pad2` 的产物与 `zh-CN` + `hour12:false` 的标准形态**逐字相同**（`HH:MM:SS`）。
 *
 * ⚠️ 仍是**本地时区**语义（与原版一致）—— 时间戳由调用方注入（原则 4）。
 *
 * @public 跨边界消费者：src/core/usecases/applyApiJobEvent.ts
 *   ⚠️ **为什么需要这行**：该消费者经 `state/subscriptions.ts:20,58` 间接调用（**TD-01-9 已接线**），
 *   但 knip 的 `--production` 分析看不到这条跨层引用 ⇒ 仍打 `@public` 防误判为死代码。
 *   详见 `parseSiteTimestamp` 的同一说明。
 */
export function formatClockTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * 本地时刻 `YYYY-MM-DD HH:mm`（原 `l0` shared.js:34180-34195）
 *
 * ⚠️ 空 / `0` / 非法 ⇒ `''`（源版先 `if (!e) return ''`，再 `isNaN(getTime())` 兜底）
 * ⚠️ **本地时区**（源版用 `new Date` 的本地 getter），与 `formatClockTime` 同法手写 `pad2`。
 */
export function formatDateTimeMinute(ms?: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 本地日期 `YYYY-MM-DD`（原 `_Component46.jsx:32-38` 的内联实现；
 * 与后端 `config-store.js` 的 `todayKey` **同形** —— API 用量按本地日期分桶）
 *
 * ⚠️ 非法时间 ⇒ 空串（调用方自己决定兜底；**不编一个"今天"**）
 */
export function formatLocalDate(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 本地时刻 `MM-DD HH:mm`（原 `YL.jsx:460-470` 的 `te`，文生视频历史版本条目用）
 *
 * ⚠️ 与 `formatDateTimeMinute`（`YYYY-MM-DD HH:mm`）**不同**：**不带年份** —— 源如此，逐字保留。
 * ⚠️ 空 / `0` / 非法 ⇒ `''`（源是 `try { ... } catch { return '' }`，本实现用 `NaN` 判定，等价）。
 * ⚠️ **本地时区**（源用 `new Date` 的本地 getter），手写 `pad2` 同 `formatClockTime`。
 */
export function formatMonthDayMinute(ms?: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ⚠️ 只用到「分钟」这一个毫秒基数：源是 `floor(diff/60000)` → `floor(minutes/60)`
//   → `floor(hours/24)`（**逐级取整**，不是各自除毫秒再取整 —— 两者在边界上不同）
const MINUTE = 60_000;

/**
 * 相对时间（原 `UP` 34366-34385）
 *
 * 五档（**逐字对齐**）：
 *   `< 1 分钟` ⇒ `刚刚` · `< 60 分钟` ⇒ `N 分钟前` · `< 24 小时` ⇒ `N 小时前`
 *   · `< 30 天` ⇒ `N 天前` · 否则 ⇒ **`YYYY-MM-DD`（本地时区）**
 * ⚠️ 各档都是 `Math.floor`（**向下取整**：59.9 分钟仍是「59 分钟前」）。
 * ⚠️ `ts` 在**未来**时差值为负 ⇒ 落进「刚刚」（源版如此，照抄）。
 * ⚠️ `now` **必须注入**（本文件是纯工具：不读 `Date.now()`）；文案走 `RELATIVE_TIME_TEXT`（原则 5）。
 */
export function formatRelativeTime(ts: number, now: number): string {
  const diff = now - ts;
  const minutes = Math.floor(diff / MINUTE);
  if (minutes < 1) return RELATIVE_TIME_TEXT.justNow;
  if (minutes < 60) return RELATIVE_TIME_TEXT.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return RELATIVE_TIME_TEXT.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return RELATIVE_TIME_TEXT.daysAgo(days);
  return formatLocalDate(ts);
}
