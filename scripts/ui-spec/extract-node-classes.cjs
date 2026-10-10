#!/usr/bin/env node
/**
 * 从原版 jsx 抽取「8 类节点的全部 className + 文案 + 根元素 + 交互 + SVG」
 * 产出：`app/_nodes.json`（供 `node-tree.cjs` 与人工查阅）
 *
 * 用法：node scripts/ui-spec/extract-node-classes.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = 'G:\\01画布项目\\豆包画布\\逆向工程\\_pipeline_step\\project\\src\\expanded_components';
const OUT = path.resolve(__dirname, '..', '..', '_nodes.json');

/** 8 类节点 → 原版文件（回源自 `dO`，shared.js:43402） */
const NODES = [
  ['material', 'fL.jsx'],
  ['text', 'CL.jsx'],
  ['account', 'OL.jsx'],
  ['video', 'BL.jsx'],
  ['download', 'WL.jsx'],
  ['group', 'GL.jsx'],
  ['genvideo', 'YL.jsx'],
  ['imggen', 'ZL.jsx'],
];

function classNames(code) {
  const out = new Set();
  for (const m of code.matchAll(/className="([^"]+)"/g)) out.add(m[1]);
  for (const m of code.matchAll(/className=\{`([^`]+)`\}/g)) out.add(m[1].replace(/\$\{[^}]*\}/g, '…'));
  for (const m of code.matchAll(/className=\{[^}]*?'([^']+)'/g)) out.add(m[1]);
  return [...out].map((s) => s.trim()).filter(Boolean).sort();
}

function literals(code) {
  const out = new Set();
  for (const m of code.matchAll(/['"`]([\u4e00-\u9fa5][^'"`]{1,30})['"`]/g)) out.add(m[1]);
  for (const m of code.matchAll(/>([\u4e00-\u9fa5][^<>{}]{1,30})</g)) out.add(m[1].trim());
  return [...out].sort();
}

function svgs(code) {
  return [...code.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0].replace(/\s+/g, ' ').slice(0, 400));
}

const report = [];
for (const [type, file] of NODES) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) {
    report.push({ type, file, missing: true });
    continue;
  }
  const code = fs.readFileSync(p, 'utf8');
  report.push({
    type,
    file,
    bytes: code.length,
    classes: classNames(code),
    literals: literals(code),
    svgCount: svgs(code).length,
    svgs: svgs(code),
    root: (code.match(/<div[^>]*className=\{?`?"?[^>]*?-node[^>]*>/g) || []).slice(0, 2),
    handlers: [...new Set([...code.matchAll(/on(DoubleClick|ContextMenu|Click|PointerDown)\b/g)].map((m) => m[1]))],
  });
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(`已写出 _nodes.json（${report.length} 类节点）`);
