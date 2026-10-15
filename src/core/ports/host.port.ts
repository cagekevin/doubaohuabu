/**
 * HostPort —— 宿主能力（★ 只有类型，零实现；见 §6.5 原则 3）
 *
 * 依据：docs/05-配置契约层.md §二（`window.api` 全清单 83 方法）
 * 切分依据：docs/11 §4.1「按用途切分，不是照抄 83 个方法」（接口隔离）
 *
 * ⚠️ 原则 6（错误透传）：**所有方法必须返回 Result，不得抛异常给上层**
 *    —— 这正是 docs/过程.md 那条「lovartFetchImages 一抛错整批失败」的架构解法
 */

import type { Result } from '@/core/model/result';
import type { LicenseStatus } from '@/core/model/license';
import type { FaceBox, FaceMaskOpts, FaceMaskResult } from '@/core/rules/facemask';
// ⚠️ `FaceDetectStats` 的形状住 `core/rules/faceDetect`（纯层；端口只引用它 —— 原则 3）
import type { FaceDetectStats } from '@/core/rules/faceDetect';
import type { HostOS } from '@/constants';
import type { Project } from '@/stable/model/project';
import type {
  ApiBatchResult,
  ApiConfigMap,
  ApiJobEvent,
  ApiJobPayload,
  ApiJobStatus,
  ApiJobVariant,
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
  loadFile(): Promise<Result<{ name: string; content: string } | null>>;
  selectFolder(): Promise<Result<string | null>>;
  /**
   * 下载到**指定路径**（原 `window.api.downloadFile`）
   *
   * ⚠️ 2026-10-10 补 `size`：主进程的 `download-file` **本来就返回它**
   *   （`electron/main.js` 三条成功分支都带 `size`），
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
  /**
   * 在系统文件管理器里定位一个文件 —— **收真实路径，或 `img://` 引用**（宿主自己判别并解析）
   *
   * ★ **一个入口收两种输入**：调用方**不必**先判断手上是哪种东西（判别只有宿主一处）——
   *   否则「拿 `img://` 去调只认真实路径的方法」就是"功能打不开"。
   */
  revealPath(p: string): Promise<Result<void>>;
}

/** 剪贴板（★ 原则 6 注：内部保证 clear→writeText→await 顺序，对外只暴露一个 writeText） */
export interface ClipboardPort {
  readImage(): Promise<Result<ClipboardImage | null>>;
  /**
   * 把图片写进系统剪贴板（原 `window.api.copyImageToClipboard`）
   *
   * ★ **2026-10-10 修（三个 bug 一处）**：后端契约是 `copy-image-to-clipboard(img, webContentsId)`
   *   （`main.js`），其中
   *     ① `img` 必须是 **`{dataUrl, label}` 对象**（`label` 还用来拼临时文件名，`main.js`）
   *        —— 原实现传的是**裸字符串** ⇒ `img.dataUrl` 为 `undefined` ⇒ 必然失败；
   *     ② `webContentsId` 是**分层写剪贴板**的回落入口（`writeImageToPasteboard(ni, webContentsId)`，
   *        `main.js`：主进程原生 → **目标页面内 Async Clipboard API**）—— 原实现**没传**；
   *     ③ 返回值 `{ok:false, error}`（如 `图片数据为空或格式不支持`）被**无视** ⇒ 吞错（原则 6）。
   *
   * @param img 图片（`dataUrl` 支持 `data:` 与 `img://` 两种引用）
   * @param webContentsId 目标页面（用于页内剪贴板回落层；不给就只能走主进程那层）
   */
  writeImage(img: { dataUrl: string; label?: string }, webContentsId?: number): Promise<Result<void>>;
  /** 实现内部必须：clear() → writeText() → await（原 main.js 的坑） */
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
   * ⚠️ 后端契约（`main.js`）：
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
  /**
   * 快照（同 `saveBackup`，同步 + 返 `Result`）
   *
   * ⚠️ 入参是**整个工程对象**（后端 `main.js` 的 `writeProjectSnapshot` 读 `project.data` /
   *    `project.updatedAt` 并整份序列化进 `项目工程.json`）—— **不是** id、不是数组。
   *    ★ 2026-10-14 收窄（`TD-04-21`）：此前声明 `unknown` ⇒ 传数组/传 id 字符串**都编译通过**；
   *    而后端的形状守卫只判 `typeof project !== 'object'` ⇒ **数组能过**（`typeof [] === 'object'`）
   *    ⇒ 快照文件被**静默写坏**（调用方是 fire-and-forget 的 `send`，拿不到结果）。
   */
  saveSnapshot(project: Project): Result<void>;
  /** 操作日志（同 `saveBackup`，同步 + 返 `Result`） */
  logOperation(event: OperationLogEvent): Result<void>;
  /**
   * 在系统文件管理器里打开项目保存目录（原 `window.api.revealProjectStorage`）
   *
   * ⚠️ 后端契约（`main.js`）：成功 `{ok:true, path}` · 失败 `{ok:false, error}`
   *    （`项目尚未设置保存路径` / `项目保存路径不存在` / shell 的 `openPath` 错误串）
   */
  revealStorage(storagePath: string): Promise<Result<{ path?: string }>>;
  /**
   * 统计项目保存目录占用（原 `window.api.getProjectStorageSize`）
   *
   * ⚠️ 后端契约（`main.js`）：成功 `{ok:true, bytes, files, partial, elapsedMs}` · 失败 `{ok:false, error}`
   *    ★ 2026-10-10 修：原实现把返回当 `{size}` 读 ⇒ **恒为 0**（`bytes` 字段名对不上）。
   */
  getStorageSize(storagePath: string): Promise<Result<StorageUsage>>;
}

