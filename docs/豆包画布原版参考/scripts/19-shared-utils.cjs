#!/usr/bin/env node
/**
 * 19-shared-utils.cjs —— shared.js 顶层定义**全量**采集（含页面脚本常量与纯 helper）。
 *
 * 为什么需要它：BUILD-SPEC 早期只覆盖了 `*.jsx` 组件 + store + 主进程，
 * 而 `shared.js` 里住着「页面侧探测脚本」（`const cD = \`(function(){…})\``）与
 * 「跨组件纯 helper」（`uD` 图序比对 / `vD` 去重键 / `_0` FNV 哈希 / `Ap` 聚焦脚本）——
 * 这些是豆包交互细节的主要居住地，下游写码时必须能逐字照抄，不能只给签名。
 *
 * 输出「全部顶层定义 + 原文」，分片交给 99-build-spec 做（本脚本只负责采集）。
 *
 * 输入：inputs/pipeline_step/project/src/expanded_components/shared.js
 * 输出：outputs/19-shared工具.json + outputs/19-shared工具.md
 * 幂等、可重跑：node scripts/19-shared-utils.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { blankComments, topLevelDefList, isComponentDef } = require('./_lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components', 'shared.js');
const OUT_JSON = path.join(ROOT, 'outputs', '19-shared工具.json');
const OUT_MD = path.join(ROOT, 'outputs', '19-shared工具.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// 分类（按定义**形态**判，不靠名字）：
//   page-script  注入页面的脚本常量（值是模板串）—— 豆包交互细节所在地
//   string-const 普通长字符串常量
//   class        类定义
//   component    组件（memo/forwardRef/Provider/hooks/JSX）
//   helper-fn    函数值 / 函数声明
//   other        其余
function categorize(d, src) {
  const s = src.trim();
  if (/^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*`[\s\S]*`\s*;?$/.test(s)) return 'page-script';
  if (/^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(['"])[\s\S]*\1\s*;?$/.test(s)) return 'string-const';
  if (d.kind === 'class') return 'class';
  if (isComponentDef(d)) return 'component';
  if (d.kind === 'function') return 'helper-fn';
  if (/^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(s)) return 'helper-fn';
  return 'other';
}

// 一行线索：优先取定义内**含中文的首条注释**（脚本作者写的说明最准），否则取首个中文字符串。
// 用途：10-shared工具 索引里给读者一个「这个脚本大概干嘛」的入口，避免只能靠名字猜。
function hintOf(src) {
  for (const m of src.matchAll(/\/\/\s*([^\n]{2,80})/g)) {
    const t = m[1].replace(/[─—–-]{3,}/g, ' ').trim();
    if (t.length >= 4 && /[\u4e00-\u9fff]/.test(t)) return t.slice(0, 46);
  }
  const cn = /['"`]([^'"`\n]*[\u4e00-\u9fff][^'"`\n]{0,40})['"`]/.exec(src);
  return cn ? cn[1].trim().slice(0, 46) : '';
}

function main() {
  const raw = fs.readFileSync(SHARED, 'utf8');
  const text = blankComments(raw);
  const list = topLevelDefList(text);

  const defs = list.map((d) => {
    const src = raw.slice(d.start, d.end + 1);
    return {
      name: d.name, kind: d.kind, line: d.line,
      lines: src.split('\n').length, bytes: src.length,
      category: categorize(d, src),
      hint: hintOf(src),
      start: d.start, end: d.end,
      src,
    };
  });

  const byCat = {};
  for (const d of defs) byCat[d.category] = (byCat[d.category] || 0) + 1;
  const dupNames = new Set();
  const seen = new Set();
  for (const d of defs) { if (seen.has(d.name)) dupNames.add(d.name); seen.add(d.name); }

  const result = {
    generated_by: 'scripts/19-shared-utils.cjs',
    inputs: [{ path: 'inputs/pipeline_step/project/src/expanded_components/shared.js', sha256: sha256(SHARED) }],
    stats: {
      defs: defs.length,
      uniqueNames: seen.size,
      duplicateNames: dupNames.size,
      totalBytes: defs.reduce((s, d) => s + d.bytes, 0),
      totalLines: defs.reduce((s, d) => s + d.lines, 0),
      byCategory: byCat,
      pageScriptBytes: defs.filter((d) => d.category === 'page-script').reduce((s, d) => s + d.bytes, 0),
    },
    defs,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  const st = result.stats;
  console.log(`[19-shared工具] 顶层定义 ${st.defs} 个（去重名 ${st.uniqueNames} / 重名 ${st.duplicateNames}），共 ${st.totalLines} 行 / ${(st.totalBytes / 1024).toFixed(0)}KB`);
  console.log(`[19-shared工具] 分类 ${Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(' ')}；页面脚本 ${(st.pageScriptBytes / 1024).toFixed(0)}KB`);
  console.log(`[19-shared工具] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 19 · shared.js 顶层定义全量（机器生成）');
  L.push('');
  L.push('> 由 `scripts/19-shared-utils.cjs` 采集，勿手改；重跑 `node scripts/19-shared-utils.cjs`。');
  L.push(`> 定义 ${r.stats.defs} 个（去重名 ${r.stats.uniqueNames}）/ ${r.stats.totalLines} 行；分类 ${Object.entries(r.stats.byCategory).map(([k, v]) => `\`${k}\`×${v}`).join(' ')}。`);
  L.push('> **原文内联在 BUILD-SPEC 的 `10-shared工具/` 分片里**，本文件只给清单。');
  L.push('');
  const cats = [
    ['page-script', '页面脚本常量（注入页面的脚本，交互细节所在地）'],
    ['helper-fn', '纯 helper 函数'],
    ['component', '组件'],
    ['class', '类'],
    ['string-const', '字符串常量'],
    ['other', '其它'],
  ];
  for (const [cat, label] of cats) {
    const ds = r.defs.filter((d) => d.category === cat);
    if (!ds.length) continue;
    L.push(`## ${label}（${ds.length}）`);
    L.push('');
    L.push('| 名字 | 源行 | 行数 | 字节 | 线索（定义内首条中文注释） |');
    L.push('|---|---|---|---|---|');
    for (const d of ds) L.push(`| \`${d.name}\` | ${d.line} | ${d.lines} | ${d.bytes} | ${(d.hint || '').replace(/\|/g, '\\|')} |`);
    L.push('');
  }
  return L.join('\n');
}

main();
