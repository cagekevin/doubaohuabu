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
import type { LicenseStatus } from '@/core/model/license';
import type { FaceBox, FaceMaskOpts, FaceMaskResult } from '@/core/rules/facemask';
import type { HostOS } from '@/constants';
import type { Project } from '@/stable/model/project';
import type {
  ApiBatchResult,
  ApiConfigMap,
  ApiJobEvent,
  ApiJobStatus,
  ApiProviderMeta,
  ApiSetup,
  ApiUsage,
} from '@/stable/model/gen';

/**
 * ★ SSOT 转出（2026-10-10）：授权状态的**形状与字面量联合**真源在 `core/model/license.ts`。
 *    ⛔ 不得在本文件内联这份联合（内联 = 两处表达式，改一处漏一处）。
 */
export type { LicenseStatus, LicenseStatusKind } from '@/core/model/license';

// ─────────────────────────── 子接口 ───────────────────────────

/** 文件导入 / 保存 / 下载 */
export interface FilePort {
  importFiles(): Promise<Result<PickedFile[]>>;
  saveFile(content: string): Promise<Result<{ path?: string }>>;
  loadFile(): Promise<Result<{ name: string; content: string } | null>>;
  selectFolder(): Promise<Result<string | null>>;
  /**
   * 下载到**指定路径**（原 `window.api.downloadFile`）
   *
   * ⚠️ 2026-10-10 补 `size`：主进程的 `download-file` **本来就返回它**
   *   （`electron/main.js:1786/1798/1810` 三条成功分支都带 `size`），
   *   而这里原先只声明了 `path?` ⇒ 下载节点**算不出"已下载多少"**。
   *   口径与同文件的 `downloadFileAs` 一致。
   */
  downloadFile(url: string, fileName: string): Promise<Result<{ path?: string; size?: number }>>;
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
  /**
   * 把图片写进系统剪贴板（原 `window.api.copyImageToClipboard`）
   *
   * ★ **2026-10-10 修（三个 bug 一处）**：后端契约是 `copy-image-to-clipboard(img, webContentsId)`
   *   （`main.js:1382`），其中
   *     ① `img` 必须是 **`{dataUrl, label}` 对象**（`label` 还用来拼临时文件名，`main.js:1412`）
   *        —— 原实现传的是**裸字符串** ⇒ `img.dataUrl` 为 `undefined` ⇒ 必然失败；
   *     ② `webContentsId` 是**分层写剪贴板**的回落入口（`writeImageToPasteboard(ni, webContentsId)`，
   *        `main.js:1424`：主进程原生 → **目标页面内 Async Clipboard API**）—— 原实现**没传**；
   *     ③ 返回值 `{ok:false, error}`（如 `图片数据为空或格式不支持`）被**无视** ⇒ 吞错（原则 6）。
   *
   * @param img 图片（`dataUrl` 支持 `data:` 与 `img://` 两种引用）
   * @param webContentsId 目标页面（用于页内剪贴板回落层；不给就只能走主进程那层）
   */
  writeImage(img: { dataUrl: string; label?: string }, webContentsId?: number): Promise<Result<void>>;
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
  /**
   * 选择保存路径（原 `window.api.pickProjectStorage`）
   *
   * ⚠️ 后端契约（`main.js:368-394`）：
   *    成功 `{ok:true, path, migrated}` · 用户取消 `{ok:false, canceled:true}` · 失败 `{ok:false, error}`
   *    ★ 2026-10-10 修：原实现**只读 `path/canceled`、丢掉 `ok:false`**（吞错，原则 6）
   *      且**从不传 payload**（后端要靠 `payload.project` 做资源迁移与快照 ⇒ 迁移永不发生）。
   */
  pickStorage(
    payload: PickStoragePayload,
  ): Promise<Result<{ path?: string; canceled?: boolean; migrated?: AssetMigration }>>;
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
  /**
   * 在系统文件管理器里打开项目保存目录（原 `window.api.revealProjectStorage`）
   *
   * ⚠️ 后端契约（`main.js:408-428`）：成功 `{ok:true, path}` · 失败 `{ok:false, error}`
   *    （`项目尚未设置保存路径` / `项目保存路径不存在` / shell 的 `openPath` 错误串）
   */
  revealStorage(storagePath: string): Promise<Result<{ path?: string }>>;
  /**
   * 统计项目保存目录占用（原 `window.api.getProjectStorageSize`）
   *
   * ⚠️ 后端契约（`main.js:435-503`）：成功 `{ok:true, bytes, files, partial, elapsedMs}` · 失败 `{ok:false, error}`
   *    ★ 2026-10-10 修：原实现把返回当 `{size}` 读 ⇒ **恒为 0**（`bytes` 字段名对不上）。
   */
  getStorageSize(storagePath: string): Promise<Result<StorageUsage>>;
}

