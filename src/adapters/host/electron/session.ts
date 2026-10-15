/**
 * 剪贴板 / 账号会话 / 许可 —— Electron 实现
 *
 * ⚠️ docs/过程.md #8「剪贴板 clear→writeText→await」的坑**已在主进程内解决**：
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
  LovartChromeOpen,
  LovartChromePayload,
  LovartContainerPayload,
  LovartSessionSync,
  PlainSessionPayload,
} from '@/core/ports/host.port';
import { isLicenseStatusKind } from '@/core/model/license';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { ACCOUNT_TRANSFER_TEXT, COMMON_TEXT, LICENSE_TEXT } from '@/constants/text';
import { asRecord } from '@/lib/object';
import { getHostApi, checkOk, HOST_MISSING } from './host-api';

export function createElectronClipboard(): ClipboardPort {
  return {
    readImage: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.readClipboardImage();
        // ⚠️ IPC 返回值是**不可信载荷** ⇒ 先 `asRecord` 收，再**逐字段校验**（不自称形状）
        const r = asRecord(raw);
        if (typeof r.dataUrl !== 'string' || !r.dataUrl) return ok(null);
        return ok({
          dataUrl: r.dataUrl,
          w: typeof r.w === 'number' ? r.w : 0,
          h: typeof r.h === 'number' ? r.h : 0,
          name: typeof r.name === 'string' ? r.name : undefined,
        });
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
        const raw = await api.copyImageToClipboard(img, webContentsId);
        // ★ TD-04-5：后端 `copy-image-to-clipboard` 的 **7 条 return 都带 `ok`** ⇒ fail-closed
        //   （fail-closed：漏 `ok` 与 `raw == null` 都判失败）
        const c = checkOk(raw, { fallback: COMMON_TEXT.unknownReason });
        if (!c.ok) return c;
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    // ★ 顺序与 await 由主进程保证（docs/过程.md #8）——前端只调这一个
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

    // ★ 修（原则 6）：后端用 `{ok:false, errors:[…]}` 表达失败（`main.js`），
    //   原实现**无视 `ok` 且丢掉 `errors`** ⇒ 喂图失败会报成"成功"
    attachImages: async (webContentsId: number, imgs) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.attachImagesToWebview(webContentsId, imgs);
        const r = asRecord(raw);
        const errors = Array.isArray(r.errors) ? (r.errors as unknown[]).map(String) : [];
        // ★ TD-04-5：后端 `attach-images-to-webview` 返**裸 `out`**（不是 `{ok,error}` 形态），
        //   但 `out` **恒含布尔 `ok`**（初始 `ok:false`，CDP 喂成功才置 `true`）⇒ 用 `!== true`（fail-closed）
        //   ⚠️ **不能走 `checkOk`**：它的失败明细在 `errors[]`（**没有** `error` 字段），
        //      `checkOk` 会丢掉逐条原因 ⇒ 这里保留自己的拼装。
        if (r.ok !== true) {
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
  /**
   * 统一收口账号类宿主调用
   *
   * ★ **TD-04-8**：返回按端口契约声明 `Promise<Result<T>>`（`host.port.ts:225-245`）——
   *   不能声明成 `Ok<T>`（那会让读者以为必成功、不去判 `.ok`）。
   */
  const call = async <T>(
    fn: (api: NonNullable<ReturnType<typeof getHostApi>>) => Promise<unknown>,
  ): Promise<Result<T>> => {
    const api = getHostApi();
    if (!api) return err('unknown', HOST_MISSING);
    try {
      return ok((await fn(api)) as T);
    } catch (e) {
      return err('unknown', toMessage(e), e);
    }
  };

  return {
    // ★ 修：后端收的是**账号对象**（`preload.js` 原样转发），原实现传的是字符串
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

    // ── 真实 Chrome 集成（原 `_Component25` 的「Lovart 会话条」三键）──
    /**
     * ⚠️ 后端把「业务失败」放在**一次成功的 IPC 调用**里（`{ok:false, error, message}`，
     *    `main.js`）⇒ 归一成**内层判别联合**：`error` 是**错误码**（查文案表用），
     *    `message` 是后端原文。外层 `Result` 只表达「IPC 通没通」。
     * ⚠️ 只判 `ok !== true`（fail-closed：漏 `ok` 不能当成功 —— `TD-04-5`）。
     */
    ensureLovartChrome: async (payload: LovartChromePayload) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const r = asRecord(await api.ensureLovartChrome(payload));
        if (r.ok !== true) {
          const failed: LovartChromeOpen = {
            ok: false,
            error: typeof r.error === 'string' ? r.error : COMMON_TEXT.unknownReason,
            ...(typeof r.message === 'string' ? { message: r.message } : {}),
          };
          return ok(failed);
        }
        const opened: LovartChromeOpen = {
          ok: true,
          alreadyOpen: r.alreadyOpen === true,
          ...(typeof r.profileDir === 'string' ? { profileDir: r.profileDir } : {}),
        };
        return ok(opened);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
    closeLovartChrome: async (accountId: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        // ★ fail-closed：后端 `close-lovart-chrome` 两条 return 都带 `ok`（`main.js`）
        const r = asRecord(await api.closeLovartChrome({ accountId }));
        if (r.ok !== true) {
          return err('unknown', typeof r.error === 'string' ? r.error : COMMON_TEXT.unknownReason);
        }
        return ok(undefined);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },
    syncLovartSession: async (accountId: string, partition: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const r = asRecord(await api.syncLovartSession({ accountId, partition }));
        if (r.ok !== true) {
          // 后端给 `error`（原文）+ 可选 `message`（`main.js`）⇒ 优先更具体的那个
          const failed: LovartSessionSync = {
            ok: false,
            message:
              (typeof r.message === 'string' && r.message) ||
              (typeof r.error === 'string' && r.error) ||
              COMMON_TEXT.unknownReason,
          };
          return ok(failed);
        }
        const synced: LovartSessionSync = {
          ok: true,
          count: typeof r.count === 'number' ? r.count : 0,
          total: typeof r.total === 'number' ? r.total : 0,
        };
        return ok(synced);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    // ── 账号数据导入 / 导出（原 `OP.jsx` / `PP.jsx`）──
    exportCookies: async (partition: string | null) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.exportAccountCookies(partition);
        // ★ 后端用 `{ok:false, error}` 表达失败 ⇒ 归一成 Result（**原文透传**，原则 6）
        // ★ TD-04-5：后端 `export-account-cookies` 的 **2 条 return 都带 `ok`** ⇒ fail-closed
        const c = checkOk<{ cookies?: unknown[] }>(raw, {
          // ⚠️ "后端没给原因"用**唯一真源** `COMMON_TEXT.unknownReason`（源 `_Component23.jsx:286`
          //   那句 `'未知原因'` 属画廊域；账号导入导出在源里用的是 `'未知错误'` 一族）
          fallback: ACCOUNT_TRANSFER_TEXT.exportFailed(COMMON_TEXT.unknownReason),
        });
        if (!c.ok) return c;
        return ok({ cookies: Array.isArray(c.value.cookies) ? c.value.cookies : [] });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    importCookies: async (partition: string, cookies: readonly unknown[]) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.importAccountCookies(partition, cookies);
        // ★ TD-04-5：后端 `import-account-cookies` 的 **2 条 return 都带 `ok`** ⇒ fail-closed
        const c = checkOk<{ restored?: number }>(raw, {
          fallback: ACCOUNT_TRANSFER_TEXT.importFailed(COMMON_TEXT.unknownReason),
        });
        if (!c.ok) return c;
        return ok({ restored: typeof c.value.restored === 'number' ? c.value.restored : 0 });
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    saveAccountsFile: async (content: string) => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.saveAccountsFile(content);
        // ⚠️ 取消时后端给的 `error` 就是 `'已取消'` —— **原样转发**，不擅自归类
        // ★ TD-04-5：后端 `save-accounts-file` 的 **3 条 return 都带 `ok`** ⇒ fail-closed
        const c = checkOk<{ path?: string }>(raw, { fallback: ACCOUNT_TRANSFER_TEXT.saveCanceled });
        if (!c.ok) return c;
        return ok({ path: c.value.path });
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
        // ⚠️ 裸字符串是**旧形状**（无 `ok`）⇒ 必须先于 `checkOk` 放行
        if (typeof raw === 'string') return ok(raw);
        // ★ 修：后端字段名是 `machineCode`（`main.js`），原实现读的是 `code` ⇒ **恒为空串**
        // ★ TD-04-5：后端 `get-machine-code` 的 **2 条 return 都带 `ok`** ⇒ fail-closed
        const c = checkOk<{ machineCode: string }>(raw, {
          fallback: LICENSE_TEXT.fetchFailed,
          // ★ `TD-04-10`：**点名缺哪个字段** —— 后端若把 `machineCode` 改名（源 `main.js`），
          //   这里当场报「宿主返回缺少必需字段 machineCode」，而不是静默兜成空串
          //   （本仓曾经的症状：字段名读错 ⇒ 机器码**恒空**，用户看到的是"空的"而不是报错）
          guard: (p) => typeof p.machineCode === 'string',
          field: 'machineCode',
        });
        if (!c.ok) return c;
        return ok(c.value.machineCode);
      } catch (e) {
        return err('unknown', toMessage(e), e);
      }
    },

    getStatus: async () => {
      const api = getHostApi();
      if (!api) return err('unknown', HOST_MISSING);
      try {
        const raw = await api.getLicenseStatus();
        // ★ TD-04-5：后端 `get-license-status` 的 **2 条 return 都带 `ok`** ⇒ fail-closed
        const c = checkOk<Record<string, unknown>>(raw, { fallback: LICENSE_TEXT.fetchFailed });
        if (!c.ok) return c;
        return ok(normalizeLicenseStatus(c.value));
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
        // ★ 原则 6：必须判 `ok:false`（无视它 ⇒ 导出失败被吞成成功）
        // ★ TD-04-5：后端 `export-machine-code` 的 **3 条 return 都带 `ok`** ⇒ fail-closed
        const c = checkOk<{ path?: string }>(raw, { fallback: LICENSE_TEXT.exportCanceled });
        if (!c.ok) return c;
        return ok({ path: typeof c.value.path === 'string' ? c.value.path : undefined });
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
