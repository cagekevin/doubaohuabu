/**
 * 站点页等待原语（★ **只在 `adapters/site/**` 内使用**）
 *
 * 依据（**逐行回源抄录**）：
 *   - `ID` shared.js:38870 —— 「页面有内容」探针
 *   - `fS` shared.js:38871-38881 —— 等页面就绪（**20 次 × 500ms**）
 *   - `pS` shared.js:38882-38892 —— 等 `input[type=file]` 出现（默认 **12s**，步长 500ms）
 *   - `uS` shared.js:38825-38862 —— 导航 + 等 `did-stop-loading`（默认 **20s**）
 *   - `On` —— 执行探针（**失败不抛**，返回 `{_execError, error}`）
 *   - `fr` —— 睡眠
 *
 * ⚠️ **与原版的一处结构性差异（有意）**：原 `fS` 用 `try{…}catch{}`（**空 catch**）把探针异常吞掉，
 *    `On` 则返回 `{_execError, error}` 形状。本实现统一成 **`ProbeResult`**（判别联合）——
 *    既满足项目「原则 6：不吞错」（错误对象拿得到），又让「探针失败」与「探针返回 false」可区分。
 *
 * ⚠️ 这里**只等**，不做决策（决策归 `core/usecases`，判据 D1）。
 */

import type { WebviewElement } from './webview';

/** 轮询步长（原 `fr(500)`） */
export const POLL_MS = 500;
/** 等页面就绪的默认次数（原 `fS` 的 20 次） */
export const READY_ATTEMPTS = 20;
/** 等文件输入框的默认超时（原 `pS` 的 12000） */
export const FILE_INPUT_TIMEOUT_MS = 12000;
/** 导航等待的默认超时（原 `uS` 的 20000） */
export const NAV_TIMEOUT_MS = 20000;

/** 「页面有内容」探针（原 `ID`） */
export const PAGE_READY_PROBE = '!!(document && document.body && document.body.innerHTML)';
/** 「存在文件输入框」探针（原 `pS` 内联脚本） */
export const FILE_INPUT_PROBE = '!!document.querySelector("input[type=file]")';

/** 探针结果（原 `On` 的两种形态，改成判别联合） */
export type ProbeResult<T> = { ok: true; value: T } | { ok: false; error: string };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 超时竞速（原 `OP.jsx:59-64` 的 `Promise.race([executeJavaScript, setTimeout])`）
 *
 * ⚠️ 错误文案 `webview_exec_timeout` **逐字对源**（源版也是这个字面量）
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error('webview_exec_timeout')), ms);
    }),
  ]);
}

/**
 * 在 webview 里跑一个探针（原 `On`）
 * ⚠️ **不抛**：webview 不可用 / 脚本抛错 / 超时 ⇒ `{ok:false, error}`（错误原文保留）
 * @param timeoutMs 不给 ⇒ **不设超时**（等页面自己答）；给了 ⇒ 竞速（见 `withTimeout`）
 */
export async function runProbe<T = unknown>(
  view: WebviewElement | null | undefined,
  script: string,
  timeoutMs?: number,
): Promise<ProbeResult<T>> {
  if (!view || typeof view.executeJavaScript !== 'function') {
    return { ok: false, error: 'webview 不可用' };
  }
  try {
    const pending = view.executeJavaScript(script, true) as Promise<T>;
    return { ok: true, value: timeoutMs === undefined ? await pending : await withTimeout(pending, timeoutMs) };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 等页面就绪（原 `fS` 38871）—— 最多 `attempts × 500ms`
 *
 * ⚠️ 与源一致：**探针抛错 = 还没就绪**（如 `document.body` 尚未建立）⇒ 继续轮询，
 *    最终以**返回值**上报（不把中间异常当致命错误）。
 */
export async function waitForPageReady(
  view: WebviewElement | null | undefined,
  attempts: number = READY_ATTEMPTS,
): Promise<boolean> {
  if (!view || typeof view.executeJavaScript !== 'function') return false;
  for (let i = 0; i < attempts; i += 1) {
    const r = await runProbe<boolean>(view, PAGE_READY_PROBE);
    if (r.ok && r.value === true) return true;
    await sleep(POLL_MS);
  }
  return false;
}

/**
 * 等 `input[type=file]` 出现（原 `pS` 38882）—— 默认 12s
 *
 * 用途：站点页的「上传参考图」入口是隐藏的 file input，**必须先等它挂上**再走 CDP 直喂。
 */
export async function waitForFileInput(
  view: WebviewElement | null | undefined,
  timeoutMs: number = FILE_INPUT_TIMEOUT_MS,
): Promise<boolean> {
  if (!view || typeof view.executeJavaScript !== 'function') return false;
  const attempts = Math.ceil(timeoutMs / POLL_MS);
  for (let i = 0; i < attempts; i += 1) {
    const r = await runProbe<boolean>(view, FILE_INPUT_PROBE);
    if (r.ok && r.value === true) return true;
    await sleep(POLL_MS);
  }
  return false;
}

/**
 * 导航并等待加载结束（原 `uS` 38825）
 *
 * ⚠️ 与源一致的三处细节：
 *   ① 无 `loadURL`（视图未挂载）⇒ **立刻 false**，不进 Promise
 *   ② 用 `did-stop-loading` 判定完成；超时 ⇒ false
 *   ③ 事件监听**必须摘**（否则重复导航会累积 handler）
 *
 * ⚠️ 返回 `boolean` 是**源契约**（"到没到"）；`loadURL` 同步抛错时额外打一条告警，
 *    保证失败**可见**（原则 6），不静默变成 `false`。
 */
export async function navigateAndWait(
  view: WebviewElement | null | undefined,
  url: string,
  timeoutMs: number = NAV_TIMEOUT_MS,
): Promise<boolean> {
  if (!view || typeof view.loadURL !== 'function') return false;
  // ⚠️ 取非空别名：可选成员（`loadURL?`）的类型收窄**在闭包内会失效**，
  //    用别名 + 可选调用，避免靠 `!` 断言（TD-08-1 的反模式）
  const el: WebviewElement = view;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // ⚠️ 用函数声明（提升），避免 `finish`/`onStop` 互相引用的 TDZ 问题
    function finish(ok: boolean): void {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      el.removeEventListener('did-stop-loading', onStop);
      resolve(ok);
    }
    function onStop(): void {
      finish(true);
    }

    timer = setTimeout(() => finish(false), timeoutMs);

    try {
      el.addEventListener('did-stop-loading', onStop);
      el.loadURL?.(url);
    } catch (e: unknown) {
      // ⚠️ `loadURL` 同步抛（URL 非法 / 视图已销毁）⇒ 失败**可见**，再结束为 false
      console.warn('[webview] loadURL 失败:', e);
      finish(false);
    }
  });
}
