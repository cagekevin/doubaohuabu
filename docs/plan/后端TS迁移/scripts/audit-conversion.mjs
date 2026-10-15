#!/usr/bin/env node
/**
 * audit-conversion.mjs —— **转换质量审计**：把当前 `.ts` 与 git 里的原 `.js`（转换前那一版）
 * 做 **AST 级结构对账**，回答一个问题：**除了"类型面"以外，我到底动了什么？**
 *
 * 三个口径（各自独立报告，⛔ 不混成一个"看起来对"）：
 *   ① **可执行结构差异** —— 剔掉类型标注 / 类型声明 / 导入 / 导出后逐节点比对，
 *      给"路径 + 原片段 + 现片段"。预期差异应当**逐条**能对上日志里的 sanctioned 微改；对不上的就是漂移。
 *   ② **导入面** —— 原文件 `require(X)` 的目标集合 vs 现文件 `import … from X` 的目标集合（应当相等）。
 *   ③ **导出面** —— 原 `module.exports = …` / `exports.x = …` 的名字集合 vs 现 `export { … }`。
 *
 * 判据：① 的每一条都必须在**日志**里有出处（要么"仅类型"，要么"已登记的微改"）。
 * 用法：node docs/plan/后端TS迁移/scripts/audit-conversion.mjs [--json] [--max 6] [<文件.ts>…]
 * 退出码：0 = 跑完（差异数不代表对错，需人判）· 2 = 用法/环境错。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`audit-conversion.mjs —— 转换质量审计（AST 级结构对账）

用法：node .../audit-conversion.mjs [--json] [--max 6] [<文件.ts>…] [--help]
  --max N  每文件每类最多打印 N 条（默认 6）
缺省审计范围：electron/**/*.ts（排除 *.d.ts 与 tests/）`);
  process.exit(0);
}
const wantJson = args.includes('--json');
const wantStruct = args.includes('--struct');
const maxIdx = args.indexOf('--max');
const MAX = maxIdx >= 0 ? Number(args[maxIdx + 1]) || 6 : 6;
const explicit = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));

/** 当前已转的 .ts（排除声明文件与测试） */
function defaultTargets() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', 'dist'].includes(e.name) || e.name.startsWith('.')) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !fp.includes(`${path.sep}tests${path.sep}`)) out.push(fp);
    }
  };
  walk(path.join(REPO, 'electron'));
  return out;
}

/** 取"转换前那一版"的 .js 原文（从 git：删除该文件的最后一个 commit 的父提交里取） */
function originalJs(relTs) {
  const relJs = relTs.replace(/\.ts$/, '.js');
  let sha = '';
  try {
    const log = execSync(`git log --diff-filter=D --format=%h -- "${relJs}"`, { cwd: REPO, encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    sha = log[log.length - 1] ?? '';
    if (!sha) return { code: null, note: '该 .js 在 git 里找不到删除记录' };
    // ⚠️ 先解析父提交再取文件：直接写 `<sha>^` 会被 PowerShell 吃掉 `^`（git 收到的是不带 ^ 的 rev ⇒
    //    "path does not exist in <sha>"）。用 rev-parse 拿哈希，show 里就只剩 `<哈希>:<路径>`。
    const parent = execSync(`git rev-parse ${sha}~1`, { cwd: REPO, encoding: 'utf-8' }).trim();
    const code = execSync(`git show ${parent}:${relJs}`, { cwd: REPO, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
    return { code, from: `${parent}:${relJs}` };
  } catch (err) {
    return { code: null, note: `git 取原文失败：${String(err && err.message).slice(0, 120)}` };
  }
}

const TS_TYPES = new Set([
  'TSTypeAnnotation',
  'TSTypeParameterDeclaration',
  'TSTypeParameterInstantiation',
  'TSReturnTypeAnnotation',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSDeclareFunction',
  'TSModuleDeclaration',
  'TSImportType',
  'TSEnumDeclaration',
]);

/** 剔掉类型面 / 导入导出 / 位置信息，只留"可执行结构" */
function normalize(node, out = {}) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => normalize(n)).filter((n) => n !== undefined);
  if (typeof node.type !== 'string') return undefined;
  if (TS_TYPES.has(node.type)) return undefined; // 整棵类型子树丢掉
  // 去掉但**保留内部表达式**（这些是"包装"，不是语义）
  if (node.type === 'TSAsExpression' || node.type === 'TSNonNullExpression' || node.type === 'TSSatisfiesExpression') {
    return normalize(node.expression);
  }
  if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
    return undefined; // 导入导出由 ② / ③ 单独对账
  }
  const keep = {};
  for (const k of Object.keys(node).sort()) {
    if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments', 'extra', 'comments', 'errors', 'tokens'].includes(k)) continue;
    if (k === 'typeAnnotation' || k === 'returnType' || k === 'typeParameters' || k === 'typeArguments' || k === 'declare' || k === 'optional' || k === 'accessibility' || k === 'readonly' || k === 'abstract' || k === 'implements' || k === 'definite') continue;
    const v = normalize(node[k]);
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    keep[k] = v;
  }
  return { $$: node.type, ...keep };
}

/**
 * ★ 顶层语句**按名字对齐**再对账。
 *   为什么必须这样：转换会**新增**类型声明与等价助手（`asRecord`/`paramString`/`invariant` …）
 *   ⇒ 按位置比会让后续语句整体错位，把"新增"报成几十条"改了"（实测：噪声淹没信号）。
 *   对齐键：函数名 / 变量声明的第一个绑定名 / 其余按节点类型。
 */
function byName(body) {
  const map = new Map();
  const counts = new Map();
  for (const stmt of body ?? []) {
    let key = null;
    if (stmt.$$ === 'FunctionDeclaration' && stmt.id?.name) key = `fn:${stmt.id.name}`;
    else if (stmt.$$ === 'VariableDeclaration') {
      const id = stmt.declarations?.[0]?.id?.name;
      key = id ? `var:${id}` : `var:?`;
    } else if (stmt.$$ === 'ExpressionStatement') continue; // 调用/赋值语句（模块顶层副作用）单独列
    else key = `stmt:${stmt.$$}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    map.set(n > 1 ? `${key}#${n}` : key, stmt);
  }
  return map;
}

