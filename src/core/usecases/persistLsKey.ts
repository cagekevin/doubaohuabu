/**
 * usecase · 持久化**单个 localStorage 键**（**怎么存**）
 *
 * ★★ **为什么把它抽出来（判据 C1）**：本文件的前身是 `persistGalleries`（专给画廊一个键）。
 *   加 `scanHistory` 时它变成**第二次** ⇒ 按"三振出局"的判据，**第二个就该抽**，而不是
 *   复制一份改个键名（那样两份的错误处理/日志迟早漂）。
 *
 * ⚠️ 与 `persistProject` / `persistAccounts` **同模式**（职责分离，`docs/11` §6.5 审计错位 6）：
 *   - `state/persist`：**何时存**（订阅 + 防抖 600ms + `beforeunload`）
 *   - 本文件：**怎么存**（用哪条写路径、错误怎么表达）
 *
 * ⚠️ 用 **`storage.write(键, 值)`** —— ⛔ **不能** import `state/persistKeys` 的 `PERSIST`：
 *   那会让 `core` **反向依赖 `state`**（`depcruise` 的 `core-no-upward` 拦下过一次）。
 *   键名从 `stable/contracts/keys` 取 ⇒ 与 `hydrate` 的读**仍是同一个常量、同一个键**。
 *
 * ⚠️ 原则 1：**不写 store**，返回 `Result` 由 state 层处理。
 * ⚠️ 原则 6：错误 `message` **原样透传**（不改写、不加前缀）；`cause` 里放**是哪个键**
 *   （与 `persistAccounts` 同法：`localStorage` 没有事务，出问题时要能定位到键）。
 */

import type { StoragePort } from '@/core/ports/storage.port';
import type { LsKey } from '@/stable/contracts/keys';
// ⚠️ `LsValue` 住在 `lsValues`（键 → 值形状那张表），`LsKey` 住在 `keys`
import type { LsValue } from '@/stable/contracts/lsValues';
import { err, ok, toMessage, type Result } from '@/core/model/result';

/** 落盘依赖 */
export interface LsKeyPersistDeps {
  storage: StoragePort;
}

/**
 * 写一个键
 *
 * @param key 键名（从 `stable/contracts/keys` 取，**不内联字面量**）
 * @param value 与键配套的值（类型由 `LsValueMap` 保证）
 */
export function persistLsKey<K extends LsKey>(
  key: K,
  value: LsValue<K>,
  deps: LsKeyPersistDeps,
): Result<{ written: number }> {
  try {
    deps.storage.write(key, value);
    return ok({ written: 1 });
  } catch (e) {
    // ★ 原样透传（原则 6）；`kind` 用 `unknown`（落盘失败不属于业务分类的任何一档）
    return err('unknown', toMessage(e), { key, error: e });
  }
}
