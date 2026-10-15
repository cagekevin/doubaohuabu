#!/usr/bin/env node
/**
 * diff-channels.mjs —— **A 层（契约三方对齐）辅助**：把「旧 `.js`（基线）↔ 新 `.ts`」两侧
 * 每个 `handle(...)` / `on(...)` 注册点的 **形参名 ＋ return 形状** 并排打出来，供人逐条核。
 *
 * ⛔ **只列，不判等价**（与 `compare-inout.mjs` 同一定位）：它不认"同/异"该不该存在，只把两侧事实摆出来。
 * ⛔ 不写仓库内任何文件（只读 + 打印）。
 *
 * 为什么不用 `draft-handler-returns.mjs`：那个只抽**新侧**、且面向"填表的 `ret`"；
 * 本工具要的是**两侧并排**（差异本身才是 A 层要找的东西）。
 *
 * 基线取法与 `compare-inout.mjs` **同一条纪律**：各文件"改名提交的父提交"那版（`~1`，⛔ 不用 `^`）。
 *
 * 用法：node .../diff-channels.mjs [--only <子串>] [--help]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`diff-channels.mjs —— A 层辅助：两侧 handle/on 注册点并排（形参名 + return 形状）

用法：node .../diff-channels.mjs [--only <子串>]
  --only <s>  只看路径含 <s> 的文件
基线：各文件"改名提交的父提交"那版（与 compare-inout.mjs 同一纪律）。
⛔ 只列事实，不判等价。`);
  process.exit(0);
}
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const sh = (c) => {
  try {
    return execSync(c, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

/** 导出基线（各文件"改名提交的父提交"）到仓外临时目录 */
function exportBaseline() {
  const root = path.join(os.tmpdir(), 'a-layer');
  const oldDir = path.join(root, 'old');
  fs.rmSync(oldDir, { recursive: true, force: true });
  fs.mkdirSync(oldDir, { recursive: true });
  const files = (sh('git ls-tree -r --name-only HEAD electron') || '').split('\n').filter((f) => f.endsWith('.ts'));
  const touched = [];
  for (const f of files) {
    const jsPath = f.replace(/\.ts$/, '.js');
    const del = sh(`git log --diff-filter=D -1 --format=%H -- ${jsPath}`);
    if (!del) continue;
    const code = sh(`git show ${del}~1:${jsPath}`);
    if (code === null) continue;
    const pre = sh(`git show 0a6216d:${jsPath}`);
    if (pre !== null && pre !== code) touched.push(jsPath);
    const dst = path.join(oldDir, path.basename(jsPath));
    fs.writeFileSync(dst, code, 'utf8');
  }
  return { oldDir, touched: new Set(touched.map((t) => path.basename(t))) };
}

/**
 * 取注册点块：以「顶格/同缩进的 `handle(` 或 `on(` 行」开头，到「同缩进的 `});`」结束。
 * ⚠️ **单行注册**（`handle('x', async () => expr);`）必须**单独成块** —— 否则会一直往后吃到
 * 下一个 `});`，把**下一处的 return 算到本处头上**（实测踩过：`api-job:cancel` 报出 `submitBatch(...)`）。
 */
