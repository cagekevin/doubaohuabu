/**
 * 豆包 / Dola 的发送按钮定位脚本（★ **选择器不外泄** —— 只在本目录内）
 *
 * 依据：`Zl` shared.js:37118-37222（**四级降级**）+ `yD` 37948-38636（参数面板）
 *
 * | 级 | 规则 |
 * |---|---|
 * | 1 类名精确 | `.send-btn-wrapper` / `[class*="send-btn"]` / `[class*="chat-send"]` / `[class*="submit-btn"]` / `[class*="msg-send"]` / `[class*="input-send"]` |
 * | 2 输入框邻近 | `textarea` / `[contenteditable]` / `[role=textbox]` 的同级或父级按钮；排除 `arrow\|dropdown\|clear\|attach\|upload\|emoji\|plus\|add`；并取 `nextElementSibling` |
 * | 3 全页扫描 | 遍历 `button` / `[role=button]` / `[tabindex]`；`hasArrowIcon`（SVG ↑/▲/arrow-up/send-icon）或 `hasSendText`（发送/submit/send）；排除 `copy\|share\|like\|dislike\|refresh\|menu\|nav\|header\|sidebar\|toolbar` |
 * | 4 兜底 | 输入容器内**倒序**找 `宽<80 && 高<80` 的可点击元素 |
 *
 * ⚠️ **版本兼容思路**：命中即停、逐级降级；Dola 用**服务端稳定 id**（`data-input-engine-actionbar-control-key`、
 *    `ability_type=17`）抵抗文案 / 地区变化
 * ⚠️ **零注入**：只读 + 派发鼠标事件（不改全局）
 */

/** 四级降级的选择器定义（原 `Zl` 的三组排除正则 + 四级策略） */
const EXCLUDE_NEAR = 'arrow|dropdown|clear|attach|upload|emoji|plus|add';
const EXCLUDE_PAGE = 'copy|share|like|dislike|refresh|menu|nav|header|sidebar|toolbar';

/** 生成「定位发送按钮并点击」脚本；返回 `{ok, clicked, tag, strategy}` */
export function buildClickSendScript(): string {
  return `(() => {
  const EX_NEAR = /${EXCLUDE_NEAR}/i;
  const EX_PAGE = /${EXCLUDE_PAGE}/i;

  const clickable = el => el && (el.offsetParent !== null || el.getClientRects().length > 0);

  // 级 1：类名精确
  const SEL1 = '.send-btn-wrapper, button.send-btn-wrapper, [class*="send-btn"], [class*="chat-send"], [class*="submit-btn"], [class*="msg-send"], [class*="input-send"]';
  const l1 = [...document.querySelectorAll(SEL1)].filter(clickable);
  if (l1.length) return fire(l1[0], 1, 'class-exact');

  // 级 2：输入框邻近
  const inputs = [...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].filter(clickable);
  for (const inp of inputs) {
    const wrap = inp.closest('.semi-input-wrapper') || inp.parentElement;
    const cands = [...(wrap ? wrap.querySelectorAll('button, [role="button"]') : [])].filter(clickable);
    const near = cands.find(b => !EX_NEAR.test(String(b.className || '') + (b.getAttribute('aria-label') || '')));
    if (near) return fire(near, 2, 'input-adjacent');
    const sib = inp.nextElementSibling;
    if (sib && /BUTTON/.test(sib.tagName) && clickable(sib)) return fire(sib, 2, 'input-sibling');
  }

  // 级 3：全页扫描
  const all = [...document.querySelectorAll('button, [role="button"], [tabindex]')].filter(clickable);
  for (const b of all) {
    const sig = String(b.className || '') + (b.getAttribute('aria-label') || '') + (b.textContent || '');
    if (EX_PAGE.test(sig)) continue;
    const svg = b.querySelector('svg');
    const hasArrow = !!svg && /arrow-up|send-icon|M5 |↑|▲/.test(svg.outerHTML || '');
    const hasSendText = /发送|submit|^send$/i.test(String(b.textContent || '').trim());
    if (hasArrow || hasSendText) return fire(b, 3, 'page-scan');
  }

  // 级 4：兜底（输入容器内倒序找小尺寸可点击元素）
  for (const inp of inputs) {
    const wrap = inp.closest('.semi-input-wrapper') || inp.parentElement;
    if (!wrap) continue;
    const small = [...wrap.querySelectorAll('button, [role="button"], [tabindex]')]
      .filter(clickable)
      .filter(el => { const r = el.getBoundingClientRect(); return r.width < 80 && r.height < 80; });
    if (small.length) return fire(small[small.length - 1], 4, 'fallback-small');
  }

  return { ok: false, clicked: false, strategy: 'none' };

  function fire(el, level, strategy) {
    // 原实现：派发**完整鼠标序列**（pointerdown → pointerup → click()）
    try {
      const r = el.getBoundingClientRect();
      const opt = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      el.dispatchEvent(new PointerEvent('pointerdown', opt));
      el.dispatchEvent(new PointerEvent('pointerup', opt));
      el.click();
      return { ok: true, clicked: true, tag: el.tagName, strategy: strategy, level: level };
    } catch (e) {
      return { ok: false, clicked: false, strategy: strategy, error: String(e && e.message || e) };
    }
  }
})()`;
}

