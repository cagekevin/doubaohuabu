/**
 * 授权状态模型（★ 冻结形状 —— 来自后端 `electron/license.js`）
 *
 * 依据（**逐行回源抄录**）：
 *   - `electron/license.js:602-650`（`checkLicenseStatus` 的返回）
 *   - `electron/license.js:652-712`（`activateWithCode` 的返回）
 *   - `W3.jsx`（激活页对每个状态的文案分支）
 *   - `_Component48.jsx:105-145`（启动校验 → 激活页 / 进画布）
 *
 * ⚠️ **SSOT**：状态字面量**只在本文件**声明。
 *    `core/ports/host.port.ts` 的 `LicenseStatus` 与 `core/rules/license.ts`
 *    的放行判定都引用它 —— 避免「同一联合两份表达式」（改一处漏一处）。
 */

/**
 * 授权状态（后端 `license.js` 实际会给出的取值）
 *
 * ⚠️ `used` 是**激活**独有的状态（`license.js:698`：激活码已被使用）——
 *    ⚠️ `used` **必须**在联合里（否则被静默当成未知值）。
 */
export const LICENSE_STATUSES = ['ok', 'none', 'invalid', 'expired', 'tampered', 'used'] as const;
export type LicenseStatusKind = (typeof LICENSE_STATUSES)[number];

/** 状态白名单（`Set` 查表：免 `as`、语义直白） */
const LICENSE_STATUS_SET: ReadonlySet<string> = new Set(LICENSE_STATUSES);

/**
 * 是不是合法授权状态（**类型谓词** —— 收窄由类型系统完成，不用 `as`）
 * ⚠️ 与 `LICENSE_STATUSES` 同源（同文件），是「状态白名单」的唯一判定入口。
 *    宿主边界（`adapters/host/electron/session.ts`）靠它把**不可信的后端字符串**收窄。
 */
export const isLicenseStatusKind = (v: unknown): v is LicenseStatusKind =>
  typeof v === 'string' && LICENSE_STATUS_SET.has(v);

/**
 * 授权状态载荷（`getLicenseStatus` 与 `activateWithCode` 的**同一形状**）
 *
 * ⚠️ 后端两个接口都带 `ok` 标志，且**逐行核对后 `ok === (status === 'ok')`**
 *    （`license.js:656/662/691/698/712`）⇒ 本工程**只用 `status`**，
 *    把 `ok` 折叠进 `Result`（原则 6：传输成功与业务成功分开表达）。
 *
 * ⚠️ 失败原因有**三个不同字段**，不可合并（来源不同）：
 *    · `reason` —— `invalid`（授权文件异常 / 校验失败，`license.js:612/618`）
 *    · `tamperReason` —— `tampered`（如 `clock_rollback`，`license.js:670`）
 *    · `error` —— **激活**失败的后端原文（`license.js:662/698`）
 */
export interface LicenseStatus {
  status: LicenseStatusKind;
  /** 本机机器码（两个接口都会带） */
  machineCode?: string;
  /** 到期时间（ms）；「永久」用极大值表达（原 `H3` 的 `>= 100 年` 判据） */
  expireAt?: number;
  /** 激活时间（ms） */
  activatedAt?: number;
  /** `invalid` 的原因（原文） */
  reason?: string;
  /** `tampered` 的原因（原文，如 `clock_rollback`） */
  tamperReason?: string;
  /** 激活失败的后端原文 */
  error?: string;
}
