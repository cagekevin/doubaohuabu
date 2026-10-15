#!/usr/bin/env node
/**
 * codemod-boundary.mjs —— **模块边界改写**（机械面，B2 起逐文件用）。
 *
 * 只做两件事（README §11.2 的契约）：
 *   ① 顶层 `const {a, b} = require('x')` → `import { a, b } from 'x'`
 *      顶层 `const x = require('x')`      → `import x from 'x'`
 *   ② 顶层 `module.exports = { a, b }`   → `export { a, b };`
 *
 * ⛔ **拒绝并报告**（不猜，落拒绝清单）：
 *   · 函数内 / 动态 `require()`（时机是行为的一部分 —— 弯路 W9/C-3）
 *   · `module.exports = fn`（单函数导出：编译器给不出类型 ⇒ 具名函数 ＋ named export，属判断活）
 *   · `export default` 形态 · `exports.x = …` 逐属性导出 · 重导出
 *
 * ★ **副作用导入不得被删**（弯路 W28 / `verbatimModuleSyntax` 已关）：
 *   只为副作用的裸 `require('./x')` → 裸 `import './x'`（⚠️ 本项目后端是 CJS 产物，
 *   裸 `import` 会被 tsc 转成 `require`，**不会被擦除**）—— 但**绝不**因为"看着没用"就删。
 *
 * 纪律（§11.1）：改源文件 ⇒ **默认 dry ＋ `--write`**；幂等；确定性；改前打印受影响文件与改动清单。
 * 用法：
 *   node docs/plan/后端TS迁移/scripts/codemod-boundary.mjs [--write] [--json] [--help] <文件…>
 * 退出码：0 = 无拒绝项（可能已改写）· 1 = 有拒绝项（**需人判**，该文件不要半自动改）· 2 = 用法/环境错。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`codemod-boundary.mjs —— 顶层 require/module.exports → ESM 具名形态（机械面）

用法：node .../codemod-boundary.mjs [--write] [--json] [--help] <文件…>
  --write  落盘（默认 dry：只打印改动清单）
  --json   机器可读
  --help   本帮助

拒绝项（⛔ 不猜，需人判）：函数内/动态 require · module.exports = fn · default 形态 · exports.x = …`);
  process.exit(args.length === 0 ? 2 : 0);
}
const wantWrite = args.includes('--write');
const wantJson = args.includes('--json');
const files = args.filter((a) => !a.startsWith('--')).map((f) => path.resolve(REPO, f));

const isFn = (t) => /Function(Declaration|Expression)$/.test(t) || t === 'ArrowFunctionExpression' || /Method$/.test(t);

/** 收集「顶层」语句里可机械改写的形态；函数体内的 require 一律进拒绝清单 */
function analyze(rel, code) {
  const ast = parse(code, { sourceType: 'unambiguous', allowReturnOutsideFunction: true });
  const edits = [];
  const refusals = [];

  // 函数体内的 require（含动态）⇒ 拒绝
  const walkFns = (node, inFn) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) walkFns(n, inFn);
      return;
    }
    if (typeof node.type !== 'string') {
      for (const k of Object.keys(node)) walkFns(node[k], inFn);
      return;
    }
    const nowInFn = inFn || isFn(node.type);
    if (node.type === 'CallExpression' && node.callee?.name === 'require') {
      const arg = node.arguments?.[0];
      const literal = arg?.type === 'StringLiteral';
      if (nowInFn) refusals.push(`函数内 require（时机是行为的一部分，保留原样）：第 ${lineOf(code, node.start)} 行`);
      else if (!literal) refusals.push(`动态 require（非字面量）：第 ${lineOf(code, node.start)} 行`);
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k.endsWith('Comments')) continue;
      walkFns(node[k], nowInFn);
    }
  };
  walkFns(ast, false);

  for (const stmt of ast.program.body) {
    // ① 顶层 require 声明
    if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const') {
      const groups = [];
      let allRequire = true;
      for (const d of stmt.declarations) {
        if (!(d.init?.type === 'CallExpression' && d.init.callee?.name === 'require' && d.init.arguments?.[0]?.type === 'StringLiteral')) {
          allRequire = false;
          break;
        }
        groups.push({ id: d.id, src: d.init.arguments[0].value });
      }
      if (allRequire && groups.length) {
        const lines = groups.map(({ id, src }) => {
          if (id.type === 'ObjectPattern') {
            const names = id.properties.map((p) => {
              if (p.type === 'ObjectProperty' && p.key.name && p.value.type === 'Identifier' && p.key.name === p.value.name) return p.key.name;
              return null;
            });
            if (names.some((n) => n === null)) {
              refusals.push(`解构里带重命名/嵌套（需人判）：第 ${lineOf(code, stmt.start)} 行`);
              return null;
            }
            return `import { ${names.join(', ')} } from '${src}';`;
          }
          if (id.type === 'Identifier') return `import ${id.name} from '${src}';`;
          refusals.push(`require 绑定形态不认识（${id.type}）：第 ${lineOf(code, stmt.start)} 行`);
          return null;
        });
        if (lines.every(Boolean)) edits.push({ start: stmt.start, end: stmt.end, text: lines.join('\n') });
      }
    }
    // ② 裸 require（只为副作用）
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression' && stmt.expression.callee?.name === 'require') {
      const arg = stmt.expression.arguments?.[0];
      if (arg?.type === 'StringLiteral') edits.push({ start: stmt.start, end: stmt.end, text: `import '${arg.value}'; // 副作用导入：⛔ 不许删（见 codemod-boundary 头注）` });
      else refusals.push(`动态裸 require：第 ${lineOf(code, stmt.start)} 行`);
    }
    // ③ module.exports
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression') {
      const { left, right } = stmt.expression;
      const leftText = code.slice(left.start, left.end);
      if (leftText === 'module.exports') {
        if (right.type === 'ObjectExpression') {
          const names = [];
          let ok = true;
          for (const p of right.properties) {
            if (p.type === 'ObjectProperty' && p.shorthand) names.push(code.slice(p.key.start, p.key.end));
            else if (p.type === 'ObjectProperty' && p.key.type === 'Identifier' && p.value.type === 'Identifier') {
              refusals.push(`导出别名（需人判：${p.key.name}: ${p.value.name}）：第 ${lineOf(code, stmt.start)} 行`);
              ok = false;
            } else {
              refusals.push(`导出项形态不认识（${p.type}）：第 ${lineOf(code, stmt.start)} 行`);
              ok = false;
            }
          }
          if (ok) edits.push({ start: stmt.start, end: stmt.end, text: `export { ${names.join(', ')} };` });
        } else {
          refusals.push(`module.exports = ${right.type}（单函数/表达式导出 —— 属判断活：具名函数 ＋ named export）：第 ${lineOf(code, stmt.start)} 行`);
        }
      } else if (left.type === 'MemberExpression' && left.object?.name === 'exports') {
        refusals.push(`exports.${left.property?.name} = …（逐属性导出 —— 属判断活）：第 ${lineOf(code, stmt.start)} 行`);
      }
    }
  }
  return { rel, edits, refusals };
}

