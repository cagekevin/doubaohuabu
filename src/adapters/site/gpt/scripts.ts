/**
 * GPT 站点页内脚本（★ 只读 DOM + 写输入框 + 点发送，**不改环境**）
 *
 * 依据（**逐行回源抄录**）：`sO` shared.js:42998-43133
 *
 * ## 脚本在做什么（**顺序即语义**）
 *   ① **等输入框**：`#prompt-textarea` → `form div[contenteditable="true"]` → `textarea[data-id="root"]`
 *      （**12 次 × 500ms**）—— 找不到 ⇒ `no-composer`
 *   ② 记录**发送前**的用户消息数（`[data-message-author-role="user"]`），用于事后确认
 *   ③ **写文本**（按输入框类型分两条路）：
 *      · `TEXTAREA` ⇒ 用**原生 value setter** 写 + 派发 `input`
 *        （★ 必须走原生 setter —— 直接赋值 `el.value` **绕不过 React 的受控组件**）
 *      · `contenteditable` ⇒ 全选 + `document.execCommand('insertText')`，**并校验结果**，不符则再试一次
 *   ④ **点发送**：`button[data-testid="send-button"]` / `aria-label*="Send"` / `aria-label*="发送"`
 *      里取**未禁用**者（**10 次 × 400ms**）；都找不到 ⇒ **回车兜底**（`keydown` + `keyup`，Enter/13）
 *   ⑤ **确认**：**16 次 × 500ms**，命中「用户消息数增加」**或**「输入框被清空」即算成功
 *
 * ⚠️ 零注入（链 17）：只读选择器 + 写输入框 + 点按钮，**不改** `navigator`/`screen`/`webgl`。
 * ⚠️ 空 `catch` 拆行：注入脚本用**行数组 + `join`**（逐行可读；JS 里换行无语义）。
 * ⚠️ 文案一律从 `@/constants/text` 注入（原则 5），脚本里不硬编码中文。
 */

import { GPT_TEXT } from '@/constants/text';

/** 输入框候选（原 `sO` 的 `r()`）—— **顺序即优先级** */
const COMPOSER_SELECTORS = [
  '#prompt-textarea',
  'form div[contenteditable="true"]',
  'textarea[data-id="root"]',
] as const;

/** 输入框候选的页内「命中即停」链（唯一拼法）—— 发送脚本与探针**共用同一份候选** */
const COMPOSER_LOOKUP_SRC = COMPOSER_SELECTORS.map(
  (s) => `document.querySelector(${JSON.stringify(s)})`,
).join(' || ');

/**
 * 「页面有没有输入框」探针（`SitePort.probe` 用）
 *
 * ⚠️ 它**不是第二份判据**：与 `gptSendScript` 的 `findComposer` 问的是同一件事（哪些元素算
 *    GPT 的输入框）⇒ 单写一份就会出现"页面只有第三个候选时，脚本发得出、探针报不可用"。
 */
export const GPT_COMPOSER_PROBE_SCRIPT = `({ href: location.href, hasComposer: !!(${COMPOSER_LOOKUP_SRC}) })`;

/** 发送按钮候选（原 `sO` 的 `l()`） */
const SEND_BUTTON_SELECTOR =
  'button[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="发送" i]';

/** 用户消息选择器（原 `sO` 的 `o()`） */
const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"]';

/**
 * 生成「写提示词 + 点发送」脚本（原 `sO` 42998）
 *
 * @param text 要写入的提示词（用 `JSON.stringify` 内联 —— **不做字符串拼接**，免注入）
 */
