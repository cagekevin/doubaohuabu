/**
 * 剪贴板 / 账号会话 / 许可 —— Electron 实现
 *
 * ⚠️ docs/10 #8「剪贴板 clear→writeText→await」的坑**已在主进程内解决**：
 *    宿主暴露的是**单一** `copyTextToClipboard`（invoke），顺序与 await 都在主进程里。
 *    ⇒ 前端**不得**自己拆成 clear + writeText（那是把后端已修好的坑重新踩一遍）。
 *
 * ⚠️ W1：所有 `on*` 订阅**必须取取消函数**（本文件已取）
 */

import type {
  AccountPort,
  ClipboardPort,
  FingerprintSessionPayload,
  LicensePort,
  LicenseStatus,
  LovartContainerPayload,
  PlainSessionPayload,
} from '@/core/ports/host.port';
import { isLicenseStatusKind } from '@/core/model/license';
import { err, ok, toMessage } from '@/core/model/result';
import { ACCOUNT_TRANSFER_TEXT, COMMON_TEXT, LICENSE_TEXT } from '@/constants/text';
import { asRecord } from '@/lib/object';
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

    // ★ 修（三处）：载荷必须是 `{dataUrl,label}`；必须带 `webContentsId`（页内回落层）；
    //   必须看 `ok:false`（原文透传 —— 如 `图片数据为空或格式不支持`）
    writeImage: async (img: { dataUrl: string; label?: string }, webContentsId?: number) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.copyImageToClipboard(img, webContentsId)) as
          | { ok?: boolean; error?: string }
          | null;
        if (raw && raw.ok === false) {
          return err('unknown', typeof raw.error === 'string' && raw.error ? raw.error : COMMON_TEXT.unknownReason);
        }
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

    // ★ 修（原则 6）：后端用 `{ok:false, errors:[…]}` 表达失败（`main.js:1503/1541/1561`），
    //   原实现**无视 `ok` 且丢掉 `errors`** ⇒ 喂图失败会报成"成功"
    attachImages: async (webContentsId: number, imgs) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.attachImagesToWebview(webContentsId, imgs);
        const r = asRecord(raw);
        const errors = Array.isArray(r.errors) ? (r.errors as unknown[]).map(String) : [];
        if (r.ok === false) {
          return err('unknown', errors.length ? errors.join(' | ') : COMMON_TEXT.unknownReason);
        }
        return ok({
          via: typeof r.via === 'string' ? r.via : 'unknown',
          count: typeof r.count === 'number' ? r.count : imgs.length,
          ...(Array.isArray(r.files) ? { files: (r.files as unknown[]).map(String) } : {}),
          // ⚠️ 逐条失败要**带出去**（源 `hS` 靠它决定要不要继续重试/回落）
          ...(errors.length ? { errors } : {}),
        });
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
    // ★ 修：后端收的是**账号对象**（`preload.js:89/94/97` 原样转发），原实现传的是字符串
    //   ⇒ `'abc'.partition === undefined` ⇒ 后端回落到 `persist:lovart`（分区/指纹目录全错）
    ensureFingerprint: async (payload: FingerprintSessionPayload) => {
      const r = await call<{ preloadUrl?: string }>((api) => api.ensureFingerprint(payload));
      return r;
    },
    ensurePlainSession: async (payload: PlainSessionPayload) => {
      const r = await call<{ userAgent?: string; preloadUrl?: string }>((api) =>
        api.ensurePlainSession(payload),
      );
      return r;
    },
    ensureLovartContainer: async (payload: LovartContainerPayload) => {
      const r = await call<{ userAgent?: string; preloadUrl: string | null }>((api) =>
        api.ensureLovartContainer(payload),
      );
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

    // ── 账号数据导入 / 导出（原 `OP.jsx` / `PP.jsx`）──
    exportCookies: async (partition: string | null) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.exportAccountCookies(partition)) as
          | { ok?: boolean; cookies?: unknown[]; error?: string }
          | null;
        // ★ 后端用 `{ok:false, error}` 表达失败 ⇒ 归一成 Result（**原文透传**，原则 6）
        if (!raw || raw.ok === false) {
          return err('unknown', raw?.error || ACCOUNT_TRANSFER_TEXT.exportFailed('未知原因'));
        }
        return ok({ cookies: Array.isArray(raw.cookies) ? raw.cookies : [] });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    importCookies: async (partition: string, cookies: readonly unknown[]) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.importAccountCookies(partition, cookies)) as
          | { ok?: boolean; restored?: number; error?: string }
          | null;
        if (!raw || raw.ok === false) {
          return err('unknown', raw?.error || ACCOUNT_TRANSFER_TEXT.importFailed('未知原因'));
        }
        return ok({ restored: typeof raw.restored === 'number' ? raw.restored : 0 });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    saveAccountsFile: async (content: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = (await api.saveAccountsFile(content)) as { ok?: boolean; path?: string; error?: string } | null;
        if (!raw || raw.ok === false) {
          // ⚠️ 取消时后端给的 `error` 就是 `'已取消'` —— **原样转发**，不擅自归类
          return err('unknown', raw?.error || ACCOUNT_TRANSFER_TEXT.saveCanceled);
        }
        return ok({ path: raw.path });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    loadAccountsFile: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.loadAccountsFile();
        // 后端：取消 ⇒ `null`；否则是**文件正文字符串**
        return ok(typeof raw === 'string' && raw ? raw : null);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
  };
}

