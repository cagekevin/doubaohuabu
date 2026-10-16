#!/usr/bin/env node
/**
 * test-affected.mjs —— **测试射程计算器**（按改动反查该跑哪几个测试文件）
 *
 * 【判据】全量是**验收**动作、不是**定位**工具。定位用最小射程；射程靠手列必漏。
 *   本脚本把「改动了哪些文件 → 该跑哪几个测试」变成一条命令，**不猜**。
 *
 * 【三条反查规则】（每条都**打印命中理由**，不黑箱）
 *   ① self   —— 变更文件本身就是测试 ⇒ 直接跑它
 *   ② stem   —— `X/foo.ts` ⇒ `X/tests/foo.test.ts`（同目录 tests 下**同名/前缀同名**）
 *   ③ import —— 某测试文件 import 了该模块（含 import 了整个目录）⇒ 跨目录共享改动也捞得到
 *
 * 【如实边界】（打印，不静默）
 *   - 命中 0 个 ≠ 安全：可能这条路**没有测试覆盖**（`ui/**` · `adapters/**` 按测试边界不写单测，
 *     它们靠 `scripts/verify-*.cjs` 端到端冒烟验）⇒ 本脚本会点名并提示改用哪条路。
 *   - 它**不下判断**、不判等价，只算射程；`npm run check` 仍是交付前的**全量**门禁（DoD 不变）。
 *
 * 用法：
 *   node scripts/test-affected.mjs                 # 算射程 → 打印 → 跑（退出码原样透传 vitest）
 *   node scripts/test-affected.mjs --dry           # 只算 + 打印，不跑
 *   node scripts/test-affected.mjs --json          # 机器读（不跑）
 *   node scripts/test-affected.mjs --files a.ts,b.ts   # 手工指定改动（不改工作树也能算射程）
 *   node scripts/test-affected.mjs --help
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOTS = ['src/', 'electron/'];
const TEST_RE = /\/tests\/.*\.test\.tsx?$/;
const CODE_RE = /\.tsx?$/;
const EXT_RE = /\.tsx?$/;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
  process.exit(0);
}
const dry = argv.includes('--dry');
const asJson = argv.includes('--json');
const filesIdx = argv.indexOf('--files');
const filesArg = filesIdx >= 0 ? argv[filesIdx + 1] : null;
if (filesIdx >= 0 && !filesArg) fail(2, '--files 需要参数（逗号分隔的相对路径）');

function fail(code, msg) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function git(args) {
  // `core.quotepath=false`：否则非 ASCII 路径被 git 输出成八进制转义（`"docs/\345\220…"`），读不了
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

const norm = (p) => p.replace(/\\/g, '/');

/* ── ① 变更文件 ───────────────────────────────────────────────── */
let changed;
if (filesArg) {
  changed = filesArg.split(',').map((s) => norm(s.trim())).filter(Boolean);
} else {
  let tracked = [];
  try {
    tracked = git(['diff', '--name-only', 'HEAD']);
  } catch {
    fail(2, '不在 git 仓库里（或 HEAD 不存在）—— 用 `--files` 手工指定');
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  changed = [...new Set([...tracked, ...untracked])].map(norm);
}

const codeChanged = changed.filter((f) => SRC_ROOTS.some((r) => f.startsWith(r)) && CODE_RE.test(f));
const testChanged = codeChanged.filter((f) => TEST_RE.test(f));
const srcChanged = codeChanged.filter((f) => !TEST_RE.test(f));
const docsChanged = changed.filter((f) => !codeChanged.includes(f));

/* ── ② 测试索引 ───────────────────────────────────────────────── */
const allTests = git(['ls-files']).map(norm).filter((f) => SRC_ROOTS.some((r) => f.startsWith(r)) && TEST_RE.test(f));

const testBody = new Map();
for (const t of allTests) {
  try {
    testBody.set(t, readFileSync(resolve(REPO, t), 'utf8'));
  } catch {
    testBody.set(t, '');
  }
}

/** 抽出测试文件里所有 import 说明符，解析成仓内相对路径（去扩展名） */
function specifiersOf(testFile) {
  const body = testBody.get(testFile) ?? '';
  const out = [];
  for (const m of body.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) {
      if (spec.startsWith('@/')) out.push(norm(spec.slice(2)));
      continue;
    }
    const resolved = norm(resolve(REPO, dirname(testFile), spec));
    const rel = norm(relative(REPO, resolved));
    out.push(rel.replace(EXT_RE, ''));
  }
  return out;
}
const specs = new Map(allTests.map((t) => [t, specifiersOf(t)]));

/* ── ③ 反查 ──────────────────────────────────────────────────── */
const matched = new Map(); // testFile → { reason, because }
const covered = new Set(); // 被任一测试覆盖到的源码文件
const add = (test, reason, because, src) => {
  const cur = matched.get(test);
  if (cur) {
    if (!cur.because.includes(because)) cur.because.push(because);
  } else {
    matched.set(test, { reason, because: [because] });
  }
  if (src) covered.add(src);
};

