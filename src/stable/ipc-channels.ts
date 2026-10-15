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

export const IPC_CHANNELS = {
  /**
   * 非 IPC：`preload.ts` 的 `hostOSFromPlatform()` 直接算出（`process.platform`，不受指纹伪装影响）。
   * ⚠️ `ret` 位承载**类型**：值必须落在该 union 内（不撒谎）；用断言是**必须**的 ——
   *   `const X: 'a'|'b' = 'a'` 那种常量会在使用处被**窄化**成字面量（实测：`satisfies` 会只认 `'a'`）。
   */
  hostOS: { kind: 'value', channel: null, params: [], ret: 'windows' as 'windows' | 'macos' | 'linux' },
  // TODO(形状)：importFiles 的 ret —— 按 handler 实际 return 补
  importFiles: { kind: 'invoke', channel: 'import-files', params: [] },
  // TODO(形状)：saveFile 的 ret —— 按 handler 实际 return 补
  saveFile: { kind: 'invoke', channel: 'save-file', params: ['content'] },
  // TODO(形状)：loadFile 的 ret —— 按 handler 实际 return 补
  loadFile: { kind: 'invoke', channel: 'load-file', params: [] },
  // TODO(形状)：saveProjectsBackup 的 ret —— 按 handler 实际 return 补
  saveProjectsBackup: { kind: 'send', channel: 'projects-backup', params: ['json'] },
  // TODO(形状)：activateProjectStorage 的 ret —— 按 handler 实际 return 补
  activateProjectStorage: {
    kind: 'sendSync',
    channel: 'project-storage-activate-sync',
    params: ['payload'],
    note: '**不得 await**：`sendSync` 靠 `e.returnValue` 回值，渲染层拿到的是同步结果（首帧就要读对目录）',
  },
  // TODO(形状)：pickProjectStorage 的 ret —— 按 handler 实际 return 补
  pickProjectStorage: { kind: 'invoke', channel: 'project-storage-pick', params: ['payload'] },
  // TODO(形状)：saveProjectSnapshot 的 ret —— 按 handler 实际 return 补
  saveProjectSnapshot: { kind: 'send', channel: 'project-snapshot', params: ['project'] },
  // TODO(形状)：logProjectOperation 的 ret —— 按 handler 实际 return 补
  logProjectOperation: { kind: 'send', channel: 'project-operation', params: ['event'] },
  // TODO(形状)：revealProjectStorage 的 ret —— 按 handler 实际 return 补
  revealProjectStorage: { kind: 'invoke', channel: 'project-storage-reveal', params: ['storagePath'] },
  // TODO(形状)：getProjectStorageSize 的 ret —— 按 handler 实际 return 补
  getProjectStorageSize: { kind: 'invoke', channel: 'project-storage-size', params: ['storagePath'] },
  // TODO(形状)：openExternal 的 ret —— 按 handler 实际 return 补
  openExternal: { kind: 'invoke', channel: 'open-external', params: ['url'] },
  // TODO(形状)：copyImageToClipboard 的 ret —— 按 handler 实际 return 补
  copyImageToClipboard: { kind: 'invoke', channel: 'copy-image-to-clipboard', params: ['img', 'webContentsId'] },
  // TODO(形状)：attachImagesToWebview 的 ret —— 按 handler 实际 return 补
  attachImagesToWebview: { kind: 'invoke', channel: 'attach-images-to-webview', params: ['webContentsId', 'imgs'] },
  // TODO(形状)：copyTextToClipboard 的 ret —— 按 handler 实际 return 补
  copyTextToClipboard: { kind: 'invoke', channel: 'copy-text-to-clipboard', params: ['text'] },
  // TODO(形状)：pasteToWebview 的 ret —— 按 handler 实际 return 补
  pasteToWebview: { kind: 'invoke', channel: 'paste-to-webview', params: ['id'] },
  // TODO(形状)：readClipboardImage 的 ret —— 按 handler 实际 return 补
  readClipboardImage: { kind: 'invoke', channel: 'read-clipboard-image', params: [] },
  // TODO(形状)：onClipboardImageChanged 的 ret —— 按 handler 实际 return 补
  onClipboardImageChanged: { kind: 'on', channel: 'clipboard-image-changed', params: ['cb'] },
  // TODO(形状)：exportAccountCookies 的 ret —— 按 handler 实际 return 补
  exportAccountCookies: { kind: 'invoke', channel: 'export-account-cookies', params: ['partition'] },
  // TODO(形状)：importAccountCookies 的 ret —— 按 handler 实际 return 补
  importAccountCookies: { kind: 'invoke', channel: 'import-account-cookies', params: ['partition', 'cookies'] },
  // TODO(形状)：saveAccountsFile 的 ret —— 按 handler 实际 return 补
  saveAccountsFile: { kind: 'invoke', channel: 'save-accounts-file', params: ['content'] },
  // TODO(形状)：loadAccountsFile 的 ret —— 按 handler 实际 return 补
  loadAccountsFile: { kind: 'invoke', channel: 'load-accounts-file', params: [] },
  // TODO(形状)：selectFolder 的 ret —— 按 handler 实际 return 补
  selectFolder: { kind: 'invoke', channel: 'select-folder', params: [] },
  // TODO(形状)：downloadFile 的 ret —— 按 handler 实际 return 补
  downloadFile: { kind: 'invoke', channel: 'download-file', params: ['url', 'fileName'] },
  // TODO(形状)：downloadFileAs 的 ret —— 按 handler 实际 return 补
  downloadFileAs: { kind: 'invoke', channel: 'download-file-as', params: ['url', 'defaultName', 'filters'] },
  // TODO(形状)：revealPath 的 ret —— 按 handler 实际 return 补
  revealPath: { kind: 'invoke', channel: 'reveal-path', params: ['p'] },
  // TODO(形状)：getMachineCode 的 ret —— 按 handler 实际 return 补
  getMachineCode: { kind: 'invoke', channel: 'get-machine-code', params: [] },
  // TODO(形状)：getLicenseStatus 的 ret —— 按 handler 实际 return 补
  getLicenseStatus: { kind: 'invoke', channel: 'get-license-status', params: [] },
  // TODO(形状)：activateWithCode 的 ret —— 按 handler 实际 return 补
  activateWithCode: { kind: 'invoke', channel: 'activate-with-code', params: ['code'] },
  // TODO(形状)：exportMachineCode 的 ret —— 按 handler 实际 return 补
  exportMachineCode: { kind: 'invoke', channel: 'export-machine-code', params: ['machineCode'] },
  // TODO(形状)：captureRect 的 ret —— 按 handler 实际 return 补
  captureRect: { kind: 'invoke', channel: 'capture-rect', params: ['rect'] },
  // TODO(形状)：detectVideos 的 ret —— 按 handler 实际 return 补
  detectVideos: { kind: 'invoke', channel: 'detect-videos', params: ['webContentsId', 'seenKeys'] },
  // TODO(形状)：detectErrors 的 ret —— 按 handler 实际 return 补
  detectErrors: { kind: 'invoke', channel: 'detect-errors', params: ['webContentsId'] },
  // TODO(形状)：saveImageSync 的 ret —— 按 handler 实际 return 补
  saveImageSync: {
    kind: 'sendSync',
    channel: 'img-save-sync',
    params: ['dataUrl'],
    note: '**不得 await**（同 `activateProjectStorage`）：同步落盘后用 `img://` 引用',
  },
  // TODO(形状)：saveVideoFromUrl 的 ret —— 按 handler 实际 return 补
  saveVideoFromUrl: { kind: 'invoke', channel: 'save-video-from-url', params: ['url', 'referer'] },
  // TODO(形状)：imageFetchDataUrl 的 ret —— 按 handler 实际 return 补
  imageFetchDataUrl: { kind: 'invoke', channel: 'image-fetch-dataurl', params: ['url'] },
  // TODO(形状)：clearBrowserCache 的 ret —— 按 handler 实际 return 补
  clearBrowserCache: { kind: 'invoke', channel: 'clear-browser-cache', params: [] },
  // TODO(形状)：startFileDrag 的 ret —— 按 handler 实际 return 补
  startFileDrag: { kind: 'send', channel: 'start-file-drag', params: ['payload'] },
  // TODO(形状)：ensureFingerprint 的 ret —— 按 handler 实际 return 补
  ensureFingerprint: { kind: 'invoke', channel: 'ensure-fingerprint', params: ['acc'] },
  // TODO(形状)：fpNetDiag 的 ret —— 按 handler 实际 return 补
  fpNetDiag: { kind: 'invoke', channel: 'fp-net-diag', params: ['partition'] },
  // TODO(形状)：ensurePlainSession 的 ret —— 按 handler 实际 return 补
  ensurePlainSession: { kind: 'invoke', channel: 'ensure-plain-session', params: ['acc'] },
  // TODO(形状)：ensureLovartContainer 的 ret —— 按 handler 实际 return 补
  ensureLovartContainer: { kind: 'invoke', channel: 'ensure-lovart-container', params: ['acc'] },
  // TODO(形状)：clearAccountSession 的 ret —— 按 handler 实际 return 补
  clearAccountSession: { kind: 'invoke', channel: 'clear-account-session', params: ['partition'] },
  // TODO(形状)：setAccountProxy 的 ret —— 按 handler 实际 return 补
  setAccountProxy: { kind: 'invoke', channel: 'set-account-proxy', params: ['partition', 'proxy'] },
  // TODO(形状)：ensureLovartFirefoxProfile 的 ret —— 按 handler 实际 return 补
  ensureLovartFirefoxProfile: { kind: 'invoke', channel: 'ensure-lovart-firefox-profile', params: ['accountId'] },
  // TODO(形状)：openLovartFirefox 的 ret —— 按 handler 实际 return 补
  openLovartFirefox: { kind: 'invoke', channel: 'open-lovart-firefox', params: ['args'] },
  // TODO(形状)：removeLovartFirefoxProfile 的 ret —— 按 handler 实际 return 补
  removeLovartFirefoxProfile: { kind: 'invoke', channel: 'remove-lovart-firefox-profile', params: ['accountId'] },
  // TODO(形状)：getFirefoxStatus 的 ret —— 按 handler 实际 return 补
  getFirefoxStatus: { kind: 'invoke', channel: 'get-firefox-status', params: [] },
  // TODO(形状)：ensureLovartChrome 的 ret —— 按 handler 实际 return 补
  ensureLovartChrome: { kind: 'invoke', channel: 'ensure-lovart-chrome', params: ['args'] },
  // TODO(形状)：closeLovartChrome 的 ret —— 按 handler 实际 return 补
  closeLovartChrome: { kind: 'invoke', channel: 'close-lovart-chrome', params: ['args'] },
  // TODO(形状)：syncLovartSession 的 ret —— 按 handler 实际 return 补
  syncLovartSession: { kind: 'invoke', channel: 'sync-lovart-session', params: ['args'] },
  // TODO(形状)：lovartChromeIsOpen 的 ret —— 按 handler 实际 return 补
  lovartChromeIsOpen: { kind: 'invoke', channel: 'lovart-chrome-is-open', params: ['accountId'] },
  // TODO(形状)：getLovartChromeStatus 的 ret —— 按 handler 实际 return 补
  getLovartChromeStatus: { kind: 'invoke', channel: 'get-lovart-chrome-status', params: [] },
  // TODO(形状)：onDolaMedia 的 ret —— 按 handler 实际 return 补
  onDolaMedia: { kind: 'on', channel: 'dola-media-update', params: ['cb'] },
  // TODO(形状)：downloadDolaMedia 的 ret —— 按 handler 实际 return 补
  downloadDolaMedia: { kind: 'invoke', channel: 'dola-media-download', params: ['url', 'mediaType'] },
  // TODO(形状)：clearDolaMedia 的 ret —— 按 handler 实际 return 补
  clearDolaMedia: { kind: 'invoke', channel: 'dola-media-clear', params: [] },
  // TODO(形状)：lovartFetchImages 的 ret —— 按 handler 实际 return 补
  lovartFetchImages: { kind: 'invoke', channel: 'lovart-fetch-images', params: ['args'] },
  // TODO(形状)：onLovartFetchItem 的 ret —— 按 handler 实际 return 补
  onLovartFetchItem: { kind: 'on', channel: 'lovart-fetch-item', params: ['cb'] },
  // TODO(形状)：onLovartFetchDone 的 ret —— 按 handler 实际 return 补
  onLovartFetchDone: { kind: 'on', channel: 'lovart-fetch-done', params: ['cb'] },
  // TODO(形状)：lovartScanFrames 的 ret —— 按 handler 实际 return 补
  lovartScanFrames: { kind: 'invoke', channel: 'lovart-scan-frames', params: ['args'] },
  // TODO(形状)：lovartDiag 的 ret —— 按 handler 实际 return 补
  lovartDiag: { kind: 'invoke', channel: 'lovart-diag', params: ['payload'] },
  // TODO(形状)：lovartDiagOpen 的 ret —— 按 handler 实际 return 补
  lovartDiagOpen: { kind: 'invoke', channel: 'lovart-diag-open', params: [] },
  // TODO(形状)：lovartDomDump 的 ret —— 按 handler 实际 return 补
  lovartDomDump: { kind: 'invoke', channel: 'lovart-dom-dump', params: ['args'] },
  // TODO(形状)：getDownloadSettings 的 ret —— 按 handler 实际 return 补
  getDownloadSettings: { kind: 'invoke', channel: 'get-download-settings', params: [] },
  // TODO(形状)：pickDownloadPath 的 ret —— 按 handler 实际 return 补
  pickDownloadPath: { kind: 'invoke', channel: 'pick-download-path', params: [] },
  // TODO(形状)：injectDolaDurationMain 的 ret —— 按 handler 实际 return 补
  injectDolaDurationMain: { kind: 'invoke', channel: 'inject-dola-duration-main', params: ['webContentsId'] },
  // TODO(形状)：dolaDurationDiag 的 ret —— 按 handler 实际 return 补
  dolaDurationDiag: { kind: 'invoke', channel: 'dola-duration-diag', params: ['message'] },
  // TODO(形状)：attachDolaDebugger 的 ret —— 按 handler 实际 return 补
  attachDolaDebugger: { kind: 'invoke', channel: 'attach-dola-debugger', params: ['webContentsId'] },
  // TODO(形状)：apiProvidersList 的 ret —— 按 handler 实际 return 补
  apiProvidersList: { kind: 'invoke', channel: 'api-providers:list', params: [] },
  // TODO(形状)：apiConfigGet 的 ret —— 按 handler 实际 return 补
  apiConfigGet: { kind: 'invoke', channel: 'api-config:get', params: [] },
  // TODO(形状)：apiConfigSet 的 ret —— 按 handler 实际 return 补
  apiConfigSet: { kind: 'invoke', channel: 'api-config:set', params: ['providerId', 'patch'] },
  // TODO(形状)：apiConfigSetKey 的 ret —— 按 handler 实际 return 补
  apiConfigSetKey: { kind: 'invoke', channel: 'api-config:set-key', params: ['providerId', 'key'] },
  // TODO(形状)：apiConfigTest 的 ret —— 按 handler 实际 return 补
  apiConfigTest: { kind: 'invoke', channel: 'api-config:test', params: ['providerId'] },
  // TODO(形状)：apiJobSubmit 的 ret —— 按 handler 实际 return 补
  apiJobSubmit: { kind: 'invoke', channel: 'api-job:submit', params: ['payload'] },
  // TODO(形状)：apiJobBatch 的 ret —— 按 handler 实际 return 补
  apiJobBatch: { kind: 'invoke', channel: 'api-job:batch', params: ['basePayload', 'matrix'] },
  // TODO(形状)：apiJobCancel 的 ret —— 按 handler 实际 return 补
  apiJobCancel: { kind: 'invoke', channel: 'api-job:cancel', params: ['jobId'] },
  // TODO(形状)：apiJobList 的 ret —— 按 handler 实际 return 补
  apiJobList: { kind: 'invoke', channel: 'api-job:list', params: [] },
  // TODO(形状)：apiSetupGet 的 ret —— 按 handler 实际 return 补
  apiSetupGet: { kind: 'invoke', channel: 'api-setup:get', params: [] },
  // TODO(形状)：apiSetupSet 的 ret —— 按 handler 实际 return 补
  apiSetupSet: { kind: 'invoke', channel: 'api-setup:set', params: ['patch'] },
  // TODO(形状)：apiConfigSetSecret 的 ret —— 按 handler 实际 return 补
  apiConfigSetSecret: { kind: 'invoke', channel: 'api-config:set-secret', params: ['providerId', 'key'] },
  // TODO(形状)：onApiJobEvent 的 ret —— 按 handler 实际 return 补
  onApiJobEvent: { kind: 'on', channel: 'api-job-event', params: ['cb'] },

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
    params: [],
    backendOnly: true,
    note: '后端独有注册：原版亦然（见上方回源结论）⇒ 保留；渲染层从不调用它',
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
    ? (...args: never[]) => unknown
    : IpcChannelMap[K]['kind'] extends 'send'
      ? (...args: never[]) => void
      : IpcChannelMap[K]['kind'] extends 'on'
        ? (cb: (...a: unknown[]) => void) => () => void
        : IpcChannelMap[K]['kind'] extends 'value'
          ? IpcChannelMap[K] extends { ret: infer R } ? R : unknown
          : (...args: never[]) => Promise<unknown>;
};


