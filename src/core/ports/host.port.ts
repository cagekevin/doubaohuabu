/**
 * HostPort —— 宿主能力（★ 只有类型，零实现；见 §6.5 原则 3）
 *
 * 依据：docs/05-配置契约层.md §二（`window.api` 全清单 83 方法）
 * 切分依据：docs/11 §4.1「按用途切分，不是照抄 83 个方法」（接口隔离）
 *
 * ⚠️ 原则 6（错误透传）：**所有方法必须返回 Result，不得抛异常给上层**
 *    —— 这正是 docs/10 那条「lovartFetchImages 一抛错整批失败」的架构解法
 */

import type { Result } from '@/core/model/result';

// ─────────────────────────── 子接口 ───────────────────────────

/** 文件导入 / 保存 / 下载 */
export interface FilePort {
  importFiles(): Promise<Result<PickedFile[]>>;
  saveFile(content: string): Promise<Result<{ path?: string }>>;
  loadFile(): Promise<Result<{ name: string; content: string } | null>>;
  selectFolder(): Promise<Result<string | null>>;
  downloadFile(url: string, fileName: string): Promise<Result<{ path?: string }>>;
  downloadFileAs(
    url: string,
    defaultName: string,
    filters?: Array<{ name: string; extensions: string[] }>,
  ): Promise<Result<{ path?: string; size?: number; canceled?: boolean }>>;
  openExternal(url: string): Promise<Result<void>>;
  revealPath(p: string): Promise<Result<void>>;
}

/** 剪贴板（★ 原则 6 注：内部保证 clear→writeText→await 顺序，对外只暴露一个 writeText） */
export interface ClipboardPort {
  readImage(): Promise<Result<ClipboardImage | null>>;
  writeImage(dataUrl: string): Promise<Result<void>>;
  /** 实现内部必须：clear() → writeText() → await（原 main.js:1591/1626-1627 的坑） */
  writeText(text: string): Promise<Result<void>>;
  pasteToWebview(webContentsId: number): Promise<Result<void>>;
  /** 把参考图作为真实文件经 CDP 直喂上传 input */
  attachImages(webContentsId: number, imgs: Array<{ dataUrl: string; label?: string }>): Promise<Result<AttachImagesResult>>;
  /** 订阅（只转发，不写 store —— 原则 2） */
  onChanged(cb: () => void): Unsubscribe;
}

/** 项目存储（磁盘侧） */
export interface ProjectPort {
  /** ⚠️ `sendSync`（同步）—— 保证 img:// 首帧就读对目录 */
  activateStorage(payload: ActivateProjectStoragePayload): Result<{ path?: string }>;
  pickStorage(): Promise<Result<{ path?: string; canceled?: boolean }>>;
  /**
   * 备份工程 JSON（**同步** —— 底层是 `ipcRenderer.send` 的 fire-and-forget）
   *
   * ⚠️ **必须返 `Result`**（TD-04-2）：原声明是 `void` 却会 `throw`
   *    ⇒ 每个调用点被迫自己加 `try`（那就是兜底）。
   *    契约声明"会失败"，调用方才被编译器逼着处理。
   */
  saveBackup(json: string): Result<void>;
  /** 快照（同 `saveBackup`，同步 + 返 `Result`） */
  saveSnapshot(project: unknown): Result<void>;
  /** 操作日志（同 `saveBackup`，同步 + 返 `Result`） */
  logOperation(event: OperationLogEvent): Result<void>;
  revealStorage(storagePath: string): Promise<Result<void>>;
  getStorageSize(storagePath: string): Promise<Result<number>>;
}

/** 媒体（图片 / 视频外置存储） */
export interface MediaPort {
  /**
   * 图片落盘 → `img://` 引用（⚠️ `sendSync`，**同步**；供持久化链路直接使用）
   *
   * ⚠️ **必须返 `Result`**（TD-04-2 同款地基问题）：原声明 `string` 却会 `throw`
   *    （宿主缺失）⇒ 每个调用点被迫自己 `try`（那就是兜底）。
   *    契约声明"会失败"，调用方才被编译器逼着处理。
   */
  saveImageSync(dataUrl: string): Result<string>;
  saveVideoFromUrl(url: string, referer?: string): Promise<Result<{ ref: string; size: number }>>;
  resolveImageRef(ref: string): Promise<Result<string | null>>;
  imageFetchDataUrl(url: string): Promise<Result<string | null>>;
  captureRect(rect: CaptureRect): Promise<Result<string | null>>;
  showInFolder(ref: string): Promise<Result<void>>;
  /** 拖出文件（会失败：宿主缺失 / 拖拽被拒）⇒ 返 `Result`，不 throw */
  startFileDrag(payload: { dataUrl: string; name: string; thumbDataUrl?: string }): Result<void>;
  clearBrowserCache(): Promise<Result<void>>;
  /**
   * **多帧扫描**：主进程遍历页面的全部 frame（含嵌套 / 跨域）执行同一脚本（原 `lovart-scan-frames`，`lovart-scan.js:83`）
   *
   * ⚠️ **必须显式调用** —— 不得自启定时器（docs/10 #4：自动轮询会被判机器人）
   * ⚠️ `script` 必须是**纯读取**脚本（零注入，docs/10 #2）
   * ⚠️ 后端要求 `webContentsId`（**不是** partition）⇒ 调用方先取 `<webview>.getWebContentsId()`
   */
  scanFrames(req: {
    webContentsId: number;
    /** 在**每个 frame** 里执行的扫描脚本 */
    script: string;
    /** 上限（后端夹在 1–24，默认 12） */
    maxFrames?: number;
  }): Promise<Result<{ items: unknown[]; href?: string }>>;
}

