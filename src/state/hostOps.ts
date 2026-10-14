/**
 * 宿主能力控制器（★ 收窄 `ui` 对 `usePorts()` 的使用 —— TD-16-8）
 *
 * ★ **为什么需要它**：`ui` 曾**直持 `Ports`**（`usePorts()`）去调宿主能力，绕过 `state` 控制器 ——
 *   这正是母体 **TD-16-8**（「唯一入口只剩约定、无结构约束」）。本控制器是 `ui` **需要的那部分
 *   `HostPort` 面**的唯一落点：端口只在 `container`（组合根）注入一次，`ui` **拿不到 `Ports`**。
 *
 * ★ **范围 = `ports.host.*` 里 `ui` 会用到的那些**（文件域 / 媒体域 / 剪贴板）：
 *   | 方法 | 端口 | 消费者 |
 *   |---|---|---|
 *   | `dragFileOut` | `host.media.startFileDrag` | `NewImagesPanel`（长按拖出到系统） |
 *   | `copyText` | `host.clipboard.writeText` | `VideoNode`（复制配方）· `AnalyzePrompt`（复制提示词） |
 *   | `importFiles` | `host.file.importFiles` | `LibraryPanel`（从文件添加素材） |
 *   | `selectFolder` | `host.file.selectFolder` | `DownloadNode`（选目录） |
 *   | `downloadFile` | `host.file.downloadFile` | `DownloadNode`（批量下载） |
 *   | `downloadFileAs` | `host.file.downloadFileAs` | `GenVideoNode`（`gv-dl` 另存为，2026-10-11） |
 *   | `revealPath` | `host.file.revealPath` | `GenVideoNode` / `GenImageNode`（下载 toast 的「在文件夹中显示」，传真实路径）· `NodeContextMenu`（「打开文件所在位置」，传 `img://`） |
 *   | `openExternal` | `host.file.openExternal` | `GalleryLightbox`（打开原图） |
 *   | `getDolaMediaDownloadSettings` · `pickDolaMediaDownloadPath` · `downloadDolaMedia` · `clearDolaMedia` | `host.media.*` | `WatermarkPanel`（无水印资源面板，源 `SD.jsx` 的 4 个专用宿主方法） |
 *
 * ⚠️ 与 `licenseOps` / `sendQueue.readPanelPos` 同法：**只转发 + 归一**，不写第二份业务判据
 *    （业务在 `core/rules` / `usecases`；这些调用都**无编排**，故不包 `core/usecases` ——
 *    那会成"纯中转层"，见 `16-跨区-收窄ui端口可用面-批2` §四）。
 *
 * ⚠️ **落点约定（防母体 M3「同一真相两份」）**：`ui` 若还需要别的 `ports.host.*` 能力，
 *    **在本控制器上扩展方法**，**不要另起一个平行的 host 控制器**。
 *    ⇒ 由此 **`usePorts()` 从 `@/state` 移除**（结构上让 `ui` 拿不到 `Ports`）。
 *
 * ⚠️ **不落 store**：这些都是一次性副作用 / 显示偏好，不是要跨组件共享的画布状态。
 */

import type { Ports, PickedFile } from '@/core/ports';
import type { ClipboardImage } from '@/core/ports/host.port';
import type { Result } from '@/core/model/result';
import type { FaceBox, FaceMaskOpts, FaceMaskResult } from '@/core/rules/facemask';
import type { FaceDetectStats } from '@/core/rules/faceDetect';

export interface HostOpsController {
  /**
   * 把一张图**拖出到系统**（`webContents.startDrag`）—— 原 `_Component26.jsx` 的 `se`。
   *
   * ⚠️ 返回的 `Result` **只可能表达两件事**：宿主缺失 / 调用本身抛出。
   *    「拖拽有没有真的成功」**无从判定** —— 后端走 `ipcRenderer.send`（无回执），失败只 `console.warn`
   *    （`electron/main.js`）⇒ 调用方**不得**据此报「已拖出」（TD-16-63，母体 M5）。
   */
  dragFileOut(input: { dataUrl: string; name: string }): Result<void>;