/**
 * 会话准备载荷（原 `$P.jsx:77-80` / `_Component25.jsx:76-79`）
 *
 * ⚠️ `partition` **必填且非空**：账号的分区由产生方保证恒有值（`accountRoster.buildNewAccount`）。
 *    ⚠️ 原注写「可为 `null`，后端会回落到 `persist:lovart`」——那**已不成立**：后端早已改成
 *    **不猜、缺了就抛**（`main.js`）。留着 `null` 只会把「产生方缺位」传到后端去炸。
 */
export interface FingerprintSessionPayload {
  id: string;
  partition: string;
  fingerprint?: unknown;
}

/** 普通会话载荷（同形，不带指纹） */
export interface PlainSessionPayload {
  id: string;
  partition: string;
}

/** Lovart 容器载荷（多一个 `containerId` + 出口 `proxy`） */
export interface LovartContainerPayload extends PlainSessionPayload {
  containerId?: string;
  /** 空串 = 直连（与 `setProxy` 同语义） */
  proxy?: string;
}

/** 打开真实 Chrome 的载荷（原 `_Component25.jsx:215-219`） */
export interface LovartChromePayload {
  accountId: string;
  /** 初始打开的网址（原 `_p` = Lovart 站点地址）；不给 ⇒ 保持当前页 */
  url?: string;
  /** 空串 = 直连（与 `setProxy` 同语义） */
  proxy?: string;
}

/**
 * 打开真实 Chrome 的**业务结果**（原 `chrome-cdp.ensureLovartChrome`）
 *
 * ★ **为什么是嵌套判别联合**（`Result<LovartChromeOpen>` 而不是 `Result<{…}>`）：
 *   后端把「业务失败」放在**一次成功的 IPC 调用**里（`{ok:false, error, message}`，`main.js`），
 *   而外层 `Result` 表达的是「IPC 通没通」。**两层都要保留** —— 外层 `err` 是通道故障（重试/重启），
 *   内层 `ok:false` 是业务失败（带**错误码**，用户可据此看到具体指引）。
 *   ⚠️ 错误码**不能丢**：它查 `LOVART_SESSION_TEXT.openError` 的文案表（原 `xD`，`shared.js:38652-38662`）。
 */
export type LovartChromeOpen =
  | { ok: true; alreadyOpen: boolean; profileDir?: string }
  | { ok: false; error: string; message?: string };

/** 同步会话的业务结果（原 `sync-lovart-session`，`main.js`） */
export type LovartSessionSync =
  | { ok: true; count: number; total: number }
  | { ok: false; message: string };

