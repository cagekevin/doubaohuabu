#!/usr/bin/env node
/**
 * draft-handler-returns.mjs —— 「待补形状」清单（§11.2 契约）
 *
 * 做什么：AST 抽 **每个 IPC handler 的 `return <expr>`**，输出「字段名 ＋ 形状种类」的清单，
 *         供人补 `src/stable/ipc-channels.ts` 里各条目的 `ret`（§5.2 的字段面）。
 * ⛔ **不猜类型**：脚本只报"看到了什么形状"，判不出的（外调返回、条件分支混合、标识符透传）
 *    一律原样报出来 —— 类型与判别联合是**人的判断活**（§11.5）。
 * 输入：`electron` 下的 `.ts`（handler 现在都在这里）。
 * 输出：人读表（`--json` 给机器读）。**只读**，不写任何文件（天然 dry）。
 *
 * 用法：node docs/plan/后端TS迁移/scripts/draft-handler-returns.mjs [--json] [--max N] [<文件.ts>…]
 * 退出码：0 = 跑完 · 2 = 用法/环境错。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`draft-handler-returns.mjs —— 抽 handler 的 return 形状（§11.2）

用法：node .../draft-handler-returns.mjs [--json] [--max N] [<文件.ts>…]
  --json    机器读
  --max N   each channel 最多打印 N 种形状（默认 6）
缺省扫描：electron/**/*.ts（排除 dist / node_modules / tests / *.d.ts）`);
  process.exit(0);
}
const wantJson = args.includes('--json');
const maxIdx = args.indexOf('--max');
const MAX = maxIdx >= 0 ? Number(args[maxIdx + 1]) || 6 : 6;
const explicit = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));

/** 收集待扫文件 */
function collectFiles() {
  if (explicit.length) return explicit.map((p) => path.resolve(REPO, p));
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'tests'].includes(e.name) || e.name.startsWith('.')) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(fp);
    }
  };
  walk(path.join(REPO, 'electron'));
  return out;
}

/** 形状描述：只报"看到了什么"，不做类型推断 */
function describe(node) {
  if (!node) return '?';
  switch (node.type) {
    case 'ObjectExpression': {
      const parts = node.properties.map((pr) => {
        if (pr.type === 'SpreadElement') return '...';
        const k = pr.key.type === 'Identifier' ? pr.key.name : pr.key.type === 'StringLiteral' ? `'${pr.key.value}'` : `[${pr.key.type}]`;
        return k + (pr.value && pr.value.type === 'ConditionalExpression' ? '?' : '');
      });
      return `{ ${parts.join(', ')} }`;
    }
    case 'ArrayExpression':
      return '[]';
    case 'Identifier':
      return `<标识符 ${node.name}>`;
    case 'CallExpression': {
      const c = node.callee;
      const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' ? `${c.object?.name ?? '?'}.${c.property?.name ?? '?'}` : c.type;
      return `<调用 ${name}(…)>`;
    }
    case 'ConditionalExpression':
      return `${describe(node.consequent)} | ${describe(node.alternate)}`;
    case 'LogicalExpression':
      return `${describe(node.left)} || ${describe(node.right)}`;
    case 'AwaitExpression':
      return describe(node.argument);
    case 'TSAsExpression':
    case 'TSNonNullExpression':
      return describe(node.expression);
    case 'StringLiteral':
      return `'${node.value}'`;
    case 'NumericLiteral':
      return String(node.value);
    case 'BooleanLiteral':
      return String(node.value);
    case 'NullLiteral':
      return 'null';
    default:
      return `<${node.type}>`;
  }
}

/** 本文件里「具名函数的 return 形状」表（供解析 handler 的委托调用：`return f(...)`） */
function localFnReturns(ast) {
  const map = new Map();
  let only = 0;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node.type) return;
    if (
      (node.type === 'FunctionDeclaration' && node.id?.name) ||
      (node.type === 'VariableDeclarator' &&
        node.id?.type === 'Identifier' &&
        (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression'))
    ) {
      const name = node.type === 'FunctionDeclaration' ? node.id.name : node.id.name;
      const fn = node.type === 'FunctionDeclaration' ? node : node.init;
      if (only++ < 5000) map.set(name, collectReturns(fn));
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'comments') continue;
      walk(node[k]);
    }
  };
  walk(ast);
  return map;
}

/** 收集「本 handler 自身」的 return（不进嵌套函数体） */
function collectReturns(fnNode) {
  // 表达式体箭头函数：`(_e, id) => cancelJob(id)` —— 体本身就是回执
  if (fnNode.body && fnNode.body.type !== 'BlockStatement') return [describe(fnNode.body)];
  const out = [];
  const walk = (node, insideNested) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, insideNested));
      return;
    }
    if (!node.type) return;
    const isFn =
      node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration';
    if (isFn && node !== fnNode) {
      // 嵌套函数体内的 return 不属于本 handler（它是自己的回执）
      return;
    }
    if (node.type === 'ReturnStatement') {
      out.push(describe(node.argument));
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k.startsWith('leading') || k === 'comments') continue;
      walk(node[k], insideNested);
    }
  };
  walk(fnNode.body, false);
  return out;
}

const files = collectFiles();
const rows = [];
for (const abs of files) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  let ast;
  try {
    ast = parse(fs.readFileSync(abs, 'utf8'), { sourceType: 'module', plugins: ['typescript'] });
  } catch (e) {
    rows.push({ file: rel, error: String(e.message) });
    continue;
  }
  const fnMap = localFnReturns(ast);
  /** 把 `return f(...)` 展开成本文件 f 的 return 形状（一层，够用；⛔ 仍不猜类型） */
  const expand = (shapes) =>
    shapes.flatMap((s) => {
      const m = /^<调用 ([A-Za-z_$][\w$]*)\(…\)>$/.exec(s);
      if (m && fnMap.has(m[1])) return [...fnMap.get(m[1]).map((x) => `${x}   ← ${m[1]}`)];
      return [s];
    });
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node.type) return;
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && ['handle', 'on'].includes(node.callee.name)) {
      const chan = node.arguments?.[0]?.type === 'StringLiteral' ? node.arguments[0].value : null;
      const cb = node.arguments?.[1];
      if (chan && cb) {
        const kind = node.callee.name === 'handle' ? 'invoke' : 'on';
        rows.push({ file: rel, kind, channel: chan, returns: expand(collectReturns(cb)) });
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'comments') continue;
      walk(node[k]);
    }
  };
  walk(ast);
}

rows.sort((a, b) => (a.file + a.channel).localeCompare(b.file + b.channel));

if (wantJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log(`════════ 待补形状清单（handler 的 return 形状 · 脚本不猜类型）════════\n`);
  let n = 0;
  for (const r of rows) {
    if (r.error) {
      console.log(`── ${r.file}  ⚠️ 解析失败：${r.error}\n`);
      continue;
    }
    n++;
    const uniq = [...new Set(r.returns)];
    console.log(`── [${r.kind}] ${r.channel}   （${r.file}）`);
    if (!uniq.length) console.log('    （无 return —— 可能只靠 e.returnValue 或纯副作用）');
    else
      uniq.slice(0, MAX).forEach((s, i) => {
        const cnt = r.returns.filter((x) => x === s).length;
        console.log(`    ${i + 1}. ${s}${cnt > 1 ? `   ×${cnt}` : ''}`);
      });
    if (uniq.length > MAX) console.log(`    …（其余 ${uniq.length - MAX} 种，用 --max 调）`);
    console.log('');
  }
  console.log(`合计 ${n} 个 handler · 只报形状不猜类型 ⇒ 由人填 \`ret\`（§5.2）`);
}
