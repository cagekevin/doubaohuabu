#!/usr/bin/env node
/**
 * 门禁统一运行器 —— 清单真源 = `scripts/gates.manifest.json`。
 *
 * 【为什么要有它】把「哪些闸 / 按什么顺序 / 失败怎么办」从 `package.json` 的 `&&` 长串里抽出来，
 *   让**清单成为唯一真源**：新增闸只改 manifest（+ 在 check-gate-vitals 的 GATES 表登记扫描根），
 *   不再手写进 npm script。元层闸 `check-gate-vitals.mjs` 与它读**同一份** manifest。
 *
 * 【分组（manifest::phases）】
 *   check  → 所有代码闸（npm run check 用；fail-fast，首个失败即停）
 *   health → 全量巡检 = 所有闸 + healthOnly（当前 healthOnly 为空）
 *
 * 用法：
 *   node scripts/gates-run.mjs check | health            # 跑闸
 *   node scripts/gates-run.mjs list | status             # 看清单 / 看开关注态
 *   node scripts/gates-run.mjs off <id...> | on <id...>  # 开/关某道闸（持久化到 manifest.disabled）
 * 退出码：任一闸失败 → 非 0（fail-fast）；全关 → 非 0（拒绝"0 道却绿灯"）。
 *
 * ★闸的申诉口
 *   Q1 守什么：**结构偏好闸** —— 它守的是「闸清单与执行一致」，不是代码本身。
 *   Q2 何时该改：新增/删除闸时改 manifest（本文件只做派生，不含任何闸名硬编码）。
 *   Q3 怎么改：保持「清单即真源」；**禁止**把闸名硬编码回本文件或 npm script。
 *
 * 【闸的开/关开关】（★ 2026-10-11 加）——「所有的闸，想开就开，想关就关」
 *   两种粒度，都**不改闸的登记**（闸仍在 `gates` 里，只是被跳过 ⇒ 不会变成孤儿闸）：
 *     · **持久开关**（推荐）：`npm run gate:off -- dead-code` / `npm run gate:on -- dead-code`
 *         —— 写进 `gates.manifest.json` 的 `disabled` 数组；`npm run gate:status` 看当前状态。
 *     · **临时覆盖**（一次性）：`GATES_SKIP=dead-code npm run check`（不改文件）。
 *   为什么要有它：某道闸（如 knip）在"功能写完、尚未接线"的过渡态会必然报红（见
 *     check-dead-code.mjs 头【★时机】），此时需要一个**显式**的放行口 —— 而不是去删 manifest 项
 *     （删项会让脚本变孤儿闸，反被元层闸拦下）。
 *   设计取舍（守「闸的成本守恒」）：
 *     ① 闸**仍登记**（不是删）—— 关掉后 `status` 里仍看得见它、元层闸也不会报孤儿；
 *     ② 关闭状态**持久可见** —— manifest 里存着 + 每次跑闸都打印醒目告警（不许静默放行）；
 *     ③ **全关即失败**（selected 为空 ⇒ 退出 1）—— 否则会退化成"一键全绿"的绕行道，
 *        正是本闸体系要防的东西。⇒ 开关只该用于"临时在途"，**不是**常态化通过手段。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'scripts', 'gates.manifest.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch (e) {
  console.error(`❌ 闸清单读取失败（${MANIFEST}）：${e.message}`);
  process.exit(1);
}

const PHASES = manifest.phases || [];
const GATE_PHASES = PHASES.filter((p) => p !== 'health'); // 普通闸可归属的 phase
const sub = process.argv[2] || '';
const args = process.argv.slice(3);

// ── 自检（fail-loud）：manifest 自身也需护栏 ──
function selfCheck() {
  const problems = [];
  for (const req of ['check', 'health']) {
    if (!PHASES.includes(req)) problems.push(`phases 缺少必需分组: ${req}`);
  }
  const ids = new Set();
  for (const g of manifest.gates || []) {
    if (!g.id) problems.push('某闸缺少 id');
    if (ids.has(g.id)) problems.push(`闸 id 重复: ${g.id}`);
    ids.add(g.id);
    if (!g.cmd) problems.push(`闸 ${g.id} 缺少 cmd`);
    if (!GATE_PHASES.includes(g.phase)) {
      problems.push(`闸 ${g.id} 的 phase 非法（须为 ${GATE_PHASES.join('/')} 之一）`);
    }
  }
  for (const h of manifest.healthOnly || []) {
    if (!h.id || !h.cmd) problems.push(`healthOnly 闸 ${h.id || '?'} 缺少 id/cmd`);
  }
  if (problems.length) {
    console.error('❌ 闸清单自检失败：\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}
selfCheck();

const ALL = [...(manifest.gates || []), ...(manifest.healthOnly || [])];
const allIds = ALL.map((g) => g.id);
const known = new Set(allIds);
if (ALL.length === 0) {
  console.error('❌ 闸清单为空：gates.manifest.json 未定义任何闸（勿当通过）');
  process.exit(1);
}

/** 当前被关掉的闸 id（持久化在 `manifest.disabled`） */
const disabledList = Array.isArray(manifest.disabled) ? manifest.disabled : [];
const disabled = new Set(disabledList);
// 防呆：`disabled` 里出现已不存在的闸 id ⇒ 提示（可能是闸退役了忘了清）
const ghostDisabled = disabledList.filter((id) => !known.has(id));