/**
 * 会话准备载荷（原 `$P.jsx:77-80` / `_Component25.jsx:76-79`）
 *
 * ⚠️ `partition` 可为 `null`（真实样本里就有未设分区的账号）——
 *    后端会回落到 `persist:lovart`，前端**如实传**、不替它编一个。
 */
export interface FingerprintSessionPayload {
  id: string;
  partition: string | null;
  fingerprint?: unknown;
}

/** 普通会话载荷（同形，不带指纹） */
export interface PlainSessionPayload {
  id: string;
  partition: string | null;
}

/** Lovart 容器载荷（多一个 `containerId` + 出口 `proxy`） */
export interface LovartContainerPayload extends PlainSessionPayload {
  containerId?: string;
  /** 空串 = 直连（与 `setProxy` 同语义） */
  proxy?: string;
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
  /**
   * ⚠️ **2026-10-11 已删 `resolveImageRef(ref)`** —— **源前端 0 消费者**：
   *   回源检索 `resolveImageRef` / `img-resolve` 在 `expanded_components/**` 的 `.jsx` 与 `shared.js`
   *   **一处都没有**；`img://` → 真实路径的解析是**主进程内部**的事（`main.js:739` 的 `resolveImageRef`
   *   被 `main.js:1005/1244/1275/1402/1536/1807/1879/3047` 内部调用），前端拿到的**是路径或文案**，不需要自己解析。
   *   ⇒ 与 `setMuted` / `StoragePort` 的 3 个幽灵方法同判据（判据 B5：不留"声明了但没人调"的契约面）。
   *   ⚠️ **不是**"暂时没接" —— 是**源里就没有这个前端入口**。
   */

  imageFetchDataUrl(url: string): Promise<Result<string | null>>;
  imageFetchDataUrl(url: string): Promise<Result<string | null>>;
  captureRect(rect: CaptureRect): Promise<Result<string | null>>;
  showInFolder(ref: string): Promise<Result<void>>;
  /**
   * 拖出文件到系统（`webContents.startDrag`，`main.js:1223`）
   *
   * ⚠️ **本方法的 `Result` 只能表达两件事**：宿主缺失（`window.api` 不在）/ 调用本身抛出。
   *    **「拖拽有没有真的成功」本仓无从判定** —— 后端走的是 `ipcRenderer.send`（**无回执**），
   *    失败只 `console.warn`（`main.js:1232,1246,1254`）。
   *    ⇒ **调用方不得据此报「已拖出」**（如实登记：`docs/16` · 母体 M5「失败不可见」的新实例）。
   * ⚠️ **payload 只有 `dataUrl` + `name`**：**不传缩略图** —— icon 由**后端**从原图 resize 到 64px
   *    （`docs/10` #53「拖拽预览 icon 必须是 64px」；`main.js:1239-1244`）。
   *    ⛔ **不要声明 `thumbDataUrl?`** —— **后端从不读它**（它在那边的注释里被写成"会额外落盘
   *    缩略图"，属**假承诺**）⇒ 2026-10-11 **删除**（幽灵字段，母体 M6）。
   * ⚠️ 后端另支持 `path`（`docs/10` #64「传 path 优先」）—— 本仓**不暴露**：我们手上的引用是
   *    `img://`，后端 `persistImageDataUrl` 对它**原样返回**（非 data URL 早退）⇒ 不会重复写盘，
   *    与传 `path` 等价（判据 B5：不留没人调的字段）。
   */
  startFileDrag(payload: { dataUrl: string; name: string }): Result<void>;
  /**
   * 清理各账号分区的**纯缓存**（Cache / Code Cache 等，原 `clear-browser-cache`，`preload.js:81`）
   *
   * ⚠️ **保留登录态**（与 `clearSession` 不是一回事）；返回**清理计数** ——
   *    源版 UI 要显示「已清理 N 个缓存目录（M 个被占用，下次启动会自动清理）」。
   * ⚠️ 这是 `docs/14` §1.4 记的「端口早有、UI 未用」那一条（2026-10-11 接通）。
   */
  clearBrowserCache(): Promise<Result<{ cleared: number; failed?: number }>>;
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