/** 媒体（图片 / 视频外置存储） */
/**
 * 站点页里**检测到的一条视频**（原 `detect-videos` handler 的 `entry`，`electron/main.js`）
 *
 * ⚠️ 字段**逐字对后端**（它是契约真源）：
 *   `key/id/name/created_at/ready/url/width/height/duration/poster`。
 *   `key` 是**归属匹配的左值**（`core/rules/media.matchVideosToNodes` 的 `vids[].key`），
 *   `created_at` 是**时间线索**（同上 `vids[].created_at`）。
 */
export interface DetectedVideo {
  /** 站点侧唯一键（原 `it.key`）—— 归属匹配的**左值** */
  key: string;
  /** 站点侧资源 id（原 `it.id`） */
  id: string;
  name: string;
  /** 创建时间（秒 / 毫秒 / 字符串；原 `it.created_at || it.updated_at || 0`） */
  created_at: unknown;
  /** 是否已取到可播放直链（原 `entry.ready`） */
  ready: boolean;
  url: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  poster: string | null;
}

/**
 * Dola/CDP 媒体推送里的一条（后端 `dola-media` 在 guest webview 里捕获到的网络响应）
 *
 * ⚠️ 字段**逐字对后端**（未知项用 `?` 收）。`wcId` 是**来源 webview 的 `webContentsId`**
 *   —— 源用它反查账号（`S.current.get(wcId)`，`_Component43.jsx:192/242`）。
 */
export interface DolaMediaItem {
  type: 'image' | 'video';
  url: string;
  /** 来源 webview 的 `webContentsId`（缺 ⇒ 视作「全局」，源 `_global`） */
  wcId?: number;
}

/** 一次 Dola 媒体推送（源 `onDolaMedia` 回调的载荷：`{items}`） */
export interface DolaMediaEvent {
  items: DolaMediaItem[];
}

/**
 * ★ **批量取图**的请求（原 `vP` 的入参，`shared.js:33677`；后端 `lovart-fetch-images`）
 *
 * ⚠️ `partition` 是**会话隔离键**（`Account.partition`）—— 主进程据此
 *   `session.fromPartition(partition).fetch` ⇒ **带上该账号的 cookie**。
 * ⚠️ `referer` 由**站点适配器**给（Lovart = `https://www.lovart.ai/`，
 *   Tapnow = `https://app.tapnow.media/`，原 `shared.js:34090`）—— 冒充站内请求，过 CDN 防盗链。
 */
export interface FetchImagesRequest {
  accountId: string;
  partition?: string;
  referer?: string;
  urls: readonly string[];
  /** 上限（后端夹在 1–200，默认 80） */
  limit?: number;
}

/** 成功取回的一张图（原 `lovart-fetch.js` 推的 `item`） */
export interface FetchImagesItem {
  name: string;
  /** 内联 base64（`data:image/…;base64,…`） */
  dataUrl: string;
  sizeBytes?: number;
  natW?: number;
  natH?: number;
  sourceUrl: string;
  source?: string;
}

/** 批量取图的**进度回执**（原 `vP` 的 `p({phase:'working', …})`） */
export interface FetchImagesProgress {
  done: number;
  total: number;
  okCount: number;
  failCount: number;
  skipCount: number;
}