function lineOf(code, pos) {
  return code.slice(0, pos).split('\n').length;
}

const report = [];
let refused = 0;
for (const abs of files) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  if (!fs.existsSync(abs)) {
    console.error(`❌ 文件不存在：${rel}`);
    process.exit(2);
  }
  const code = fs.readFileSync(abs, 'utf-8');
  const { edits, refusals } = analyze(rel, code);
  refused += refusals.length ? 1 : 0;
  const changed = edits.length > 0;
  report.push({ rel, edits: edits.map((e) => `${lineOf(code, e.start)}: ${e.text.split('\n')[0]}…`), refusals, changed });

  if (wantJson) continue;
  console.log(`\n── ${rel}`);
  if (refusals.length) for (const r of refusals) console.log(`   ⛔ 拒绝：${r}`);
  if (!changed) console.log('   （无可机械改写项）');
  for (const e of edits) console.log(`   ↻ 第 ${lineOf(code, e.start)} 行：${e.text.split('\n').join(' / ')}`);

  if (wantWrite && changed && refusals.length === 0) {
    let out = code;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    fs.writeFileSync(abs, out, 'utf-8');
    console.log('   ✅ 已写盘');
  } else if (wantWrite && refusals.length) {
    console.log('   ⚠️ 有拒绝项 ⇒ **跳过写盘**（半自动改会漏一个导出 ⇒ 运行期断、编译期不报）');
  }
}

if (wantJson) console.log(JSON.stringify(report, null, 2));
console.log(`\n合计 ${files.length} 个文件 · 有改动 ${report.filter((r) => r.changed).length} · 含拒绝项 ${refused}`);
console.log(wantWrite ? '（--write 已生效：有拒绝项的文件一律跳过）' : '（dry：未写盘；要落盘加 --write）');
process.exit(refused ? 1 : 0);