  // ── 人脸检测 / 遮脸（★ **渲染层本地能力**，与上面各方法**不同源**：不走 IPC）──
  /**
   * 人脸检测（原 `qD`）
   *
   * ⚠️ **它不经 `window.api`** —— 在本渲染进程内跑 MediaPipe WASM ＋ DOM
   *   （实现住 `adapters/media/faceDetect`）。放在 `media` 域是因为它同属媒体能力，
   *   且 `docs/11` §一 已定「端口数量只开 5 个」⇒ **不新增端口**，就地扩展本域。
   *
   * ★ **2026-10-11 补（`TD-16-107`）**：此前 `ui/nodes/FaceMarksLayer` **直接 import
   *   `adapters/media`**（违反铁律② `ui-no-adapters`，闸实红 2 条）；媒体实现被焊进视图组件。
   *   现经**本端口** ＋ `state/hostOps` 控制器 ⇒ `ui` 只拿结果。
   *
   * ⚠️ **失败必须返 `Result`**：底层 `detectFaces` 会抛（WASM 加载 / 图片解码失败）。
   */
  detectFaces(src: string): Promise<Result<FaceBox[]>>;
  /**
   * 对人脸框应用遮罩（原 `nL`）—— 同 `detectFaces`，**渲染层本地能力**（Canvas）。
   * ⚠️ **失败必须返 `Result`**：底层对空源 / 非法框 / 尺寸为 0 都会抛。
   */
  applyFaceMask(src: string, face: FaceBox, opts: FaceMaskOpts): Promise<Result<FaceMaskResult>>;
}

/**
 * 账号会话 / 指纹 / 代理 / 账号数据导入导出
 *
 * ★ **2026-10-10 契约更正（又一组"照文档抄"的签名）**：后端三个 `ensure*` 收的是
 *   **账号对象**，不是 id 字符串 —— `preload.js:89/94/97` 原样转发 `acc`，而
 *   `main.js:2692/2805` 读 `acc.partition` / `acc.proxy`，读不到就**回落到 `persist:lovart`**。
 *   ⚠️ **必须传对象** —— 传字符串 ⇒ `'abc'.partition === undefined` ⇒ **分区与指纹目录全错**（静默）。
 *
 * ⚠️ **约束 #5（`docs/10`）：cookie 由后端管理，前端一律不碰** ——
 *    本端口**没有**、也**不得新增**「读/写 cookie」的方法（会话态由主进程的
 *    `session.fromPartition` 持有）。唯一的例外是**账号数据导入导出**那组
 *    （`exportCookies` / `importCookies`，它是后端主动提供的整包迁移能力）。
 */
export interface AccountPort {
  /**
   * 注入/更新环境指纹（原 `window.api.ensureFingerprint`）
   * @param payload 后端要 `{id, partition, fingerprint}`（`$P.jsx:77-80`）
   */
  ensureFingerprint(
    payload: FingerprintSessionPayload,
  ): Promise<Result<{ preloadUrl?: string }>>;
  /**
   * 普通（非指纹）会话（原 `window.api.ensurePlainSession`）
   * @param payload 后端要 `{id, partition}`（`$P.jsx:59-63` 同形）
   */
  ensurePlainSession(
    payload: PlainSessionPayload,
  ): Promise<Result<{ userAgent?: string; preloadUrl?: string }>>;
  /**
   * Lovart 专用容器（原 `window.api.ensureLovartContainer`）
   * @param payload 后端要 `{id, partition, containerId, proxy}`（`$P.jsx:59-63`）
   */
  ensureLovartContainer(
    payload: LovartContainerPayload,
  ): Promise<Result<{ userAgent?: string; preloadUrl: string | null }>>;
  clearSession(partition: string): Promise<Result<void>>;
  /** 空串 = 直连 */
  setProxy(partition: string, proxy: string): Promise<Result<void>>;
  fpNetDiag(partition: string): Promise<Result<unknown>>;

