/**
 * Dola「30s 强开」—— 页内交互三件（原 `Mt`/`zt`/`Rt`）＋ 两个页内脚本（原 `JP`/`QP`）
 *
 * 依据：`_Component43.jsx:758-806`（`Mt`/`zt`/`Rt`）· `shared.js:34754-35352`（`Yc`/`YP`/`XP`/`JP`/`QP`）。
 *
 * ★ **它解决什么**：Dola 面板原生只给到 **15s**。这条链用**两道**手段把时长顶到 **16-30s**：
 *   ① **网络层**（`JP`）：给页面装 fetch/XHR 包装 —— 命中 `/chat/completion` 且报文含
 *      `chat_ability[ability_type=17]` 时，把请求体里的 `duration`/`model` 改成目标值（**一次性**：
 *      改写成功即 `consume` 清配置，不影响该 webview 之后的手动聊天）。
 *   ② **面板层**（`QP`）：DOM 自动化 —— 点开「视频生成」技能 → 选 Seedance 2.5 → 选目标时长。
 *      它只是**尽力**（`ok:false` 也算正常），**兜底始终是网络层**。
 *
 * 时序（逐行对源）：
 *   `enableDolaForce30s`（发送前）→ 装 `JP` ＋ 写配置 `window[DOLA_FORCE_KEY] = XP(duration)`
 *   → `runDolaForcePanelUi`（发送中 Phase 2d）→ 跑 `QP`
 *   → `scheduleDolaForceCleanup`（发送后 3s）→ `delete window[DOLA_FORCE_KEY]`
 *
 * ⚠️ **这是"注入"**（装 fetch 包装 ＋ 写窗口全局 ＋ 点 DOM）。它与 `docs/过程.md #2` 禁的那类**不同**：
 *   那条禁的是改 `navigator`/`screen`/`webgl` 的**指纹伪装**；本链是**产品功能**（原版就这么干），
 *   改动面 = 本次发送的那一次请求 ＋ 页面自身的控件。仍**只在目标账号／目标参数**上启用（见 `isDolaForceTarget`）。
 * ⚠️ **失败一律不抛**（照源）：注入失败 ⇒ `enableDolaForce30s` 返 `false`（走常规链路发送）。
 * ⚠️ **版本兼容风险高**：`JP`/`QP` 逐字对齐 Dola 的报文形状与面板 DOM ⇒ **别改它们**（改就是重新发明）。
 *    —— 唯一可改的是 `JP` 里**判站点域名**那一处：值随调用载荷喂入（见 `JP` 头注），脚本里不许再写域名。
 */
import { isDolaForceTarget } from '@/core/rules/dolaForce';
import type { SiteType } from '@/stable/model/account';
import { log } from '@/lib/log';
// ★ 站点域名的**值**（层 1 真源）—— 只用于**喂给页内脚本**，脚本里没有域名字面量（`TD-05-12`）
import { SITE_HOSTS } from '@/constants/siteHosts';
import { webviewEval, type WebviewElement } from '../shared/webview';

/** 配置写进页面的键名（原 `Yc`，`shared.js:34754`） */
const DOLA_FORCE_KEY = '__DOLA_CANVAS_FORCE__';

/** 配置有效期（ms，原 `YP`，`shared.js:34755` = 90000）—— 到期 `cfg()` 自动作废并自删 */
const DOLA_FORCE_TTL_MS = 90000;

/** 面板 UI 自动化的返回（原 `QP` 的返回值；形状宽松 —— 源直接把它透进诊断串） */
interface DolaForceUiResult {
  ok?: boolean;
  reason?: string;
  [k: string]: unknown;
}

/** 页面里的强开配置（原 `XP` 的产物，`shared.js:34756`） */
interface DolaForceConfig {
  duration: number;
  model: string;
  expires: number;
}

/**
 * 造配置对象（原 `XP`，`shared.js:34756`）
 *
 * ⚠️ 默认模型是 **`seedance_v2.5`（下划线）** —— 那是**接口报文**里的形态（`JP` 的 `patchAbility`
 *   拿它跟 `ability_param.model` 比对）；而**闸**（`isDolaForceTarget`）用的是 `seedance-2.5`
 *   （连字符，UI 形态）⇒ 两种写法**都照源保留**，别"统一"。
 */
function buildDolaForceConfig(
  duration: number,
  model = 'seedance_v2.5',
  now: number = Date.now(),
): DolaForceConfig {
  return {
    duration: Math.round(Number(duration) || 0),
    model,
    expires: now + DOLA_FORCE_TTL_MS,
  };
}

/** 写配置的页内脚本（原 `Mt` 的第二段注入：`window["KEY"] = {...}; true`） */
function buildDolaForceCfgScript(duration: number): string {
  const cfg = JSON.stringify(buildDolaForceConfig(duration));
  return `window[${JSON.stringify(DOLA_FORCE_KEY)}] = ${cfg}; true`;
}

/** 删配置的页内脚本（原 `zt`：`try{delete window["KEY"]}catch(e){}; true`） */
function buildDolaForceCleanupScript(): string {
  return `try{delete window[${JSON.stringify(DOLA_FORCE_KEY)}]}catch(e){}; true`;
}

/**
 * ★ 闸 `isDolaForceTarget` **已搬到 `core/rules/dolaForce.ts`** —— 它是纯判据（入参 = 账号类型 + params，
 *   不掺环境），住 `adapters` 就**只能不测**（`adapters/` 下不许有测试文件）。调用方从 `@/core/rules/dolaForce` 引。
 */

