#!/usr/bin/env node
/**
 * scan-inventory.mjs —— **清点表**（README §2.1）的候选扫描器：`electron/**` 逐文件七列。
 *
 * 为什么是脚本（README §11.5 / 弯路 W19、W18）：这七列里五列**由语法就能定**，
 * 人肉从零读 28 个文件既慢又**会漏**（漏一个导出 ⇒ 运行期断、编译期不报）。
 * 脚本只报**候选**；需要判断的只有一件事：**哪个顶层副作用真的依赖 main 侧初始化**（人来判）。
 *
 * 七列（对应 README §7 的 C-1/C-2/C-3 与 §2.1 表头）：
 *   ① `require('electron')`（顶层） ② 顶层副作用（候选） ③ 惰性/动态 require
 *   ④ 有环（本脚本自建 require 图判） ⑤ `module.exports = fn` 单函数导出
 *   ⑥ 消费方改其导出值（`require(..).x = …` / `const m = require(..); m.x = …`）
 *   ⑦ 顶层 `this`
 * 另附：导出名清单（A-3 用）、`ipcMain` 频道清单（A-4 用）、文件行数真值（README §2 的数字是估值）。
 *
 * 用法：
 *   node docs/plan/后端TS迁移/scripts/scan-inventory.mjs [--json] [--md] [--help]
 * 退出码：0 = 有产出 · 2 = 用法或环境错（本脚本是**扫描器**，不做通过/不通过判定）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const ELEC = path.join(REPO, 'electron');
const SNAPSHOT = path.join(HERE, '..', 'evidence', 'channel-map.json');
const SKIP_DIRS = new Set(['node_modules', 'dist']);
const NOISE_KEYS = new Set(['start', 'end', 'loc', 'range', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'comments']);

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`scan-inventory.mjs —— 清点表候选扫描（electron/** 逐文件七列）

用法：node .../scan-inventory.mjs [--json] [--md] [--help]
  --json  机器可读
  --md    Markdown 表格（可直接粘进 日志.md；「人判」列留空由人填）
  --help  本帮助`);
  process.exit(0);
}
const wantJson = args.includes('--json');
const wantMd = args.includes('--md');

if (!fs.existsSync(ELEC)) {
  console.error('❌ 找不到 electron/');
  process.exit(2);
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
      walk(path.join(dir, ent.name), acc);
    } else if (/\.(js|ts)$/.test(ent.name)) {
      acc.push(path.join(dir, ent.name));
    }
  }
  return acc;
}

const isFn = (t) => /Function(Declaration|Expression)$/.test(t) || t === 'ArrowFunctionExpression' || /Method$/.test(t);
const fnName = (node) => (node.id && node.id.name) || (node.key && (node.key.name ?? node.key.value)) || '(匿名)';

/** 深度感知遍历：fn(node, depth, parent) */
function traverse(node, fn, depth = 0, parent = null) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) traverse(n, fn, depth, parent);
    return;
  }
  if (typeof node.type !== 'string') {
    for (const k of Object.keys(node)) {
      if (NOISE_KEYS.has(k)) continue;
      traverse(node[k], fn, depth, node);
    }
    return;
  }
  fn(node, depth, parent);
  const next = isFn(node.type) ? depth + 1 : depth;
  for (const k of Object.keys(node)) {
    if (NOISE_KEYS.has(k)) continue;
    traverse(node[k], fn, next, node);
  }
}

const callName = (callee) => {
  if (!callee) return '';
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression')
    return `${callName(callee.object) || (callee.object?.name ?? '?')}.${callee.property?.name ?? '?'}`;
  return '';
};

const files = walk(ELEC);
const info = new Map();

