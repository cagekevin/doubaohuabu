#!/usr/bin/env node
/**
 * verify-identical.mjs —— 「与原来一致」的**机械证明**（不需要人判读）
 *
 * 为什么需要它：`audit-conversion.mjs` 的口径是**集合差**（字符串/调用/运算符…的多重集），
 * 它能抓到"改了一个字符串、少调一次"，但**看不见顺序变化**，也**不做逐节点比对** ⇒
 * 它给的是"线索"，最终仍要人判。而本任务的标准是**"与原来一致"且不靠人判** ⇒
 * 这里换一种更强的做法：**逐语句、按顺序、逐节点**比，只放行**语言级等价**，其余全部列出来。
 *
 * 做法：
 *   新侧：当前 `.ts` 用 `typescript.transpileModule` **抹掉类型**（等价于编译，且**不做类型检查**，
 *         所以还没写完的文件也能比）再解析；
 *   原侧：`git` 里该文件**被删除前的那一版** `.js`（取删除提交的父提交）→ 解析。
 *   两侧都是**纯 JS** ⇒ 逐语句有序比较。任一处不等 ⇒ 记一条差异（带行号与片段）。
 *
 * 放行的等价（**每一条都是 JS 语言级恒等，不是我的判断**，且**逐项计数公示**）：
 *   R1 `x.y` ≡ `x['y']`（属性名是合法标识符时，JS 语义恒等）
 *   R2 引号风格 / 转义写法 / 注释 不参与比较
 *   R3 模块边界：新侧 tsc 前导（`"use strict"` / `__esModule` / `exports.x = void 0` /
 *      `var __importStar = …` 等 helper / `exports.x = x`）与原侧 `module.exports = {…}` ——
 *      这些是**载体差异**（CJS 导出形状），逐项计数公示，⛔ 不静默吞
 *   R4 `__importStar(require("Y"))` / `__importDefault(require("Y"))` ⇒ 归一回 `require("Y")`（同上，计数公示）
 *
 * 判据：**差异数 = 0** ⇒ 执行面与原来一致。退出码 0 / 1（有差异）。
 * 用法：node docs/plan/后端TS迁移/scripts/verify-identical.mjs [--json] [--max 8] [<文件.ts>…]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const maxIdx = args.indexOf('--max');
const MAX = maxIdx >= 0 ? Number(args[maxIdx + 1]) || 8 : 8;
const explicit = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));

const IGNORED_KEYS = new Set([
  'loc', 'start', 'end', 'range',
  'leadingComments', 'trailingComments', 'innerComments', 'comments',
  'extra', 'raw', 'rawValue', 'errors', 'tokens', 'typeAnnotation', 'returnType', 'typeParameters',
]);

/** 收集待比对文件 */
function collectFiles() {
  if (explicit.length) return explicit.map((p) => path.resolve(REPO, p));
  const root = path.join(REPO, 'electron');
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'tests' || e.name.startsWith('.')) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(fp);
    }
  };
  walk(root);
  return out;
}

/** 取 git 里该 .ts 对应的原 .js（删除该文件的提交的父提交） */
function originalSource(relTs) {
  const relJs = relTs.replace(/\.ts$/, '.js');
  let log = '';
  try {
    log = execSync(`git log --diff-filter=D --format=%H -- "${relJs}"`, { cwd: REPO, encoding: 'utf-8' }).trim();
  } catch {
    return { code: null, note: 'git log 失败' };
  }
  const sha = log.split('\n').filter(Boolean).pop();
  if (!sha) {
    // 在飞的批次：改名还没提交 ⇒ 没有删除记录，但 HEAD 里仍有该 .js ⇒ 直接取 HEAD 版比对
    try {
      return {
        code: execSync(`git show HEAD:${relJs}`, { cwd: REPO, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }),
        from: `HEAD:${relJs}（改名未提交）`,
      };
    } catch {
      return { code: null, note: 'git 里既无删除记录、HEAD 里也没有该 .js（可能是新建文件）' };
    }
  }
  let parent = '';
  try {
    parent = execSync(`git rev-parse ${sha}~1`, { cwd: REPO, encoding: 'utf-8' }).trim();
  } catch {
    parent = sha;
  }
  try {
    return { code: execSync(`git show ${parent}:${relJs}`, { cwd: REPO, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }), from: `${parent}:${relJs}` };
  } catch (e) {
    return { code: null, note: `git show 失败: ${e.message}` };
  }
}

