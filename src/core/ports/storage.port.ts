/**
 * StoragePort —— 持久化（★ 职责收窄：**只管 localStorage**）
 *
 * 依据：docs/11 §6.5 审计越权 3 的修正
 *   —— 原文档写「20 键 + 磁盘快照」是**越权**：磁盘快照是 `HostPort.project.saveSnapshot` 的能力。
 *   本端口只负责 localStorage。
 */

import type { LsKey } from '@/stable/contracts/keys';

export interface StoragePort {
  /** 读（解析失败返回 null，不抛） */
  read<T>(key: LsKey): T | null;
  /** 读原始字符串（迁移时需要判断"是否写入过"） */
  readRaw(key: LsKey): string | null;
  /** 写（失败时由实现抛出，由调用方转 Result） */
  write<T>(key: LsKey, value: T): void;
  /** 写原始字符串 */
  writeRaw(key: LsKey, raw: string): void;
  /** 删除 */
  remove(key: LsKey): void;
  /** 该键是否已存在 */
  has(key: LsKey): boolean;
}
