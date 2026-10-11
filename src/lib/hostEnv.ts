/**
 * 宿主环境读取（★ **不纯**：读 `window` / `navigator` / WebGL —— 但无状态、无副作用）
 *
 * ★ **为什么单独一个文件**：指纹生成器（`core/rules/fingerprintGenerator.ts`）是**纯**的，
 *   它把「当前 OS / 引擎主版本 / 真实窗口尺寸 / 真实 GPU」四样**当入参收**。这四样的**读数**
 *   就是本文件 —— 原版里它们散在 `Uc`(25080) / `S$`(25108) / `M$`(25336) / `$$`(25354) 里，
 *   与生成逻辑混在一起（于是 `zc` 无法单测）。这里**只读不决策**。
 *
 * ⚠️ 归 `lib`（L0 无状态工具）而不是 `adapters`：它不经 `window.api` IPC，纯读**渲染层自己的**
 *   `window`/`navigator`/WebGL —— 与既有的 `lib/selection.ts`（读 selection/DOM 但无状态）同类。
 * ⚠️ **全部 best-effort**：任何一项读不到都返回兜底值（源版同款 `try{}catch{}`），
 *   因为**指纹生成不能因为"读不到窗口尺寸"而失败** —— 生成器对每一项都有全表兜底。
 */

// ⚠️ `lib` 是 L0，**不得**依赖 `stable`（`foundation-no-upward`）⇒ 只借 L0 的 `HostOS`
import type { HostOS } from '@/constants';

/** 引擎主版本的兜底（原 `S$` 25116）—— 与生成器的 `FALLBACK_CHROME_MAJOR` 同值 */
const FALLBACK_CHROME_MAJOR = 126;

/**
 * 当前宿主 OS（原 `Uc` 25080-25107）
 *
 * 三级回落（**逐字对齐源**）：
 *   ① `window.api.hostOS`（主进程报的，最可信）
 *   ② `navigator.userAgentData.platform` → `navigator.platform` → `navigator.userAgent` 里的关键字
 *   ③ 兜底 **`'macos'`**（源版 `return 'macos'`，注意它**不看 `process.platform` 的 linux**）
 *
 * @param hostReported 由 adapter 从 `window.api.hostOS` 读到的值（没有就传 `undefined`）
 */
export function readHostOs(hostReported?: unknown): HostOS {
  if (hostReported === 'windows' || hostReported === 'macos' || hostReported === 'linux') {
    return hostReported;
  }
  try {
    if (typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
      const t = String(nav.userAgentData?.platform || navigator.platform || navigator.userAgent || '');
      if (/win/i.test(t)) return 'windows';
      if (/mac|iphone|ipad|ipod/i.test(t)) return 'macos';
      if (/linux/i.test(t)) return 'linux';
    }
  } catch {
    // catch-ok: best-effort 读数（window / navigator）—— 读不到即走下面的兜底值，不阻断指纹生成（源版同款）
  }
  return 'macos';
}

/** 真实引擎主版本（原 `S$` 25108-25117）—— 读 UA 里的 `Chrome/<n>`，读不到给 `126` */
export function readChromeMajor(): number {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const m = /Chrome\/(\d+)/.exec(String(ua));
    const n = m && m[1] ? parseInt(m[1], 10) : 0;
    if (n) return n;
  } catch {
    // catch-ok: best-effort 读数 —— UA 解析失败即返回 FALLBACK_CHROME_MAJOR（不抛）
  }
  return FALLBACK_CHROME_MAJOR;
}

/**
 * 真实窗口尺寸（原 `M$` 25336-25344 读的那两个值）
 *
 * ⚠️ 与源一致：`max(inner, outer)`（因为 `inner` 可能小于 `outer`，而候选表里的 `w/h`
 *    是**整屏逻辑分辨率**量级）—— 取大的那侧才不会把"可用候选"全过滤掉。
 */
export function readRealViewport(): { w: number; h: number } {
  try {
    if (typeof window !== 'undefined') {
      return {
        w: Math.max(Number(window.innerWidth) || 0, Number(window.outerWidth) || 0),
        h: Math.max(Number(window.innerHeight) || 0, Number(window.outerHeight) || 0),
      };
    }
  } catch {
    // catch-ok: best-effort 读数 —— 窗口尺寸读不到即返回 {0,0}（生成器对每项都有全表兜底）
  }
  return { w: 0, h: 0 };
}

/**
 * 真实 GPU 的 `vendor + ' ' + renderer`（原 `$$` 25357-25358 读的那串）
 *
 * ⚠️ 源版读的是 `_cmp_Py.webgl`（一个**已缓存**的探测结果）⇒ 这里同样**记忆化**
 *    （建 WebGL 上下文不便宜，而 `addAccount` 每次都要问一次）。
 * ⚠️ **拿不到就返回 `''`** —— 生成器的 `filterWinWebgl('')` 会**回落全表**（不会失败）。
 */
let gpuCache: string | null = null;

export function readRealGpu(): string {
  if (gpuCache !== null) return gpuCache;
  try {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      gpuCache = '';
      return gpuCache;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) {
      gpuCache = '';
      return gpuCache;
    }
    const vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? '');
    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
    gpuCache = `${vendor} ${renderer}`.trim();
    return gpuCache;
  } catch {
    gpuCache = '';
    return gpuCache;
  }
}
