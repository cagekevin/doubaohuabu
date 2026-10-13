#!/usr/bin/env node
/**
 * 00-audit.cjs —— 逐环反向对账审计：以「源头」为基准，反向减各环输出，暴露漏洞。
 *   勘察/划分环：源头文件全集 - 被脚本认领 = 孤儿（少划分）
 *   提取环：源头文件行数 - facts 内容量 = 浓缩差（摘要代替实现）
 *
 * 输入：inputs/（源头全集）+ outputs/*.json（各 facts 的 inputs 声明）
 * 输出：outputs/00-审计.json + outputs/00-审计.md
 * 重跑：node scripts/00-audit.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'outputs');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function walk(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}
function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }
function lines(p) { return fs.readFileSync(p, 'utf8').split('\n').length; }

// 1. 源头全集（脚本枚举，不靠人列）
function sources() {
  const out = [];
  for (const f of walk(path.join(ROOT, 'inputs', 'electron'), '.js')) out.push(rel(f));
  for (const f of walk(path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components'), '.jsx')) out.push(rel(f));
  for (const f of walk(path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components'), '.js')) out.push(rel(f));
  for (const f of walk(path.join(ROOT, 'inputs', 'pipeline_step', 'project'), '.css')) out.push(rel(f));
  return out.sort();
}

// 2. 被认领的（从各 facts 的 inputs 声明反推）
function claimed() {
  const map = new Map();
  for (const f of fs.readdirSync(OUT)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
      for (const inp of j.inputs || []) {
        const p = inp.path;
        if (!map.has(p)) map.set(p, []);
        map.get(p).push(f);
      }
    } catch (_) {}
  }
  return map;
}

function main() {
  const src = sources();
  const clm = claimed();

  // 认领对账
  const orphans = src.filter((s) => !clm.has(s));

  // 浓缩对账：源头文件行数 vs facts 里"声称覆盖该文件"的产出内容量
  // 简化：源头文件行数 vs facts 里 inputs 含该文件的 facts 的总字节（按比例）
  const concentration = [];
  for (const s of src) {
    const facts = clm.get(s) || [];
    if (!facts.length) continue;
    const srcLines = lines(path.join(ROOT, s));
    // 该文件被哪些 facts 覆盖 + 这些 facts 的总产出字节
    let factsBytes = 0;
    for (const f of facts) factsBytes += fs.statSync(path.join(OUT, f)).size;
    concentration.push({ file: s, srcLines, facts: facts.length, factsBytes });
  }
  // 浓缩嫌疑：源头行数 > 100 但只被 1 个 facts 覆盖且该 facts 字节 < 源头行数*20
  const suspicious = concentration.filter((c) => c.srcLines > 100 && c.factsBytes < c.srcLines * 20);

  const result = {
    generated_by: 'scripts/00-audit.cjs',
    stats: { sourceFiles: src.length, claimed: src.length - orphans.length, orphans: orphans.length },
    orphans,
    concentration,
    suspicious,
  };

  fs.writeFileSync(path.join(OUT, '00-审计.json'), JSON.stringify(result, null, 2), 'utf8');

  const L = [];
  L.push('# 00 · 逐环反向对账审计（源头做基准）');
  L.push('');
  L.push(`> 源头文件 ${src.length} / 被认领 ${src.length - orphans.length} / 孤儿 ${orphans.length}`);
  L.push('');
  L.push('## 划分环：孤儿源文件（无脚本认领 = 少划分）');
  L.push('');
  if (orphans.length) for (const o of orphans) L.push(`- ✗ \`${o}\``);
  else L.push('- ✓ 源头文件全部被认领');
  L.push('');
  fs.writeFileSync(path.join(OUT, '00-审计.md'), L.join('\n'), 'utf8');

  console.log(`[00-audit] 源头 ${src.length} / 被认领 ${src.length - orphans.length} / 孤儿 ${orphans.length}`);
  if (orphans.length) {
    console.log('[00-audit ✗ 少划分] 孤儿源文件：');
    for (const o of orphans) console.log('  -', o);
  } else {
    console.log('[00-audit ✓] 源头文件全部被认领');
  }
  if (suspicious.length) {
    console.log(`[00-audit ⚠ 浓缩嫌疑] ${suspicious.length} 个文件（源头行数 vs facts 字节）：`);
    for (const c of suspicious.slice(0, 10)) console.log(`  - ${c.file}: 源头 ${c.srcLines} 行 → facts ${c.factsBytes} 字节`);
  }
}

main();
