#!/usr/bin/env node
/**
 * _lib.cjs —— 逆向脚本共享解析库（纯函数，无 IO）。
 *
 * 为什么要它：03/04/14 都需要「括号配平取整块代码」「注释屏蔽不破坏行号」
 * 「顶层定义索引」「把 minified 局部变量解析回 store 字段/action」。放一处，
 * 避免三个脚本各写一套脆弱的正则（踩坑记录：坑 12 碎片化采集）。
 *
 * ⚠ 关键：统一词法扫描必须识别**正则字面量**。shared.js 里有 `/^https?:\/\//i`，
 * 朴素的 `//` 判断会把 `\/\//` 里的 `//` 当行注释，吞掉后半段代码（旧版 03 就栽在这，
 * 把 57 个非 store 成员当成 action 扫了进来）。
 *
 * 关键能力：
 *   readToken      词法：字符串/模板串/正则/注释 整段识别（其余为 code）
 *   blankComments  注释挖空（保留长度与换行 → 行号不漂移）
 *   balancedEnd    从 `{`/`(`/`[` 配平到闭合符
 *   stmtEnd        取一条语句的结束位置
 *   topLevelDefs   顶层定义索引（const/let/var/function/class → 名称/行号/参数/函数体）
 *   topLevelEntries store 对象字面量的顶层 key:value 扫描
 *   parseButtons   逐 `<button>` 解析标签（属性里带 `=>`/`<`/`>` 也不截断）
 *   buildBindings  组件局部绑定：`L(x=>x.f)` 选择器 / useState 对 / useRef / 局部函数
 *   effectsOf      把一段 handler 代码解析成 effects（store action / state / IPC / DOM / ref）
 *   analyzeComponent 组件级一次提全
 */
'use strict';

// ---------- 词法 ----------

