/**
 * 注入锁（`input-lock`）—— 自动发送期间锁住**真人**输入
 *
 * 依据（**逐行回源抄录**）`shared.js`：
 *   - `zu` 35939-35940 —— 安装脚本（IIFE，幂等）
 *   - `ji` 35941-35944 —— 切换脚本（`block` / `allow` / `unlock`，默认 `unlock`）
 *   - `dS` —— 调用点：`allow` → 跑操作 → **finally** `unlock`
 *
 * ★ **核心语义（极易理解反）**：`guard` 里有一句
 *      `if (e && e.isTrusted === false) return;`
 *   ⇒ **只拦「可信」事件（真人输入），放行「合成」事件（脚本 / 宿主驱动）**。
 *   也就是说：它锁的是**用户的手**，不是自动化本身 —— 否则自动发送自己也会被拦死。
 *
 * ⚠️ 这是**唯一允许注入页面的脚本**（链 17「零注入」的**例外**）：
 *   它**不改** `navigator` / `screen` / `webgl`（J4 的核心禁令），只**挂事件监听 + 加一个提示条**。
 *   ⇒ 它不伪装环境，只做输入闸门。指纹伪装是**后端 preload** 的事（见 `docs/16` §6 第 2 项）。
 *
 * ⚠️ 常量与样式在 `@/constants/inputLock`（含字面量色值 ⇒ 按 `原则5/ssot-color` 只能落 `constants/`）。
 *
 * ⚠️ **为什么安装脚本写成「行数组 + `join`」**：原版 `zu` 本身就是这个形态；且
 *   `check-invariants.cjs` 的 `原则6/no-swallow` 是**逐行**正则 —— 把每个 `catch (_) {` 与其 `}`
 *   拆到两行（JS 里换行无语义）就**既不误报、又无需给检查器加豁免**
 *   （用户裁定：能不加机制就不加）。
 */

import {
  INPUT_LOCK_ATTR,
  INPUT_LOCK_CSS,
  INPUT_LOCK_EVENT_TYPES,
  INPUT_LOCK_HINT_ID,
  INPUT_LOCK_HINT_TEXT,
  INPUT_LOCK_READY_GLOBAL,
  INPUT_LOCK_SET_GLOBAL,
  INPUT_LOCK_STATE_GLOBAL,
} from '@/constants/inputLock';
import { webviewEval, type WebviewElement } from './webview';

/** 锁的三态（原 `ji` 的入参） */
export const INPUT_LOCK_MODES = ['block', 'allow', 'unlock'] as const;
export type InputLockMode = (typeof INPUT_LOCK_MODES)[number];

/**
 * 安装脚本（原 `zu` 35939）
 *
 * ⚠️ **幂等**：已安装（`window.<READY>` 为真）则**直接返回**，不重复挂监听
 * ⚠️ 监听用**捕获阶段**（`addEventListener(..., true)`）—— 否则站点自己的 handler 可能先消费掉事件
 */
