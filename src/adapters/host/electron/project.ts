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
  OperationLogEvent,
  ProjectPort,
} from '@/core/ports/host.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
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

    pickStorage: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.pickProjectStorage({});
        const r = raw as { path?: string; canceled?: boolean };
        return ok({ path: r?.path, canceled: r?.canceled });
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
        await api.revealProjectStorage(storagePath);
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    getStorageSize: async (storagePath: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.getProjectStorageSize(storagePath);
        const n = typeof raw === 'number' ? raw : Number((raw as { size?: number })?.size ?? 0);
        return ok(Number.isFinite(n) ? n : 0);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
  };
}
