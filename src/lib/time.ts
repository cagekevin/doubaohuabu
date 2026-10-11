/**
 * 时间工具（无状态 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：`pR` shared.js:35735-35757 —— 站点时间戳 → 毫秒
 *
 * ⚠️ 为什么放 `lib/`（判据 A1）：它是**纯解析**（不读时钟、无副作用）⇒ 无状态工具。
 *    放 `core/rules` 也能跑，但 `lib` 更贴"通用工具"的归属，且避免 `core` 里出现 `new Date`。
 */

/** 秒/毫秒的分界（原实现写死 `1000000000000`）：小于它按**秒**处理 */
const SECOND_CUTOFF = 1000000000000;

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
 *   ⚠️ **为什么需要这行**（2026-10-11）：消费者 `core/rules/media.ts` 自己**尚未接线**
 *   （它在死代码基线里）⇒ knip 看不到这条引用，会把本导出报成"新增死代码"。
 *   本文件此前**整个**在基线里（文件级条目）；`ui/panels/GalleryLightbox.tsx` 开始用
 *   `formatDateTimeMinute` 后文件变成可达 ⇒ 文件级条目消失、这两个导出被暴露出来。
 *   ⇒ 它们**不是死代码**（有真实消费者 + 单测），按闸的正道打 `@public` 而非删。
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

const pad2 = (n: number): string => String(n).padStart(2, '0');

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
 *   ⚠️ **为什么需要这行**：消费者 `core/usecases/applyApiJobEvent.ts` 自己**尚未接线**
 *   （它在死代码基线里，见 `state/subscriptions.ts` 的"待接线"清单）⇒ knip 看不到这条引用。
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
