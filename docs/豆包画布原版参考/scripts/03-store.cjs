#!/usr/bin/env node
/**
 * 03-store.cjs —— store 完整规格（一个脚本提全 store）：
 *   state 字段（初始值）+ action 清单 + **action 函数体原文**（set/get 规范化）+
 *   helper 解析（action 里调用的顶层函数原文）+ 行为事实（写入/读取/调用/IPC/常量/文案/守卫）。
 *
 * 为什么输出函数体：旧版只给「写哪些字段/读哪些字段」，下游 AI 只能靠猜 →
 * 推断量 ≈ 重写量。实测函数体是**可读的**（只有标识符被压成 n/r/l），
 * 把原文 + `set`/`get` 规范化交出去，才能从「推断」变成「照写」。
 *
 * 输入：inputs/pipeline_step/project/src/expanded_components/shared.js
 * 输出：outputs/03-store.json + outputs/03-store.md
 * 幂等、可重跑：node scripts/03-store.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { blankComments, balancedEnd, topLevelDefs, topLevelEntries, objectKeys } = require('./_lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components', 'shared.js');
const OUT_JSON = path.join(ROOT, 'outputs', '03-store.json');
const OUT_MD = path.join(ROOT, 'outputs', '03-store.md');

const MAX_HELPER_BODY = 4000; // 单个 helper 原文上限，超出截断并标注

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function findStore(text) {
  const m = text.match(/const\s+L\s*=\s*(\w+)\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*\{\s*return\s*\{/);
  return m ? { braceIdx: m.index + m[0].length - 1, creator: m[1], setParam: m[2], getParam: m[3] } : null;
}

// 去掉公共缩进，输出可直接读的函数体
function dedent(s) {
  const lines = s.replace(/^\n+|\s+$/g, '').split('\n');
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    const ind = l.match(/^[ \t]*/)[0].length;
    if (ind < min) min = ind;
  }
  if (!isFinite(min) || min === 0) return lines.join('\n');
  return lines.map((l) => l.slice(min)).join('\n');
}

// set/get 参数规范化：`e({...})` → `set({...})`，`t().x` → `get().x`。
// 有同名遮蔽（局部 const e / 箭头参数 e）就放弃改名，保持原样并标注。
function normalizeBody(body, setParam, getParam) {
  const shadow = new RegExp(
    '(?:const|let|var|function)\\s+(?:' + setParam + '|' + getParam + ')\\b|' +
    '\\b(?:' + setParam + '|' + getParam + ')\\s*=>'
  );
  if (shadow.test(body)) return { body, renamed: false };
  let out = body;
  out = out.replace(new RegExp('(?<![\\w$.])' + setParam + '(?=\\s*\\()', 'g'), 'set');
  out = out.replace(new RegExp('(?<![\\w$.])' + getParam + '(?=\\s*\\(\\))', 'g'), 'get');
  return { body: out, renamed: true };
}

