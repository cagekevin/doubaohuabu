#!/usr/bin/env node
/**
 * 按**出现顺序**打印 JSX 的嵌套骨架（揭示结构，而不是散乱类名）
 *
 * 用法：node scripts/_jsx-tree.cjs CL.jsx [起始行] [结束行]
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = 'G:\\01画布项目\\豆包画布\\逆向工程\\_pipeline_step\\project\\src\\expanded_components';
const file = process.argv[2];
const from = Number(process.argv[3] || 0);
const to = Number(process.argv[4] || 0);

const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n');
const end = to || lines.length;

let depth = 0;
const out = [];
for (let i = Math.max(0, from - 1); i < end; i++) {
  const raw = lines[i];
  const t = raw.trim();
  if (!t) continue;

  // 结束标签：先减深度
  const closeOnly = /^<\//.test(t);
  if (closeOnly) depth = Math.max(0, depth - 1);

  // 是否是「开标签行」
  const isOpen = /^<[A-Za-z]/.test(t) && !/\/>\s*$/.test(t) && !/^<\/ /.test(t);
  const isSelfClose = /^<[A-Za-z][\s\S]*\/>\s*$/.test(t) || (/^<[A-Za-z]/.test(t) && /\/>\s*$/.test(t));

  const interesting =
    /^<[A-Za-z]/.test(t) ||
    /className=/.test(t) ||
    /^\{\s*[\w?]/.test(t) ||
    /title=/.test(t) ||
    /placeholder=/.test(t) ||
    /^\{['"`]/.test(t) ||
    /^[\u4e00-\u9fa5]/.test(t);

  if (interesting) {
    // 压缩空白
    let s = t.replace(/\s+/g, ' ');
    if (s.length > 150) s = s.slice(0, 150) + ' …';
    out.push('  '.repeat(Math.min(depth, 12)) + s);
  }

  if (isOpen && !isSelfClose && !closeOnly) depth += 1;
  // 同一行既开又闭
  if (/<\/[A-Za-z]+>\s*$/.test(t) && isOpen) depth = Math.max(0, depth - 1);
}

console.log(`──── ${file}  (第 ${from || 1}–${end} 行，共 ${lines.length} 行) ────`);
console.log(out.join('\n'));