  /**
   * 写**纯文本**剪贴板。
   *
   * ⚠️ 走端口而非 `navigator.clipboard`：端口实现内部保证 `docs/过程.md` #8 的
   *    **`clear()` → `writeText()` → `await`** 序列（`host.port.ts:74`「实现内部必须…」）——
   *    直调浏览器 API 会漏掉 `clear()`（旧内容可能残留）。
   */
  copyText(text: string): Promise<Result<void>>;

  /**
   * 把图片写进系统剪贴板（原 `window.api.copyImageToClipboard`）—— **图片编辑器「复制」按钮**（`G3.jsx` 的 `tt`）
   *
   * ⚠️ 走端口而非 `navigator.clipboard`（源直调 `navigator.clipboard.write` —— 本仓收进端口，
   *   与 `copyText` 同判据）。
   */
  copyImage(img: { dataUrl: string; label?: string }): Promise<Result<void>>;

  /**
   * ★ **系统剪贴板变化订阅**（原 `window.api.onClipboardImageChanged`，`_Component42.jsx:1200`）
   *
   * 用途（**与源一致**）：只把「剪贴板变过」这件事记成**时间戳** —— `Ctrl+V` 靠它判断
   * 「用户是刚复制的节点、还是在别处复制了图」（源 `V.current < ke.current`）。
   * ⚠️ **回调本身不读图片**（读图是 `readImage` 的事，那条路**未落** —— 见 `docs/过程.md` §3）。
   *
   * @returns 取消订阅（W1：`on*` 必须取取消函数）
   */
  onClipboardImageChanged(cb: () => void): () => void;
  /** 读**系统剪贴板里的图**（原 `window.api.readClipboardImage`，`_Component42.jsx:1252`）—— `Ctrl+V` 的**图片回落**用 */
  readClipboardImage(): Promise<Result<ClipboardImage | null>>;

  /** 系统「打开文件」对话框选素材（`LibraryPanel` 从文件添加 —— `host.file.importFiles`） */
  importFiles(): Promise<Result<PickedFile[]>>;

  /** 系统「选目录」对话框（`DownloadNode` —— `host.file.selectFolder`）；**取消 ⇒ `ok(null)`** */
  selectFolder(): Promise<Result<string | null>>;

  /** 下载到指定路径（`DownloadNode` —— `host.file.downloadFile`） */
  downloadFile(url: string, fileName: string): Promise<Result<{ path?: string; size?: number }>>;

  /**
   * 「另存为」对话框下载（`GenVideoNode` 的 `gv-dl` —— `host.file.downloadFileAs`）
   *
   * ⚠️ 返回的 `canceled: true` = 用户**主动取消**（源 `YL.jsx:366` 判它并静默返回）——
   *    **不是失败**，调用方不得据此报错。
   */
  downloadFileAs(
    url: string,
    defaultName: string,
    filters?: Array<{ name: string; extensions: string[] }>,
  ): Promise<Result<{ path?: string; size?: number; canceled?: boolean }>>;

  /**
   * ★ **在系统文件管理器里定位文件** —— 收**真实路径**或 **`img://` 引用**（宿主自己判别并解析）
   *
   * 两个消费者传的不是同一种东西：`GenVideoNode` / `GenImageNode` 的下载 toast 传**真实路径**，
   * `NodeContextMenu` 的「打开文件所在位置」传 **`img://`**（其 `canReveal` 判据）。
   * ⇒ 只在**端口**处做一次判别，调用方**没有**「该调哪个方法」的余地（源 `_Component42.jsx:1132-1134`）。
   */
  revealPath(p: string): Promise<Result<void>>;

  /** 用系统默认程序打开外链（`GalleryLightbox` 打开原图 —— `host.file.openExternal`） */
  openExternal(url: string): Promise<Result<void>>;