// set(...) 里被写入的**对象字面量**位置（括号配平）。三种形态都要覆盖：
//   set({ a })                     → 直接对象
//   set(s => ({ a }))              → 表达式体箭头
//   set(s => { … return { a } })   → 块体箭头（旧版把块体当对象，`a` 在 depth 2 上被整块漏掉）
function setObjectLiterals(body, setter) {
  const out = [];
  const re = new RegExp('(?<![\\w$.])' + setter + '\\s*\\(', 'g');
  let m;
  while ((m = re.exec(body))) {
    const openIdx = m.index + m[0].length - 1;
    const end = balancedEnd(body, openIdx);
    if (end < 0) { re.lastIndex = m.index + 1; continue; }
    re.lastIndex = end;
    const argStart = openIdx + 1;
    const arg = body.slice(argStart, end);
    for (const rm of arg.matchAll(/\breturn\s*\{/g)) out.push(argStart + rm.index + rm[0].length - 1);
    const lead = arg.match(/^\s*(?:async\s*)?(?:(?:[A-Za-z_$][\w$]*|\([^)]{0,40}\))\s*=>\s*\(?\s*)?\{/);
    if (lead) out.push(argStart + lead.index + lead[0].length - 1);
  }
  return [...new Set(out)];
}

// set(...) 写入的 state 字段：
//   - 对象字面量的**顶层 key**（含简写、跳过展开与计算键）
//   - 补充：字面量内部任意深度上「确实是 state 字段名」的 key
//     （`...(cond ? { imageGenKeyParams: … } : {})` 这种条件展开也要算写）
//   - `writesUnknown` 兜住顶层里不是 state 名的 key（不静默丢）
function writesOf(body, setter, stateNames) {
  const all = new Set();
  for (const bi of setObjectLiterals(body, setter)) {
    const keys = objectKeys(body, bi);
    // 只认「确实写了 state 字段」的字面量：排除 set 实参里回调 `return {…}` 返回的普通对象
    // （如 `nodes.map(n => { return {...n, data: x} })` 里的 data/id/selected）
    if (!keys.some((k) => stateNames.has(k))) continue;
    for (const k of keys) all.add(k);
    const end = balancedEnd(body, bi);
    const inner = body.slice(bi, end < 0 ? body.length : end + 1);
    for (const mm of inner.matchAll(/(?:^|[,{(\s])([A-Za-z_$][\w$]*)\s*:/g)) {
      if (stateNames.has(mm[1])) all.add(mm[1]);
    }
  }
  return {
    known: [...all].filter((k) => stateNames.has(k)).sort(),
    other: [...all].filter((k) => !stateNames.has(k)).sort(),
  };
}

function literalsOf(body) {
  const strings = [];
  const uiText = [];
  const numbers = [];
  for (const m of body.matchAll(/(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const v = m[2];
    if (!v || v.length > 60) continue;
    if (!strings.includes(v)) strings.push(v);
    if (/[\u4e00-\u9fff]/.test(v) && !uiText.includes(v)) uiText.push(v);
  }
  for (const m of body.matchAll(/(?<![\w$.])(\d{1,7}(?:\.\d+)?)(?![\w$])/g)) {
    const v = m[1];
    if (!numbers.includes(v)) numbers.push(v);
  }
  return { strings: strings.slice(0, 40), uiText: uiText.slice(0, 30), numbers: numbers.slice(0, 20) };
}

function paramsOf(raw) {
  let m = raw.match(/^\(\s*\{([^}]*)\}\s*[,)]/);
  if (m) return '{ ' + m[1].trim().replace(/\s+/g, ' ') + ' }';
  m = raw.match(/^\(([^)]*)\)\s*=>/);
  if (m) return m[1].trim();
  m = raw.match(/^([A-Za-z_$][\w$]*)\s*=>/);
  if (m) return m[1];
  return '';
}

function main() {
  const rawText = fs.readFileSync(SHARED, 'utf8');
  const text = blankComments(rawText);
  const store = findStore(text);
  if (!store) { console.error('[03-store] 未定位 store'); process.exit(1); }

  const entries = topLevelEntries(text, store.braceIdx);
  const states = [];
  const actionEntries = [];
  for (const e of entries) {
    if (e.isAction) actionEntries.push(e);
    else states.push({
      name: e.key, line: e.line, initial: e.raw.slice(0, 80),
      type: e.isIife ? 'computed' : inferType(e.raw),
    });
  }

  const stateNames = new Set(states.map((s) => s.name));
  const actionNames = new Set(actionEntries.map((e) => e.key));
  const defs = topLevelDefs(text);

  const helperRefs = new Set();
  const actions = [];
  for (const e of actionEntries) {
    const body0 = text.slice(e.start, e.end).trim();
    const { body, renamed } = normalizeBody(body0, store.setParam, store.getParam);
    // 规范化后 set/get 已是字面量名；未规范化的保持原参数名
    const setter = renamed ? 'set' : store.setParam;
    const getter = renamed ? 'get' : store.getParam;

    const w = writesOf(body, setter, stateNames);
    const writes = w.known;
    const readsAll = [];
    const getRe = new RegExp('(?<![\\w$.])' + getter + '\\(\\)\\.([A-Za-z_$][\\w$]*)', 'g');
    let m;
    while ((m = getRe.exec(body))) if (!readsAll.includes(m[1])) readsAll.push(m[1]);
    // `const r = get()` 后再 `r.past` 的间接读取
    const aliases = [];
    const aliasRe = new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*' + getter + '\\(\\)', 'g');
    while ((m = aliasRe.exec(body))) if (!aliases.includes(m[1])) aliases.push(m[1]);
    for (const al of aliases) {
      const re2 = new RegExp('(?<![\\w$.])' + al + '\\.([A-Za-z_$][\\w$]*)', 'g');
      while ((m = re2.exec(body))) if (!readsAll.includes(m[1])) readsAll.push(m[1]);
    }
    const ipc = [];
    for (const mm of body.matchAll(/window\.api\.([A-Za-z_$][\w$]*)/g)) if (!ipc.includes(mm[1])) ipc.push(mm[1]);

    // action 里调用的顶层 helper（排除自身 action 名与 set/get）
    const calls = [];
    for (const mm of body.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const v = mm[1];
      if (!v || v === 'set' || v === 'get' || actionNames.has(v) || !defs.has(v)) continue;
      if (!calls.includes(v)) calls.push(v);
      helperRefs.add(v);
    }

    const lit = literalsOf(body);
    actions.push({
      name: e.key, line: e.line, params: paramsOf(e.raw),
      writes,
      writesUnknown: w.other,
      reads: readsAll,
      readsState: readsAll.filter((r) => stateNames.has(r)),
      callsActions: readsAll.filter((r) => actionNames.has(r)),
      ipc,
      calls,
      literals: lit,
      branches: (body.match(/\bif\s*\(/g) || []).length,
      guards: (body.match(/\breturn\s*;/g) || []).length,
      awaits: (body.match(/\bawait\b/g) || []).length,
      renamed,
      lines: body.split('\n').length,
      body,
    });
  }

  // helper 原文（被 action 直接引用到的顶层定义），递归补一层它们的调用
  const helperNames = [...helperRefs].filter((n) => defs.has(n)).sort();
  const helpers = [];
  for (const n of helperNames) {
    const d = defs.get(n);
    const hcalls = [];
    for (const mm of (d.body || '').matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const v = mm[1];
      if (!v || !defs.has(v) || v === n || helperRefs.has(v)) continue;
      if (!hcalls.includes(v)) hcalls.push(v);
    }
    const full = dedent(d.body || d.head);
    helpers.push({
      name: n, kind: d.kind, line: d.line, head: d.head,
      calls: hcalls,
      lines: full.split('\n').length,
      truncated: full.length > MAX_HELPER_BODY,
      body: full.length > MAX_HELPER_BODY ? full.slice(0, MAX_HELPER_BODY) + '\n/* …截断，完整定义见 shared.js 行 ' + d.line + ' */' : full,
    });
  }

  const result = {
    generated_by: 'scripts/03-store.cjs',
    inputs: [{ path: 'inputs/pipeline_step/project/src/expanded_components/shared.js', sha256: sha256(SHARED) }],
    stats: {
      creator: store.creator, setParam: store.setParam, getParam: store.getParam,
      stateCount: states.length, actionCount: actions.length,
      actionsWithWrites: actions.filter((a) => a.writes.length).length,
      actionsWithIpc: actions.filter((a) => a.ipc.length).length,
      actionsWithBody: actions.filter((a) => a.body.length > 20).length,
      actionsRenamed: actions.filter((a) => a.renamed).length,
      helperCount: helpers.length,
      totalBodyLines: actions.reduce((s, a) => s + a.lines, 0),
    },
    states,
    helpers,
    actions,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  const st = result.stats;
  console.log(`[03-store] state ${st.stateCount} / action ${st.actionCount}（函数体 ${st.actionsWithBody} / 规范化 ${st.actionsRenamed}）/ helper ${st.helperCount} / 函数体共 ${st.totalBodyLines} 行`);
  console.log(`[03-store] 有写 ${st.actionsWithWrites} / 有 IPC ${st.actionsWithIpc}`);
  console.log(`[03-store] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function inferType(initial) {
  const raw = initial.trim();
  if (/^\[\]$/.test(raw)) return 'array';
  if (/^\{\}$/.test(raw)) return 'object';
  if (/^true$|^false$/.test(raw)) return 'boolean';
  if (/^null$/.test(raw)) return 'null';
  if (/^\d+(\.\d+)?$/.test(raw)) return 'number';
  if (/^['"`]/.test(raw)) return 'string';
  if (/^\w+\(/.test(raw)) return 'fn-call';
  if (/^\(\(/.test(raw)) return 'fn';
  return 'unknown';
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 03 · store 完整规格（机器生成）');
  L.push('');
  L.push('> 由 `scripts/03-store.cjs` 一次提全 store，勿手改；重跑 `node scripts/03-store.cjs`。');
  L.push(`> store = \`${r.stats.creator}((${r.stats.setParam}, ${r.stats.getParam}) => ...)\`；state ${r.stats.stateCount} / action ${r.stats.actionCount}。`);
  L.push('> **函数体已内联**：`set`/`get` 已按 store 参数规范化，可直接照写；仅局部标识符是 minified 短名。');
  L.push('');
  L.push('## state 字段');
  L.push('');
  L.push('| 字段 | 类型 | 初始值 |');
  L.push('|---|---|---|');
  for (const s of r.states) L.push(`| \`${s.name}\` | \`${s.type}\` | \`${s.initial}\` |`);
  L.push('');
  L.push('## action 索引');
  L.push('');
  L.push('| action | 参数 | 写入 state | 读取 state | 调 action | 调 IPC | 调 helper |');
  L.push('|---|---|---|---|---|---|---|');
  for (const a of r.actions) {
    L.push(`| \`${a.name}\` | ${a.params ? '`' + a.params.slice(0, 40) + '`' : '—'} | ${a.writes.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.readsState.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.callsActions.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.ipc.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.calls.map((x) => '`' + x + '`').join(' ') || '—'} |`);
  }
  L.push('');
  L.push('## action 函数体（照写翻译 · set/get 已规范化）');
  L.push('');
  for (const a of r.actions) {
    L.push(`### ${a.name}（行 ${a.line}）`);
    L.push('');
    const meta = [];
    if (a.params) meta.push(`参数 \`${a.params}\``);
    if (a.writes.length) meta.push(`写入 ${a.writes.map((x) => '`' + x + '`').join(' ')}`);
    if (a.callsActions.length) meta.push(`调 action ${a.callsActions.map((x) => '`' + x + '`').join(' ')}`);
    if (a.ipc.length) meta.push(`调 IPC ${a.ipc.map((x) => '`' + x + '`').join(' ')}`);
    if (a.calls.length) meta.push(`调 helper ${a.calls.map((x) => '`' + x + '`').join(' ')}`);
    if (a.literals.uiText.length) meta.push(`UI 文案 ${a.literals.uiText.map((x) => '「' + x + '」').join(' ')}`);
    if (a.literals.numbers.length) meta.push(`常量 ${a.literals.numbers.map((x) => '`' + x + '`').join(' ')}`);
    if (!a.renamed) meta.push('⚠ 含同名遮蔽，未做 set/get 规范化');
    L.push(meta.join('；'));
    L.push('');
    L.push('```js');
    L.push(a.body);
    L.push('```');
    L.push('');
  }
  if (r.helpers.length) {
    L.push('## helper 原文（action 直接引用的顶层定义）');
    L.push('');
    for (const h of r.helpers) {
      L.push(`### ${h.name}（行 ${h.line}，${h.kind}）`);
      L.push('');
      L.push('```js');
      L.push(h.body);
      L.push('```');
      L.push('');
    }
  }
  return L.join('\n');
}

main();
