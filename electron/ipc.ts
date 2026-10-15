// ============================================================
// IPC 注册唯一入口（本仓**唯一**持有 `ipcMain` 的模块）
// ------------------------------------------------------------
// 两类通道各一个入口：
//   · `handle` —— `invoke` 型。守卫（「抛」→ 可传输的 `{ ok:false, error }`，原文透传 · 原则 6）
//     **只在注册处施加一次**；handler 本体不再各自 `try/catch` 做同一件事。
//   · `on` —— `send` / `sendSync` 型（单向 / 同步回值）。**不包守卫**：`sendSync` 靠
//     `e.returnValue` 回值、`send` 根本不回值 ⇒ 异常语义与 `invoke` 不同，就地留痕即可。
//
// 为什么必须在边界收：IPC 是进程边界 —— 异常不转成判别联合，渲染层只能拿到
// rejected 的 `invoke`、拿不到"为什么"（原则 6：错误要能被展示）。
//
// 本条**只管**「异常 → 回执」这一件事。下列就地留在 handler 内，不是重复：
//   · catch 里另做**留痕 / 回滚 / 清理**（守卫不做这些，见各 handler）；
//   · 回执形状与守卫**不同**（如 `detect-errors` 的 `errors:[]`、`api-config:test` 的 `message`）。
//
// ⚠️ **宿主壳（`main.ts`）不再持有 `ipcMain`** ⇒ 它想裸注册一个 handler，得自己
//   `require('electron')`（显式动作，不再是"顺手写一行"）。
// ============================================================

import { ipcMain } from 'electron';

/** `invoke` 型注册口：把「抛」转成可传输的回执（原文透传，不吞、不改写） */
function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/** `send` / `sendSync` 型通道的注册入口（透传，不包守卫 —— 见文件头） */
function on(channel: string, fn: (...args: unknown[]) => void): void {
  ipcMain.on(channel, fn);
}

export { handle, on };
