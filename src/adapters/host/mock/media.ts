/**
 * MediaPort 的 mock 实现（开发期，纯浏览器可跑）
 *
 * 行为对齐真实实现（docs/05 §二 H 组）：
 *   - `saveImageSync` 是 **同步**，按内容派生稳定引用（同图同引用 = 幂等）
 *   - 真实实现按 sha1 前 16 位命名，这里用同长度占位
 */

import type {
  CaptureRect,
  FetchImagesItem,
  FetchImagesProgress,
  FetchImagesRequest,
  MediaPort,
} from '@/core/ports/host.port';
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

/**
 * 造一张**确定性的**内联图（同 `url` ⇒ 同图）—— 供 `imageFetchDataUrl` 用
 *
 * ⚠️ 用 **SVG**（纯字符串 ⇒ 不依赖 `document`/canvas，任何环境都能跑）；契约只要求
 *    「`data:image/…;base64,…`」（`isInlineImage`，见 `stable/protocols/img.ts`）——
 *    那也是 `materializeOne` 判定"要不要落盘"的判据。
 * ⚠️ **每个 `url` 不同图**：否则所有抓取项会落成**同一个 `img://` 引用**，
 *    DEV 里"抓了 N 张"会被下游按内容去重成 1 张（**假象**）。
 * ⚠️ **禁 `Math.random()` / `Date.now()`**：不可复现，且与 `saveImageSync` 的
 *    「同图同引用 = 幂等」自相矛盾。
 */
function mockInlineImage(url: string): string {
  const tag = fakeHash(url); // 16 位 hex（纯 ASCII）⇒ `btoa` 安全
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">` +
    `<rect width="160" height="90" fill="#374151"/>` +
    `<text x="8" y="48" font-size="12" fill="#e5e7eb">${tag}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function createMockMedia(): MediaPort {
  return {
    // ⚠️ 同步（真实实现是 sendSync）；返 Result（TD-04-2：契约声明会失败）
    saveImageSync: (dataUrl) => ok(toImgRef(dataUrl)),

    saveVideoFromUrl: async () => err('unknown', 'mock: 视频落盘未实现（M4 接真实宿主）'),

    // ⚠️ `resolveImageRef` 已于 2026-10-11 删除（源前端 0 消费者）

    /**
     * ★ **真的取回一张内联图**（否则开发期无法验证**抓取链**）
     *
     * 【为什么必须这样】原先恒返 `ok(null)` ⇒ `materializeOne` 拿到 `ok` 却
     *   `typeof value !== 'string'` ⇒ 逐张 `not-inline` ⇒ **抓取链在 DEV 永远零结果**
     *   （= 该链路在 DEV 不可验证 · `BP-31`）。
     *
     * 【不联网】图是**合成**的，**不真去 fetch 那个 url** —— DEV 不该打真实 CDN。
     * 【同形】非法地址 ⇒ `err` —— 真实宿主对 `bad-url` 就是 `{ok:false}`（`electron/main.js`
     *   只认 `^https?://`）；`ok(null)` 那种「成功但没图」在真实实现里**从不出现**，
     *   不该由 mock 独有（那会让调用方静默走到 `not-inline`）。
     * ⚠️ `reason` 用 `unknown` + **原文 message**：`SendFailKind` 表里没有 `bad-url`，
     *   按 `constants/failure.ts` 的口径「表里没有的 → 归 `unknown`，**但必须保留原始 message**」。
     */
    imageFetchDataUrl: async (url: string) => {
      const u = String(url ?? '');
      if (!/^https?:\/\//i.test(u)) {
        return err('unknown', `mock: 非法图片地址（只认 http(s)）：${u}`);
      }
      return ok(mockInlineImage(u));
    },

    /**
     * ★ **批量取图**（DEV）—— 合成图 + 逐张回进度 + 收尾返汇总
     *
     * 【为什么必须真产出】同 `imageFetchDataUrl`（BP-31）：否则扫描链在 DEV **永远零结果**。
     * 【与真实实现**同形**】真实是「先订阅 item/done、再提交」的流式推送；这里逐张 `onProgress`
     *   + 收尾返汇总 —— 调用方（`materializeScan`）**不需要区分** mock / 真实。
     * 【不联网】合成 SVG（同 url 同图，见 `mockInlineImage`）。
     * ⚠️ 非法地址计入 `failures`（与 `imageFetchDataUrl` 的 `err` 同判据：真实宿主对 `bad-url` 就是失败）。
     */
    fetchImages: async (
      req: FetchImagesRequest,
      onProgress?: (p: FetchImagesProgress) => void,
    ) => {
      const urls = [...req.urls];
      const total = urls.length;
      const items: FetchImagesItem[] = [];
      const failures: { url: string; error: string }[] = [];
      const skipped: { url: string; reason: string }[] = [];
      let okCount = 0;
      let failCount = 0;
      const skipCount = 0;
      for (let i = 0; i < urls.length; i += 1) {
        const u = String(urls[i] ?? '');
        if (!/^https?:\/\//i.test(u)) {
          failCount += 1;
          failures.push({ url: u, error: `mock: 非法图片地址（只认 http(s)）：${u}` });
        } else {
          okCount += 1;
          items.push({ name: `mock-${i + 1}`, dataUrl: mockInlineImage(u), sourceUrl: u, source: 'mock' });
        }
        onProgress?.({ done: i + 1, total, okCount, failCount, skipCount });
      }
      return ok({ items, okCount, failCount, skipCount, failures, skipped });
    },

    captureRect: async (_rect: CaptureRect) => ok(null),

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

    // ── 无水印资源面板（原 `SD.jsx` 的 4 个专用宿主方法）──
    // mock：没有主进程「设置下载目录」这套 ⇒ 给一个**明确的 mock 路径**（不假装是真实目录）
    getDolaMediaDownloadSettings: async () => ok({ path: '（mock）下载目录', configured: false }),
    // 「用户没挑目录」是**如实**结果（与真实宿主取消时同形）
    pickDolaMediaDownloadPath: async () => ok({ canceled: true }),
    // mock：浏览器里没有「主进程按设置路径 + 自动命名下载」这回事 ⇒ 明确 `notImplemented`
    downloadDolaMedia: async () =>
      err('unknown', 'mock: 无水印资源下载需要 Electron 主进程（浏览器里不可用）'),
    // mock：没有后端捕获列表 ⇒ 清空是**无副作用的如实成功**（清空后由既有 `onDolaMedia` 通道推空）
    clearDolaMedia: async () => ok(undefined),

    // mock：浏览器里没有 30s 钩子那套注入 ⇒ 明确 `notImplemented`（同 `attachDolaDebugger`）
    injectDolaDurationMain: async () =>
      err('unknown', 'mock: Dola 30s 钩子注入需要 Electron 主进程（浏览器里不可用）'),

    // ★ 人脸检测 / 遮脸：**渲染层本地**（MediaPipe WASM ＋ Canvas）⇒ 浏览器里**能跑**，
    //   与 electron 实现**共用**一份（`TD-16-107`）
    ...facePortFns,
  };
}