/**
 * 页内脚本执行（**等价于源的 `ze`**，`_Component43.jsx:542-556`）
 *
 * ⚠️ 源 `ze` 的失败语义：**不抛**，返 `{ _execError: true, error }`（只有"webview 不可用"才抛）
 *   ⇒ 这里照抄：脚本自己报错时调用方**拿不到异常**（`enableDolaForce30s` 因此仍返回 `true`）。
 *   **逐字对源，别"修正"**。
 */
async function execJs(view: WebviewElement, script: string, label: string): Promise<unknown> {
  try {
    return await webviewEval(view, script);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`[DolaCanvas30s] execJS(${label}) 失败: ${msg}`);
    return { _execError: true, error: msg };
  }
}

/**
 * **发送前**装强开（原 `Mt`，`_Component43.jsx:758-772`）
 *
 * @returns `true` = 强开就绪（发送结束后**必须** `scheduleDolaForceCleanup`）；`false` = 非目标／注入失败
 */
export async function enableDolaForce30s(
  view: WebviewElement | null,
  kind: SiteType,
  params: Record<string, unknown> | null | undefined,
): Promise<boolean> {
  if (!view || !isDolaForceTarget(kind, params)) return false;
  const dur = Number((params ?? {}).duration) || 0;
  try {
    // ★ **域名的值随调用载荷喂入**（脚本是函数表达式、自己跑不动）—— 值住层 1 `constants/siteHosts`
    await execJs(view, `(${DOLA_FORCE_SCRIPT})(${JSON.stringify(SITE_HOSTS)})`, 'dola-force-patch');
    await execJs(view, buildDolaForceCfgScript(dur), 'dola-force-cfg');
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`[DolaCanvas30s] 强开注入失败（按常规链路发送）: ${msg}`);
    return false;
  }
}

/**
 * **发送后** 3s 删配置（原 `zt`，`_Component43.jsx:773-779`）—— **fire-and-forget**（源不 await）
 *
 * ⚠️ 与 `enableDolaForce30s` 是**一对**（M4：作用域即配对）⇒ 调用点必须落在 `finally` 里。
 *   漏了清理会让残留配置劫持**下一次非强开**的发送（`JP` 的 `cfg()` 只按 `duration>=16` ＋ 未过期判）。
 */
export function scheduleDolaForceCleanup(view: WebviewElement | null): void {
  if (!view) return;
  setTimeout(() => {
    // 失败**无补救**（源也是空 `catch{}`）：配置另有 `expires` 兜底自失效
    void execJs(view, buildDolaForceCleanupScript(), 'dola-force-cleanup');
  }, 3000);
}

/**
 * **发送中**（Phase 2d）跑面板 UI 自动化（原 `Rt`，`:780-806`）
 *
 * ⚠️ 返回对象**原样转发**（源直接把 `QP` 的返回透出去）—— 含 `QP` 自己的 `{_execError}` 形态。
 */
export async function runDolaForcePanelUi(view: WebviewElement | null): Promise<DolaForceUiResult> {
  if (!view || typeof view.executeJavaScript !== 'function') return { ok: false, reason: 'no-wv' };
  try {
    const r = await execJs(view, DOLA_FORCE_UI_SCRIPT, 'dola-force-ui');
    log.info('[DolaCanvas30s] 面板 UI 自动化结果', r);
    if (r && typeof r === 'object') return r as DolaForceUiResult;
    return { ok: false, reason: 'bad-return' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`[DolaCanvas30s] 面板 UI 自动化注入失败（网络层兜底）: ${msg}`);
    return { ok: false, reason: 'inject-fail', note: msg };
  }
}

/**
 * 网络层强开补丁（原 `JP`，`shared.js:34763-34905`）—— **逐字搬入**（只把 `${Yc}` 换成 `DOLA_FORCE_KEY`）
 *
 * ⚠️ **别改**：它逐字段对齐 Dola 的 `/chat/completion` 报文（`chat_ability[ability_type=17]` 等）。
 *
 * ★ **本件是函数表达式，不是自执行脚本**：域名的**值**不在这里 —— 注入时由调用方把层 1 真源
 *   （`constants/siteHosts`）当参数喂进来（同 `electron/dola-duration-main.js` 的**宿主传参**先例）。
 *   ⇒ 本字符串里**不许写域名**；`slice(-9)` 式**手写后缀长度**在这里**没有位置**
 *   （换域／加子域会静默失效，判定恒假无痕 —— `TD-05-12`）。
 *   ⚠️ 为什么不能 import：注入脚本跑在 guest 主世界，够不着渲染侧的模块系统。
 *   ⚠️ 留的这份是**判定形状**（与 `core/rules/siteHost`、主进程 `site-hosts.js` 同口径）——
 *      跨世界消不掉，登记为残留（见 `docs/判据登记表.md` §3「渲染侧站点域名」行）。
 */
