#!/usr/bin/env node
/**
 * smoke-electron.mjs —— 后端**最低限度**运行时冒烟（README §11.2 定死的范围）。
 *
 * 判三件（多一件都不判）：
 *   ① **进程存活 N 秒**（被超时杀掉 = 存活过 ⇒ 通过）；
 *   ② **stderr 无致命错**（`Cannot find module` / `require is not defined` /
 *      `[main] 找不到 …index.html`（D-4 白屏）/ `[dola-media] 读取 …失败`（D-5 skill-pack 漏拷）/
 *      主进程 JS 异常弹窗）；
 *   ③ **主进程 READY 标记**：`main.js` 在 `app.whenReady()` 里往 `~/dola-duration-debug.log`
 *      追加 `APP-START pid=<本进程>`（该文件是**既有**行为，不是本脚本为验收新增的）
 *      ⇒ 用**本次 spawn 的 pid** 匹配 ⇒ 能区分"真的起来了"与"上次留下的行"。
 *
 * ⛔ 刻意**不做**：断言框架 · 判"窗口就绪" · 判 UI（那是 W15 端到端的事，脆且是另一个层次）。
 *
 * 用法：
 *   node scripts/smoke-electron.mjs [--timeout 12] [--json] [--help]
 * 前置：`npm run build:electron`（产物 electron/dist/ 存在）＋ `package.json` 的 main 指向产物
 * 退出码：0 通过 · 1 冒烟失败 · 2 用法或环境错。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const REQUIRE = createRequire(import.meta.url);
const READY_LOG = path.join(os.homedir(), 'dola-duration-debug.log');
const EXPECTED_MAIN = 'electron/dist/main.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`smoke-electron.mjs —— 后端最低限度冒烟（起产物·判存活·判 stderr·判 READY 标记）

用法：node .../smoke-electron.mjs [--timeout 12] [--json] [--help]
  --timeout <秒>  等多久算"存活过"（默认 12）
  --json          机器可读
  --help          本帮助

判据：① 进程存活 N 秒 ② stderr 无致命错 ③ ~/dola-duration-debug.log 里出现**本次 pid** 的 APP-START
前置：npm run build:electron`);
  process.exit(0);
}
const tIdx = args.indexOf('--timeout');
const TIMEOUT_S = tIdx >= 0 ? Number(args[tIdx + 1]) : 12;
const wantJson = args.includes('--json');
if (!Number.isFinite(TIMEOUT_S) || TIMEOUT_S <= 0) {
  console.error('❌ --timeout 需要正数秒');
  process.exit(2);
}

const FATAL = [
  { re: /Cannot find module/i, why: '缺模块（产物没拷全 / 依赖没装 —— D-2/D-5）' },
  { re: /require is not defined/i, why: '产物被判成 ESM（D-1：产物必须住 electron/ 下）' },
  { re: /\[main\] 找不到 .*index\.html/i, why: '渲染层入口没解析到（D-4）' },
  { re: /\[dola-media\] 读取 .*失败/i, why: 'skill-pack 没拷进产物 ⇒ 静默回落成空 pack（D-5）' },
  { re: /A JavaScript error occurred in the main process/i, why: '主进程启动期抛错' },
];

const findings = [];
const info = {};

// ── 前置：产物存在 + 入口指向产物 ──
const pkgPath = path.join(REPO, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
info.main = pkg.main;
if (pkg.main !== EXPECTED_MAIN) {
  findings.push(`package.json 的 main 是 "${pkg.main}"，期望 "${EXPECTED_MAIN}"（D-4：入口必须指向产物）`);
}
const productMain = path.join(REPO, EXPECTED_MAIN);
if (!fs.existsSync(productMain)) {
  console.error(`❌ 产物不存在：${EXPECTED_MAIN} —— 先跑 \`npm run build:electron\``);
  process.exit(2);
}
const distHtml = path.join(REPO, 'dist', 'index.html');
info.distHtmlExists = fs.existsSync(distHtml);
if (!info.distHtmlExists) {
  findings.push('渲染层产物 dist/index.html 不存在（先跑 `npx vite build`，否则必然走到 D-4 的"找不到"分支）');
}

// ── spawn 产物（用 electron 包给出的可执行路径 ⇒ 拿到的是**主进程** pid，不是 npx 的）──
let electronBin;
try {
  electronBin = REQUIRE('electron');
} catch (err) {
  console.error(`❌ 取不到 electron 可执行路径：${err && err.message}`);
  process.exit(2);
}

const logBefore = fs.existsSync(READY_LOG) ? fs.readFileSync(READY_LOG, 'utf-8') : '';
const res = spawnSync(electronBin, ['.'], {
  cwd: REPO,
  encoding: 'utf-8',
  timeout: TIMEOUT_S * 1000,
  maxBuffer: 32 * 1024 * 1024,
});
const out = `${res.stdout ?? ''}`;
const errOut = `${res.stderr ?? ''}`;
info.pid = res.pid;
info.aliveUntilTimeout = res.signal !== null || res.error?.code === 'ETIMEDOUT';
info.exitCode = res.status;
info.signal = res.signal;

// ① 存活
if (!info.aliveUntilTimeout) {
  findings.push(`进程没活到 ${TIMEOUT_S}s（exit=${res.status} signal=${res.signal}）⇒ 启动期就退了`);
}
// ② stderr 致命错（stdout 也扫 —— Electron 的启动错有时走 stdout）
for (const { re, why } of FATAL) {
  const hit = re.exec(errOut) ?? re.exec(out);
  if (hit) findings.push(`stderr/stdout 命中致命标记「${hit[0].trim()}」：${why}`);
}
// ③ READY 标记（本进程 pid）
const logAfter = fs.existsSync(READY_LOG) ? fs.readFileSync(READY_LOG, 'utf-8') : '';
const readyLine = logAfter
  .split('\n')
  .reverse()
  .find((l) => l.includes('APP-START') && l.includes(`pid=${res.pid}`));
info.ready = Boolean(readyLine);
if (!info.ready) {
  findings.push(
    `没在 ${READY_LOG} 里找到本次 pid(${res.pid}) 的 APP-START ⇒ 主进程没走到 app.whenReady()` +
      (logBefore === logAfter ? '（该文件本次没变化）' : '（文件有变化但不是本次 pid：可能是别的实例）'),
  );
}

if (wantJson) {
  console.log(JSON.stringify({ timeoutSec: TIMEOUT_S, info, findings, stdout: out.slice(-4000), stderr: errOut.slice(-4000) }, null, 2));
} else {
  console.log(`════════ 后端冒烟（产物 ${EXPECTED_MAIN} · 超时 ${TIMEOUT_S}s）════════`);
  console.log(`  ① 存活        ：${info.aliveUntilTimeout ? `是（活到超时被杀，signal=${info.signal}）` : `否（exit=${info.exitCode}）`}`);
  console.log(`  ② stderr 致命错：${findings.some((f) => f.includes('致命标记')) ? '有' : '无'}`);
  console.log(`  ③ READY 标记  ：${info.ready ? `有（pid=${info.pid} 的 APP-START）` : '无'}`);
  if (out.trim()) console.log(`\n──── stdout（尾 2000 字符）────\n${out.slice(-2000)}`);
  if (errOut.trim()) console.log(`\n──── stderr（尾 2000 字符）────\n${errOut.slice(-2000)}`);
  if (findings.length) {
    console.error(`\n❌ 冒烟未过（${findings.length} 条）：`);
    for (const f of findings) console.error(`  · ${f}`);
  } else {
    console.log('\n✅ 通过（存活 ＋ 无致命错 ＋ READY 标记）');
  }
}

process.exit(findings.length ? 1 : 0);
