#!/usr/bin/env node
/**
 * 【元层闸 · 静态度量】在册闸的**扫描根必须存在**、其"基数自检"不得缺失，且脚本头部必须带【申诉口】三问。
 *
 * 【它治什么】母体：**扫描型闸靠"字面目录路径"锚定，目录随重构改名 ⇒ 扫 0 ⇒ 仍打印 ✅**。
 *   本仓同款风险：脚本闸（`check-dead-code`）的扫描根是 `src`。若该路径因重构消失，
 *   闸会**静默 0 违规**而照常绿灯（假防线）。
 *
 * 【为什么是"静态"而不是"跑一遍"】把整个门禁又跑一遍去抓基数，成本极高（maomao 实测 8.9s → 全仓最慢），
 *   而绝大多数闸的扫描根就是 `src`（永远存在）。⇒ 正确形态 = **静态度量**：读闸脚本源码，抽出它的
 *   扫描根常量，`existsSync` 毫秒级判存在；再检查源码里有没有"扫到 0 即 fail-loud"的自检。
 *   实测 < 0.1s。
 *
 * 【诚实边界（写进闸里，不假装覆盖）】
 *   本闸是**静态近似**，不等于"那个闸真的扫到了 N 个"。它能抓的是**目录消失**这类结构性失效；
 *   运行时才暴露的失效（正则写错、解析器被改名打瞎）由各闸**自己的基数自检**负责 ——
 *   本闸同时检查"你有没有那个自检"，两者配合才完整。
 *   同理，申诉口检查只保证"头部写了那几个字符串"，不保证三问内容有实质 —— 那是**存在性**检查，
 *   不是质量检查。
 *
 * ★闸的申诉口
 *   Q1 守什么：**结构偏好闸**。它守的不是代码，而是**其它闸的眼睛**。
 *   Q2 何时该改：① 新增闸 → 在 `GATES` 表登记它的扫描根与自检类型；
 *               ② 某闸确实无扫描根（如交给 tsc / eslint）→ 写 `roots: null` + `why`（**必填**）；
 *               ③ 某闸的扫描根**合理地不存在** → 先问"这个闸还有存在意义吗"，有则登记豁免并写理由。
 *   Q3 怎么改：**只收窄不放宽**。新增豁免必须写明"为什么这个根不存在是正常的"。
 *               本闸只读脚本头、不改任何判定 ⇒ **不会**拦住"让同一语义份数下降"的动作（收口/下沉/去重）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'scripts', 'gates.manifest.json');

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');

/**
 * 剥掉注释后再做特征匹配。
 * 【为什么必须剥】首版若在全文上匹配 ⇒ 闸的**文件头注释**里提到某路径就被误判。
 * **判据要判"代码做了什么"，不是"文件里出现了什么词"。**
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释（含 JSDoc）
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // 行注释（避开 http:// 之类）
}

/**
 * **非闸助手白名单** —— `scripts/check-*.mjs` 里**不独立运行**的那些。
 *
 * 【为什么需要这张表】闸体系的登记真源是 `gates.manifest.json`。但**登记表天然看不见"该登记而未登记"的东西** ——
 *   一个脚本可以物理存在、顶着 `check-` 前缀、却从没被任何闸跑过（= 孤儿闸：它**从没红过**，
 *   也就没人知道它坏了）。
 *
 * 【判据（双向对账 · 独立枚举两边再求差）】
 *   左侧 = 物理存在的 `scripts/check-*`（**目录 glob，不读任何登记表**）；
 *   右侧 = manifest 的 `gates` + `healthOnly` 引用到的脚本。
 *   左侧有、右侧无 ⇒ 必须**要么**是误命名（改掉 `check-` 前缀）**要么**登记进 manifest；
 *   **唯一合法的第三态 = 本表**（真·非闸助手），且**必须写明"被谁用"**（防它变成藏孤儿的地方）。
 *
 * ⚠️ 本表是白名单，故必须自带防滥用的判据（否则它会变成"把孤儿塞进来就绿"的绕行道）：
 *   ① 每项必须写 `usedBy`（至少 1 个真实 import 它的脚本），本闸会**实跑 grep 校验它真的被引用**；
 *   ② 本表只允许放**纯导出、零执行体**的脚本（本闸检查它没有顶层 `process.exit` / `main()` 调用）；
 *   ③ 脚本若同时"不在 manifest"且"没人 import" ⇒ 报红（那才是真孤儿）。
 */
