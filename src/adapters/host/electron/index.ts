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
  FetchImagesItem,
  FetchImagesProgress,
  FetchImagesRequest,
  FetchImagesResult,
  FilePort,
  HostPort,
  PickedFile,
} from '@/core/ports/host.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { log } from '@/lib/log';
import { FETCH_IMAGES_TIMEOUT_MS } from '@/constants';
import { COMMON_TEXT, HOST_TEXT } from '@/constants/text';
import { isRecord } from '@/lib/object';
import { createElectronProjectPort } from './project';
import { createElectronSessionPorts } from './session';
import { createElectronApiPort } from './api';
import { getHostApi, guard, normalize, checkOk, HOST_MISSING } from './host-api';
import { parseFetchDoneEvent, parseFetchItemEvent, parseFetchSubmitAck } from './lovartFetch';
import { facePortFns } from '@/adapters/media/facePort';
import { createWindowLifecycle } from '../shared/lifecycle';

// 转出给上层（bootstrap 判断是否在 Electron 宿主里）
export { getHostApi, HOST_MISSING } from './host-api';

/**
 * `DolaMediaEvent` 的形状谓词 —— **推送边界收窄**
 *
 * ★ 与 `stable/model/gen.ts` 的 `isApiJobEvent` **同法**（形状与谓词同源）；本类型没有独立的
 *   形状文件（它声明在 `core/ports/host.port.ts`，而**端口只放类型、不放值**）⇒ 收在唯一
 *   消费它的边界文件内。`TD-04-12`
 */
function isDolaMediaEvent(v: unknown): v is DolaMediaEvent {
  return isRecord(v) && Array.isArray(v.items);
}

const createFile = (): FilePort => ({
  importFiles: async (): Promise<Result<PickedFile[]>> => {
    const r = await guard((api) => api.importFiles());
    if (!r.ok) return r;
    // 逐字段搬（⛔ 不 `as PickedFile[]` 谎报 —— 那是换面后当场红的旧写法）。
    // 端口 `PickedFile` 只声明 `{ name, dataUrl }`：后端产 `name` / `fullName` / `dataUrl`，
    // 而渲染层只用 `name` / `dataUrl` ⇒ `fullName` 不搬、端口不声明（回源取证见 `PickedFile` 的注）。
    const list: PickedFile[] = Array.isArray(r.value)
      ? r.value.map((f) => ({ name: f.name, dataUrl: f.dataUrl }))
      : [];
    return ok(list);
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
    // ★ TD-16-74：后端 `reveal-path`（`main.js`）**恒返 `{ok, error}`** ⇒ 必须判**内层** `ok`
    //   （只判外层 `r.ok` ⇒ 后端说失败也报成功）
    // ⚠️ 入参收**真实路径**或 **`img://` 引用**（判别在 `main.js` 的 handler 里）—— 调用方不选方法
    const c = checkOk(r.value);
    if (!c.ok) return c;
    return ok(undefined);
  },
});