const PAIRS = { '{': '}', '(': ')', '[': ']' };
// 允许出现在「正则字面量」之前的有效前导字符（`<`/`>` 排除：JSX 里 `</div>`、`<br/>` 太常见）
const REGEX_PREV = /[([{,;:=!&|?+*%^~]/;
const KEYWORD_BEFORE_REGEX = /(?:^|[^\w$])(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/;

function prevSignificant(text, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  return j;
}

function isRegexStart(text, i) {
  const j = prevSignificant(text, i);
  if (j < 0) return true;
  const p = text[j];
  if (!REGEX_PREV.test(p)) return false;
  // `a++ / b`、`a-- / b` 是除法，不是正则
  if ((p === '+' || p === '-') && text[j - 1] === p) return false;
  if (/[\w$]/.test(p)) return false;
  return true;
}

// 从正则起始的 `/` 找到闭合 `/`（跳过转义与字符组）；失败 -1。
function regexEnd(text, i) {
  let inClass = false;
  for (let k = i + 1; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') { k++; continue; }
    if (c === '\n') return -1;
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '/') return k;
  }
  return -1;
}

// 返回 { type: 'code'|'string'|'regex'|'comment', end }，end 为该段最后一个字符下标。
function readToken(text, i) {
  const c = text[i];
  if (c === '"' || c === "'" || c === '`') {
    for (let k = i + 1; k < text.length; k++) {
      if (text[k] === '\\') { k++; continue; }
      if (text[k] === c) return { type: 'string', end: k };
    }
    return { type: 'string', end: text.length - 1 };
  }
  if (c === '/' && text[i + 1] === '*') {
    const e = text.indexOf('*/', i + 2);
    return { type: 'comment', end: e < 0 ? text.length - 1 : e + 1 };
  }
  if (c === '/' && text[i + 1] === '/') {
    const e = text.indexOf('\n', i);
    return { type: 'comment', end: e < 0 ? text.length - 1 : e - 1 };
  }
  if (c === '/' && isRegexStart(text, i)) {
    const e = regexEnd(text, i);
    if (e >= 0) return { type: 'regex', end: e };
  }
  return { type: 'code', end: i };
}

function blankComments(text) {
  const out = text.split('');
  let i = 0;
  while (i < text.length) {
    const t = readToken(text, i);
    if (t.type === 'comment') {
      for (let k = i; k <= t.end; k++) if (out[k] !== '\n') out[k] = ' ';
      i = t.end + 1;
    } else if (t.type === 'string' || t.type === 'regex') {
      i = t.end + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

function balancedEnd(text, openIdx) {
  const open = text[openIdx];
  const close = PAIRS[open];
  if (!close) return -1;
  let depth = 0;
  let i = openIdx;
  while (i < text.length) {
    const t = readToken(text, i);
    if (t.type !== 'code') { i = t.end + 1; continue; }
    const c = text[i];
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

function stmtEnd(text, from) {
  let paren = 0;
  let i = from;
  while (i < text.length) {
    const t = readToken(text, i);
    if (t.type !== 'code') { i = t.end + 1; continue; }
    const c = text[i];
    if (c === '(' || c === '[') { paren++; i++; continue; }
    if (c === ')' || c === ']') { paren = Math.max(0, paren - 1); i++; continue; }
    if (paren === 0 && c === '{') { const e = balancedEnd(text, i); return e < 0 ? text.length - 1 : e; }
    if (paren === 0 && (c === ';' || c === '\n')) return i;
    i++;
  }
  return text.length - 1;
}

function lineOf(text, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

// ---------- 顶层定义索引 ----------

// 返回**全部**顶层定义（含重名，按出现顺序）：[{ name, kind, head, line, start, end, body }]
function topLevelDefList(text) {
  const list = [];
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const t = readToken(text, i);
    if (t.type !== 'code') { i = t.end + 1; continue; }
    const c = text[i];
    if (c === '{' || c === '(' || c === '[') { depth++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth = Math.max(0, depth - 1); i++; continue; }
    if (depth === 0 && !/[\w$.]/.test(text[i - 1] || '')) {
      const m = /^(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/.exec(text.slice(i, i + 40));
      if (m) {
        const kind = m[1];
        const name = m[2];
        const headEnd = i + m[0].length;
        let paren = 0;
        let j = headEnd;
        let bodyStart = -1;
        let stmtStop = -1;
        while (j < text.length) {
          const tt = readToken(text, j);
          if (tt.type !== 'code') { j = tt.end + 1; continue; }
          const cc = text[j];
          if (cc === '(' || cc === '[') { paren++; j++; continue; }
          if (cc === ')' || cc === ']') { paren--; j++; continue; }
          if (paren <= 0 && cc === '{') { bodyStart = j; break; }
          if (paren <= 0 && cc === ';') { stmtStop = j; break; }
          j++;
        }
        const end = bodyStart >= 0 ? balancedEnd(text, bodyStart) : stmtStop;
        const headStop = bodyStart >= 0 ? bodyStart : (stmtStop >= 0 ? stmtStop : Math.min(text.length, headEnd + 80));
        const head = text.slice(headEnd, headStop).trim();
        const finalEnd = end < 0 ? headEnd : end;
        list.push({
          name, kind, head: head.slice(0, 120), line: lineOf(text, i),
          start: i, end: finalEnd,
          body: bodyStart >= 0 ? text.slice(bodyStart, finalEnd + 1) : '',
        });
        i = headEnd;
        continue;
      }
    }
    i++;
  }
  return list;
}

// 返回 Map<name, { name, kind, head, line, start, end, body }>（重名取首次出现）
function topLevelDefs(text) {
  const defs = new Map();
  for (const d of topLevelDefList(text)) if (!defs.has(d.name)) defs.set(d.name, d);
  return defs;
}

// 定义是否「像组件」：看形态，不看名字大小写
// （`MA(e, {connectionMode})` 大写开头但只是连接线工具函数，不是组件）
function isComponentDef(d) {
  if (!d) return false;
  if (d.kind === 'class' && /Component/.test(d.head || '')) return true;
  if (/(?:memo|forwardRef|Provider|createPortal)\b/.test(d.head || '')) return true;
  if (/(?:memo|forwardRef|Provider|createPortal)\b/.test(d.body || '')) return true;
  if (/\buse(?:State|Ref|Callback|Memo|Effect|LayoutEffect|Context|Reducer|ImperativeHandle)\s*\(/.test(d.body || '')) return true;
  if (jsxTags(d.body || '').length) return true;
  return false;
}

// ---------- store 对象字面量的顶层 key:value ----------

function topLevelEntries(text, braceIdx) {
  const entries = [];
  let depth = 0;
  let i = braceIdx;
  let key = '';
  let keyStart = false;
  while (i < text.length) {
    const t = readToken(text, i);
    if (t.type !== 'code') { i = t.end + 1; continue; }
    const c = text[i];
    if (c === '{') { depth++; if (depth === 1) { key = ''; keyStart = false; } i++; continue; }
    if (c === '}') { depth--; if (depth === 0) break; i++; continue; }
    if (depth === 1) {
      if (!keyStart && /[A-Za-z_$]/.test(c)) { key = c; keyStart = true; i++; continue; }
      if (keyStart && /[A-Za-z0-9_$]/.test(c)) { key += c; i++; continue; }
      if (keyStart && c === ':') {
        let vDepth = 1;
        let vParen = 0;
        let vBracket = 0;
        let vEnd = -1;
        let k = i + 1;
        while (k < text.length) {
          const tt = readToken(text, k);
          if (tt.type !== 'code') { k = tt.end + 1; continue; }
          const cc = text[k];
          if (cc === '{') vDepth++;
          else if (cc === '}') { vDepth--; if (vDepth === 0) { vEnd = k; break; } }
          else if (cc === '(') vParen++;
          else if (cc === ')') vParen = Math.max(0, vParen - 1);
          else if (cc === '[') vBracket++;
          else if (cc === ']') vBracket = Math.max(0, vBracket - 1);
          else if (cc === ',' && vDepth === 1 && vParen === 0 && vBracket === 0) { vEnd = k; break; }
          k++;
        }
        const stop = vEnd >= 0 ? vEnd : text.length;
        const raw = text.slice(i + 1, stop).trim();
        // 只有「函数值」才算 action；`(() => {...})()` 这类 IIFE 是 state 的初始值
        let isAction = /^(?:async\s*)?(?:function\b|[A-Za-z_$][\w$]*\s*=>|\([^()]*\)\s*=>)/.test(raw);
        let isIife = false;
        if (raw.startsWith('(')) {
          const e = balancedEnd(raw, 0);
          if (e > 0 && /^\s*\(/.test(raw.slice(e + 1))) { isAction = false; isIife = true; }
        }
        entries.push({
          key, raw, line: lineOf(text, i), start: i + 1, end: stop,
          isAction, isIife,
        });
        i = vEnd >= 0 ? vEnd : i + 1;
        key = ''; keyStart = false;
        continue;
      }
      key = ''; keyStart = false;
    }
    i++;
  }
  return entries;
}

// 对象字面量的**顶层 key**（`ident:` 与简写 `ident`），从 `{` 处括号配平扫描。
// 用途：`set({ ... })` 写入的 state 字段必须取顶层 key —— 旧版用非贪婪正则会停在
// 嵌套 `{}` 上（`imageGenKeyNode: { ...(l.imageGenKeyNode || {}) }` 直接截断），
// 于是 imageGenKeyTarget / imageGenJobNode 这类字段整行漏掉。
function objectKeys(text, braceIdx) {
  const keys = [];
  let bd = 0;              // 花括号深度（对象嵌套）
  let pd = 0;              // 圆/方括号深度（值里的调用、数组、计算键）
  let expectKey = true;    // 当前是否处于「等 key」位置
  let key = '';
  let keyStart = false;
  let i = braceIdx;
  while (i < text.length) {
    const t = readToken(text, i);
    if (t.type !== 'code') { i = t.end + 1; continue; }
    const c = text[i];
    if (c === '{') { bd++; if (bd === 1) { expectKey = true; key = ''; keyStart = false; } i++; continue; }
    if (c === '}') {
      if (bd === 1 && keyStart && key) keys.push(key);   // 简写 `{ a }`
      bd--;
      if (bd === 0) break;
      i++;
      continue;
    }
    if (c === '(' || c === '[') { pd++; i++; continue; }
    if (c === ')' || c === ']') { pd = Math.max(0, pd - 1); i++; continue; }
    if (bd === 1 && pd === 0) {
      if (c === ',') {
        if (keyStart && key) keys.push(key);             // 简写 `{ a, b }`
        expectKey = true; key = ''; keyStart = false;
        i++;
        continue;
      }
      if (c === ':') {
        if (expectKey) {
          if (keyStart && key) keys.push(key);           // `a: …`
          expectKey = false;
        }
        key = ''; keyStart = false;
        i++;
        continue;
      }
      if (expectKey) {
        if (!keyStart && /[A-Za-z_$]/.test(c)) {
          if (text.slice(Math.max(0, i - 3), i) === '...') { i++; continue; }  // 展开属性不是 key
          key = c; keyStart = true; i++; continue;
        }
        if (keyStart && /[A-Za-z0-9_$]/.test(c)) { key += c; i++; continue; }
        if (keyStart) { key = ''; keyStart = false; }
      }
    }
    i++;
  }
  return keys;
}

// JSX 标签扫描：跳过字符串/模板串/正则/注释（避免 `<iframes` 这类模板串误判），
// 返回 [{ tag, line }]。
function jsxTags(text) {
  const out = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    const t = readToken(text, i);
    if (t.type !== 'code') {
      for (let k = i; k <= t.end; k++) if (text[k] === '\n') line++;
      i = t.end + 1;
      continue;
    }
    if (c === '<') {
      const m = /^<([A-Za-z_$][\w$.-]*)/.exec(text.slice(i, i + 60));
      if (m) { out.push({ tag: m[1], line }); i += m[0].length; continue; }
    }
    i++;
  }
  return out;
}

// 文件内 import 解析：返回 { jsx: Map<tag, file>, shared: Set<name> }
function importsOf(text) {
  const jsx = new Map();
  const shared = new Set();
  let m;
  const defRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']\.\/([\w$-]+)\.jsx["']/g;
  while ((m = defRe.exec(text))) jsx.set(m[1], m[2]);
  const defSharedRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']\.\/shared\.js["']/g;
  while ((m = defSharedRe.exec(text))) shared.add(m[1]);
  const namedRe = /import\s*\{([^}]*)\}\s*from\s*["']\.\/([\w$-]+)\.(jsx|js)["']/g;
  while ((m = namedRe.exec(text))) {
    const names = m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean);
    if (m[3] === 'jsx') for (const n of names) jsx.set(n, m[2]);
    else for (const n of names) shared.add(n);
  }
  return { jsx, shared };
}

// 文本里出现过的「定义名」（任意深度：function/class/const/let/var）。
// 用途：判断一个 JSX 标签是否是**本文件内部的局部组件**，避免误报「未解析」。
function definedNames(text) {
  const out = new Set();
  let m;
  const a = /\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = a.exec(text))) out.add(m[1]);
  const b = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = b.exec(text))) out.add(m[1]);
  return out;
}

// 组件签名里的解构 props：`({ style: e, CustomComponent: _Component9 }) =>` →
// Map<局部名, prop 名>。用途：识别「由父组件传入的组件」标签（如 `<_Component9/>`），
// 这类标签在本文件里找不到定义是**正常**的，不该报「未解析」。
function destructuredProps(text) {
  const out = new Map();
  const re = /(?:function\s*[A-Za-z_$][\w$]*\s*|function\s*|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)\(\s*\{([^}]*)\}\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    for (const raw of m[1].split(',')) {
      const s = raw.trim();
      if (!s) continue;
      const eq = s.split('=')[0].trim();
      const parts = eq.split(':');
      const key = parts[0].trim();
      const local = (parts[1] || parts[0]).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(key) && /^[A-Za-z_$][\w$]*$/.test(local)) out.set(local, key);
    }
  }
  return out;
}

// ---------- 按钮 / handler ----------

function parseButtons(text) {
  const out = [];
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(text))) {
    const tagStart = m.index;
    let brace = 0;
    let tagEnd = -1;
    let i = tagStart + 7;
    while (i < text.length) {
      const t = readToken(text, i);
      if (t.type !== 'code') { i = t.end + 1; continue; }
      const c = text[i];
      if (c === '{') brace++;
      else if (c === '}') brace--;
      else if (c === '>' && brace === 0) { tagEnd = i; break; }
      i++;
    }
    if (tagEnd < 0) break;
    const attrs = text.slice(tagStart + 7, tagEnd);
    const closeIdx = text.indexOf('</button>', tagEnd);
    const innerEnd = closeIdx >= 0 ? closeIdx : tagEnd;
    out.push({
      tagStart, tagEnd, attrs,
      inner: text.slice(tagEnd + 1, innerEnd),
      line: lineOf(text, tagStart),
    });
    re.lastIndex = innerEnd;
  }
  return out;
}

