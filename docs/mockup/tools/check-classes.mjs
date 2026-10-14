#!/usr/bin/env node
/**
 * 校验 mockup 的 HTML：**每个真机类是否带齐它的 `composes` 祖先**。
 *
 * 为什么需要它：`spec/ui-real.css` 导出时**删掉了 `composes` 声明**（浏览器不认），
 * 于是 HTML 里只写子类名 ⇒ **静默丢掉真源基础样式**（表现为"到处都没样式 / 透明 / 尺寸不对"）。
 * 这种错**看不出来**，只能靠对账。
 *
 * 用法：`node docs/mockup/tools/check-classes.mjs [html 文件]`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.resolve(ROOT, process.argv[2] || 'index.html');
const JSON_PATH = path.join(ROOT, 'spec/ui-css.json');

/** scoped 类名 → 它的 composes 祖先（scoped 名） */
const need = new Map();
for (const f of JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')).files) {
  for (const c of f.classes) if (c.composes.length) need.set(c.scoped, c.composes);
}

const html = fs.readFileSync(HTML, 'utf8');
const bad = [];
for (const m of html.matchAll(/class="([^"]+)"/g)) {
  const own = m[1].split(/\s+/).filter(Boolean);
  for (const c of own) {
    const ancestors = need.get(c);
    if (!ancestors) continue;
    for (const a of ancestors) {
      if (!own.includes(a)) bad.push(`${c}  ← 缺祖先 ${a}   （类串：${m[1]}）`);
    }
  }
}

const seen = new Set();
const uniq = bad.filter((x) => (seen.has(x) ? false : seen.add(x)));
if (uniq.length === 0) {
  console.log('✅ composes 祖先齐全（0 处缺失）');
  process.exit(0);
}
console.log(`❌ ${uniq.length} 处缺 composes 祖先：`);
for (const x of uniq) console.log('   ' + x);
process.exit(1);
