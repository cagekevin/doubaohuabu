#!/usr/bin/env node
/**
 * check-passthrough.mjs —— 混合期**过桥核对**：`electron/**\/*.js` 的**源**与产物**逐个比**。
 *
 * 为什么要有它（README §6 S0-6 末行 / 弯路 W11）：`allowJs` passthrough **不是「零改动」**——
 * tsc 对 `.js` 输入仍按其 `target`/`module` 重打一遍（加 `"use strict"` / `__esModule` 标记 /
 * `exports.X = void 0`，并把 `if (x) return;` 这类单行语句重排成多行）。
 * 「今天的运行期行为可能已经变了」**只能靠比**回答，不能靠"我小心了"。
 *
 * ★ 比的是 **AST**（`@babel/parser`），不是文本 —— 否则输出的重排会把 27 个文件全报成"实质"，
 *   把真正要看的那一处埋掉（B0-a 实测：文本行比 ⇒ 23/28 假红；AST 比 ⇒ 见 `日志.md`）。
 *
 * 判级：
 *   · `同`     —— AST 完全一致
 *   · `头`     —— 只多/少已知的无语义外壳（directive `use strict` · `__esModule` 标记 · `exports.X = void 0`)
 *   · `实质`  —— 其余任何差异 ⇒ **必须逐处核对**（B3/B4 前不得视作等价）
 *   · `缺产物` —— 源在、产物不在 ⇒ 构建链漏了文件
 *   · `解析失败` —— 任一侧 `@babel/parser` 解析不了 ⇒ 脚本无法判定，**不当成通过**
 * 退出码：0 = 无「实质/缺产物/解析失败」；1 = 有；2 = 用法或环境错。
 *
 * 用法：
 *   node docs/plan/后端TS迁移/scripts/check-passthrough.mjs [--json] [--help]
 * 前置：`npx tsc -p electron/tsconfig.json` 产出 `electron/dist/`。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const SRC_ROOT = path.join(REPO, 'electron');
const OUT_ROOT = path.join(SRC_ROOT, 'dist');
const SKIP_DIRS = new Set(['node_modules', 'dist']);

/**
 * 刻意**不进编译**的文件（不是漏产物）：guest 主世界文本注入脚本不能 `require`，
 * 由 `build-electron.mjs` 原样拷进 `electron/dist/`。列在这里 ⇒ 显式打印，不静默跳过。
 */
const NOT_COMPILED = new Set(['dola-duration-main.js']);

/** AST 里与语义无关的字段（位置 / 注释 / 原始文本缓存） */
const NOISE_KEYS = new Set([
  'start',
  'end',
  'loc',
  'range',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'comments',
  'errors',
  'tokens',
]);

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`check-passthrough.mjs —— 过桥核对（源 electron/**/*.js vs electron/dist 产物，AST 级）

用法：
  node .../check-passthrough.mjs [--json] [--help]

选项：
  --json   机器可读输出
  --help   本帮助

判级：同 / 头（只多 use strict · __esModule · exports.X = void 0）/ 实质 / 缺产物 / 解析失败
前置：npx tsc -p electron/tsconfig.json`);
  process.exit(0);
}
const wantJson = args.includes('--json');

if (!fs.existsSync(OUT_ROOT)) {
  console.error(`❌ 找不到产物目录：${path.relative(REPO, OUT_ROOT)} —— 先跑 \`npx tsc -p electron/tsconfig.json\``);
  process.exit(2);
}

function walkJs(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
      walkJs(path.join(dir, ent.name), acc);
    } else if (ent.name.endsWith('.js')) {
      acc.push(path.join(dir, ent.name));
    }
  }
  return acc;
}

function parseFile(file) {
  const code = fs.readFileSync(file, 'utf-8');
  const ast = parse(code, {
    sourceType: 'unambiguous',
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    errorRecovery: false,
  });
  return { code, ast };
}

/** 深度归一：剔掉位置/注释字段后 dump（键名排序保证确定性） */
function dump(node) {
  if (Array.isArray(node)) return node.map(dump);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const k of Object.keys(node).sort()) {
    if (NOISE_KEYS.has(k)) continue;
    out[k] = dump(node[k]);
  }
  return out;
}

