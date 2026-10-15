/**
 * HostPort 的 mock 实现（开发期，**纯浏览器可跑**）
 *
 * 用途：不启动 Electron 也能开发 UI（docs/11 §二 adapters/host/mock）
 * 依据：docs/05-配置契约层.md §二（83 个方法的 8 组切分）
 *
 * 铁律：
 *   - 原则 6：所有方法返回 `Result`，**不得抛异常**
 *   - 原则 6：**没有忠实形状可给时**返 `err` —— 返一个形状合法但**值是假**的结果更糟：上层会
 *     把它读成「没有」而不是「做不到」（例：`scanFrames` 返 `[]` ⇒ 站点层认为这一帧没内容）。
 *   - 反过来：**形状忠于真实宿主的假值尽管给** —— DEV 的用途就是让开发者尽快看到东西（见下）。
 *
 * ★★ **「DEV 该假哪些能力」清单** —— 判据只有一句：**开发者本地看到的东西，能不能代表生产行为？**
 *
 *   DEV 的用途只有一个：**开发者自己打开测试，所改即所得**（docs/11 §二）。所以假值的好坏不在
 *   于"诚不诚实"，而在于**形状与行为是否忠于真实宿主**：忠了的假值让本地测试有代表性，不忠的假值
 *   让开发者对着一个和生产不一样的世界调代码。
 *   （下表按 `docs/05-配置契约层.md` §二 的 8 组逐条过完；新增方法时**先归族再实现**。）
 *
 *   | 族 | 判据 | 方法 | 处置 |
 *   | --- | --- | --- | --- |
 *   | A 真实现 | 浏览器里真能做 | `openExternal` · `writeText` · `saveImageSync` · `imageFetchDataUrl` · `fetchImages` · `facePortFns` · `lifecycle` | 真做 |
 *   | B 如实空 / 取消 | 与真实宿主的「空 / 取消」同形 | `importFiles` · `loadFile` · `selectFolder` · `downloadFileAs` · `readImage` · `captureRect` · `pickStorage` · `getStorageSize`(0) · `loadAccountsFile` · `pickDolaMediaDownloadPath` · `clearBrowserCache`(0) · `configGet`(空配置) · `setupGet`(默认) | 返空 / 取消 |
 *   | C 无副作用 no-op | 本来就不该有副作用 | `saveBackup` · `saveSnapshot` · `logOperation` · `clearSession` · `setProxy` · `startFileDrag` · `logDolaDuration` · `clearDolaMedia` · `jobCancel` · `onChanged` · `onJobEvent` · `onDolaMedia` | `ok(undefined)` |
 *   | D fail-closed | **没有忠实的形状可给**（返空是合法形状但值是假的 ⇒ 上层读成"没有"） | 9 个 `notImplemented` ＋ `scanFrames` / `detectVideos` / `attachDolaDebugger` / `downloadDolaMedia` / `injectDolaDurationMain` ＋ `saveVideoFromUrl` ＋ api 的 `configSet` / `configSetKey` / `configSetSecret` / `configTest` | 明确 `err` |
 *   | E DEV 放行 | 形状忠于真实宿主；**门是生产关切**，DEV 里没有可保护的东西 | `license.getStatus`（`status`/`machineCode`/`expireAt` 三字段俱全）· `license.activateWithCode` · `license.getMachineCode`(`DBPC-DEV0-…` 自标记) | 给假值 |
 *   | F 形状忠实 | **逐个核过端口形状，全部合法**（证据见下） | `clipboard.attachImages`(带 `via:'mock'`) · `account.ensureFingerprint`(`preloadUrl?` 可选) · `account.ensurePlainSession`(两字段均可选) · `account.ensureLovartContainer`(`preloadUrl: string \| null` 正是 `null`) · `account.fpNetDiag`(返回类型 `unknown`) | 给假值 |
 *   | G 带标记的假数据 | 值本身带着"这是 mock"的标记 | `getDolaMediaDownloadSettings`(路径带「（mock）」＋ `configured:false`) · `os:'windows'` | 保留 |
 *   | H 刻意假「已受理」 | 头注已声明：不伪造产物 | `api.jobSubmit` · `api.jobBatch` · `api.setupSet`(内存镜像) | 保留 |
 *
 *   F 族的形状证据（`src/core/ports/host.port.ts`）：`ensureFingerprint → {preloadUrl?}` ·
 *   `ensurePlainSession → {userAgent?, preloadUrl?}` · `ensureLovartContainer → {userAgent?, preloadUrl: string|null}` ·
 *   `fpNetDiag → Result<unknown>` · `attachImages → AttachImagesResult`（`via`/`count` 两字段）。
 *
 * ⚠️ **2026-10-15 回改（留痕）**：E/F 曾被改判成"假成功"并门控到 `?devMock=1`（没开就返 `err`）。
 *   回改原因：那把尺子量的是"诚不诚实"，而 **DEV 的唯一用途是开发者自己快速测试** —— 授权门是
 *   生产关切，在 DEV 里要求每次显式开，是给唯一用途加摩擦。现尺子 = **本地所见能否代表生产**；
 *   按它 E/F 的假值全部形状忠实 ⇒ 恢复给值（`devMockEnabled` / `fakeBlocked` 本轮一并删除）。
 * ⚠️ mock 的选择是**运行期判定**（`hasElectronHost()`，见 `bootstrap/container.ts`）⇒ 预加载故障会
 *   退化到本文件；那种情况下整个宿主都是假的（不落盘、不出图）⇒ 授权有效只是其中一项，不特殊处理。
 * ⚠️ 本文件的错误文案（`mock: …` 前缀）属 **(c) mock 未实现**类 ⇒ 不进 `constants`。
 */

