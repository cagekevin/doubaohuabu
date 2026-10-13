import type { HostOS } from '@/constants';
/**
 * `window.api` 的类型声明（**冻结契约** —— 由 `electron/preload.js` 暴露）
 *
 * ⚠️ 本文件是**唯一**允许直接引用 `window.api` 的类型处（全仓唯一读者 = `./host-api.ts`，
 *    它用**局部** `(window as { api?: HostApi })` 取用 ⇒ **本文件不声明 `declare global`**，
 *    否则任何层写 `window.api.X` 都能编译，红线①（原则 3 / `TD-05-1`）就失守）。
 * ⚠️ **方法名必须与 `preload.js` 完全一致**（W1）：本接口**无索引签名**
 *    ⇒ 读写任何**未声明**的成员**编译不过**（这就是 W1 的机器守卫）。
 *    与 preload 的**差集核对**用 `scripts/extract-host-api.cjs` 抽取比对（人工）。
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

export interface HostApi {
  // ── 普通值 ──
  /** 真实宿主平台（**不读 navigator** —— docs/过程.md #59） */
  readonly hostOS: HostOS;

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
  /** ⚠️ 载荷是 **`{dataUrl, label}` 对象** + 目标 `webContentsId`（`main.js:1382`） */
  copyImageToClipboard(img: unknown, webContentsId?: number): Promise<unknown>;
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
  /** ★ 检测站点页里的视频（`preload.js:69` → `detect-videos` handler） */
  detectVideos(webContentsId: number, seenKeys: readonly string[]): Promise<unknown>;
  startFileDrag(payload: unknown): void;
  clearBrowserCache(): Promise<unknown>;

  // ── 账号 / 会话 / 指纹 ──
  /** ⚠️ 收的是**账号对象**（`{id, partition, fingerprint}`），不是 id 字符串（`preload.js:89`） */
  ensureFingerprint(account: unknown): Promise<unknown>;
  /** ⚠️ 同上（`preload.js:94`） */
  ensurePlainSession(account: unknown): Promise<unknown>;
  /** ⚠️ 同上，多 `containerId` / `proxy`（`preload.js:97`） */
  ensureLovartContainer(account: unknown): Promise<unknown>;
  clearAccountSession(partition: string): Promise<unknown>;
  setAccountProxy(partition: string, proxy: string): Promise<unknown>;
  fpNetDiag(partition: string): Promise<unknown>;
  /** 真实 Chrome 登录窗口（`preload.js:110`）—— 收 `{accountId, url?, proxy?}` */
  ensureLovartChrome(args: unknown): Promise<unknown>;
  /** 关闭真实 Chrome 登录窗口（`preload.js:111`）—— 收 `{accountId}` */
  closeLovartChrome(args: unknown): Promise<unknown>;
  /** 会话 cookie 同步进 webview 分区（`preload.js:112`）—— 收 `{accountId, partition}` */
  syncLovartSession(args: unknown): Promise<unknown>;
  /** 导出某分区的 cookie（`preload.js:50`） */
  exportAccountCookies(partition: string | null): Promise<unknown>;
  /** 把 cookie 灌回某分区（`preload.js:51`） */
  importAccountCookies(partition: string, cookies: readonly unknown[]): Promise<unknown>;
  /** 保存账号导出文件（`preload.js:52`） */
  saveAccountsFile(content: string): Promise<unknown>;
  /** 读账号导出文件（`preload.js:53`） */
  loadAccountsFile(): Promise<unknown>;

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
}
