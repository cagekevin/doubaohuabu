/**
 * 端口出口（core/ports）—— ★ 只有类型，零实现（§6.5 原则 3）
 *
 * ⚠️ 本目录下**不得**出现运行时实现
 *    （由 scripts/check-invariants.cjs 的「原则3/ports-type-only」强制）
 */

export type * from './host.port';
export type * from './site.port';
export type * from './storage.port';
export type * from './clock.port';
export type * from './backendPage.port';

/** 端口集合（由 bootstrap 组装后注入 usecases / state） */
import type { HostPort } from './host.port';
import type { SiteRegistry } from './site.port';
import type { StoragePort } from './storage.port';
import type { ClockPort } from './clock.port';
import type { BackendPagePort } from './backendPage.port';

export interface Ports {
  readonly host: HostPort;
  readonly sites: SiteRegistry;
  readonly storage: StoragePort;
  readonly clock: ClockPort;
  /**
   * ★ 账号后台页（`<webview>`）—— 原版是**组件间注册表**（`vr` + `_Component43` 的 `reloadAccount`）
   * 没有显式契约；本工程把它提成端口（`docs/16` §3.1 取舍 1）。
   */
  readonly backendPage: BackendPagePort;
}
