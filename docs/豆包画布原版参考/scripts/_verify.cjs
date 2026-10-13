#!/usr/bin/env node
/**
 * _verify.cjs —— 产出↔源头 字节级覆盖对账：证明「没有漏」。
 *   不是自己数自己（提取正则会连带验证一起漏），而是用源头原文做基准，反向查产出是否完整包含。
 *
 * 五个维度：
 *   1. 主进程源码覆盖：electron/**​/*.js 的完整原文，是否 100% 出现在 03-主进程/（完整内联）
 *   2. 渲染层组件覆盖：*.jsx 是否 100% 进入 12 组件树（tree+orphans）与 04 组件规格
 *   3. shared.js 定义覆盖：shared.js 的**全部顶层定义原文**，是否 100% 进入 10-shared工具/（新增）
 *   4. 源头认领覆盖：每个源文件是否被至少一个 facts 认领（孤儿检测，第三方库排除）
 *   5. 新鲜度 + 指纹一致：facts 的 inputs[].sha256 是否与磁盘一致；00-事实指纹.md 是否与磁盘 facts 一致（新增）
 *
 * 输出：outputs/00-验证.json + outputs/00-验证.md
 * 重跑：node scripts/_verify.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'outputs');
const ELECTRON = path.join(ROOT, 'inputs', 'electron');
const COMP_DIR = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components');
const MAIN_DIR = path.join(OUT, 'BUILD-SPEC', '03-主进程');
const SHARED_UTILS_DIR = path.join(OUT, 'BUILD-SPEC', '10-shared工具');
const SPEC_DIR = path.join(OUT, 'BUILD-SPEC');

function walk(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (!ext || e.name.endsWith(ext)) out.push(p);
  }
  return out;
}
function norm(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }
function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function main() {
  const report = { generated_by: 'scripts/_verify.cjs', sections: [] };

  // ============ 1. 主进程源码字节覆盖 ============
  {
    const md = fs.existsSync(MAIN_DIR)
      ? fs.readdirSync(MAIN_DIR).filter((f) => f.endsWith('.md')).map((f) => fs.readFileSync(path.join(MAIN_DIR, f), 'utf8')).join('\n')
      : '';
    const files = walk(ELECTRON, '.js').sort();
    let totalBytes = 0, coveredBytes = 0;
    const misses = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const rel = norm(f);
      totalBytes += src.length;
      if (md.includes(src)) coveredBytes += src.length;
      else misses.push(rel);
    }
    report.sections.push({
      name: '主进程源码 → 03-主进程/（字节级完整包含）',
      files: files.length,
      totalBytes,
      coveredBytes,
      coverage: totalBytes ? (coveredBytes / totalBytes) : 1,
      misses,
    });
  }

  // ============ 2. 渲染层组件覆盖 ============
  {
    const comps = JSON.parse(fs.readFileSync(path.join(OUT, '04-组件规格.json'), 'utf8'));
    const tree = JSON.parse(fs.readFileSync(path.join(OUT, '12-组件树.json'), 'utf8'));
    const compNames = new Set(comps.components.map((c) => c.name));
    const treeNames = new Set([...tree.tree.map((n) => n.name), ...(tree.orphanComponents || [])]);

    const files = fs.readdirSync(COMP_DIR).filter((f) => f.endsWith('.jsx')).sort();
    const notInComps = [];
    const notInTree = [];
    const noSourceFile = [];
    for (const f of files) {
      const name = f.replace('.jsx', '');
      if (!compNames.has(name)) notInComps.push(name);
      if (!treeNames.has(name)) notInTree.push(name);
      const mdPath = path.join(SPEC_DIR, '05-组件', '组件', name + '.md');
      if (!fs.existsSync(mdPath) || !fs.readFileSync(mdPath, 'utf8').includes('## 源码原文')) noSourceFile.push(name);
    }
    report.sections.push({
      name: '渲染层 .jsx → 04 组件规格 + 12 组件树 + 05-组件/组件/<名>.md（含源码原文）',
      files: files.length,
      inComps: files.length - notInComps.length,
      inTree: files.length - notInTree.length,
      withSource: files.length - noSourceFile.length,
      notInComps,
      notInTree,
      noSourceFile,
    });
  }

  // ============ 3. shared.js 顶层定义字节覆盖（新增） ============
  {
    const su = JSON.parse(fs.readFileSync(path.join(OUT, '19-shared工具.json'), 'utf8'));
    const md = fs.existsSync(SHARED_UTILS_DIR)
      ? fs.readdirSync(SHARED_UTILS_DIR).filter((f) => f.endsWith('.md')).map((f) => fs.readFileSync(path.join(SHARED_UTILS_DIR, f), 'utf8')).join('\n')
      : '';
    let totalBytes = 0, coveredBytes = 0;
    const misses = [];
    for (const d of su.defs) {
      totalBytes += d.src.length;
      if (md.includes(d.src.trimEnd())) coveredBytes += d.src.length;
      else misses.push(`${d.name}@${d.line}`);
    }
    report.sections.push({
      name: 'shared.js 顶层定义 → 10-shared工具/（字节级完整包含）',
      files: su.defs.length,
      totalBytes,
      coveredBytes,
      coverage: totalBytes ? (coveredBytes / totalBytes) : 1,
      misses,
    });
  }

  // ============ 4. 源头认领覆盖（孤儿检测，第三方库单独标记） ============
  {
    const src = [];
    for (const f of walk(ELECTRON, '.js')) src.push(norm(f));
    for (const f of walk(COMP_DIR, '.jsx')) src.push(norm(f));
    for (const f of walk(COMP_DIR, '.js')) src.push(norm(f));
    src.sort();

    // 第三方库：webcrack 拆出的 vendor bundle（如 mediapipe vision），非业务代码，不逐字复刻
    const thirdParty = src.filter((s) => /bundle-[\w$-]+\.js$/.test(s));

    const claimed = new Set();
    for (const f of fs.readdirSync(OUT)) {
      if (!f.endsWith('.json')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
        for (const inp of j.inputs || []) if (inp.path) claimed.add(inp.path);
      } catch (_) {}
    }
    const business = src.filter((s) => !thirdParty.includes(s));
    const orphans = business.filter((s) => !claimed.has(s));
    report.sections.push({
      name: '源头文件认领（孤儿检测，第三方库排除）',
      files: business.length,
      claimed: business.length - orphans.length,
      thirdParty,
      orphans,
    });
  }

  // ============ 5. 新鲜度 + 指纹一致（新增） ============
  {
    // 5a. facts 新鲜度：每个 facts 记录的 inputs[].sha256 必须与磁盘一致
    const stale = [];
    const fresh = [];
    for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.json')).sort()) {
      let j;
      try { j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); } catch (_) { continue; }
      const ins = (j.inputs || []).filter((x) => x && x.path && x.sha256);
      if (!ins.length) continue;
      let bad = null;
      for (const it of ins) {
        const abs = path.join(ROOT, it.path);
        if (!fs.existsSync(abs)) continue;
        if (sha256(abs) !== it.sha256) { bad = it.path; break; }
      }
      if (bad) stale.push(`${f}（输入已变更：${bad}）`); else fresh.push(f);
    }

    // 5b. 指纹一致：spec 里的 00-事实指纹.md 必须与磁盘 facts 的 sha256 一致
    const fpPath = path.join(SPEC_DIR, '00-事实指纹.md');
    const fpMismatch = [];
    if (fs.existsSync(fpPath)) {
      const fp = fs.readFileSync(fpPath, 'utf8');
      for (const f of fs.readdirSync(OUT).filter((x) => /^\d\d-.*\.json$/.test(x)).sort()) {
        const m = new RegExp('\\| `' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '` \\| `([0-9a-f]{64})` \\|').exec(fp);
        if (!m) continue;                                   // 指纹里没列这个 facts，跳过
        if (m[1] !== sha256(path.join(OUT, f))) fpMismatch.push(f);
      }
    } else {
      fpMismatch.push('(缺 00-事实指纹.md)');
    }

    const specFiles = walk(SPEC_DIR, null).length;
    report.sections.push({
      name: '新鲜度 + 指纹一致（spec 是否与 facts 同步）',
      freshCount: fresh.length,
      stale,
      fpMismatch,
      specFiles,
    });
  }

  // ============ 汇总 ============
  const [main, render, shared, orphan, freshness] = report.sections;
  report.summary = {
    mainCoverage: main.coverage,
    mainMiss: main.misses.length,
    renderCompsMissing: render.notInComps.length,
    renderTreeMissing: render.notInTree.length,
    renderSourceMissing: render.noSourceFile.length,
    sharedCoverage: shared.coverage,
    sharedMiss: shared.misses.length,
    orphanFiles: orphan.orphans.length,
    staleFacts: freshness.stale.length,
    fingerprintMismatch: freshness.fpMismatch.length,
    specFiles: freshness.specFiles,
    allPass: main.misses.length === 0
      && render.notInComps.length === 0 && render.notInTree.length === 0 && render.noSourceFile.length === 0
      && shared.misses.length === 0
      && orphan.orphans.length === 0
      && freshness.stale.length === 0 && freshness.fpMismatch.length === 0,
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, '00-验证.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '00-验证.md'), renderMarkdown(report), 'utf8');

  const s = report.summary;
  console.log(`[_verify] 主进程覆盖 ${(s.mainCoverage * 100).toFixed(2)}%（漏 ${s.mainMiss} 文件 / ${main.totalBytes - main.coveredBytes} 字节）`);
  console.log(`[_verify] 渲染层：04 缺 ${s.renderCompsMissing} / 12 缺 ${s.renderTreeMissing} / 源码原文缺 ${s.renderSourceMissing}`);
  console.log(`[_verify] shared.js 定义覆盖 ${(s.sharedCoverage * 100).toFixed(2)}%（漏 ${s.sharedMiss} / ${shared.totalBytes - shared.coveredBytes} 字节）`);
  console.log(`[_verify] 源头孤儿文件 ${s.orphanFiles}；过期 facts ${s.staleFacts}；指纹不一致 ${s.fingerprintMismatch}`);
  console.log(`[_verify] BUILD-SPEC 文件数 ${s.specFiles}`);
  console.log(`[_verify] 结论：${s.allPass ? '✓ 全部覆盖 + 未过期，零遗漏' : '✗ 有遗漏/过期，见报告'}`);
  if (!s.allPass) process.exitCode = 1;
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 00 · 验证报告（产出↔源头 字节级对账 + 新鲜度）');
  L.push('');
  L.push('> 由 `scripts/_verify.cjs` 生成，勿手改；重跑 `node scripts/_verify.cjs`。');
  L.push('');
  for (const s of r.sections) {
    L.push(`## ${s.name}`);
    L.push('');
    if (s.coverage !== undefined) {
      L.push(`- 覆盖率：**${(s.coverage * 100).toFixed(2)}%**（${s.coveredBytes}/${s.totalBytes} 字节）`);
      L.push(`- 单元：${s.files} 个，漏 ${s.misses.length} 个`);
      if (s.misses.length) { L.push(''); for (const x of s.misses) L.push(`  - ✗ \`${x}\``); }
    } else if (s.notInComps !== undefined) {
      L.push(`- 组件文件 ${s.files} 个：进 04 组件规格 ${s.inComps} / 进 12 组件树 ${s.inTree} / 含源码原文 ${s.withSource}`);
      if (s.notInComps.length) L.push(`- 04 缺失：${s.notInComps.map((x) => '`' + x + '`').join(' ')}`);
      if (s.notInTree.length) L.push(`- 12 缺失：${s.notInTree.map((x) => '`' + x + '`').join(' ')}`);
      if (s.noSourceFile.length) L.push(`- 05-组件 缺源码原文：${s.noSourceFile.map((x) => '`' + x + '`').join(' ')}`);
    } else if (s.stale !== undefined) {
      L.push(`- facts 新鲜：${s.freshCount} 个；过期：${s.stale.length}`);
      for (const x of s.stale) L.push(`  - ✗ \`${x}\``);
      L.push(`- 00-事实指纹.md 与磁盘 facts 不一致：${s.fpMismatch.length}`);
      for (const x of s.fpMismatch) L.push(`  - ✗ \`${x}\``);
      L.push(`- BUILD-SPEC 文件数：${s.specFiles}`);
    } else {
      L.push(`- 源文件 ${s.files} 个：被认领 ${s.claimed} / 孤儿 ${s.orphans.length}`);
      if (s.orphans.length) { L.push(''); for (const x of s.orphans) L.push(`  - ✗ \`${x}\``); }
    }
    L.push('');
  }
  L.push('## 结论');
  L.push('');
  L.push(r.summary.allPass ? '**✓ 全部覆盖 + 未过期，零遗漏。**' : '**✗ 有遗漏/过期，见上方明细。**');
  return L.join('\n');
}

main();
