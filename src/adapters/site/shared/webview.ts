/**
 * `<webview>` 元素定位与脚本执行（站点适配器的公共底座）
 *
 * 背景：豆包 / Dola / Lovart 的后台页是渲染进程里的 **`<webview>` 标签**，
 * 因此可以直接 `webview.executeJavaScript(...)`（**不需要**宿主暴露额外方法）。
 *
 * ⚠️ 本模块**只在 `adapters/site/**` 内使用** —— 外部（`ui`/`state`/`core`）**不得**接触 webview
 * ⚠️ 零注入（docs/10 #2）：**只读**页面，不得改 `navigator`/`screen`/`webgl`
 *
 * ⚠️ 这里用**本地最小接口**描述 webview（不引 `electron` 类型包）——
 *    只声明我们真正用到的成员，避免把 Electron 类型污染进整个工程。
 */

import type { SiteType } from '@/stable/model/account';
// ★ 容器 DOM 钩子类名必须走 SSOT（写字面量对不上 BackendView 的 CSS-module 类 ⇒ 定位恒失效）
import { WEBVIEWS_HOST_CLASS } from '@/stable/contracts/schemas';

/** 我们用到的最小 webview 能力集（Electron `<webview>` 的子集） */
export interface WebviewElement extends HTMLElement {
  /** 在 guest 页面里执行脚本（返回 Promise） */
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  /** 导航到 URL（原 `uS` 用它；同步抛错 ⇒ 调用方须兜） */
  loadURL?(url: string): void;
  /** 只读：guest 当前 URL */
  getURL?(): string;
  /** 只读：guest 的 webContents id（部分 API 需要） */
  getWebContentsId?(): number;
}

/** webview 元素的定位键：用 session partition（每个账号一个） */
const PARTITION_ATTR = 'partition';

/** 取某个 partition 对应的 `<webview>`；找不到则抛（**原文明确**，不静默返回 null） */
export function requireWebview(partition: string | null | undefined): WebviewElement {
  if (!partition) throw new Error('账号缺少 partition，无法定位 webview');
  const el = document.querySelector<WebviewElement>(`webview[${PARTITION_ATTR}="${partition}"]`);
  if (!el) throw new Error(`未找到 partition=${partition} 的 webview（后台视图可能未挂载）`);
  return el;
}

/**
 * 站点类型 → 页面地址 / partition 的识别正则（原 `ZM` 23546）
 *
 * ⚠️ 与源一致：`other` 类型**没有**正则（故用 `Partial`），未知类型自然落空。
 * ⚠️ 这些正则**不带 `/g`** ⇒ 可安全复用（无 `lastIndex` 污染问题）。
 */
const SITE_URL_RE: Readonly<Partial<Record<SiteType, RegExp>>> = {
  lovart: /lovart/i,
  tapnow: /tapnow/i,
  dola: /dola/i,
  doubao: /doubao/i,
  gpt: /chatgpt|openai/i,
};

/** 按**任意字符串**查表（用 `Map` 而非下标 + `as` ⇒ 零断言，未知类型自然得 `undefined`） */
const SITE_URL_RE_MAP: ReadonlyMap<string, RegExp> = new Map(Object.entries(SITE_URL_RE));

/**
 * 账号的定位信息（`Xn` 只用到这三个字段）
 * ⚠️ 允许 `null`：原版 `Xn` 用 `… && e.partition || ''` 兜底，且 `Account.partition`
 *    在模型里就是 `string | null`（未登录时为空）⇒ 接口按真实形状声明，调用方免做转换。
 */
export interface WebviewAccountRef {
  id?: string | null;
  partition?: string | null;
  type?: string | null;
}

/**
 * 按账号定位 `<webview>`（原 `Xn` 23553）—— **三级回落**，找不到返回 `null`
 *
 * ★ **为什么抽到 `shared/`**：原版 `Xn(` 被调用 **32 次**（已实测计数）
 *   ⇒ 按**判据 C1 三振出局**必须共享，且它是**站点无关**的 DOM 定位。
 *
 * 回落顺序（**顺序即语义**）：
 *   ① `partition` 精确匹配
 *   ② `data-account-id` 精确匹配
 *   ③ **类型正则**匹配 `src` 或 `partition`（"该账号页面还没挂上，但同类型页面在"）
 *
 * ⚠️ 与 `requireWebview` 的区别：本函数**返回 `null` 而不抛** ——
 *    它的调用方（`Ok`/`fP`/`pP`）本就要把"没找到"转成 `{ok:false, error:'not_open'}`。
 */
export function findWebview(
  account: WebviewAccountRef | string | null | undefined,
): WebviewElement | null {
  const id = typeof account === 'string' ? account : (account?.id ?? '');
  const partition = (typeof account === 'object' && account?.partition) || '';
  const type = (typeof account === 'object' && account?.type) || '';

  let views: WebviewElement[] = [];
  try {
    // ★ 2026-10-11 修正（假定位 + 静默兜底）：
    //   ① 类名改走 **SSOT**（`stable/contracts/schemas.ts` 的 `WEBVIEWS_HOST_CLASS`）—— 此前这里
    //      是**字面量**，而 `BackendView` 挂的是 **CSS-module 哈希类** ⇒ `querySelector` **恒 null**。
    //   ② **去掉 `|| document`** —— 那是**静默兜底**：容器找不到时会把搜索范围悄悄扩到**整个文档**，
    //      于是"定位失效"被掩盖成"能用"。容器由 `BackendView` **常驻渲染**（见该文件头），
    //      找不到 ⇒ 就是**没有 webview**（如实返回 0 个，由 `findWebview` 返回 `null` 上报调用方）。
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

  const re = type ? SITE_URL_RE_MAP.get(type) : undefined;
  if (!re) return null;
  return (
    views.find((v) => {
      const src = v.getAttribute?.('src') || '';
      const part = v.getAttribute?.('partition') || '';
      return re.test(src) || re.test(part);
    }) ?? null
  );
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