/** 整批取回的汇总（`items` 只含**成功**的图；失败 / 跳过各带原因） */
export interface FetchImagesResult {
  items: FetchImagesItem[];
  okCount: number;
  failCount: number;
  skipCount: number;
  failures: { url: string; error: string }[];
  skipped: { url: string; reason: string }[];
}

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
   *   **一处都没有**；`img://` → 真实路径的解析是**主进程内部**的事（`main.js` 的 `resolveImageRef`
   *   被 `main.js` 内部调用），前端拿到的**是路径或文案**，不需要自己解析。
   *   ⇒ 与 `setMuted` / `StoragePort` 的 3 个幽灵方法同判据（判据 B5：不留"声明了但没人调"的契约面）。
   *   ⚠️ **不是**"暂时没接" —— 是**源里就没有这个前端入口**。
   */

  imageFetchDataUrl(url: string): Promise<Result<string | null>>;
  /**
   * ★ **批量取图**（原 `vP`，`shared.js:33677`；后端 `electron/lovart-fetch.js`）
   *
   * 【为什么必须有它 —— 而不是用 `imageFetchDataUrl`】两者都是主进程下载，但取到的**不是同一批图**：
   *   · `imageFetchDataUrl`（`main.js`）是**裸 `fetch`**（假 UA、**无 cookie**）——
   *     它服务的是**文生图后台通道 CDP 抓的临时签名直链**（那些直链公开、不需要会话）。
   *   · `fetchImages` 走 `session.fromPartition(partition).fetch` ⇒ **带上账号 webview 的 cookie**——
   *     站点 CDN 的图（Lovart / Tapnow）**必须**靠它才取得到。
   *   ⇒ 扫描链的图**归它**；拿 `imageFetchDataUrl` 去取会**静默取不到「需登录态」的图**（BP-34）。
   *
   * ⚠️ 源里它是「页内取图（`mp`/`pP`）失败后」的兜底；本仓**没有页内取图档** ⇒ 它就是主路径。
   * ⚠️ **进度走 `onProgress` 回调参数**（不新开全局订阅）：它是一次请求的**流式回执**，
   *    不是「宿主事件 → store」的转发（后者才归 `state/subscriptions.ts`，原则 2）。
   * ⚠️ 后端要求**先订阅 item/done、再提交**（源顺序，`shared.js:33708-33744`）—— 实现照抄，否则漏最早的事件。
   * @returns 收齐整批后的汇总（`items` 只含**成功取回**的图）
   */
  fetchImages(
    req: FetchImagesRequest,
    onProgress?: (p: FetchImagesProgress) => void,
  ): Promise<Result<FetchImagesResult>>;
  captureRect(rect: CaptureRect): Promise<Result<string | null>>;
  /**
   * 拖出文件到系统（`webContents.startDrag`，`main.js`）
   *
   * ⚠️ **本方法的 `Result` 只能表达两件事**：宿主缺失（`window.api` 不在）/ 调用本身抛出。
   *    **「拖拽有没有真的成功」本仓无从判定** —— 后端走的是 `ipcRenderer.send`（**无回执**），
   *    失败只 `console.warn`（`main.js`）。
   *    ⇒ **调用方不得据此报「已拖出」**（如实登记：`docs/过程.md` · 母体 M5「失败不可见」的新实例）。
   * ⚠️ **payload 只有 `dataUrl` + `name`**：**不传缩略图** —— icon 由**后端**从原图 resize 到 64px
   *    （`docs/过程.md` #53「拖拽预览 icon 必须是 64px」；`main.js`）。
   *    ⛔ **不要声明 `thumbDataUrl?`** —— **后端从不读它**（它在那边的注释里被写成"会额外落盘
   *    缩略图"，属**假承诺**）⇒ 2026-10-11 **删除**（幽灵字段，母体 M6）。
   * ⚠️ 后端另支持 `path`（`docs/过程.md` #64「传 path 优先」）—— 本仓**不暴露**：我们手上的引用是
   *    `img://`，后端 `persistImageDataUrl` 对它**原样返回**（非 data URL 早退）⇒ 不会重复写盘，
   *    与传 `path` 等价（判据 B5：不留没人调的字段）。
   */
  startFileDrag(payload: { dataUrl: string; name: string }): Result<void>;
  /**
   * 清理各账号分区的**纯缓存**（Cache / Code Cache 等，原 `clear-browser-cache`，`preload.js`）
   *
   * ⚠️ **保留登录态**（与 `clearSession` 不是一回事）；返回**清理计数** ——
   *    源版 UI 要显示「已清理 N 个缓存目录（M 个被占用，下次启动会自动清理）」。
   * ⚠️ 这是 `docs/过程.md` §1.4 记的「端口早有、UI 未用」那一条（2026-10-11 接通）。
   */
  clearBrowserCache(): Promise<Result<{ cleared: number; failed?: number }>>;
  /**
   * **多帧扫描**：主进程遍历页面的全部 frame（含嵌套 / 跨域）执行同一脚本（原 `lovart-scan-frames`，`lovart-scan.js`）
   *
   * ⚠️ **必须显式调用** —— 不得自启定时器（docs/过程.md #4：自动轮询会被判机器人）
   * ⚠️ `script` 必须是**纯读取**脚本（零注入，docs/过程.md #2）
   * ⚠️ 后端要求 `webContentsId`（**不是** partition）⇒ 调用方先取 `<webview>.getWebContentsId()`
   */
  scanFrames(req: {
    webContentsId: number;
    /** 在**每个 frame** 里执行的扫描脚本 */
    script: string;
    /** 上限（后端夹在 1–24，默认 12） */
    maxFrames?: number;
  }): Promise<Result<{ items: unknown[]; href?: string }>>;

  /**
   * **检测站点页里的视频**（原 `detect-videos` handler，`electron/main.js`）
   *
   * ⚠️ **必须显式调用**（同 `scanFrames`：不得自启定时器 —— `docs/过程.md` #4）
   * ⚠️ **零注入**：后端只在 webview 里跑只读取数脚本
   * ⚠️ 后端要求 `webContentsId`（**不是** partition）⇒ 调用方先取 `<webview>.getWebContentsId()`
   * ⚠️ `seenKeys` 是**已见集合**（后端据此跳过已见视频 —— `main.js`）
   * ⚠️ 后端**每条 return 都带 `ok`** ⇒ 适配器判**内层** `ok`（fail-closed，TD-04-5）
   */
  detectVideos(
    webContentsId: number,
    seenKeys: readonly string[],
  ): Promise<Result<{ videos: DetectedVideo[] }>>;

  /**
   * ★ **订阅 Dola/CDP 媒体推送**（原 `window.api.onDolaMedia`，`_Component43.jsx:130-133`）
   *
   * ⚠️ 只有**宿主侧挂了 CDP 调试器**的 webview 才会推（`attachDolaDebugger`，由 `_Component25` 调）
   * ⚠️ **订阅是唯一写入点之外的东西** —— 收到事件后**必须**由 `state/subscriptions.ts` 转发给
   *   `state/dolaMedia` 控制器落 store（原则 2）。
   * @returns 取消订阅（必须调用，否则泄漏）
   */
  onDolaMedia(cb: (event: DolaMediaEvent) => void): () => void;

  /**
   * ★ **给某个 guest webview 挂 CDP 调试器**（原 `window.api.attachDolaDebugger`，`_Component25.jsx:136`）
   *
   * 用途：后端 `dola-media` 借此在 guest 里捕获**图 / 视频**的网络响应 ⇒ 推 `onDolaMedia`
   *   （⇒ `state/dolaMedia` 的**唯一数据来源**；没挂 ⇒ `onDolaMedia` 永不触发）。
   * ⚠️ 源只在**豆包 / Dola** 的 webview 上挂（按 `type` 或 URL 判 —— `_Component25.jsx:135`）。
   * ⚠️ 后端 handler 恒返 `{ok, error?}` ⇒ 适配器判**内层** `ok`（TD-04-5）。
   */
  attachDolaDebugger(webContentsId: number): Promise<Result<void>>;

  /**
   * ★ **Dola「30s 时长」诊断回传**（原 `ct` / `window.api.dolaDurationDiag`，`_Component43.jsx:628-636`）
   *
   * 后端把它**落盘**到 `~/dola-duration-debug.log`（`main.js`，注释原文：
   *   「便于排查『30s 失效』时真实的生成接口路径与 model 取值」）
   *   —— 它是 `docs/过程.md（原 plan/03）` 批 7（Dola 30s 强开）那条链**唯一**的可观测面。
   * ⚠️ **fire-and-forget**（源 `ct` 就是 `try{ void … }catch{}`）—— 诊断写不进去没有可做的补救，
   *   故调用方**忽略返回值**即可；实现侧失败**照常返 `Result`**（不静默吞，谁想看谁看）。
   */
  logDolaDuration(message: string): Promise<Result<void>>;

  /**
   * ★ **往某个 guest 里注入 Dola「30s 主世界钩子」**（原 `window.api.injectDolaDurationMain`，
   *   `_Component25.jsx:144/169`）
   *
   * 后端做三件事（`main.js`）：① 打开页内 30s 开关（`localStorage['intl_doubao_enable_30s_v1']='1'`）
   *   ② 注入 `dola-duration-main.js`（官方 30s 钩子）③ 主进程每 3s dump 一次时长 DOM。
   * ⚠️ **不是** `SitePort.genConfirm`/`dolaForce` 那条补丁式路径的第二份 —— 那条是**改请求体**；
   *   这条走**页面自己的 30s 开关 + 主世界钩子**（源两条都在，互不替代）。
   * ⚠️ 源在 **`dom-ready`（延迟 600ms）** 与 **`did-navigate`** 两处调（`_Component25.jsx:144/169`）。
   */
  injectDolaDurationMain(webContentsId: number): Promise<Result<void>>;

  // ── 无水印资源面板（原 `SD.jsx` 的 4 个专用宿主方法）──
  /**
   * ★ **读「无水印资源」下载设置**（原 `window.api.getDownloadSettings`，`SD.jsx:22`）
   *
   * ⚠️ 后端 `get-download-settings`（`main.js`）恒返
   *   `{ok:true, path, configured, configuredPath}` —— `path` = **生效目录**（未配置时 = 系统默认下载目录）。
   */
  getDolaMediaDownloadSettings(): Promise<Result<{ path?: string; configured?: boolean }>>;
  /**
   * ★ **选「无水印资源」下载目录**（原 `window.api.pickDownloadPath`，`SD.jsx:48/73`）
   *
   * ⚠️ 后端 `pick-download-path`（`main.js`）：成功 `{ok:true, path, configured}` ·
   *   用户取消 `{ok:false, canceled:true}` · 无窗 `{ok:false, error:'no_window'}`。
   *   **取消是如实结果**（与 `ProjectPort.pickStorage` 同形）⇒ 调用方**不得**据此报错。
   */
  pickDolaMediaDownloadPath(): Promise<
    Result<{ path?: string; configured?: boolean; canceled?: boolean }>
  >;
  /**
   * ★ **下载一条「无水印资源」**（原 `window.api.downloadDolaMedia`，`SD.jsx:136`）
   *
   * ⚠️ **与 `FilePort.downloadFile` 不是一件事**（不是重复、不得合并）：后端 `dola-media-download`
   *   （`main.js`）走**用户设置目录**（`getEffectiveDownloadDir`）＋ **自动编号命名**
   *   （`nextAutoFilePath` ⇒ `video_01.mp4` / `image_01.png`），并**按来源 webview 的 session 下载**
   *   （带 cookie 过防盗链）；`download-file` 是通用「指定路径 / 另存为」下载。源面板走的是前者。
   */
  downloadDolaMedia(
    url: string,
    mediaType: 'image' | 'video',
  ): Promise<Result<{ path?: string; size?: number }>>;
  /**
   * ★ **清空 CDP 捕获列表**（原 `window.api.clearDolaMedia`，`SD.jsx:78-88`）
   *
   * ⚠️ 后端 `dola-media-clear`（`main.js`）→ `clearDolaMediaItems()`（`dola-media.js`）
   *   清空后**会 `emit()` 推一次空列表** ⇒ 面板经既有 `onDolaMedia` 通道自动变空（无需本地清）。
   */
  clearDolaMedia(): Promise<Result<void>>;

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
   * ★ **上一次检测的统计**（原 `LD`）—— **同步只读**（纯内存计数，不经 IPC）
   *
   * 用途（原 `G3.jsx:346-350`）：检测**一张脸都没返回**时，用它区分「检测器整个失败」
   *   （`failed >= tried` ⇒ 可能 GPU/WebGL 不可用）与「跑通了但没脸」—— 少了它，
   *   真失败会被报成「未识别到人脸」（**说反了**）。
   * ⚠️ 分档判据是纯的 ⇒ 住 `core/rules/faceDetect.explainEmptyFaceDetect`（可测），
   *   本端口只把**原始计数**交上去。
   */
  faceDetectStats(): FaceDetectStats;
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
 *   **账号对象**，不是 id 字符串 —— `preload.js` 原样转发 `acc`，而
 *   `main.js` 读 `acc.partition` / `acc.proxy`，读不到就**回落到 `persist:lovart`**。
 *   ⚠️ **必须传对象** —— 传字符串 ⇒ `'abc'.partition === undefined` ⇒ **分区与指纹目录全错**（静默）。
 *
 * ⚠️ **约束 #5（`docs/过程.md`）：cookie 由后端管理，前端一律不碰** ——
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

  // ── 真实 Chrome 集成（原 `_Component25` 的「Lovart 会话条」三键）──
  //   ★ 后端早已实现（`electron/chrome-cdp.js` + `main.js` + `preload.js`），
  //     前端此前**没有调用面** ⇒ 这三条是**唯一消费者**（`ui/panels/BackendView` 的会话条）。
  //   ⚠️ **只这三条**：`lovartChromeIsOpen` 后端**明写恒返 `{ok:true, open:false}`**（`main.js`
  //      的注释：「故意恒返 false：采集统一走内嵌 webview」）⇒ 落它 = 落了没人用（判据 B5）。
  //      `ensureLovartFirefoxProfile` / `openLovartFirefox` / `removeLovartFirefoxProfile` /
  //      `getFirefoxStatus` 四个 **源前端 0 调用** ⇒ 不落。
  /**
   * 用**本机真实 Chrome**打开该账号的登录窗口（原 `window.api.ensureLovartChrome`）
   *
   * 目的（源注释）：根治内嵌 webview 被设备信任识别 —— 每个账号一个独立 Chrome profile、
   * 零 CDP / 零自动化标记，**仅用于人工登录**；登录后由 `syncLovartSession` 把 cookie 同步进 webview。
   */
  ensureLovartChrome(payload: LovartChromePayload): Promise<Result<LovartChromeOpen>>;
  /** 关闭该账号的真实 Chrome 登录窗口（原 `window.api.closeLovartChrome`） */
  closeLovartChrome(accountId: string): Promise<Result<void>>;
  /**
   * 把真实 Chrome 里的会话 cookie 同步进该账号的 webview 分区（原 `window.api.syncLovartSession`）
   *
   * ⚠️ 后端会先**关窗**（释放 profile 锁）→ 临时 headless 导出 cookie → **清空分区旧 cookie**
   *    → **剔除 Cloudflare 指纹绑定 cookie** → 注入（`main.js`）。
   */
  syncLovartSession(accountId: string, partition: string): Promise<Result<LovartSessionSync>>;

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
  /** 配置原文 + provider 元信息（后端**一次**返回两者） */
  configGet(): Promise<Result<{ providers: ApiProviderMeta[]; configs: ApiConfigMap }>>;
  configSet(providerId: string, patch: unknown): Promise<Result<{ config: unknown }>>;
  /** 密钥明文只进不出；返回脱敏提示（`sk-****7890`） */
  configSetKey(providerId: string, key: string): Promise<Result<{ keyHint?: string; maskedBy?: string }>>;
  configSetSecret(providerId: string, key: string): Promise<Result<{ hasSecret: boolean }>>;
  configTest(providerId: string): Promise<Result<{ message?: string }>>;
  /**
   * 提交单个任务 ⇒ 后端**只回 `jobId`**（结果经 `onJobEvent` 推送）
   *
   * ⚠️ 入参形状 = `stable/model/gen` 的 `ApiJobPayload`（**后端读的就是这些字段名**）——
   *    此前是 `unknown` ⇒ 报文形状漂移只在运行期暴露（且后端会静默兜底成"成功"）。
   */
  jobSubmit(payload: ApiJobPayload): Promise<Result<{ jobId: string }>>;
  /**
   * 批量提交 ⇒ 逐位 `jobIds` / `errors`
   *
   * ⚠️ `matrix` **必须是数组**（`ApiJobVariant[]`）—— 类型上钉死后，「传对象」**编译不过**；
   *    后端也同步改成非数组即 `ok:false`（不再兜成 `[]` ⇒ 不再"提交 0 个却报成功"）。
   */
  jobBatch(basePayload: ApiJobPayload, matrix: readonly ApiJobVariant[]): Promise<Result<ApiBatchResult>>;
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
   *   后端 `api-job:list` handler 确实在（`main.js`），但**前端不需要它** ——
   *   与 `setMuted` / `resolveImageRef` 同判据（判据 B5：不留"声明了但没人调"的契约面）。
   *   ⚠️ 本仓 `settings.apiJobs` **不是**它的替代物：那张表由 `state/subscriptions` 的事件增量写、
   *      由 `core/usecases/applyApiJobEvent` 读（判"上一快照"），链路自洽、不依赖本方法。
   */
  setupGet(): Promise<Result<{ setup: ApiSetup; usage: ApiUsage }>>;
  setupSet(patch: Partial<ApiSetup>): Promise<Result<{ setup: ApiSetup }>>;
  /** 订阅（只转发 —— 原则 2） */
  onJobEvent(cb: (snap: ApiJobEvent) => void): Unsubscribe;
}

