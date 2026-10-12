/**
 * 工程操作控制器（★ 装配层）—— 把「工程」这族用例接到 UI
 *
 * | 能力 | 用例 | 原入口 |
 * |---|---|---|
 * | **导入工程（.json）** | `core/usecases/importProject` | `_Component47.jsx:28-42`（启动页） |
 * | **设置保存路径** | `core/usecases/projectStorage.pickProjectStorage` | `_Component42.jsx:284-331`（顶栏） |
 * | **打开项目保存目录** | `core/usecases/projectStorage.revealProjectStorage` | `_Component42.jsx:332-345` |
 * | **占用空间统计** | `core/usecases/projectStorage.projectStorageUsage` | `_Component42.jsx:239-283` |
 *
 * ★ **为什么需要它**：这些用例**落地已久**（部分还有单测），但**生产 0 消费**；对应的
 *   `HostPort.file.loadFile` / `HostPort.project.pickStorage·revealStorage·getStorageSize`
 *   也**全都未用** ⇒ 功能链**断在最后一段**（`docs/过程.md` §1.1 / §2）。本控制器就是**缺的那一层**。
 *
 * ⚠️ **本控制器不写 store**（原则 1）：读盘 / 写盘时序在此，**状态写入只经 store 的 action**。
 * ⚠️ 原则 6：失败 `message` **原样透传**（含 `storageError` —— 源版那里是 `try{}catch{}` 静默）。
 * ⚠️ 与 `licenseOps` / `hostOps` 同法：**端口只在这里取一次**，`ui` 拿不到 `Ports`。
 */

import type { Ports, StorageUsage } from '@/core/ports';
import type { AppStore } from './store';
import { importProject as runImportProject } from '@/core/usecases/importProject';
import {
  pickProjectStorage,
  projectStorageUsage,
  revealProjectStorage,
} from '@/core/usecases/projectStorage';
import { knownStoragePathsOf } from '@/core/rules/project';
import { PROJECT_STORAGE_TEXT } from '@/constants/text';

export interface ProjectOpsController {
  /**
   * 导入工程（`.json`）—— 原 `importProject` `shared.js:29993`，UI 入口 `_Component47.jsx:28-42`
   *
   * @returns `true` = 已导入并**切到新工程**；`false` = 用户取消 / 失败（失败已上报到错误横幅）
   */
  importProjectFile(): Promise<boolean>;

  /**
   * **设置当前工程的保存路径**（原 `_Component42.jsx` 的 `zt`）
   *
   * ⚠️ 源版**先 `flushPersist()`** 把当前画布落盘，再切目录 —— 那是 **state 的时序职责**
   *    （用例文件头点明，故不在 usecase 里做）。
   * ⚠️ 源版成功时 toast 用 `'success'` 档；本仓 toast level 只有 `info`/`warn`/`error`
   *    ⇒ 用 `info`（**文案与时长逐字保留**，只有 level 是有意差异）。
   */
  pickStorage(): Promise<void>;

  /** **在文件管理器里打开项目保存目录**（原 `Rt`）—— 无路径 / 失败都**不静默**（失败有 toast） */
  revealStorage(): Promise<void>;

  /**
   * **统计目录占用**（原 `getProjectStorageSize`）
   *
   * ⚠️ 源版**每 30s 轮询**由 UI 的 effect 负责（本控制器只提供一次读数）。
   * @returns 取不到（端口失败）⇒ `null`（UI 显示「占用 —」）
   */
  storageUsage(path: string): Promise<StorageUsage | null>;
}

/** `createProjectOps` 需要的注入（时序 / 落盘 —— `state` 自己不持 `PersistController`） */
export interface ProjectOpsDeps {
  /** 立即落盘（`PersistController.flush`）—— 选保存路径前必须先落盘（源版 `flushPersist()`） */
  flush: () => void;
}