const NON_GATE_HELPERS = {
  'check-targets.mjs': {
    usedBy: ['scripts/mv-sync-refs.mjs'],
    why: '扫描根 + 扩展名无关解析的【唯一事实源】（纯 export，无执行体；被 mv-sync-refs.mjs import，不单独跑）',
  },
};

/**
 * 在册闸的扫描根登记表 —— **唯一真源，新增闸时在此登记一行**。
 *
 * 字段：
 *   roots    —— 闸依赖的扫描根（相对仓库根）。`null` = 该闸无扫描根（如交给外部工具）。
 *   selfCheck—— 该闸是否带"扫到 0 即 fail-loud"的自检。`'own'` = 自己实现了；
 *               `'external'` = 由外部消费方保证（如 tsc）；缺失则本闸提示补。
 *   why      —— 无扫描根 / 无自检时的理由（**必填**，防"一句话绕过"）。
 */
const GATES = {
  typecheck: { roots: null, selfCheck: 'external', why: '由 tsc 遍历；tsc 对"无输入"会报错' },
  'typecheck:electron': {
    roots: null,
    selfCheck: 'external',
    why: '由 tsc 遍历 electron/；对"无输入"会报 TS18003（扫描根由 tsconfig 的 include/exclude 表达，不是字面目录）',
  },
  lint: { roots: null, selfCheck: 'external', why: '由 eslint 遍历（eslint .）；无输入会报错' },
  boundaries: { roots: ['src'], selfCheck: 'external', why: 'depcruise 对空图会报错（无模块可分析）' },
  'dead-code': { roots: ['src'], selfCheck: 'own', why: '' },
  'gate-vitals': { roots: null, selfCheck: null, why: '元层（本闸）：静态度量其它闸，自身不扫描代码' },
  test: { roots: ['src'], selfCheck: 'external', why: 'vitest 对空集合会报错（No test files found）' },
};

