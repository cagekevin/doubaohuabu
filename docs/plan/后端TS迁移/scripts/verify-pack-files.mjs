#!/usr/bin/env node
/**
 * verify-pack-files.mjs —— **不打包**验证打包白名单（README §4.1 D-7 的机器化）。
 *
 * 为什么要有它：`npm run pack:dir` 会**下载目标平台的 electron 二进制**（几百 MB）——
 *   只为了确认「哪些文件会进 asar」不值得。而 D-7 要验的恰恰只是**文件清单**：
 *     · 只发**产物**：electron 源码里的 `.ts` · `tsconfig*.json` · `*.tsbuildinfo` **不进包**；
 *     · 关键产物**必须在**：`dist/index.html` · `electron/dist/{main,preload,ipc}.js` ·
 *       `dola-duration-main.js` · `dola-duration-dump.js` · 两个 skill-pack · `electron/node_modules/ws`；
 *     · `**\/*.map` 不进包。
 *
 * ★ **匹配器用的是 electron-builder 自己那份**（`app-builder-lib/out/fileMatcher` 的 `FileMatcher.createFilter()`）——
 *   ⛔ 不是自己拿 `minimatch` 复写一套（复写会与真实打包行为漂移，那正是"两处真相"）。
 *
 * 用法：node docs/plan/后端TS迁移/scripts/verify-pack-files.mjs [--config <yml>] [--list] [--json] [--help]
 * 退出码：0 通过 · 1 违反 D-7 · 2 用法/环境错
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`verify-pack-files.mjs —— 静态验证打包白名单（用 electron-builder 自己的匹配器，零下载）

用法：node .../verify-pack-files.mjs [--config <yml>] [--list] [--json]
  --config <yml>  默认 packing/win/electron-builder.yml
  --list          打印会进包的完整文件清单
⛔ 不跑 electron-builder、不下载任何二进制。`);
  process.exit(0);
}
const cfgIdx = args.indexOf('--config');
const cfgPath = path.resolve(REPO, cfgIdx >= 0 ? args[cfgIdx + 1] : 'packing/win/electron-builder.yml');
const listOnly = args.includes('--list');

/** 从 yml 里抽 `files:` 顶层块（本项目这两个文件的 `files` 全是简单 `- 标量` 行） */
function readFilesPatterns(yml) {
  const lines = yml.split('\n');
  const out = [];
  let inFiles = false;
  for (const raw of lines) {
    if (/^files:\s*$/.test(raw)) {
      inFiles = true;
      continue;
    }
    if (!inFiles) continue;
    if (/^\S/.test(raw)) break; // 回到顶层键 ⇒ 块结束
    const m = /^\s+-\s+(.*)$/.exec(raw);
    if (!m) continue;
    let v = m[1].replace(/\s+#.*$/, '').trim(); // 去行尾注释
    v = v.replace(/^['"]|['"]$/g, ''); // 去引号
    if (v) out.push(v);
  }
  return out;
}

const yml = fs.readFileSync(cfgPath, 'utf8');
const patterns = readFilesPatterns(yml);
if (!patterns.length) {
  console.error(`❌ 没从 ${path.relative(REPO, cfgPath)} 抽出 files 白名单`);
  process.exit(2);
}

const require_ = createRequire(import.meta.url);
let FileMatcher;
try {
  ({ FileMatcher } = require_('app-builder-lib/out/fileMatcher'));
} catch (e) {
  console.error(`❌ 取不到 electron-builder 的匹配器（app-builder-lib）：${e.message}`);
  process.exit(2);
}
// `macroExpander` 传恒等（本配置无 ${…} 宏）；`from` = 仓根 ⇒ filter 收**绝对路径**
const filter = new FileMatcher(REPO, '/', (x) => x, patterns).createFilter();

/** 全仓遍历（跳过 .git 与打包产物目录，它们不是被 `files` 白名单覆盖的对象） */
const SKIP = new Set(['.git', 'packing']);
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && SKIP.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}
// `createFilter()` 的签名是 `(file, stat)`：`stat` 只需 `isDirectory()`（本工具只喂**文件**）
const FILE_STAT = { isDirectory: () => false };
const packed = walk(REPO)
  .filter((abs) => filter(abs, FILE_STAT))
  .map((abs) => path.relative(REPO, abs).split(path.sep).join('/'));
const packedSet = new Set(packed);

/** D-7 判据（与 README §4.1 D-7 / D-5 同一份口径） */
const MUST_EXCLUDE = [
  [/^electron\/.*\.ts$/, 'electron 源码 .ts'],
  [/^electron\/.*\/tsconfig.*\.json$/, 'electron tsconfig'],
  [/^electron\/.*\.tsbuildinfo$/, 'tsbuildinfo'],
  [/\.map$/, 'sourcemap'],
  [/^electron\/.*\.bak$/, '备份件'],
];
const MUST_INCLUDE = [
  'dist/index.html',
  'package.json',
  'electron/dist/main.js',
  'electron/dist/preload.js',
  'electron/dist/ipc.js',
  'electron/dist/dola-duration-main.js',
  'electron/dist/dola-duration-dump.js',
  'electron/dist/dola-skill-pack.json',
  'electron/dist/doubao-skill-pack.json',
  'electron/node_modules/ws/package.json',
];

const violations = [];
for (const f of packed) {
  for (const [re, what] of MUST_EXCLUDE) {
    if (re.test(f)) violations.push(`不该进包却进了：${f}（${what}）`);
  }
}
for (const f of MUST_INCLUDE) {
  if (!packedSet.has(f)) violations.push(`该进包却没进：${f}`);
}

console.log(`配置：${path.relative(REPO, cfgPath)}`);
console.log(`白名单：${patterns.length} 条 → 会进包的文件 ${packed.length} 个`);
if (listOnly) {
  for (const f of packed.slice().sort()) console.log(`  ${f}`);
}
if (violations.length) {
  console.error(`\n❌ 违反 D-7（${violations.length} 条）：`);
  for (const v of violations) console.error(`   · ${v}`);
  process.exit(1);
}
console.log(`\n✅ D-7 全部满足（只发产物 · 关键文件齐 · 无 .map/.ts/tsconfig/.tsbuildinfo）`);
