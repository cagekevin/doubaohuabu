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

/** 我们用到的最小 webview 能力集（Electron `<webview>` 的子集） */
export interface WebviewElement extends HTMLElement {
  /** 在 guest 页面里执行脚本（返回 Promise） */
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
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