export function createProjectOps(
  store: AppStore,
  ports: Ports,
  deps: ProjectOpsDeps,
): ProjectOpsController {
  /**
   * 同毫秒内的**导入**自增序号
   *
   * ⚠️ 用例的 `seq` 与 `createProject` 同源（`makeProjectId = p_<base36 时间>_<seq>`）——
   *    由 state 侧计数器提供。本控制器持有**导入专用**计数器：与 slice 的 `createProject`
   *    计数器各管各的 ⇒ 只有在「同一毫秒内又新建又导入」时才会撞 id
   *    （不现实：导入要过文件对话框）。见 TD-16-70。
   */
  let importSeq = 0;

  /** 当前工程（找不到 ⇒ `null`） */
  const activeProject = () => {
    const s = store.useStore.getState();
    return s.projects.find((p) => p.id === s.activeId) ?? null;
  };

  return {
    importProjectFile: async () => {
      const s = store.useStore.getState();
      const r = await runImportProject(
        // 端口只在这里取一次
        { file: ports.host.file, project: ports.host.project, clock: ports.clock },
        {
          // ★ 2026-10-11 接通（清偿 TD-16-69）：`presets` 已落 store
          //   ⇒ 判重基线用**真实已有预设**，并入结果也**真的写回**（源版 30025-30040 同法）
          existingPresets: s.presets,
          knownStoragePaths: knownStoragePathsOf(s.projects),
          seq: ++importSeq,
        },
      );

      if (!r.ok) {
        // 原则 6：原样上报（含 JSON.parse 失败 ⇒ 源版「项目文件解析失败」原文）
        s.pushBackendError('unknown', r.message);
        return false;
      }
      if (r.value.kind === 'canceled') return false;

      // ★ 由 state 写入（原则 1）—— 原子地：插入 + 切过去 + 灌画布
      s.addImportedProject(r.value.project);

      // ★ 并入的预设写回（源 30034-30040：`[...t().presets, ...d]` + `wo(f)`）
      //   ⚠️ 用**新读一次**的 state：`s` 是本方法开头的快照（源也是现取 `t()`）
      if (r.value.addedPresets.length > 0) {
        const cur = store.useStore.getState();
        cur.setPresets([...cur.presets, ...r.value.addedPresets]);
      }

      if (r.value.storageError) {
        // ★ 源版在 `activateProjectStorage` 处 `try{}catch{}` **静默**；用例把它如实带出
        //   ⇒ 由本处提示（原版 `openProject` 对同一失败**会**提示 ⇒ 那才是它的真实意图）
        s.pushBackendError('unknown', r.value.storageError);
      }
      return true;
    },

    pickStorage: async () => {
      const s = store.useStore.getState();
      const project = s.projects.find((p) => p.id === s.activeId);
      if (!project) return;
      deps.flush(); // 源版 `flushPersist()`：先落盘当前画布，再切目录
      const r = await pickProjectStorage({ project: ports.host.project }, project, s.projects);
      if (!r.ok) {
        s.pushToast(PROJECT_STORAGE_TEXT.storageSetFailed(r.message), 5000, 'error');
        return;
      }
      if (r.value.kind === 'canceled') return;
      // ★ 路径写回由 store action 做（原则 1）
      s.setProjectStoragePath(r.value.path);
      const m = r.value.migrated;
      const suffix =
        m.images || m.videos ? PROJECT_STORAGE_TEXT.storageMigrated(m.images ?? 0, m.videos ?? 0) : '';
      s.pushToast(PROJECT_STORAGE_TEXT.storageSetToast(suffix), 4200, 'info');
    },

    revealStorage: async () => {
      const path = activeProject()?.storagePath;
      if (!path) return;
      const r = await revealProjectStorage({ project: ports.host.project }, path);
      if (!r.ok) {
        store.useStore.getState().pushToast(PROJECT_STORAGE_TEXT.storageRevealFailed(r.message), 4200, 'error');
      }
    },

    storageUsage: async (path) => {
      const r = await projectStorageUsage({ project: ports.host.project }, path);
      return r.ok ? r.value : null;
    },
  };
}