/** 已知的无语义外壳语句（tsc 对 `.js` 输入补的） */
function isShimStatement(stmt) {
  if (stmt.type !== 'ExpressionStatement') return false;
  const e = stmt.expression;
  // Object.defineProperty(exports, "__esModule", { value: true });
  if (
    e.type === 'CallExpression' &&
    e.callee.type === 'MemberExpression' &&
    e.callee.object.name === 'Object' &&
    e.callee.property.name === 'defineProperty'
  ) {
    return true;
  }
  // exports.<name> = void 0;
  if (
    e.type === 'AssignmentExpression' &&
    e.operator === '=' &&
    e.right.type === 'UnaryExpression' &&
    e.left.type === 'MemberExpression' &&
    e.left.object.name === 'exports'
  ) {
    return true;
  }
  return false;
}

/**
 * `"use strict"` 注入带来的**真语义变化面**（sloppy → strict）：只在「产物多出 use strict」的文件上查。
 * 查的都是**早错/行为改变**的形态，不是风格：
 *   · `with` 语句 · `arguments.callee/caller` · 八进制字面量 · `delete <标识符>`
 *   · **给未声明名赋值**（sloppy 下静默造全局，strict 下抛 ReferenceError）
 * 判据：查不到 ⇒ 这条差异对运行期**无可观察影响**；查到 ⇒ 逐处人工核对（记日志）。
 */
function strictRiskFindings(code, ast) {
  const declared = new Set();
  const assigned = new Map(); // name → 位置
  const findings = [];

  /** 绑定位里出现的所有名字（解构 / rest / 默认值都要算「已声明」） */
  const declarePattern = (pat) => {
    if (!pat || typeof pat !== 'object') return;
    switch (pat.type) {
      case 'Identifier':
        declared.add(pat.name);
        break;
      case 'ObjectPattern':
        for (const p of pat.properties) declarePattern(p.value ?? p.argument ?? p);
        break;
      case 'ArrayPattern':
        for (const el of pat.elements) declarePattern(el);
        break;
      case 'RestElement':
        declarePattern(pat.argument);
        break;
      case 'AssignmentPattern':
        declarePattern(pat.left);
        break;
      default:
        break;
    }
  };

  (function walk(node, fn) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, fn);
      return;
    }
    if (typeof node.type === 'string') fn(node);
    for (const k of Object.keys(node)) {
      if (NOISE_KEYS.has(k)) continue;
      walk(node[k], fn);
    }
  })(ast, (node) => {
    switch (node.type) {
      case 'VariableDeclarator':
        declarePattern(node.id);
        break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (node.id) declarePattern(node.id);
        for (const p of node.params) declarePattern(p);
        break;
      case 'CatchClause':
        declarePattern(node.param);
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (node.id) declarePattern(node.id);
        break;
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
      case 'ImportSpecifier':
        if (node.local) declarePattern(node.local);
        break;
      case 'AssignmentExpression':
        if (node.left.type === 'Identifier') assigned.set(node.left.name, node.left.start);
        break;
      case 'UpdateExpression':
        if (node.argument.type === 'Identifier') assigned.set(node.argument.name, node.argument.start);
        break;
      case 'WithStatement':
        findings.push(`with 语句（${code.slice(node.start, node.start + 60).replace(/\s+/g, ' ')}）`);
        break;
      case 'MemberExpression':
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'arguments' &&
          node.property.type === 'Identifier' &&
          (node.property.name === 'callee' || node.property.name === 'caller')
        ) {
          findings.push(`arguments.${node.property.name}`);
        }
        break;
      case 'UnaryExpression':
        if (node.operator === 'delete' && node.argument.type === 'Identifier') {
          findings.push(`delete 变量 ${node.argument.name}`);
        }
        break;
      case 'NumericLiteral':
        if (/^0[0-7]+$/.test(code.slice(node.start, node.end))) findings.push(`八进制字面量 ${code.slice(node.start, node.end)}`);
        break;
      default:
        break;
    }
  });

  // 未声明就赋值 ⇒ sloppy 造全局 / strict 抛错
  const GLOBAL_OK = new Set(['exports', 'module', 'globalThis']);
  for (const [name, pos] of assigned) {
    if (!declared.has(name) && !GLOBAL_OK.has(name)) {
      findings.push(`给未声明名赋值 ${name}（${code.slice(Math.max(0, pos - 40), pos + 20).replace(/\s+/g, ' ')}）`);
    }
  }
  return findings;
}

function bodyWithoutShims(ast) {
  const body = ast.program.body.filter((s) => !isShimStatement(s));
  const directives = (ast.program.directives ?? []).filter((d) => d.value.value === 'use strict');
  return { body: dump(body), directives: dump(directives) };
}

