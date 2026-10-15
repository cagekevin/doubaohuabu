#!/usr/bin/env node
/**
 * audit-redzone.mjs —— 人工复核的**两个机械输入**
 *
 * ① **分母**（§1.2：任何"绿"必须能回答覆盖了什么/没覆盖什么）：逐文件的
 *    频道注册数（`handle`/`on`）· 导出名数 · 顶层函数数 · `if`/`case` 分支数
 *    —— 没有分母，"覆盖率"就是个形容词。
 * ② **红区机械比**（"人逐字看 130 行必漏" ⇒ 让机器逐字）：
 *    · 频道名字符串集合（`handle/on` ＋ `ipcRenderer.invoke/send/sendSync` 的字符串实参）
 *    · `appendSwitch` 的开关名与值
 *    · `registerSchemesAsPrivileged([...])` 的原文
 *    · `DETECT_JS` / `ERROR_JS` 模板串（归一化那处 `${…}` 插值后比 sha256）
 *    · `dolaDurationDump` 的函数体（**新侧先抹类型**再比）· 指纹 preload 模板串
 *
 * **旧侧基线**（本脚本自己解析并**打印用了哪个 ref** —— 复核时必须先核这一行）：
 *   ① `HEAD:<js>`（改名未提交时它在）
 *   ② 重命名记录：`git log --diff-filter=R -1 HEAD -- <ts>` 报的旧路径 ⇒ 取 `<sha>^:<旧路径>`
 *   ③ 删除记录：`git log --diff-filter=D -1 HEAD -- <js>` ⇒ 试 `<sha>:<js>` 再试 `<sha>^:<js>`
 *   ④ 兜底 `0a6216d:<js>`（**迁移前**版本 —— ⚠️ 打标记：它可能不是改写依据，别当基线）
 *
 * 用法：node .../audit-redzone.mjs [--json] [--help]
 * 只读（不写任何文件）；退出码 0 = 跑完 · 2 = 用法错。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`audit-redzone.mjs —— 复核用的机械输入（分母 ＋ 红区逐字）

用法：node .../audit-redzone.mjs [--json] [--only <子串>]
  --json        机器读（人读默认）
  --only <s>    只看路径含 <s> 的文件
只读；旧侧基线由本脚本解析并**打印 ref**（复核前先核那一行）。`);
  process.exit(0);
}
const wantJson = args.includes('--json');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const sh = (c) => {
  try {
    return execSync(c, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

/** 首个差异的上下文（只列位置与两侧片段 —— 判断仍归人） */
function firstDiff(oldText, newText, ctx = 90) {
  const a = oldText || '';
  const b = newText || '';
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i >= a.length && i >= b.length) return null;
  return {
    at: i,
    old: a.slice(Math.max(0, i - ctx), i + ctx),
    new: b.slice(Math.max(0, i - ctx), i + ctx),
  };
}

/** 旧侧基线解析（返回 { code, ref, warn }） */
function oldSide(relTs) {
  const relJs = relTs.replace(/\.ts$/, '.js');
  const head = sh(`git show HEAD:${relJs}`);
  if (head !== null) return { code: head, ref: `HEAD:${relJs}` };
  const ren = sh(`git log --diff-filter=R -1 --format=%H --name-status -- ${relTs}`);
  if (ren) {
    const lines = ren.split('\n');
    const sha = lines[0];
    for (const l of lines.slice(1)) {
      const m = /^R\d+\t(.+)\t(.+)$/.exec(l);
      if (m && m[1].endsWith('.js')) {
        // ⚠️ 用 `~1` 不用 `^`：Windows 的 cmd.exe 把 `^` 当转义符 ⇒ `sha^:path` 会被吃成 `sha:path`
        const code = sh(`git show ${sha}~1:${m[1]}`);
        if (code !== null) return { code, ref: `${sha.slice(0, 7)}~1:${m[1]}`, warn: null };
      }
    }
  }
  const del = sh(`git log --diff-filter=D -1 --format=%H -- ${relJs}`);
  if (del) {
    for (const spec of [`${del}:${relJs}`, `${del}~1:${relJs}`]) {
      const code = sh(`git show ${spec}`);
      if (code !== null) return { code, ref: spec.replace(del, del.slice(0, 7)), warn: null };
    }
  }
  const pre = sh(`git show 0a6216d:${relJs}`);
  if (pre !== null) return { code: pre, ref: `0a6216d:${relJs}`, warn: '用的是「迁移前」版本 —— ⚠️ 它可能不是改写依据，别当基线' };
  return { code: null, ref: '(未找到)', warn: '旧侧取不到 ⇒ 该行无法机械比，必须人读' };
}

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(e.name)) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (e.name.endsWith('.ts')) out.push(path.relative(REPO, fp).split(path.sep).join('/'));
  }
  return out;
};