/**
 * 窗口生命周期（原 `window.beforeunload`）
 *
 * ⚠️ **为什么它是端口**：`state/persist.ts` 要「页面卸载时立即落盘」，而 `state` 层
 *    **不得直挂 `window`**（与 `subscriptions.ts` 的「宿主事件订阅唯一写入点」同精神）
 *    ⇒ 宿主访问收进 `adapters/host`（原则 4 后半）。
 */
export interface LifecyclePort {
  /**
   * 订阅「页面即将卸载」（原 `window.addEventListener('beforeunload', …)`）
   * @returns 取消订阅（原 `removeEventListener`）
   */
  onBeforeUnload(cb: () => void): Unsubscribe;
}

// ─────────────────────────── 端口主体 ───────────────────────────

/**
 * ⚠️ 如实说明：对外是 1 个端口，内部 **9 个子接口**（docs/11 §4.1 审计 B4）
 * 目的：用例只依赖它需要的那一组（接口隔离），而不是 83 个方法的全集
 */
export interface HostPort {
  /**
   * ★ 真实宿主平台：来自 preload 的 `process.platform`，**不读 navigator**（docs/过程.md #59）。
   * ⚠️ **可选**：宿主没报时**如实留空**（`undefined`）—— 兜底（navigator → `'macos'`）由
   *   `adapters/host/shared/env.readHostOs` 做；端口**不得**编一个默认 OS（母体 M5：静默兜底 = 失败不可见）。
   */
  readonly os?: HostOS;