/** 首个差异的线索（语句级，够定位即可） */
function firstDiffHint(aCode, aAst, bCode, bAst) {
  const a = aAst.program.body.filter((s) => !isShimStatement(s));
  const b = bAst.program.body.filter((s) => !isShimStatement(s));
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const da = dump(a[i]);
    const db = dump(b[i]);
    if (JSON.stringify(da) !== JSON.stringify(db)) {
      const snippet = (code, node) =>
        node ? code.slice(node.start, Math.min(node.end, node.start + 160)).replace(/\s+/g, ' ').trim() : '(无)';
      return `第 ${i + 1} 条顶层语句不同\n       源: ${snippet(aCode, a[i])}\n       产物: ${snippet(bCode, b[i])}`;
    }
  }
  return '顶层语句一致 ⇒ 差异在嵌套或指令区（需人工看）';
}

const results = [];
for (const src of walkJs(SRC_ROOT)) {
  const rel = path.relative(SRC_ROOT, src).split(path.sep).join('/');
  if (NOT_COMPILED.has(rel)) {
    results.push({ file: rel, verdict: '不编译', detail: 'guest 注入脚本：由 build-electron 原样拷进 dist' });
    continue;
  }
  const out = path.join(OUT_ROOT, rel);
  if (!fs.existsSync(out)) {
    results.push({ file: rel, verdict: '缺产物', detail: '源在、产物不在' });
    continue;
  }
  let a;
  let b;
  try {
    a = parseFile(src);
    b = parseFile(out);
  } catch (err) {
    results.push({ file: rel, verdict: '解析失败', detail: String(err && err.message) });
    continue;
  }
  const na = bodyWithoutShims(a.ast);
  const nb = bodyWithoutShims(b.ast);
  if (JSON.stringify(na.body) === JSON.stringify(nb.body) && na.directives.length === nb.directives.length) {
    results.push({ file: rel, verdict: '同', detail: '' });
    continue;
  }
  if (JSON.stringify(na.body) === JSON.stringify(nb.body)) {
    // 语句区一致 ⇒ 差异只在指令区（use strict 注入）⇒ 查它的语义风险面（sloppy → strict）
    results.push({
      file: rel,
      verdict: '头',
      detail: '只多/少 use strict 指令',
      strictRisk: strictRiskFindings(a.code, a.ast),
    });
    continue;
  }
  results.push({ file: rel, verdict: '实质', detail: firstDiffHint(a.code, a.ast, b.code, b.ast) });
}

const tally = (v) => results.filter((r) => r.verdict === v).length;
const bad = results.filter((r) => ['实质', '缺产物', '解析失败'].includes(r.verdict));
/** `use strict` 注入的真语义风险（有 ⇒ 也要红：sloppy→strict 只能靠人核对，不能假装无事） */
const risky = results.filter((r) => (r.strictRisk ?? []).length > 0);

if (wantJson) {
  console.log(
    JSON.stringify(
      {
        root: 'electron',
        tally: {
          同: tally('同'),
          头: tally('头'),
          实质: tally('实质'),
          缺产物: tally('缺产物'),
          解析失败: tally('解析失败'),
          不编译: tally('不编译'),
          strict风险: risky.length,
        },
        results,
      },
      null,
      2,
    ),
  );
} else {
  console.log('════════ 过桥核对（AST 级：源 electron/**/*.js → 产物 electron/dist/**/*.js）════════');
  for (const r of results) {
    if (r.verdict === '同') continue;
    console.log(`  ${r.verdict.padEnd(4)} ${r.file}${r.detail ? `\n       ${r.detail}` : ''}`);
  }
  console.log(
    `\n合计 ${results.length}：同 ${tally('同')} · 头 ${tally('头')} · 实质 ${tally('实质')} · 缺产物 ${tally('缺产物')} · 解析失败 ${tally('解析失败')} · 不编译 ${tally('不编译')}`,
  );
  console.log(`\n──── use strict 注入的语义风险面（sloppy → strict，查到就必须人工核对）────`);
  if (risky.length === 0) {
    console.log('  无（with / arguments.callee / 八进制 / delete 变量 / 给未声明名赋值 均未命中）');
  } else {
    for (const r of risky) console.log(`  ⚠️ ${r.file}\n       ${r.strictRisk.join('\n       ')}`);
  }
}

process.exit(bad.length > 0 || risky.length > 0 ? 1 : 0);