function parseBlocks(src) {
  const lines = src.split('\n');
  const out = [];
  const re = /^(\s*)(handle|on)\(\s*(['"])([^'"]+)\3/;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const single = /=>.*\);\s*$/.test(lines[i]);
    let j = i;
    if (!single) {
      const indent = m[1];
      const closeRe = new RegExp('^' + indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}\\);\\s*$');
      for (j = i + 1; j < lines.length; j++) if (closeRe.test(lines[j])) break;
    }
    const block = lines.slice(i, Math.min(j + 1, lines.length)).join('\n');
    out.push({ kind: m[2], channel: m[4], line: i + 1, params: paramsOf(block), returns: returnsOf(block) });
    i = j;
  }
  return out;
}

/**
 * 形参名（去类型标注与默认值）。
 * ⚠️ 取 `=>` **之前最后一个 `(...)`** —— 不能写 `\(([^)]*)\)\s*:?...=>`：
 *   ① `[^)]*` 会从 `handle(` 的括号开始跨过 `'name', async (`，把**频道名当形参**（实测踩过）；
 *   ② TS 的**返回类型标注**（`): Promise<OkReply | FailReply> =>`）里含 `>`/`<`，会让"标注段"匹配失败 ⇒ 形参被抽空。
 */
function paramsOf(block) {
  const idx = block.indexOf('=>');
  const head = idx >= 0 ? block.slice(0, idx) : block;
  const all = [...head.matchAll(/\(([^()]*)\)/g)];
  if (!all.length) return [];
  return all[all.length - 1][1]
    .split(',')
    .map((s) => s.trim().split(':')[0].split('=')[0].trim())
    .filter(Boolean);
}

/** `return <expr>` 的形状：对象字面量 ⇒ 顶层键；其余 ⇒ 归一化后的表达式文本 */
function returnsOf(block) {
  const out = [];
  const re = /\breturn\b([^;]*)/g;
  let m;
  while ((m = re.exec(block))) {
    out.push(shapeOf(m[1].replace(/\s+/g, ' ').trim()));
  }
  /**
   * ⚠️ **`=> ({ … })` 表达式体**（源里常见：`results.map((r) => ({ … }))`）没有 `return` 关键字 ⇒
   *   只抓 `return` 会**漏掉它**（实测：`lovart-scan-frames` 因此假报"新侧多一条分支"）。
   */
  // ⚠️ 必须带括号：`=>\s*\{` 是**块体**（会被当成对象抓出空 `{}`）；表达式体恒写作 `=> ({ … })`
  const re2 = /=>\s*\(\s*\{/g;
  while ((m = re2.exec(block))) {
    const obj = braceAt(block, m.index + m[0].length - 1);
    if (obj) out.push(shapeOf(obj.replace(/\s+/g, ' ').trim()));
  }
  return out;
}

/** 从 `s[i] === '{'` 起取**配平**的 `{…}` 原文 */
function braceAt(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}') {
      d--;
      if (d === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

function shapeOf(expr) {
  if (expr.startsWith('{')) return '{' + topKeys(expr).join(',') + '}';
  return expr.replace(/\s*([()[\],.:])\s*/g, '$1');
}

/** 对象字面量的顶层键（深度 1 上的 `ident:`） */
function topKeys(expr) {
  const keys = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 1) {
      const k = keyOf(cur);
      if (k) keys.push(k);
      cur = '';
      continue;
    }
    if (depth === 1 && c !== '{' && c !== '[' && c !== '(') cur += c;
  }
  const k = keyOf(cur);
  if (k) keys.push(k);
  return keys;
}
function keyOf(seg) {
  const s = seg.trim();
  let m = /^([A-Za-z_$][\w$]*)\s*:/.exec(s);
  if (m) return m[1];
  // ⚠️ **简写键**（`{ url, ok }`）没有冒号 ⇒ 不认它就会**静默丢键**（假阴性，比假阳性危险）
  m = /^([A-Za-z_$][\w$]*)$/.exec(s);
  if (m) return m[1];
  const q = /^(['"])([^'"]+)\1\s*:/.exec(s);
  return q ? q[2] : '';
}

const base = exportBaseline();
console.log(`基线：${base.oldDir}（各文件"改名提交的父提交"）`);
if (base.touched.size) console.log(`⚠️ 基线含中途改动（该行只能人读）：${[...base.touched].join(' · ')}`);
console.log('');

const newRoot = path.join(REPO, 'electron');
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'dist') walk(fp, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(fp);
  }
  return out;
};

let files = walk(newRoot).filter((f) => (only ? f.includes(only) : true)).sort();
for (const f of files) {
  const rel = path.relative(newRoot, f).split(path.sep).join('/');
  const oldPath = path.join(base.oldDir, path.basename(f).replace(/\.ts$/, '.js'));
  if (!fs.existsSync(oldPath)) continue;
  const ob = parseBlocks(fs.readFileSync(oldPath, 'utf8'));
  const nb = parseBlocks(fs.readFileSync(f, 'utf8'));
  if (!ob.length && !nb.length) continue;
  console.log(`════ ${rel}  (旧 ${ob.length} 处 · 新 ${nb.length} 处)`);
  const names = [...new Set([...ob.map((b) => b.channel), ...nb.map((b) => b.channel)])];
  for (const n of names) {
    const o = ob.find((b) => b.channel === n);
    const x = nb.find((b) => b.channel === n);
    const fmt = (b) => (b ? `${b.kind}(${b.params.join(',')}) ⇒ [${b.returns.join(' | ')}]` : '**缺**');
    const same = fmt(o) === fmt(x);
    console.log(`  ${same ? '  ' : '★ '}${n}`);
    if (!same) {
      console.log(`       旧：${fmt(o)}`);
      console.log(`       新：${fmt(x)}`);
    }
  }
  console.log('');
}
console.log('（⛔ 只列事实：`★` = 两侧文本形状不同 —— 是否等价由人对着源码判，见 人工检查清单.md §2）');