/** 组装 Electron HostPort */
export function createElectronHost(): HostPort {
  const api = getHostApi();
  const { clipboard, account, license } = createElectronSessionPorts();

  return {
    // ★ 真实宿主平台（来自 preload 的 `process.platform`，**不读 navigator**）
    //   ⚠️ **如实传宿主报的值**，**不编默认 OS** —— 兜底归 `host/shared/env.readHostOs`（母体 M5 · TD-16-10）
    os: api?.hostOS,
    lifecycle: createWindowLifecycle(),
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
      /**
       * ★ **批量取图**（原 `vP`，`shared.js:33677`）—— 主进程 `lovart-fetch-images`
       *
       * ⚠️ 顺序**照抄源**（`shared.js:33708-33744`）：**先订阅 item/done、再提交** ——
       *   否则最早那几张会在订阅前推完 ⇒ 永久漏掉（表现为"取回 N 张但少了几张"）。
       * ⚠️ 过滤键用 **`accountId`**（源 `p.accountId === e.id`），**不用 `jobId`** ——
       *   `jobId` 要等提交返回才有，而事件可能在返回前就到（竞态）。
       * ⚠️ 收齐后才 `resolve`：把「批量 + 流式推送」收敛成一个 Promise ⇒ 端口只有类型、
       *   调用方无需自己订阅（订阅只归 `state/subscriptions.ts`，原则 2）。
       */
      fetchImages: (req: FetchImagesRequest, onProgress?: (p: FetchImagesProgress) => void) => {
        const a = getHostApi();
        if (!a) return Promise.resolve(err('unknown', HOST_MISSING));
        return new Promise<Result<FetchImagesResult>>((resolve) => {
          const items: FetchImagesItem[] = [];
          const failures: { url: string; error: string }[] = [];
          const skipped: { url: string; reason: string }[] = [];
          let okCount = 0;
          let failCount = 0;
          let skipCount = 0;
          let doneCount = 0;
          let total = 0;
          let settled = false;
          let offItem: (() => void) | null = null;
          let offDone: (() => void) | null = null;
          /** 整体超时计时器（源 `vP` 的 `mP`）—— 收尾时必须清掉，否则悬着一个 timer */
          let timer: ReturnType<typeof setTimeout> | null = null;
          const finish = (r: Result<FetchImagesResult>): void => {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            offItem?.();
            offDone?.();
            resolve(r);
          };

          // ① **先订阅**（源顺序）—— 按 `accountId` 过滤本账号的推送
          //    ⚠️ 载荷收窄**只在** `./lovartFetch`（逐字段校验；缺字段 ⇒ 计失败，不静默）
          offItem = a.onLovartFetchItem((payload) => {
            const ev = parseFetchItemEvent(payload);
            if (!ev || ev.accountId !== req.accountId) return;
            if (ev.total !== null) total = ev.total;
            doneCount += 1;
            if (ev.kind === 'skipped') {
              skipCount += 1;
              skipped.push({ url: ev.url, reason: ev.reason });
            } else if (ev.kind === 'failed') {
              failCount += 1;
              failures.push({ url: ev.url, error: ev.error });
            } else {
              okCount += 1;
              items.push(ev.item);
            }
            onProgress?.({ done: doneCount, total, okCount, failCount, skipCount });
          });
          offDone = a.onLovartFetchDone((payload) => {
            const ev = parseFetchDoneEvent(payload);
            if (!ev || ev.accountId !== req.accountId) return;
            finish(ok({ items, okCount, failCount, skipCount, failures, skipped }));
          });

          // ② **再提交**（`jobId` 只作后端引用，不作过滤键）
          a.lovartFetchImages({
            accountId: req.accountId,
            partition: req.partition ?? '',
            referer: req.referer ?? '',
            urls: [...req.urls],
            limit: req.limit ?? req.urls.length,
          })
            .then((r) => {
              const ack = parseFetchSubmitAck(r);
              // 后端**每条 return 都带 `ok`** ⇒ fail-closed（TD-04-5）
              if (!ack || !ack.ok) {
                finish(err('page-error', ack?.error ?? HOST_TEXT.fetchSubmitFailed));
              }
              // 提交成功 ⇒ 等 `done` 事件收尾
            })
            .catch((e) => finish(err('unknown', toMessage(e))));

          // ③ **整体超时兜底**（源 `vP` 末尾的 `setTimeout(() => f({timeout:true}), mP)`，
          //    `shared.js:33762-33766`）—— `done` 事件**永不达**时（后端异常 / 进程挂），
          //    Promise 不能永远悬着：否则扫描链**静默挂起**（用户点了扫描，转圈不结束）
          timer = setTimeout(() => {
            finish(err('page-timeout', COMMON_TEXT.fetchImagesTimeout));
          }, FETCH_IMAGES_TIMEOUT_MS);
        });
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
          fallback: HOST_TEXT.fallbackScanFrames,
        });
        if (!c.ok) return c;
        return ok({ items: Array.isArray(c.value.items) ? c.value.items : [], href: c.value.href });
      },
      detectVideos: async (webContentsId: number, seenKeys: readonly string[]) => {
        const r = await guard((a) => a.detectVideos(webContentsId, seenKeys));
        if (!r.ok) return r;
        // ★ 后端 `detect-videos` handler **每条 return 都带 `ok`**（`main.js`）⇒ fail-closed（TD-04-5）
        const c = checkOk<{ videos?: unknown[] }>(r.value, {
          reason: 'page-error',
          fallback: HOST_TEXT.fallbackDetectVideos,
        });
        if (!c.ok) return c;
        const videos = Array.isArray(c.value.videos) ? (c.value.videos as DetectedVideo[]) : [];
        return ok({ videos });
      },
      // ★ 订阅型（与 `api.ts` 的 `onJobEvent` 同法）—— 返回取消函数；**边界收窄**（`TD-04-12`）
      onDolaMedia: (cb) => {
        const a = getHostApi();
        if (!a) return () => undefined;
        const off = a.onDolaMedia((payload) => {
          // 推送载荷来自后端（不可信）⇒ 边界收窄；形状不符 ⇒ **丢弃 + 留痕**（不静默、不 cb）
          if (!isDolaMediaEvent(payload)) {
            log.warn('[host] onDolaMedia 载荷形状不符，已丢弃:', payload);
            return;
          }
          cb(payload);
        });
        return typeof off === 'function' ? off : () => undefined;
      },
      attachDolaDebugger: async (webContentsId: number) => {
        const r = await guard((a) => a.attachDolaDebugger(webContentsId));
        if (!r.ok) return r;
        // ★ 后端 `attach-dola-debugger` 恒返 `{ok, error?}`（`main.js`）⇒ fail-closed（TD-04-5）
        const c = checkOk(r.value, {
          reason: 'page-error',
          fallback: HOST_TEXT.fallbackAttachDolaDebugger,
        });
        if (!c.ok) return c;
        return ok(undefined);
      },
      // ★ Dola 30s 主世界钩子注入（原 `_Component25` 的 `injectDolaDurationMain`）
      injectDolaDurationMain: async (webContentsId: number) => {
        const r = await guard((a) => a.injectDolaDurationMain(webContentsId));
        if (!r.ok) return r;
        // ★ 后端 `inject-dola-duration-main` 返 `{ok, error?}`（`main.js`）⇒ fail-closed
        const c = checkOk(r.value, {
          reason: 'page-error',
          fallback: HOST_TEXT.fallbackInjectDolaDuration,
        });
        if (!c.ok) return c;
        return ok(undefined);
      },
      // ★ Dola 30s 诊断（原 `ct`）—— 后端落盘到 `~/dola-duration-debug.log`
      logDolaDuration: async (message: string) => {
        const r = await guard((a) => a.dolaDurationDiag(message));
        if (!r.ok) return r;
        // ★ 后端 `dola-duration-diag` 恒返 `{ok, path|error}`（`main.js`）⇒ fail-closed
        const c = checkOk(r.value, {
          reason: 'page-error',
          fallback: HOST_TEXT.fallbackDolaDurationDiag,
        });
        if (!c.ok) return c;
        return ok(undefined);
      },

      // ── 无水印资源面板（原 `SD.jsx` 的 4 个专用宿主方法）──
      getDolaMediaDownloadSettings: async () => {
        const r = await guard((a) => a.getDownloadSettings());
        if (!r.ok) return r;
        // ★ 后端 `get-download-settings` 恒返 `{ok, path, configured}`（`main.js`）⇒ fail-closed
        const c = checkOk<{ path?: unknown; configured?: unknown }>(r.value, {
          fallback: HOST_TEXT.fallbackReadDownloadSettings,
        });
        if (!c.ok) return c;
        return ok({
          ...(typeof c.value.path === 'string' ? { path: c.value.path } : {}),
          ...(typeof c.value.configured === 'boolean' ? { configured: c.value.configured } : {}),
        });
      },
      pickDolaMediaDownloadPath: async () => {
        const r = await guard((a) => a.pickDownloadPath());
        if (!r.ok) return r;
        // ⚠️ **先判取消**：后端取消是 `{ok:false, canceled:true}`，而 `checkOk` 见到 `ok:false` 会判失败
        //   —— 取消是**如实结果**（用户主动关掉对话框），不是错误（与 `pickStorage` 同口径）
        // ★ 换面后 `r.value` 已是精确联合（不再 `unknown`）⇒ 先收回 `unknown` 再判字段
        //   （同一对象、同一判据；只是让"查一个联合里不存在的键"这件事在类型上成立）
        const rawValue: unknown = r.value;
        if (isRecord(rawValue) && rawValue.canceled === true) {
          return ok({ canceled: true });
        }
        const c = checkOk<{ path?: unknown; configured?: unknown }>(r.value, {
          fallback: HOST_TEXT.fallbackPickDownloadDir,
        });
        if (!c.ok) return c;
        return ok({
          ...(typeof c.value.path === 'string' ? { path: c.value.path } : {}),
          ...(typeof c.value.configured === 'boolean' ? { configured: c.value.configured } : {}),
        });
      },
      downloadDolaMedia: async (url: string, mediaType: 'image' | 'video') => {
        const r = await guard((a) => a.downloadDolaMedia(url, mediaType));
        if (!r.ok) return r;
        // ★ 后端 `dola-media-download` 成功分支带 `ok:true`、失败 `{ok:false, error}` ⇒ fail-closed（TD-04-5）
        const c = checkOk<{ path?: unknown; size?: unknown }>(r.value, { fallback: HOST_TEXT.fallbackDownload });
        if (!c.ok) return c;
        return ok({
          ...(typeof c.value.path === 'string' ? { path: c.value.path } : {}),
          ...(typeof c.value.size === 'number' ? { size: c.value.size } : {}),
        });
      },
      clearDolaMedia: async () => {
        const r = await guard((a) => a.clearDolaMedia());
        if (!r.ok) return r;
        // ★ 后端 `dola-media-clear` 恒返 `{ok:true}`（`main.js`）⇒ fail-closed
        const c = checkOk(r.value, { fallback: HOST_TEXT.fallbackClear });
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
        // ★ 后端 `main.js` 两条 return 都带 `ok` ⇒ fail-closed 收口（TD-04-5）
        const c = checkOk<{ cleared?: unknown; failed?: unknown }>(r.value, {
          fallback: HOST_TEXT.fallbackClearBrowserCache,
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
    license,
    api: createElectronApiPort(),
  };
}
