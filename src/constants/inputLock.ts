/**
 * 注入锁（`input-lock`）的**页内契约**（★ SSOT）
 *
 * 依据（**逐行回源抄录**）`shared.js` 35934-35944：
 *   - `mR` 35934 —— 监听的事件类型（15 种）
 *   - `gR` 35935 —— 页内**状态对象**名
 *   - `Yk` 35936 —— 页内**开关函数**名
 *   - `f0` 35937 —— 页内「已安装」标记名（**幂等**依据）
 *   - `yR` 35938 —— 提示条样式
 *   - `zu` 35939-35940 —— 安装脚本（IIFE）
 *   - `ji` 35941-35944 —— 切换脚本
 *
 * ⚠️ **为什么这些常量在 `constants/` 而不是 `adapters/site/`**：
 *   ① 提示条样式含**字面量色值**（`rgba(17,24,39,.92)` / `#fff`），而 `原则5/ssot-color`
 *      只允许字面量色值出现在 `styles/tokens.css` **或 `constants/`**。
 *      这是与 `FACE_MASK_PATTERN_COLOR` **同类的例外**：样式要注入到**别人的页面**，
 *      既走不了 `var(--...)`（对方页面没有我们的变量），也不该混进我们的 `tokens.css`。
 *   ② 提示文案是**面向用户**的（原则 5：文案只在 SSOT 层）。
 */

/** 页内状态对象名（原 `gR`） */
export const INPUT_LOCK_STATE_GLOBAL = '__DBCV_INPUT_LOCK__';
/** 页内开关函数名（原 `Yk`） */
export const INPUT_LOCK_SET_GLOBAL = '__DBCV_SET_INPUT_LOCK__';
/** 页内「已安装」标记名（原 `f0`）—— 幂等：已装则安装脚本直接返回 */
export const INPUT_LOCK_READY_GLOBAL = '__DBCV_INPUT_LOCK_READY__';
/** 根元素上的锁状态属性（原 `zu` 里的 `data-dbcv-input-lock`，供 CSS 选择器用） */
export const INPUT_LOCK_ATTR = 'data-dbcv-input-lock';
/** 提示条元素 id（原 `zu` 里的 `dbcv-input-lock-hint`） */
export const INPUT_LOCK_HINT_ID = 'dbcv-input-lock-hint';

/**
 * 监听的事件类型（原 `mR`，**15 种，顺序即源**）
 * ⚠️ 只监听、不拦截语义 —— 是否拦截由 `guard` 里的三态开关决定
 */
export const INPUT_LOCK_EVENT_TYPES = [
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
  'mousemove',
  'pointerdown',
  'pointerup',
  'pointermove',
  'touchstart',
  'touchmove',
  'wheel',
  'keydown',
  'keyup',
  'keypress',
] as const;

/** 提示条文案（原 `zu` 里的 `hint.textContent`）—— ★ 面向用户 */
export const INPUT_LOCK_HINT_TEXT = '豆包画布正在自动发送，已暂时锁定输入';

/** 提示条样式（原 `yR` 35938）—— ⚠️ 字面量色值的**合法例外**（见文件头 ①） */
export const INPUT_LOCK_CSS = [
  `#${INPUT_LOCK_HINT_ID}{position:fixed;left:50%;top:10px;transform:translateX(-50%);`,
  'z-index:2147483647;display:none;align-items:center;gap:6px;max-width:80vw;',
  'padding:6px 14px;border-radius:999px;background:rgba(17,24,39,.92);color:#fff;',
  'font:500 12px/1.3 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
  'box-shadow:0 4px 16px rgba(0,0,0,.24);pointer-events:none;user-select:none;}',
  `html[${INPUT_LOCK_ATTR}="1"] #${INPUT_LOCK_HINT_ID}{display:flex;}`,
].join('');
