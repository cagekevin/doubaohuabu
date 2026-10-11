/**
 * 日志唯一入口（**开发者侧**留痕）—— ★ **SSOT：全仓 `console` 只许在本文件出现**
 *
 * 依据（`docs/11` §六·五 **原则 6** 错误透传）：
 *   · **用户侧**可见性 → 判别联合 `{ok:false, reason, message}` ＋ 错误横幅/toast
 *     （`state/slices/ui` → `ui/common/ErrorBanner|ToastHost`，见 `docs/11` §八 机制表）；
 *   · **开发者侧**可见性 → **本文件**（唯一出口）。
 *
 * ★ **它为什么叫 `log` 而不叫 `logger`**：本文件是**基础唯一入口**（`warn` / `error` / `info` + 级别开关）——
 *   「logger」指带**上报 / 脱敏 / 结构化字段**的那套，本仓**没有**；要加先在本文件落统一入口。
 *
 * ★ **开关**（`TD-16-108`，2026-10-11 补）：级别由 **`lib/env.ts` 的 `IS_DEV`** 定默认 ——
 *   · 开发 / 测试：`info`（**三档全放行 ⇒ 与"加开关之前"逐字相同，零行为变化**）；
 *   · 生产构建：`warn`（**`info` 不再进控制台** —— 这是"开关"的**本意**；`warn`/`error`
 *     是与用户可见性配套的开发者线索，**不静默**）。
 *   可用 `log.setLevel` 运行期改（以后接 UI 设置项），`log.resetLevel()` 回默认。
 *
 * ★ **格式约定**：前缀 `[模块名]` **由调用方给**（`log.warn('[chime] 播放失败:', e)`）——
 *   把 scope 参数化会**改变现有控制台输出**（属行为变化），留到"散写点统一迁移"那批一次做。
 *
 * ⚠️ **模块级可变状态**（`vite.config.ts` test 段的前提"生产代码不得有跨文件共享的模块级可变状态"）：
 *   本文件的 `level` **是**这类状态 ⇒ 已在 `vite.config.ts` 的**例外清单**登记，
 *   且 `src/lib/tests/log.test.ts` 每个用例后 `log.resetLevel()`（`isolate: false` 下必须复位）。
 *
 * ⚠️ 归属 `lib`（L0 无状态工具）：**所有层**都能 import（`lib` 自己不得依赖上层即可），
 *   与同层就地留痕的 `lib/chime.ts` 同类。
 * ⚠️ **收口**（2026-10-11 完成）：全仓散写 `console.*` 已迁到本文件 ——
 *   全仓 `console.*` 只在本文件出现（`TD-16-108`，见 `daily/架构日志/16-跨区-可观测性唯一入口-2026-10-11.md`）。
 */

import { IS_DEV } from './env';

/** 级别（**由低到高** —— 数字越大越啰嗦；`silent` 关闭全部） */
export const LOG_LEVELS = ['silent', 'error', 'warn', 'info'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const RANK: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3 };

/** 默认级别：开发/测试全开（与迁移前一致）；生产只留 `warn`/`error` */
const DEFAULT_LEVEL: LogLevel = IS_DEV ? 'info' : 'warn';

/** ⚠️ 进程级闩（见文件头「模块级可变状态」段） */
let level: LogLevel = DEFAULT_LEVEL;

/** 运行期改级别（以后接 UI 设置项；取非法值**不动**） */
export function setLogLevel(next: LogLevel): void {
  if (RANK[next] === undefined) return;
  level = next;
}

/** 当前级别 */
export function getLogLevel(): LogLevel {
  return level;
}

/** 回默认级别（**测试必须调** —— `vite.config.ts` 开了 `isolate: false`） */
export function resetLogLevel(): void {
  level = DEFAULT_LEVEL;
}

const allows = (l: Exclude<LogLevel, 'silent'>): boolean => RANK[level] >= RANK[l];

/** 常规诊断（warn 级）—— 逐字转发 `console.warn` */
function warn(...args: unknown[]): void {
  if (allows('warn')) console.warn(...args);
}

/** 错误（error 级）—— 逐字转发 `console.error` */
function error(...args: unknown[]): void {
  if (allows('error')) console.error(...args);
}

/** 信息（info 级）—— 逐字转发 `console.info` */
function info(...args: unknown[]): void {
  if (allows('info')) console.info(...args);
}

/**
 * 日志唯一入口
 *
 * ⚠️ **禁止**在别处直写 `console.*` —— 那是绕过唯一入口（SSOT 第二份）。
 */
export const log = {
  warn,
  error,
  info,
  /** 运行期级别（见文件头「开关」段） */
  setLevel: setLogLevel,
  getLevel: getLogLevel,
  /** 复位（测试清理 / 设置项复位） */
  resetLevel: resetLogLevel,
  LEVELS: LOG_LEVELS,
} as const;
