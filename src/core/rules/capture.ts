/**
 * 画布节点截图（**纯函数**，★ 必测）—— 原 `MT`(32322) / `$T`(32328) 的**可测半**
 *
 * ★★ **它是什么**：把某个节点的 DOM 元素**截成图**（视频节点上的「预览截图」就用它）。
 *   源版 `$T(nodeId)` 分三步：**① 从注册表拿到元素**（`Lu.get(nodeId)`）→
 *   **② 把 DOM 矩形换算成设备像素矩形**（`× devicePixelRatio`）→
 *   **③ 交给宿主 `window.api.captureRect(rect)`**。
 *   其中 **② 与"该不该截"的判据**是纯的 ⇒ 本模块就落这一半（③ 走 `MediaPort.captureRect`，
 *   那个端口**早已落地**；① 是"节点把元素登记进一张 Map"，属 `ui` 层的事）。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `formatClipTime` | `MT` 32322 | 秒 ⇒ **`MM-SS`**（补零；`< 0`/非数 ⇒ 归 0；**没有小时位**） |
 *   | `toCaptureRect` | `$T` 32333-32343 | `getBoundingClientRect()` ⇒ `× dpr` 的设备像素矩形 |
 *   | 守卫 | `$T` 32334 | **宽或高 < 2px ⇒ `null`**（元素没渲染/被折叠时不截） |
 *
 * ⚠️ **三处照抄的细节**：**(a)** 矩形**不取整**（源版直接用浮点 —— 取整会切掉边缘像素）；
 *   **(b)** `dpr` 缺省/为 0 时**回落 1**（`window.devicePixelRatio || 1`）；
 *   **(c)** 守卫判的是 DOM 矩形的**宽高**（不是换算后的设备像素）。
 */

/** 设备像素矩形（原 `$T` 32338-32343 的四字段 —— 与 `MediaPort.captureRect` 的入参同形） */
import { clamp } from '@/lib/math';
import { pad2 } from '@/lib/time';

export interface CaptureRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `getBoundingClientRect()` 的最小形状（只读这四项） */
export interface DomRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 元素小于这个尺寸就认为"没渲染"（原 `$T` 32334 的 `2`） */
const MIN_CAPTURABLE_PX = 2;

/**
 * 秒 ⇒ `MM-SS`（原 `MT` 32322-32327）
 *
 * ⚠️ 与源逐字一致：先 `max(0, floor(t || 0))` ⇒ **负数与非数都归 0**；
 *   然后 `floor(t/60)` 与 `t % 60` 各补零到 **2 位**。
 * ⚠️ **没有小时位**：5400 秒（90 分）会得到 **`90-00`** 而不是 `01-30-00`（源版如此，照抄）。
 */
export function formatClipTime(seconds: unknown): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${pad2(mm)}-${pad2(ss)}`;
}

/**
 * DOM 矩形 ⇒ 设备像素矩形（原 `$T` 32333-32343）
 *
 * @param rect `element.getBoundingClientRect()` 的结果（或 `null`）
 * @param dpr `window.devicePixelRatio`（**由调用方传** —— `core` 不读宿主）
 * @returns **元素太小 / 没有元素 ⇒ `null`**（调用方据此放弃截图，不抛）
 *
 * ⚠️ 与源一致：**不取整**（浮点直接乘）—— 取整会把边缘像素切掉，而截图 API 自己会处理。
 */
export function toCaptureRect(rect: DomRectLike | null | undefined, dpr: unknown): CaptureRectLike | null {
  if (!rect) return null;
  if (!(rect.width >= MIN_CAPTURABLE_PX) || !(rect.height >= MIN_CAPTURABLE_PX)) return null;

  const ratio = Number(dpr) || 1;
  return {
    x: rect.left * ratio,
    y: rect.top * ratio,
    width: rect.width * ratio,
    height: rect.height * ratio,
  };
}

// ─────────────────── 截图落点（原 `addScreenshotMaterial` 28328-28336）───────────────────

/** 视频节点没有宽度时的兜底（原 28328 的 `|| 320`） */
const FALLBACK_VIDEO_W = 320;
/** 放在视频**右侧**的横向间距（原 28334 的 `+ 40`） */
const GAP_RIGHT = 40;
/** 每张截图**向下**错开的量（原 28335 的 `* 26`） */
const STACK_STEP = 26;
/** 纵向最多叠几层（原 28335 的 `Math.min(u, 8)` —— 第 9 张起**与第 8 张重合**） */
export const SCREENSHOT_STACK_MAX = 8;

/** 截图落点所需的锚点形状（只要这三项） */
export interface ScreenshotAnchorLike {
  position: { x: number; y: number };
  width?: number;
}

/**
 * 截图节点落在哪（原 `addScreenshotMaterial` 28328-28336）
 *
 * 规则（**逐字对齐**）：
 *   ① `x = 视频.x + (视频.width || **320**) + **40**` ⇒ 放在视频**右侧**一列
 *   ② `y = 视频.y + min(已截张数, **8**) * **26**` ⇒ 每张下移 26px，**最多叠 8 层**
 *      （第 9 张起 y 与第 8 张相同 ⇒ **重合**，源版如此）
 *
 * ⚠️ 与源一致：`已截张数` 是**该视频已产出的截图数**（`data.sourceVideoId` 匹配的素材节点数），
 *   不是"当前有几张在画布上" —— 删掉一张再截，落点**不会**回收（照抄）。
 * ⚠️ 源版在这里**读了一次 `l.height` 却没用**（28329）⇒ 不照抄那个无用读取。
 */
export function screenshotNodePlacement(
  anchor: ScreenshotAnchorLike,
  existingCount: number,
): { x: number; y: number } {
  const colW = anchor.width || FALLBACK_VIDEO_W;
  const n = clamp(Math.floor(existingCount) || 0, 0, SCREENSHOT_STACK_MAX);
  return {
    x: (anchor.position.x || 0) + colW + GAP_RIGHT,
    y: (anchor.position.y || 0) + n * STACK_STEP,
  };
}