/** .ts → 纯 JS（抹类型，不做类型检查 ⇒ 半成品也能比） */
function transpile(code) {
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
      esModuleInterop: true,
      removeComments: true,
      newLine: ts.NewLineKind.LineFeed,
    },
    fileName: 'x.ts',
  });
  return out.outputText;
}

const HELPERS = ['__importStar', '__importDefault', '__awaiter', '__generator', '__rest', '__spreadArray', '__values', '__read'];

/** 新侧模块前导归一化（逐项计数；⛔ 不静默） */
function normalizeNew(ast) {
  const stats = { dropped: {}, rewrittenRequire: 0, droppedExports: 0 };
  const bump = (k) => {
    stats.dropped[k] = (stats.dropped[k] ?? 0) + 1;
  };
  const body = [];
  for (const stmt of ast.program.body) {
    // "use strict" / Object.defineProperty(exports, "__esModule", …)
    if (stmt.type === 'ExpressionStatement' && stmt.expression?.type === 'StringLiteral' && stmt.expression.value === 'use strict') {
      bump('use strict');
      continue;
    }
    if (
      stmt.type === 'ExpressionStatement' &&
      stmt.expression?.type === 'CallExpression' &&
      stmt.expression.callee?.type === 'MemberExpression' &&
      stmt.expression.callee.object?.name === 'Object' &&
      stmt.expression.callee.property?.name === 'defineProperty' &&
      stmt.expression.arguments?.[0]?.name === 'exports'
    ) {
      bump('__esModule 标记');
      continue;
    }
    // helper 定义：var __importStar = (this && this.__importStar) || function …
    if (stmt.type === 'VariableDeclaration' && stmt.declarations?.length === 1) {
      const name = stmt.declarations[0].id?.name;
      if (HELPERS.includes(name)) {
        bump(`helper 定义 ${name}`);
        continue;
      }
    }
    // exports.x = x;  /  exports.x = void 0;
    if (
      stmt.type === 'ExpressionStatement' &&
      stmt.expression?.type === 'AssignmentExpression' &&
      stmt.expression.left?.type === 'MemberExpression' &&
      stmt.expression.left.object?.name === 'exports'
    ) {
      stats.droppedExports++;
      continue;
    }
    // const X = __importStar(require("Y"))  →  const X = require("Y")
    if (stmt.type === 'VariableDeclaration' && stmt.declarations?.length === 1) {
      const d = stmt.declarations[0];
      const init = d.init;
      if (
        init?.type === 'CallExpression' &&
        HELPERS.includes(init.callee?.name) &&
        init.arguments?.length === 1 &&
        init.arguments[0].type === 'CallExpression'
      ) {
        d.init = init.arguments[0];
        stats.rewrittenRequire++;
      }
    }
    body.push(stmt);
  }
  ast.program.body = body;
  return stats;
}

/** 原侧：`module.exports = { … }` 丢弃（载体差异，计数公示） */
function normalizeOld(ast) {
  const stats = { droppedModuleExports: 0 };
  ast.program.body = ast.program.body.filter((stmt) => {
    const isModuleExports =
      stmt.type === 'ExpressionStatement' &&
      stmt.expression?.type === 'AssignmentExpression' &&
      stmt.expression.left?.type === 'MemberExpression' &&
      stmt.expression.left.object?.name === 'module' &&
      stmt.expression.left.property?.name === 'exports';
    if (isModuleExports) {
      stats.droppedModuleExports++;
      return false;
    }
    return true;
  });
  return stats;
}

const propNameOf = (node) => {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'NumericLiteral') return String(node.value);
  return null;
};

