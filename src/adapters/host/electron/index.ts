/**
 * HostPort 的 Electron 真实实现（★ **唯一**直接接触 `window.api` 的地方）
 *
 * 依据：docs/05-配置契约层.md §二 + docs/11 §4.1
 * 类型：`./window-api.d.ts`（由 `scripts/extract-host-api.cjs` 抽取并核对）
 *
 * 铁律：
 *   - 原则 6：**所有方法返回 `Result`，不抛异常给上层**（`try/catch` 统一收口）
 *   - W1：**不得调用 `preload.js` 不存在的方法**（靠 tsc + code review）
 *   - W1：两个 `sendSync`（`activateProjectStorage` / `saveImageSync`）**必须同步调用**，不得 `await`
 */

import type {
  DetectedVideo,
  DolaMediaEvent,
  FilePort,
  HostPort,
  LicensePort,
  PickedFile,
} from '@/core/ports/host.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { createElectronProjectPort } from './project';
import { createElectronSessionPorts } from './session';
import { createElectronApiPort } from './api';
import { getHostApi, guard, normalize, checkOk, HOST_MISSING } from './host-api';
import { facePortFns } from '@/adapters/media/facePort';

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
    // ⚠️ 与 `downloadFileAs` 同口径：主进程确实返回 `size`（见 `host.port.ts` 的注释）
    return r.ok ? normalize<{ path?: string; size?: number }>(r.value) : r;
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
    // ⚠️ 与 `downloadFileAs` 同口径：主进程确实返回 `size`（见 `host.port.ts` 的注释）
    return r.ok ? normalize<{ path?: string; size?: number }>(r.value) : r;
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
    if (!r.ok) return r;
    // ★ TD-16-74：后端 `reveal-path`（`main.js:1893`）**恒返 `{ok, error}`** ⇒ 必须判**内层** `ok`
    //   （只判外层 `r.ok` ⇒ 后端说失败也报成功）
    const c = checkOk(r.value);
    if (!c.ok) return c;
    return ok(undefined);
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
    //   ⚠️ **如实传宿主报的值**，**不编默认 OS** —— 兜底归 `host/shared/env.readHostOs`（母体 M5 · TD-16-10）
    os: api?.hostOS,
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
      // ⚠️ `resolveImageRef` 已于 2026-10-11 删除（源前端 0 消费者；`img://` 解析是主进程内部的事 ——
      //    见 `core/ports/host.port.ts` 该处的留证）
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
        // ★ 后端 `lovart-scan.js` 的 handler **每条 return 都带 `ok`** ⇒ fail-closed 收口（TD-04-5）
        const c = checkOk<{ items?: unknown[]; href?: string }>(r.value, {
          reason: 'page-error',
          fallback: '多帧扫描返回失败',
        });
        if (!c.ok) return c;
        return ok({ items: Array.isArray(c.value.items) ? c.value.items : [], href: c.value.href });
      },
      detectVideos: async (webContentsId: number, seenKeys: readonly string[]) => {
        const r = await guard((a) => a.detectVideos(webContentsId, seenKeys));
        if (!r.ok) return r;
        // ★ 后端 `detect-videos` handler **每条 return 都带 `ok`**（`main.js:2397`）⇒ fail-closed（TD-04-5）
        const c = checkOk<{ videos?: unknown[] }>(r.value, {
          reason: 'page-error',
          fallback: '视频检测返回失败',
        });
        if (!c.ok) return c;
        const videos = Array.isArray(c.value.videos) ? (c.value.videos as DetectedVideo[]) : [];
        return ok({ videos });
      },
      // ★ 订阅型（与 `api.ts` 的 `onJobEvent` 同法）—— 返回取消函数
      onDolaMedia: (cb) => {
        const a = getHostApi();
        if (!a) return () => undefined;
        const off = a.onDolaMedia((payload) => cb(payload as DolaMediaEvent));
        return typeof off === 'function' ? off : () => undefined;
      },
      attachDolaDebugger: async (webContentsId: number) => {
        const r = await guard((a) => a.attachDolaDebugger(webContentsId));
        if (!r.ok) return r;
        // ★ 后端 `attach-dola-debugger` 恒返 `{ok, error?}`（`main.js:2568`）⇒ fail-closed（TD-04-5）
        const c = checkOk(r.value, {
          reason: 'page-error',
          fallback: 'attach-dola-debugger 失败',
        });
        if (!c.ok) return c;
        return ok(undefined);
      },
      // ★ Dola 30s 主世界钩子注入（原 `_Component25` 的 `injectDolaDurationMain`）
      injectDolaDurationMain: async (webContentsId: number) => {
        const r = await guard((a) => a.injectDolaDurationMain(webContentsId));
        if (!r.ok) return r;
        // ★ 后端 `inject-dola-duration-main` 返 `{ok, error?}`（`main.js:2508/2544`）⇒ fail-closed
        const c = checkOk(r.value, {
          reason: 'page-error',
          fallback: 'inject-dola-duration-main 失败',
        });
        if (!c.ok) return c;
        return ok(undefined);
      },
      // ★ Dola 30s 诊断（原 `ct`）—— 后端落盘到 `~/dola-duration-debug.log`
      logDolaDuration: async (message: string) => {
        const r = await guard((a) => a.dolaDurationDiag(message));
        if (!r.ok) return r;
        // ★ 后端 `dola-duration-diag` 恒返 `{ok, path|error}`（`main.js:2558-2559`）⇒ fail-closed
        const c = checkOk(r.value, {
          reason: 'page-error',
          fallback: 'dola-duration-diag 失败',
        });
        if (!c.ok) return c;
        return ok(undefined);
      },
      showInFolder: async (ref: string) => {
        const r = await guard((a) => a.showInFolder(ref));
        if (!r.ok) return r;
        // ★ TD-16-74：后端 `show-in-folder`（`main.js:1262`）**恒返 `{ok, error}`** ⇒ 判**内层** `ok`
        //   （只判外层 `r.ok` ⇒ 后端「未找到对应的本地文件」也报成功）
        const c = checkOk(r.value);
        if (!c.ok) return c;
        return ok(undefined);
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
        if (!r.ok) return r;
        // ★ 后端 `main.js:1201,1213` 两条 return 都带 `ok` ⇒ fail-closed 收口（TD-04-5）
        const c = checkOk<{ cleared?: unknown; failed?: unknown }>(r.value, {
          fallback: '清理浏览器缓存返回失败',
        });
        if (!c.ok) return c;
        return ok({
          cleared: typeof c.value.cleared === 'number' ? c.value.cleared : 0,
          ...(typeof c.value.failed === 'number' ? { failed: c.value.failed } : {}),
        });
      },

      // ★ 人脸检测 / 遮脸（**渲染层本地**能力，不走 IPC）—— 与 mock **共用**一份实现
      //   （`TD-16-107`：此前 `ui` 直 import `adapters/media`，违反铁律②）
      ...facePortFns,
    },
    account,
    license: licensePort,
    api: createElectronApiPort(),
  };
}
