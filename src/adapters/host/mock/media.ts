/**
 * MediaPort 的 mock 实现（开发期，纯浏览器可跑）
 *
 * 行为对齐真实实现（docs/05 §二 H 组）：
 *   - `saveImageSync` 是 **同步**，按内容派生稳定引用（同图同引用 = 幂等）
 *   - 真实实现按 sha1 前 16 位命名，这里用同长度占位
 */

import type { CaptureRect, MediaPort } from '@/core/ports/host.port';
import { err, ok, toMessage } from '@/core/model/result';
import { PROTOCOL_IMG } from '@/stable/contracts/schemas';

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

    resolveImageRef: async () => ok(null),

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
  };
}

// 显式引用，避免未使用告警（mock 内部错误路径使用）
void toMessage;