function handlerOf(attrs) {
  const m = /\b(on[A-Z][\w$]*)\s*=\s*\{/.exec(attrs);
  if (m) {
    const openIdx = m.index + m[0].length - 1;
    const end = balancedEnd(attrs, openIdx);
    const body = attrs.slice(openIdx + 1, end < 0 ? attrs.length : end).trim();
    return { event: m[1], snippet: body, varName: /^[A-Za-z_$][\w$]*$/.test(body) ? body : null };
  }
  const m2 = /\b(on[A-Z][\w$]*)\s*=\s*"([^"]*)"/.exec(attrs);
  if (m2) return { event: m2[1], snippet: m2[2], varName: null };
  return null;
}

function attrValue(attrs, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\\{([\\s\\S]{0,200}?)\\})');
  const m = re.exec(attrs);
  if (!m) return '';
  if (m[1] != null) return m[1];
  const v = (m[2] || '').trim();
  const lit = /^['"]([^'"]*)['"]$/.exec(v);
  if (lit) return lit[1];
  const tern = /\?\s*['"]([^'"]*)['"]\s*:\s*['"]([^'"]*)['"]/.exec(v);
  if (tern) return tern[1] + ' / ' + tern[2];
  return v.slice(0, 60);
}

// 局部函数里按实参选分支：`if (B === 'image') { … }` / `switch (B) { case 'image': … }`
// 用途：分发函数（`ye(mode)`）不能整块展开，否则会把所有分支的 action 混进一条链路。
function branchOf(text, params, arg) {
  if (!arg || !params || !params.length) return null;
  const esc = arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const p of params) {
    const pe = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const branchRe = new RegExp('\\bif\\s*\\(\\s*' + pe + '\\s*===\\s*[\'"]', 'g');
    let lastEnd = -1;
    let hit = null;
    let bm;
    while ((bm = branchRe.exec(text))) {
      const litEnd = text.indexOf("'", bm.index + bm[0].length);
      const lit2 = text.indexOf('"', bm.index + bm[0].length);
      const lit = (litEnd >= 0 && (lit2 < 0 || litEnd < lit2)) ? litEnd : lit2;
      if (lit < 0) break;
      const val = text.slice(bm.index + bm[0].length, lit);
      const openIdx = text.indexOf('{', lit);
      if (openIdx < 0) break;
      const end = balancedEnd(text, openIdx);
      if (end < 0) break;
      if (val === arg) { hit = text.slice(openIdx, end + 1); break; }
      lastEnd = end;
      branchRe.lastIndex = end;
    }
    if (hit) return hit;
    // 没有命中分支但确实是一串 `if (p === '…')` 分发 → 取末尾兜底路径
    if (lastEnd > 0) return text.slice(lastEnd + 1);
    const swRe = new RegExp('\\bswitch\\s*\\(\\s*' + pe + '\\s*\\)\\s*\\{');
    const sm = swRe.exec(text);
    if (sm) {
      const openIdx = sm.index + sm[0].length - 1;
      const end = balancedEnd(text, openIdx);
      const inner = text.slice(openIdx + 1, end < 0 ? text.length : end);
      const caseRe = new RegExp('\\bcase\\s*[\'"]' + esc + '[\'"]\\s*:');
      const cm = caseRe.exec(inner);
      if (cm) {
        const rest = inner.slice(cm.index + cm[0].length);
        const stop = /\b(?:case\s*['"]|default\s*:)/.exec(rest);
        return rest.slice(0, stop ? stop.index : rest.length);
      }
    }
  }
  return null;
}

// 从函数头取形参名：`(a, b) =>` / `a =>` / `function f(a, b) {`
function paramsOfHead(s) {
  const m = /^\s*(?:async\s*)?function\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/.exec(s)
    || /^\s*(?:async\s*)?\(([^)]*)\)\s*=>/.exec(s)
    || /^\s*(?:async\s*)?([A-Za-z_$][\w$]*)\s*=>/.exec(s);
  if (!m) return [];
  const raw = m[1] != null ? m[1] : m[2];
  if (raw == null) return [];
  return raw.split(',').map((x) => x.trim().split(/[=:]/)[0].trim())
    .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x));
}