/** 逐节点比较（有序、完全）；差异 push 到 diffs */
function eq(a, b, trail, diffs) {
  if (a === undefined && b === undefined) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) diffs.push({ trail, kind: '取值不同', a: String(a), b: String(b) });
    return a === b;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      diffs.push({ trail, kind: '数组/对象形状不同' });
      return false;
    }
    if (a.length !== b.length) {
      diffs.push({ trail, kind: `元素个数不同（原 ${a.length} / 现 ${b.length}）` });
      return false;
    }
    let ok = true;
    a.forEach((x, i) => {
      ok = eq(x, b[i], `${trail}[${i}]`, diffs) && ok;
    });
    return ok;
  }
  // R1：x.y ≡ x['y']
  if (a.type === 'MemberExpression' && b.type === 'MemberExpression') {
    const pa = propNameOf(a.property);
    const pb = propNameOf(b.property);
    if (pa !== null && pa === pb) {
      let ok = eq(a.object, b.object, `${trail}.object`, diffs);
      if (a.optional !== b.optional) {
        diffs.push({ trail, kind: '可选链差异', a: String(a.optional), b: String(b.optional) });
        ok = false;
      }
      return ok;
    }
  }
  if (a.type !== b.type) {
    diffs.push({ trail, kind: '节点类型不同', a: a.type, b: b.type });
    return false;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !IGNORED_KEYS.has(k)));
  let ok = true;
  for (const k of keys) {
    ok = eq(a[k], b[k], `${trail}.${k}`, diffs) && ok;
  }
  return ok;
}

const files = collectFiles();
const report = [];

for (const abs of files) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  const relJs = rel.replace(/\.ts$/, '.js');
  const tsCode = fs.readFileSync(abs, 'utf8');
  const orig = originalSource(rel);
  if (!orig.code) {
    report.push({ file: rel, skip: orig.note });
    continue;
  }
  const newCode = transpile(tsCode);
  const astNew = parse(newCode, { sourceType: 'unambiguous', allowReturnOutsideFunction: true });
  const astOld = parse(orig.code, { sourceType: 'unambiguous', allowReturnOutsideFunction: true });
  const nNew = normalizeNew(astNew);
  const nOld = normalizeOld(astOld);

  const diffs = [];
  // 顶层语句数不同 ⇒ 先记一条（随后仍逐条比到较短的那份为止）
  const bodyOld = astOld.program.body;
  const bodyNew = astNew.program.body;
  if (bodyOld.length !== bodyNew.length) {
    diffs.push({ trail: '<顶层>', kind: `顶层语句数不同（原 ${bodyOld.length} / 现 ${bodyNew.length}）` });
  }
  const n = Math.min(bodyOld.length, bodyNew.length);
  for (let i = 0; i < n; i++) {
    eq(bodyOld[i], bodyNew[i], `#${i}`, diffs);
  }
  report.push({
    file: rel,
    from: orig.from,
    normalization: { 新侧: nNew, 原侧: nOld },
    diffs,
  });
}

if (wantJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  let total = 0;
  console.log('════════ 「与原来一致」机械比对（编译产物 vs git 里的原 .js，逐语句有序）════════\n');
  for (const r of report) {
    if (r.skip) {
      console.log(`── ${r.file}\n   ⚠️ 跳过：${r.skip}\n`);
      continue;
    }
    total += r.diffs.length;
    const n = r.normalization;
    console.log(`── ${r.file}`);
    console.log(
      `   归一化（载体差异，逐项公示）：新侧丢弃 ${JSON.stringify(n.新侧.dropped)} · exports 行 ${n.新侧.droppedExports} · require 包装归一 ${n.新侧.rewrittenRequire} ｜ 原侧 module.exports ${n.原侧.droppedModuleExports}`,
    );
    if (!r.diffs.length) {
      console.log('   ✅ 差异 0 条 —— 执行面与原来一致\n');
      continue;
    }
    console.log(`   ❌ 差异 ${r.diffs.length} 条：`);
    for (const d of r.diffs.slice(0, MAX)) {
      console.log(`      · ${d.trail} ｜ ${d.kind}${d.a !== undefined ? ` ｜ 原 ${d.a}` : ''}${d.b !== undefined ? ` ⇒ 现 ${d.b}` : ''}`);
    }
    if (r.diffs.length > MAX) console.log(`      …（其余 ${r.diffs.length - MAX} 条，用 --max 调）`);
    console.log('');
  }
  console.log(`合计：${report.filter((r) => !r.skip).length} 个文件参与比对 · **差异 ${total} 条**（0 才叫"与原来一致"）`);
}
process.exit(report.some((r) => !r.skip && r.diffs.length) ? 1 : 0);
