#!/usr/bin/env node
/**
 * probe.mjs —— **先红后绿**探针（7 步法 §7.1 的强制工具）
 *
 * 守什么：**「红的不是那点」与「忘还原 = 假账」** 这两类假凭证（红线：一凭证闸）。
 * 什么时候该改它：当注入/还原语义变化时（如要支持多文件注入）。
 * 怎么改：保持「注入点唯一 + sha256 自校验 + journal 兜底」三件，缺一即失效。
 *
 * 强制三件事：
 *   ① **注入点唯一** —— `--find` 命中 0 处或多处 ⇒ 拒绝（防"红的不是那点"）
 *   ② **还原 sha256 自校验** —— 还原后逐文件核对哈希（防忘还原 = 假账）
 *   ③ **journal 兜底** —— 注入前把原文写进 `.probe/<ts>/`，被打断也能自愈还原
 *
 * 用法：
 *   # ① 先拿真实断言串（在**未改**的代码上跑，看退出码与输出）
 *   node scripts/probe.mjs --run "node scripts/check-invariants.cjs" --suggest-out
 *
 *   # ② 看注入 diff（不写盘）
 *   node scripts/probe.mjs --file <相对路径> --find "<旧>" --replace "<新>" --dry
 *
 *   # ③ 正式探针（先红后绿）
 *   node scripts/probe.mjs --label "TD-xx 验证" \
 *     --file <相对路径> --find "<旧>" --replace "<新>" \
 *     --run "<命令>" --expect-exit 1 --expect-out "<精确关键词>" --verify-green
 *
 * 退出码：0 = 探针成立（先红且还原后绿）；1 = 探针不成立；2 = 用法/环境错误
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_DIR = path.join(ROOT, '.probe');

// ── 参数解析 ──
const argv = process.argv.slice(2);
const opt = (name, def = undefined) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : def;
};
const flag = (name) => argv.includes(`--${name}`);

const label = opt('label', 'probe');
const runCmd = opt('run');
const suggestOut = flag('suggest-out');
const dry = flag('dry');
const expectExit = Number(opt('expect-exit', 1));
const expectOut = opt('expect-out', '');
const verifyGreen = flag('verify-green');
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--file') files.push(argv[i + 1]);
}
const findStr = opt('find');
const replaceStr = opt('replace');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

function run(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// ── 模式 A：拿真实断言串 ──
if (suggestOut) {
  if (!runCmd) {
    console.error('❌ --suggest-out 需要 --run "<命令>"');
    process.exit(2);
  }
  const r = run(runCmd);
  console.log(`── 当前（未注入）执行：${runCmd}`);
  console.log(`   退出码：${r.code}`);
  console.log(`   输出末尾 30 行：`);
  console.log(r.out.split('\n').slice(-30).map((l) => '   | ' + l).join('\n'));
  console.log('\n👉 请从上文挑一段**稳定且唯一**的文本作为 --expect-out（别挑行号/时间戳）');
  process.exit(0);
}

// ── 模式 B：看 diff（不写盘）──
if (dry) {
  if (!files.length || typeof findStr !== 'string' || typeof replaceStr !== 'string') {
    console.error('❌ --dry 需要 --file（可多次）+ --find + --replace');
    process.exit(2);
  }
  for (const f of files) {
    const p = path.join(ROOT, f);
    const src = fs.readFileSync(p, 'utf8');
    const n = src.split(findStr).length - 1;
    console.log(`── ${f}  命中 ${n} 处`);
    console.log(`   - ${findStr.slice(0, 120)}`);
    console.log(`   + ${replaceStr.slice(0, 120)}`);
  }
  process.exit(0);
}

// ── 模式 C：正式探针（先红后绿）──
if (!files.length || typeof findStr !== 'string' || typeof replaceStr !== 'string' || !runCmd) {
  console.error('❌ 需要 --file（可多次）+ --find + --replace + --run');
  process.exit(2);
}

// ① 注入点唯一性检查
const originals = new Map();
for (const f of files) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) {
    console.error(`❌ 文件不存在：${f}`);
    process.exit(2);
  }
  const src = fs.readFileSync(p, 'utf8');
  const n = src.split(findStr).length - 1;
  if (n !== 1) {
    console.error(`❌ 注入点不唯一：${f} 命中 ${n} 处（要求恰好 1 处）`);
    console.error(`   注入语义：${findStr.slice(0, 120)}`);
    process.exit(2);
  }
  originals.set(f, src);
}

// ③ journal：注入前落盘原文（被打断也能自愈）
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const journal = path.join(PROBE_DIR, stamp);
fs.mkdirSync(journal, { recursive: true });
const manifest = { label, runCmd, expectExit, expectOut, files: [] };
for (const [f, src] of originals) {
  const p = path.join(ROOT, f);
  fs.writeFileSync(path.join(journal, path.basename(f) + '.orig'), src, 'utf8');
  manifest.files.push({ file: f, sha256: sha(fs.readFileSync(p)) });
}
fs.writeFileSync(path.join(journal, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`🧪 probe ｜ ${label}`);
console.log(`   journal: ${path.relative(ROOT, journal)}`);

/** 还原 + ② sha256 自校验 */
function restore() {
  for (const [f, src] of originals) {
    fs.writeFileSync(path.join(ROOT, f), src, 'utf8');
  }
  let ok = true;
  for (const { file, sha256 } of manifest.files) {
    const now = sha(fs.readFileSync(path.join(ROOT, file)));
    if (now !== sha256) {
      console.error(`   ❌ 还原校验失败：${file}（期望 ${sha256}，实际 ${now}）`);
      ok = false;
    }
  }
  if (!ok) {
    console.error(`   ⚠️ 还原不完整 —— 可从 journal 手工恢复：${path.relative(ROOT, journal)}`);
    process.exit(2);
  }
  console.log(`   ✅ 还原校验通过（${manifest.files.length} 个文件 sha256 一致）`);
}

let exitCode = 0;
try {
  // 注入
  for (const [f, src] of originals) {
    fs.writeFileSync(path.join(ROOT, f), src.replace(findStr, replaceStr), 'utf8');
  }
  console.log(`   注入：${findStr.slice(0, 80)} → ${replaceStr.slice(0, 80)}`);

  // 先红
  const red = run(runCmd);
  const outHit = expectOut ? red.out.includes(expectOut) : true;
  const redOk = red.code === expectExit && outHit;
  console.log(`   先红：退出码 ${red.code}（期望 ${expectExit}）· expect-out ${outHit ? '命中' : '未命中'}`);
  if (!redOk) {
    console.log('   ⛔ 先红未成立 —— 断言没测到那一点（不许跳过，回去重写断言）');
    console.log('   输出末尾 20 行：');
    console.log(red.out.split('\n').slice(-20).map((l) => '   | ' + l).join('\n'));
    exitCode = 1;
  }
} finally {
  restore();
}

// 还原后绿
if (exitCode === 0 && verifyGreen) {
  const green = run(runCmd);
  console.log(`   后绿：退出码 ${green.code}（期望 0）`);
  if (green.code !== 0) {
    console.log('   ⛔ 还原后未恢复绿 —— 说明代码本身有问题（不是探针问题）');
    exitCode = 1;
  }
}

console.log(exitCode === 0 ? '   ✅ 探针成立（先红后绿）' : '   ❌ 探针不成立');
process.exit(exitCode);