// ───────────────────────── 开/关 子命令（off / on / status）─────────────────────────

function printStatus() {
  console.log('🔌 闸开关注态（真源 scripts/gates.manifest.json 的 `disabled`）：\n');
  for (const g of ALL) {
    const off = disabled.has(g.id);
    console.log(`   ${off ? '⭕ 关' : '🟢 开'}  ${g.id.padEnd(14)} ${g.desc}`);
  }
  const on = allIds.filter((id) => !disabled.has(id)).length;
  console.log(`\n   ${on} 开 / ${disabled.size} 关`);
  if (ghostDisabled.length) {
    console.log(`   ⚠️  disabled 里有已不存在的闸 id：${ghostDisabled.join(', ')}（建议 \`npm run gate:on -- <id>\` 清掉）`);
  }
  console.log('\n   用法：npm run gate:off -- <id> ｜ npm run gate:on -- <id> ｜ npm run gate:status');
}

if (sub === 'status' || sub === 'list') {
  if (sub === 'list') {
    // 保留原 `list` 的清单视图，但附上开关注态
    console.log('分区闸清单（唯一真源 scripts/gates.manifest.json）：\n');
    for (const p of GATE_PHASES) {
      console.log(`  ── ${p}（独立职责，不与其他 phase 重叠）──`);
      for (const g of manifest.gates) {
        if (g.phase === p) console.log(`    ${disabled.has(g.id) ? '⭕' : '🟢'} ${g.id.padEnd(14)} ${g.desc}`);
      }
    }
    console.log('\n  ── health（= 全量闸 + 以下 healthOnly）──');
    for (const g of manifest.gates) console.log(`    ${disabled.has(g.id) ? '⭕' : '🟢'} ${g.id.padEnd(14)} ${g.desc}`);
    for (const h of manifest.healthOnly) console.log(`    ${disabled.has(h.id) ? '⭕' : '🟢'} ${h.id.padEnd(14)} ${h.desc}`);
  } else {
    printStatus();
  }
  process.exit(0);
}

