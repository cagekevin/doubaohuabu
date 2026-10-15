// ============================================================
// 渲染层 ↔ 后端 的 **IPC 契约唯一真源**
//   名 · 种类 · 频道名 · 参数元组 · 回执形状 · note —— 两端的对齐**只在这里写一次**。
// ------------------------------------------------------------
// · 住 `stable` 是**按定位**：它就是"冻结契约"的家（与那 20 键同族）；契约是**共享物**，不归某一端私有。
// · 名面由 `draft-channel-map.mjs` 从 `electron/preload.ts` 抽出（脚本出草稿 · 人补判断位）；
//   字段面（回执形状 · note）按 §5.2：**随各自 handler 的转换同批补**，B1 只锁名面。
// · 两端同源受检：后端 `electron/preload.ts` 的对象 `satisfies WindowApi`
//   ⇒ 漏一个 / 多一个 / 改名 / 种类不符，**编译期当场红**（这就是它替代"人工对账"的方式）。
// · `ret` 只承载**类型**（运行时不经表）：所以形状写成"值"、取的是它的**类型**。
// ============================================================

export type ChannelKind = 'invoke' | 'send' | 'sendSync' | 'on' | 'value';

export interface ChannelSpec {
  readonly kind: ChannelKind;
  /** 频道名（`value` 类为 null —— 它不是 IPC，只是同批暴露给渲染层的常量） */
  readonly channel: string | null;
  /** 形参名（顺序即调用序） */
  readonly params: readonly string[];
  /**
   * 回执**原始**形状：**这个值的类型**就是形状（运行时不经表 —— 表只承载类型）。
   * B1 只锁名面（§5.2）⇒ 先留空；精确形状随各自 handler 的转换同批补（锚点用符号名，禁行号）。
   */
  readonly ret?: unknown;
  readonly note?: string;
  /**
   * **后端注册、但未暴露给渲染层**的频道（如 `open-lovart-chrome`：原版亦如此，见其 note）。
   * 它仍在**同一张表**里（"覆盖全仓 `ipcMain.handle/on`"才是可核验的），
   * 但被 `WindowApi` 的类型层滤掉 ⇒ 不会反过来要求 `preload` 暴露它。
   */
  readonly backendOnly?: true;
}

/**
 * **公共失败分支**：`electron/ipc.ts` 的 `handle` **注册处守卫**把处理器抛出的异常统一转成这个形状
 * （`{ ok: false, error: causeText(e) }`）⇒ 每个 `invoke` 条目的回执都含这一支，故抽出来免重复。
 */
export interface IpcFail {
  ok: false;
  error: string;
}

/**
 * 各条 `ret` 的**取证锚点**（§9.1 R1：锚点用符号名、**禁行号**）：就是**同频道名**在
 * `electron/**` 里的那个 `handle('<channel>', …)` 处理器（或它直接 `return` 委托的同域函数 —— 脚本
 * `draft-handler-returns.mjs` 会把委托展开一层）。形状一律照处理器**实际 return** 写，⛔ 不按期望猜。
 */
