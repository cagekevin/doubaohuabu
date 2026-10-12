/**
 * MediaPort 的 mock 实现（开发期，纯浏览器可跑）
 *
 * 行为对齐真实实现（docs/05 §二 H 组）：
 *   - `saveImageSync` 是 **同步**，按内容派生稳定引用（同图同引用 = 幂等）
 *   - 真实实现按 sha1 前 16 位命名，这里用同长度占位
 */

import type { CaptureRect, MediaPort } from '@/core/ports/host.port';
import { err, ok } from '@/core/model/result';
import { PROTOCOL_IMG } from '@/stable/contracts/schemas';
import { facePortFns } from '@/adapters/media/facePort';

/** 内容 → 稳定引用（同图同引用，验证幂等用） */
const cache = new Map<string, string>();

function fakeHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0').repeat(2);
}

function toImgRef(dataUrl: string): string {
  const hit = cache.get(dataUrl);
  if (hit) return hit;
  const ext = /^data:image\/(\w+)/.exec(dataUrl)?.[1] ?? 'png';
  const ref = `${PROTOCOL_IMG}${fakeHash(dataUrl)}.${ext === 'jpeg' ? 'jpg' : ext}`;
  cache.set(dataUrl, ref);
  return ref;
}

export function createMockMedia(): MediaPort {
  return {
    // ⚠️ 同步（真实实现是 sendSync）；返 Result（TD-04-2：契约声明会失败）
    saveImageSync: (dataUrl) => ok(toImgRef(dataUrl)),

    saveVideoFromUrl: async () => err('unknown', 'mock: 视频落盘未实现（M4 接真实宿主）'),

    // ⚠️ `resolveImageRef` 已于 2026-10-11 删除（源前端 0 消费者）

    imageFetchDataUrl: async () => ok(null),

    captureRect: async (_rect: CaptureRect) => ok(null),

    showInFolder: async () => ok(undefined),

    // mock：浏览器里没有"拖出文件到系统"这回事 ⇒ `ok`（无副作用，不算失败）
    startFileDrag: () => ok(undefined),

    // mock：浏览器里没有"主进程清缓存"这回事 ⇒ `ok`（无副作用，不算失败）；计数为 0
    clearBrowserCache: async () => ok({ cleared: 0 }),

    /**
     * 多帧扫描：**浏览器里没有"主进程遍历 frame"这回事** ⇒ 明确 `notImplemented`，
     * **不返回空数组冒充成功**（否则站点层的 frames 档会"永远成功但零结果"，把失败伪装起来）
     */
    scanFrames: async () => err('unknown', 'mock: 多帧扫描需要 Electron 主进程（浏览器里不可用）'),

    // mock：浏览器里没有"主进程在 webview 里取数"这回事 ⇒ 明确 `notImplemented`，**不返回空数组冒充成功**
    detectVideos: async () => err('unknown', 'mock: 视频检测需要 Electron 主进程（浏览器里不可用）'),

    // mock：浏览器里没有 CDP 调试器 ⇒ 永不推送（返回空取消函数）
    onDolaMedia: () => () => undefined,

    // mock：浏览器里没有 CDP 调试器 ⇒ 明确 `notImplemented`
    attachDolaDebugger: async () => err('unknown', 'mock: CDP 调试器需要 Electron 主进程（浏览器里不可用）'),

    // mock：浏览器里没有那个诊断日志文件 ⇒ 收下即丢（**不是失败**：诊断本来是 best-effort）
    logDolaDuration: async () => ok(undefined),

    // mock：浏览器里没有 30s 钩子那套注入 ⇒ 明确 `notImplemented`（同 `attachDolaDebugger`）
    injectDolaDurationMain: async () =>
      err('unknown', 'mock: Dola 30s 钩子注入需要 Electron 主进程（浏览器里不可用）'),

    // ★ 人脸检测 / 遮脸：**渲染层本地**（MediaPipe WASM ＋ Canvas）⇒ 浏览器里**能跑**，
    //   与 electron 实现**共用**一份（`TD-16-107`）
    ...facePortFns,
  };
}
