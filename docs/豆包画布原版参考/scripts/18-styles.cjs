#!/usr/bin/env node
/**
 * 18-styles.cjs —— 样式提取：从 minified CSS 解析 className → 样式定义，和 04 的布局 className 交叉。
 *
 * 输入：inputs/pipeline_step/project/index-Dg_Oc7MR.css + outputs/04-组件规格.json
 * 输出：outputs/18-样式.json + outputs/18-样式.md
 * 幂等、可重跑：node scripts/18-styles.cjs（依赖 04 先跑）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'index-Dg_Oc7MR.css');
const COMP = path.join(ROOT, 'outputs', '04-组件规格.json');
const OUT_JSON = path.join(ROOT, 'outputs', '18-样式.json');
const OUT_MD = path.join(ROOT, 'outputs', '18-样式.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function main() {
  const css = fs.readFileSync(CSS, 'utf8');
  // 解析 .className{...} 规则块（minified CSS）
  const rules = new Map(); // className -> 样式内容
  const re = /\.([A-Za-z_-][\w-]*)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const name = m[1];
    const body = m[2].trim();
    if (!rules.has(name)) rules.set(name, body);
  }

  // 04 的布局 className（去重）
  const comps = JSON.parse(fs.readFileSync(COMP, 'utf8'));
  const usedClasses = new Set();
  for (const c of comps.components) {
    for (const l of c.layout) usedClasses.add(l);
    for (const b of c.buttons) if (b.cls) usedClasses.add(b.cls);
  }

  // 交叉：哪些组件用到的 className 有样式定义
  const matched = [];
  for (const cls of [...usedClasses].sort()) {
    if (rules.has(cls)) matched.push({ className: cls, style: rules.get(cls).slice(0, 120) });
  }

  // 未匹配的（组件用了但 CSS 无定义，可能是动态或继承）
  const unmatched = [...usedClasses].filter((cls) => !rules.has(cls));

  const result = {
    generated_by: 'scripts/18-styles.cjs',
    inputs: [
      { path: 'inputs/pipeline_step/project/index-Dg_Oc7MR.css', sha256: sha256(CSS) },
      { path: 'outputs/04-组件规格.json', sha256: sha256(COMP) },
    ],
    stats: { totalRules: rules.size, usedClasses: usedClasses.size, matched: matched.length, unmatched: unmatched.length },
    matched,
    unmatched,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[18-styles] CSS 规则 ${rules.size} / 组件用到 ${usedClasses.size} / 有样式 ${matched.length} / 无样式 ${unmatched.length}`);
  console.log(`[18-styles] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 18 · 样式（机器生成）');
  L.push('');
  L.push('> 由 `scripts/18-styles.cjs` 解析 minified CSS + 交叉 04，勿手改。');
  L.push('');
  L.push('## className → 样式（组件用到的，有定义）');
  L.push('');
  L.push('| className | 样式 |');
  L.push('|---|---|');
  for (const m of r.matched) L.push(`| \`.${m.className}\` | \`${m.style}\` |`);
  L.push('');
  if (r.unmatched.length) {
    L.push(`## 组件用了但 CSS 无定义（${r.unmatched.length} 个，可能是动态/继承/库默认）`);
    L.push('');
    L.push(r.unmatched.map((x) => '`' + x + '`').join(' '));
    L.push('');
  }
  return L.join('\n');
}

main();
