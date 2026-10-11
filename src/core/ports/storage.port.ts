/**
 * StoragePort —— 持久化（★ 职责收窄：**只管 localStorage**）
 *
 * 依据：docs/11 §6.5 审计越权 3 的修正
 *   —— 原文档写「20 键 + 磁盘快照」是**越权**：磁盘快照是 `HostPort.project.saveSnapshot` 的能力。
 *   本端口只负责 localStorage。
 */

import type { LsKey } from '@/stable/contracts/keys';

/**
 * 读结果（★ **判别联合 —— 三态**；TD-06-1）
 *
 * ⚠️ **为什么不能归成 `T | null`**：「键不存在」（本来就没有）与「有数据但读不出来」
 *    （JSON 解析失败 = **数据损坏** ／ `getItem` 抛 = 存储不可用）是**两件事**。
 *    归一成 `null` ⇒ 调用方会把坏数据当"没有" ⇒ 下一次写盘就**把可恢复的坏数据覆盖掉**（真丢数据）。
 */
export type StorageRead<T> =
  /** 键**不存在**（正常态） */
  | { kind: 'missing' }
  /** 有值且**解析成功** */
  | { kind: 'ok'; value: T }
  /** ★ **有数据但读不出来**（损坏 / 不可用）—— 调用方必须**区别于 `missing`** 处理 */
  | { kind: 'corrupt'; message: string };

/**
 * 存储端口 —— ★ **2026-10-11 精简（`TD-06-2`）**：删掉 `readRaw` / `remove` / `has`
 *
 * 依据（**回源**）：原版对 `localStorage` 的用法只有 **`getItem`(19) + `setItem`(17)**，
 * **`removeItem` 0 次、`clear` 0 次** ⇒ 原版**从不删键** ⇒ `remove` 无对应；
 * `has`（存在性）已被 `read` 的三态 `missing` **覆盖**；`readRaw`（读原文）不在原版词汇里
 * （原版读的就是 `getItem` 后 `JSON.parse`，= 本端口的 `read`）。
 * ⚠️ 三者在全仓**0 生产消费**（判据 B5：不留"落了但没人调"）⇒ **删掉**；将来真需要再加回（成本极低）。
 */
export interface StoragePort {
  /** 读（**三态**：`missing` / `ok` / `corrupt` —— **不抛**） */
  read<T>(key: LsKey): StorageRead<T>;
  /** 写（失败时由实现抛出，由调用方转 Result） */
  write<T>(key: LsKey, value: T): void;
  /** 写原始字符串 */
  writeRaw(key: LsKey, raw: string): void;
}
