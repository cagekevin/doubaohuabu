/**
 * usecase · 授权（启动校验 / 激活 / 机器码导出）
 *
 * 依据（**逐行回源抄录**）：
 *   - 启动校验：`_Component48.jsx:105-145`（`getLicenseStatus` → `status !== 'ok'` ⇒ 激活页）
 *   - 激活页：`W3.jsx`（机器码 / 复制 / 导出 / 提交激活码 / 4 种结果分支）
 *   - 后端契约：`electron/license.js:602-712`
 *
 * ⚠️ **fail-close**：`allowed` 只有 `status === 'ok'` 才为 `true`
 *    （判据 N4：拿不到授权**不得**进画布）。判定真源在 `core/rules/license.ts`。
 * ⚠️ 原则 1：本文件**不写 store**（`state/slices/global` 的 `license` 字段由 state 落）。
 * ⚠️ 原则 6：`err` **只**表示「传输/后端异常」；**业务失败**（`used` / `tampered` /
 *    `invalid`）是**成功的 IPC**，走 `ok(...)` 并由 `info.status` 表达 —— 不混为一谈。
 */

import type { LicensePort } from '@/core/ports/host.port';
import type { LicenseStatus } from '@/core/model/license';
import { ok, type Result } from '@/core/model/result';
import { isLicenseUsable } from '@/core/rules/license';

export interface LicenseDeps {
  license: Pick<
    LicensePort,
    'getStatus' | 'activateWithCode' | 'exportMachineCode' | 'getMachineCode'
  >;
}

/** 授权闸门（启动链的判据） */
export interface LicenseGate {
  info: LicenseStatus;
  /** ★ 是否放行进画布（fail-close） */
  allowed: boolean;
}

const gateOf = (info: LicenseStatus): LicenseGate => ({ info, allowed: isLicenseUsable(info.status) });

/**
 * 启动校验（原 `_Component48.jsx:105-137`）
 *
 * ⚠️ 源版失败时**丢弃后端原因**、统一显示 `授权状态获取失败`（`LICENSE_TEXT.fetchFailed`）
 *    ⇒ 本用例**转发原始 message**（原则 6），由 state 决定显示哪一句
 *    （state 按源版显示 SSOT 文案，原文留在 `Result` 里可供诊断）。
 * ⚠️ 源版**每 60s 轮询一次**；轮询是 state/UI 的 Effect 职责，不在用例里。
 */
export async function checkLicense(deps: LicenseDeps): Promise<Result<LicenseGate>> {
  const res = await deps.license.getStatus();
  if (!res.ok) return res;
  return ok(gateOf(res.value));
}

/**
 * 用激活码激活（原 `W3.jsx:64-105`）
 *
 * ⚠️ **业务失败也是 `ok(...)`**（见文件头）：
 *    · `status: 'tampered'` ⇒ UI 显示「检测到系统时间异常（`tamperReason`）」
 *    · `status: 'used'` ⇒ UI 显示「激活码已被使用」
 *    · 其余非 `ok` ⇒ UI 显示「激活失败：`error`」
 *    ⇒ 三个字段（`status` / `tamperReason` / `error`）**必须原样带出去**，UI 才能分支。
 */
export async function activateLicense(deps: LicenseDeps, code: string): Promise<Result<LicenseGate>> {
  const res = await deps.license.activateWithCode(code);
  if (!res.ok) return res;
  return ok(gateOf(res.value));
}

/**
 * 读本机机器码（原 `W3.jsx:16-19` 的 `window.api.getMachineCode()`）
 *
 * ⚠️ 后端返回的是 `{ok:true, machineCode}`（**不是**裸字符串）——
 *    字段名对齐由适配器负责（原实现读错了 `code`，见 `session.ts` 的注释）。
 */
export async function readMachineCode(deps: LicenseDeps): Promise<Result<string>> {
  return deps.license.getMachineCode();
}

/**
 * 导出机器码到文件（原 `W3.jsx:47-63`）
 *
 * ⚠️ 源版失败时显示 `(S?.error) || '导出已取消'` —— 后端把**取消**也当成 `ok:false`
 *    ⇒ 适配器已把该文案作为兜底（`LICENSE_TEXT.exportCanceled`），此处**原样转发**。
 */
export async function exportMachineCode(
  deps: LicenseDeps,
  machineCode: string,
): Promise<Result<{ path?: string }>> {
  return deps.license.exportMachineCode(machineCode);
}
