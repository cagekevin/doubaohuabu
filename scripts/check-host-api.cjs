#!/usr/bin/env node
/**
 * W1 校验：宿主契约对齐
 *
 * 判据（docs/08-验证用例.md W1）：
 *   把 `preload.js` 的方法名集合 与 重写工程里 `window.api.*` 的出现集合做**差集**，
 *   **差集必须为空**（允许未使用的宿主方法，**不允许**调用不存在的方法）。
 *
 * 另检查：
 *   ② 两个 `sendSync`（`saveImageSync` / `activateProjectStorage`）**不得被 await**
 *   ③ 所有 `on*` 订阅**必须接收返回值并调用**（取消函数）
 *
 * 用法：node scripts/check-host-api.cjs
 * 退出码：0 = 通过；1 = 违规
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PRELOAD = path.join(ROOT, 'electron', 'preload.js');

if (!fs.existsSync(PRELOAD)) {
  console.error('❌ 未找到 electron/preload.js');
  process.exit(1);
}

// ── 1. 抽 preload 的方法集 ──
const preloadSrc = fs.readFileSync(PRELOAD, 'utf8');
const body = preloadSrc.slice(preloadSrc.indexOf("exposeInMainWorld('api'"));
const RE_MEMBER = /^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;

const hostMethods = new Set();
let m;
while ((m = RE_MEMBER.exec(body)) !== null) hostMethods.add(m[1]);

// ── 2. 抽本工程用到的 window.api.* ──
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const used = new Map(); // name -> [files]
const RE_USE = /window\.api\.([A-Za-z_$][\w$]*)/g;
const RE_USE2 = /\bapi\.([A-Za-z_$][\w$]*)\s*\(/g; // adapter 内的局部别名用法

/** 剥离注释（否则「文档里说某方法不存在」会被当成调用 —— 实测踩过） */
function stripComments(code) {
  const noBlock = code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlock
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const files = walk(SRC);
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const txt = stripComments(fs.readFileSync(f, 'utf8'));
  for (const re of [RE_USE, rel.includes('adapters/host/electron/') ? RE_USE2 : null]) {
    if (!re) continue;
    let x;
    while ((x = re.exec(txt)) !== null) {
      if (!used.has(x[1])) used.set(x[1], []);
      used.get(x[1]).push(rel);
    }
  }
}

// ── 3. 差集 ──
const violations = [];
for (const [name, where] of used) {
  // 排除常见非宿主调用（如 `api.` 前缀撞车）
  if (!hostMethods.has(name)) {
    violations.push({ rule: 'W1/不存在的方法', name, where: [...new Set(where)].join(', ') });
  }
}

// ── 4. sendSync 不得 await ──
const SYNC_METHODS = ['saveImageSync', 'activateProjectStorage'];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (!rel.includes('adapters/host/electron/')) continue;
  fs.readFileSync(f, 'utf8')
    .split('\n')
    .forEach((ln, i) => {
      for (const s of SYNC_METHODS) {
        if (new RegExp(`await\\s+[\\w.]*\\b${s}\\b`).test(ln)) {
          violations.push({ rule: 'W1/sendSync 被 await', name: s, where: `${rel}:${i + 1}` });
        }
      }
    });
}

// ── 5. on* 订阅必须取返回值并调用 ──
// ⚠️ 跳过 `.d.ts`：那是**类型声明**，不是调用点（声明里必然没有"取取消函数"这回事）
const ON_METHODS = [...hostMethods].filter((n) => /^on[A-Z]/.test(n));
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (!rel.includes('adapters/host/electron/')) continue;
  if (rel.endsWith('.d.ts')) continue;
  const txt = fs.readFileSync(f, 'utf8');
  for (const o of ON_METHODS) {
    if (!txt.includes(o)) continue;
    // 订阅处应出现 `const off = api.onXxx(` 或 `api.onXxx(` 后接 `=> ` 并把返回值存起来
    const re = new RegExp(`(const|let)\\s+\\w+\\s*=\\s*[\\w.]*\\b${o}\\b\\s*\\(`);
    if (!re.test(txt)) {
      violations.push({ rule: 'W1/订阅未取取消函数', name: o, where: rel });
    }
  }
}

// ── 输出 ──
console.log(`preload 暴露 ${hostMethods.size} 个成员；本工程用到 ${used.size} 个`);
const unused = [...hostMethods].filter((n) => !used.has(n));
console.log(`未使用（允许）：${unused.length} 个`);

if (violations.length === 0) {
  console.log('\n✅ W1 通过：调用面 ⊆ preload 方法集，sendSync 同步调用，订阅均取取消函数');
  process.exit(0);
}

console.error(`\n❌ W1 失败：${violations.length} 处违规\n`);
for (const v of violations) console.error(`  [${v.rule}] ${v.name}  ← ${v.where}`);
process.exit(1);
