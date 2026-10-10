#!/usr/bin/env node
/**
 * Step 0 普查：M3（SSOT 第二份）的**份数**
 *
 * 判据：同一真相在 ≥2 处各写一份 ⇒ 收口到「拥有真相的那一层」
 * 输出：每个真相 → 定义处 + 硬编码副本处
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(SRC);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
/** 剥注释（否则文档里的说明会被当成副本） */
function code(p) {
  return fs
    .readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}
const cache = new Map();
const src = (p) => {
  if (!cache.has(p)) cache.set(p, code(p));
  return cache.get(p);
};

/** 找某个标识符的**定义处**（export const/function） */
function defs(name) {
  const out = [];
  for (const f of files) {
    src(f)
      .split('\n')
      .forEach((ln, i) => {
        if (new RegExp(`export\\s+(?:const|function)\\s+${name}\\b`).test(ln)) out.push(`${rel(f)}:${i + 1}`);
      });
  }
  return out;
}

/** 找某个标识符的**引用处** */
function uses(name) {
  const out = [];
  for (const f of files) {
    src(f)
      .split('\n')
      .forEach((ln, i) => {
        if (new RegExp(`\\b${name}\\b`).test(ln)) out.push(`${rel(f)}:${i + 1}`);
      });
  }
  return out;
}

/** 找裸字面量的出现处（硬编码副本） */
function literals(re, opts = {}) {
  const out = [];
  for (const f of files) {
    const r = rel(f);
    if (opts.skip && opts.skip.some((s) => r.includes(s))) continue;
    src(f)
      .split('\n')
      .forEach((ln, i) => {
        if (re.test(ln)) out.push(`${r}:${i + 1}  ${ln.trim().slice(0, 88)}`);
      });
  }
  return out;
}

const REPORT = [
  ['TD-01-3  STALE_JOB_STATUSES', () => defs('STALE_JOB_STATUSES')],
  ['TD-03-2  GEN_MAX_RETRY', () => defs('GEN_MAX_RETRY')],
  ['TD-03-2  FAILURE_MAX_RETRY', () => defs('FAILURE_MAX_RETRY')],
  ['TD-03-2  GEN_MAX_RETRY 的引用', () => uses('GEN_MAX_RETRY')],
  ['TD-12-1  MIN_IMAGE_SIDE', () => defs('MIN_IMAGE_SIDE')],
  ['TD-12-1  MIN_IMAGE_BYTES', () => defs('MIN_IMAGE_BYTES')],
  ['TD-12-1  lib/url.ts 里的裸 200 / 4096', () => literals(/\b(200|4096)\b/, { skip: ['constants/'] })],
  ['TD-08-2  DEFAULT_IMAGE_RESOLUTION', () => defs('DEFAULT_IMAGE_RESOLUTION')],
  ['TD-08-2  ui 里的裸 2K', () => literals(/'2K'/, { skip: ['constants/'] })],
  ['TD-01-1  PROTOCOL_IMG', () => defs('PROTOCOL_IMG')],
  ['TD-01-1  withThumb', () => defs('withThumb')],
  ['TD-01-1  ?w= 字面量', () => literals(/[?&]w=/)],
  ['TD-11-2  facemask 文案', () => literals(/块状像素化|马赛克/)],
  ['TD-02-1  COLLISION_LEVEL_LABEL', () => defs('COLLISION_LEVEL_LABEL')],
];

for (const [title, fn] of REPORT) {
  const hits = fn();
  console.log(`\n── ${title} —— ${hits.length} 处`);
  hits.slice(0, 12).forEach((h) => console.log(`   ${h}`));
  if (hits.length > 12) console.log(`   … 另 ${hits.length - 12} 处`);
}