/**
 * ★ **事实面集合**：从 AST 里抽"可执行事实"的多重集（字面量 / 调用 / 运算符 / 属性名 / 标识符）。
 *
 * 为什么用集合而不是结构 diff：转换会**新增语句**（收窄守卫、等价助手）⇒ 位置对齐必然错位，
 * 噪声会把真信号淹掉（实测过）。而"语义漂移"（改了一个字符串、少调一次、`||` 变 `??`）
 * **在集合差里一看就露**，且**不受代码移动影响**。
 */
function collectFacts(ast) {
  const facts = { strings: new Map(), numbers: new Map(), callees: new Map(), operators: new Map(), props: new Map(), idents: new Map() };
  const bump = (m, k) => {
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  const nameOf = (node) => {
    if (!node) return '';
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression' && !node.computed && node.property?.type === 'Identifier') {
      return `${nameOf(node.object)}.${node.property.name}`;
    }
    return node.type;
  };
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node.type !== 'string') return;
    if (TS_TYPES.has(node.type)) return; // 类型子树不算事实
    switch (node.type) {
      case 'StringLiteral':
        bump(facts.strings, node.value);
        break;
      case 'NumericLiteral':
        bump(facts.numbers, String(node.value));
        break;
      case 'CallExpression':
        bump(facts.callees, nameOf(node.callee));
        break;
      case 'BinaryExpression':
      case 'LogicalExpression':
        bump(facts.operators, node.operator);
        break;
      case 'UnaryExpression':
        bump(facts.operators, `unary:${node.operator}`);
        break;
      case 'MemberExpression':
        if (!node.computed) bump(facts.props, nameOf(node));
        break;
      case 'Identifier':
        bump(facts.idents, node.name);
        break;
      default:
        break;
    }
    for (const k of Object.keys(node)) {
      if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'extra', 'typeAnnotation', 'returnType'].includes(k)) continue;
      walk(node[k]);
    }
  };
  walk(ast.program);
  return facts;
}

/** 集合面差异：只报"原有多少/现多少"两侧不对称的键 */
function factDiff(mOld, mNew) {
  const onlyOld = [];
  const onlyNew = [];
  const counts = [];
  for (const [k, v] of mOld) {
    const w = mNew.get(k) ?? 0;
    if (w === 0) onlyOld.push(k);
    else if (w !== v) counts.push(`${k}(${v}⇒${w})`);
  }
  for (const [k, v] of mNew) if (!mOld.has(k)) onlyNew.push(k);
  return { onlyOld, onlyNew, counts };
}