for (const abs of files) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  const code = fs.readFileSync(abs, 'utf-8');
  const lines = code.replace(/\r\n?/g, '\n').split('\n').length;
  let ast;
  try {
    ast = parse(code, { sourceType: 'unambiguous', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
  } catch (err) {
    info.set(rel, { rel, lines, parseError: String(err && err.message) });
    continue;
  }

  const rec = {
    rel,
    lines,
    electronRequireTop: false,
    electronRequireLazy: [],
    lazyRequires: [],
    topCallCandidates: [],
    requires: new Set(),
    singleFnExport: null,
    propertyExports: [],
    exportedNames: [],
    exportShape: '',
    topLevelThis: [],
    ipcHandles: [],
    ipcOns: [],
    sends: [],
    stringLiterals: [],
    channelsUsed: [],
    mutatesRequireBinding: [],
  };

  const requireBindings = new Map(); // 顶层 `const m = require('x')` 的绑定名 → 源

  for (const stmt of ast.program.body) {
    // ⑤ 导出形态
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression') {
      const { left, right } = stmt.expression;
      const leftText = code.slice(left.start, left.end);
      if (leftText === 'module.exports') {
        if (right.type === 'ObjectExpression') {
          rec.exportShape = 'module.exports = {…}';
          rec.exportedNames = right.properties
            .map((p) => (p.type === 'SpreadElement' ? `…${code.slice(p.argument.start, p.argument.end)}` : (p.key.name ?? p.key.value)))
            .filter(Boolean);
        } else {
          rec.exportShape = `module.exports = ${right.type}`;
          rec.singleFnExport = right.type === 'ObjectExpression' ? null : code.slice(right.start, Math.min(right.end, right.start + 80));
          rec.exportedNames = right.type === 'Identifier' ? [right.name] : ['(表达式)'];
        }
      }
      if (left.type === 'MemberExpression' && left.object.name === 'exports') {
        rec.propertyExports.push(left.property.name);
        rec.exportShape = rec.exportShape || 'exports.x = …';
      }
    }
    // ② 顶层副作用候选：顶层表达式语句里的调用（排除纯 require 赋值 / 纯字面量）
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
      rec.topCallCandidates.push(code.slice(stmt.start, Math.min(stmt.end, stmt.start + 100)).replace(/\s+/g, ' ').trim());
    }
    if (stmt.type === 'IfStatement') {
      rec.topCallCandidates.push(`[顶层 if] ${code.slice(stmt.start, Math.min(stmt.end, stmt.start + 100)).replace(/\s+/g, ' ').trim()}`);
    }
    // 顶层 require 绑定
    if (stmt.type === 'VariableDeclaration') {
      for (const d of stmt.declarations) {
        if (d.id.type === 'Identifier' && d.init && d.init.type === 'CallExpression' && d.init.callee.name === 'require') {
          const src = d.init.arguments[0] && d.init.arguments[0].value;
          if (typeof src === 'string') requireBindings.set(d.id.name, src);
        }
      }
    }
  }

  traverse(ast, (node, depth, parent) => {
    // A-4 补充：**按频道名**收集本文件出现的字符串字面量（防「经本地 helper 转发」漏检 ——
    // `lovart-fetch.js` 就是 `sender('lovart-fetch-item', …)` 这种形态，靠 callee 名根本认不出）
    if (node.type === 'StringLiteral' && typeof node.value === 'string' && node.value) rec.stringLiterals.push(node.value);
    if (node.type === 'CallExpression') {
      const name = callName(node.callee);
      const arg0 = node.arguments[0];
      const lit = arg0 && (arg0.type === 'StringLiteral' || arg0.type === 'TemplateLiteral' ? arg0 : null);
      if (name === 'require' || name.endsWith('.require')) {
        const src = arg0 && arg0.type === 'StringLiteral' ? arg0.value : '(动态)';
        rec.requires.add(src);
        if (src.startsWith('.')) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), src));
          rec.requires.add(target.endsWith('.js') || target.endsWith('.ts') ? target : `${target}.js`);
        }
        if (depth > 0 || !lit) {
          rec.lazyRequires.push({ depth, src, at: code.slice(node.start, Math.min(node.end, node.start + 60)).replace(/\s+/g, ' ') });
        }
        if (src === 'electron') {
          if (depth === 0) rec.electronRequireTop = true;
          else rec.electronRequireLazy.push(src);
        }
      }
      // A-4：IPC 注册 / 推送频道
      if (name === 'handle' || name === 'ipcMain.handle') if (lit) rec.ipcHandles.push(arg0.value);
      if (name === 'on' || name === 'ipcMain.on') if (lit) rec.ipcOns.push(arg0.value);
      if (/\.send$/.test(name) && !/^(ipcRenderer|event)\./.test(name)) {
        if (lit && typeof arg0.value === 'string' && !arg0.value.startsWith('-')) rec.sends.push(arg0.value);
      }
    }
    // ⑦ 顶层 this
    if (node.type === 'ThisExpression' && depth === 0) {
      rec.topLevelThis.push(`第 ${code.slice(0, node.start).split('\n').length} 行`);
    }
    // ⑥ 消费方改 require 绑定的成员
    if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
      const target = node.type === 'AssignmentExpression' ? node.left : node.argument;
      if (target && target.type === 'MemberExpression' && target.object.type === 'Identifier' && requireBindings.has(target.object.name)) {
        rec.mutatesRequireBinding.push(`${target.object.name}.${target.property?.name ?? '?'} ← ${requireBindings.get(target.object.name)}`);
      }
    }
    // ⑤ 参数属性之外的补充：箭头函数/函数声明里的 `module.exports`（本仓不用，留个哨）
    void parent;
  });

  // ⑥ 直接形态：`require('x').y = …`
  for (const m of code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)\s*\.\s*([A-Za-z_$][\w$]*)\s*(=[^=]|\+\+|--)/g)) {
    rec.mutatesRequireBinding.push(`require('${m[1]}').${m[2]} ← 直接改导出值`);
  }

  rec.requires = [...rec.requires].sort();
  rec.lazyRequires = rec.lazyRequires.filter((r) => r.src !== '(动态)' || true);
  info.set(rel, rec);
}

