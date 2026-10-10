/**
 * HostPort 的 Electron 真实实现（★ **唯一**直接接触 `window.api` 的地方）
 *
 * 依据：docs/05-配置契约层.md §二 + docs/11 §4.1
 * 类型：`./window-api.d.ts`（由 `scripts/extract-host-api.cjs` 抽取并核对）
 *
 * 铁律：
 *   - 原则 6：**所有方法返回 `Result`，不抛异常给上层**（`try/catch` 统一收口）
 *   - W1：**不得调用 `preload.js` 不存在的方法**（`scripts/check-host-api.cjs` 强制）
 *   - W1：两个 `sendSync`（`activateProjectStorage` / `saveImageSync`）**必须同步调用**，不得 `await`
 */

import type {
  FilePort,
  HostPort,
  LicensePort,
  PickedFile,
} from '@/core/ports/host.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { createElectronProjectPort } from './project';
import { createElectronSessionPorts } from './session';
import { createElectronApiPort } from './api';
import { getHostApi, guard, normalize, HOST_MISSING } from './host-api';

// 转出给上层（bootstrap 判断是否在 Electron 宿主里）
export { getHostApi, HOST_MISSING } from './host-api';

const createFile = (): FilePort => ({
  importFiles: async (): Promise<Result<PickedFile[]>> => {
    const r = await guard((api) => api.importFiles());
    if (!r.ok) return r;
    const list = Array.isArray(r.value) ? (r.value as PickedFile[]) : [];
    return ok(list);
  },

  saveFile: async (content: string) => {
    const r = await guard((api) => api.saveFile(content));
    return r.ok ? normalize<{ path?: string }>(r.value) : r;
  },

  loadFile: async () => {
    const r = await guard((api) => api.loadFile());
    if (!r.ok) return r;
    return normalize<{ name: string; content: string } | null>(r.value);
  },

  selectFolder: async () => {
    const r = await guard((api) => api.selectFolder());
    if (!r.ok) return r;
    const v = r.value;
    return ok(typeof v === 'string' && v ? v : null);
  },

  downloadFile: async (url: string, fileName?: string) => {
    const r = await guard((api) => api.downloadFile(url, fileName));
    return r.ok ? normalize<{ path?: string }>(r.value) : r;
  },

  downloadFileAs: async (url: string, defaultName?: string, filters?: unknown) => {
    const r = await guard((api) => api.downloadFileAs(url, defaultName, filters));
    return r.ok ? normalize<{ path?: string; size?: number; canceled?: boolean }>(r.value) : r;
  },

  openExternal: async (url: string) => {
    const r = await guard((api) => api.openExternal(url));
    return r.ok ? ok(undefined) : r;
  },

  revealPath: async (p: string) => {
    const r = await guard((api) => api.revealPath(p));
    return r.ok ? ok(undefined) : r;
  },
});

/** 组装 Electron HostPort */
export function createElectronHost(): HostPort {
  const api = getHostApi();
  const { clipboard, account, license } = createElectronSessionPorts();

  const licensePort: LicensePort = {
    ...license,
    getMachineCode: async () => {
      const r = await guard((a) => a.getMachineCode());
      if (!r.ok) return r;
      return ok(typeof r.value === 'string' ? r.value : String(r.value ?? ''));
    },
  };

  return {
    // ★ 真实宿主平台（来自 preload 的 `process.platform`，**不读 navigator**）
    os: (api?.hostOS as HostPort['os']) ?? 'windows',
    file: createFile(),
    clipboard,
    project: createElectronProjectPort(),
    media: {
      // ★★ sendSync：**同步**返回 `img://` 引用（不得 await）；失败返 Result 不 throw
      saveImageSync: (dataUrl: string) => {
        const a = getHostApi();
        if (!a) return err('unknown', HOST_MISSING);
        try {
          return ok(a.saveImageSync(dataUrl));
        } catch (e) {
          // ★ 原样透传（原则 6）
          return err('unknown', toMessage(e), e);
        }
      },

      saveVideoFromUrl: async (url: string, referer?: string) => {
        const r = await guard((a) => a.saveVideoFromUrl(url, referer));
        return r.ok ? normalize<{ ref: string; size: number }>(r.value) : r;
      },
      resolveImageRef: async (ref: string) => {
        const r = await guard((a) => a.resolveImageRef(ref));
        if (!r.ok) return r;
        return ok(typeof r.value === 'string' ? r.value : null);
      },
      imageFetchDataUrl: async (url: string) => {
        const r = await guard((a) => a.imageFetchDataUrl(url));
        if (!r.ok) return r;
        return ok(typeof r.value === 'string' ? r.value : null);
      },
      captureRect: async (rect) => {
        const r = await guard((a) => a.captureRect(rect));
        if (!r.ok) return r;
        return ok(typeof r.value === 'string' ? r.value : null);
      },
      scanFrames: async (req) => {
        const r = await guard((a) => a.lovartScanFrames(req));
        if (!r.ok) return r;
        const v = r.value as { ok?: boolean; error?: string; items?: unknown[]; href?: string } | null;
        // ★ 后端用 `{ok:false, error}` 表达失败 ⇒ 归一成 Result（**原文透传**）
        if (!v || v.ok === false) return err('page-error', v?.error ?? '多帧扫描返回失败');
        return ok({ items: Array.isArray(v.items) ? v.items : [], href: v.href });
      },
      showInFolder: async (ref: string) => {
        const r = await guard((a) => a.showInFolder(ref));
        return r.ok ? ok(undefined) : r;
      },
      startFileDrag: (payload) => {
        const a = getHostApi();
        if (!a) return err('unknown', HOST_MISSING);
        try {
          a.startFileDrag(payload);
          return ok(undefined);
        } catch (e) {
          return err('unknown', toMessage(e), e);
        }
      },
      clearBrowserCache: async () => {
        const r = await guard((a) => a.clearBrowserCache());
        return r.ok ? ok(undefined) : r;
      },
    },
    account,
    license: licensePort,
    api: createElectronApiPort(),
  };
}