  // ── 无水印资源面板（`WatermarkPanel` —— `host.media.*`；源 `SD.jsx` 的 4 个专用宿主方法）──
  /** 读下载设置（源 `getDownloadSettings`，`SD.jsx:22`） */
  getDolaMediaDownloadSettings(): Promise<Result<{ path?: string; configured?: boolean }>>;
  /** 选下载目录（源 `pickDownloadPath`，`SD.jsx:48`）；**取消 ⇒ `ok({canceled:true})`**（不是失败） */
  pickDolaMediaDownloadPath(): Promise<
    Result<{ path?: string; configured?: boolean; canceled?: boolean }>
  >;
  /** 下载一条无水印资源（源 `downloadDolaMedia`，`SD.jsx:136`；走设置目录 + 自动命名） */
  downloadDolaMedia(
    url: string,
    mediaType: 'image' | 'video',
  ): Promise<Result<{ path?: string; size?: number }>>;
  /** 清空捕获列表（源 `clearDolaMedia`，`SD.jsx:78-88`；清空后后端会推空列表让面板自动变空） */
  clearDolaMedia(): Promise<Result<void>>;

  // ── 人脸检测 / 遮脸（`FaceMarksLayer` —— `host.media.*`）★ **渲染层本地能力** ──
  /**
   * 人脸检测（原 `qD`）
   *
   * ⚠️ 与上面各方法**不同源**：底层**不走 IPC** —— MediaPipe WASM ＋ DOM 都在**渲染层**跑。
   * ★ **`TD-16-107`**：此前 `ui/nodes/FaceMarksLayer` **直 import `adapters/media`**
   *   （违反铁律②，闸实红 2 条）⇒ 收进本控制器（它的落点约定原文：
   *   「`ui` 若还需要别的 `ports.host.*` 能力，**在本控制器上扩展方法**」）。
   * ⚠️ 底层会抛 ⇒ 端口已包成 `Result`，**错误原文照带**（原则 6）。
   */
  detectFaces(src: string): Promise<Result<FaceBox[]>>;
  /**
   * ★ **上一次检测的统计**（原 `LD`）—— 同步只读
   *
   * 消费者只有一个：`ImageEditor` 的「识别脸框」在**一张脸都没返回**时用它分档
   *   （原 `G3.jsx:346-350`）—— 分档判据在纯层 `core/rules/faceDetect.explainEmptyFaceDetect`。
   */
  faceDetectStats(): FaceDetectStats;
  /** 对人脸框应用遮罩（原 `nL`）—— 同 `detectFaces`，渲染层本地能力（Canvas） */
  applyFaceMask(src: string, face: FaceBox, opts: FaceMaskOpts): Promise<Result<FaceMaskResult>>;
}

export function createHostOps(ports: Ports): HostOpsController {
  // 端口**只在这里**被取一次 —— 控制器之外（`ui`）拿不到 `Ports`
  return {
    dragFileOut: (input) => ports.host.media.startFileDrag(input),
    copyText: (text) => ports.host.clipboard.writeText(text),
    copyImage: (img) => ports.host.clipboard.writeImage(img),
    onClipboardImageChanged: (cb) => ports.host.clipboard.onChanged(cb),
    readClipboardImage: () => ports.host.clipboard.readImage(),
    importFiles: () => ports.host.file.importFiles(),
    selectFolder: () => ports.host.file.selectFolder(),
    downloadFile: (url, fileName) => ports.host.file.downloadFile(url, fileName),
    downloadFileAs: (url, defaultName, filters) => ports.host.file.downloadFileAs(url, defaultName, filters),
    revealPath: (p) => ports.host.file.revealPath(p),
    openExternal: (url) => ports.host.file.openExternal(url),
    // ★ 无水印资源面板（源 `SD.jsx` 的 4 个专用宿主方法）：只转发（无编排、无第二份判据）
    getDolaMediaDownloadSettings: () => ports.host.media.getDolaMediaDownloadSettings(),
    pickDolaMediaDownloadPath: () => ports.host.media.pickDolaMediaDownloadPath(),
    downloadDolaMedia: (url, mediaType) => ports.host.media.downloadDolaMedia(url, mediaType),
    clearDolaMedia: () => ports.host.media.clearDolaMedia(),
    // ★ 人脸（`TD-16-107`）：**只转发**（无编排、无第二份判据 —— 与上面各方法同法）
    detectFaces: (src) => ports.host.media.detectFaces(src),
    faceDetectStats: () => ports.host.media.faceDetectStats(),
    applyFaceMask: (src, face, opts) => ports.host.media.applyFaceMask(src, face, opts),
  };
}
