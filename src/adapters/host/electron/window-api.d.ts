import type { HostOS } from '@/constants';
/**
 * `window.api` 的类型声明（**冻结契约** —— 由 `electron/preload.ts` 暴露）
 *
 * ⚠️ 本文件是**唯一**允许直接引用 `window.api` 的类型处（全仓唯一读者 = `./host-api.ts`，
 *    它用**局部** `(window as { api?: HostApi })` 取用 ⇒ **本文件不声明 `declare global`**，
 *    否则任何层写 `window.api.X` 都能编译，红线①（原则 3 / `TD-05-1`）就失守）。
 * ⚠️ **方法名必须与 `preload.ts` 完全一致**：本接口**无索引签名**
 *    ⇒ 读写任何**未声明**的成员**编译不过**。
 * ★ **名面不再靠人工比对**：契约真源 = `@/stable/ipc-channels`（`IPC_CHANNELS`），
 *   它与本文的**成员名集合相等**这件事由 `./host-api.ts` 顶部的类型断言**编译期**守住
 *   （成员数/种类以那张表为准，⛔ 本文不再复述计数 —— 复述过的那次已经漂了）。
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
  /** 收**真实路径**或 **`img://` 引用**（主进程自己判别：引用先解析、路径直接用） */
  revealPath(path: string): Promise<unknown>;
  pickDownloadPath(): Promise<unknown>;
  getDownloadSettings(): Promise<unknown>;

  // ── 剪贴板 ──
  readClipboardImage(): Promise<unknown>;
  /** ⚠️ 载荷是 **`{dataUrl, label}` 对象** + 目标 `webContentsId`（`main.js`） */
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
  imageFetchDataUrl(url: string): Promise<unknown>;
  captureRect(rect: unknown): Promise<unknown>;
  /** ★ 检测站点页里的视频（`preload.ts` → `detect-videos` handler） */
  detectVideos(webContentsId: number, seenKeys: readonly string[]): Promise<unknown>;
  /** 读取站点页里的错误提示（`detect-errors` handler） */
  detectErrors(webContentsId: number): Promise<unknown>;
  startFileDrag(payload: unknown): void;
  clearBrowserCache(): Promise<unknown>;

  // ── 账号 / 会话 / 指纹 ──
  /** ⚠️ 收的是**账号对象**（`{id, partition, fingerprint}`），不是 id 字符串（`preload.js`） */
  ensureFingerprint(account: unknown): Promise<unknown>;
  /** ⚠️ 同上（`preload.js`） */
  ensurePlainSession(account: unknown): Promise<unknown>;
  /** ⚠️ 同上，多 `containerId` / `proxy`（`preload.js`） */
  ensureLovartContainer(account: unknown): Promise<unknown>;
  clearAccountSession(partition: string): Promise<unknown>;
  setAccountProxy(partition: string, proxy: string): Promise<unknown>;
  fpNetDiag(partition: string): Promise<unknown>;
  /** 真实 Chrome 登录窗口（`preload.js`）—— 收 `{accountId, url?, proxy?}` */
  ensureLovartChrome(args: unknown): Promise<unknown>;
  /** 关闭真实 Chrome 登录窗口（`preload.js`）—— 收 `{accountId}` */
  closeLovartChrome(args: unknown): Promise<unknown>;
  /** 会话 cookie 同步进 webview 分区（`preload.js`）—— 收 `{accountId, partition}` */
  syncLovartSession(args: unknown): Promise<unknown>;
  /** 导出某分区的 cookie（`preload.js`） */
  exportAccountCookies(partition: string | null): Promise<unknown>;
  /** 把 cookie 灌回某分区（`preload.js`） */
  importAccountCookies(partition: string, cookies: readonly unknown[]): Promise<unknown>;
  /** 保存账号导出文件（`preload.js`） */
  saveAccountsFile(content: string): Promise<unknown>;
  /** 读账号导出文件（`preload.ts`） */
  loadAccountsFile(): Promise<unknown>;

  // ── 内置 Firefox / 真实 Chrome 会话（`preload.ts`）──
  /** 为账号准备内置 Firefox 的独立 profile（预装多账号容器插件） */
  ensureLovartFirefoxProfile(accountId: string): Promise<unknown>;
  openLovartFirefox(args: unknown): Promise<unknown>;
  removeLovartFirefoxProfile(accountId: string): Promise<unknown>;
  getFirefoxStatus(): Promise<unknown>;
  /** 真实 Chrome 登录窗口是否仍开着 */
  getLovartChromeStatus(): Promise<unknown>;

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