  // ── 账号数据导入 / 导出（原 `OP.jsx` / `PP.jsx`）──
  /**
   * 导出某分区的 cookie（原 `window.api.exportAccountCookies`）
   *
   * ⚠️ 后端契约：成功 `{ok:true, cookies, count}`，失败 `{ok:false, error}`。
   *    失败时**必须**返 `Err`（原则 6）—— 源版 `PP.jsx:58-62` 是 `catch` + `console.warn` 吞掉，
   *    重写改为**如实上报**，由用例决定「降级为空 cookie 继续导出」并记账。
   */
  exportCookies(partition: string | null): Promise<Result<{ cookies: unknown[] }>>;
  /**
   * 把 cookie 灌回某分区（原 `window.api.importAccountCookies`）
   *
   * ⚠️ 后端契约：成功 `{ok:true, restored, total}`；**单个 cookie 失败不中断**（后端已处理）。
   */
  importCookies(partition: string, cookies: readonly unknown[]): Promise<Result<{ restored: number }>>;
  /**
   * 保存账号导出文件（原 `window.api.saveAccountsFile`，**独立对话框**）
   *
   * ⚠️ 后端契约：成功 `{ok:true, path}`；取消 / 失败 `{ok:false, error}`
   *    （取消时 `error` 就是 `'已取消'`）⇒ 实现**原样转发**，不擅自归类。
   */
  saveAccountsFile(content: string): Promise<Result<{ path?: string }>>;
  /** 读账号导出文件（原 `window.api.loadAccountsFile`）；用户取消 ⇒ `null` */
  loadAccountsFile(): Promise<Result<string | null>>;
}

/** 许可 */
export interface LicensePort {
  getMachineCode(): Promise<Result<string>>;
  getStatus(): Promise<Result<LicenseStatus>>;
  activateWithCode(code: string): Promise<Result<LicenseStatus>>;
  exportMachineCode(machineCode: string): Promise<Result<{ path?: string }>>;
}

/**
 * 第三方 AI provider
 *
 * ★ **2026-10-10 契约收口**（原登记的重复定义项）：删掉 `ApiProviderMetaLite` /
 *   `ApiJobLite` / `ApiSetupLite` 三个「线上形状」副本，**统一用 `stable/model/gen.ts`
 *   的冻结形状**。依据 = 后端 `electron/main.js` 与 `electron/api/job-manager.js` 的**实测返回**：
 *
 *   | 方法 | 后端返回（实测） |
 *   |---|---|
 *   | `api-providers:list` | `{ok, providers}` |
 *   | `api-config:get` | `{ok, providers, configs}`（**一次给两样**） |
 *   | `api-config:set` | `{ok, config}` |
 *   | `api-config:set-key` | `{ok, keyHint, maskedBy}` |
 *   | `api-config:set-secret` | `{ok, hasSecret}` |
 *   | `api-config:test` | `{ok:false, message}` 或适配器自身结果 |
 *   | `api-job:submit` | `{ok, jobId}`（**只给 id，不是任务对象**） |
 *   | `api-job:batch` | `{ok, jobIds, errors, total}` |
 *   | `api-job:cancel` | `{ok, status}` |
 *   | `api-job:list` | `{ok, jobs}` |
 *   | `api-setup:get` | `{ok, setup, usage}` |
 *   | `api-setup:set` | `{ok, setup}` |
 *   | `api-job-event`（推送） | `publicSnapshot` = `ApiJobEvent`（字段名是 **`jobId`**） |
 */