/** 抽「调用表达式的字符串首参」 */
function stringArgsOf(code, calleeNames) {
  const out = [];
  let ast;
  try {
    ast = parse(code, { sourceType: 'unambiguous', plugins: ['typescript'], allowReturnOutsideFunction: true });
  } catch {
    return out;
  }
  const calleeName = (c) => {
    if (!c) return null;
    if (c.type === 'Identifier') return c.name;
    if (c.type === 'MemberExpression' && c.property && c.property.type === 'Identifier') return c.property.name;
    return null;
  };
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n.type) return;
    if (n.type === 'CallExpression' && calleeNames.includes(calleeName(n.callee))) {
      const a0 = n.arguments?.[0];
      if (a0?.type === 'StringLiteral') out.push(a0.value);
    }
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end', 'comments'].includes(k)) continue;
      visit(n[k]);
    }
  };
  visit(ast);
  return out;
}

/** 取代码里的第一个 `FunctionDeclaration` 节点（红区里那两个函数都是这种形态） */
function firstFnNode(code) {
  let ast;
  try {
    ast = parse(code, { sourceType: 'unambiguous', plugins: ['typescript'], allowReturnOutsideFunction: true });
  } catch {
    return null;
  }
  let found = null;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (n.type === 'FunctionDeclaration') {
      found = n;
      return;
    }
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end', 'comments'].includes(k)) continue;
      visit(n[k]);
    }
  };
  visit(ast);
  return found;
}

/** 两个 AST 的结构差（⛔ 不计格式：括号/逗号/空白不产生节点 ⇒ 天然不报） */
function astDiff(nodeA, nodeB, max = 6) {
  const diffs = [];
  const IGNORE = new Set([
    'loc','start','end','comments','leadingComments','trailingComments','innerComments','extra','range','tokens','errors',
  ]);
  const SCALARS = [
    'type','name','value','operator','kind','computed','optional','shorthand','method','prefix','delegate','async','generator',
    'static','readonly','abstract','declare','sourceType','directive',
  ];
  const cmp = (a, b, at) => {
    if (diffs.length >= max) return;
    if (a === undefined && b === undefined) return;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      if (a !== b) diffs.push({ at, old: String(a), new: String(b) });
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) {
        diffs.push({ at, old: Array.isArray(a) ? '[数组]' : String(a), new: Array.isArray(b) ? '[数组]' : String(b) });
        return;
      }
      if (a.length !== b.length) {
        diffs.push({ at: `${at}[长度]`, old: String(a.length), new: String(b.length) });
        return;
      }
      a.forEach((x, i) => cmp(x, b[i], `${at}[${i}]`));
      return;
    }
    // ★ 类型不同只记一条并**立即返回**（再比下去全是同一处差异的噪声：`7 处`里 6 处是同一条）
    if (a.type !== b.type) {
      diffs.push({ at: `${at}.type`, old: String(a.type), new: String(b.type) });
      return;
    }
    for (const k of SCALARS) if (k in a || k in b) cmp(a[k], b[k], `${at}.${k}`);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !IGNORE.has(k) && !SCALARS.includes(k)));
    for (const k of keys) cmp(a[k], b[k], `${at}.${k}`);
  };
  cmp(nodeA, nodeB, 'fn');
  return diffs;
}

