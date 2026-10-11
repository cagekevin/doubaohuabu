/**
 * 异步工具（无状态 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：`gn` shared.js:23587-23616 —— 带超时的 Promise 包装
 *
 * ★ **为什么抽到 `lib/`**：原版 `gn(` 被调用 **35 次**（已实测计数）⇒ 按**判据 C1 三振出局**
 *    必须抽共享，且它**不含 DOM/站点知识** ⇒ 按 A1「无状态工具 → `lib`」。
 *
 * ⚠️ `setTimeout` 在 `lib` 是允许的（原则 4 的禁令只覆盖 `core/**`）。
 *
 * ⚠️ 与原版的一处**形状改进**：原版返回 `{__timeout:true}` / `{__error:true}`
 *    —— 即"往业务结果里塞标记"，调用方得写 `s.__timeout` / `s.__error` 才能判。
 *    本实现改成**判别联合** `TimeoutResult<T>` ⇒ 类型系统**强制**调用方处理三种情况
 *    （少判一种编译就不过），且业务结果不必与标记混在同一个对象里。
 */

/** 带超时的结果（判别联合 —— 取代原版的 `__timeout`/`__error` 哨兵） */
export type TimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'timeout'; error: string }
  | { ok: false; kind: 'error'; error: string };

/**
 * 给一个 Promise 加超时（原 `gn` 23587）
 *
 * 与源一致的三点：
 *   ① **先到先得**：结果与超时只认先来的（内部 `settled` 闸）
 *   ② **不抛**：超时 / 异常都转成返回值 ⇒ 调用方不必写 `try`
 *   ③ 超时文案含**秒数**：`` `${label}超时（${Math.round(ms / 1000)}s）` ``
 *
 * @param input 待包装的 Promise（或直接给值）
 * @param ms 超时毫秒
 * @param label 超时文案前缀（原版如 `'接口调用'` / `'页面扫描'`）
 */
export function withTimeout<T>(
  input: Promise<T> | T,
  ms: number,
  label: string,
): Promise<TimeoutResult<T>> {
  return new Promise<TimeoutResult<T>>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, kind: 'timeout', error: `${label}超时（${Math.round(ms / 1000)}s）` });
    }, ms);

    Promise.resolve(input).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (e: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, kind: 'error', error: e instanceof Error ? e.message : String(e) });
      },
    );
  });
}

/**
 * 等待 `ms` 毫秒（原 `fr`）—— 收口 `adapters/site/**` 6 处各自定义的 `const sleep`
 *（`gpt/index` · `doubao/analyze` · `doubao/index` · `shared/{waits,attachImage,backendPage}`）。
 *
 * ⚠️ `setTimeout` 在 `lib` 允许（原则 4 的禁令只覆盖 `core/**`）。
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
