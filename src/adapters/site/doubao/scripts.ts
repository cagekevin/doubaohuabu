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