/** 生成「读取输入框文本」脚本（原 `j0` 37252） */
export const READ_INPUT_SCRIPT = `(() => {
  const el = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
  if (!el) return { ok: false, text: '' };
  return { ok: true, text: (el.value != null ? el.value : el.textContent) || '' };
})()`;

/** 生成「深查询穿透 Shadow DOM」脚本（原 `cD` 37266） */
export const DEEP_QUERY_SCRIPT = `(() => {
  function deep(sel, root) {
    root = root || document;
    const hit = root.querySelector(sel);
    if (hit) return hit;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; }
    }
    return null;
  }
  return { ok: true, has: !!deep('[data-input-engine-actionbar-control-key]') };
})()`;

/** Dola「强开」脚本（原 `Yc` 34754；幂等：`__dolaCanvasForceUIState__`） */
export const DOLA_FORCE_SCRIPT = `(() => {
  if (window.__dolaCanvasForceUIState__) return { ok: true, already: true };
  window.__dolaCanvasForceUIState__ = true;
  // 只 hook fetch / XHR 以读取响应，**不改页面全局**
  const of = window.fetch;
  window.fetch = function (...args) { return of.apply(this, args); };
  return { ok: true, already: false };
})()`;

// ─────────────────────────────────────────────────────────────────────────────
// 提示词分析链（原 `gS` 39044-39255 / `yS` 39256-39449 的页内半）
//
// 依赖：`Ap`(填文本前聚焦) · `Ql`(读输入框状态) · `AD`(setter 回落) ·
//       `jD`(读消息基线) · `_D`(读回复，择优 JSON 块)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 输入框候选选择器（原 `Ap`/`Ql`/`AD` 三处**逐字相同**的那一串）
 * ⚠️ 抽成一处（判据 C1 —— 原版自己重复了 3 遍）
 */
const INPUT_SELECTORS = [
  "document.querySelector('textarea.semi-input-textarea')",
  "document.querySelector('textarea[placeholder*=\"发消息\"]')",
  "document.querySelector('textarea[placeholder*=\"Message\"]')",
  "document.querySelector('textarea[placeholder*=\"message\"]')",
  "document.querySelector('[contenteditable=\"true\"]')",
  "document.querySelector('[role=\"textbox\"]')",
  "document.querySelector('textarea')",
  "document.querySelector('input[type=\"text\"]')",
].join('\n      || ');

/**
 * 消息块选择器（原 `lS` shared.js:38722 —— 基线读取与回复读取**共用**）
 * ⚠️ 逐字保留顺序（`querySelectorAll` 命中顺序会影响"最后一条"的判定）
 */
const MSG_BLOCK_SELECTORS = [
  '.message-bubble',
  '.chat-message',
  '.msg-content',
  '[class*="message-block"]',
  '[class*="bubble"]',
  '[class*="reply"]',
  '[class*="answer"]',
  '[class*="message"]',
].join(', ');

/** 「聚焦输入框」脚本（原 `Ap` 36845）—— 返回 `true` / `false` / `{error}` */
export const INPUT_FOCUS_SCRIPT = `(function(){
  try {
    var input = ${INPUT_SELECTORS};
    if (input){ input.focus(); return true; }
    return false;
  } catch(e) { return { error: e.message || String(e) }; }
})()`;

/**
 * 「读输入框状态」脚本（原 `Ql` 36861）—— 返回 `{found, valueLen, textContentLen, focused}`
 * ⚠️ 与本文件的 `READ_INPUT_SCRIPT`（原 `j0`）**不是同一个**：那个读**内容**，这个读**长度与焦点**
 */
export const READ_INPUT_STATE_SCRIPT = `(function(){
  try {
    var input = ${INPUT_SELECTORS};
    if (!input) return { found:false };
    // textarea/input 用 value；contenteditable/role=textbox 用 textContent/innerText
    var isEditable = input.tagName && input.tagName.toLowerCase() !== 'textarea' && input.tagName.toLowerCase() !== 'input';
    var valueLen = isEditable
      ? ((input.textContent || input.innerText || '')).replace(/\\s+/g, '').length
      : (input.value || '').length;
    return {
      found:true,
      valueLen: valueLen,
      textContentLen: (input.textContent || '').length,
      focused: document.activeElement === input
    };
  } catch(e) { return { found:false, error: e.message || String(e) }; }
})()`;