const DOLA_FORCE_SCRIPT = `(function (SITE_HOSTS) {
  if (typeof window === 'undefined') return false;
  if (window.__dolaCanvasForceInstalled) return true;
  window.__dolaCanvasForceInstalled = true;
  var KEY = '${DOLA_FORCE_KEY}';
  // host 归一化（去 www. 前缀 + 去尾点 + 小写）—— 与 core/rules/siteHost 同口径
  function normalizeHost(raw) {
    return String(raw || '').replace(/^www\\./i, '').replace(/\\.$/, '').toLowerCase();
  }
  // 某个 host 是不是某个源（含子域）—— 域名的**值**全部来自注入的 SITE_HOSTS
  function isHostOf(host, source) {
    var bases = SITE_HOSTS[source];
    if (!bases) return false;
    for (var i = 0; i < bases.length; i++) {
      var base = bases[i];
      if (host === base || host.endsWith('.' + base)) return true;
    }
    return false;
  }
  function cfg() {
    var c = null;
    try { c = window[KEY]; } catch (e) { return null; }
    if (!c || typeof c !== 'object') return null;
    if (c.expires && Date.now() > Number(c.expires)) {
      try { delete window[KEY]; } catch (e2) {}
      return null;
    }
    var d = Math.round(Number(c.duration) || 0);
    if (d < 16) return null; // 只在 16-30s 强开时启用（<16s 走常规链路）
    return c;
  }
  function consume() { try { delete window[KEY]; } catch (e) {} }
  function isTargetUrl(u) {
    try {
      var x = new URL(String(u), location.href);
      var h = normalizeHost(x.hostname);
      // 两个源都判：闸（isDolaForceTarget）只放行 dola 账号，但 dola 页面的请求也落在**豆包系域**上（源如此）
      if (!isHostOf(h, 'dola') && !isHostOf(h, 'doubao')) return false;
      // 路径以 /chat/completion 结尾即命中（兼容 /api/chat/completion 等前缀变体）；
      // 误伤面为零 —— 后续还要求 body 是 JSON 且含 chat_ability[ability_type=17]
      return /\\/chat\\/completion$/.test(x.pathname.replace(/\\/+$/, ''));
    } catch (e) {
      return /\\/chat\\/completion(?:\\?|$)/.test(String(u));
    }
  }
  function parseMaybeJson(v) {
    if (v && typeof v === 'object') return { obj: v, wasStr: false };
    if (typeof v === 'string' && v.trim()) {
      try { return { obj: JSON.parse(v), wasStr: true }; } catch (e) {}
    }
    return null;
  }
  // 剥尾部话术（循环到收敛，幂等）：--模型尾标 / duration=N 尾标 / 「，N秒」尾标
  function cleanTail(s) {
    var out = String(s);
    var before;
    var guard = 0;
    do {
      before = out;
      out = out.replace(/[，,、]?\\s*--模型[：:][^，,\\n]*$/, '');
      out = out.replace(/[，,、]\\s*duration\\s*=\\s*\\d+\\s*$/i, '');
      out = out.replace(/[，,、]\\s*(?:1[0-9]|2[0-9]|30|[4-9])\\s*(?:s|秒)\\s*$/i, '');
      out = out.replace(/[\\s，,、]+$/, '');
      guard += 1;
    } while (out !== before && guard < 6);
    return out;
  }
  function walk(o, seen) {
    if (!o || typeof o !== 'object' || seen.indexOf(o) !== -1) return false;
    seen.push(o);
    var changed = false;
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) if (walk(o[i], seen)) changed = true;
      return changed;
    }
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      var v = o[k];
      if (typeof v === 'string' && v.length > 24) {
        var nv = cleanTail(v);
        if (nv && nv !== v) { o[k] = nv; changed = true; }
      } else if (v && typeof v === 'object') {
        if (walk(v, seen)) changed = true;
      }
    }
    return changed;
  }
  // 改写 ability_type=17 的 ability_param（视频生成能力）→ 强开模型与时长
  function patchAbility(entry, target) {
    if (!entry || typeof entry !== 'object') return false;
    if (Number(entry.ability_type) !== 17) return false;
    var p = parseMaybeJson(entry.ability_param);
    if (!p) return false;
    var ch = false;
    var model = String(target.model || '');
    if (model && String(p.obj.model || '') !== model) { p.obj.model = model; ch = true; }
    var dur = Math.round(Number(target.duration) || 0);
    if (dur >= 16 && Number(p.obj.duration) !== dur) { p.obj.duration = dur; ch = true; }
    if (ch) entry.ability_param = p.wasStr ? JSON.stringify(p.obj) : p.obj;
    return ch;
  }
  function patchBody(bodyStr) {
    var c = cfg();
    if (!c || typeof bodyStr !== 'string' || !bodyStr.trim()) return null;
    var body;
    try { body = JSON.parse(bodyStr); } catch (e) { return null; }
    if (!body || typeof body !== 'object') return null;
    var changed = false;
    var ab = body.chat_ability;
    var list = Array.isArray(ab) ? ab : (ab ? [ab] : []);
    for (var i = 0; i < list.length; i++) if (patchAbility(list[i], c)) changed = true;
    if (walk(body, [])) changed = true;
    if (!changed) return null;
    consume(); // one-shot：改写一次即失效，不影响该 webview 后续手动聊天
    try { console.info('[DolaCanvas30s] 已强开', { duration: Number(c.duration), model: c.model }); } catch (e2) {}
    return JSON.stringify(body);
  }
  // fetch 包装
  var of = window.fetch;
  if (typeof of === 'function' && !of.__dolaCanvasForce) {
    var pf = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && (input.url || input.href));
        if (init && Object.prototype.hasOwnProperty.call(init, 'body') && typeof init.body === 'string' && isTargetUrl(url)) {
          var nb = patchBody(init.body);
          if (nb) {
            var ni = {};
            for (var k in init) { if (Object.prototype.hasOwnProperty.call(init, k)) ni[k] = init[k]; }
            ni.body = nb;
            return of.call(this, input, ni);
          }
        }
      } catch (e) {}
      return of.apply(this, arguments);
    };
    pf.__dolaCanvasForce = true;
    window.fetch = pf;
  }
  // XMLHttpRequest 包装
  try {
    var xp = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (xp && !xp.__dolaCanvasForce) {
      var xo = xp.open, xs = xp.send;
      xp.open = function (m, u) { this.__dolaCanvasForceM = m; this.__dolaCanvasForceU = u; return xo.apply(this, arguments); };
      xp.send = function (b) {
        try {
          if (String(this.__dolaCanvasForceM || '').toUpperCase() === 'POST' && typeof b === 'string' && isTargetUrl(this.__dolaCanvasForceU)) {
            var nb = patchBody(b);
            if (nb) return xs.call(this, nb);
          }
        } catch (e) {}
        return xs.apply(this, arguments);
      };
      xp.__dolaCanvasForce = true;
    }
  } catch (e2) {}
  return true;
})`;

