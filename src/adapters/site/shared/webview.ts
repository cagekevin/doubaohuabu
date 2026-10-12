/**
 * `<webview>` 元素定位与脚本执行（站点适配器的公共底座）
 *
 * 背景：豆包 / Dola / Lovart 的后台页是渲染进程里的 **`<webview>` 标签**，
 * 因此可以直接 `webview.executeJavaScript(...)`（**不需要**宿主暴露额外方法）。
 *
 * ⚠️ 本模块**只在 `adapters/site/**` 内使用** —— 外部（`ui`/`state`/`core`）**不得**接触 webview
 * ⚠️ 零注入（docs/过程.md #2）：**只读**页面，不得改 `navigator`/`screen`/`webgl`
 *
 * ⚠️ 这里用**本地最小接口**描述 webview（不引 `electron` 类型包）——
 *    只声明我们真正用到的成员，避免把 Electron 类型污染进整个工程。
 */

import type { ImageQuestionContext } from '@/core/ports/site.port';
// ★ 容器 DOM 钩子类名必须走 SSOT（写字面量对不上 BackendView 的 CSS-module 类 ⇒ 定位恒失效）
import { WEBVIEWS_HOST_CLASS } from '@/stable/contracts/schemas';

/**
 * `<webview>.capturePage()` 的返回（Electron `NativeImage` 的**最小面** —— 我们只用这三个）
 *
 * ⚠️ 只声明用到的成员，避免把 Electron 类型污染进整个工程（同 `WebviewElement` 的做法）。
 */
export interface CapturedImage {
  isEmpty?(): boolean;
  resize?(opts: { width?: number; height?: number }): CapturedImage;
  toDataURL(): string;
}

/** 我们用到的最小 webview 能力集（Electron `<webview>` 的子集） */
export interface WebviewElement extends HTMLElement {
  /** 在 guest 页面里执行脚本（返回 Promise） */
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  /** 截当前 guest 页面（原 `je` 用的 `Q.capturePage()`，`_Component43.jsx:470`）—— 非 Electron 环境没有 */
  capturePage?(): Promise<CapturedImage>;
  /** 导航到 URL（原 `uS` 用它；同步抛错 ⇒ 调用方须兜） */
  loadURL?(url: string): void;
  /** 只读：guest 当前 URL */
  getURL?(): string;
  /** 只读：guest 的 webContents id（部分 API 需要） */
  getWebContentsId?(): number;
}

/** webview 元素的定位键：用 session partition（每个账号一个） */
const PARTITION_ATTR = 'partition';

/**
 * 从 `ImageQuestionContext` 取该账号的后台 `<webview>`（找不到 ⇒ `null`）
 *
 * ⚠️ 这是 `SitePort` 各「页内脚本」方法**公共的第一句**（`askWithImage` / `pingQueueProgress` /
 *   `fetchWatermarkFree` / 4 个监测探测…）⇒ 判据 C1：收口到一处，别每个实现各写一份。
 */
export const viewOfContext = (ctx: ImageQuestionContext): WebviewElement | null =>
  findWebview({ id: ctx.account.id, partition: ctx.account.partition });

/** 取某个 partition 对应的 `<webview>`；找不到则抛（**原文明确**，不静默返回 null） */
export function requireWebview(partition: string | null | undefined): WebviewElement {
  if (!partition) throw new Error('账号缺少 partition，无法定位 webview');
  const el = document.querySelector<WebviewElement>(`webview[${PARTITION_ATTR}="${partition}"]`);
  if (!el) throw new Error(`未找到 partition=${partition} 的 webview（后台视图可能未挂载）`);
  return el;
}

/**
 * 账号的定位信息（`Xn` 的定位键）
 * ⚠️ 允许 `null`：原版 `Xn` 用 `… && e.partition || ''` 兜底，且 `Account.partition`
 *    在模型里就是 `string | null`（未登录时为空）⇒ 接口按真实形状声明，调用方免做转换。
 */
export interface WebviewAccountRef {
  id?: string | null;
  partition?: string | null;
}

/**
 * 按账号定位 `<webview>`（原 `Xn` 23553）—— **精确匹配**，找不到返回 `null`
 *
 * ★ **为什么抽到 `shared/`**：原版 `Xn(` 被调用 **32 次**（已实测计数）
 *   ⇒ 按**判据 C1 三振出局**必须共享，且它是**站点无关**的 DOM 定位。
 *
 * 匹配顺序（**顺序即语义**）：
 *   ① `partition` 精确匹配
 *   ② `data-account-id` 精确匹配
 *
 * ⚠️ **不按站点类型回落**：那会把「该账号没挂载」翻译成「同类型的别的账号也行」——
 *    脚本会跑到**别人的页面**上（发错账号 / 读错数据）。「没挂载」必须如实暴露成 `null`。
 *
 * ⚠️ 与 `requireWebview` 的区别：本函数**返回 `null` 而不抛** ——
 *    它的调用方（`Ok`/`fP`/`pP`）本就要把"没找到"转成 `{ok:false, error:'not_open'}`。
 */
export function findWebview(
  account: WebviewAccountRef | string | null | undefined,
): WebviewElement | null {
  const id = typeof account === 'string' ? account : (account?.id ?? '');
  const partition = (typeof account === 'object' && account?.partition) || '';

  let views: WebviewElement[] = [];
  try {
    // ★ 2026-10-11 修正（假定位 + 静默兜底）：
    //   ① 类名改走 **SSOT**（`stable/contracts/schemas.ts` 的 `WEBVIEWS_HOST_CLASS`）—— 此前这里
    //      是**字面量**，而 `BackendView` 挂的是 **CSS-module 哈希类** ⇒ `querySelector` **恒 null**。
    //   ② **去掉 `|| document`** —— 那是**静默兜底**：容器找不到时会把搜索范围悄悄扩到**整个文档**，
    //      于是"定位失效"被掩盖成"能用"。容器找不到 ⇒ 就是**没有 webview**
    //      （如实返回 0 个，由 `findWebview` 返回 `null` 上报调用方）。
    const host = document.querySelector(`.${WEBVIEWS_HOST_CLASS}`);
    views = host ? Array.from(host.querySelectorAll<WebviewElement>('webview')) : [];
  } catch (e: unknown) {
    // ⚠️ 与源一致：查询本身失败按「没有视图」处理（最终返回 null 已把失败上报给调用方）
    void e;
    views = [];
  }

  if (partition) {
    const hit = views.find((v) => v.getAttribute?.('partition') === partition);
    if (hit) return hit;
  }

  if (id) {
    const hit = views.find((v) => v.getAttribute?.('data-account-id') === id);
    if (hit) return hit;
  }

  return null;
}

/**
 * 在 webview 里执行脚本并取回结果
 *
 * ⚠️ 脚本必须是**纯读取**（零注入）
 * ⚠️ 失败**原样抛出**（由调用方转成 `Result` —— 原则 6）
 */
export async function webviewEval<T = unknown>(view: WebviewElement, script: string): Promise<T> {
  return (await view.executeJavaScript(script, true)) as T;
}

/** 给 webview 挂一次性事件（**返回取消函数** —— 与 `on*` 契约一致） */
export function onWebviewOnce(view: WebviewElement, event: string, cb: () => void): () => void {
  const handler = (): void => {
    view.removeEventListener(event, handler);
    cb();
  };
  view.addEventListener(event, handler);
  return () => view.removeEventListener(event, handler);
}
