#!/usr/bin/env node
/**
 * jsdoc-typedef-to-ts.mjs —— JSDoc `@typedef` → TS `interface` **草稿**（一次性工具，B2 用）。
 *
 * ★ 它只能做**结构面**（属性名 · 顺序 · 可选位 · 注释），**类型面一律保守**：
 *   · 标量 / 标量数组 / 简单联合 → 直译；
 *   · 内联对象类型、函数类型、跨行 shorthand、括号联合 → **原样留 `TODO(类型)`**，
 *     ⛔ 不猜（`@property {*} [default]` 这类更是只能人判）。
 *   ⇒ 完成判据不是"脚本跑过"，而是**草稿里的 TODO 清零**（由人补完）。
 *
 * 用法：
 *   node docs/plan/后端TS迁移/scripts/jsdoc-typedef-to-ts.mjs <源.js> [--out <目标.ts>] [--write] [--help]
 * 退出码：0 有成稿 · 2 用法/环境错。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`jsdoc-typedef-to-ts.mjs —— JSDoc @typedef → TS interface 草稿

用法：node .../jsdoc-typedef-to-ts.mjs <源.js> [--out <目标.ts>] [--write] [--help]
默认只打印（dry）；--write 才落盘（改源文件 ⇒ 按 §11.1 的分类）`);
  process.exit(args.length === 0 ? 2 : 0);
}
const src = path.resolve(REPO, args[0]);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? path.resolve(REPO, args[outIdx + 1]) : src.replace(/\.js$/, '.ts');
const wantWrite = args.includes('--write');

const code = fs.readFileSync(src, 'utf-8');

/** 简单类型直译表；命中不了的一律 TODO */
const SIMPLE = /^(\*|\?|string|number|boolean|object|Object|Function|any)$/;
function tsType(raw) {
  let t = raw.trim();
  if (/^\(.*\)$/.test(t) && t.includes('|')) t = t.slice(1, -1).trim(); // 括号联合 ⇒ 去括号再看
  if (SIMPLE.test(t)) return { ts: t === '*' || t === '?' ? 'unknown' : t === 'Object' ? 'Record<string, unknown>' : t, todo: t === '*' || t === '?' || t === 'object' || t === 'Function' || t === 'any' };
  if (/^'(?:[^']*)'(\s*\|\s*'[^']*')*$/.test(t)) return { ts: `(${t})`, todo: false };
  if (/^(string|number|boolean)\[\]$/.test(t)) return { ts: t, todo: false };
  return { ts: 'unknown', todo: true };
}

/**
 * 从块注释里**按行**取 `@property`；类型用**配平计数**取（⛔ 不能用 `[^}]*` ——
 * JSDoc 的类型里常有 `{}`（内联对象/函数类型），贪婪截断会把后续属性一起吞掉：实测踩过）。
 */
function parseProps(blockLines) {
  const out = [];
  for (const raw of blockLines) {
    const m = /^\s*\*?\s*@property\s+/.exec(raw);
    if (!m) continue;
    const rest = raw.slice(m[0].length);
    if (!rest.startsWith('{')) {
      out.push({ malformed: rest.trim() });
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '{') depth++;
      else if (rest[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) {
      out.push({ malformed: rest.trim() });
      continue;
    }
    const typeRaw = rest.slice(1, end);
    const nm = /^(\[[^\]]+\]|[A-Za-z_$][\w$]*)\s*(.*)$/.exec(rest.slice(end + 1).trim());
    if (!nm) {
      out.push({ malformed: rest.trim() });
      continue;
    }
    out.push({
      type: typeRaw,
      name: nm[1].replace(/^\[|\]$/g, ''),
      optional: nm[1].startsWith('['),
      doc: nm[2].trim(),
    });
  }
  return out;
}

const lines = code.split('\n');
const outLines = [];
const todos = [];
outLines.push('/**');
outLines.push(' * ⚠️ 由 `jsdoc-typedef-to-ts.mjs` 从同目录的 `.js` 草稿出（**结构面机械 · 类型面保守**）。');
outLines.push(' * 带 `TODO(类型)` 的地方是判断活：补完即删标记（⛔ 不许留着过夜）。');
outLines.push(' */');
outLines.push('');

let i = 0;
let found = 0;
while (i < lines.length) {
  if (!/^\s*\/\*\*/.test(lines[i])) {
    i++;
    continue;
  }
  // 收集整块注释
  const block = [];
  const start = i;
  while (i < lines.length && !/\*\//.test(lines[i])) block.push(lines[i++]);
  block.push(lines[i++]);
  const text = block.join('\n');
  const m = /@typedef\s+\{Object\}\s+([A-Za-z_$][\w$]*)/.exec(text);
  if (!m) continue;
  found++;
  const name = m[1];
  const props = parseProps(block);
  outLines.push(`/** ${name} —— 描述见原 JSDoc（随版本库保留） */`);
  outLines.push(`export interface ${name} {`);
  for (const p of props) {
    if (p.malformed) {
      outLines.push(`  /** TODO(类型)：原 JSDoc 行「@property ${p.malformed}」形态不认识，需人判 */`);
      outLines.push('  // TODO(属性)：本行不是标准 @property，属性名也需人判');
      todos.push(`${name}.?`);
      continue;
    }
    const { ts, todo } = tsType(p.type);
    if (todo) {
      outLines.push(`  /** TODO(类型)：原 JSDoc「{${p.type}}」${p.doc ? ` —— ${p.doc}` : ''} */`);
      outLines.push(`  ${p.name}${p.optional ? '?' : ''}: unknown; // TODO(类型)`);
      todos.push(`${name}.${p.name}`);
    } else {
      if (p.doc) outLines.push(`  /** ${p.doc} */`);
      outLines.push(`  ${p.name}${p.optional ? '?' : ''}: ${ts};`);
    }
  }
  outLines.push('}');
  outLines.push('');
  void start;
}

const result = outLines.join('\n');
if (found === 0) {
  console.error('❌ 没找到任何 `@typedef {Object}` —— 本工具不适用这个文件');
  process.exit(2);
}

console.log(result);
console.log(`\n── 统计：typedef ${found} 个 · TODO(类型) ${todos.length} 处${todos.length ? `：${todos.join(', ')}` : ''}`);
if (wantWrite) {
  fs.writeFileSync(out, result, 'utf-8');
  console.log(`✅ 草稿已写入 ${path.relative(REPO, out)}`);
} else {
  console.log('（dry：未写盘；要落盘加 --write --out <目标>）');
}