/**
 * 面板 UI 自动化（原 `QP`，`shared.js:34906-35352`）—— **逐字搬入**（只把 `${Yc}` 换成 `DOLA_FORCE_KEY`）
 *
 * ⚠️ **别改**：它逐选择器对齐 Dola 面板 DOM（`data-input-engine-actionbar-control-key` 等）。
 */
const DOLA_FORCE_UI_SCRIPT = `(async function () {
  var KEY = '${DOLA_FORCE_KEY}';
  function cfg() {
    var c = null;
    try { c = window[KEY]; } catch (e) { return null; }
    if (!c || typeof c !== 'object') return null;
    if (c.expires && Date.now() > Number(c.expires)) { try { delete window[KEY]; } catch (e2) {} return null; }
    var d = Math.round(Number(c.duration) || 0);
    if (d < 16) return null; // 只在 16-30s 强开时启用
    return c;
  }
  var c = cfg();
  if (!c) return { ok: false, reason: 'disabled' };
  var target = Math.round(Number(c.duration) || 0);

  // 幂等：同一 webview 同一目标、且上次**已成功** → 跳过（防止 runSilentSend 重试时重复点菜单）；
  // 上次失败则允许重跑（"视频生成"技能激活后面板才出现，重跑才有意义）。
  var DONE_KEY = '__dolaCanvasForceUIState__';
  try {
    var prevSt = window[DONE_KEY];
    if (prevSt && prevSt.t === target && prevSt.ok) {
      return { ok: true, reason: 'already', model: true, duration: true, via: 'cache', target: target };
    }
  } catch (e) {}

  function norm(t) { return String(t || '').replace(/\\s+/g, ' ').trim(); }
  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    try {
      var s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    } catch (e) {}
    return true;
  }
  function parseSec(s) {
    var m = norm(s).match(/(?:^|[^\\d])([4-9]|1[0-9]|2[0-9]|30)\\s*(?:s|秒)?\\b/i);
    return m ? parseInt(m[1], 10) : 0;
  }
  function visibleEls(root, sel) {
    var out = [];
    try {
      var nodes = (root || document).querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) if (isVisible(nodes[i])) out.push(nodes[i]);
    } catch (e) {}
    return out;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
  function waitFor(fn, timeout, interval) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function tick() {
        var r = null; try { r = fn(); } catch (e) { r = null; }
        if (r) return resolve(r);
        if (Date.now() - start >= (timeout || 4000)) return resolve(null);
        setTimeout(tick, interval || 80);
      })();
    });
  }
  function fireKey(el, key) {
    try {
      var o = { bubbles: true, cancelable: true, key: key, code: key };
      el.dispatchEvent(new KeyboardEvent('keydown', o));
      el.dispatchEvent(new KeyboardEvent('keyup', o));
      return true;
    } catch (e) { return false; }
  }
  function clickEl(el) {
    try { el.click(); return true; } catch (e) {
      try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; } catch (e2) { return false; }
    }
  }
  // 打开一个控件（trigger），等待菜单项出现后返回候选列表
  async function openAndGetItems(control, timeout) {
    clickEl(control);
    var items0 = scanItems();
    if (items0.length) return items0;
    // 触发键失败则补一发 pointerdown + mousedown
    try {
      var r = control.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      ['pointerdown', 'mousedown', 'click'].forEach(function (t) {
        try {
          var Ctor = t.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
          control.dispatchEvent(new Ctor(t, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: t === 'click' ? 0 : 1 }));
        } catch (e3) {}
      });
    } catch (e) {}
    return waitFor(scanItems, timeout || 1600, 80);
  }
  function scanItems() {
    var s = visibleEls(document, '[role="menuitem"],[role="option"],[data-radix-collection-item],[data-slot="dropdown-menu-item"],[data-slot="dropdown-menu-radioitem"]');
    if (s.length) return s;
    // Dola 实测：时长下拉（Radix）的菜单项没有 role，只是一行 div，文本恰为 "5s"/"10s"/"30s"。
    // 兜底策略：取「自身文本恰为 数字+秒、且没有同文本子元素」的最小元素（最深叶子），
    // 并排除 composer 自身（#input-engine-container 里的时长按钮是触发器，不是菜单项）。
    var out = [], seen = [];
    var all = visibleEls(document, 'div,li,button,[role="menuitem"],[role="option"],[tabindex]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest && el.closest('#input-engine-container')) continue;
      var t = norm(el.textContent || '');
      if (!/^(?:[4-9]|1[0-9]|2[0-9]|30)s*(?:s|秒)?$/i.test(t) || t.length > 4) continue;
      var kids = el.children || [], deeper = false;
      for (var c = 0; c < kids.length; c++) { if (norm(kids[c].textContent || '') === t) { deeper = true; break; } }
      if (deeper) continue;
      if (seen.indexOf(el) === -1) { seen.push(el); out.push(el); }
    }
    return out;
  }

  // —— 视频生成技能激活（关键前置）——
  // Dola 默认停在"快速(聊天)"模式：此时聊天界面**没有** video-model/video-duration 控件
  // （这正是「参数面板同步不过去」的来由），请求走对话模型 → 回复「视频生成最长支持 15 秒」
  // 或直接出一段默认 5s。必须像用户一样点一下 composer 的视频生成技能入口，参数面板
  // 才会出现，请求才会带上视频生成能力（ability_type=17）。
  //
  // 实测 Dola 真实 DOM（~/dola-duration-debug.log 里 DUMP 的 containerHTML）：
  //   技能已激活时 actionbar 里有一枚 chip：
  //     <div data-input-engine-action-source="actionbar" data-value="17">影片生成<svg close/></div>
  //   ★ 文案会随地区/国家变化（实测见过「影片生成」「视频生成」，海外号可能是英文等），
  //     但 data-value="17" 是稳定的「视频能力 id」（与网络层 ability_type===17 同源，服务端字段，
  //     不随本地化变化）——所以定位视频技能入口必须用 data-value="17"，不能靠文案。
  //   ★ 已激活态该 chip 被 .bg-g-exit-skill-btn-bg 容器包裹且含关闭按钮；chat 模式下它只是
  //     一枚带 data-value="17" 的「入口」chip（无 exit 容器/无关闭按钮）——靠 looksActive 区分。
  //   ★ 同时出现一枚显示 "30s" 的时长按钮，点开是 Radix 下拉（5s/10s/30s 选项，菜单项无 role）。
  var SKILL_LABELS = ['影片生成', '视频生成', '图生视频', '文生视频'];
  function composerRoot() { try { return document.querySelector('#input-engine-container') || document; } catch (e) { return document; } }
  // 时长按钮：composer actionbar 里显示 "30s"/"10s" 这类值的按钮
  function findDurationButton() {
    var btns = visibleEls(composerRoot(), 'button,[role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var t = norm(btns[i].textContent || '');
      if (/^(?:[4-9]|1[0-9]|2[0-9]|30)s*(?:s|秒)$/i.test(t)) return btns[i];
    }
    return null;
  }
  function hasParamControls() {
    try {
      if (document.querySelector('[data-input-engine-actionbar-control-key="video-model"],[data-input-engine-actionbar-control-key="video-duration"],[data-input-engine-actionbar-control-key*="duration"],[data-creation-params-panel-id],[data-input-engine-actionbar-render-entry-key="video-generation-params-panel"]')) return true;
    } catch (e) {}
    try {
      var ctrls = document.querySelectorAll('[data-input-engine-actionbar-control-key]');
      for (var i = 0; i < ctrls.length; i++) {
        var k = String(ctrls[i].getAttribute('data-input-engine-actionbar-control-key') || '').toLowerCase();
        if (k.indexOf('model') >= 0 || k.indexOf('duration') >= 0) return true;
      }
    } catch (e) {}
    // Dola 实测信号①：视频生成技能「已激活」的 actionbar chip（data-value=17 且处于 exit 态）。
    // 注意：仅 data-value=17 存在不够——chat 模式里视频技能「入口」chip 也可能带该属性，
    // 故必须确认它是激活态（被 exit-skill 容器包裹 / 含关闭按钮），否则会误判"已在视频模式"而不去点。
    try {
      var av = document.querySelector('[data-input-engine-action-source="actionbar"][data-value="17"]');
      if (av && looksActive(av)) return true;
    } catch (e) {}
    // Dola 实测信号②：composer 里出现 "Ns" 时长按钮（仅视频模式有）
    try { if (findDurationButton()) return true; } catch (e) {}
    return false;
  }
  function ownTextNorm(el) {
    var t = '';
    try { for (var n = 0; n < el.childNodes.length; n++) { if (el.childNodes[n].nodeType === 3) t += el.childNodes[n].nodeValue || ''; } } catch (e) {}
    return norm(t);
  }
  // 该 chip 是否已处于"激活"态（被 exit-skill 容器包裹 / 自身含关闭按钮×）——激活态不能再点（会关掉技能）。
  // 关键：不能仅凭 data-input-engine-action-source+data-value 判定激活——chat 模式下视频技能「入口」chip
  // 也可能带 data-value=17，必须确认它处于 exit（已激活）态，否则会把"入口"误判为"已激活"而不去点。
  function looksActive(el) {
    try {
      if (el.closest && el.closest('.bg-g-exit-skill-btn-bg,[class*="exit-skill"]')) return true;
      if (el.querySelector && el.querySelector('[class*="exit-skill-close"],[class*="close-btn-icon"]')) return true;
    } catch (e) {}
    return false;
  }
  // 找 composer 里的视频生成技能入口，用于点它把 Dola 切到视频模式。
  // 主路径（地区/语言无关）：用稳定的「视频能力 id=17」定位 actionbar chip——
  // data-value=17 与网络层 ability_type===17 同源（服务端 ability type，不是本地化文案），
  // 不论 Dola 在哪个国家/地区、文案是"影片生成/视频生成/Video…"都认同一个技能。
  // 兜底（个别 Dola 变体未暴露 data-value 时）：回退到技能名文本（会随地区变化，仅作安全网）。
  function findVideoSkillChips() {
    var out = [], seen = [];
    function push(el, active) { if (el && seen.indexOf(el) === -1) { seen.push(el); out.push({ el: el, active: !!active }); } }
    // 主路径：data-value=17 的 actionbar chip（视频技能稳定标识，不随地区变化）
    var byVal = visibleEls(document, '[data-input-engine-action-source="actionbar"][data-value="17"]');
    for (var i = 0; i < byVal.length; i++) push(byVal[i], looksActive(byVal[i]));
    if (out.length) return out;
    // 兜底：技能名文本（影片生成/视频生成/图生视频/文生视频…，随地区变化，仅安全网）
    var all = visibleEls(document, '[role="tab"],button,[role="button"],a,div,span');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      if (el.closest && el.closest('[role="menu"],[data-radix-popper-content-wrapper],[role="dialog"]')) continue;
      var ot = ownTextNorm(el);
      for (var k = 0; k < SKILL_LABELS.length; k++) {
        var lb = SKILL_LABELS[k];
        if (ot.indexOf(lb) === -1) continue;
        if (ot.replace(lb, '').length <= 2) push(el, looksActive(el));
        break;
      }
    }
    var tabs = visibleEls(document, '[role="tab"]');
    for (var m = 0; m < tabs.length; m++) {
      var tx = norm(tabs[m].textContent || '');
      for (var n = 0; n < SKILL_LABELS.length; n++) { if (tx.indexOf(SKILL_LABELS[n]) !== -1) { push(tabs[m], false); break; } }
    }
    return out;
  }
  function composerButtonTexts() {
    var out = [];
    var els = visibleEls(composerRoot(), 'button,[role="button"],[role="tab"],[data-input-engine-actionbar-control-key],[data-input-engine-action-source="actionbar"]');
    for (var i = 0; i < els.length && out.length < 30; i++) {
      var t = norm(els[i].textContent || '');
      if (t && t.length <= 20) out.push(t);
    }
    return out;
  }
  async function ensureVideoMode() {
    if (hasParamControls()) return { ok: true, via: 'already' };
    var chips = findVideoSkillChips();
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].active) continue; // 已激活态别点（会把技能关掉）
      clickEl(chips[i].el);
      var got = await waitFor(function () { return hasParamControls() ? true : null; }, 2600, 130);
      if (got) return { ok: true, via: 'click', chips: chips.length };
    }
    return { ok: false, reason: chips.length ? 'clicked-but-no-panel' : 'no-video-chip', chips: chips.length, buttons: composerButtonTexts() };
  }

  // —— 模型控件：video-model ——
  function findModelControl() {
    var c = document.querySelector('[data-input-engine-actionbar-control-key="video-model"]');
    if (c && isVisible(c)) return c;
    var root = document.querySelector('#input-engine-container') || document;
    var cands = visibleEls(root, 'button,[role="button"],[aria-haspopup="menu"]');
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].closest && cands[i].closest('[role="menu"]')) continue;
      var t = norm(cands[i].textContent);
      if (/模型|Seedance|Fast|Mini|2\\.5|2\\.0/i.test(t) && t.length < 70) return cands[i];
    }
    return null;
  }
  async function clickModel() {
    var ctrl = findModelControl();
    if (!ctrl) return { ok: false, reason: 'no-model-ctrl' };
    var items = await openAndGetItems(ctrl, 1600);
    if (!items || !items.length) return { ok: false, reason: 'no-model-items' };
    // 优先精确"Seedance 2.5"，其次任意含 "2.5" 的项
    var pick = null, pick2 = null;
    for (var i = 0; i < items.length; i++) {
      var t = norm(items[i].textContent);
      if (/2\\.5/.test(t)) { if (!pick2) pick2 = items[i]; if (/seedance/i.test(t)) { pick = items[i]; break; } }
    }
    pick = pick || pick2;
    if (!pick) return { ok: false, reason: 'no-25-item' };
    clickEl(pick);
    await sleep(160);
    return { ok: true };
  }

  // —— 时长控件：video-duration ——
  function findDurationControl() {
    var c = document.querySelector('[data-input-engine-actionbar-control-key*="duration"]') || document.querySelector('[data-input-engine-actionbar-control-key="video-duration"]');
    if (c && isVisible(c)) return c;
    // Dola 的时长下拉是 Radix 原生控件：选项为无 role 的 div.h-38，
    // 触发器本身文本即 "30秒"/"5秒"，故用 findDurationButton 兜底匹配时长按钮
    var db = findDurationButton();
    if (db) return db;
    var root = document.querySelector('#input-engine-container') || document;
    var cands = visibleEls(root, 'button,[role="button"],[aria-haspopup="menu"],div,span');
    for (var i = 0; i < cands.length; i++) {
      var t = norm(cands[i].textContent);
      if (/(?:[4-9]|1[0-9]|2[0-9]|30)s*s/.test(t) && /自动|时长|duration|秒|比例|Auto/i.test(t)) return cands[i];
      if (/自动|时长|duration/i.test(t) && parseSec(t) && t.length < 40) return cands[i];
    }
    return null;
  }
  function findSlider() {
    var s = visibleEls(document, '[role="slider"], input[type="range"]');
    return s.length ? s[0] : null;
  }
  function readDuration() {
    var sliders = visibleEls(document, '[role="slider"], input[type="range"]');
    for (var i = 0; i < sliders.length; i++) {
      var v = Number(sliders[i].getAttribute ? sliders[i].getAttribute('aria-valuenow') : NaN);
      if (!Number.isFinite(v) && sliders[i].value) v = Number(sliders[i].value);
      if (Number.isFinite(v) && v >= 4 && v <= 30) return v;
    }
    var ctrl = findDurationControl();
    if (ctrl) { var s = parseSec(ctrl.textContent); if (s) return s; }
    return 0;
  }
  function rangeFingerprint(slider) {
    var amin = Number(slider.getAttribute ? slider.getAttribute('aria-valuemin') : NaN);
    var amax = Number(slider.getAttribute ? slider.getAttribute('aria-valuemax') : NaN);
    var nmin = Number(slider.min), nmax = Number(slider.max);
    var secMin = Number.isFinite(amin) ? amin : (Number.isFinite(nmin) ? nmin : 4);
    var secMax = Number.isFinite(amax) ? amax : (Number.isFinite(nmax) ? nmax : 30);
    // 文字扫描纠偏（TreeWalker）：26→4-30s／11→4-15s／6→4-10s
    try {
      var secs = [];
      var scope = slider.closest ? (slider.closest('section') || slider.parentElement) : document;
      var tw = document.createTreeWalker(scope || document, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          return /^s*(?:[4-9]|1[0-9]|2[0-9]|30)s*(?:s|秒)?s*$/i.test(n.nodeValue || '')
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      while (tw.nextNode()) { var v = parseSec(tw.currentNode.nodeValue); if (v >= 4 && v <= 30) secs.push(v); }
      if (secs.indexOf(4) >= 0 && secs.indexOf(30) >= 0) { secMin = 4; secMax = 30; }
      else if (secs.indexOf(4) >= 0 && secs.indexOf(15) >= 0) { secMin = 4; secMax = 15; }
      else if (secs.indexOf(4) >= 0 && secs.indexOf(10) >= 0) { secMin = 4; secMax = 10; }
    } catch (e) {}
    return { secMin: secMin, secMax: secMax };
  }
  function setNativeValue(el, val) {
    var proto = (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) ? HTMLInputElement.prototype : HTMLElement.prototype;
    try {
      var d = Object.getOwnPropertyDescriptor(proto, 'value');
      if (d && typeof d.set === 'function') d.set.call(el, String(val)); else el.value = String(val);
    } catch (e) { try { el.value = String(val); } catch (e2) {} }
    try { el.setAttribute('aria-valuenow', String(val)); } catch (e) {}
    try { el.setAttribute('value', String(val)); } catch (e) {}
    var opts = { bubbles: true, cancelable: true };
    try { el.dispatchEvent(new InputEvent('input', Object.assign({ data: String(val), inputType: 'insertReplacementText' }, opts))); }
    catch (e) { try { el.dispatchEvent(new Event('input', opts)); } catch (e2) {} }
    try { el.dispatchEvent(new Event('change', opts)); } catch (e) {}
    return true;
  }
  // 驱动 React 滑杆：优先直接调 __reactProps.onKeyDown（滑杆或 [data-slot=slider] 父级），否则派发键盘事件
  function reactKeyDown(el, key) {
    var els = [el];
    try { var p = el.closest ? (el.closest('[data-slot="slider"]') || el.parentElement) : null; if (p) els.push(p); } catch (e) {}
    for (var i = 0; i < els.length; i++) {
      var node = els[i];
      for (var k in node) {
        if (k.indexOf('__reactProps') === 0) {
          var h = node[k] && node[k].onKeyDown;
          if (typeof h === 'function') {
            try {
              h({ key: key, code: key, target: el, currentTarget: node, preventDefault: function () {}, stopPropagation: function () {}, isDefaultPrevented: function () { return false; }, isPropagationStopped: function () { return false; } });
              return true;
            } catch (e) {}
          }
        }
      }
    }
    return false;
  }
  async function driveSliderKeyboard(slider, target, min, max) {
    min = Number.isFinite(min) ? min : 4; max = Number.isFinite(max) ? max : 30;
    var want = Math.max(min, Math.min(max, target));
    try { slider.focus(); } catch (e) {}
    reactKeyDown(slider, 'Home') || fireKey(slider, 'Home');
    await sleep(70);
    for (var i = min; i < want; i++) { reactKeyDown(slider, 'ArrowRight') || fireKey(slider, 'ArrowRight'); await sleep(45); }
    return readDuration() === want;
  }
  async function clickDuration(t) {
    var ctrl = findDurationControl();
    if (!ctrl) {
      // 没有独立时长控件时，可能已经是滑杆形态，直接尝试驱动滑杆
      var s0 = findSlider();
      if (s0) {
        var fp0 = rangeFingerprint(s0);
        var ok0 = await driveSliderKeyboard(s0, t, fp0.secMin, fp0.secMax);
        if (!ok0) { setNativeValue(s0, Math.max(fp0.secMin, Math.min(fp0.secMax, t))); await sleep(150); }
        return { ok: readDuration() === t || readDuration() >= fp0.secMin, via: 'slider', cur: readDuration() };
      }
      return { ok: false, reason: 'no-duration-ctrl' };
    }
    var items = await openAndGetItems(ctrl, 1600);
    if (items && items.length) {
      // 菜单模式：精确 "30s" → "30 秒" → "30" → 含 target+s/秒 → parseSec 命中
      var pick = null;
      var re1 = new RegExp('^' + t + '\\\\s*(?:s|秒)?$', 'i');
      var re2 = new RegExp(t + '\\\\s*(?:s|秒)');
      for (var i = 0; i < items.length; i++) {
        var t2 = norm(items[i].textContent);
        if (re1.test(t2)) { pick = items[i]; break; }
      }
      if (!pick) for (var j = 0; j < items.length; j++) { if (re2.test(norm(items[j].textContent))) { pick = items[j]; break; } }
      if (!pick) for (var k = 0; k < items.length; k++) { if (parseSec(items[k].textContent) === t) { pick = items[k]; break; } }
      if (pick) { clickEl(pick); await sleep(160); return { ok: readDuration() === t || parseSec(norm(pick.textContent)) === t, via: 'menu', cur: readDuration() }; }
      // 菜单里没有目标秒（区间不足），退而求其次选最大的那个（通常就是该账号支持的上限）
      var best = null, bestSec = -1;
      for (var m = 0; m < items.length; m++) { var sv = parseSec(items[m].textContent); if (sv > bestSec) { bestSec = sv; best = items[m]; } }
      if (best) { clickEl(best); await sleep(160); return { ok: false, reason: 'duration-not-in-range', picked: bestSec, via: 'menu-clamp' }; }
      return { ok: false, reason: 'no-duration-item' };
    }
    // 滑杆模式
    var s = findSlider();
    if (s) {
      var fp = rangeFingerprint(s);
      var ok = await driveSliderKeyboard(s, t, fp.secMin, fp.secMax);
      if (!ok) { setNativeValue(s, Math.max(fp.secMin, Math.min(fp.secMax, t))); await sleep(150); }
      var cur = readDuration();
      return { ok: cur === t, via: 'slider', cur: cur, secMax: fp.secMax };
    }
    return { ok: false, reason: 'no-duration-target' };
  }

  async function main() {
    // 前置：把 Dola 切到「视频生成」技能模式。否则原生参数面板（video-model/video-duration）
    // 根本不存在，无论网络层还是面板层都无从下手——这正是「点了提交还是提示 4-15 秒」的根因。
    var modeRes = { ok: false, reason: 'skip' };
    try { modeRes = await ensureVideoMode(); } catch (e) { modeRes = { ok: false, reason: 'mode-exc:' + (e && e.message || e) }; }

    var modelRes, durRes;
    if (!modeRes.ok) {
      // 没切进视频模式：仍尽力点面板（防御式，控件可能延迟渲染），并把 composer 文本快照带出便于定位。
      try { modelRes = await clickModel(); } catch (e) { modelRes = { ok: false, reason: 'model-exc:' + (e && e.message || e) }; }
      try { durRes = await clickDuration(target); } catch (e) { durRes = { ok: false, reason: 'dur-exc:' + (e && e.message || e) }; }
      var failOut = {
        ok: false,
        reason: 'video-mode-inactive',
        mode: modeRes,
        model: !!(modelRes && modelRes.ok),
        duration: !!(durRes && durRes.ok),
        target: target,
        composerButtons: composerButtonTexts(),
        curDuration: readDuration()
      };
      // 失败不写 ok:true，保留下次重试资格；仅落一次诊断快照。
      try { window[DONE_KEY] = { t: target, ok: false, mode: modeRes.reason, at: Date.now() }; } catch (e2) {}
      return failOut;
    }

    try { modelRes = await clickModel(); } catch (e) { modelRes = { ok: false, reason: 'model-exc:' + (e && e.message || e) }; }
    try { durRes = await clickDuration(target); } catch (e) { durRes = { ok: false, reason: 'dur-exc:' + (e && e.message || e) }; }
    var out = {
      ok: !!(modelRes && modelRes.ok) || !!(durRes && durRes.ok),
      model: !!(modelRes && modelRes.ok),
      duration: !!(durRes && durRes.ok),
      target: target,
      modelReason: (modelRes && modelRes.reason) || null,
      durReason: (durRes && durRes.reason) || null,
      durVia: (durRes && durRes.via) || null,
      curDuration: readDuration(),
      secMax: (durRes && durRes.secMax) || null,
      mode: modeRes.via || 'already'
    };
    // 落状态：成功 → 下次同目标跳过；失败 → 不写 ok:true，允许重试。
    try { window[DONE_KEY] = { t: target, ok: !!(out.ok), mode: modeRes.via || 'already', at: Date.now() }; } catch (e2) {}
    return out;
  }
  try { return await main(); } catch (e) { return { ok: false, reason: 'fatal:' + (e && e.message || e), target: target }; }
})()`;
