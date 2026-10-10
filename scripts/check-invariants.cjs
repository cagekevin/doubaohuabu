#!/usr/bin/env node
/**
 * 不变量检查（grep 型）—— 补 dependency-cruiser 做不到的部分
 *
 * 依据：docs/11-架构与契约定稿.md §6.5 职责归位八原则
 *   - dependency-cruiser 查「文件之间怎么依赖」
 *   - 本脚本查「文件内部写了什么」（文本级不变量）
 *
 * 用法：node scripts/check-invariants.cjs
 * 退出码：0 = 全过；1 = 有违规
 *
 * ⚠️ 扫描前**先剥注释**（否则文档注释里提到 `Date.now`/`doubao-xxx` 会误报）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 剥离块注释与行注释（保留行数，便于报行号） */
function stripComments(code) {
  const noBlock = code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlock
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const files = walk(SRC);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => stripComments(fs.readFileSync(p, 'utf8'));

/**
 * 测试文件判定
 *
 * ⚠️ **不变量规则只约束「生产代码」**（原则 3/4/5/6/8）——测试文件天然需要构造假数据：
 *    - `原则4` 的测试**标题**会提到 `Date.now`（在描述"不许用它"）
 *    - `原则6` 的 fixture **必须**构造假 `message`（那正是"透传"要测的东西）
 *    **原则 7 例外**：它本身就是管"测试文件放哪"，必须看全部文件。
 */
const isTest = (f) =>
  f.includes(`${path.sep}tests${path.sep}`) || /\.(test|spec)\.(ts|tsx)$/.test(f);
/** 生产代码（除原则 7 外，所有规则只看它） */
const prodFiles = files.filter((f) => !isTest(f));

const violations = [];
const add = (rule, file, line, text) =>
  violations.push({ rule, file: rel(file), line, text: String(text).trim().slice(0, 120) });

/** 逐行扫描（已剥注释）—— 只看生产代码 */
function scanLines(rule, filter, re, msg) {
  for (const f of prodFiles.filter(filter)) {
    if (!/\.(ts|tsx)$/.test(f)) continue;
    read(f)
      .split('\n')
      .forEach((ln, i) => {
        if (re.test(ln)) add(rule, f, i + 1, `${msg} :: ${ln}`);
      });
  }
}

const inDir = (f, name) => f.includes(`${path.sep}${name}${path.sep}`);

// ── 原则 4：纯的归 core（core 不得接触宿主/时间/随机/存储）──
// ⚠️ 排除 core/ports —— 端口**就是**用来声明这些能力的（方法名里必然出现 setTimeout）
const DIRTY = /\b(window|document|Date\.now|Math\.random|localStorage|sessionStorage)\b|\bset(Timeout|Interval)\s*\(/;
scanLines(
  '原则4/core-purity',
  (f) => inDir(f, 'core') && !inDir(f, 'ports'),
  DIRTY,
  'core 不得接触宿主/时间/随机/存储（经端口注入）',
);

// ── 原则 6：错误透传 —— 禁止吞错 ──
// ⚠️ **反向判据**（不列白名单）：判"错误对象是否根本拿不到"，而不是"体内写了什么"
//    （TD-14-1：原闸只拦 `catch {}` 花括号，**漏了 `.catch(cb)` 回调形态**）
scanLines('原则6/no-swallow', () => true, /catch\s*(\([^)]*\))?\s*\{\s*\}/, '禁止空 catch（吞错）');
scanLines(
  '原则6/no-swallow',
  () => true,
  /\.catch\s*\(\s*(?:function\s*)?\(\s*\)\s*(?:=>)?/,
  '禁止无形参的 .catch 回调（拿不到错误对象 ⇒ 必然无法上报，等于吞错）',
);
// 有形参但**完全没被引用**的 `.catch((e) => ...)` —— 用 `_` 前缀是显式"有意不用"，需 `catch-ok:` 理由
scanLines(
  '原则6/no-swallow',
  () => true,
  /\.catch\s*\(\s*\(?\s*(?!_)[A-Za-z_$][\w$]*\s*\)?\s*=>\s*[^=]/,
  '⚠️ 有形参的 .catch —— 请确认体内真的上报了错误（写日志/转 Result），否则改形参为 `_` 并附 `// catch-ok: <理由>`',
);

// ── 原则 6：usecases 不得造 message 字面量 ──
scanLines(
  '原则6/no-fake-message',
  (f) => inDir(f, 'usecases'),
  /message:\s*['"`]/,
  'usecases 不得自造 message 字面量（只能转发 e.message / 上游 Result）',
);

// ── 原则 3：core/ports 只有类型 ──
for (const f of files.filter((p) => inDir(p, 'ports') && p.includes(`${path.sep}core${path.sep}`))) {
  if (!/\.ts$/.test(f) || /\.test\.ts$/.test(f)) continue;
  const bad = /^\s*(export\s+)?(async\s+)?function\s|^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(\(|async|function)/m;
  if (bad.test(read(f))) add('原则3/ports-type-only', f, 0, 'core/ports 只能有 interface/type，不得有运行时实现');
}

// ── 原则 7：测试边界（ui/ 与 adapters/ 下不得有测试文件）──
for (const f of files) {
  const r = rel(f);
  if (/^src\/(ui|adapters)\//.test(r) && /\.(test|spec)\.tsx?$/.test(r)) {
    add('原则7/test-boundary', f, 0, 'ui/ 与 adapters/ 下不得有测试文件（避免假守卫）');
  }
}

// ── 原则 5：SSOT —— 冻结契约字符串只允许出现在 stable/contracts/ ──
const KEY_LITERAL = /['"`]doubao-[a-z0-9-]+['"`]|['"`]imggen_recurring_assets_v1['"`]/;
for (const f of prodFiles) {
  const r = rel(f);
  // stable/contracts/ 是冻结契约字符串的唯一真源（keys.ts + schemas.ts）
  if (r.startsWith('src/stable/contracts/')) continue;
  if (!/\.(ts|tsx)$/.test(r)) continue;
  read(f)
    .split('\n')
    .forEach((ln, i) => {
      if (KEY_LITERAL.test(ln)) {
        add('原则5/ssot-keys', f, i + 1, '冻结契约字符串只能出现在 stable/contracts/（keys.ts / schemas.ts）');
      }
    });
}

// ── 原则 5：SSOT —— 字面量色值只允许出现在 styles/tokens.css ──
// ⚠️ **有理由的例外**：`src/constants/**` —— canvas 2D 的 `fillStyle` **不支持 `var(--...)`**，
//    canvas 用色只能以常量形式落在 SSOT 层（如 `FACE_MASK_PATTERN_COLOR`）。
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
for (const f of prodFiles) {
  const r = rel(f);
  if (r === 'src/styles/tokens.css') continue;
  if (r.startsWith('src/constants/')) continue; // ← canvas 用色的合法落点
  if (!/\.(css|ts|tsx)$/.test(r)) continue;
  fs.readFileSync(f, 'utf8') // CSS 不能用 stripComments（会破坏内容），改用手工剔除 CSS 注释
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .forEach((ln, i) => {
      if (COLOR_LITERAL.test(ln)) add('原则5/ssot-color', f, i + 1, '字面量色值只能出现在 styles/tokens.css（用 var(--...)）');
    });
}

// ── TD-05-1 反向判据：站点适配器**不得直调 `window.api`** ──
// 判据：站点层的宿主能力必须经注入的 `HostPort`（否则 mock 宿主对站点层失效 = 端口形同虚设）
// 反向判据（不列白名单）：只要出现 `window.api` 的**成员访问**即违规
for (const f of prodFiles) {
  const r = rel(f);
  if (!r.startsWith('src/adapters/site/')) continue;
  if (!/\.(ts|tsx)$/.test(r)) continue;
  read(f)
    .split('\n')
    .forEach((ln, i) => {
      if (/window\.api\s*[.?!]/.test(ln) || /window\.api\s*\[/.test(ln)) {
        add(
          'TD05/site-no-window-api',
          f,
          i + 1,
          '站点适配器不得直调 window.api —— 宿主能力必须经注入的 HostPort（TD-05-1）',
        );
      }
    });
}

// ── W12 反向判据：禁调用不存在的宿主方法 ──
// `lovartChromeEval` 全仓不存在（preload 未暴露、主进程无 handler），
// 且 `lovart-chrome-is-open` 故意恒返 false ⇒ 该通道是死代码（09-校验记录 C2）
const DEAD_HOST_CALLS = [/\blovartChromeEval\b/];
for (const f of prodFiles) {
  const r = rel(f);
  if (!/\.(ts|tsx)$/.test(r)) continue;
  read(f)
    .split('\n')
    .forEach((ln, i) => {
      for (const re of DEAD_HOST_CALLS) {
        if (re.test(ln)) {
          add(
            'W12/dead-host-call',
            f,
            i + 1,
            '调用了不存在的宿主方法（lovartChromeEval 全仓不存在；Chrome CDP 采集通道是死代码，见 09-校验记录 C2）',
          );
        }
      }
    });
}

// ── 原则 8：三振出局（Rule of Three）──
const SHARED_UI = /^src\/ui\/common\//;
for (const f of prodFiles) {
  const r = rel(f);
  if (!/\.(ts|tsx)$/.test(r) || SHARED_UI.test(r)) continue;
  read(f)
    .split('\n')
    .forEach((ln, i) => {
      if (/['"]Escape['"]/.test(ln)) {
        add('原则8/rule-of-three', f, i + 1, 'Escape 键盘处理只允许在 ui/common/；此处出现 = 手写重复，应抽 <Modal>/<ContextMenu>');
      }
      if (/aria-modal|role=["']dialog["']/.test(ln)) {
        add('原则8/rule-of-three', f, i + 1, '弹窗语义只允许在 ui/common/；应抽 <Modal>');
      }
    });
}

// ui/common/ 必须存在的共享组件
const REQUIRED_COMMON = ['Modal', 'ContextMenu', 'ToastHost', 'ErrorBanner', 'EmptyState'];
for (const name of REQUIRED_COMMON) {
  const p = path.join(SRC, 'ui', 'common', `${name}.tsx`);
  if (!fs.existsSync(p)) add('原则8/rule-of-three', p, 0, `ui/common/${name}.tsx 缺失（原则 8 要求抽出的共享组件）`);
}

// ── 输出 ──
if (violations.length === 0) {
  console.log('✅ 不变量检查全过（原则 3/4/5/6/7/8）');
  process.exit(0);
}
console.error(`❌ 不变量检查失败：${violations.length} 处违规\n`);
const byRule = {};
for (const v of violations) (byRule[v.rule] = byRule[v.rule] || []).push(v);
for (const [rule, list] of Object.entries(byRule)) {
  console.error(`── ${rule}（${list.length}）──`);
  for (const v of list.slice(0, 10)) console.error(`   ${v.file}:${v.line}  ${v.text}`);
  if (list.length > 10) console.error(`   … 另有 ${list.length - 10} 处`);
  console.error('');
}
process.exit(1);