export const IPC_CHANNELS = {
  /**
   * 非 IPC：`preload.ts` 的 `hostOSFromPlatform()` 直接算出（`process.platform`，不受指纹伪装影响）。
   * ⚠️ `ret` 位承载**类型**：值必须落在该 union 内（不撒谎）；用断言是**必须**的 ——
   *   `const X: 'a'|'b' = 'a'` 那种常量会在使用处被**窄化**成字面量（实测：`satisfies` 会只认 `'a'`）。
   */
  hostOS: { kind: 'value', channel: null, params: [], ret: 'windows' as 'windows' | 'macos' | 'linux' },
  importFiles: {
    kind: 'invoke',
    channel: 'import-files',
    params: [],
    ret: [] as { name: string; fullName: string; dataUrl: unknown }[],
  },
  saveFile: { kind: 'invoke', channel: 'save-file', params: ['content'], ret: true as boolean | IpcFail },
  loadFile: { kind: 'invoke', channel: 'load-file', params: [], ret: null as string | null | IpcFail },
  saveProjectsBackup: { kind: 'send', channel: 'projects-backup', params: ['json'], ret: undefined as void },
  activateProjectStorage: {
    kind: 'sendSync',
    channel: 'project-storage-activate-sync',
    params: ['payload'],
    note: '**不得 await**：`sendSync` 靠 `e.returnValue` 回值，渲染层拿到的是同步结果（首帧就要读对目录）',
    ret: { ok: false, error: '' } as { ok: true; path: string } | IpcFail,
  },
  pickProjectStorage: {
    kind: 'invoke',
    channel: 'project-storage-pick',
    params: ['payload'],
    ret: { ok: false, error: '' } as
      | { ok: false; canceled: true }
      | { ok: true; path: string; migrated: { images: number; videos: number } }
      | IpcFail,
  },
  saveProjectSnapshot: { kind: 'send', channel: 'project-snapshot', params: ['project'], ret: undefined as void },
  logProjectOperation: { kind: 'send', channel: 'project-operation', params: ['event'], ret: undefined as void },
  revealProjectStorage: {
    kind: 'invoke',
    channel: 'project-storage-reveal',
    params: ['storagePath'],
    ret: { ok: false, error: '' } as { ok: true; path: string } | IpcFail,
  },
  getProjectStorageSize: {
    kind: 'invoke',
    channel: 'project-storage-size',
    params: ['storagePath'],
    ret: { ok: false, error: '' } as
      | { ok: true; bytes: number; files: number; partial: boolean; elapsedMs: number }
      | IpcFail,
  },
  openExternal: { kind: 'invoke', channel: 'open-external', params: ['url'], ret: true as boolean | IpcFail },
  copyImageToClipboard: {
    kind: 'invoke',
    channel: 'copy-image-to-clipboard',
    params: ['img', 'webContentsId'],
    // 形状取自 `electron/clipboard-image.ts` 的 `copyImageToClipboard`（本文件不得 import 后端 ⇒ 形状写在表里）
    ret: { ok: false, error: '' } as
      | { ok: true; ext: string; via: 'main-native' | 'page-clipboard'; verified: boolean }
      | IpcFail,
  },
  attachImagesToWebview: {
    kind: 'invoke',
    channel: 'attach-images-to-webview',
    params: ['webContentsId', 'imgs'],
    ret: { ok: false, via: 'cdp-file-input', files: [], errors: [] } as {
      ok: boolean;
      via: string;
      files: { index: number; label: string; filePath: string; bytes: number; reused: boolean }[];
      errors: string[];
      nodeId?: number;
      accept?: string;
      count?: number;
    },
  },
  copyTextToClipboard: {
    kind: 'invoke',
    channel: 'copy-text-to-clipboard',
    params: ['text'],
    ret: { ok: false, error: '' } as { ok: true; cleanedLen: number } | IpcFail,
  },
  pasteToWebview: { kind: 'invoke', channel: 'paste-to-webview', params: ['id'], ret: { ok: true } as { ok: true } | IpcFail },
  readClipboardImage: {
    kind: 'invoke',
    channel: 'read-clipboard-image',
    params: [],
    // 形状取自 `electron/clipboard-image.ts` 的 `readClipboardImage`（四条 return）
    ret: { ok: false } as
      | { ok: true; source: string; mime: string; dataUrl: string; name?: string; w?: number; h?: number }
      | { ok: false; error?: string },
  },
  onClipboardImageChanged: { kind: 'on', channel: 'clipboard-image-changed', params: ['cb'], ret: undefined as void },
  exportAccountCookies: {
    kind: 'invoke',
    channel: 'export-account-cookies',
    params: ['partition'],
    ret: { ok: false, error: '' } as
      | {
          ok: true;
          cookies: {
            name: string;
            value: string;
            domain: string;
            path: string;
            secure: boolean;
            httpOnly: boolean;
            expirationDate?: number;
            sameSite?: string;
          }[];
          count: number;
        }
      | IpcFail,
  },
  importAccountCookies: {
    kind: 'invoke',
    channel: 'import-account-cookies',
    params: ['partition', 'cookies'],
    ret: { ok: false, error: '' } as { ok: true; restored: number; total: number } | IpcFail,
  },
  saveAccountsFile: {
    kind: 'invoke',
    channel: 'save-accounts-file',
    params: ['content'],
    ret: { ok: false, error: '' } as { ok: true; path: string } | IpcFail,
  },
  loadAccountsFile: { kind: 'invoke', channel: 'load-accounts-file', params: [], ret: null as string | null | IpcFail },
  selectFolder: { kind: 'invoke', channel: 'select-folder', params: [], ret: null as string | null | IpcFail },
  downloadFile: {
    kind: 'invoke',
    channel: 'download-file',
    params: ['url', 'fileName'],
    ret: { ok: false, error: '' } as { ok: true; path: string; size: number } | IpcFail,
  },
  downloadFileAs: {
    kind: 'invoke',
    channel: 'download-file-as',
    params: ['url', 'defaultName', 'filters'],
    ret: { ok: false, error: '' } as
      | { ok: false; canceled: true }
      | { ok: false; canceled: false; error: string }
      | { ok: true; canceled: false; path: string; size: number }
      | IpcFail,
  },
  revealPath: { kind: 'invoke', channel: 'reveal-path', params: ['p'], ret: { ok: false, error: '' } as { ok: true; path: string } | IpcFail },
  getMachineCode: {
    kind: 'invoke',
    channel: 'get-machine-code',
    params: [],
    ret: { ok: false, error: '' } as { ok: true; machineCode: string } | IpcFail,
  },
  getLicenseStatus: {
    kind: 'invoke',
    channel: 'get-license-status',
    params: [],
    // 形状取自 `electron/license.ts` 的 `checkLicenseStatus`（`LicenseStatus` 五种状态）＋ 处理器那层 `{ ok: true, ... }`
    ret: { ok: true, status: 'none', machineCode: '' } as
      | ({ ok: true } & (
          | { status: 'none'; machineCode: string }
          | { status: 'invalid'; machineCode: string; reason: string }
          | {
              status: 'tampered';
              machineCode: string;
              tamperReason?: string | undefined;
              expireAt?: unknown;
              activatedAt?: unknown;
            }
          | { status: 'expired'; machineCode: string; expireAt?: unknown; activatedAt?: unknown }
          | { status: 'ok'; machineCode: string; expireAt?: unknown; activatedAt?: unknown }
        ))
      | IpcFail,
  },
  activateWithCode: {
    kind: 'invoke',
    channel: 'activate-with-code',
    params: ['code'],
    // 形状取自 `electron/license.ts` 的 `activateWithCode`（四个 return ＋ 成功分支）
    ret: { ok: false, status: 'invalid', error: '' } as
      | { ok: false; status: 'invalid'; error: string }
      | { ok: false; status: 'tampered'; tamperReason: string; error: string }
      | { ok: false; status: 'used'; error: string }
      | { ok: true; status: 'ok'; expireAt: number; activatedAt: number; machineCode: string }
      | IpcFail,
  },
  exportMachineCode: {
    kind: 'invoke',
    channel: 'export-machine-code',
    params: ['machineCode'],
    ret: { ok: false, error: '' } as { ok: true; path: string } | IpcFail,
  },
  captureRect: {
    kind: 'invoke',
    channel: 'capture-rect',
    params: ['rect'],
    ret: { ok: false, error: '' } as { ok: true; dataUrl: string } | IpcFail,
  },
  detectVideos: {
    kind: 'invoke',
    channel: 'detect-videos',
    params: ['webContentsId', 'seenKeys'],
    // ⛔ 不在表里再写一份形状：回执由**页内注入脚本**（`DETECT_JS`，见 `electron/main.ts`）产出
    //   —— 成功是 `{ ok: true, videos: […], _diag }`、异常分支是 `{ ok: false, error, _diag? }`，
    //   而脚本跑在 guest 主世界 ⇒ 形状以**脚本字面量**为准（写第二份就是第二载体）。
    ret: null as unknown,
  },
  detectErrors: {
    kind: 'invoke',
    channel: 'detect-errors',
    params: ['webContentsId'],
    // 同上：形状出自 `ERROR_JS`（本仓源码里的字面量）⇒ 这里只记它写出来的那几个键
    ret: { ok: false, errors: [], error: '' } as
      | { ok: true; errors: { type: string; message: string }[] }
      | { ok: false; errors: []; error?: string },
  },
  saveImageSync: {
    kind: 'sendSync',
    channel: 'img-save-sync',
    params: ['dataUrl'],
    note: '**不得 await**（同 `activateProjectStorage`）：同步落盘后用 `img://` 引用',
    // ⚠️ 处理器写的是 `persistImageDataUrl(dataUrl)`，其返回类型是 `unknown`（源里入参就是任意值）
    //   ⇒ 表里如实写 `unknown`。渲染层手写面原写 `string` —— 要在 B1-b 定：收窄 handler 形参、还是渲染侧自行窄化。
    ret: null as unknown,
  },
  saveVideoFromUrl: {
    kind: 'invoke',
    channel: 'save-video-from-url',
    params: ['url', 'referer'],
    ret: { ok: false, error: '' } as { ok: true; ref: string; size: number; cached?: boolean } | IpcFail,
  },
  imageFetchDataUrl: {
    kind: 'invoke',
    channel: 'image-fetch-dataurl',
    params: ['url'],
    ret: { ok: false, error: '' } as { ok: true; mime: string; dataUrl: string } | IpcFail,
  },
  clearBrowserCache: {
    kind: 'invoke',
    channel: 'clear-browser-cache',
    params: [],
    ret: { ok: false, error: '' } as { ok: true; cleared: number; failed: number } | IpcFail,
  },
  startFileDrag: { kind: 'send', channel: 'start-file-drag', params: ['payload'], ret: undefined as void },
  ensureFingerprint: {
    kind: 'invoke',
    channel: 'ensure-fingerprint',
    params: ['acc'],
    ret: { ok: false, error: '' } as { ok: true; preloadUrl: string } | IpcFail,
  },
  fpNetDiag: {
    kind: 'invoke',
    channel: 'fp-net-diag',
    params: ['partition'],
    ret: { ok: false, error: '' } as
      | { ok: true; proxy: string; engineChrome: string; hostPlatform: string }
      | IpcFail,
  },
  ensurePlainSession: {
    kind: 'invoke',
    channel: 'ensure-plain-session',
    params: ['acc'],
    ret: { ok: false, error: '' } as { ok: true; userAgent: string; acceptLanguage: string } | IpcFail,
  },
  ensureLovartContainer: {
    kind: 'invoke',
    channel: 'ensure-lovart-container',
    params: ['acc'],
    ret: { ok: false, error: '' } as
      | { ok: true; userAgent: string; preloadUrl: null; proxy: string }
      | IpcFail,
  },
  clearAccountSession: {
    kind: 'invoke',
    channel: 'clear-account-session',
    params: ['partition'],
    ret: { ok: false, error: '' } as { ok: true } | IpcFail,
  },
  setAccountProxy: {
    kind: 'invoke',
    channel: 'set-account-proxy',
    params: ['partition', 'proxy'],
    ret: { ok: false, error: '' } as { ok: true; applied: string } | IpcFail,
  },
  ensureLovartFirefoxProfile: {
    kind: 'invoke',
    channel: 'ensure-lovart-firefox-profile',
    params: ['accountId'],
    ret: { ok: true } as { ok: true } | IpcFail,
  },
  openLovartFirefox: {
    kind: 'invoke',
    channel: 'open-lovart-firefox',
    params: ['args'],
    // 形状取自 `electron/firefox.ts` 的 `launch`（`LaunchResult`）
    ret: { ok: false, error: '' } as
      | { ok: true; executable: string; profile: string; args: string[]; command: string }
      | { ok: false; error: string; command?: string },
  },
  removeLovartFirefoxProfile: {
    kind: 'invoke',
    channel: 'remove-lovart-firefox-profile',
    params: ['accountId'],
    ret: { ok: true } as { ok: true } | IpcFail,
  },
  getFirefoxStatus: {
    kind: 'invoke',
    channel: 'get-firefox-status',
    params: [],
    ret: { ok: false, error: '' } as
      | { available: boolean; bundled: boolean; path: string | null; addonInstalled: boolean }
      | IpcFail,
  },
  ensureLovartChrome: {
    kind: 'invoke',
    channel: 'ensure-lovart-chrome',
    params: ['args'],
    // 形状取自 `electron/chrome-cdp.ts` 的 `ensureLovartChrome`（`EnsureResult`）
    ret: { ok: false, error: '' } as
      | { ok: true; alreadyOpen: true }
      | { ok: true; profileDir: string }
      | { ok: false; error: string; message?: string }
      | IpcFail,
  },
  closeLovartChrome: {
    kind: 'invoke',
    channel: 'close-lovart-chrome',
    params: ['args'],
    ret: { ok: false, error: '' } as { ok: true; wasOpen: boolean } | IpcFail,
  },
  syncLovartSession: {
    kind: 'invoke',
    channel: 'sync-lovart-session',
    params: ['args'],
    ret: { ok: false, error: '' } as
      | { ok: false; error: string; message?: string }
      | { ok: true; count: number; total: number; rawTotal: number }
      | IpcFail,
  },
  lovartChromeIsOpen: {
    kind: 'invoke',
    channel: 'lovart-chrome-is-open',
    params: ['accountId'],
    ret: { ok: false, error: '' } as { ok: boolean; open: boolean } | IpcFail,
  },
  getLovartChromeStatus: {
    kind: 'invoke',
    channel: 'get-lovart-chrome-status',
    params: [],
    // 形状取自 `electron/chrome-cdp.ts` 的 `getStatus`（`{ available, path, open }`）
    ret: { ok: false, error: '' } as
      | { ok: true; available: boolean; path: string | null; open: unknown[] }
      | IpcFail,
  },
  onDolaMedia: { kind: 'on', channel: 'dola-media-update', params: ['cb'], ret: undefined as void },
  downloadDolaMedia: {
    kind: 'invoke',
    channel: 'dola-media-download',
    params: ['url', 'mediaType'],
    ret: { ok: false, error: '' } as
      | { ok: true; path: string; size: number; name: string; dir: string; configured: boolean }
      | IpcFail,
  },
  clearDolaMedia: { kind: 'invoke', channel: 'dola-media-clear', params: [], ret: { ok: true } as { ok: true } | IpcFail },
  lovartFetchImages: {
    kind: 'invoke',
    channel: 'lovart-fetch-images',
    params: ['args'],
    ret: { ok: false, error: '' } as { ok: true; jobId: string; total: number } | IpcFail,
  },
  onLovartFetchItem: { kind: 'on', channel: 'lovart-fetch-item', params: ['cb'], ret: undefined as void },
  onLovartFetchDone: { kind: 'on', channel: 'lovart-fetch-done', params: ['cb'], ret: undefined as void },
  lovartScanFrames: {
    kind: 'invoke',
    channel: 'lovart-scan-frames',
    params: ['args'],
    // `frames` 的元素形状出自**按 frame 注入的采集脚本**（`electron/lovart-scan.ts`）⇒ 元素记 `unknown`
    ret: { ok: false, error: '' } as { ok: true; frames: unknown[]; logPath: string } | IpcFail,
  },
  lovartDiag: {
    kind: 'invoke',
    channel: 'lovart-diag',
    params: ['payload'],
    ret: { ok: false, error: '' } as { ok: true; path: string } | IpcFail,
  },
  lovartDiagOpen: {
    kind: 'invoke',
    channel: 'lovart-diag-open',
    params: [],
    ret: { ok: false, error: '' } as { ok: true; path: string } | IpcFail,
  },
  lovartDomDump: {
    kind: 'invoke',
    channel: 'lovart-dom-dump',
    params: ['args'],
    ret: { ok: false, error: '' } as
      | { ok: false; error: string; dump?: unknown }
      | { ok: true; path: string; summary: unknown }
      | IpcFail,
  },
  getDownloadSettings: {
    kind: 'invoke',
    channel: 'get-download-settings',
    params: [],
    ret: { ok: false, error: '' } as
      | { ok: true; path: string; configured: boolean; configuredPath: string }
      | IpcFail,
  },
  pickDownloadPath: {
    kind: 'invoke',
    channel: 'pick-download-path',
    params: [],
    ret: { ok: false, error: '' } as
      | { ok: false; canceled: true }
      | { ok: true; path: string; configured: boolean }
      | IpcFail,
  },
  injectDolaDurationMain: {
    kind: 'invoke',
    channel: 'inject-dola-duration-main',
    params: ['webContentsId'],
    ret: { ok: false, error: '' } as { ok: true } | IpcFail,
  },
  dolaDurationDiag: {
    kind: 'invoke',
    channel: 'dola-duration-diag',
    params: ['message'],
    ret: { ok: false, error: '' } as { ok: true; path: string } | IpcFail,
  },
  attachDolaDebugger: {
    kind: 'invoke',
    channel: 'attach-dola-debugger',
    params: ['webContentsId'],
    ret: { ok: false, error: '' } as { ok: true; url: string } | IpcFail,
  },
  apiProvidersList: {
    kind: 'invoke',
    channel: 'api-providers:list',
    params: [],
    // `providers` 是后端 `apiRegistry.listProvidersMeta()` 的产物（服务商元数据表）⇒ 元素记 `unknown`
    ret: { ok: false, error: '' } as { ok: true; providers: unknown[] } | IpcFail,
  },
  apiConfigGet: {
    kind: 'invoke',
    channel: 'api-config:get',
    params: [],
    ret: { ok: false, error: '' } as
      | { ok: true; providers: unknown[]; configs: Record<string, unknown> }
      | IpcFail,
  },
  apiConfigSet: {
    kind: 'invoke',
    channel: 'api-config:set',
    params: ['providerId', 'patch'],
    // 后端的声明是 `Promise<OkReply | FailReply>`（`OkReply` 带索引签名、`FailReply` 的 error/message 皆可选）
    ret: { ok: false, error: '' } as
      | ({ ok: true } & Record<string, unknown>)
      | { ok: false; error?: string; message?: string }
      | IpcFail,
  },
  apiConfigSetKey: {
    kind: 'invoke',
    channel: 'api-config:set-key',
    params: ['providerId', 'key'],
    ret: { ok: false, error: '' } as
      | { ok: true; keyHint: unknown; maskedBy: string }
      | { ok: false; error?: string; message?: string }
      | IpcFail,
  },
  apiConfigTest: {
    kind: 'invoke',
    channel: 'api-config:test',
    params: ['providerId'],
    // 处理器**自带显式注解** `{ ok: boolean; message: string }`（回执用 `message`，与守卫的 `error` 不同）
    ret: { ok: false, message: '' } as { ok: boolean; message: string } | IpcFail,
  },
  apiJobSubmit: {
    kind: 'invoke',
    channel: 'api-job:submit',
    params: ['payload'],
    // 处理器**自带显式注解** `Promise<unknown>`（透传 `jobManager?.submit(...)`）
    ret: null as unknown,
  },
  apiJobBatch: {
    kind: 'invoke',
    channel: 'api-job:batch',
    params: ['basePayload', 'matrix'],
    // 同上（`Promise<unknown>`，透传 `jobManager?.submitBatch(...)`）
    ret: null as unknown,
  },
  apiJobCancel: {
    kind: 'invoke',
    channel: 'api-job:cancel',
    params: ['jobId'],
    // 同上（`Promise<unknown>`，表达式体箭头 ⇒ 回执就是 `jobManager?.cancel(...)`）
    ret: null as unknown,
  },
  apiJobList: {
    kind: 'invoke',
    channel: 'api-job:list',
    params: [],
    ret: { ok: false, error: '' } as { ok: true; jobs: unknown[] } | IpcFail,
  },
  apiSetupGet: {
    kind: 'invoke',
    channel: 'api-setup:get',
    params: [],
    ret: { ok: false, error: '' } as { ok: true; setup: unknown; usage: unknown } | IpcFail,
  },
  apiSetupSet: {
    kind: 'invoke',
    channel: 'api-setup:set',
    params: ['patch'],
    ret: { ok: false, error: '' } as { ok: true; setup: unknown } | IpcFail,
  },
  apiConfigSetSecret: {
    kind: 'invoke',
    channel: 'api-config:set-secret',
    params: ['providerId', 'key'],
    ret: { ok: false, error: '' } as
      | { ok: true; hasSecret: true }
      | { ok: false; error?: string; message?: string }
      | IpcFail,
  },
  onApiJobEvent: { kind: 'on', channel: 'api-job-event', params: ['cb'], ret: undefined as void },

  // ── 后端独有：注册了、但渲染层没有名面（`backendOnly` ⇒ 被 `WindowApi` 滤掉）──
  /**
   * `electron/chrome-cdp.js` 注册了它；`preload` 无同名成员，`src/` 也零消费。
   * ★ **回源结论（A 级证据）**：原版**亦如此** —— 原版 `main.js` 有 `ipcMain.handle('open-lovart-chrome', …)`，
   *   而原版 `preload.js` 的渲染层面只有 `ensureLovartChrome` / `closeLovartChrome` / `syncLovartSession` /
   *   `lovartChromeIsOpen` / `getLovartChromeStatus`（**没有** `open-lovart-chrome`）。
   *   ⇒ 按本仓铁律「该不该有一律照抄源」：**保留，不删**（删它 = 改后端行为，超出迁移范围）。
   */
  'open-lovart-chrome': {
    kind: 'invoke',
    channel: 'open-lovart-chrome',
    params: ['{ accountId, url, proxy }'], // 按 handler 签名的**原文**写（解构入参），不另起名
    backendOnly: true,
    note:
      '后端独有注册：原版亦然（见上方回源结论）⇒ 保留；渲染层从不调用它。' +
      '它的"该不该有"另走债务 TD-13-30。',
    // 回执＝`ensureLovartChrome` 的产物（`EnsureResult`）或本地失败分支
    ret: { ok: false, error: '' } as
      | { ok: true; alreadyOpen: true }
      | { ok: true; profileDir: string }
      | { ok: false; error: string; message?: string }
      | IpcFail,
  },
} as const satisfies Record<string, ChannelSpec>;

