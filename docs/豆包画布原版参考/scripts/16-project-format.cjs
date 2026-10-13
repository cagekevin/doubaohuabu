#!/usr/bin/env node
/**
 * 16-project-format.cjs —— 项目存储格式：从 11 的函数体筛选 project/storage 相关函数，原样引用。
 *   不做任何手写归纳，只把涉及项目持久化的函数体集中展示。
 *
 * 输入：outputs/11-主进程函数体.json
 * 输出：outputs/16-项目格式.json + outputs/16-项目格式.md
 * 幂等、可重跑：node scripts/16-project-format.cjs（依赖 11 先跑）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BODY = path.join(ROOT, 'outputs', '11-主进程函数体.json');
const OUT_JSON = path.join(ROOT, 'outputs', '16-项目格式.json');
const OUT_MD = path.join(ROOT, 'outputs', '16-项目格式.md');

const PATTERN = /project|storage|snapshot|operation|backup|assets|engineering|operations|wrapper/i;

function main() {
  const body = JSON.parse(fs.readFileSync(BODY, 'utf8'));
  const picked = [];

  for (const m of body.modules) {
    // handler：通道名匹配
    for (const h of m.handlers) {
      if (PATTERN.test(h.channel)) picked.push({ kind: 'handler', name: h.channel, file: m.file, line: h.line, body: h.body });
    }
    // 顶层函数：函数名匹配
    for (const f of m.funcs) {
      if (PATTERN.test(f.name)) picked.push({ kind: 'function', name: f.name, file: m.file, line: f.line, body: f.body });
    }
  }

  const result = {
    generated_by: 'scripts/16-project-format.cjs',
    inputs: [{ path: 'outputs/11-主进程函数体.json', sha256: (require('crypto').createHash('sha256').update(fs.readFileSync(BODY)).digest('hex')) }],
    stats: { picked: picked.length },
    picked,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[16-project-format] 筛选出项目存储相关函数 ${picked.length}`);
  console.log(`[16-project-format] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 16 · 项目存储格式（机器筛选，原样引用 11 函数体）');
  L.push('');
  L.push('> 由 `scripts/16-project-format.cjs` 从 11 筛选，勿手改；重跑 `node scripts/16-project-format.cjs`。');
  L.push('');
  for (const p of r.picked) {
    L.push(`## ${p.kind} \`${p.name}\`（${p.file}:${p.line}）`);
    L.push('');
    L.push('```js');
    L.push(p.body || '');
    L.push('```');
    L.push('');
  }
  return L.join('\n');
}

main();
