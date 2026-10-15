// ============================================================
// `ws` 的最小本地声明
// ------------------------------------------------------------
// 为什么需要它：`ws` 是**后端本地依赖**（声明在 `electron/package.json`），
// 而仓里**没有 `@types/ws`** ⇒ 直接 `import WebSocket from 'ws'` 会 TS7016（找不到声明文件）。
//
// ⛔ 只声明**本仓实际用到的那几项**（`chrome-cdp` 的极简 CDP 客户端）——
//   不照抄 ws 的完整 API 面（那会变成一份会漂的"第二真源"）。
//    用到：构造 / `on('open'|'error'|'message')` / `removeListener('message')` / `send` / `close`
//
// ⚠️ 若将来装了 `@types/ws`，**删掉本文件**（否则模块声明重复）。
// ============================================================

declare module 'ws' {
  /** 消息体：本仓只用 `toString()`（Node 下 ws 给的是 Buffer） */
  export type WsData = { toString(): string };

  export type WsClient = {
    // `open` 用 rest 形参：源把 `resolve`（带 1 个形参）直接交给它，而 `() => void` 收不下带参回调
    on(event: 'open', cb: (...args: unknown[]) => void): void;
    on(event: 'error', cb: (err: Error) => void): void;
    on(event: 'message', cb: (data: WsData) => void): void;
    removeListener(event: 'message', cb: (data: WsData) => void): void;
    send(data: string): void;
    close(): void;
  };

  const WebSocket: { new (url: string): WsClient };
  export default WebSocket;
}