export interface ApiPort {
  /** provider 元信息（**脱敏**：只有 `hasKey` / `keyHint`） */
  providersList(): Promise<Result<ApiProviderMeta[]>>;
  /** 配置原文 + provider 元信息（后端**一次**返回两者） */
  configGet(): Promise<Result<{ providers: ApiProviderMeta[]; configs: ApiConfigMap }>>;
  configSet(providerId: string, patch: unknown): Promise<Result<{ config: unknown }>>;
  /** 密钥明文只进不出；返回脱敏提示（`sk-****7890`） */
  configSetKey(providerId: string, key: string): Promise<Result<{ keyHint?: string; maskedBy?: string }>>;
  configSetSecret(providerId: string, key: string): Promise<Result<{ hasSecret: boolean }>>;
  configTest(providerId: string): Promise<Result<{ message?: string }>>;
  /** 提交单个任务 ⇒ 后端**只回 `jobId`**（结果经 `onJobEvent` 推送） */
  jobSubmit(payload: unknown): Promise<Result<{ jobId: string }>>;
  /** 批量提交 ⇒ 逐位 `jobIds` / `errors` */
  jobBatch(basePayload: unknown, matrix: unknown): Promise<Result<ApiBatchResult>>;
  /**
   * 取消一个任务（原 `cancelApiJob` `shared.js:30694` 的 `await window.api.apiJobCancel(n)`）
   *
   * ⚠️ **保留但当前零消费 —— 而这是"对源"的（不是本仓漏接）**。取证：
   *   · 源**有**该能力位：store action `cancelApiJob`（`shared.js:30694-30704`）＋ preload `apiJobCancel`；
   *   · 但**源内一处都没有调用它** —— `grep -rn "cancelApiJob\|apiJobCancel" expanded_components/`
   *     只命中 `30694`／`30695`／`30701` 三行，**全在它自己的定义里**；
   *   · 源里 `apiJobs` 的真消费者是**文生图面板**（`_Component45.jsx:38-40` 的 `c = $.apiJobs`），
   *     而它**只读状态、没有取消入口**（`grep 取消\|cancel` 在该文件 0 命中）。
   *   ⇒ 按铁律 1「**该不该有**一律照抄源」：能力位**保留**；给它"造一个 UI"会**超出源** ⇒ **不造**。
   *   ⚠️ 别把"零消费"一律当缺口 —— 这条**源亦零消费**。
   */
  jobCancel(jobId: string): Promise<Result<{ status: ApiJobStatus }>>;
  /**
   * ⚠️ **2026-10-12 已删 `jobList()`** —— **源前端没有这个入口**：
   *   `apiJobList` 在 `expanded_components/**` **0 命中**（源既不调它、也没有"任务列表"UI）；
   *   源里那张 `apiJobs` 表由 **`applyApiJobEvent` 的事件增量**维护（`shared.js:30713-30714`
   *   的 `apiJobs: { ...t().apiJobs, … }`），**从不"拉列表"**。
   *   后端 `api-job:list` handler 确实在（`main.js:3170`），但**前端不需要它** ——
   *   与 `setMuted` / `resolveImageRef` 同判据（判据 B5：不留"声明了但没人调"的契约面）。
   *   ⚠️ 本仓 `settings.apiJobs` **不是**它的替代物：那张表由 `state/subscriptions` 的事件增量写、
   *      由 `core/usecases/applyApiJobEvent` 读（判"上一快照"），链路自洽、不依赖本方法。
   */
  setupGet(): Promise<Result<{ setup: ApiSetup; usage: ApiUsage }>>;
  setupSet(patch: Partial<ApiSetup>): Promise<Result<{ setup: ApiSetup }>>;
  /** 订阅（只转发 —— 原则 2） */
  onJobEvent(cb: (snap: ApiJobEvent) => void): Unsubscribe;
}

// ─────────────────────────── 端口主体 ───────────────────────────

/**
 * ⚠️ 如实说明：对外是 1 个端口，内部 **8 个子接口**（docs/11 §4.1 审计 B4）
 * 目的：用例只依赖它需要的那一组（接口隔离），而不是 83 个方法的全集
 */
export interface HostPort {
  /** ★ 真实宿主平台：来自 preload 的 `process.platform`，**不读 navigator**（docs/10 #59） */
  readonly os: HostOS;

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

/**
 * 选择保存路径的载荷（原 `_Component42.jsx:300-313` 传给 `pickProjectStorage` 的对象）
 *
 * ⚠️ 比 `activateStorage` 多一个 `project` —— 后端要靠它
 *    **迁移已有资源**（`migrateProjectAssets`）并**写快照**（`writeProjectSnapshot`）。
 */
export interface PickStoragePayload extends ActivateProjectStoragePayload {
  project?: Project;
}

/** 换目录时后端归档的既有资源数（原 `migrated.images` / `migrated.videos`） */
export interface AssetMigration {
  images?: number;
  videos?: number;
}

/** 目录占用统计（原 `main.js:500` 的 `{bytes, files, partial, elapsedMs}`） */
export interface StorageUsage {
  bytes: number;
  files: number;
  /** 后端 30s 硬上限内**没扫完**（原 `partial`）⇒ UI 显示「（仍在统计）」 */
  partial: boolean;
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

/**
 * ⚠️ **已删（2026-10-10 契约收口）**：`ApiProviderMetaLite` / `ApiJobLite` / `ApiSetupLite`
 *
 * 它们是「照文档抄的线上形状」副本，与后端**实测返回不符**：
 *   · `ApiJobLite.id` —— 后端事件字段名是 **`jobId`** ⇒ `upsertApiJob` 按 `id` 去重时
 *     拿到 `undefined`，**所有任务塌进同一条记录**（订阅等于失效）；
 *   · `ApiJobLite.error?: string` —— 后端给的是**对象** `{kind, message, advice?}`；
 *   · `ApiSetupLite` —— 与 `ApiSetup` 逐字相同（纯重复）。
 * ⇒ 统一改用 `stable/model/gen.ts` 的冻结形状（`ApiProviderMeta` / `ApiJobEvent` / `ApiSetup`）。
 */