if (!existsSync(MANIFEST)) {
  console.error(`❌ 找不到闸清单：${MANIFEST}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const registered = (manifest.gates ?? []).map((g) => g.id);

// ── 1. 登记表与闸清单必须双向一致（防"新增闸忘了登记"= 清单必漏）─────────────
const missing = registered.filter((id) => !(id in GATES));
const stale = Object.keys(GATES).filter((id) => !registered.includes(id));

/** 从闸的 cmd 里取脚本名（只看 `manifest.gates`） */
const scriptOf = (id) => {
  const g = (manifest.gates ?? []).find((x) => x.id === id);
  if (!g) return null;
  const m = /scripts\/([\w.-]+\.(?:mjs|cjs|js))/.exec(g.cmd);
  return m ? m[1] : null;
};

const findings = []; // {id, level, msg}

/**
 * ── 1b. **物理脚本 ↔ 清单** 双向对账 ────────────────────────────────────────
 * 上方 1 是"登记表 ↔ 清单"对账；这里补的是**更外一层**：
 * **磁盘上真实存在的 `scripts/check-*` ↔ 清单**。少了这一层，一个脚本可以物理存在却**从没被任何闸跑过**。
 */
const CHECK_SCRIPT_DIR = join(ROOT, 'scripts');
const physicalCheckScripts = readdirSync(CHECK_SCRIPT_DIR)
  .filter((f) => /^check-.*\.(mjs|cjs)$/.test(f))
  .sort();
const referencedScripts = new Set();
for (const g of [...(manifest.gates ?? []), ...(manifest.healthOnly ?? [])]) {
  const m = /scripts\/([\w.-]+\.(?:mjs|cjs|js))/.exec(String(g.cmd ?? ''));
  if (m) referencedScripts.add(m[1]);
}
const orphanGates = physicalCheckScripts.filter(
  (f) => !referencedScripts.has(f) && !(f in NON_GATE_HELPERS),
);
// 白名单防滥用：① 真的被 import（实跑 grep）② 纯导出无执行体
for (const [helper, meta] of Object.entries(NON_GATE_HELPERS)) {
  const p = join(CHECK_SCRIPT_DIR, helper);
  if (!existsSync(p)) {
    findings.push({
      id: 'gate-vitals',
      level: 'error',
      msg: `非闸助手白名单里的 ${helper} 已不存在 → 删该白名单行（幽灵预留）`,
    });
    continue;
  }
  const src = readFileSync(p, 'utf8');
  for (const user of meta.usedBy ?? []) {
    const up = join(ROOT, user);
    if (!existsSync(up)) {
      findings.push({
        id: 'gate-vitals',
        level: 'error',
        msg: `非闸助手 ${helper} 声称被 ${user} 使用，但该文件不存在（白名单必须写真实消费者）`,
      });
      continue;
    }
    if (!readFileSync(up, 'utf8').includes(helper)) {
      findings.push({
        id: 'gate-vitals',
        level: 'error',
        msg: `非闸助手 ${helper} 声称被 ${user} import，但该文件里搜不到 ${helper} → 它不是助手，是孤儿闸`,
      });
    }
  }
  // 纯导出判定：顶层不得有 process.exit / main 调用（用剥注释后的源码判，防注释误伤）
  if (/(?:^|\n)\s*(?:process\.exit\(|\w*[Mm]ain\s*\()/.test(stripComments(src))) {
    findings.push({
      id: 'gate-vitals',
      level: 'error',
      msg: `非闸助手 ${helper} 含顶层执行体（process.exit / main 调用）→ 它是闸，必须进 manifest，不许待在助手白名单`,
    });
  }
}
for (const f of orphanGates) {
  findings.push({
    id: 'gate-vitals',
    level: 'error',
    msg: `孤儿闸：scripts/${f} 物理存在，但既不在 gates.manifest.json，也不在 NON_GATE_HELPERS 助手白名单 → 它**从没被任何闸跑过**（从没红过 = 没人知道它坏了）。处置：登记进 manifest，或（若确为非闸助手）加白名单并写明 usedBy`,
  });
}

/**
 * ── 1c. 【申诉口】三问 ─────────────────────────────────────────────────────
 * 【为什么要有机器约束】「闸的成本守恒律」若只活在注释与文档里 → 必回潮：新加的闸不会写申诉口，
 *   已有句式各自漂移（无法机器读），"闸能不能被挑战"重新变成只有人记得的口头约定。
 * 【判据（真源仍是 `gates.manifest.json`，本脚本不另立清单）】
 *   从 manifest 的 `gates` + `healthOnly` 读 `cmd`，解析出其中的**脚本文件**，逐个校验：
 *     · 脚本存在；· 头部（首个块注释结束符之前）同时含锚点 `ANCHOR` 与三行标签 `LABELS`。
 *   `cmd` 不是 node 脚本的（如 `npm run typecheck` = tsc 本体）→ **明确列出"跳过"**，不静默略过。
 *   解析到的脚本数为 0 → 当场报错，绝不"静默 0 违规"。
 */
const ANCHOR = '★闸的申诉口';
const LABELS = ['Q1 守什么：', 'Q2 何时该改：', 'Q3 怎么改：'];

const scriptFromCmd = (cmd) => {
  const m = String(cmd || '').match(/(?:^|\s)([\w./-]+\.(?:mjs|cjs))/);
  return m ? m[1].replace(/\\/g, '/') : null;
};

const appealEntries = [...(manifest.gates ?? []), ...(manifest.healthOnly ?? [])];
const skippedNonScript = [];
let appealChecked = 0;
for (const g of appealEntries) {
  const rel = scriptFromCmd(g.cmd);
  if (!rel) {
    skippedNonScript.push(`${g.id}（cmd 非脚本：${g.cmd}）`);
    continue;
  }
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    findings.push({ id: g.id, level: 'error', msg: `闸清单指向的脚本不存在：${rel}` });
    continue;
  }
  appealChecked++;
  const text = readFileSync(abs, 'utf8');
  const close = text.indexOf('*/'); // 头部 = 首个块注释结束符之前
  const head = close >= 0 ? text.slice(0, close) : text.slice(0, 4000);
  const lack = [];
  if (!head.includes(ANCHOR)) lack.push(`锚点「${ANCHOR}」`);
  for (const label of LABELS) if (!head.includes(label)) lack.push(`标签「${label}」`);
  if (lack.length) {
    findings.push({ id: g.id, level: 'error', msg: `${rel} 缺【申诉口】：${lack.join(' · ')}` });
  }
}
if (appealChecked === 0) {
  findings.push({
    id: 'gate-vitals',
    level: 'error',
    msg: '申诉口检查解析到 0 个脚本闸（manifest 形状变了 / 路径失效）—— 拒绝"静默 0 违规"',
  });
}

// ── 2. 逐闸静态体检 ─────────────────────────────────────────────────────────
for (const id of registered) {
  const meta = GATES[id];
  if (!meta) {
    findings.push({
      id,
      level: 'error',
      msg: '未在 GATES 登记表里登记（新增闸必须登记：扫描根 + 自检类型）',
    });
    continue;
  }
  // 2a. 扫描根必须存在
  if (meta.roots) {
    for (const r of meta.roots) {
      if (!existsSync(join(ROOT, r))) {
        findings.push({
          id,
          level: 'error',
          msg: `扫描根不存在：${r} → 该闸会**扫 0 但照常打印通过**`,
        });
      }
    }
  }
  // 2b. 无扫描根必须写明理由
  if (!meta.roots && !meta.why) {
    findings.push({ id, level: 'error', msg: 'roots 为 null 但未写 why（防"一句话绕过"，理由必填）' });
  }
  // 2c. 有扫描根就应有基数自检
  if (meta.roots && !meta.selfCheck) {
    findings.push({
      id,
      level: 'warn',
      msg: '有扫描根但未声明基数自检 → 建议加"扫到 0 即 fail-loud"',
    });
  }
  // 2d. 声称自己实现了自检 → 源码里应能找到痕迹（防"声明了但没做"）
  if (meta.selfCheck === 'own') {
    const s = scriptOf(id);
    if (!s) {
      findings.push({
        id,
        level: 'warn',
        msg: "登记为 selfCheck:'own'，但 cmd 里解析不出脚本路径 ⇒ 自检痕迹**未被校验**",
      });
    } else {
      const p = join(ROOT, 'scripts', s);
      if (existsSync(p)) {
        const src = stripComments(readFileSync(p, 'utf8'));
        // 自检的**形态**（别只认一种）：集合/字符串长度判 0，或裸计数判 0，且附近有 fail-loud。
        const zeroCheck =
          /(?:\.length|\.size)\s*===?\s*0/.test(src) || // 集合/字符串长度判 0
          /\b\w+\s*===?\s*0\b/.test(src) || // 裸计数判 0（如 count === 0）
          /\bassertScanned\b/.test(src); // 收敛后的命名约定
        const failLoud = /process\.exit\(\s*[1-9]/.test(src) || /throw new Error/.test(src);
        if (!(zeroCheck && failLoud)) {
          findings.push({
            id,
            level: 'warn',
            msg: `登记为 selfCheck:'own'，但源码未同时找到"集合判 0"（${zeroCheck ? '有' : '无'}）与"fail-loud"（${failLoud ? '有' : '无'}）痕迹（脚本 ${s}）`,
          });
        }
      }
    }
  }
}
for (const id of missing) {
  if (!findings.some((f) => f.id === id)) {
    findings.push({ id, level: 'error', msg: '闸清单里有，但 GATES 登记表没有' });
  }
}
for (const id of stale) {
  findings.push({
    id,
    level: 'warn',
    msg: 'GATES 登记表里有，但闸清单已无此闸（可能已退役，请删登记行）',
  });
}

const errors = findings.filter((f) => f.level === 'error');
const warns = findings.filter((f) => f.level === 'warn');

if (JSON_OUT) {
  console.log(JSON.stringify({ registered, appealChecked, skippedNonScript, findings }, null, 2));
  process.exit(errors.length ? 1 : 0);
}

console.log('🩺 元层闸（闸的闸 · 零执行）—— 扫描根存在性 + 基数自检 + 【申诉口】三问');
console.log(`   在册闸 ${registered.length} 道 ｜ 脚本闸 ${appealChecked} 个（已校验申诉口）`);
if (skippedNonScript.length) {
  console.log(`   跳过（cmd 非脚本）：${skippedNonScript.join(' · ')}`);
}
if (warns.length) {
  console.log(`\n⚠️  警告 ${warns.length} 条：`);
  for (const w of warns) console.log(`   [${w.id}] ${w.msg}`);
}
if (errors.length) {
  console.error(`\n❌ 元层闸未过（${errors.length} 条）：`);
  for (const e of errors) console.error(`   [${e.id}] ${e.msg}`);
  process.exit(1);
}
console.log('\n   ✅ 通过（无错误）');