/** 抽「某个调用表达式的首个实参原文」（如 `protocol.registerSchemesAsPrivileged([...])`） */
function callArgText(code, propName) {
  let ast;
  try {
    ast = parse(code, { sourceType: 'unambiguous', plugins: ['typescript'], allowReturnOutsideFunction: true });
  } catch {
    return null;
  }
  let found = null;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n.type) return;
    if (
      n.type === 'CallExpression' &&
      n.callee?.type === 'MemberExpression' &&
      n.callee.property?.type === 'Identifier' &&
      n.callee.property.name === propName
    ) {
      const a0 = n.arguments?.[0];
      if (a0) {
        found = code.slice(a0.start, a0.end);
        return;
      }
    }
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end', 'comments'].includes(k)) continue;
      visit(n[k]);
    }
  };
  visit(ast);
  return found;
}

/** 抽「具名函数的源码文本」（新侧先抹类型） */
function fnText(code, name) {
  let ast;
  try {
    ast = parse(code, { sourceType: 'unambiguous', plugins: ['typescript'], allowReturnOutsideFunction: true });
  } catch {
    return null;
  }
  let found = null;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n.type) return;
    const isTarget =
      (n.type === 'FunctionDeclaration' && n.id?.name === name) ||
      (n.type === 'VariableDeclarator' &&
        n.id?.type === 'Identifier' &&
        n.id.name === name &&
        (n.init?.type === 'ArrowFunctionExpression' || n.init?.type === 'FunctionExpression'));
    if (isTarget) {
      found = code.slice(n.start, n.end);
      return;
    }
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end', 'comments'].includes(k)) continue;
      visit(n[k]);
    }
  };
  visit(ast);
  return found;
}

/** 抽「按名字定位的模板字符串」（`const DETECT_JS = \`…\``）：quasis 拼接、插值统一成 `${…}` */
function namedTemplate(code, name) {
  let ast;
  try {
    ast = parse(code, { sourceType: 'unambiguous', plugins: ['typescript'], allowReturnOutsideFunction: true });
  } catch {
    return null;
  }
  let found = null;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n.type) return;
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.id.name === name && n.init?.type === 'TemplateLiteral') {
      found = n.init.quasis.map((q) => q.value.raw).join('${…}');
      return;
    }
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end', 'comments'].includes(k)) continue;
      visit(n[k]);
    }
  };
  visit(ast);
  return found;
}

/** 导出/频道等「分母」用 AST 数（正则漏 `export {}` 形式 ⇒ 会低估） */
function astCounts(code) {
  let ast;
  try {
    ast = parse(code, { sourceType: 'unambiguous', plugins: ['typescript'], allowReturnOutsideFunction: true });
  } catch {
    return null;
  }
  let exports = 0;
  let fns = 0;
  let ifs = 0;
  let cases = 0;
  let arrows = 0;
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n.type) return;
    if (n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration') {
      exports += n.declaration ? 1 : (n.specifiers?.length || 1);
    }
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') fns++;
    if (n.type === 'ArrowFunctionExpression') arrows++;
    if (n.type === 'IfStatement') ifs++;
    if (n.type === 'SwitchCase' && n.test) cases++;
    for (const k of Object.keys(n)) {
      if (['loc', 'start', 'end', 'comments'].includes(k)) continue;
      visit(n[k]);
    }
  };
  visit(ast);
  return { exports, fns, arrows, ifs, cases };
}

const files = walk(path.join(REPO, 'electron')).filter((f) => (only ? f.includes(only) : true)).sort();
const report = [];