// ── ④ 环：本脚本自建 require 图（只认仓内相对依赖）──
const graph = new Map();
for (const [rel, rec] of info) {
  graph.set(rel, (rec.requires ?? []).filter((r) => r.startsWith('electron/')).map((r) => r.replace(/\.js$/, '.ts').replace(/\.ts$/, '.js')));
}
/** 把 electron/foo.js 与 electron/foo.ts 视作同一节点 */
const norm = (rel) => rel.replace(/\.(js|ts)$/, '');
const cycles = [];
{
  const adjacency = new Map();
  for (const [rel, deps] of graph) {
    adjacency.set(rel, deps.map((d) => [...info.keys()].find((k) => norm(k) === norm(d))).filter(Boolean));
  }
  const state = new Map(); // 0 未访问 / 1 在栈 / 2 完成
  const stack = [];
  const dfs = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      if (state.get(next) === 1) {
        cycles.push([...stack.slice(stack.indexOf(next)), next].join(' → '));
      } else if (!state.has(next)) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, 2);
  };
  for (const rel of [...adjacency.keys()].sort()) if (!state.has(rel)) dfs(rel);
}

// ── A-4 频道对账（**频道为中心**：preload 种类 × 后端注册 × 全仓字面量出现）──
let channelRecon = null;
{
  const snap = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8')) : null;
  const preloadKind = new Map();
  if (snap) for (const m of snap.members ?? []) if (m.channel) preloadKind.set(m.channel, m.kind);

  const registered = new Map(); // channel → [file]
  const mentioned = new Map(); // channel → [file]（字面量出现，含经 helper 转发）
  const allNames = new Set(preloadKind.keys());
  for (const [rel, rec] of info) {
    for (const c of [...(rec.ipcHandles ?? []), ...(rec.ipcOns ?? [])]) {
      registered.set(c, [...(registered.get(c) ?? []), rel]);
      allNames.add(c);
    }
  }
  for (const [rel, rec] of info) {
    const hit = [...new Set((rec.stringLiterals ?? []).filter((s) => allNames.has(s)))];
    rec.channelsUsed = hit.sort();
    for (const c of hit) mentioned.set(c, [...(mentioned.get(c) ?? []), rel]);
  }
  const rows = [...allNames].sort().map((ch) => ({
    channel: ch,
    preload: preloadKind.get(ch) ?? '—',
    registeredIn: registered.get(ch) ?? [],
    mentionedIn: mentioned.get(ch) ?? [],
    幽灵preload: preloadKind.has(ch) && !registered.has(ch) && !mentioned.has(ch),
    未暴露: !preloadKind.has(ch) && registered.has(ch),
    订阅无人推: preloadKind.get(ch) === 'on' && !mentioned.has(ch),
  }));
  channelRecon = {
    source: snap ? path.relative(REPO, SNAPSHOT) : '(无快照)',
    preloadCount: preloadKind.size,
    registeredCount: registered.size,
    rows,
    幽灵preload: rows.filter((r) => r.幽灵preload).map((r) => r.channel),
    未暴露: rows.filter((r) => r.未暴露).map((r) => r.channel),
    订阅无人推: rows.filter((r) => r.订阅无人推).map((r) => r.channel),
  };
}

const totalIpc = [...info.values()].reduce(
  (acc, r) => acc + (r.ipcHandles?.length ?? 0) + (r.ipcOns?.length ?? 0) + (r.sends?.length ?? 0),
  0,
);

