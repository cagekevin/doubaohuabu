/**
 * usecase · 项目存储（激活 / 选择路径 / 打开目录 / 占用统计）
 *
 * 依据（**逐行回源抄录**）：
 *   - 激活：`createProject` 29844-29859 · `openProject` 29887-29908 · `renameProject` 30077-30093
 *   - 选择路径：`_Component42.jsx:284-331`（`pickProjectStorage`）
 *   - 打开目录：`_Component42.jsx:332-345`（`revealProjectStorage`）
 *   - 占用统计：`_Component42.jsx:239-283`（`getProjectStorageSize`，**30s 轮询**在 UI 层）
 *
 * ⚠️ 原则 1：本文件**不写 store**，只返回 `Result`（`saveError` / toast 由 state 落）。
 * ⚠️ 原则 6：端口失败**原样转发** —— 源版在 `createProject`/`importProject` 里是
 *    `try{}catch{}` **静默吞掉**；重写改为把失败**交出去**（由调用方决定提示与否）。
 */

import type {
  ActivateProjectStoragePayload,
  AssetMigration,
  ProjectPort,
  StorageUsage,
} from '@/core/ports/host.port';
import type { Project } from '@/stable/model/project';
import { ok, type Result } from '@/core/model/result';
import { knownStoragePathsOf } from '@/core/rules/project';

export interface ProjectStorageDeps {
  project: Pick<ProjectPort, 'activateStorage' | 'pickStorage' | 'revealStorage' | 'getStorageSize'>;
}

/**
 * 组装 `activateStorage` 载荷（原版**四处重复**的组装收口，判据 C1）
 *
 * ⚠️ 与源逐字对齐：`storagePath` 用 `project.storagePath || ''`（**空串 = 应用默认目录**）。
 */
export function buildStoragePayload(
  project: Project,
  all: readonly Project[],
): ActivateProjectStoragePayload {
  return {
    projectId: project.id,
    projectName: project.name,
    storagePath: project.storagePath || '',
    knownStoragePaths: knownStoragePathsOf(all),
  };
}

/**
 * 激活项目存储目录（**同步** —— 底层 `sendSync`，保证 `img://` 首帧读对目录）
 *
 * ⚠️ 调用时机（源版）：新建工程 / 打开工程 / 重命名当前工程 / 导入工程。
 *    失败时源版的处理是**分场景**的：`openProject` 会提示并回退默认目录；
 *    其余三处静默 ⇒ 本用例**只上报**，由 state 按场景决定。
 */
export function activateProjectStorage(
  deps: ProjectStorageDeps,
  project: Project,
  all: readonly Project[],
): Result<{ path?: string }> {
  return deps.project.activateStorage(buildStoragePayload(project, all));
}

/** 选择保存路径的结果 */
export type PickStorageOutcome =
  | { kind: 'canceled' }
  | { kind: 'picked'; path: string; migrated: AssetMigration };

/**
 * 选择保存路径（原 `_Component42.jsx:284-331`）
 *
 * ⚠️ 载荷**必须带整个工程对象** —— 后端要靠它迁移资源 + 写快照
 *    （原版：`pickProjectStorage({projectId, projectName, storagePath, knownStoragePaths, project})`）。
 * ⚠️ 源版在调用前会 `flushPersist()`（把当前画布落盘再切目录）——
 *    那是 **state 的时序职责**（`docs/11` §6.5 审计错位 6），故不在此处做。
 */
export async function pickProjectStorage(
  deps: ProjectStorageDeps,
  project: Project,
  all: readonly Project[],
): Promise<Result<PickStorageOutcome>> {
  const res = await deps.project.pickStorage({ ...buildStoragePayload(project, all), project });
  if (!res.ok) return res;
  if (res.value.canceled) return ok({ kind: 'canceled' });
  // 后端成功时 `path` 必有（`{ok:true, path}`）；缺失即视为未选中（不编造路径）
  if (!res.value.path) return ok({ kind: 'canceled' });
  return ok({ kind: 'picked', path: res.value.path, migrated: res.value.migrated ?? {} });
}

/**
 * 在文件管理器里打开项目保存目录（原 `_Component42.jsx:332-345`）
 *
 * ⚠️ 源版失败时提示 `无法打开项目目录：${error || '路径不可用'}` —— 文案归 UI（M13）。
 */
export async function revealProjectStorage(
  deps: ProjectStorageDeps,
  storagePath: string,
): Promise<Result<{ path?: string }>> {
  return deps.project.revealStorage(storagePath);
}

/**
 * 统计目录占用（原 `_Component42.jsx:239-283`）
 *
 * ⚠️ 返回**原始计数**（`bytes/files/partial`）—— 体积格式化与「（仍在统计）」文案归 UI。
 * ⚠️ 源版**每 30s 轮询一次**；轮询是 UI 的 Effect 职责，不在用例里（原则 4 / E2）。
 */
export async function projectStorageUsage(
  deps: ProjectStorageDeps,
  storagePath: string,
): Promise<Result<StorageUsage>> {
  return deps.project.getStorageSize(storagePath);
}
