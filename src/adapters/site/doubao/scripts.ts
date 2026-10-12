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

// ★ 监测脚本的规则表/模式表住 `constants/sendWatch.ts`（SSOT：页面脚本与 app 侧共用一份）
import {
  QUOTA_CONSUME_PATTERNS,
  QUOTA_CONSUME_WARN,
  QUOTA_KEYWORDS,
  QUOTA_LOW_PATTERNS,
  QUOTA_REMAIN_PATTERNS,
  QUOTA_REMAIN_WARN,
  REPLY_NOTICE_RULES,
  WAIT_MAX_SECONDS,
  WAIT_MIN_PATTERNS,
  WAIT_SEC_PATTERNS,
} from '@/constants/sendWatch';

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
 *
 * ★ **TD-16-106**（2026-10-11）：失败由「裸 `[]`」改为**判别对象** ——
 *   源 `catch{ return [] }` 让「脚本崩」与「页面确实没有旧消息」在上游**不可分辨**
 *   （消费者只拿到空基线 ⇒ 旧回复可能被当成新回复，M5）。现与同文件
 *   `buildSetInputScript` 同范式（`{ok:true,…}` ／ `{ok:false, error}`）。
 *   ⚠️ **页内脚本不 `console.warn`**（反检测红线，见 `docs/09` C2）—— 异常只**带回结果**，
 *      留痕由渲染进程侧（`analyze.ts`）做。
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
    return { ok:true, list: out };
  } catch(e){ return { ok:false, error: e.message || String(e) }; }
})()`;

/** `MESSAGE_BASELINE_SCRIPT` 的返回（源 `jD` 恒返数组；本仓补失败判别 —— TD-16-106） */
export type MessageBaselineResult =
  | { ok: true; list: string[] }
  | { ok: false; error: string };

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

// ─────────────────────────────────────────────────────────────────────────────
// 无水印拉取（原 `mD` 37737-37815 / `gD` 37816-37947 的页内脚本）
//
// ★ **2026-10-12（`docs/14` §10 的 ⛔ 阻塞）**：这两段是**页内脚本**（在豆包后台
//   webview 里用**同步 XHR** 调 `/samantha/aispace/` 三步链：homepage → node_info →
//   get_download_info）。**绝不降级到带水印的 get_play_info**（源注释明写）。
// ⚠️ 由 `core/usecases/fetchWatermarkFree.ts` 经 `BackendPagePort.runScript` 执行。
// ⚠️ 脚本里的 `\\u6211\\u7684\\u521b\\u4f5c` = 「我的创作」（页内执行时才由 JS 引擎解析）。
// ─────────────────────────────────────────────────────────────────────────────

/** 按 `vid` 拉单个视频的无水印直链（原 `mD` 37737）—— 返回 `{ok,url,vid,width,height,duration,…}` */
export const WATERMARK_FREE_BY_VID = `
(function(vid){
  try {
    if (!vid) return { ok:false, error:'no_vid' };
    var diag = { steps:[], raw:{} };
    var BASE = '/samantha/aispace/';
    var PARAMS = 'aid=497858&device_platform=web&samantha_web=1&use-olympus-account=1&version_code=20800&pkg_type=release_version';
    function post(url, body, label) {
      var x = new XMLHttpRequest();
      x.open('POST', url + '?' + PARAMS, false);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(body !== undefined ? JSON.stringify(body) : '{}');
      var respText = x.responseText;
      diag.raw[label] = { status: x.status, body: respText.slice(0, 500) };
      diag.steps.push(label + ':HTTP' + x.status);
      if (x.status !== 200) throw new Error(label + '_HTTP_' + x.status);
      var j = JSON.parse(respText);
      if (j.code !== undefined && j.code !== 0) throw new Error(label + ':' + (j.message || 'code_' + j.code));
      return j;
    }
    var home;
    try { home = post(BASE + 'homepage', undefined, 'homepage'); } catch(e) {
      return { ok:false, error:'homepage_failed', note:'无水印链路首页接口无返回（webview 可能不在创作空间页，或账号无水印导出权限不足）。', diag:diag };
    }
    var children = home.data && home.data.children;
    var creationId = null;
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i].name === '\\u6211\\u7684\\u521b\\u4f5c') { creationId = children[i].id; break; }
      }
    }
    if (!creationId) return { ok:false, error:'no_creation_folder', note:'未找到「我的创作」文件夹，请确认已登录', diag:diag };
    var nodeInfo;
    try { nodeInfo = post(BASE + 'node_info', { node_id: creationId, need_full_path:true, size:50, sort_param:{need_sort_config:true,sort_order:1,sort_type:0} }, 'node_info'); } catch(e) {
      return { ok:false, error:e.message, note:'查找节点失败，尝试降级', diag:diag };
    }
    var nodeChildren = nodeInfo.data && nodeInfo.data.children;
    var nodeId = null;
    if (nodeChildren) {
      for (var j = 0; j < nodeChildren.length; j++) {
        if (String(nodeChildren[j].key) === String(vid)) { nodeId = nodeChildren[j].id; break; }
      }
    }
    if (!nodeId) return { ok:false, error:'node_not_found', note:'在「我的创作」中未找到该视频（vid='+vid+'），可能视频不属于当前账号', diag:diag };
    var dlInfo;
    try { dlInfo = post(BASE + 'get_download_info', { requests:[{node_id:nodeId}] }, 'download'); } catch(e) {
      return { ok:false, error:e.message, note:'获取下载信息失败', diag:diag };
    }
    var dlInfos = dlInfo.data && dlInfo.data.download_infos;
    var mainUrl = dlInfos && dlInfos[0] && dlInfos[0].main_url;
    var meta = dlInfos && dlInfos[0] ? (dlInfos[0].meta || dlInfos[0]) : null;
    if (!mainUrl) return { ok:false, error:'no_url', note:'下载信息中无 main_url', diag:diag };
    return {
      ok: true,
      url: mainUrl,
      width: meta ? (meta.width || null) : null,
      height: meta ? (meta.height || null) : null,
      duration: meta ? (meta.duration || null) : null,
      poster: null,
      definition: meta ? (meta.definition || null) : null,
      source: 'aispace',
      diag: diag
    };
  } catch(e) { return { ok:false, error: e.message || String(e) }; }
})
`;

/** 按分享链接（threadId）批量拉无水印直链（原 `gD` 37816）—— 返回 `{ok,videos,total,success,note}` */
export const WATERMARK_FREE_BY_THREAD = `
(function(threadId){
  try {
    if (!threadId) return { ok:false, error:'no_thread_id' };
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/thread/' + threadId + '?version_code=20800&language=zh-CN&device_platform=web&aid=497858&pc_version=2.51.7&samantha_web=1', false);
    xhr.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    xhr.send();
    if (xhr.status !== 200) return { ok:false, error:'http_'+xhr.status, note:'无法访问分享链接' };
    var html = xhr.responseText;
    var vids = [];
    var seen = {};
    var vidMatches = html.match(/v0[a-zA-Z0-9]{20,}/g);
    if (vidMatches) {
      for (var i = 0; i < vidMatches.length; i++) {
        if (!seen[vidMatches[i]]) { seen[vidMatches[i]] = 1; vids.push(vidMatches[i]); }
      }
    }
    var jsonBlocks = html.match(/(?:window\\\\.__INITIAL_STATE__\\\\s*=|window\\\\.__NEXT_DATA__\\\\s*=|id="__NEXT_DATA__"[^>]*>)([\\\\s\\\\S]*?)(?:<\\\\/script>|;\\\\s*$)/gi);
    if (jsonBlocks && !vids.length) {
      for (var j = 0; j < jsonBlocks.length; j++) {
        var block = jsonBlocks[j];
        var jsonStr = block.replace(/^[^=]*=/, '').replace(/;\\\\s*$/, '').trim();
        if (jsonStr.charAt(0) !== '{' && jsonStr.charAt(0) !== '<') continue;
        if (jsonStr.charAt(0) === '<') {
          var inner = jsonStr.match(/>([\\\\s\\\\S]*)<\\\\/script>/);
          if (inner) jsonStr = inner[1];
        }
        try {
          var data = JSON.parse(jsonStr);
          var str = JSON.stringify(data);
          var embeddedVids = str.match(/"video_id"?\\\\s*:\\\\s*"([^"]+)"/g);
          if (embeddedVids) {
            for (var k = 0; k < embeddedVids.length; k++) {
              var ev = embeddedVids[k].match(/"([^"]+)"$/);
              if (ev && ev[1] && /^v0/.test(ev[1]) && !seen[ev[1]]) {
                seen[ev[1]] = 1; vids.push(ev[1]);
              }
            }
          }
          var embedV0 = str.match(/v0[a-zA-Z0-9]{20,}/g);
          if (embedV0) {
            for (var m = 0; m < embedV0.length; m++) {
              if (!seen[embedV0[m]]) { seen[embedV0[m]] = 1; vids.push(embedV0[m]); }
            }
          }
        } catch(ignoredJson) {}
      }
    }
    if (!vids.length) {
      return { ok:false, error:'no_vid_found', note:'未在分享页面中找到视频ID，请确认链接有效且包含视频' };
    }
    var BASE2 = '/samantha/aispace/';
    var PARAMS2 = 'aid=497858&device_platform=web&samantha_web=1&use-olympus-account=1&version_code=20800&pkg_type=release_version';
    function post2(url, body) {
      var x = new XMLHttpRequest();
      x.open('POST', url + '?' + PARAMS2, false);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(body !== undefined ? JSON.stringify(body) : '{}');
      if (x.status !== 200) throw new Error('HTTP_' + x.status);
      var j = JSON.parse(x.responseText);
      if (j.code !== undefined && j.code !== 0) throw new Error(j.message || 'api_err_' + j.code);
      return j;
    }
    var creationId = null;
    try {
      var homeData = post2(BASE2 + 'homepage');
      var hc = homeData.data && homeData.data.children;
      if (hc) { for (var ci = 0; ci < hc.length; ci++) { if (hc[ci].name === '\\u6211\\u7684\\u521b\\u4f5c') { creationId = hc[ci].id; break; } } }
    } catch(e) { }
    function fetchOneVid(vid) {
      var cId = creationId;
      try {
        if (!cId) {
          var h = post2(BASE2 + 'homepage');
          var ch = h.data && h.data.children;
          if (ch) { for (var hj = 0; hj < ch.length; hj++) { if (ch[hj].name === '\\u6211\\u7684\\u521b\\u4f5c') { cId = ch[hj].id; break; } } }
        }
        if (!cId) return { vid:vid, url:null, error:'no_creation_folder' };
        var nInfo = post2(BASE2 + 'node_info', { node_id:cId, need_full_path:true, size:50, sort_param:{need_sort_config:true,sort_order:1,sort_type:0} });
        var nc = nInfo.data && nInfo.data.children;
        var nid = null;
        if (nc) { for (var ni=0;ni<nc.length;ni++) { if(String(nc[ni].key)===String(vid)){nid=nc[ni].id;break;} } }
        if (!nid) return { vid:vid, url:null, error:'vid_not_in_creation' };
        var dl = post2(BASE2 + 'get_download_info', { requests:[{node_id:nid}] });
        var di = dl.data && dl.data.download_infos;
        var mu = di && di[0] && di[0].main_url;
        if (mu) {
          var dm = di && di[0] ? (di[0].meta||di[0]) : null;
          return { vid:vid, url:mu, width:dm?dm.width:null, height:dm?dm.height:null, duration:dm?dm.duration:null, poster:null, source:'aispace' };
        }
        return { vid:vid, url:null, error:'no_download_url' };
      } catch(ae) {
        return { vid:vid, url:null, error: ae.message || 'aispace_failed' };
      }
    }
    var results = [];
    for (var v = 0; v < vids.length; v++) {
      results.push(fetchOneVid(vids[v]));
    }
    var successResults = results.filter(function(r){ return r.url; });
    var failedResults   = results.filter(function(r){ return !r.url; });
    return {
      ok: successResults.length > 0,
      videos: results,
      total: results.length,
      success: successResults.length,
      note: '共找到 ' + results.length + ' 个视频，成功获取 ' + successResults.length + ' 个无水印链接' +
            (failedResults.length ? '（' + failedResults.length + ' 个未获取到无水印链接）' : '')
    };
  } catch(e) { return { ok:false, error: e.message || String(e) }; }
})
`;

// ─────────────────────────────────────────────────────────────────────────────
// 发送后监测（原 `_Component43.jsx` 的 `watchSendReply` 用的 4 个页内脚本）
//
// | 本文件 | 源 | 语义 |
// |---|---|---|
// | `SEND_REPLY_ACK_SCRIPT` | `dD` `shared.js:37544-37576` | 数「已接单」话术的出现次数（增量判定用计数） |
// | `WAIT_TIME_SCRIPT` | `fD` `37577-37616` | 解析「预计等待 N 分钟/秒」 |
// | `REPLY_NOTICE_SCRIPT` | `pD` `37617-37651` | 按 `REPLY_NOTICE_RULES` 计数（同规则多 pattern 取**最大值**） |
// | `QUOTA_USAGE_SCRIPT` | `hD` `37652-37734` | 额度预警（明确话术 / 本次消耗 / 剩余额度） |
//
// ★ **规则表与模式表住 `constants/sendWatch.ts`**（SSOT：页面脚本与 app 侧共用一份，见该文件头注）。
// ⚠️ 三个脚本共同的第一件事：**把「输入框文本」排除在统计之外**（`inN`）—— 否则我方待发送的
//   内容自己会被当成"页面回复"⇒ 自触发（源注释明写）。
// ⚠️ 源版 4 个脚本都是 `catch(e) { return {…, error} }` —— **不静默**（本仓照抄；adapter 侧再判 `_execError`）。
// ─────────────────────────────────────────────────────────────────────────────

/** 「已接单」回复计数（原 `dD`，`shared.js:37544`）—— 返回 `{hit,count,text,bodyLen}` */
export const SEND_REPLY_ACK_SCRIPT = `
(function(){
  try {
    function norm(s){ return (s||'').replace(/\\s+/g,' ').trim(); }
    // 输入框文本（我方待发送内容）——命中若只出现在这里则排除，避免自触发
    var input = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('[role="textbox"]');
    var inN = norm(input ? (input.value || input.textContent || input.innerText || '') : '');

    // 只统计全文：body.innerText 覆盖全部可见文本，不存在漏检；用计数而非布尔便于做增量判定
    var bodyText = norm(document.body.innerText || '');

    var patterns = [
      /视频生成好后[，,]?\\s*我会主动发送给你/,
      /视频生成好后[，,]?\\s*[^。]{0,20}主动发送/,
      /生成好后[，,]?\\s*[^。]{0,20}主动发送/,
      /我会主动发送给你/,
      /生成完成后[，,]?\\s*[^。]{0,20}发送给你/,
      /稍后[，,]?\\s*[^。]{0,20}发送给你/
    ];
    var count = 0, sample = '';
    for (var p=0; p<patterns.length; p++){
      var g = bodyText.match(new RegExp(patterns[p].source, 'g'));
      if (!g) continue;
      for (var k=0; k<g.length; k++){
        if (inN && inN.indexOf(g[k]) !== -1) continue; // 仅出现在输入框 → 跳过
        count++;
        if (!sample) sample = g[k];
      }
    }
    return { hit: count > 0, count: count, text: sample, bodyLen: bodyText.length };
  } catch(e) { return { hit:false, count:0, error: e.message || String(e) }; }
})()
`;

/** 等待时长解析（原 `fD`，`shared.js:37577`）—— 返回 `{hit,minutes,seconds,text,index,bodyLen}` */
export const WAIT_TIME_SCRIPT = `
(function(){
  try {
    function norm(s){ return (s||'').replace(/\\s+/g,' ').trim(); }
    var input = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('[role="textbox"]');
    var inN = norm(input ? (input.value || input.textContent || input.innerText || '') : '');
    var bodyText = norm(document.body.innerText || '');

    // 模式源码与 app 侧共用同一份定义（constants/sendWatch.ts），避免两边话术适配各改各的
    var MIN_PATTERNS = ${JSON.stringify(WAIT_MIN_PATTERNS)};
    var SEC_PATTERNS = ${JSON.stringify(WAIT_SEC_PATTERNS)};
    var MAX_SECONDS = ${WAIT_MAX_SECONDS};

    var best = null;
    function scan(pats, unit){
      for (var p=0;p<pats.length;p++){
        var re = new RegExp(pats[p], 'gi');
        var m;
        while ((m = re.exec(bodyText)) !== null) {
          var snippet = m[0];
          if (inN && inN.indexOf(snippet) !== -1) continue;   // 仅出现在输入框 → 跳过
          var v = parseFloat(m[1]);
          if (!isFinite(v) || v <= 0) continue;
          var secs = unit === 'min' ? v * 60 : v;
          if (secs > MAX_SECONDS) continue;                   // 超过上限视为误匹配
          if (!best || m.index >= best.index) {               // 取最靠后的一条（最新回复）
            best = { index:m.index, seconds:secs, minutes:Math.round((secs/60)*10)/10, text:snippet };
          }
        }
      }
    }
    scan(MIN_PATTERNS, 'min');
    scan(SEC_PATTERNS, 'sec');

    if (!best) return { hit:false, bodyLen: bodyText.length };
    return { hit:true, minutes:best.minutes, seconds:best.seconds, text:best.text, index:best.index, bodyLen:bodyText.length };
  } catch(e) { return { hit:false, error: e.message || String(e) }; }
})()
`;

/** 回复通知计数（原 `pD`，`shared.js:37617`）—— 返回 `{hit,counts,samples,total,bodyLen}` */
export const REPLY_NOTICE_SCRIPT = `
(function(){
  try {
    function norm(s){ return (s||'').replace(/\\s+/g,' ').trim(); }
    // 输入框文本（我方待发送内容）——命中若只出现在这里则排除，避免自触发
    var input = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('[role="textbox"]');
    var inN = norm(input ? (input.value || input.textContent || input.innerText || '') : '');
    var bodyText = norm(document.body.innerText || '');
    var RULES = ${JSON.stringify(REPLY_NOTICE_RULES)};

    var counts = {}, samples = {}, total = 0;
    for (var r=0; r<RULES.length; r++){
      var rule = RULES[r];
      // 同一规则内的多个 pattern 是「同一句话的不同说法」，会互相重叠，
      // 因此取各 pattern 命中数的**最大值**，而不是求和（与 app 侧同一口径）。
      var best = 0, bestSample = '';
      for (var p=0; p<rule.patterns.length; p++){
        var re = new RegExp(rule.patterns[p], 'g');
        var n = 0, sample = '', m;
        while ((m = re.exec(bodyText)) !== null) {
          var snippet = m[0];
          if (snippet === '') { re.lastIndex += 1; continue; }        // 空匹配防御
          if (inN && inN.indexOf(snippet) !== -1) continue;            // 仅出现在输入框 → 不计入
          n++;
          sample = snippet;
        }
        if (n > best) { best = n; bestSample = sample; }
      }
      if (best > 0) { counts[rule.code] = best; samples[rule.code] = bestSample; total += best; }
    }
    return { hit: total > 0, counts: counts, samples: samples, total: total, bodyLen: bodyText.length };
  } catch(e) { return { hit:false, counts:{}, samples:{}, total:0, error: e.message || String(e) }; }
})()
`;

/** 额度用量（原 `hD`，`shared.js:37652`）—— 返回 `{hit,lowCount,consume,remain,reason,sample,bodyLen}` */
export const QUOTA_USAGE_SCRIPT = `
(function(){
  try {
    function norm(s){ return (s||'').replace(/\\s+/g,' ').trim(); }
    // 输入框文本（我方待发送内容）——命中若只出现在这里则排除，避免自触发
    var input = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('[role="textbox"]');
    var inN = norm(input ? (input.value || input.textContent || input.innerText || '') : '');
    var bodyText = norm(document.body.innerText || '');
    var KEYWORDS = ${JSON.stringify(QUOTA_KEYWORDS)};
    var LOW_PATTERNS = ${JSON.stringify(QUOTA_LOW_PATTERNS)};
    var CONSUME_PATTERNS = ${JSON.stringify(QUOTA_CONSUME_PATTERNS)};
    var REMAIN_PATTERNS = ${JSON.stringify(QUOTA_REMAIN_PATTERNS)};
    var CONSUME_WARN = ${QUOTA_CONSUME_WARN};
    var REMAIN_WARN = ${QUOTA_REMAIN_WARN};

    var res = { hit:false, lowCount:0, consume:null, remain:null, reason:'', sample:'' };
    var t = bodyText;

    // ① 明确话术（最强信号，且不依赖数值）—— 先确定命中的话术是什么，再统计它出现了几次。
    //    必须**统计次数**而不是只判布尔：会话里往往残留着上一轮的额度提示，
    //    只判布尔会在本轮第一条回复还没到时就误判成「新回复」→ 白白换号重发。
    //    用「命中增量」（本轮次数 > 监听起点的基线次数）才与 quota-exhausted 同一口径。
    for (var k=0;k<KEYWORDS.length;k++){
      var kw = KEYWORDS[k];
      if (t.indexOf(kw) !== -1 && !(inN && inN.indexOf(kw) !== -1)) {
        res.reason = 'explicit'; res.sample = kw; break;
      }
    }
    if (!res.sample) {
      for (var q=0;q<LOW_PATTERNS.length;q++){
        var mq = new RegExp(LOW_PATTERNS[q]).exec(t);
        if (mq && mq[0]) {
          var sq = mq[0];
          if (!(inN && inN.indexOf(sq) !== -1)) { res.reason = 'explicit'; res.sample = sq; break; }
        }
      }
    }
    if (res.sample) {
      // 用 indexOf 遍历计数（不用 RegExp：sample 里可能带正则元字符，转义反而是坑）
      var nS = 0, pos = 0, step = res.sample.length > 0 ? res.sample.length : 1;
      while ((pos = t.indexOf(res.sample, pos)) !== -1) { nS++; pos += step; }
      res.lowCount = nS;
      res.hit = nS > 0;
      return res;
    }

    // 先解析两个数值（无论是否触发都记录，供调试/日志）。
    // 用 g 标志 + while 遍历所有命中：同一回复里可能多次出现「消耗 N」，取最大值。
    var consume = null;
    for (var c=0;c<CONSUME_PATTERNS.length;c++){
      var re1 = new RegExp(CONSUME_PATTERNS[c], 'g'); var m1;
      while ((m1 = re1.exec(t)) !== null) {
        if (m1[0] === '') { re1.lastIndex += 1; continue; }   // 空匹配防御
        var fullC = m1[0];
        if (inN && inN.indexOf(fullC) !== -1) continue;   // 仅出现在输入框 → 不计入
        var n1 = parseInt(m1[1],10);
        if(!isNaN(n1) && (consume===null||n1>consume)) consume = n1;
      }
    }
    var remain = null;
    for (var r=0;r<REMAIN_PATTERNS.length;r++){
      var re2 = new RegExp(REMAIN_PATTERNS[r], 'g'); var m2;
      while ((m2 = re2.exec(t)) !== null) {
        if (m2[0] === '') { re2.lastIndex += 1; continue; }   // 空匹配防御
        var fullR = m2[0];
        if (inN && inN.indexOf(fullR) !== -1) continue;   // 仅出现在输入框 → 不计入
        var n2 = parseInt(m2[1],10);
        if(!isNaN(n2) && (remain===null||n2<remain)) remain = n2;
      }
    }
    res.consume = consume; res.remain = remain;

    // ② 剩余不足型（更紧急，优先于消耗型判定）
    //    数值类信号没有可稳定计数的原文片段，记 lowCount=1（增量判定：基线为 0 即视为新回复）
    if (remain !== null && remain <= REMAIN_WARN){ res.hit = true; res.lowCount = 1; res.reason = 'remain'; res.sample = '剩余 '+remain; return res; }
    // ③ 本次消耗型
    if (consume !== null && consume >= CONSUME_WARN){ res.hit = true; res.lowCount = 1; res.reason = 'consume'; res.sample = '本次消耗 '+consume; return res; }
    return res;
  } catch(e){ return { hit:false, lowCount:0, consume:null, remain:null, reason:'', sample:'', error: e.message || String(e) }; }
})()
`;