export function gptSendScript(text: string): string {
  return [
    '(function (raw) {',
    '  return (async () => {',
    '    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };',
    "    var text = String(raw == null ? '' : raw);",
    '',
    '    var findComposer = function () {',
    `      var el = ${COMPOSER_LOOKUP_SRC};`,
    '      if (!el) return null;',
    "      return { el: el, kind: el.tagName === 'TEXTAREA' ? 'textarea' : 'ce' };",
    '    };',
    '',
    '    var composer = findComposer();',
    '    for (var i = 0; i < 12 && !composer; i += 1) {',
    '      await sleep(500);',
    '      composer = findComposer();',
    '    }',
    '    if (!composer) {',
    `      return { ok: false, reason: 'no-composer', note: ${JSON.stringify(GPT_TEXT.noComposer)} };`,
    '    }',
    '',
    '    var countUserMsgs = function () {',
    `      return document.querySelectorAll(${JSON.stringify(USER_MESSAGE_SELECTOR)}).length;`,
    '    };',
    '    var before = countUserMsgs();',
    '',
    '    var selectAllIn = function (el) {',
    '      var sel = window.getSelection();',
    '      var rng = document.createRange();',
    '      rng.selectNodeContents(el);',
    '      sel.removeAllRanges();',
    '      sel.addRange(rng);',
    '    };',
    '',
    '    try {',
    '      composer.el.focus();',
    "      if (composer.kind === 'textarea') {",
    '        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")',
    '          .set.call(composer.el, text);',
    "        composer.el.dispatchEvent(new Event('input', { bubbles: true }));",
    '      } else {',
    '        try {',
    '          selectAllIn(composer.el);',
    '        } catch (_) {',
    '          /* 页面内忽略：选区失败不阻断 —— 下面的 selectAll 会兜 */',
    '        }',
    "        document.execCommand('selectAll', false, null);",
    "        document.execCommand('insertText', false, text);",
    "        var wrote = String(composer.el.textContent || '').trim();",
    '        if (wrote && wrote !== text.trim()) {',
    '          try {',
    '            selectAllIn(composer.el);',
    "            document.execCommand('insertText', false, text);",
    '          } catch (_) {',
    '            /* 页面内忽略：二次尝试失败就接受现状（下面的确认会判成败） */',
    '          }',
    '        }',
    '      }',
    '    } catch (e) {',
    `      return { ok: false, reason: 'insert-fail', note: ${JSON.stringify(GPT_TEXT.insertFailPrefix)} + String((e && e.message) || e) };`,
    '    }',
    '',
    '    var findSendBtn = function () {',
    `      var list = Array.from(document.querySelectorAll(${JSON.stringify(SEND_BUTTON_SELECTOR)}));`,
    '      return list.find(function (b) {',
    "        return !b.disabled && b.getAttribute('aria-disabled') !== 'true';",
    '      }) || null;',
    '    };',
    '',
    "    var via = '';",
    '    for (var k = 0; k < 10; k += 1) {',
    '      var btn = findSendBtn();',
    '      if (btn) {',
    '        btn.click();',
    "        via = 'button';",
    '        break;',
    '      }',
    '      await sleep(400);',
    '    }',
    '    if (!via) {',
    '      try {',
    '        var mkKey = function (type) {',
    "          return new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });",
    '        };',
    "        composer.el.dispatchEvent(mkKey('keydown'));",
    "        composer.el.dispatchEvent(mkKey('keyup'));",
    "        via = 'enter';",
    '      } catch (_) {',
    '        /* 页面内忽略：回车兜底失败 ⇒ 下面统一报 no-send */',
    '      }',
    '    }',
    '    if (!via) {',
    `      return { ok: false, reason: 'no-send', note: ${JSON.stringify(GPT_TEXT.noSend)} };`,
    '    }',
    '',
    '    for (var c = 0; c < 16; c += 1) {',
    '      await sleep(500);',
    '      if (countUserMsgs() > before) return { ok: true, via: via };',
    "      var left = String(composer.el.tagName === 'TEXTAREA' ? composer.el.value : (composer.el.textContent || '')).trim();",
    '      if (!left) return { ok: true, via: via };',
    '    }',
    `    return { ok: false, reason: 'not-confirmed', note: ${JSON.stringify(GPT_TEXT.notConfirmed)} };`,
    '  })();',
    `})(${JSON.stringify(text)})`,
  ].join('\n');
}
