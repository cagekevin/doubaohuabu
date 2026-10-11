/**
 * 授权控制器（★ 接线层）—— 把 `core/usecases/license` 接到 UI
 *
 * ★ **为什么需要它**（两笔债的交点）：
 *   · `core/usecases/license.ts` 落地已久，但**生产 0 消费**（`docs/DATAFLOW.md` §十二）；
 *   · 而 `ActivatePage` / `main.tsx` 当时**经 `usePorts()` 直调 `host.license.*`**，
 *     绕过 `state → usecases`（TD-16-8）。
 *   ⇒ 本控制器就是二者之间**缺的那一层**（不新建任何实现，只把既有用例接上）。
 *
 * ⚠️ **本控制器不写 store**（有意 —— 与 `ActivatePage` 原注释一致）：
 *   授权状态是**一次性页面数据**，不是要与画布共享的状态
 *   ⇒ 只返回 `Result`，由调用方（页面 / Root）自己持有。
 *   （注意：源注释只支持「不落 store」，**不支持**「ui 直调端口」—— 后者违反铁律 2。）
 *
 * ⚠️ 原则 6：`err` / `message` **原样转发** —— 不翻译、不改写、不重分类。
 *    业务的「非 ok 状态」（`used` / `tampered` / `invalid`）是**成功的 IPC**，
 *    走 `ok(...)` 并由 `gate.info.status` 表达（见 `usecases/license` 文件头）。
 */

import type { Ports } from '@/core/ports';
import type { Result } from '@/core/model/result';
import {
  activateLicense,
  checkLicense,
  exportMachineCode as runExportMachineCode,
  readMachineCode as runReadMachineCode,
  type LicenseGate,
} from '@/core/usecases/license';

export interface LicenseOpsController {
  /** 读本机机器码（原 `W3.jsx:16-19`） */
  readMachineCode(): Promise<Result<string>>;
  /** 授权状态（启动门 / 重新检测；原 `_Component48.jsx:105-137`）—— 业务状态在 `gate.info.status` */
  checkStatus(): Promise<Result<LicenseGate>>;
  /** 用激活码激活（原 `W3.jsx:64-105`）—— 非 ok 状态同样是 `ok(Result)` */
  activate(code: string): Promise<Result<LicenseGate>>;
  /** 导出机器码到文件（原 `W3.jsx:47-63`） */
  exportMachineCode(machineCode: string): Promise<Result<{ path?: string }>>;
}

export function createLicenseOps(ports: Ports): LicenseOpsController {
  // 端口**只在这里**被取一次 —— 控制器之外（ui）拿不到 `Ports`
  const deps = { license: ports.host.license };
  return {
    readMachineCode: () => runReadMachineCode(deps),
    checkStatus: () => checkLicense(deps),
    activate: (code) => activateLicense(deps, code),
    exportMachineCode: (machineCode) => runExportMachineCode(deps, machineCode),
  };
}