  readonly file: FilePort;
  readonly clipboard: ClipboardPort;
  readonly project: ProjectPort;
  readonly media: MediaPort;
  readonly account: AccountPort;
  readonly license: LicensePort;
  readonly api: ApiPort;
  /** 窗口生命周期（原 `window.beforeunload`）—— 消费方 `state/persist.ts` */
  readonly lifecycle: LifecyclePort;
}

// ─────────────────────────── 附属类型 ───────────────────────────

export type Unsubscribe = () => void;

/**
 * 系统「打开文件」对话框选中的素材（`importFiles` 的回执元素）。
 *
 * ★ **形状 = 后端产物 ∩ 消费者真实需要**（回源取证）：
 *   · 后端两代都只产 `{ name, fullName, dataUrl }`（`electron/main.js` 的 `import-files` handler）；
 *   · **原版渲染层三处消费点只读 `name` 与 `dataUrl`** —— `DT.jsx:11-27`（取第一张写
 *     `{name, dataUrl, w:400, h:300}`）· `RT.jsx:133-154`（只用 `dataUrl` 量尺寸）·
 *     `RT.jsx:181-208`（用 `{name, dataUrl}` 建素材）；
 *   · `fullName` 后端产但**两侧零消费者**（原版亦然）⇒ 端口**不声明**它。
 *   ⇒ 本类型**只留这两个字段**（曾有的 `path` / `size` / `type` 是端口自己发明的：原版不读、
 *     后端不产、适配器不设 —— 已删）。
 */
export interface PickedFile {
  name: string;
  /**
   * ⚠️ 仍标**可选**：后端恒产它（`persistImageDataUrl` 恒返字符串），但渲染层几处按"可能缺席"守着
   *   （`filter((f) => f.dataUrl)` / `?? ''`）—— 收成必填会让那些守卫变成永真判断（属 `ui/**` 的取舍，
   *   不在后端迁移范围）。
   */
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

/** 目录占用统计（原 `main.js` 的 `{bytes, files, partial, elapsedMs}`） */
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
