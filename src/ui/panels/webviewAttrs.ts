/**
 * `<webview>` 的属性**值**契约 —— 唯一落点
 *
 * ⚠️ **属性类型不在这里声明**：`@types/react` 已把 `webview` 声明成
 *    `DetailedHTMLProps<WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>`
 *    （`webviewTag: true` 见 `electron/main.js`），我们用到的属性全在其中
 *    （`partition` / `src` / `preload` / `useragent` / `webpreferences`）。
 *    本仓**覆盖不掉**它：同名的重复声明只会报 `TS2717`，被 `skipLibCheck` 掩盖后生效的仍是它
 *    ⇒ 本仓只需要给**唯一**那个"值与类型打架"的属性提供一处真源。
 *
 * ⚠️ `allowpopups` 就是那个：类型层是 `boolean`，运行时必须**字符串** ——
 *    React 不认它是布尔属性（裸布尔 `true` 会告警 "Received `true` for a non-boolean attribute"），
 *    而 Electron 只认「属性存在」⇒ 传 `"true"` 等价。源版写的就是字符串 `"true"`
 *    （`_Component25.jsx:355` / `$P.jsx:285`）。
 *    **断言只此一处**（第三方类型 ↔ 运行时事实的边界，不是本仓的类型双轨）。
 */
export const WEBVIEW_ALLOW_POPUPS = 'true' as unknown as boolean;
