/**
 * `window.api` 的类型声明（**冻结契约** —— 由 `electron/preload.js` 暴露）
 *
 * ⚠️ 本文件是**唯一**允许直接引用 `window.api` 的类型处。
 * ⚠️ **方法名必须与 `preload.js` 完全一致**（W1）：
 *    `scripts/check-host-api.cjs` 会把本工程用到的 `window.api.*` 与
 *    `preload.js` 的方法集做**差集**，差集必须为空。
 *
 * 实测（2026-10-10，`node scripts/extract-host-api.cjs`）：
 *   **82 个成员** = 71 `invoke` + 4 `send` + **2 `sendSync`** + **5 `on`** + 若干普通值
 *
 * ⚠️ **两个 `sendSync` 是同步调用**（返回结果而非 Promise）——
 *    `activateProjectStorage`（保证 `img://` 首帧读对目录）
 *    `saveImageSync`（供持久化链路同步落盘）
 *
 * ⚠️ **5 个 `on*` 订阅返回取消函数**，必须调用（否则泄漏）
 */

/** 未在本工程使用的宿主方法的兜底（避免 `any`；用到时按需补类型） */
type UnusedHostMethod = (...args: unknown[]) => Promise<unknown>;

export interface HostApi {
  // ── 普通值 ──
  /** 真实宿主平台（**不读 navigator** —— docs/10 #59） */
  readonly hostOS: 'windows' | 'macos' | 'linux';

  // ── 文件 ──
  importFiles(): Promise<unknown>;
  saveFile(content: string): Promise<unknown>;
  loadFile(): Promise<unknown>;
  selectFolder(): Promise<unknown>;
  downloadFile(url: string, fileName?: string): Promise<unknown>;
  downloadFileAs(url: string, defaultName?: string, filters?: unknown): Promise<unknown>;
  openExternal(url: string): Promise<unknown>;
  revealPath(path: string): Promise<unknown>;
  showInFolder(path: string): Promise<unknown>;
  pickDownloadPath(): Promise<unknown>;
  getDownloadSettings(): Promise<unknown>;

  // ── 剪贴板 ──
  readClipboardImage(): Promise<unknown>;
  copyImageToClipboard(dataUrl: string): Promise<unknown>;
  copyTextToClipboard(text: string): Promise<unknown>;
  pasteToWebview(webContentsId: number): Promise<unknown>;
  attachImagesToWebview(webContentsId: number, imgs: unknown): Promise<unknown>;
  /** ★ 订阅：返回取消函数 */
  onClipboardImageChanged(cb: () => void): () => void;

  // ── 工程存储（磁盘侧） ──
  /** ★ **sendSync**：同步返回 `{path}` */
  activateProjectStorage(payload: unknown): { path?: string };
  pickProjectStorage(payload: unknown): Promise<unknown>;
  /** `send`（无返回） */
  saveProjectsBackup(json: string): void;
  /** `send`（无返回） */
  saveProjectSnapshot(project: unknown): void;
  /** `send`（无返回） */
  logProjectOperation(event: unknown): void;
  revealProjectStorage(storagePath: string): Promise<unknown>;
  getProjectStorageSize(storagePath: string): Promise<unknown>;

  // ── 媒体 ──
  /** ★ **sendSync**：同步返回 `img://` 引用 */
  saveImageSync(dataUrl: string): string;
  saveVideoFromUrl(url: string, referer?: string): Promise<unknown>;
  resolveImageRef(ref: string): Promise<unknown>;
  imageFetchDataUrl(url: string): Promise<unknown>;
  captureRect(rect: unknown): Promise<unknown>;
  startFileDrag(payload: unknown): void;
  clearBrowserCache(): Promise<unknown>;

  // ── 账号 / 会话 / 指纹 ──
  ensureFingerprint(accountId: string): Promise<unknown>;
  ensurePlainSession(accountId: string): Promise<unknown>;
  ensureLovartContainer(account: unknown): Promise<unknown>;
  clearAccountSession(partition: string): Promise<unknown>;
  setAccountProxy(partition: string, proxy: string): Promise<unknown>;
  fpNetDiag(partition: string): Promise<unknown>;

  // ── 许可 ──
  getMachineCode(): Promise<unknown>;
  getLicenseStatus(): Promise<unknown>;
  activateWithCode(code: string): Promise<unknown>;
  exportMachineCode(machineCode: string): Promise<unknown>;

  // ── 第三方 API provider ──
  apiProvidersList(): Promise<unknown>;
  apiConfigGet(): Promise<unknown>;
  apiConfigSet(providerId: string, patch: unknown): Promise<unknown>;
  apiConfigSetKey(providerId: string, key: string): Promise<unknown>;
  apiConfigSetSecret(providerId: string, key: string): Promise<unknown>;
  apiConfigTest(providerId: string): Promise<unknown>;
  apiJobSubmit(payload: unknown): Promise<unknown>;
  apiJobBatch(basePayload: unknown, matrix: unknown): Promise<unknown>;
  apiJobCancel(jobId: string): Promise<unknown>;
  apiJobList(): Promise<unknown>;
  apiSetupGet(): Promise<unknown>;
  apiSetupSet(patch: unknown): Promise<unknown>;
  /** ★ 订阅：返回取消函数 */
  onApiJobEvent(cb: (payload: unknown) => void): () => void;

  // ── 站点集成（M6 用） ──
  lovartChromeIsOpen(): Promise<unknown>;
  lovartScanFrames(args: unknown): Promise<unknown>;
  lovartFetchImages(payload: unknown): Promise<unknown>;
  lovartDiag(message: unknown): Promise<unknown>;
  lovartDiagOpen(): Promise<unknown>;
  lovartDomDump(): Promise<unknown>;
  /** ★ 订阅：返回取消函数 */
  onLovartFetchItem(cb: (payload: unknown) => void): () => void;
  /** ★ 订阅：返回取消函数 */
  onLovartFetchDone(cb: (payload: unknown) => void): () => void;
  /** ★ 订阅：返回取消函数 */
  onDolaMedia(cb: (payload: unknown) => void): () => void;
  downloadDolaMedia(url: string, mediaType?: string): Promise<unknown>;
  clearDolaMedia(): Promise<unknown>;
  attachDolaDebugger(webContentsId: number): Promise<unknown>;
  injectDolaDurationMain(webContentsId: number): Promise<unknown>;
  dolaDurationDiag(message: unknown): Promise<unknown>;

  // ── 兜底：未使用但存在的方法（禁止调用不存在的 —— W1） ──
  readonly [k: string]: unknown | UnusedHostMethod;
}

declare global {
  interface Window {
    /** 仅在 Electron 宿主里存在（`preload.js` 注入） */
    api?: HostApi;
  }
}
