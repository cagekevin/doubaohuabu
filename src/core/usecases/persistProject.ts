/**
 * usecase · 持久化工程（**怎么存**）
 *
 * 依据：docs/11 §6.5 审计错位 6 的修正 —— 与 `state/persist`（**何时存**）职责分离
 *   - `state/persist`：订阅 + 防抖 600ms + `beforeunload`
 *   - 本文件：序列化 + 图片外置 + 写键 + 触发备份/快照
 *
 * ⚠️ 原则 1：**不写 store**，返回 `Result` 由 state 层处理
 * ⚠️ 原则 6：错误**原样透传**（`message` 来自异常原文，不美化）
 */

import type { Project } from '@/stable/model/project';
import type { StoragePort } from '@/core/ports/storage.port';
import type { OperationLogEvent } from '@/core/ports/host.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { LS_PROJECTS } from '@/stable/contracts/keys';
import { PROJECT_SIZE_WARN_BYTES } from '@/constants';
import { externalizeProjectImages } from '@/stable/migrations/imageExternalize';
import type { NormalizeContext } from '@/stable/migrations/types';

export interface PersistDeps {
  storage: StoragePort;
  /** 图片外置（同步，来自 `MediaPort.saveImageSync`） */
  migrationCtx: NormalizeContext;
  /**
   * 磁盘级备份（来自 `ProjectPort.saveBackup`）
   * ⚠️ 返 `Result` 而非 `void`（TD-04-2）—— 底层会失败，契约必须说出来
   */
  saveBackup?: (json: string) => Result<void>;
  /** 工程快照（仅当 storagePath 非空；返 `Result`，同上） */
  saveSnapshot?: (project: Project) => Result<void>;
  /** 操作日志（返 `Result`，同上） */
  logOperation?: (e: OperationLogEvent) => Result<void>;
}

export interface PersistInput {
  projects: Project[];
  activeId: string | null;
  /** 触发来源（写入操作日志） */
  reason?: string;
}

export interface PersistOk {
  /** 实际写入的字节数 */
  bytes: number;
  /** 是否超阈值（原实现 >20MB 打警告） */
  oversized: boolean;
  /** 被外置的工程数 */
  externalized: boolean;
  /**
   * ★ **副作用失败**（备份 / 快照 / 操作日志）—— 主保存已成功，但这些**失败了**
   *
   * ⚠️ 原则 6：**如实上报**，不静默（否则"备份没更新"用户永远不知道）
   * ⚠️ 每条的 `message` 都是**原始错误原文**
   */
  sideErrors: string[];
}

/**
 * 落盘（**同步** —— 由调用方决定何时调）
 *
 * 步骤（对齐原 `ss` 26156-26215）：
 *   1. 序列化前对 data 跑 `pp`（base64 → img://）
 *   2. `JSON.stringify`；失败 → 返回错误（**放弃保存**，不写半截数据）
 *   3. 超 20MB → 打警告
 *   4. 写 `doubao-projects` → 触发备份 + 快照
 */
export function persistProject(input: PersistInput, deps: PersistDeps): Result<PersistOk> {
  const { projects, activeId, reason = 'persist' } = input;

  // 1. 图片外置（幂等）—— `saveImage` 返 `Result` ⇒ **不需要在调用点加 try**
  const ext = externalizeProjectImages<Project>(projects, deps.migrationCtx);

  // 2. 序列化（失败则放弃保存 —— 不写半截数据）
  let json: string;
  try {
    json = JSON.stringify(ext.value);
  } catch (e) {
    return err('unknown', toMessage(e), e);
  }

  const bytes = json.length;
  const oversized = bytes > PROJECT_SIZE_WARN_BYTES;

  // 3. 写 localStorage（失败原样抛出）
  try {
    deps.storage.writeRaw(LS_PROJECTS, json);
  } catch (e) {
    return err('unknown', toMessage(e), e);
  }

  // 4. 备份 + 快照 + 日志
  //    ⚠️ 三者都**返 `Result`**（TD-04-2：契约声明会失败）⇒ **不需要在调用点加 `try`**。
  //    主保存已成功 ⇒ **不因副作用失败而回滚**，但**必须如实上报**（原则 6：不静默）
  const active = ext.value.find((p) => p.id === activeId);
  // ★ 外置失败（图片保持内联）**如实上报**（原则 6）
  const sideErrors: string[] = (ext.failures ?? []).map((m) => `图片外置失败：${m}`);

  const backup = deps.saveBackup?.(json);
  if (backup && !backup.ok) sideErrors.push(`备份失败：${backup.message}`);

  if (active?.storagePath) {
    const snap = deps.saveSnapshot?.(active);
    if (snap && !snap.ok) sideErrors.push(`快照失败：${snap.message}`);
  }

  const logged = deps.logOperation?.({
    at: deps.migrationCtx.now(),
    projectId: activeId ?? '',
    type: reason,
    detail: active
      ? {
          nodes: active.data.nodes.length,
          edges: active.data.edges.length,
          library: active.data.library.length,
        }
      : undefined,
  });
  if (logged && !logged.ok) sideErrors.push(`操作日志失败：${logged.message}`);

  return ok({ bytes, oversized, externalized: ext.changed, sideErrors });
}