// ---------- 组件绑定解析 ----------

function buildBindings(text, ctx) {
  const b = {
    selector: {},
    setterToState: {},
    stateToSetter: {},
    refs: new Set(),
    local: {},
  };
  let m;
  const selRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*L\(\s*([A-Za-z_$][\w$]*)\s*=>[\s\S]{0,140}?\.([A-Za-z_$][\w$]*)/g;
  while ((m = selRe.exec(text))) b.selector[m[1]] = m[3];

  const stRe = /(?:const|let|var)\s+\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*(?:[\w$]+\.)?useState\s*\(/g;
  while ((m = stRe.exec(text))) { b.setterToState[m[2]] = m[1]; b.stateToSetter[m[1]] = m[2]; }

  const rfRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[\w$]+\.)?useRef\s*\(/g;
  while ((m = rfRe.exec(text))) b.refs.add(m[1]);

  const cbRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[\w$]+\.)?useCallback\s*\(/g;
  while ((m = cbRe.exec(text))) {
    const openIdx = m.index + m[0].length - 1;
    const end = balancedEnd(text, openIdx);
    const start = openIdx + 1;
    b.local[m[1]] = {
      kind: 'useCallback', start, end: end < 0 ? text.length - 1 : end,
      params: paramsOfHead(text.slice(start, start + 160)),
    };
  }

  const fnRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]{0,80}\)|[A-Za-z_$][\w$]*)\s*=>/g;
  while ((m = fnRe.exec(text))) {
    if (b.local[m[1]] || b.selector[m[1]] || b.setterToState[m[1]]) continue;
    b.local[m[1]] = {
      kind: 'arrow', start: m.index, end: stmtEnd(text, m.index + m[0].length),
      params: paramsOfHead(m[0].replace(/^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*/, '')),
    };
  }

  const dfnRe = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = dfnRe.exec(text))) {
    if (b.local[m[1]]) continue;
    const braceIdx = text.indexOf('{', m.index + m[0].length);
    const end = braceIdx >= 0 ? balancedEnd(text, braceIdx) : stmtEnd(text, m.index);
    b.local[m[1]] = {
      kind: 'function', start: m.index, end: end < 0 ? text.length - 1 : end,
      params: paramsOfHead(text.slice(m.index, m.index + 160)),
    };
  }

  b.selectorKind = {};
  for (const [v, f] of Object.entries(b.selector)) {
    b.selectorKind[v] = ctx && ctx.actions && ctx.actions.has(f) ? 'action'
      : ctx && ctx.states && ctx.states.has(f) ? 'state' : 'unknown';
  }
  return b;
}

