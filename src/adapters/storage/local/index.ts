/**
 * StoragePort 实现（localStorage）
 * 依据：docs/11 §6.5 审计越权 3 的修正 —— **只管 localStorage**，磁盘快照归 HostPort.project
 *
 * 兼容性铁律（docs/08 W2，P0）：键名与值格式**冻结**，老用户数据必须能直接读。
 */

import type { StoragePort } from '@/core/ports/storage.port';
import type { LsKey } from '@/stable/contracts/keys';

export function createLocalStorage(): StoragePort {
  const ls = (): Storage => globalThis.localStorage;

  const readRaw = (key: LsKey): string | null => {
    try {
      return ls().getItem(key);
    } catch {
      // 读取失败（隐私模式等）视为「不存在」；不编造错误，返回 null 由调用方决策
      return null;
    }
  };

  const writeRaw = (key: LsKey, raw: string): void => {
    // ⚠️ 写失败**不吞**：直接抛，由调用方转成 Result（原则 6：错误不可被掩盖）
    ls().setItem(key, raw);
  };

  return {
    readRaw,

    read<T>(key: LsKey): T | null {
      const raw = readRaw(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // 解析失败 = 数据损坏；返回 null 让调用方走「当作没有」的分支（迁移会重建）
        return null;
      }
    },

    writeRaw,

    write<T>(key: LsKey, value: T): void {
      writeRaw(key, JSON.stringify(value));
    },

    remove(key: LsKey): void {
      ls().removeItem(key);
    },

    has(key: LsKey): boolean {
      return ls().getItem(key) !== null;
    },
  };
}
