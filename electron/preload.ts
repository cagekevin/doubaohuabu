// ============================================================
// 渲染层 ↔ 后端的 **原始面**（`window.api`）
// ------------------------------------------------------------
// ★ 这个对象 `satisfies WindowApi`（形状来自契约真源 `src/stable/ipc-channels.ts`，
//   经 `@shared` **type-only** 引入）⇒ **漏一个 / 多一个 / 改名 / 种类不符，编译期当场红** ——
//   这就是"消灭人工对账"的落点（对比：此前靠 `extract-host-api.cjs` 人工比差集）。
// ★ **频道名（字符串）已收进类型层**：契约表派生的 `IpcChannelName` 约束了本文件四个调用口
//   （`invoke` / `send` / `subscribe` / `syncUnknown`）**与**后端 `electron/ipc.ts` 的 `handle` / `on`
//   ⇒ **写错的频道名编译不过**（此前两侧各写一次裸字符串：写错一个字，类型/lint/冒烟全绿，只有运行期静默失效）。
//   ⚠️ 字符串本身仍在两侧各出现一次 —— 后端**不许运行时 import `@shared`**（那里只有 .d.ts），
//      且映射（成员名 → 频道名）不是机械可推的（`apiJobSubmit` → `api-job:submit`）。
//      ⇒ 收掉的是"不一致**不可能**"，不是"只写一次"。
// ============================================================
import { contextBridge, ipcRenderer } from 'electron';
// ⚠️ `resolution-mode: 'import'` 不是装饰：共享声明层由 `src/stable/`（**ESM**，根 package.json 是 `"type":"module"`）
//    产出 ⇒ 从 CommonJS 文件里做纯类型导入时，TS 要求显式声明这次解析按 ESM 走（否则 TS1541）。
//    ⛔ 也没有别的选：换成运行时 import 会把渲染层源码打进后端产物（判据见 eslint 的 `@shared` 规则）。
import type { IpcChannelMap, IpcChannelName, WindowApi } from '@shared/ipc-channels' with { 'resolution-mode': 'import' };

// 真实宿主平台：preload 运行于主窗口上下文，process.platform 100% 准确，不受任何指纹
// 伪装 preload 影响。指纹模块 detectHostOS() 优先采用它，避免在渲染进程里读「被改写过的
// navigator」而误判平台（真源 = src/constants/fingerprint.ts + src/adapters/host/shared/env.ts）。
function hostOSFromPlatform(): 'windows' | 'macos' | 'linux' {
  const p = (typeof process !== 'undefined' && process.platform) || '';
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  if (p === 'linux') return 'linux';
  return 'macos';
}

/**
 * 契约表里「某频道 → 它的回执形状」的查表（**表是真源 ⇒ 形状只在这里取一次**）
 */
type RetOfChannel<C extends string> = {
  [K in keyof IpcChannelMap]: IpcChannelMap[K]['channel'] extends C
    ? IpcChannelMap[K] extends { ret: infer R }
      ? R
      : unknown
    : never;
}[keyof IpcChannelMap];

/**
 * ★ **三个带频道名约束的调用口** —— 频道名收口的落点：`channel` 只能取自契约表（`IpcChannelName`）。
 *   ⛔ 别退回 `invoke('…')` 的裸字符串：那样写错一个频道名，类型/lint/冒烟全绿，
 *      只有运行期静默失效（`electron/ipc.ts` 的 `handle`/`on` 收的是同一个联合 ⇒ 两端一起受检）。
 */