const GLOBALS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'typeof', 'catch', 'function', 'new', 'await', 'delete',
  'void', 'in', 'of', 'do', 'else', 'try', 'throw', 'yield', 'super', 'this', 'case', 'default',
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'Date',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'RegExp', 'Error', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'structuredClone', 'fetch',
  'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Image', 'Audio', 'Intl',
  'queueMicrotask', 'btoa', 'atob', 'crypto', 'performance', 'navigator', 'document', 'window',
  'localStorage', 'sessionStorage', 'Symbol', 'BigInt', 'Reflect', 'Proxy', 'alert', 'confirm',
]);

function effectsOf(snippet, ctx, bindings, depth) {
  const d = depth || 0;
  const eff = { actions: [], reads: [], ipc: [], setState: [], refs: [], dom: [], unresolved: [], chain: [] };
  if (!snippet || d > 3) return eff;
  const add = (k, v) => { if (v && !eff[k].includes(v)) eff[k].push(v); };
  const pushChain = (kind, name, arg) => {
    const s = kind + ':' + name + (arg ? "('" + arg + "')" : '');
    if (!eff.chain.includes(s)) eff.chain.push(s);
  };

  const aliases = new Set();
  for (const mm of snippet.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*window\.api\b/g)) aliases.add(mm[1]);

  // minified 代码里同一字母会被复用为箭头函数形参（`onClick={$ => $.preventDefault()}`），
  // 形参遮蔽外层同名绑定 → 不能拿它去解析 store 字段。只处理本片段自身箭头函数的形参。
  const shadow = new Set();
  const head = /^\s*(?:\(\s*([^)]*?)\s*\)|([A-Za-z_$][\w$]*))\s*=>/.exec(snippet);
  if (head) {
    const p = (head[1] != null ? head[1] : head[2]) || '';
    for (const x of p.split(',')) {
      const t = x.trim().split(/[=:]/)[0].trim();
      if (t) shadow.add(t);
    }
  }

  const re = /L\.getState\(\)\.([A-Za-z_$][\w$]*)|window\.api\.([A-Za-z_$][\w$]*)|(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(snippet))) {
    const after = snippet.slice(re.lastIndex, re.lastIndex + 40);
    const arg = (after.match(/^\s*['"]([\w$-]{1,24})['"]/) || [])[1] || '';
    if (m[1]) { add('actions', m[1]); pushChain('action', m[1], arg); continue; }
    if (m[2]) { add('ipc', m[2]); pushChain('ipc', m[2], arg); continue; }
    const v = m[3];
    if (!v || GLOBALS.has(v)) continue;
    if (aliases.has(v)) continue;
    if (shadow.has(v)) { add('dom', v); continue; }
    if (bindings.setterToState[v]) { const st = bindings.setterToState[v]; add('setState', st); pushChain('setState', st, arg); continue; }
    if (bindings.selector[v]) {
      const f = bindings.selector[v];
      const k = bindings.selectorKind[v];
      if (k === 'action') { add('actions', f); pushChain('action', f, arg); }
      else if (k === 'state') add('reads', f);
      else add('unresolved', 'selector:' + f);
      continue;
    }
    if (bindings.local[v]) {
      const loc = bindings.local[v];
      const full = ctx.text.slice(loc.start, loc.end);
      // 实参是字面量且局部函数是分发器 → 只展开命中的分支
      const picked = arg ? branchOf(full, loc.params, arg) : null;
      const sub = effectsOf(picked || full, ctx, bindings, d + 1);
      for (const k of ['actions', 'reads', 'ipc', 'setState', 'refs', 'dom']) for (const x of sub[k]) add(k, x);
      if (sub.chain.length) {
        // 保留调用点的实参（局部函数的形参在函数体内看不出取值）
        const step = v + '(' + (arg ? "'" + arg + "'" : '…') + ') → ' + sub.chain.join(' + ');
        if (!eff.chain.includes(step)) eff.chain.push(step);
      } else {
        add('unresolved', 'local:' + v);
      }
      continue;
    }
    if (bindings.refs.has(v)) { add('refs', v); continue; }
    add('dom', v);
  }
  for (const a of aliases) {
    const re2 = new RegExp('\\b' + a + '\\.([A-Za-z_$][\\w$]*)', 'g');
    let m2;
    while ((m2 = re2.exec(snippet))) { add('ipc', m2[1]); pushChain('ipc', m2[1]); }
  }
  // 成员调用 `X.method(`（X 不是已知绑定）→ 记 DOM/宿主对象调用，避免整块判成「未解析」
  const memRe = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
  let mm;
  while ((mm = memRe.exec(snippet))) {
    const recv = mm[1];
    const meth = mm[2];
    if (recv === 'L' && meth === 'getState') continue;
    if (recv === 'window' || recv === 'document' || recv === 'console') continue;
    if (!shadow.has(recv) && (bindings.selector[recv] || bindings.setterToState[recv] || bindings.local[recv] || bindings.refs.has(recv))) continue;
    add('dom', recv + '.' + meth);
  }
  return eff;
}

// ---------- 组件一次提全 ----------

function analyzeComponent(text, ctx) {
  const bindings = buildBindings(text, ctx);
  ctx.text = text;

  let props = '';
  const pm = text.match(/forwardRef\(\s*function\s*\(\s*\{([^}]*)\}/) || text.match(/function\s+\w*\s*\(\s*\{([^}]*)\}/);
  if (pm) props = pm[1].trim();

  const hooks = {
    useState: (text.match(/(?:[\w$]+\.)?useState\(/g) || []).length,
    useRef: (text.match(/(?:[\w$]+\.)?useRef\(/g) || []).length,
    useMemo: (text.match(/(?:[\w$]+\.)?useMemo\(/g) || []).length,
    useEffect: (text.match(/(?:[\w$]+\.)?useEffect\(/g) || []).length,
  };

  const store = new Set(Object.values(bindings.selector));
  const ipc = new Set();
  for (const mm of text.matchAll(/L\.getState\(\)\.([A-Za-z_$][\w$]*)/g)) store.add(mm[1]);
  for (const mm of text.matchAll(/window\.api\.([A-Za-z_$][\w$]*)/g)) ipc.add(mm[1]);

  // 组件**直接写** store 的字段（`L.setState({ fitViewAction: … })`）。
  // 这类字段没有任何 action 写它，09 的字段表若不单列就会「漏行」。
  const setStateFields = [];
  for (const sm of text.matchAll(/\bL\.setState\s*\(\s*\{/g)) {
    const bi = sm.index + sm[0].length - 1;
    for (const k of objectKeys(text, bi)) if (!setStateFields.includes(k)) setStateFields.push(k);
  }

  const events = new Set();
  for (const mm of text.matchAll(/\b(on[A-Z][a-zA-Z]*)\s*=/g)) events.add(mm[1]);

  const imports = new Set();
  for (const mm of text.matchAll(/import\s+[\w_$]+\s+from\s+["']\.\/([\w$-]+)\.jsx["']/g)) imports.add(mm[1]);

  const layout = new Set();
  const labels = new Set();
  const inputs = [];
  for (const ln of text.split('\n')) {
    const cl = ln.match(/className="([^"]+)"/);
    if (cl && /(head|body|side|center|main|rail|panel|toolbar|wrap|clip|area|stage|footer|content|list|grid|item|row|col|menu|modal|overlay|hint|empty|title|actions|webview|bar|sel|topbar|ctx)/.test(cl[1])) layout.add(cl[1]);
    const lab = ln.match(/(?:title|aria-label|placeholder|alt)=\{(?:\w+\s*\?\s*)?['"]([^'"`]*[\u4e00-\u9fff][^'"`]*)['"]|(?:title|aria-label|placeholder|alt)=['"]([^'"]*[\u4e00-\u9fff][^'"]*)['"]/);
    if (lab) { const s = (lab[1] || lab[2] || '').trim(); if (s && s.length <= 30) labels.add(s); }
    const inp = ln.match(/<(input|textarea|select)\b([^>]*)>/);
    if (inp) {
      const ph = (inp[2].match(/placeholder=\{?[^'"]*['"]([^'"]+)['"]/) || [])[1] || (inp[2].match(/placeholder="([^"]+)"/) || [])[1] || '';
      inputs.push({ tag: inp[1], placeholder: ph });
    }
  }

  const buttons = [];
  for (const b of parseButtons(text)) {
    const h = handlerOf(b.attrs);
    const icon = (b.inner.match(/<[\w$]*Hn\s+name=\{?["']([^"']+)["']/) || [])[1] || '';
    const label = (b.inner.match(/[\u4e00-\u9fff][^<>{}\n]{0,20}/) || [])[0] || '';
    const title = attrValue(b.attrs, 'title');
    const cls = attrValue(b.attrs, 'className');
    let snippet = '';
    let via = '';
    if (h) {
      if (h.varName && bindings.local[h.varName]) {
        const loc = bindings.local[h.varName];
        snippet = text.slice(loc.start, loc.end);
        via = 'local:' + h.varName;
      } else if (h.varName && bindings.selector[h.varName]) {
        snippet = 'L.getState().' + bindings.selector[h.varName] + '()';
        via = 'selector:' + bindings.selector[h.varName];
      } else {
        snippet = h.snippet;
        via = h.varName ? 'var:' + h.varName : 'inline';
      }
    }
    // 裸标识符且不是本组件任何已知绑定 → 来自 props / 模块作用域（如 `onClick={onClose}`），
    // 交给父组件或外部，不在本组件内解析。
    const isProp = h && h.varName && !bindings.local[h.varName] && !bindings.selector[h.varName]
      && !bindings.setterToState[h.varName] && !bindings.stateToSetter[h.varName] && !bindings.refs.has(h.varName);
    if (isProp) via = 'prop:' + h.varName;
    const effects = h ? effectsOf(snippet, ctx, bindings, 0) : { actions: [], reads: [], ipc: [], setState: [], refs: [], dom: [], unresolved: [], chain: [] };
    let kind = 'unresolved';
    if (via.startsWith('prop:')) kind = 'prop';
    else if (effects.actions.length && (effects.ipc.length || effects.setState.length || effects.dom.length)) kind = 'mixed';
    else if (effects.actions.length) kind = 'store-action';
    else if (effects.ipc.length) kind = 'ipc';
    else if (effects.setState.length) kind = 'setState';
    else if (effects.refs.length) kind = 'ref';
    else if (effects.dom.length) kind = 'dom';
    buttons.push({
      line: b.line, icon, label, title, cls,
      event: h ? h.event : '', via,
      handler: (h ? (h.varName || h.snippet) : '').slice(0, 500),
      kind, effects,
    });
    for (const x of effects.ipc) ipc.add(x);
  }

  return {
    name: ctx.name, lines: text.split('\n').length, props, hooks,
    store: [...store], setStateFields, ipc: [...ipc], events: [...events], imports: [...imports],
    layout: [...layout], labels: [...labels], buttons, inputs,
    bindings: {
      selectors: Object.entries(bindings.selector).map(([v, f]) => ({ var: v, field: f, kind: bindings.selectorKind[v] })),
      states: Object.entries(bindings.setterToState).map(([setter, state]) => ({ state, setter })),
      refs: [...bindings.refs],
      locals: Object.entries(bindings.local).map(([n, v]) => ({ name: n, kind: v.kind })),
    },
  };
}

module.exports = {
  readToken, blankComments, balancedEnd, lineOf, stmtEnd, topLevelDefs, topLevelDefList, isComponentDef, topLevelEntries,
  jsxTags, importsOf, definedNames, destructuredProps, branchOf, paramsOfHead, objectKeys,
  parseButtons, handlerOf, attrValue, buildBindings, effectsOf, analyzeComponent, GLOBALS,
};
