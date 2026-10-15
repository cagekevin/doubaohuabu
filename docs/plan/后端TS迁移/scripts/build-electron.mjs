#!/usr/bin/env node
/**
 * build-electron.mjs —— 后端构建链（README §11.2 定死的三步）。
 *
 *   ① `build:shared`  —— `tsc -p tsconfig.shared.json` → `build/shared-types/`（声明层，给 `@shared/*` 消费）
 *   ② `tsc -p electron/tsconfig.json` → `electron/dist/`
 *   ③ 拷 `dola-duration-main.js` 原样进 `electron/dist/`（guest 主世界文本注入脚本，**不能编译**）
 *
 * 为什么产物必须在 `electron/dist/`（README §4 D-1/D-2、弯路 W12）：
 *   它父链上是 `electron/package.json`（`"type":"commonjs"`）＋ `electron/node_modules`（`ws`）。
 *   挪到仓根 ⇒ ① 被判 ESM ⇒ `require is not defined`；② `Cannot find module 'ws'`。
 *
 * 输出：`electron/dist/` ＋ **文件清单**；缺关键文件 ⇒ exit 2（**不静默**）。
 * ⚠️ 过渡期：`tsconfig.shared.json` 尚未落地（其 include 目标 `src/stable/ipc-channels.ts` 是 B1 的产物）
 *    ⇒ 本步**显式打印跳过**并继续（落盘后自动接上）。这不是"静默降级"。
 *
 * 用法：
 *   node docs/plan/后端TS迁移/scripts/build-electron.mjs [--dry] [--quiet] [--help]
 * 退出码：0 成功 · 2 用法/环境/缺文件。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const DIST = path.join(REPO, 'electron', 'dist');
const SHARED_CFG = 'tsconfig.shared.json';
const ELEC_CFG = 'electron/tsconfig.json';
/**
 * **同目录资源** —— 由构建**原样拷**进 `electron/dist/`（不进编译）。
 * 清单以 `grep __dirname electron/` 的**实算**为准（README §4.1 D-5）：
 *   · `dola-duration-main.js` —— guest 主世界文本注入脚本（`fs.readFileSync` 后注入，不能 `require`）
 *   · `*-skill-pack.json` —— `dola-media.js` 用 `path.join(__dirname, file)` 读；
 *     ⛔ 漏拷的后果是**静默回落成空 pack**（只 `console.warn`）⇒ 只判存活的冒烟抓不到
 */
const SAME_DIR_ASSETS = [
  'dola-duration-main.js',
  // 30s 诊断脚本（`.toString()` 注入页面的那段）：**不进编译面**（tsconfig exclude）⇒ 必须原样拷
  // ⚠️ 它被编译后的 `main.js` **`require`**（`inject-dola-duration-main` 用它的 `DUMP_EXPR`）⇒
  //    漏拷 = 启动即 `MODULE_NOT_FOUND`（本清单 + REQUIRED 自检就是防这个）
  'dola-duration-dump.js',
  'dola-skill-pack.json',
  'doubao-skill-pack.json',
];
/** 产物里**必须**存在的关键文件（缺 ⇒ 构建链漏了东西） */
const REQUIRED = ['main.js', 'preload.js', 'ipc.js', ...SAME_DIR_ASSETS];

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`build-electron.mjs —— 后端构建链（build:shared → tsc → 拷 guest 脚本）

用法：node .../build-electron.mjs [--dry] [--quiet] [--help]
  --dry    只打印计划不落盘（产物区默认写）
  --quiet  只打印清单与结论
  --help   本帮助
退出码：0 成功 · 2 用法/环境/缺文件`);
  process.exit(0);
}
const dry = args.includes('--dry');
const quiet = args.includes('--quiet');
const log = (...a) => {
  if (!quiet) console.log(...a);
};

fs.mkdirSync(REPO, { recursive: true });
if (!fs.existsSync(path.join(REPO, ELEC_CFG))) {
  console.error(`❌ 缺 ${ELEC_CFG} —— 后端没有执法配置就没法构建`);
  process.exit(2);
}

const steps = [];

// ── ① build:shared ──
if (fs.existsSync(path.join(REPO, SHARED_CFG))) {
  steps.push({ name: 'build:shared', cmd: ['npx', 'tsc', '-p', SHARED_CFG] });
} else {
  log(`⚠️ 跳过 build:shared：${SHARED_CFG} 未落地（其 include 目标是 B1 的产物）—— 落地后本步自动接上`);
  steps.push({ name: 'build:shared', skipped: true, reason: `${SHARED_CFG} 不存在` });
}
// ── ② tsc -p electron/tsconfig.json ──
steps.push({ name: 'tsc(electron)', cmd: ['npx', 'tsc', '-p', ELEC_CFG] });

for (const step of steps) {
  if (step.skipped) continue;
  log(`▶ ${step.name}: ${step.cmd.join(' ')}`);
  if (dry) continue;
  // ⚠️ 单字符串 + shell（不传 args 数组）：传数组配 shell 会触发 Node 的 DEP0190 告警
  const res = spawnSync(step.cmd.join(' '), { cwd: REPO, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.error(`❌ ${step.name} 失败（exit ${res.status}）`);
    process.exit(2);
  }
}

// ── ③ 拷同目录资源（guest 脚本 + skill-pack）──
for (const name of SAME_DIR_ASSETS) {
  const src = path.join(REPO, 'electron', name);
  const dst = path.join(DIST, name);
  log(`▶ 拷同目录资源 ${name} → electron/dist/`);
  if (dry) continue;
  if (!fs.existsSync(src)) {
    console.error(`❌ 缺同目录资源源文件：electron/${name}`);
    process.exit(2);
  }
  fs.mkdirSync(DIST, { recursive: true });
  fs.copyFileSync(src, dst);
}

if (dry) {
  console.log('\n（--dry：未落盘）');
  process.exit(0);
}

// ── 产物清单 + 关键文件自检 ──
if (!fs.existsSync(DIST)) {
  console.error(`❌ 产物目录不存在：${path.relative(REPO, DIST)}`);
  process.exit(2);
}
const list = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs);
    else if (!ent.name.endsWith('.map') && !ent.name.endsWith('.tsbuildinfo')) list.push(path.relative(DIST, abs).split(path.sep).join('/'));
  }
})(DIST);

console.log(`\n════════ 产物清单（electron/dist/，${list.length} 个文件，已滤 .map/.tsbuildinfo）════════`);
for (const f of list) console.log(`  ${f}`);

const missing = REQUIRED.filter((f) => !list.includes(f));
if (missing.length) {
  console.error(`\n❌ 产物缺关键文件：${missing.join(', ')}`);
  process.exit(2);
}
console.log(`\n✅ 构建完成（关键文件齐：${REQUIRED.join(', ')}）`);