/** 账号会话 / 指纹 / 代理 */
export interface AccountPort {
  ensureFingerprint(accountId: string): Promise<Result<{ preloadUrl?: string }>>;
  ensurePlainSession(accountId: string): Promise<Result<{ userAgent?: string }>>;
  ensureLovartContainer(accountId: string): Promise<Result<{ preloadUrl: string | null }>>;
  clearSession(partition: string): Promise<Result<void>>;
  /** 空串 = 直连 */
  setProxy(partition: string, proxy: string): Promise<Result<void>>;
  fpNetDiag(partition: string): Promise<Result<unknown>>;
}

/** 许可 */
export interface LicensePort {
  getMachineCode(): Promise<Result<string>>;
  getStatus(): Promise<Result<LicenseStatus>>;
  activateWithCode(code: string): Promise<Result<LicenseStatus>>;
  exportMachineCode(machineCode: string): Promise<Result<{ path?: string }>>;
}

/** 第三方 AI provider */
export interface ApiPort {
  providersList(): Promise<Result<ApiProviderMetaLite[]>>;
  configGet(): Promise<Result<unknown>>;
  configSet(providerId: string, patch: unknown): Promise<Result<void>>;
  /** 密钥明文只进不出 */
  configSetKey(providerId: string, key: string): Promise<Result<void>>;
  configSetSecret(providerId: string, key: string): Promise<Result<void>>;
  configTest(providerId: string): Promise<Result<{ message?: string }>>;
  jobSubmit(payload: unknown): Promise<Result<ApiJobLite>>;
  jobBatch(basePayload: unknown, matrix: unknown): Promise<Result<ApiJobLite[]>>;
  jobCancel(jobId: string): Promise<Result<void>>;
  jobList(): Promise<Result<ApiJobLite[]>>;
  setupGet(): Promise<Result<ApiSetupLite>>;
  setupSet(patch: Partial<ApiSetupLite>): Promise<Result<void>>;
  /** 订阅（只转发 —— 原则 2） */
  onJobEvent(cb: (snap: ApiJobLite) => void): Unsubscribe;
}

// ─────────────────────────── 端口主体 ───────────────────────────

/**
 * ⚠️ 如实说明：对外是 1 个端口，内部 **8 个子接口**（docs/11 §4.1 审计 B4）
 * 目的：用例只依赖它需要的那一组（接口隔离），而不是 83 个方法的全集
 */
export interface HostPort {
  /** ★ 真实宿主平台：来自 preload 的 `process.platform`，**不读 navigator**（docs/10 #59） */
  readonly os: 'windows' | 'macos' | 'linux';

  readonly file: FilePort;
  readonly clipboard: ClipboardPort;
  readonly project: ProjectPort;
  readonly media: MediaPort;
  readonly account: AccountPort;
  readonly license: LicensePort;
  readonly api: ApiPort;
}

// ─────────────────────────── 附属类型 ───────────────────────────

export type Unsubscribe = () => void;

export interface PickedFile {
  name: string;
  path: string;
  size?: number;
  type?: string;
  dataUrl?: string;
}

export interface ClipboardImage {
  dataUrl: string;
  w: number;
  h: number;
  name?: string;
  source?: string;
}

export interface AttachImagesResult {
  via: string;
  count: number;
  nodeId?: string;
  accept?: string;
  files?: string[];
  errors?: string[];
}

export interface ActivateProjectStoragePayload {
  projectId: string;
  projectName: string;
  /** 空串 = 使用应用默认目录 */
  storagePath: string;
  knownStoragePaths?: Array<{ path: string; name: string }>;
}

export interface OperationLogEvent {
  at: number;
  projectId: string;
  type: string;
  detail?: { nodes?: number; edges?: number; library?: number };
}

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LicenseStatus {
  status: 'ok' | 'none' | 'invalid' | 'expired' | 'tampered';
  expireAt?: number;
  licenseKey?: string;
}

/** 宿主返回的 provider 元信息（结构未知处用 unknown 占位，接真实实现时回填） */
export interface ApiProviderMetaLite {
  id: string;
  name: string;
  capabilities: readonly string[];
  enabled?: boolean;
  hasKey?: boolean;
  keyHint?: string;
  hasSecret?: boolean;
}

export interface ApiJobLite {
  id: string;
  status: string;
  kind: 'image' | 'video';
  providerId?: string;
  error?: string;
}

export interface ApiSetupLite {
  imageProviderId: string | null;
  videoProviderId: string | null;
  fallbackProviderId: string | null;
  concurrency: number;
}