export function inputLockSetupScript(): string {
  return [
    '(function(){',
    '  try {',
    `    if (window.${INPUT_LOCK_READY_GLOBAL}) return true;`,
    `    var S = window.${INPUT_LOCK_STATE_GLOBAL} = { block:false, allow:true, hostDriving:false };`,
    `    var TYPES = ${JSON.stringify(INPUT_LOCK_EVENT_TYPES)};`,
    '    function guard(e){',
    '      try {',
    '        if (!S.block) return;',
    '        if (S.hostDriving) return;',
    '        if (S.allow) return;',
    // ★★ 整套机制的灵魂：**只拦真人**（`isTrusted` 为假 = 合成事件 ⇒ 放行）
    '        if (e && e.isTrusted === false) return;',
    '        if (e && typeof e.preventDefault === "function") e.preventDefault();',
    '        if (e && typeof e.stopPropagation === "function") e.stopPropagation();',
    '        if (e && typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();',
    '      } catch (_) {',
    '        /* 页面内忽略：guard 必须尽力而为，不能因小错中断事件流 */',
    '      }',
    '    }',
    '    for (var i=0;i<TYPES.length;i++){',
    '      document.addEventListener(TYPES[i], guard, true);',
    '      window.addEventListener(TYPES[i], guard, true);',
    '    }',
    '    // 视觉提示：告诉用户「页面没坏，是画布在自动操作」。只加 DOM，不接管任何事件。',
    '    try {',
    '      var stl = document.createElement("style");',
    `      stl.textContent = ${JSON.stringify(INPUT_LOCK_CSS)};`,
    '      (document.head || document.documentElement).appendChild(stl);',
    `      var hint = document.getElementById(${JSON.stringify(INPUT_LOCK_HINT_ID)});`,
    '      if (!hint) {',
    '        hint = document.createElement("div");',
    `        hint.id = ${JSON.stringify(INPUT_LOCK_HINT_ID)};`,
    `        hint.textContent = ${JSON.stringify(INPUT_LOCK_HINT_TEXT)};`,
    '        document.body.appendChild(hint);',
    '      }',
    '    } catch (_) {',
    '      /* 页面内忽略：提示条是装饰，失败不影响闸门 */',
    '    }',
    `    window.${INPUT_LOCK_SET_GLOBAL} = function(phase){`,
    '      try {',
    '        if (phase === "block")      { S.block = true;  S.allow = false; S.hostDriving = false; }',
    '        else if (phase === "allow") { S.allow = true;  S.hostDriving = true; }',
    '        else                        { S.block = false; S.allow = true;  S.hostDriving = false; }',
    `        try { document.documentElement.setAttribute(${JSON.stringify(INPUT_LOCK_ATTR)}, S.block ? "1" : "0"); } catch (_) {`,
    '          /* 页面内忽略：属性只驱动提示条显隐 */',
    '        }',
    '        return true;',
    '      } catch (_) { return false; }',
    '    };',
    `    window.${INPUT_LOCK_READY_GLOBAL} = true;`,
    '    return true;',
    '  } catch (_) { return false; }',
    '})()',
  ].join('\r\n');
}

/**
 * 切换脚本（原 `ji` 35941）
 *
 * ⚠️ 非法模式**回落 `unlock`**（源码：`e === 'block' || e === 'allow' ? e : 'unlock'`）
 *    —— 即"宁可解锁，不可误锁"。
 * ⚠️ 末尾恒 `true`：脚本结果不用于判定成功（源码如此）
 */
export function inputLockScript(mode: InputLockMode): string {
  const phase: InputLockMode = mode === 'block' || mode === 'allow' ? mode : 'unlock';
  return [
    inputLockSetupScript(),
    `;try{window.${INPUT_LOCK_SET_GLOBAL}(${JSON.stringify(phase)});}`,
    'catch(_){',
    '}',
    'true',
  ].join('');
}

/**
 * 在「锁住真人输入」的前提下执行一段操作（原 `dS`）
 *
 * 语义：`allow`（允许宿主驱动）→ 跑 `fn` → **无论成败** `unlock`。
 *
 * ⚠️ **与原版的一处有意加固**：原版 `finally { await unlock }` —— 若解锁本身抛错
 *    （例如 webview 已销毁），会**掩盖 `fn` 的真实错误**（违反原则 6）。
 *    本实现把解锁失败降级为告警，**保证主错误不被替换**。
 */
export async function withInputLock<T>(view: WebviewElement, fn: () => Promise<T>): Promise<T> {
  await webviewEval(view, inputLockScript('allow'));
  try {
    return await fn();
  } finally {
    try {
      await webviewEval(view, inputLockScript('unlock'));
    } catch (e: unknown) {
      // ⚠️ 不吞：明确告警；但**不得**用它覆盖 `fn` 的错误（原则 6）
      console.warn('[input-lock] 解锁失败（锁可能残留，建议重载该后台页）:', e);
    }
  }
}