/** 并行结构 diff：同位置比对，收差异（含上下文片段） */
function diffAst(a, b, codeA, codeB, trail = '', acc = []) {
  if (acc.length >= MAX * 4) return acc;
  if (a === undefined && b === undefined) return acc;
  // ⚠️ `null` 也是 `typeof 'object'` ⇒ 必须显式挡掉（否则 `Object.keys(null)` 崩）
  if (a === null || b === null) {
    if (a !== b) acc.push({ where: trail, kind: '取值不同', a: String(a), b: String(b) });
    return acc;
  }
  const ta = a && a.$$;
  const tb = b && b.$$;
  if (ta !== tb) {
    acc.push({ where: trail || '(根)', kind: '节点类型不同', a: ta ?? '无', b: tb ?? '无', aSnip: snip(codeA, a), bSnip: snip(codeB, b) });
    return acc;
  }
  if (typeof a !== 'object') {
    if (a !== b) acc.push({ where: trail, kind: '取值不同', a: String(a), b: String(b) });
    return acc;
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      acc.push({ where: trail, kind: '元素个数不同', a: String(a.length), b: String(b.length), aSnip: snip(codeA, a[0]), bSnip: snip(codeB, b[0]) });
    }
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) diffAst(a[i], b[i], codeA, codeB, `${trail}[${i}]`, acc);
    return acc;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === '$$') continue;
    diffAst(a[k], b[k], codeA, codeB, trail ? `${trail}.${k}` : k, acc);
    if (acc.length >= MAX * 4) break;
  }
  return acc;
}

/** 从原始节点取一小段源码做上下文（normalize 后没有位置信息 ⇒ 只给结构摘要） */
function snip(code, node) {
  if (node === undefined || node === null) return '';
  const s = typeof node === 'object' ? JSON.stringify(node).slice(0, 90) : String(node);
  return s;
}

function requireTargets(ast) {
  const out = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'CallExpression' && node.callee?.name === 'require' && node.arguments?.[0]?.type === 'StringLiteral') out.add(node.arguments[0].value);
    if (node.type === 'ImportDeclaration') out.add(node.source.value);
    for (const k of Object.keys(node)) {
      if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'extra'].includes(k)) continue;
      walk(node[k]);
    }
  };
  walk(ast);
  return out;
}

function exportNames(ast) {
  const out = new Set();
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      if (stmt.declaration?.id?.name) out.add(stmt.declaration.id.name);
      for (const s of stmt.specifiers ?? []) out.add(s.exported?.name ?? s.local?.name);
    }
    if (stmt.type === 'ExportDefaultDeclaration') out.add('default');
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression') {
      const left = stmt.expression.left;
      const l = left.type === 'MemberExpression' ? left.property?.name : null;
      if (l === 'exports') {
        const right = stmt.expression.right;
        if (right.type === 'ObjectExpression') for (const p of right.properties) out.add(p.key?.name ?? p.value?.name ?? '?');
        else out.add('(单值导出)');
      } else if (l) out.add(l);
    }
  }
  return out;
}

