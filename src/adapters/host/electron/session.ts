/**
 * 剪贴板 / 账号会话 / 许可 —— Electron 实现
 *
 * ⚠️ docs/10 #8「剪贴板 clear→writeText→await」的坑**已在主进程内解决**：
 *    宿主暴露的是**单一** `copyTextToClipboard`（invoke），顺序与 await 都在主进程里。
 *    ⇒ 前端**不得**自己拆成 clear + writeText（那是把后端已修好的坑重新踩一遍）。
 *
 * ⚠️ W1：所有 `on*` 订阅**必须取取消函数**（本文件已取）
 */

import type { AccountPort, ClipboardPort, LicensePort, LicenseStatus } from '@/core/ports/host.port';
import { err, ok, toMessage } from '@/core/model/result';
import { getHostApi, HOST_MISSING } from './host-api';

export function createElectronClipboard(): ClipboardPort {
  return {
    readImage: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.readClipboardImage();
        const r = raw as { dataUrl?: string; w?: number; h?: number; name?: string } | null;
        return ok(r?.dataUrl ? { dataUrl: r.dataUrl, w: r.w ?? 0, h: r.h ?? 0, name: r.name } : null);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    writeImage: async (dataUrl: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        await api.copyImageToClipboard(dataUrl);
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    // ★ 顺序与 await 由主进程保证（docs/10 #8）——前端只调这一个
    writeText: async (text: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        await api.copyTextToClipboard(text);
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    pasteToWebview: async (webContentsId: number) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        await api.pasteToWebview(webContentsId);
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    attachImages: async (webContentsId: number, imgs) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.attachImagesToWebview(webContentsId, imgs);
        const r = raw as { via?: string; count?: number } | null;
        return ok({ via: r?.via ?? 'unknown', count: r?.count ?? imgs.length });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    /** ★ 订阅：取取消函数并返回（W1） */
    onChanged: (cb) => {
      const api = getHostApi();
      if (!api) return () => undefined;
      const off = api.onClipboardImageChanged(cb);
      return typeof off === 'function' ? off : () => undefined;
    },
  };
}

export function createElectronAccount(): AccountPort {
  const call = async <T>(fn: (api: NonNullable<ReturnType<typeof getHostApi>>) => Promise<unknown>): Promise<ReturnType<typeof ok<T>>> => {
    const api = getHostApi();
    if (!api) return err('unknown', HOST_MISSING) as never;
    try {
      return ok((await fn(api)) as T);
    } catch (e) {
      return err('unknown', toMessage(e), e) as never;
    }
  };

  return {
    ensureFingerprint: async (accountId: string) => {
      const r = await call<{ preloadUrl?: string }>((api) => api.ensureFingerprint(accountId));
      return r;
    },
    ensurePlainSession: async (accountId: string) => {
      const r = await call<{ userAgent?: string }>((api) => api.ensurePlainSession(accountId));
      return r;
    },
    ensureLovartContainer: async (accountId: string) => {
      const r = await call<{ preloadUrl: string | null }>((api) => api.ensureLovartContainer(accountId));
      return r;
    },
    clearSession: async (partition: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        await api.clearAccountSession(partition);
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
    setProxy: async (partition: string, proxy: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        await api.setAccountProxy(partition, proxy);
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
    fpNetDiag: async (partition: string) => {
      const r = await call<unknown>((api) => api.fpNetDiag(partition));
      return r;
    },
  };
}

export function createElectronLicense(): LicensePort {
  return {
    getMachineCode: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.getMachineCode();
        return ok(typeof raw === 'string' ? raw : String((raw as { code?: string })?.code ?? ''));
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    getStatus: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.getLicenseStatus()) as Partial<LicenseStatus> | null;
        return ok<LicenseStatus>({
          status: (raw?.status as LicenseStatus['status']) ?? 'none',
          expireAt: raw?.expireAt,
          licenseKey: raw?.licenseKey,
        });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    activateWithCode: async (code: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.activateWithCode(code)) as Partial<LicenseStatus> | null;
        return ok<LicenseStatus>({ status: (raw?.status as LicenseStatus['status']) ?? 'invalid' });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    exportMachineCode: async (machineCode: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.exportMachineCode(machineCode)) as { path?: string } | null;
        return ok({ path: raw?.path });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
  };
}

export function createElectronSessionPorts(): {
  clipboard: ClipboardPort;
  account: AccountPort;
  license: LicensePort;
} {
  return {
    clipboard: createElectronClipboard(),
    account: createElectronAccount(),
    license: createElectronLicense(),
  };
}
