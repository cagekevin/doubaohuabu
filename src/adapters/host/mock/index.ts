/**
 * HostPort 的 mock 实现（开发期，**纯浏览器可跑**）
 *
 * 用途：不启动 Electron 也能开发 UI（docs/11 §二 adapters/host/mock）
 * 依据：docs/05-配置契约层.md §二（83 个方法的 8 组切分）
 *
 * 铁律：
 *   - 原则 6：所有方法返回 `Result`，**不得抛异常**
 *   - 原则 6：未实现的能力返回**明确的错误**（`err`），**不返回假的成功**
 *     —— 假成功会让 UI 显示"看起来正常"的假象，掩盖真实缺失
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

/** 未实现时的统一错误（**不返回假成功**） */
const notImplemented = (what: string) => err('unknown', `mock: ${what} 未实现（M4 接真实宿主）`);

const createFile = (): FilePort => ({
  importFiles: async (): Promise<Result<PickedFile[]>> => ok([]),
  /**
   * mock 的 `saveFile`：**真的触发浏览器下载**（否则开发期无法验证导出链路）。
   * 真实宿主是「弹保存对话框」，mock 是「Blob 下载」——两者对调用方**同形**。
   */
  saveFile: async (content: string) => {
    try {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return ok({ path: 'project.json' });
    } catch (e) {
      // ★ 原样透传（原则 6）
      return err('unknown', e instanceof Error ? e.message : String(e));
    }
  },
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
  pickStorage: async () => ok({ canceled: true }),
  // ⚠️ 三者是**同步**且必须返 `Result`（TD-04-2）。mock 里确实无副作用 ⇒ `ok`
  saveBackup: () => ok(undefined),
  saveSnapshot: () => ok(undefined),
  logOperation: (_e: OperationLogEvent) => ok(undefined),
  revealStorage: async () => notImplemented('revealStorage'),
  getStorageSize: async () => ok(0),
});

const createAccount = (): AccountPort => ({
  ensureFingerprint: async () => ok({}),
  ensurePlainSession: async () => ok({ userAgent: globalThis.navigator?.userAgent }),
  ensureLovartContainer: async () => ok({ preloadUrl: null }),
  clearSession: async () => ok(undefined),
  setProxy: async () => ok(undefined),
  fpNetDiag: async () => ok({}),
});

const createLicense = (): LicensePort => ({
  getMachineCode: async () => ok('DBPC-DEV0-DEV0-DEV0-DEV0'),
  getStatus: async (): Promise<Result<LicenseStatus>> =>
    ok({ status: 'ok', licenseKey: 'DEV-MOCK', expireAt: Date.UTC(2100, 0, 1) }),
  activateWithCode: async (): Promise<Result<LicenseStatus>> => ok({ status: 'ok' }),
  exportMachineCode: async () => notImplemented('exportMachineCode'),
});

/** 组装 mock HostPort */
export function createMockHost(): HostPort {
  return {
    // ★ 真实宿主平台（真实实现来自 preload 的 process.platform；mock 固定 windows）
    os: 'windows',
    file: createFile(),
    clipboard: createClipboard(),
    project: createProject(),
    media: createMockMedia(),
    account: createAccount(),
    license: createLicense(),
    api: createMockApi(),
  };
}