import type {
  AccountPort,
  ActivateProjectStoragePayload,
  AttachImagesResult,
  ClipboardImage,
  ClipboardPort,
  FilePort,
  HostPort,
  LicensePort,
  LicenseStatus,
  OperationLogEvent,
  PickedFile,
  ProjectPort,
} from '@/core/ports/host.port';
import { err, ok, type Result } from '@/core/model/result';
import { createMockApi } from './api';
import { createMockMedia } from './media';
import { createWindowLifecycle } from '../shared/lifecycle';

/** 未实现时的统一错误（**不返回假成功**） */
const notImplemented = (what: string) => err('unknown', `mock: ${what} 未实现（M4 接真实宿主）`);

/** 假机器码（只用于展示；`DBPC-DEV0` 前缀本身就是"这是 DEV 假值"的标记） */
const MOCK_MACHINE_CODE = 'DBPC-DEV0-DEV0-DEV0-DEV0';
/** 假授权到期日（2100-01-01）—— 与真实宿主同字段，只为 DEV 里不过期 */
const MOCK_LICENSE_EXPIRE_AT = Date.UTC(2100, 0, 1);

const createFile = (): FilePort => ({
  importFiles: async (): Promise<Result<PickedFile[]>> => ok([]),
  loadFile: async () => ok(null),
  selectFolder: async () => ok(null),
  downloadFile: async () => notImplemented('downloadFile'),
  downloadFileAs: async () => ok({ canceled: true }),
  openExternal: async (url: string) => {
    try {
      globalThis.open(url, '_blank');
      return ok(undefined);
    } catch (e) {
      return err('unknown', e instanceof Error ? e.message : String(e));
    }
  },
  revealPath: async () => notImplemented('revealPath'),
});

const createClipboard = (): ClipboardPort => ({
  readImage: async (): Promise<Result<ClipboardImage | null>> => ok(null),
  writeImage: async () => notImplemented('writeImage'),
  writeText: async (text: string) => {
    try {
      await globalThis.navigator.clipboard.writeText(text);
      return ok(undefined);
    } catch (e) {
      // 原则 6：转发原始错误，不改写
      return err('unknown', e instanceof Error ? e.message : String(e));
    }
  },
  pasteToWebview: async () => notImplemented('pasteToWebview'),
  attachImages: async (_id: number, imgs): Promise<Result<AttachImagesResult>> =>
    ok({ via: 'mock', count: imgs.length }),
  onChanged: () => () => {
    /* mock：无事件源 */
  },
});

const createProject = (): ProjectPort => ({
  // ⚠️ 同步（真实实现是 sendSync）
  activateStorage: (_p: ActivateProjectStoragePayload): Result<{ path?: string }> => ok({}),
  // 「用户没挑目录」是**如实**结果（与真实宿主取消时同形）
  pickStorage: async () => ok({ canceled: true }),
  // ⚠️ 三者是**同步**且必须返 `Result`（TD-04-2）。mock 里确实无副作用 ⇒ `ok`
  saveBackup: () => ok(undefined),
  saveSnapshot: () => ok(undefined),
  logOperation: (_e: OperationLogEvent) => ok(undefined),
  revealStorage: async () => notImplemented('revealStorage'),
  // mock 无真实目录 ⇒ 空统计（**不是**假成功：0 字节 0 文件是事实）
  getStorageSize: async () => ok({ bytes: 0, files: 0, partial: false }),
});

const createAccount = (): AccountPort => ({
  ensureFingerprint: async () => ok({}),
  ensurePlainSession: async () => ok({ userAgent: globalThis.navigator?.userAgent }),
  ensureLovartContainer: async () => ok({ preloadUrl: null }),
  clearSession: async () => ok(undefined),
  setProxy: async () => ok(undefined),
  fpNetDiag: async () => ok({}),
  // ⚠️ mock 没有真实 Chrome、也没有 profile 目录 ⇒ **如实报错**（不假装成功、不编 profileDir）
  ensureLovartChrome: async () => notImplemented('ensureLovartChrome'),
  closeLovartChrome: async () => notImplemented('closeLovartChrome'),
  syncLovartSession: async () => notImplemented('syncLovartSession'),
  // ⚠️ cookie 读写必须有**真实 session 分区**（mock 没有）⇒ 明确报错，**不假装成功**
  exportCookies: async () => notImplemented('exportCookies'),
  importCookies: async () => notImplemented('importCookies'),
  saveAccountsFile: async () => notImplemented('saveAccountsFile'),
  // 「用户没选文件」是**如实**的结果（不是假成功）⇒ 与真实宿主取消时同形
  loadAccountsFile: async () => ok(null),
});

const createLicense = (): LicensePort => ({
  // 假机器码只用于展示（`DBPC-DEV0` 前缀即"这是 DEV 假值"的标记）
  getMachineCode: async () => ok(MOCK_MACHINE_CODE),
  getStatus: async (): Promise<Result<LicenseStatus>> =>
    ok({ status: 'ok', machineCode: MOCK_MACHINE_CODE, expireAt: MOCK_LICENSE_EXPIRE_AT }),
  activateWithCode: async (): Promise<Result<LicenseStatus>> => ok({ status: 'ok' }),
  exportMachineCode: async () => notImplemented('exportMachineCode'),
});

/** 组装 mock HostPort */
export function createMockHost(): HostPort {
  return {
    // ★ 真实宿主平台（真实实现来自 preload 的 process.platform；mock 固定 windows）
    os: 'windows',
    lifecycle: createWindowLifecycle(),
    file: createFile(),
    clipboard: createClipboard(),
    project: createProject(),
    media: createMockMedia(),
    account: createAccount(),
    license: createLicense(),
    api: createMockApi(),
  };
}
