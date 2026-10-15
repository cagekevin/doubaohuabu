#!/usr/bin/env node
/**
 * census-electron.mjs —— 后端迁移的**计数真源**（DoD 第 2 项：计数表直接贴本脚本输出，不许手填）。
 *
 * 口径（README §11.2）：
 *   · **同一个 `electron/tsconfig.json`**（⛔ 不建第二份配置）；测量用 CLI `--checkJs` 覆盖
 *     （S0-3：执法口径 `checkJs: false`，测量归本脚本）⇒ 「镜像/差一个键」的漂移没有位置可写。
 *   · 两类运行：**执法**（`checkJs` 按 tsconfig，必须 0 错）与**测量**（`--checkJs`，出基线）。
 *   · 基线 `census-baseline.json` 只存**计数**（总数 / 按码 / 按文件），不存报错原文 ⇒ 小、稳、可 diff。
 *   · `--update-baseline` 带**不许涨**守卫（本仓「闸成本守恒」的同一judgment：基线只能降）。
 *
 * 另附**显式类型纪律计数**（粗计，正则级）：`any` / `as` / 非空断言 `!` / `@ts-ignore`。
 * ⚠️ 它们是**文本粗计**（不区分是否在字符串/注释里），只用于「每批只降不升」的走向观察；
 *    权威判据是 lint 的 type-aware 层（S0-4），不是这几个数字。
 *
 * 用法：
 *   node docs/plan/后端TS迁移/scripts/census-electron.mjs [--json] [--check] [--update-baseline] [--changed] [--help]
 * 退出码：0 通过 · 1 检查失败（执法有错 / 基线涨了）· 2 用法或环境错。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const ELEC = path.join(REPO, 'electron');
const TSCONFIG = 'electron/tsconfig.json';
const BASELINE = path.join(HERE, '..', 'census-baseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist']);

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`census-electron.mjs —— 后端计数真源

用法：
  node .../census-electron.mjs [--json] [--check] [--update-baseline] [--changed] [--help]

选项：
  --json             机器可读（含按文件明细）
  --check            与基线比：只许降、不许涨（涨 ⇒ exit 1）
  --update-baseline  写基线（**涨了就拒写**，exit 1）
  --changed          只报 git 工作树里改过的文件（git 不可用时退化为全量并打印提示）
  --help             本帮助

口径：electron/tsconfig.json（唯一配置）＋ CLI --checkJs 测量；执法档 checkJs=false 必须 0 错。`);
  process.exit(0);
}
const wantJson = args.includes('--json');
const wantCheck = args.includes('--check');
const wantUpdate = args.includes('--update-baseline');
const onlyChanged = args.includes('--changed');

/** 跑一次 tsc，返回 { errors:[{file,line,col,code,message}], exitCode, stdout } */
function runTsc(extraArgs) {
  // ⚠️ 单字符串 + shell（不传 args 数组）：传数组配 shell 会触发 Node 的 DEP0190 告警
  const res = spawnSync(['npx', 'tsc', '-p', TSCONFIG, '--noEmit', '--pretty', 'false', ...extraArgs].join(' '), {
    cwd: REPO,
    encoding: 'utf-8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (/Unknown compiler option|error TS5023|error TS5052/.test(out)) {
    console.error(`❌ tsc 配置被拒（疑似 CLI 覆盖不成立）：\n${out.split('\n').slice(0, 6).join('\n')}`);
    process.exit(2);
  }
  if (/error TS18003/.test(out)) {
    console.error('❌ 没有输入文件（include 全被 exclude）—— 配置问题，先修 tsconfig');
    process.exit(2);
  }
  const errors = [];
  for (const line of out.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim());
    if (!m) continue;
    errors.push({
      file: m[1].split(path.sep).join('/').replace(/^\.\//, ''),
      line: Number(m[2]),
      col: Number(m[3]),
      code: m[4],
      message: m[5],
    });
  }
  return { errors, exitCode: res.status ?? -1, out };
}

/** 文本粗计：显式 any / as / 非空断言 / ts-ignore */
function disciplineCounts() {
  const acc = { any: 0, as: 0, nonNull: 0, tsIgnore: 0 };
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
        walk(path.join(dir, ent.name));
        continue;
      }
      if (!/\.(js|ts)$/.test(ent.name)) continue;
      const code = fs.readFileSync(path.join(dir, ent.name), 'utf-8');
      acc.any += (code.match(/:\s*any\b|<any>|as any\b|\bany\[\]/g) ?? []).length;
      acc.as += (code.match(/\bas\s+(const|unknown|string|number|boolean|Record|[A-Z])/g) ?? []).length;
      acc.nonNull += (code.match(/[\w)\]]\s*!\s*[.[(;]/g) ?? []).length;
      acc.tsIgnore += (code.match(/@ts-ignore|@ts-expect-error|@ts-nocheck/g) ?? []).length;
    }
  };
  walk(ELEC);
  return acc;
}