for (const t of testChanged) add(t, 'self', '变更文件本身');

for (const src of srcChanged) {
  const dir = dirname(src);
  const stem = src.split('/').pop().replace(EXT_RE, '');
  const bare = src.replace(EXT_RE, '');
  // ② 同目录 tests 下同名 / 前缀同名
  for (const t of allTests) {
    if (dirname(t) !== `${dir}/tests`) continue;
    const tStem = t.split('/').pop().replace(EXT_RE, '').replace(/\.test$/, '');
    if (tStem === stem || tStem.startsWith(`${stem}.`)) add(t, 'stem', `${src}（同名）`, src);
  }
  // ③ 有测试 import 了它（或它所在的目录）
  for (const t of allTests) {
    if (matched.get(t)?.reason === 'self') continue;
    for (const spec of specs.get(t) ?? []) {
      if (spec === bare) add(t, 'import', `${src}（被 import）`, src);
      else if (`${bare}/`.startsWith(`${spec}/`)) add(t, 'import', `${bare}/（目录被 import）`, src);
    }
  }
}

const unmatched = srcChanged.filter((src) => !covered.has(src));
const hitTests = [...matched.keys()].sort();

/* ── ④ 输出 ──────────────────────────────────────────────────── */
if (asJson) {
  console.log(
    JSON.stringify(
      {
        changed: { code: codeChanged, source: srcChanged, test: testChanged, other: docsChanged },
        matched: hitTests.map((t) => ({ test: t, ...matched.get(t) })),
        unmatchedSource: unmatched,
        totalTests: allTests.length,
        command: hitTests.length ? ['npx', 'vitest', 'run', ...hitTests] : [],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`【改动】源码 ${srcChanged.length} · 测试 ${testChanged.length} · 非代码面 ${docsChanged.length}`);
for (const f of changed) console.log(`   · ${f}`);

if (!codeChanged.length) {
  console.log('\n【射程】代码面无改动 ⇒ 无测试射程。');
  if (docsChanged.length) console.log('   非代码面改动（文档/配置）：交付前跑 `npm run check` 即可。');
  process.exit(0);
}

console.log(`\n【射程】命中 ${hitTests.length} / ${allTests.length} 个测试文件`);
if (!hitTests.length) console.log('   （无命中）');
for (const t of hitTests) {
  const { reason, because } = matched.get(t);
  console.log(`   · ${reason.padEnd(6)} ${t}  ← ${because.join(' · ')}`);
}

if (unmatched.length) {
  console.log('\n【⚠️ 未命中任何测试的源码文件】（**不等于安全**）');
  for (const f of unmatched) {
    const uiLike = f.startsWith('src/ui/') || f.startsWith('src/adapters/');
    console.log(
      `   · ${f}${uiLike ? ' —— 按测试边界（`ui`/`adapters` 不写单测）⇒ 改用 `scripts/verify-*.cjs` 端到端冒烟验' : ' —— 这条路可能无测试覆盖 ⇒ 按 L2/L3 决定跑全量或人工指定射程'}`,
    );
  }
}

if (!hitTests.length) {
  console.log('\n【结论】无可自动定位的射程。**不要据此认为验过了** —— 按 `测试门禁5步法` 定级：L2/L3 跑全量，或人工指定。');
  process.exit(0);
}

const VITEST_BIN = resolve(REPO, 'node_modules/vitest/vitest.mjs');
const canRunDirect = existsSync(VITEST_BIN);
const cmd = canRunDirect
  ? [process.execPath, VITEST_BIN, 'run', ...hitTests]
  : ['npx', 'vitest', 'run', ...hitTests];

console.log(`\n【跑】node_modules/vitest/vitest.mjs run ${hitTests.length} 个文件`);
if (dry) {
  console.log('（--dry：未执行；以下是可直接粘贴的命令）');
  console.log(hitTests.map((t) => `npx vitest run ${t}`).join('\n'));
  process.exit(0);
}

try {
  execFileSync(cmd[0], cmd.slice(1), { cwd: REPO, stdio: 'inherit' });
} catch (e) {
  const code = typeof e.status === 'number' ? e.status : 1;
  console.error(`\n✗ 射程内测试失败（退出码 ${code}）—— 按 \`测试门禁5步法\` State 4 归因：源码错 ⇒ 改逻辑；断言过时 ⇒ 同步补测，⛔ 不静默删测试。`);
  process.exit(code);
}
console.log(`\n✅ 射程内 ${hitTests.length} 个测试文件全绿。⚠️ 这不是交付门禁 —— 交付前仍跑 \`npm run check\`（全量）。`);