function invoke<C extends IpcChannelName>(channel: C, ...args: unknown[]): Promise<RetOfChannel<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<RetOfChannel<C>>;
}
function send<C extends IpcChannelName>(channel: C, ...args: unknown[]): void {
  ipcRenderer.send(channel, ...args);
}
/** 订阅 + 取消函数**收一处**（此前每个订阅把同一个频道名写两遍：`on` 一次、`removeListener` 一次） */
function subscribe<C extends IpcChannelName>(channel: C, listener: (...args: unknown[]) => void): () => void {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

/**
 * `sendSync` 的唯一收窄口：`ipcRenderer.sendSync` 的返回类型是 `any`（electron 的签名如此），
 * 直接返回会踩类型安全层的 `no-unsafe-return`。
 *
 * ★ **形状取自契约表**（`IPC_CHANNELS.<成员>.ret`）—— 断言的是**真源**而不是本地猜测：
 *   后端那条 `on(channel, …)` 处理器写的就是这个形状，且注册处守卫（`electron/ipc.ts`）保证
 *   异常也落成表里那一支。⛔ 这里**不写**任何具体形状（写第二份就是第二载体）。
 */
function syncUnknown<C extends IpcChannelName>(channel: C, ...args: unknown[]): RetOfChannel<C> {
  return ipcRenderer.sendSync(channel, ...args) as RetOfChannel<C>;
}

contextBridge.exposeInMainWorld('api', {
  // 真实宿主平台（'windows' | 'macos' | 'linux'），指纹身份据此生成，必须与宿主一致
  hostOS: hostOSFromPlatform(),
  importFiles: () => invoke('import-files'),
  saveFile: (content) => invoke('save-file', content),
  loadFile: () => invoke('load-file'),
  // 工程数据磁盘级备份（fire-and-forget）：主进程写 userData/projects-autobackup.json，
  // 与 localStorage 的 leveldb 物理隔离 —— Local Storage 再被清空时可从这份 JSON 恢复。
  saveProjectsBackup: (json) => send('projects-backup', json),
  // 当前项目分类存储：项目切换使用同步调用，保证 img:// / vid:// 首帧就从正确目录读取。
  activateProjectStorage: (payload) => syncUnknown('project-storage-activate-sync', payload),
  pickProjectStorage: (payload) => invoke('project-storage-pick', payload),
  saveProjectSnapshot: (project) => send('project-snapshot', project),
  logProjectOperation: (event) => send('project-operation', event),
  revealProjectStorage: (storagePath) => invoke('project-storage-reveal', storagePath),
  // 工程占用储存空间（递归统计指定目录的总字节数），用于顶部栏展示
  getProjectStorageSize: (storagePath) => invoke('project-storage-size', storagePath),
  openExternal: (url) => invoke('open-external', url),
  // 写图片到系统剪贴板。webContentsId（可选）用于：主进程 clipboard 无 writeImage
  // 时回落到「该 webview 页面内」用 navigator.clipboard.write 写入。
  copyImageToClipboard: (img, webContentsId) => invoke('copy-image-to-clipboard', img, webContentsId),
  // 主通路：把参考图作为「真实文件」经 CDP 直喂豆包的上传 input[type=file]
  // imgs: [{ dataUrl, label }]（数组顺序即参考图顺序）
  // → { ok, via:'cdp-file-input', count, nodeId, accept, files:[…], errors:[…] }
  attachImagesToWebview: (webContentsId, imgs) => invoke('attach-images-to-webview', webContentsId, imgs),
  copyTextToClipboard: (text) => invoke('copy-text-to-clipboard', text),
  pasteToWebview: (id) => invoke('paste-to-webview', id),
  // 画布 Cmd/Ctrl+V 粘贴系统剪贴板图片：{ ok, dataUrl, w, h, name?, source? } | { ok: false }
  readClipboardImage: () => invoke('read-clipboard-image'),
  // 应用内（如 webview 里的「复制图片」）写入系统剪贴板图片时主进程广播
  onClipboardImageChanged: (cb) => subscribe('clipboard-image-changed', () => cb()),
  // 账号导入导出
  exportAccountCookies: (partition) => invoke('export-account-cookies', partition),
  importAccountCookies: (partition, cookies) => invoke('import-account-cookies', partition, cookies),
  saveAccountsFile: (content) => invoke('save-accounts-file', content),
  loadAccountsFile: () => invoke('load-accounts-file'),
  // 文件下载
  selectFolder: () => invoke('select-folder'),
  downloadFile: (url, fileName) => invoke('download-file', url, fileName),
  // 另存为：弹原生保存对话框选路径（默认「下载」目录），返回 { ok, path, size } 或 { canceled: true }
  downloadFileAs: (url, defaultName, filters) => invoke('download-file-as', url, defaultName, filters),
  // 在系统文件管理器中定位该路径（下载完成后的「在文件夹中显示」）
  revealPath: (p) => invoke('reveal-path', p),
  // 授权激活
  getMachineCode: () => invoke('get-machine-code'),
  getLicenseStatus: () => invoke('get-license-status'),
  activateWithCode: (code) => invoke('activate-with-code', code),
  exportMachineCode: (machineCode) => invoke('export-machine-code', machineCode),
  // 视频截图：捕获指定屏幕区域并返回裁剪后的 PNG dataUrl
  captureRect: (rect) => invoke('capture-rect', rect),
  // 视频自动检测：通过主进程在 webview 内执行检测脚本（绕过渲染进程 GUEST_VIEW_MANAGER_CALL 限制）
  detectVideos: (webContentsId, seenKeys) => invoke('detect-videos', webContentsId, seenKeys),
  detectErrors: (webContentsId) => invoke('detect-errors', webContentsId),
  // 图片外置存储：dataUrl → img:// 引用（同步落盘，供持久化链路使用）
  saveImageSync: (dataUrl) => syncUnknown('img-save-sync', dataUrl),
  // 视频外置存储：远端视频直链 → 落盘为 vid:// 引用（历史版本跨重启可播放）
  // 返回 { ok, ref: 'vid://<sha1>.mp4', size } 或 { ok:false, error }
  saveVideoFromUrl: (url, referer) => invoke('save-video-from-url', { url, referer }),
  // 远端图片直链 → dataUrl（主进程下载转 base64；文生图后台通道的 CDP 图片回流用）
  imageFetchDataUrl: (url) => invoke('image-fetch-dataurl', url),
  // 清理浏览器缓存（各账号分区的 Cache / Code Cache 等纯缓存），释放磁盘空间；保留登录态
  clearBrowserCache: () => invoke('clear-browser-cache'),
  // 跨界面拖放：把一张图片作为真实文件发起系统级拖拽（拖到 Lovart / Tapnow 的 webview 内松手即放入素材）。
  // 渲染进程长按时调用，主进程把 dataUrl 落盘后调用 webContents.startDrag 启动系统拖拽。
  // payload: { dataUrl, name }，dataUrl 才是真正 drop 的文件；拖拽 icon 由主进程从原图 resize 到 64px。
  startFileDrag: (payload) => send('start-file-drag', payload),
  // 指纹伪装：为本账号生成专属 webview preload（按 id 隔离），返回 { ok, preloadUrl }
  ensureFingerprint: (acc) => invoke('ensure-fingerprint', acc),
  // 指纹诊断：查该账号会话的真实出口链路（DIRECT / PROXY x.x.x.x:port）与真实引擎版本
  fpNetDiag: (partition) => invoke('fp-net-diag', { partition }),
  // 纯净会话：需要人机校验的站点（Cloudflare Turnstile，如 Lovart）用「原生 Chromium + 去 Electron 标识 UA」，
  // 不注入任何篡改脚本，返回 { ok, userAgent }
  ensurePlainSession: (acc) => invoke('ensure-plain-session', acc),
  // Lovart 容器隔离：每个 Lovart 账号一个独立 session partition，
  // 清理新容器残留、剥离高熵 Client Hints、收紧敏感权限（参考 Firefox Multi-Account Containers）
  ensureLovartContainer: (acc) => invoke('ensure-lovart-container', acc),
  // 移除账号时清理该账号容器的全部数据
  clearAccountSession: (partition) => invoke('clear-account-session', { partition }),
  // 每账号出口代理（Lovart 多账号隔离用）：为指定 partition 的会话设置/清除代理，空串 = 直连
  setAccountProxy: (partition, proxy) => invoke('set-account-proxy', { partition, proxy }),
  // Lovart 改用内置 Firefox 启动：每个账号一个独立 profile（预装多账号容器插件）
  ensureLovartFirefoxProfile: (accountId) => invoke('ensure-lovart-firefox-profile', { accountId }),
  openLovartFirefox: (args) => invoke('open-lovart-firefox', args),
  removeLovartFirefoxProfile: (accountId) => invoke('remove-lovart-firefox-profile', { accountId }),
  getFirefoxStatus: () => invoke('get-firefox-status'),
  // Lovart 改用本机真实 Google Chrome（CDP 集成）：根治内嵌 webview 被设备信任识别。
  // 每个账号一个独立 Chrome profile（零 CDP / 零自动化标记），仅用于人工登录 Lovart。
  // 登录后由 syncLovartSession 把会话 cookie 同步进内嵌 webview 分区，自动采集继续走 webview。
  ensureLovartChrome: (args) => invoke('ensure-lovart-chrome', args),
  closeLovartChrome: (args) => invoke('close-lovart-chrome', args),
  syncLovartSession: (args) => invoke('sync-lovart-session', args),
  lovartChromeIsOpen: (accountId) => invoke('lovart-chrome-is-open', accountId),
  getLovartChromeStatus: () => invoke('get-lovart-chrome-status'),
  // dola 无水印资源：主进程 CDP 拦截 dola 聊天响应后实时推送
  onDolaMedia: (cb) => subscribe('dola-media-update', (_e, payload) => cb(payload)),
  downloadDolaMedia: (url, mediaType) => invoke('dola-media-download', url, mediaType),
  clearDolaMedia: () => invoke('dola-media-clear'),
  // Lovart 画廊：渲染端在 Lovart 页面内主动扫描出图片 URL（含历史图片，
  // 不受「何时挂载」限制），交主进程带该账号 cookie 下载原图后回传。
  // 下载分批推送：每张完成发 lovart-fetch-item，整批结束发 lovart-fetch-done。
  lovartFetchImages: (args) => invoke('lovart-fetch-images', args),
  onLovartFetchItem: (cb) => subscribe('lovart-fetch-item', (_e, payload) => cb(payload)),
  onLovartFetchDone: (cb) => subscribe('lovart-fetch-done', (_e, payload) => cb(payload)),
  // 按 frame 全量扫描：webview.executeJavaScript 只能扫顶层文档，
  // 编辑器若在嵌套/跨域 iframe 里就会漏；主进程可遍历全部 frame。
  lovartScanFrames: (args) => invoke('lovart-scan-frames', args),
  // 诊断：写一行日志到 userData/lovart-diag.log（返回日志路径）
  lovartDiag: (payload) => invoke('lovart-diag', payload),
  // 诊断：在 Finder 中显示日志文件
  lovartDiagOpen: () => invoke('lovart-diag-open'),
  // 一键 DOM 快照：把当前 Lovart 页面所有 img/canvas/background-image 写到 userData/lovart-dom-dump-{ts}.json
  lovartDomDump: (args) => invoke('lovart-dom-dump', args),
  // 无水印资源：下载路径设置 + 自动命名
  getDownloadSettings: () => invoke('get-download-settings'),
  pickDownloadPath: () => invoke('pick-download-path'),
  // dola 主世界注入「30s/音频参考」脚本（duration-main.js），参数为 webview 的 webContentsId
  injectDolaDurationMain: (webContentsId) => invoke('inject-dola-duration-main', webContentsId),
  // dola 30s 诊断：主世界注入脚本回传诊断行，主进程写入 ~/dola-duration-debug.log
  dolaDurationDiag: (message) => invoke('dola-duration-diag', message),
  // dola 无水印 CDP 拦截：按 webview（guest WebContents）挂 debugger（比 did-attach-webview 更可靠）
  attachDolaDebugger: (webContentsId) => invoke('attach-dola-debugger', webContentsId),

  // ============ API 接入（第三方图像/视频生成服务）============
  // 密钥只回脱敏提示（keyHint），明文永不过桥；任务事件单向推送。
  apiProvidersList: () => invoke('api-providers:list'),
  apiConfigGet: () => invoke('api-config:get'),
  apiConfigSet: (providerId, patch) => invoke('api-config:set', providerId, patch),
  apiConfigSetKey: (providerId, key) => invoke('api-config:set-key', providerId, key),
  apiConfigTest: (providerId) => invoke('api-config:test', providerId),
  apiJobSubmit: (payload) => invoke('api-job:submit', payload),
  apiJobBatch: (basePayload, matrix) => invoke('api-job:batch', basePayload, matrix),
  apiJobCancel: (jobId) => invoke('api-job:cancel', jobId),
  apiJobList: () => invoke('api-job:list'),
  // 通道设置（双通道 / 兜底 / 并发）与二次密钥
  apiSetupGet: () => invoke('api-setup:get'),
  apiSetupSet: (patch) => invoke('api-setup:set', patch),
  apiConfigSetSecret: (providerId, key) => invoke('api-config:set-secret', providerId, key),
  onApiJobEvent: (cb) => subscribe('api-job-event', (_e, snap) => cb(snap)),
} satisfies WindowApi);
