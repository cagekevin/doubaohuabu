/**
 * usecase · 导入工程（`.json`）
 *
 * 依据（**逐行回源抄录**）：原 `importProject` `shared.js:29993-30055`
 *   + 触发它的 UI `_Component47.jsx:28-42`（`loadFile` → `JSON.parse` → `importProject`）
 *
 * 编排链（原版顺序）：
 *   ① `loadFile`（用户取消 ⇒ 什么都不做）
 *   ② `JSON.parse`（失败 ⇒ 「项目文件解析失败」）
 *   ③ 取 `parsed.data || parsed` 作工程数据；`parsed.name` 作工程名
 *   ④ **激活项目级存储目录**（`activateProjectStorage`）
 *   ⑤ 合并文件里的 `presets`（按 `id` 判重）
 *   ⑥ 组工程对象返回 —— **由 state 写入 store**（原则 1）
 *
 * ⚠️ 原则 1：本文件**不写 store**，只返回 `Result`。
 * ⚠️ 原则 4：时间经 `ClockPort`（源的 `Date.now()` 全部改为注入）。
 * ⚠️ 原则 6：**两处「源版吞错」改为如实上报** ——
 *    · `JSON.parse` 失败：`message` = 源版给用户看的原文（`PROJECT_TEXT.parseFailed`），
 *      **原始异常留在 `cause`**（不丢信息）
 *    · `activateProjectStorage` 失败：源版是 `try{}catch{}` **静默**；本实现返回 `storageError`
 *      由 state 决定是否提示（原版 `openProject` 就会提示 ⇒ 那才是它的**真实意图**）
 */

import type { ClockPort } from '@/core/ports/clock.port';
import type { ActivateProjectStoragePayload, FilePort, ProjectPort } from '@/core/ports/host.port';
import type { Preset, Project } from '@/stable/model/project';
import { err, ok, type Result } from '@/core/model/result';
import {
  createProject,
  mergeImportedPresets,
  readImportedProjectData,
  readImportedProjectName,
} from '@/core/rules/project';
import { PROJECT_TEXT } from '@/constants/text';
import { isRecord } from '@/lib/object';

export interface ImportProjectDeps {
  file: Pick<FilePort, 'loadFile'>;
  project: Pick<ProjectPort, 'activateStorage'>;
  clock: ClockPort;
}

export interface ImportProjectInput {
  /**
   * 已有预设（用于按 `id` 判重合并）
   * ⚠️ 由 **state** 传入 —— 用例**不读 store**（原则 1）
   */
  existingPresets: readonly Preset[];
  /** 已有工程的存储路径（原版 `knownStoragePaths`；调用方**已过滤掉空值**） */
  knownStoragePaths: readonly { path: string; name: string }[];
  /** 同毫秒内的自增序号（与 `createProject` 同源，由 state 的计数器提供） */
  seq: number;
}

export type ImportProjectOutcome =
  | { kind: 'canceled' }
  | {
      kind: 'imported';
      /** 新工程（**尚未入 store**） */
      project: Project;
      /** 本次并入的预设（空数组 = 无新增） */
      addedPresets: Preset[];
      /**
       * 项目存储目录激活失败的原因（**原始 message**）
       * ⚠️ 非 null 表示「已回退到应用默认存储」—— 由 state 提示，**不阻断导入**
       */
      storageError: string | null;
    };

export async function importProject(
  deps: ImportProjectDeps,
  input: ImportProjectInput,
): Promise<Result<ImportProjectOutcome>> {
  // ① 取文件
  const loaded = await deps.file.loadFile();
  if (!loaded.ok) return loaded;
  if (loaded.value === null) return ok({ kind: 'canceled' });

  // ② 解析（源：`JSON.parse(m)` 抛错 ⇒ `alert('项目文件解析失败')`）
  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.value.content);
  } catch (e) {
    // ★ message 用**源版给用户看的原文**；原始异常进 cause（原则 6：不丢原文）
    return err('unknown', PROJECT_TEXT.parseFailed, e);
  }

  // ③ 源：`const v = w.data || w`（顶层就是工程数据时直接用顶层）
  const source = isRecord(parsed) && parsed.data ? parsed.data : parsed;
  // 源：`v.nodes` 直接取用 ⇒ 非对象会在源版抛异常并落到同一句「解析失败」提示
  if (!isRecord(source)) return err('unknown', PROJECT_TEXT.parseFailed, parsed);

  const now = deps.clock.now();
  const project = createProject({
    now,
    seq: input.seq,
    // 源：`w.name || '导入的项目'` —— 名字取自**顶层**对象
    name: readImportedProjectName(isRecord(parsed) ? parsed : {}),
    data: readImportedProjectData(source),
  });

  // ⑤ 合并预设（源：只并入 id 不存在的新项）
  const addedPresets = mergeImportedPresets(input.existingPresets, source.presets);

  // ④ 激活项目级存储（★ sendSync；源版这里 `try{}catch{}` 吞掉 ⇒ 本实现如实上报）
  const payload: ActivateProjectStoragePayload = {
    projectId: project.id,
    projectName: project.name,
    // 源：导入时 storagePath 恒为空串（用应用默认目录）
    storagePath: '',
    knownStoragePaths: [...input.knownStoragePaths],
  };
  const activated = deps.project.activateStorage(payload);
  const storageError = activated.ok ? null : activated.message;

  return ok({ kind: 'imported', project, addedPresets, storageError });
}