for (const rel of files) {
  const newCode = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const old = oldSide(rel);
  const row = { file: rel, ref: old.ref, warn: old.warn, denom: {}, redzone: [], skips: [] };

  // ── ① 分母 ──
  const chansNew = stringArgsOf(newCode, ['handle', 'on']);
  const chansPreload = stringArgsOf(newCode, ['invoke', 'send', 'sendSync', 'sendSyncUnknown']);
  const c = astCounts(newCode) || { exports: 0, fns: 0, arrows: 0, ifs: 0, cases: 0 };
  row.denom = {
    频道: chansNew.length + chansPreload.length,
    导出: c.exports,
    函数: c.fns + c.arrows,
    函数体: c.fns,
    箭头: c.arrows,
    if分支: c.ifs,
    case: c.cases,
    行: newCode.split('\n').length,
  };

  // ── ② 红区 ──
  if (old.code) {
    const chansOld = [...stringArgsOf(old.code, ['handle', 'on']), ...stringArgsOf(old.code, ['invoke', 'send', 'sendSync'])];
    const sOld = new Set(chansOld);
    const sNew = new Set([...chansNew, ...chansPreload]);
    const miss = [...sOld].filter((x) => !sNew.has(x));
    const extra = [...sNew].filter((x) => !sOld.has(x));
    if (chansOld.length || sNew.size)
      row.redzone.push({ 项: '频道名集合', 结果: miss.length === 0 && extra.length === 0 ? '✅ 一致' : `❌ 缺 ${miss.join(',') || '-'} ｜ 多 ${extra.join(',') || '-'}` });

    const swOld = stringArgsOf(old.code, ['appendSwitch']);
    const swNew = stringArgsOf(newCode, ['appendSwitch']);
    if (swOld.length || swNew.length) {
      const same = swOld.join('|') === swNew.join('|');
      row.redzone.push({
        项: 'appendSwitch 开关名',
        结果: same ? `✅ 一致（${swNew.length} 处）` : `❌ 原=[${swOld.join(',')}] 现=[${swNew.join(',')}]`,
      });
    }

    {
      // 尾逗号是纯格式（JS 里恒等）⇒ 归一掉；括号**不**归一（括号可能真改语义，必须报出来给人看）
      const first = (s) => (s ? s.replace(/,(\s*[}\]])/g, '$1').replace(/\s+/g, '') : null);
      const a = first(callArgText(old.code, 'registerSchemesAsPrivileged'));
      const b = first(callArgText(newCode, 'registerSchemesAsPrivileged'));
      if (a === null && b === null) {
        // 两侧都没有这个调用 ⇒ 该项**不适用**（不是"跳过"）⇒ 只在结尾汇总一句，避免 30 行噪声
        row.na = (row.na || 0) + 1;
      } else if (a === null || b === null) {
        row.redzone.push({ 项: '协议 scheme privileges（实参原文）', 结果: `❌ 只有一侧有该调用（原 ${a === null ? '无' : '有'} / 现 ${b === null ? '无' : '有'}）` });
      } else {
        const d = firstDiff(a, b);
        row.redzone.push({
          项: '协议 scheme privileges（实参原文）',
          结果: d ? '❌ 不一致' : `✅ 原文一致（${a.length} 字符）`,
          详: d,
        });
      }
    }

    // 模板串同样可能搬到 `.js` 载体（`DUMP_EXPR` 跟着 `dolaDurationDump` 走了）
    const TPL_HOME = { DUMP_EXPR: 'electron/dola-duration-dump.js' };
    for (const tplName of ['DETECT_JS', 'ERROR_JS', 'DUMP_EXPR']) {
      const tplHome = TPL_HOME[tplName];
      const tplHomeCode =
        tplHome && fs.existsSync(path.join(REPO, tplHome)) ? fs.readFileSync(path.join(REPO, tplHome), 'utf8') : newCode;
      const tOld = namedTemplate(old.code, tplName);
      const tNew = namedTemplate(tplHomeCode, tplName);
      if (tOld === null && tNew === null) continue;
      const d = firstDiff(tOld, tNew);
      row.redzone.push({
        项: `${tplName}（模板串逐字）`,
        结果: d
          ? `❌ 不一致（原 ${(tOld || '').length} / 现 ${(tNew || '').length} 字符）`
          : `✅ 逐字一致（${(tOld || '').length} 字符）`,
        详: d,
      });
    }

    // 红区函数各自的**新家**：不住 `.ts` 的（不进编译面的 .js 载体）也要能查到 —— 否则会"静默看漏"
    const FN_HOME = { dolaDurationDump: 'electron/dola-duration-dump.js' };
    for (const fn of ['dolaDurationDump', 'buildFingerprintPreload']) {
      const homeRel = FN_HOME[fn] || rel;
      const homeCode =
        homeRel === rel
          ? newCode
          : fs.existsSync(path.join(REPO, homeRel))
            ? fs.readFileSync(path.join(REPO, homeRel), 'utf8')
            : null;
      const a = fnText(old.code, fn);
      const b = homeCode ? fnText(homeCode, fn) : null;
      if (!a && !b) continue;
      if (!a || !b) {
        row.redzone.push({
          项: `${fn} 函数体`,
          结果: `❌ 只有一侧有该函数（原 ${a ? '有' : '无'} / 现（${homeRel}）${b ? '有' : '无'}）`,
        });
        continue;
      }
      const isJsHome = homeRel.endsWith('.js');
      if (isJsHome) {
        // `.js` 载体：两侧都是 JS ⇒ **可以直接逐字比**（最强的那种）
        const d = firstDiff(a, b);
        row.redzone.push({
          项: `${fn} 函数体（.js 载体 · 逐字比）`,
          结果: d ? `❌ 逐字不一致（原 ${a.length} / 现 ${b.length} 字符）` : `✅ **逐字一致**（${a.length} 字符 · 来自 ${homeRel}）`,
          详: d,
        });
      } else {
        // ★ **AST 结构比**（不是文本比）：新侧先抹类型，再逐节点比 —— 括号/尾逗号/空白不产生节点 ⇒ 天然不计
        const bErased = ts.transpileModule(b, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
        const diffs = astDiff(firstFnNode(a), firstFnNode(bErased), 20);
        row.redzone.push({
          项: `${fn} 函数体（AST 结构比 · 忽略格式）`,
          结果: diffs.length ? `❌ ${diffs.length} 处结构差异` : '✅ 结构完全一致（括号/逗号/空白不计）',
          详多: diffs.map((d) => ({ at: d.at, old: d.old, new: d.new })),
        });
      }
    }
  }

  report.push(row);
}

