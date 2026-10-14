/**
 * ProjectPort 的 Electron 实现（磁盘侧）
 *
 * ⚠️ **`activateProjectStorage` 是 `sendSync`** —— **同步**返回 `{path}`，
 *    不得 `await`（docs/过程.md + W1）。它是 `img://` 首帧能读对目录的前提。
 *
 * ⚠️ `saveProjectsBackup` / `saveProjectSnapshot` / `logProjectOperation` 是 `send`（**无返回**）
 *    ⇒ 签名是 `void`，不是 `Promise`
 */

import type {
  ActivateProjectStoragePayload,
  AssetMigration,
  OperationLogEvent,
  PickStoragePayload,
  ProjectPort,
} from '@/core/ports/host.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import type { Project } from '@/stable/model/project';
import { PROJECT_TEXT } from '@/constants/text';
import { isRecord } from '@/lib/object';
import { getHostApi, checkOk, HOST_MISSING } from './host-api';

export function createElectronProjectPort(): ProjectPort {
  return {
    /**
     * ★ **sendSync**（同步）：保证 `img://` 首帧就读对目录
     * 原实现用 `ipcRenderer.sendSync('project-storage-activate-sync', payload)`
     */
    activateStorage: (payload: ActivateProjectStoragePayload): Result<{ path?: string }> => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = api.activateProjectStorage(payload);
        // ★ TD-04-5：后端 `project-storage-activate-sync` 的 `e.returnValue` **两条都带 `ok`**
        //   ⇒ 走 `checkOk`（fail-closed：漏 `ok` 不算成功）
        const c = checkOk<{ path?: string }>(raw);
        if (!c.ok) return c;
        return ok({ path: c.value.path });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    pickStorage: async (payload: PickStoragePayload) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.pickProjectStorage(payload);
        // 用户取消：**如实**返回 canceled（不是错误，也不是成功）
        //   ⚠️ 必须**先于** `checkOk` —— 后端取消时返 `{ok:false, canceled:true}`，
        //      那不是失败；顺序颠倒会把"用户点了取消"误报成错误。
        if (isRecord(raw) && raw.canceled === true) return ok({ canceled: true });
        // ★ TD-04-5：后端 `project-storage-pick` 的 4 条 return **都带 `ok`** ⇒ fail-closed
        const c = checkOk<{ path?: string; migrated?: AssetMigration }>(raw, {
          fallback: PROJECT_TEXT.unknownReason,
        });
        if (!c.ok) return c;
        return ok({ path: c.value.path, migrated: c.value.migrated });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    // ── send（fire-and-forget，但**失败必须可见** ⇒ 返 Result，不 throw）——
    saveBackup: (json: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        api.saveProjectsBackup(json);
        return ok(undefined);
      } catch (e) {
        // ★ 原样透传（原则 6）
        return err('unknown', toMessage(e), e);
      }
    },

    saveSnapshot: (project: Project) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        api.saveProjectSnapshot(project);
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    logOperation: (event: OperationLogEvent) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        api.logProjectOperation(event);
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    revealStorage: async (storagePath: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.revealProjectStorage(storagePath);
        // ★ 原则 6 + **TD-04-7**：后端 `main.js` 的 handler **每条 return 都带 `ok`**
        //   ⇒ 统一走 `checkOk`（fail-closed：`raw == null` 与漏 `ok` 都判失败）。
        const c = checkOk<{ path?: string }>(raw, { fallback: PROJECT_TEXT.unknownReason });
        if (!c.ok) return c;
        return ok({ path: c.value.path });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    getStorageSize: async (storagePath: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.getProjectStorageSize(storagePath);
        // ★ 原则 6：后端字段是 `bytes/files/partial`（当 `{size}` 读 ⇒ **恒为 0**）
        // ★ TD-04-5：后端 `project-storage-size` 的 6 条 return **都带 `ok`** ⇒ fail-closed
        const c = checkOk<{ bytes: number; files: number; partial?: boolean }>(raw, {
          fallback: PROJECT_TEXT.unknownReason,
          // ★ `TD-04-10`：点名缺字段 —— 后端若把 `bytes` 改名成 `size`（本仓曾经的症状：
          //   按 `{size}` 读 ⇒ 占用空间**恒显示 0**），这里当场报「缺少必需字段 bytes」
          guard: (p) => typeof p.bytes === 'number' && typeof p.files === 'number',
          field: 'bytes',
        });
        if (!c.ok) return c;
        return ok({
          bytes: c.value.bytes,
          files: c.value.files,
          partial: c.value.partial === true,
        });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
  };
}