export type IpcChannelMap = typeof IPC_CHANNELS;

/**
 * 渲染层原始面：**五种种类各有各的回执形态**
 *
 * ⚠️ 形参位现在是 `never[]`：它的用途是让**实现侧**（`electron/preload.ts` 的对象）**能被 `satisfies` 卡住**
 *    —— 一个只声明了 `(content)` 的箭头函数赋给 `(...args: never[]) => …` 是合法的（`never` 是底类型），
 *    而写成 `unknown[]` 会反过来卡住实现侧（逆变：`unknown` 不能赋给 `string`）。
 *    ⇒ **渲染层要能直接调用**它，需要把每个成员的**参数元组**填成真实类型 —— 那是字段面的事，
 *      按 §5.2 随各自 handler 的转换同批补（补齐前渲染侧的调用面仍以既有适配层类型为准）。
 *
 * @public 跨边界消费者：electron/preload.ts
 */
export type WindowApi = {
  // `as` 子句做**类型层分区**：`backendOnly` 的条目留在表里（对账用），但不进渲染面
  readonly [K in keyof IpcChannelMap as IpcChannelMap[K] extends { backendOnly: true } ? never : K]: IpcChannelMap[K]['kind'] extends 'sendSync'
    ? (...args: never[]) => IpcChannelMap[K] extends { ret: infer R } ? R : unknown
    : IpcChannelMap[K]['kind'] extends 'send'
      ? (...args: never[]) => void
      : IpcChannelMap[K]['kind'] extends 'on'
        ? (cb: (...a: unknown[]) => void) => () => void
        : IpcChannelMap[K]['kind'] extends 'value'
          ? IpcChannelMap[K] extends { ret: infer R } ? R : unknown
          : (...args: never[]) => Promise<IpcChannelMap[K] extends { ret: infer R } ? R : unknown>;
};