if (wantJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('════════ 复核机械输入（分母 ＋ 红区）════════\n');
  let warns = 0;
  for (const r of report) {
    console.log(`── ${r.file}`);
    console.log(`   基线：${r.ref}${r.warn ? `   ⚠️ ${r.warn}` : ''}`);
    if (r.warn) warns++;
    console.log(
      `   分母：频道 ${r.denom.频道} · 导出 ${r.denom.导出} · 函数 ${r.denom.函数} · if ${r.denom.if分支} · case ${r.denom.case} · 行 ${r.denom.行}`,
    );
    for (const z of r.redzone) {
      console.log(`   红区·${z.项}：${z.结果}`);
      if (z.详) {
        console.log(`       @${z.详.at}`);
        console.log(`       旧：${z.详.old}`);
        console.log(`       新：${z.详.new}`);
      }
      for (const d of z.详多 || []) {
        console.log(`       @${d.at}`);
        console.log(`         旧：${d.old}`);
        console.log(`         新：${d.new}`);
      }
    }
    for (const s of r.skips) console.log(`   ⏭️ 跳过：${s}`);
    console.log('');
  }
  const tot = report.reduce(
    (a, r) => ({ 频道: a.频道 + r.denom.频道, 导出: a.导出 + r.denom.导出, 函数: a.函数 + r.denom.函数, if: a.if + r.denom.if分支, 行: a.行 + r.denom.行 }),
    { 频道: 0, 导出: 0, 函数: 0, if: 0, 行: 0 },
  );
  console.log(`合计 ${report.length} 个文件：频道 ${tot.频道} · 导出 ${tot.导出} · 函数 ${tot.函数} · if分支 ${tot.if} · 行 ${tot.行}`);
  if (warns) console.log(`⚠️ ${warns} 个文件的旧侧基线打了标记（见上）—— 复核前先核那一行`);
}
