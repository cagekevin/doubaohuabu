/**
 * ProjectPort 的 Electron 实现（磁盘侧）
 *
 * ⚠️ **`activateProjectStorage` 是 `sendSync`** —— **同步**返回 `{path}`，
 *    不得 `await`（docs/10 + W1）。它是 `img://` 首帧能读对目录的前提。
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
import { PROJECT_TEXT } from '@/constants/text';
import { getHostApi, HOST_MISSING } from './host-api';

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
        const r = raw as { ok?: boolean; error?: unknown; path?: string };
        if (r?.ok === false) return err('unknown', typeof r.error === 'string' ? r.error : String(r.error ?? ''));
        return ok({ path: r?.path });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    pickStorage: async (payload: PickStoragePayload) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.pickProjectStorage(payload)) as {
          ok?: boolean;
          path?: string;
          canceled?: boolean;
          error?: string;
          migrated?: AssetMigration;
        } | null;
        // 用户取消：**如实**返回 canceled（不是错误，也不是成功）
        if (raw?.canceled) return ok({ canceled: true });
        // ★ 修（原则 6）：原先无视 `ok:false` 直接 `ok({path})` ⇒ 失败被吞成成功
        if (!raw || raw.ok === false) {
          return err('unknown', raw?.error || PROJECT_TEXT.unknownReason);
        }
        return ok({ path: raw.path, migrated: raw.migrated });
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

    saveSnapshot: (project: unknown) => {
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
        const raw = (await api.revealProjectStorage(storagePath)) as
          | { ok?: boolean; path?: string; error?: string }
          | null;
        // ★ 修（原则 6）：原先无视 `ok:false` 直接 `ok(undefined)` ⇒ 打不开目录也报成功
        if (raw && raw.ok === false) return err('unknown', raw.error || PROJECT_TEXT.unknownReason);
        return ok({ path: raw?.path });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    getStorageSize: async (storagePath: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.getProjectStorageSize(storagePath)) as
          | { ok?: boolean; bytes?: number; files?: number; partial?: boolean; error?: string }
          | null;
        // ★ 修（原则 6）：原先把返回当 `{size}` 读 ⇒ **恒为 0**；实际字段是 `bytes/files/partial`
        if (!raw || raw.ok === false) return err('unknown', raw?.error || PROJECT_TEXT.unknownReason);
        return ok({
          bytes: typeof raw.bytes === 'number' ? raw.bytes : 0,
          files: typeof raw.files === 'number' ? raw.files : 0,
          partial: raw.partial === true,
        });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
  };
}