/** git 工作树改过的文件（拿不到就返回 null ⇒ 退化全量并打印） */
function changedFiles() {
  const res = spawnSync('git status --porcelain -- electron', { cwd: REPO, encoding: 'utf-8', shell: true });
  if (res.status !== 0) return null;
  const names = res.stdout
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter((l) => l.startsWith('electron/') && /\.(js|ts)$/.test(l));
  return new Set(names);
}

// ── 执法档（checkJs 按 tsconfig）──
const enforce = runTsc([]);
// ── 测量档（--checkJs）──
const measured = runTsc(['--checkJs']);

const byCode = {};
const byFile = {};
for (const e of measured.errors) {
  byCode[e.code] = (byCode[e.code] ?? 0) + 1;
  byFile[e.file] = (byFile[e.file] ?? 0) + 1;
}
const sortedByCode = Object.fromEntries(Object.entries(byCode).sort((a, b) => Number(a[0].slice(2)) - Number(b[0].slice(2))));
const sortedByFile = Object.fromEntries(Object.entries(byFile).sort((a, b) => a[0].localeCompare(b[0])));

let changed = null;
if (onlyChanged) {
  changed = changedFiles();
  if (changed === null) console.error('⚠️ git 不可用 ⇒ --changed 退化为全量');
}

const report = {
  tsconfig: TSCONFIG,
  enforce: { errors: enforce.errors.length, exitCode: enforce.exitCode },
  measured: {
    checkJs: true,
    errors: measured.errors.length,
    byCode: sortedByCode,
    byFile: sortedByFile,
  },
  discipline: disciplineCounts(),
};

// ── 基线比较 / 写入 ──
let baseline = null;
if (fs.existsSync(BASELINE)) baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf-8'));

if (wantUpdate) {
  if (baseline && report.measured.errors > baseline.measured.errors) {
    console.error(`❌ 基线只许降不许涨：现值 ${report.measured.errors} > 基线 ${baseline.measured.errors} ⇒ 拒绝写入`);
    process.exit(1);
  }
  const payload = { $comment: 'census 基线（只存计数；由 census-electron.mjs --update-baseline 生成，禁手改）', ...report };
  fs.writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  console.log(`✅ 基线已写入 ${path.relative(REPO, BASELINE)}（测量档 ${report.measured.errors} 错）`);
  process.exit(0);
}

let checkFailed = false;
if (wantCheck) {
  if (!baseline) {
    console.error('❌ 没有基线可比 —— 先跑 --update-baseline');
    checkFailed = true;
  } else if (report.measured.errors > baseline.measured.errors) {
    console.error(`❌ 测量档错误数上涨：${baseline.measured.errors} → ${report.measured.errors}`);
    checkFailed = true;
  }
}

if (wantJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`════════ census（配置 ${TSCONFIG}）════════`);
  console.log(
    `执法档（checkJs 按配置）：${report.enforce.errors} 错${report.enforce.errors === 0 ? ' ✅' : ' ❌'}   ·   测量档（--checkJs）：${report.measured.errors} 错`,
  );
  if (baseline) console.log(`基线：${baseline.measured.errors} 错（${wantCheck ? '已比' : '未比'}）`);
  console.log(`\n按码簇（测量档）：`);
  for (const [code, n] of Object.entries(sortedByCode)) console.log(`  ${code} × ${n}`);
  console.log(`\n按文件（测量档，只列非 0）：`);
  const rows = Object.entries(sortedByFile).filter(([f]) => changed === null || changed.has(f));
  for (const [file, n] of rows) console.log(`  ${n.toString().padStart(5)}  ${file}`);
  if (changed !== null) console.log(`\n（--changed：以上只含 git 工作树改过的 ${rows.length} 个文件）`);
  console.log(`\n类型纪律（文本粗计 —— 权威判据是 lint 的 type-aware 层）：`);
  console.log(
    `  any ${report.discipline.any} · as ${report.discipline.as} · 非空断言 ! ${report.discipline.nonNull} · ts-ignore ${report.discipline.tsIgnore}`,
  );
  console.log();
  console.log('⚠️ 计数是「测量档」口径：未转的 .js 走 allowJs passthrough ⇒ 不进类型检查；');
  console.log('   随文件转成 .ts 自动进入，红字即工单。执法档必须恒为 0。');
}

if (report.enforce.errors > 0) {
  console.error(`\n❌ 执法档有 ${report.enforce.errors} 错 ⇒ 不得进入下一批`);
  process.exit(1);
}
process.exit(checkFailed ? 1 : 0);