if (wantJson) {
  console.log(
    JSON.stringify(
      {
        files: [...info.values()].map((r) => ({
          ...r,
          lazyRequires: r.lazyRequires ?? [],
          ipcHandles: r.ipcHandles ?? [],
          ipcOns: r.ipcOns ?? [],
          sends: r.sends ?? [],
        })),
        cycles,
        channelRecon,
      },
      (k, v) => (v instanceof Set ? [...v] : v),
      2,
    ),
  );
} else if (wantMd) {
  console.log('| 文件 | 行 | require(electron)顶层 | 惰性 require | 顶层副作用(候选数) | 单函数导出 | 改导出值 | 顶层 this | 导出名 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [rel, r] of [...info].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (r.parseError) {
      console.log(`| \`${rel}\` | ${r.lines} | ⚠️ 解析失败：${r.parseError} | | | | | | |`);
      continue;
    }
    console.log(
      `| \`${rel.replace('electron/', '')}\` | ${r.lines} | ${r.electronRequireTop ? '是' : '—'} | ${
        r.lazyRequires.length ? r.lazyRequires.map((l) => l.src).join(' · ') : '—'
      } | ${r.topCallCandidates.length} | ${r.singleFnExport ? '是' : '—'} | ${r.mutatesRequireBinding.length ? r.mutatesRequireBinding.length : '—'} | ${
        r.topLevelThis.length ? '是' : '—'
      } | ${(r.exportedNames ?? []).join(' · ') || '—'} |`,
    );
  }
} else {
  console.log(`════════ 清点表（electron/**，共 ${info.size} 个文件）════════`);
  for (const [rel, r] of [...info].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (r.parseError) {
      console.log(`\n── ${rel}（${r.lines} 行）⚠️ 解析失败：${r.parseError}`);
      continue;
    }
    console.log(`\n── ${rel}（${r.lines} 行）`);
    console.log(`   ① require('electron') 顶层：${r.electronRequireTop ? '是' : '否'}`);
    console.log(`   ② 顶层副作用候选（${r.topCallCandidates.length}）：${r.topCallCandidates.join(' ｜ ') || '无'}`);
    console.log(`   ③ 惰性/动态 require：${r.lazyRequires.map((l) => `${l.src}@depth${l.depth}`).join(' · ') || '无'}`);
    console.log(`   ⑤ 导出形态：${r.exportShape || '无导出'}${r.singleFnExport ? ` ⚠️ 单函数导出：${r.singleFnExport}` : ''}`);
    console.log(`   ⑥ 改 require 绑定的成员：${r.mutatesRequireBinding.join(' · ') || '无'}`);
    console.log(`   ⑦ 顶层 this：${r.topLevelThis.join(' · ') || '无'}`);
    console.log(`   导出名（${r.exportedNames.length}）：${r.exportedNames.join(', ') || '无'}`);
  }
}

console.log(`\n──── ④ 环（本脚本自建图，节点按 .js/.ts 归一）────`);
console.log(cycles.length ? cycles.map((c) => `  ⚠️ ${c}`).join('\n') : '  未发现环');

console.log(`\n──── A-4 频道（注册 handle ${[...info.values()].reduce((n, r) => n + (r.ipcHandles?.length ?? 0), 0)} · on ${[...info.values()].reduce((n, r) => n + (r.ipcOns?.length ?? 0), 0)} · send 推送 ${[...info.values()].reduce((n, r) => n + (r.sends?.length ?? 0), 0)}，合计 ${totalIpc} 处）────`);
for (const [rel, r] of [...info].sort((a, b) => a[0].localeCompare(b[0]))) {
  const n = (r.ipcHandles?.length ?? 0) + (r.ipcOns?.length ?? 0) + (r.sends?.length ?? 0);
  if (n === 0) continue;
  console.log(
    `  ${rel.padEnd(38)} handle ${r.ipcHandles.length} · on ${r.ipcOns.length} · send ${r.sends.length}  [${[...r.ipcHandles, ...r.ipcOns, ...r.sends].join(', ')}]`,
  );
}
if (channelRecon) {
  const short = (f) => f.replace('electron/', '');
  console.log(
    `\n──── A-4 频道对账（快照 ${channelRecon.source}：preload ${channelRecon.preloadCount} 个 · 后端注册 ${channelRecon.registeredCount} 个 · 名字并集 ${channelRecon.rows.length}）────`,
  );
  for (const r of channelRecon.rows) {
    const flags = [
      r.幽灵preload && '⚠️幽灵preload（无注册无出现）',
      r.未暴露 && '⚠️未暴露（有注册、preload 无名面）',
      r.订阅无人推 && '⚠️订阅无人推',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(
      `  ${r.channel.padEnd(32)} preload=${String(r.preload).padEnd(8)} 注册=[${r.registeredIn.map(short).join(',') || '—'}] 出现=[${
        r.mentionedIn.map(short).join(',') || '—'
      }] ${flags}`,
    );
  }
  console.log(
    `\n  小结：幽灵 preload ${channelRecon.幽灵preload.length} · 未暴露 ${channelRecon.未暴露.length} · 订阅无人推 ${channelRecon.订阅无人推.length}`,
  );
  if (channelRecon.未暴露.length) console.log(`  未暴露：${channelRecon.未暴露.join(', ')}`);
} else {
  console.log(`\n（未找到 ${path.relative(REPO, SNAPSHOT)} ⇒ 跳过频道对账；先跑 draft-channel-map.mjs --snapshot）`);
}
