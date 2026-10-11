/**
 * StoragePort 实现（localStorage）
 * 依据：docs/11 §6.5 审计越权 3 的修正 —— **只管 localStorage**，磁盘快照归 HostPort.project
 *
 * 兼容性铁律（docs/08 W2，P0）：键名与值格式**冻结**，老用户数据必须能直接读。
 */

import type { StoragePort, StorageRead } from '@/core/ports/storage.port';
import type { LsKey } from '@/stable/contracts/keys';
import { toMessage } from '@/core/model/result';
import { log } from '@/lib/log';

export function createLocalStorage(): StoragePort {
  const ls = (): Storage => globalThis.localStorage;

  const writeRaw = (key: LsKey, raw: string): void => {
    // ⚠️ 写失败**不吞**：直接抛，由调用方转成 Result（原则 6：错误不可被掩盖）
    ls().setItem(key, raw);
  };

  return {
    read<T>(key: LsKey): StorageRead<T> {
      let raw: string | null;
      try {
        raw = ls().getItem(key);
      } catch (e) {
        // ★ TD-06-1：**存储不可用 ≠ 键不存在** —— 如实报（归一成 `null` 会被当成"没有"）
        const message = toMessage(e);
        log.warn('[storage] 读取失败:', { key, message });
        return { kind: 'corrupt', message };
      }
      if (raw === null) return { kind: 'missing' };
      try {
        return { kind: 'ok', value: JSON.parse(raw) as T };
      } catch (e) {
        // ★ TD-06-1：**数据损坏 ≠ 键不存在** —— 留痕（读者 = 开发者）+ 交调用方
        //   （`hydrate` 会把它记进 `corruptKeys`，`persist` 据此**跳过写回**，不覆盖可恢复的坏数据）
        const message = toMessage(e);
        log.warn('[storage] 数据损坏（JSON 解析失败）:', { key, message });
        return { kind: 'corrupt', message };
      }
    },

    writeRaw,

    write<T>(key: LsKey, value: T): void {
      writeRaw(key, JSON.stringify(value));
    },
  };
}