if (sub === 'off' || sub === 'on') {
  const turnOff = sub === 'off';
  const targets = args.filter(Boolean);
  if (targets.length === 0) {
    console.error(`❌ 用法：node scripts/gates-run.mjs ${sub} <id...>（可用：${allIds.join(' / ')}）`);
    process.exit(1);
  }
  const unknown = targets.filter((id) => !known.has(id));
  if (unknown.length) {
    console.error(`❌ 未知闸 id：${unknown.join(', ')}（可用：${allIds.join(' / ')}）`);
    process.exit(1);
  }
  const next = new Set(disabledList);
  for (const id of targets) {
    if (turnOff) next.add(id);
    else next.delete(id);
  }
  manifest.disabled = [...next].sort();
  // 原样写回（保留 _comment / _design / 字段顺序；`disabled` 已在 manifest 里就位）
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  for (const id of targets) console.log(`   ${turnOff ? '⭕ 已关' : '🟢 已开'}：${id}`);
  console.log(`\n   现关 ${manifest.disabled.length} 道：${manifest.disabled.length ? manifest.disabled.join(', ') : '（无）'}`);
  console.log('   ⚠️ 被关的闸**仍在 manifest 登记**（不会变孤儿闸），但 npm run check 会跳过它。');
  process.exit(0);
}

// ───────────────────────────── 跑闸（check / health）─────────────────────────────

if (!PHASES.includes(sub)) {
  console.error(`❌ 未知子命令/分组: "${sub}"（可用: ${PHASES.join(' / ')} / list / status / off / on）`);
  process.exit(1);
}

// 分区选择：health 跑全部闸 + healthOnly；其余只跑自己名下的闸。
let selected =
  sub === 'health'
    ? [...(manifest.gates || []), ...(manifest.healthOnly || [])]
    : (manifest.gates || []).filter((g) => g.phase === sub);

// ── 跳过：持久开关（manifest.disabled） + 临时覆盖（GATES_SKIP）─────────────────
//   三条护栏：① 只认**在册** id（写错即报错）；② 跳过时**打印醒目告警**；
//   ③ **全跳即失败**（selected 为空 ⇒ 退出 1，拒绝"扫 0 却绿灯"）。
const skipRaw = (process.env.GATES_SKIP || '').trim();
const envSkip = skipRaw ? skipRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
const unknownEnv = envSkip.filter((id) => !known.has(id));
if (unknownEnv.length) {
  console.error(`❌ GATES_SKIP 含未知闸 id：${unknownEnv.join(', ')}（可用：${allIds.join(' / ')}）`);
  process.exit(1);
}

const skipSet = new Set([...disabled, ...envSkip]);
const before = selected.length;
selected = selected.filter((g) => !skipSet.has(g.id));
const skippedHere = before - selected.length;
if (skippedHere > 0) {
  const fromPersist = [...disabled].filter((id) => ALL.some((g) => g.id === id));
  const fromEnv = envSkip;
  console.warn(
    `\n⚠️  ⚠️  ⚠️  已跳过 ${skippedHere} 道闸：\n` +
      (fromPersist.length ? `      ⭕ 持久关闭（manifest.disabled）：${fromPersist.join(', ')}\n` : '') +
      (fromEnv.length ? `      ⏭  临时覆盖（GATES_SKIP）：${fromEnv.join(', ')}\n` : '') +
      '   ⇒ 本次结果**不代表门禁全绿**（勿据此提交）。恢复：npm run gate:on -- <id>\n',
  );
}
if (selected.length === 0) {
  console.error('❌ 没有要跑的闸（全被关掉 / GATES_SKIP 跳过 / 分组为空）—— 拒绝"扫 0 却绿灯"');
  process.exit(1);
}

console.log(`🔒 门禁分组 "${sub}"：${selected.length} 道（源自 gates.manifest.json）\n`);

let failed = 0;
for (const g of selected) {
  process.stdout.write(`▶ check:${g.id} — ${g.desc}\n`);
  try {
    execSync(g.cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    failed++;
    console.error(`\n❌ 闸失败: check:${g.id}（${g.cmd}）\n`);
    break; // fail-fast：首个失败即停，避免噪音淹没根因
  }
}

if (failed > 0) {
  console.error(`\n❌ 门禁分组 "${sub}" 未通过（${failed} 道失败）`);
  process.exit(1);
}
console.log(`\n✅ 门禁分组 "${sub}" 全部通过（${selected.length} 道）`);