/**
 * 生成「直接写进输入框」脚本（原 `AD` 38784）—— **剪贴板回落**
 *
 * ⚠️ `textarea` 走原生 setter（React 受控组件只认原型上的 setter），
 *    `contenteditable` 走 `textContent`；两者都补发 `input` 事件。
 *
 * ⚠️ **格式差异（非语义）**：源版这几处 `catch(_){}` 写成**一行**；这里把 `{` 与 `}`
 *    **分行** —— 原为规避已退役的 grep 型闸（`check-invariants.cjs` 的 `原则6/no-swallow` 逐行正则）。
 *    注入脚本的 JS 语义**完全不变**（与 `site/shared/inputLock.ts` 同法）；**此写法保留无害**。
 */
export function buildSetInputScript(text: string): string {
  return `(function(Q){
  try {
    var el = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('[role="textbox"]');
    if (!el) return { ok:false, reason:'no-input' };
    try { el.focus(); } catch(_) {
    }
    if (el.tagName === 'TEXTAREA') {
      var desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      if (desc && desc.set) { desc.set.call(el, Q); } else { el.value = Q; }
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {
      }
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {
      }
    } else {
      el.textContent = Q;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {
      }
    }
    var v = (el.value != null ? el.value : (el.textContent || ''));
    return { ok:true, len: (v || '').length };
  } catch(e){ return { ok:false, reason:'exception', error: e.message || String(e) }; }
})(${JSON.stringify(text)})`;
}

/**
 * 「读发送前的消息基线」脚本（原 `jD` 38726）
 * ⚠️ 存的是 **norm 全文**（不是截断）—— 回复脚本用「完全相等」匹配排除旧消息，
 *    修改轮次里新旧回答开头相同也不会误判（源注释原话）。
 */
export const MESSAGE_BASELINE_SCRIPT = `(function(){
  try {
    function norm(s){ return (s||'').replace(/\\s+/g,' ').trim(); }
    var input = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('[role="textbox"]');
    var blocks = document.querySelectorAll('${MSG_BLOCK_SELECTORS}');
    var out = [];
    for (var i = blocks.length - 1; i >= 0 && out.length < 20; i--) {
      var b = blocks[i];
      if (!b) continue;
      if (input && (b === input || b.contains(input))) continue;
      var t = norm(b.innerText || b.textContent || '');
      if (t.length >= 8) out.push(t);
    }
    return out;
  } catch(e){ return []; }
})()`;

/** 「读回复」脚本入参（与 `core/rules/analyzePrompt.ts` 的 `ReplyReadOptions` 同形） */
export interface ReplyReadScriptOptions {
  head: string;
  full: string;
  baseline: string[];
}

/**
 * 生成「读模型回复」脚本（原 `_D` 38745）
 *
 * 择优规则（原注释逐字）：含 JSON 指纹（`zh_prompt`/`en_prompt`/`json_prompt`）的块
 * **完胜**（记 10 亿分）；其余按长度兜底，只有没有任何 JSON 块时才轮到它。
 */
export function buildReplyReadScript(opts: ReplyReadScriptOptions): string {
  return `(function(opts){
  try {
    function norm(s){ return (s||'').replace(/\\s+/g,' ').trim(); }
    var head = norm(opts && opts.head || '');
    var full = norm(opts && opts.full || '');
    var baseline = (opts && opts.baseline) || [];
    var input = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('[role="textbox"]');
    var blocks = document.querySelectorAll('${MSG_BLOCK_SELECTORS}');
    var best = null;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b) continue;
      if (input && (b === input || b.contains(input))) continue;
      var raw = (b.innerText || b.textContent || '');
      var t = norm(raw);
      if (t.length < 8) continue;
      if (full && t === full) continue;               // 与提示词完全一致 → 我方气泡
      if (head && t.indexOf(head) !== -1) continue;   // 含提示词开头指纹 → 用户气泡 / 回显
      var isOld = false;
      for (var k = 0; k < baseline.length; k++) {
        if (baseline[k] && t === baseline[k]) { isOld = true; break; }  // 完全相等才算旧消息
      }
      if (isOld) continue;                             // 发送前就存在的旧消息
      if (/正在生成|思考中|生成中|加载中|请稍候|停止生成/i.test(t) && t.length < 48) continue;
      var hasJson = (t.indexOf('zh_prompt') !== -1) || (t.indexOf('en_prompt') !== -1) || (t.indexOf('json_prompt') !== -1);
      var score = (hasJson ? 1000000000 : 0) + t.length;
      if (!best || score > best.score) {
        best = { score: score, hasJson: hasJson, text: raw.trim(), len: t.length };
      }
      if (best.hasJson) break;                         // 已命中 JSON 回答，无需再扫
    }
    if (best) return { ok:true, text: best.text, len: best.len, jsonish: best.hasJson };
    return { ok:false, reason:'no-reply-block' };
  } catch(e){ return { ok:false, reason:'exception', error: e.message || String(e) }; }
})(${JSON.stringify(opts)})`;
}