/**
 * 把后端许可载荷归一成 `LicenseStatus`（**不可信字符串收窄**，免 `as`）
 *
 * ⚠️ 字段名逐字对齐后端（`electron/license.js`）：
 *    `status` · `machineCode` · `expireAt` · `activatedAt` · `reason` · `tamperReason` · `error`
 * ⚠️ 状态不在白名单 ⇒ 收敛为 `invalid`（**不假装**是 `ok`）
 */
function normalizeLicenseStatus(raw: unknown): LicenseStatus {
  const r = asRecord(raw);
  return {
    status: isLicenseStatusKind(r.status) ? r.status : 'invalid',
    ...(typeof r.machineCode === 'string' ? { machineCode: r.machineCode } : {}),
    ...(typeof r.expireAt === 'number' ? { expireAt: r.expireAt } : {}),
    ...(typeof r.activatedAt === 'number' ? { activatedAt: r.activatedAt } : {}),
    ...(typeof r.reason === 'string' ? { reason: r.reason } : {}),
    ...(typeof r.tamperReason === 'string' ? { tamperReason: r.tamperReason } : {}),
    ...(typeof r.error === 'string' ? { error: r.error } : {}),
  };
}

/**
 * 许可端口（Electron）
 *
 * ⚠️ **`ok` 标志的折叠**（原则 6：传输成功与业务成功分开表达）：
 *    后端 `activateWithCode` 会用 `{ok:false, status:'used', error}` 表达**业务失败** ——
 *    那是**一次成功的 IPC 调用**，故归一成 `ok(status)`（失败原因在 `status.error` 里），
 *    `err` 只留给「IPC 真的没打通 / 后端抛异常」。
 */
export function createElectronLicense(): LicensePort {
  return {
    getMachineCode: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.getMachineCode();
        if (typeof raw === 'string') return ok(raw);
        const r = asRecord(raw);
        // ★ 修：后端字段名是 `machineCode`（`main.js:2154`），原实现读的是 `code` ⇒ **恒为空串**
        if (r.ok === false) return err('unknown', typeof r.error === 'string' ? r.error : LICENSE_TEXT.fetchFailed);
        return ok(typeof r.machineCode === 'string' ? r.machineCode : '');
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    getStatus: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.getLicenseStatus();
        const r = asRecord(raw);
        if (r.ok === false) return err('unknown', typeof r.error === 'string' ? r.error : LICENSE_TEXT.fetchFailed);
        return ok(normalizeLicenseStatus(r));
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    activateWithCode: async (code: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.activateWithCode(code);
        const r = asRecord(raw);
        // 后端用 `{ok:false, status, error}` 表达业务失败 ⇒ 只要给了 status 就算**业务结果**
        if (!isLicenseStatusKind(r.status)) {
          return err('unknown', typeof r.error === 'string' ? r.error : LICENSE_TEXT.fetchFailed);
        }
        return ok(normalizeLicenseStatus(r));
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    exportMachineCode: async (machineCode: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.exportMachineCode(machineCode);
        const r = asRecord(raw);
        // ★ 修（原则 6）：原先无视 `ok:false` 直接 `ok({path})` ⇒ 导出失败被吞成成功
        if (r.ok === false) {
          return err('unknown', typeof r.error === 'string' && r.error ? r.error : LICENSE_TEXT.exportCanceled);
        }
        return ok({ path: typeof r.path === 'string' ? r.path : undefined });
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
