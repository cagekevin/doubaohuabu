#!/usr/bin/env node
/**
 * 17-boundary.cjs —— 边界项静态机制：从 11 筛选授权/采集/指纹相关函数，原样引用。
 *   只静态理解机制，不做绕过、不做真实调用（合规边界）。
 *
 * 输入：outputs/11-主进程函数体.json
 * 输出：outputs/17-边界项.json + outputs/17-边界项.md
 * 幂等、可重跑：node scripts/17-boundary.cjs（依赖 11 先跑）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BODY = path.join(ROOT, 'outputs', '11-主进程函数体.json');
const OUT_JSON = path.join(ROOT, 'outputs', '17-边界项.json');
const OUT_MD = path.join(ROOT, 'outputs', '17-边界项.md');

// 边界项分组：前缀 → 语义标签
const GROUPS = [
  [/license|machine-code|activate|授权/i, '授权/license'],
  [/dola/i, 'dola 采集'],
  [/lovart/i, 'Lovart 采集'],
  [/fingerprint|ua-preload|fp-net/i, '指纹伪装'],
  [/firefox|chrome-cdp|chrome|debugger|cdp/i, '浏览器自动化'],
];

function groupOf(name) {
  for (const [re, label] of GROUPS) if (re.test(name)) return label;
  return null;
}

function main() {
  const body = JSON.parse(fs.readFileSync(BODY, 'utf8'));
  const picked = [];

  for (const m of body.modules) {
    for (const h of m.handlers) {
      const g = groupOf(h.channel);
      if (g) picked.push({ group: g, kind: 'handler', name: h.channel, file: m.file, line: h.line, body: h.body });
    }
    for (const f of m.funcs) {
      const g = groupOf(f.name);
      if (g) picked.push({ group: g, kind: 'function', name: f.name, file: m.file, line: f.line, body: f.body });
    }
  }

  const result = {
    generated_by: 'scripts/17-boundary.cjs',
    note: '只静态理解机制，不做绕过、不做真实调用（合规边界）',
    inputs: [{ path: 'outputs/11-主进程函数体.json', sha256: crypto.createHash('sha256').update(fs.readFileSync(BODY)).digest('hex') }],
    stats: { picked: picked.length },
    picked,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[17-boundary] 边界项函数 ${picked.length}`);
  console.log(`[17-boundary] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 17 · 边界项静态机制（机器筛选，原样引用）');
  L.push('');
  L.push('> 由 `scripts/17-boundary.cjs` 从 11 筛选；**只静态理解机制，不做绕过、不做真实调用。**');
  L.push('');
  let cur = '';
  for (const p of r.picked) {
    if (p.group !== cur) { cur = p.group; L.push(`## ${cur}`); L.push(''); }
    L.push(`### ${p.kind} \`${p.name}\`（${p.file}:${p.line}）`);
    L.push('');
    L.push('```js');
    L.push((p.body || '').slice(0, 400));
    L.push('```');
    L.push('');
  }
  return L.join('\n');
}

main();
