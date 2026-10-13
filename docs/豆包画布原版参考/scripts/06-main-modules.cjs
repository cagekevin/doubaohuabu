#!/usr/bin/env node
/**
 * 06-main-modules.cjs —— 主进程模块规格：全量扫描 electron/ 下所有 .js，
 * 提取每个模块的：文件头职责、导出符号、require 依赖、顶层函数/常量清单。
 *
 * 输入：inputs/electron/**​/*.js
 * 输出：outputs/06-主进程模块.json + outputs/06-主进程模块.md
 * 幂等、可重跑：node scripts/06-main-modules.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'inputs', 'electron');
const OUT_JSON = path.join(ROOT, 'outputs', '06-主进程模块.json');
const OUT_MD = path.join(ROOT, 'outputs', '06-主进程模块.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function walkJs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkJs(p));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// 文件头注释（第一个代码行之前）
function headerDoc(text) {
  const lines = text.split('\n');
  const doc = [];
  for (const ln of lines) {
    const m = ln.match(/^\s*\/\/\s?(.*)$/);
    if (m) doc.push(m[1].trim());
    else if (ln.trim() === '') continue;
    else break;
  }
  return doc.filter((s) => s && !/^=+$/.test(s) && !/^-+$/.test(s)).join(' ');
}

function extract(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DIR, file).replace(/\\/g, '/');

  // require 依赖
  const deps = new Set();
  const depRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = depRe.exec(text))) deps.add(m[1]);

  // module.exports 导出
  const exports_ = [];
  const expRe = /module\.exports\.(\w+)\s*=/g;
  while ((m = expRe.exec(text))) exports_.push(m[1]);
  const expObj = text.match(/module\.exports\s*=\s*\{([^}]*)\}/);
  if (expObj) {
    for (const k of expObj[1].split(',')) {
      const km = k.trim().match(/^(\w+)/);
      if (km) exports_.push(km[1]);
    }
  }

  // 顶层函数/常量定义
  const defs = [];
  const defRe = /^(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|^const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;
  while ((m = defRe.exec(text))) {
    if (m[1]) defs.push({ name: m[1], kind: 'function', params: m[2].trim() });
    else if (m[3]) defs.push({ name: m[3], kind: 'const', params: null });
  }

  return {
    file: rel,
    lines: text.split('\n').length,
    header: headerDoc(text),
    deps: [...deps].filter((d) => !d.startsWith('node:') && !d.startsWith('electron')),
    nodeDeps: [...deps].filter((d) => d.startsWith('node:')),
    exports: [...new Set(exports_)],
    defs,
  };
}

function main() {
  const files = walkJs(DIR).sort();
  const modules = files.map((f) => extract(f));

  const result = {
    generated_by: 'scripts/06-main-modules.cjs',
    inputs: files.map((f) => ({ path: `inputs/electron/${path.relative(DIR, f).replace(/\\/g, '/')}`, sha256: sha256(f) })),
    stats: { total: modules.length, totalLines: modules.reduce((s, m) => s + m.lines, 0) },
    modules,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[06-main-modules] 模块 ${modules.length} / 总行数 ${result.stats.totalLines}`);
  console.log(`[06-main-modules] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 06 · 主进程模块规格（机器生成）');
  L.push('');
  L.push('> 由 `scripts/06-main-modules.cjs` 生成，勿手改；重跑 `node scripts/06-main-modules.cjs`。');
  L.push(`> 模块 ${r.stats.total} / 总行数 ${r.stats.totalLines}。`);
  L.push('');
  for (const m of r.modules) {
    L.push(`## ${m.file}（${m.lines} 行）`);
    L.push('');
    if (m.header) L.push(`> ${m.header}`);
    if (m.exports.length) L.push(`- 导出: ${m.exports.map((x) => '`' + x + '`').join(' ')}`);
    if (m.deps.length) L.push(`- 依赖: ${m.deps.map((x) => '`' + x + '`').join(' ')}`);
    if (m.nodeDeps.length) L.push(`- node 内置: ${m.nodeDeps.map((x) => '`' + x + '`').join(' ')}`);
    if (m.defs.length) {
      L.push(`- 顶层定义（${m.defs.length}）: ${m.defs.slice(0, 30).map((d) => d.kind === 'function' ? '`' + d.name + '(' + d.params + ')`' : '`' + d.name + '`').join(' ')}${m.defs.length > 30 ? ' …' : ''}`);
    }
    L.push('');
  }
  return L.join('\n');
}

main();