const targets = explicit.length ? explicit.map((f) => path.resolve(REPO, f)) : defaultTargets();
const report = [];
for (const abs of targets) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  const { code: oldCode, note, from } = originalJs(rel);
  if (!oldCode) {
    report.push({ file: rel, skipped: note });
    continue;
  }
  const newCode = fs.readFileSync(abs, 'utf-8');
  const parseOpts = { sourceType: 'unambiguous', plugins: ['typescript'], allowReturnOutsideFunction: true };
  const astOld = parse(oldCode, parseOpts);
  const astNew = parse(newCode, parseOpts);
  const nOld = normalize(astOld.program);
  const nNew = normalize(astNew.program);
  // 按名字对齐（见 byName 的注释：位置对齐会把"新增"报成"改了"）
  const mapOld = byName(nOld.body);
  const mapNew = byName(nNew.body);
  const defsOnlyOld = [...mapOld.keys()].filter((k) => !mapNew.has(k));
  const defsOnlyNew = [...mapNew.keys()].filter((k) => !mapOld.has(k));
  const diffs = [];
  if (wantStruct) {
    for (const [k, a] of mapOld) {
      const b = mapNew.get(k);
      if (b === undefined) continue;
      diffAst(a, b, oldCode, newCode, k, diffs);
    }
  }
  // ★ 事实面集合对账（主口径）
  const fOld = collectFacts(astOld);
  const fNew = collectFacts(astNew);
  const facts = {
    strings: factDiff(fOld.strings, fNew.strings),
    numbers: factDiff(fOld.numbers, fNew.numbers),
    callees: factDiff(fOld.callees, fNew.callees),
    operators: factDiff(fOld.operators, fNew.operators),
    props: factDiff(fOld.props, fNew.props),
  };

  const reqOld = requireTargets(astOld);
  const reqNew = requireTargets(astNew);
  const onlyOld = [...reqOld].filter((x) => !reqNew.has(x));
  const onlyNew = [...reqNew].filter((x) => !reqOld.has(x));
  const expOld = exportNames(astOld);
  const expNew = exportNames(astNew);

  report.push({
    file: rel,
    from,
    structDiffs: diffs.slice(0, MAX),
    structDiffCount: diffs.length,
    defsOnlyOld,
    defsOnlyNew,
    facts,
    importsOnlyOld: onlyOld,
    importsOnlyNew: onlyNew,
    exportsOld: [...expOld].sort(),
    exportsNew: [...expNew].sort(),
  });
}

if (wantJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('════════ 转换质量审计（AST 级：当前 .ts vs git 里的原 .js）════════');
  for (const r of report) {
    if (r.skipped) {
      console.log(`\n── ${r.file}\n   ⚠️ 跳过：${r.skipped}`);
      continue;
    }
    console.log(`\n── ${r.file}（原文 ${r.from}）`);
    const imp = [];
    if (r.importsOnlyOld.length) imp.push(`原独有 ${r.importsOnlyOld.join(', ')}`);
    if (r.importsOnlyNew.length) imp.push(`现独有 ${r.importsOnlyNew.join(', ')}`);
    if (r.defsOnlyOld.length) console.log(`   ⚠️ 原独有定义（应逐条解释）：${r.defsOnlyOld.join(', ')}`);
    if (r.defsOnlyNew.length) console.log(`   ＋ 现独有定义（应为"等价助手/类型"）：${r.defsOnlyNew.join(', ')}`);
    console.log(`   ② 导入面：${imp.length ? imp.join(' ｜ ') : '一致'}`);
    const expSame = JSON.stringify(r.exportsOld) === JSON.stringify(r.exportsNew);
    console.log(`   ③ 导出面：${expSame ? '一致' : `原 [${r.exportsOld.join(', ')}] ⇒ 现 [${r.exportsNew.join(', ')}]`}`);
    const show = (label, d) => {
      const parts = [];
      if (d.onlyOld.length) parts.push(`原独有 [${d.onlyOld.join(', ')}]`);
      if (d.onlyNew.length) parts.push(`现独有 [${d.onlyNew.join(', ')}]`);
      if (d.counts.length) parts.push(`个数变了 ${d.counts.join(', ')}`);
      console.log(`   ${label}：${parts.length ? parts.join(' ｜ ') : '一致'}`);
    };
    console.log('   ① 事实面对账（集合差，不受代码移动影响）');
    show('字符串', r.facts.strings);
    show('  数字', r.facts.numbers);
    show('  调用', r.facts.callees);
    show('  运算符', r.facts.operators);
    show('  属性访问', r.facts.props);
    if (wantStruct) {
      console.log(`   ①b 结构差异（--struct）：${r.structDiffCount} 处`);
      for (const d of r.structDiffs) {
        console.log(`      · ${d.where} ｜ ${d.kind}${d.a !== undefined ? ` ｜ 原 ${d.a}` : ''}${d.b !== undefined ? ` ⇒ 现 ${d.b}` : ''}`);
      }
    }
  }
  const factTotal = report.reduce((n, r) => {
    if (!r.facts) return n;
    return n + Object.values(r.facts).reduce((m, d) => m + d.onlyOld.length + d.onlyNew.length + d.counts.length, 0);
  }, 0);
  console.log(
    `\n合计 ${report.length} 个文件 · 事实面差异 ${factTotal} 条（**每一条都要能在日志里找到出处**：要么"仅类型面"，要么"已登记的微改"）`,
  );
}
process.exit(0);
