/**
 * `<webview>` 的 JSX 类型增强（React 19：增的是 `React.JSX.IntrinsicElements`）
 *
 * ⚠️ **为什么必须手写**：`<webview>` 是 Electron 提供的**自定义元素**（`webviewTag: true`
 *    见 `electron/main.js:874`），React 与 DOM 类型里都没有它。
 * ⚠️ 这里只声明**我们真正用到的属性**（与 `adapters/site/shared/webview.ts` 的
 *    `WebviewElement` 最小接口同一策略：不把 Electron 类型包拉进工程）。
 */

import type * as React from 'react';

/** 我们用到的那几个属性（原 `_Component25.jsx:355` 的 `<webview>` 标签） */
interface WebviewAttrs extends React.HTMLAttributes<HTMLElement> {
  /** ⚠️ 必须在 `src` **之前**生效（否则会先在被拒的 session 里起一次导航） */
  partition?: string;
  src?: string;
  /** 账号定位键（原版 `Xn`/`_Component43:413` 就是按它查） */
  'data-account-id'?: string;
  useragent?: string;
  /** 指纹 preload 脚本的 `file://` 地址（由宿主 `ensure-fingerprint` 产出） */
  preload?: string;
  webpreferences?: string;
  /**
   * ⚠️ **不要在这里声明 `allowpopups`** —— `@types/react` 的 `HTMLAttributes`
   *    已经声明了它（`allowpopups?: boolean`，React 为 Electron 场景内置的）。
   *    重复声明成 `string` 会与它冲突（`TS2322`）。
   *    源版写的是字符串 `"true"`（`_Component25.jsx:355`），Electron 只认「属性存在」
   *    ⇒ 用布尔 `allowpopups`（React 渲染成 `allowpopups=""`）**行为等价**。
   */
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: WebviewAttrs;
    }
  }
}
