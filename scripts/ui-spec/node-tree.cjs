#!/usr/bin/env node
/**
 * 自动定位节点的**根元素行**并打印其完整 JSX 结构树
 *
 * 用法：node scripts/ui-spec/node-tree.cjs WL.jsx [maxLines]
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SRC = 'G:\\01画布项目\\豆包画布\\逆向工程\\_pipeline_step\\project\\src\\expanded_components';
const file = process.argv[2];
const maxLines = Number(process.argv[3] || 0);

const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n');

// 从后往前找含 `-node` 的根渲染（主渲染通常靠后；子渲染不含 -node 根类）
let start = -1;
let rootClass = '';
for (let i = lines.length - 1; i >= 0; i--) {
  const m = lines[i].match(/className=\{[`"`][^`"]*\b([a-z]+-node)\b/);
  if (!m) continue;
  const isRootLine =
    /return\s+</.test(lines[i]) ||
    (i > 0 && /return\s*$/.test(lines[i - 1])) ||
    (i > 1 && /return\s+<i\.Fragment>/.test(lines[i - 1]));
  if (isRootLine) {
    start = i + 1;
    rootClass = m[1];
    break;
  }
}
if (start < 0) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/return\s+<[a-z.]+\b/.test(lines[i]) && /-node/.test(lines[i])) {
      start = i + 1;
      rootClass = (lines[i].match(/([a-z]+-node)/) || [])[1] || '?';
      break;
    }
  }
}
if (start < 0) {
  console.log(`❌ ${file}: 未找到根元素`);
  process.exit(0);
}

const end = maxLines ? Math.min(lines.length, start + maxLines) : lines.length;
console.log(`──── ${file}  根类名: ${rootClass}  渲染区间: ${start}–${end} ────`);
console.log(
  execFileSync(process.execPath, [path.join(__dirname, 'jsx-tree.cjs'), file, String(start), String(end)], {
    encoding: 'utf8',
  }),
);
