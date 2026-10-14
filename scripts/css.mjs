#!/usr/bin/env node
/**
 * css.mjs —— CSS 工作效率工具箱（**手动工具，不是闸** —— 不进 `npm run check`）
 *
 * 为什么有它：本仓 CSS 有一层**构建期查不出**的静默错（`composes` 合成），
 *   又有大量「同一件事 N 份」的收口工作要反复量。这些命令就为这两件事。
 *
 * 用法：`npm run css -- <命令> [参数]`（或 `node scripts/css.mjs <命令>`）
 *
 *   check [名称]      诊断（只读）。不填名称 = 跑全部；填则只跑一条
 *                        override  本地声明**覆盖**真源同名属性（真源入 `@layer` ⇒ **本地胜、生效**）
 *                        missing   `composes` 引用的类 / 文件不存在（`vite build` 也不报，只少一个类）
 *                        order     同文件基础规则重复 + 属性重叠（后者静默盖前者）
 *                        dead      定义了但没人用的类（TSX 没引、也没被 composes）
 *                        dupe      跨模块**同形**类体（默认 ≥3 条声明）
 *                        near      近似重复（比**本地声明**，差 ≤ `--diff`）—— 收口真候选（默认 min=4 · diff=1）
 *                        vars      CSS 变量：定义了没人用 / 用了没定义
 *                        hard      硬编码值（色值 / 裸 px / 裸 z-index）
 *   show <类名>       一个类的全貌：定义 · composes 链 · 谁 compose 它 · 哪个 TSX 用 · **最终生效声明**
 *   rename <旧> <新>  语义改名：一次改三处（CSS 定义 + 所有 composes 引用 + 所有 styles.X）；默认 dry-run，加 --write 落地
 *   stats             总览：文件 / 类 / composes 边 + 逐族类数
 *   export            导出**真机 CSS 三件套**到 docs/mockup/spec/：
 *                        ui-real.css  浏览器可直接 <link> 的 CSS（module.css 去作用域化，类名 = 真机类名）
 *                        UI-CSS.md    人读索引（类 · 声明数 · composes 链 · TSX 消费者）
 *                        ui-css.json  机器可读全量（供 mockup / 后续界面复用）
 *   help              本帮助
 *
 * 全局开关：`--json`（机器可读）· `--top N`（列表截断，默认 50）· `--changed`（只看 git 改动的文件）
 *   `--file <目标>`（rename）· `--min N` / `--diff N`（dupe / near）
 *
 * 依赖：**postcss**（CSS 标准解析器）。本仓**未显式声明**它 —— 现在经 Vite 的依赖树自带；
 *   有条件时补一条 `npm i -D postcss`，免得将来 Vite 不带它了。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let postcss;
try {
  postcss = (await import('postcss')).default;
} catch {
  console.error('❌ 需要 postcss（CSS 解析器）。本仓现在靠 Vite 的依赖树自带；装它：npm i -D postcss');
  process.exit(2);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const TOKENS = path.join(SRC, 'styles/tokens.css');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
/** 取值型开关（位置参数解析时要跳过它们的值） */
const VALUE_FLAGS = new Set(['--top', '--min', '--diff', '--file']);
const optNum = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(n) ? n : def;
};
const optStr = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const TOP = optNum('top', 50);
/** 位置参数（跳过 `--flag` 及其取值） */
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a.startsWith('--')) {
    if (VALUE_FLAGS.has(a)) i += 1;
    continue;
  }
  positional.push(a);
}
const cmd = (positional[0] ?? 'help').toLowerCase();
const arg = positional[1];

const rel = (p) => path.relative(ROOT, p).replaceAll(path.sep, '/');
const walk = (dir, test, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
};
const line = (n) => String(n).padStart(4);

// ─────────────────────────── 解析层（只跑一次） ───────────────────────────

/** `index`: 文件 → Map<类名, {line, props:Set, decls:Map<属性,值>, composes:[{names,from,line}]}>；只收**单类**规则 */
const index = new Map();
/** `known`: 文件 → Set<类名>（**任何选择器**里出现即算存在 —— `.x:hover` 也定义一个类） */
const known = new Map();
/** `byName`: 类名 → [{file, line, props:Set<string>, composes}]（跨文件按名索引） */
const byName = new Map();
/** `bodies`: 文件 → Map<类名, 规范化声明块>（`dupe` 用） */
const bodies = new Map();
/** `rulesByFile`: 文件 → [{selector, line, classes, props}]（**每条规则**，含变体 —— `order` 用） */
const rulesByFile = new Map();
/** 所有 module.css（绝对 + 相对路径） */
const cssAbs = walk(SRC, (n) => n.endsWith('.module.css')).map((abs) => ({ abs, rel: rel(abs) }));

for (const { abs, rel: f } of cssAbs) {
  const map = new Map();
  const names = new Set();
  const body = new Map();
  const rules = [];
  index.set(f, map);
  known.set(f, names);
  bodies.set(f, body);
  rulesByFile.set(f, rules);
  postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs }).walkRules((rule) => {
    const sel = rule.selector;
    const selClasses = [...sel.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((x) => x[1]);
    for (const c of selClasses) names.add(c);
    const ruleProps = [];
    rule.walkDecls((d) => {
      if (d.prop !== 'composes') ruleProps.push(d.prop);
    });
    rules.push({ selector: sel, line: rule.source.start.line, classes: selClasses, props: ruleProps });
    const m = /^\.([A-Za-z_][\w-]*)$/.exec(sel.trim());
    if (!m) return;
    const cls = m[1];
    const rec = map.get(cls) ?? { line: rule.source.start.line, props: new Set(), decls: new Map(), composes: [] };
    const decls = [];
    rule.walkDecls((d) => {
      if (d.prop === 'composes') {
        const fm = /\s+from\s+['"]([^'"]+)['"]\s*$/.exec(d.value.trim());
        rec.composes.push({
          names: (fm ? d.value.slice(0, fm.index) : d.value).trim().split(/\s+/).filter(Boolean),
          from: fm ? fm[1] : null,
          line: d.source.start.line,
        });
        return;
      }
      rec.props.add(d.prop);
      rec.decls.set(d.prop, d.value.trim());
      decls.push(`${d.prop}:${d.value.trim()}`);
    });
    map.set(cls, rec);
    body.set(cls, decls.sort().join(';'));
    const list0 = byName.get(cls) ?? [];
    list0.push({ file: f, line: rec.line, props: rec.props, composes: rec.composes });
    byName.set(cls, list0);
  });
}

/** 哪些文件把内容包在 `@layer` 里（真源 `common/shared.module.css`）—— 决定「本地是否天然胜」 */
const layeredFiles = new Set();
/** token 定义 `--x: value`（全 css）—— 供 `resolveValue` 展开别名 */
const TOKEN_DEFS = new Map();
for (const { abs, rel: f } of cssAbs) {
  const src = fs.readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@layer\s+[^{]*\{/.test(src)) layeredFiles.add(f);
  for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) TOKEN_DEFS.set(m[1], m[2].trim());
}
/** 把 `var(--x)` 展开到最内层 —— 判断两个值是否**语义相同**（治 `var(--color-text-muted)` vs `var(--btn-ghost-fg)`） */
function resolveValue(v, depth = 0) {
  if (depth > 8) return v;
  return v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, name, fb) => {
    const d = TOKEN_DEFS.get(name);
    if (d === undefined) return fb !== undefined ? fb.trim() : `var(${name})`;
    return resolveValue(d, depth + 1);
  });
}

const resolveFrom = (f, from) =>
  from ? rel(path.resolve(path.dirname(path.join(ROOT, f)), from)) : f;

/** 某类**经 composes 继承**到的属性 → `{owner, value}`（传递闭包；先到先得） */
function inherited(f, cls, seen = new Set()) {
  const key = `${f}#${cls}`;
  const out = new Map();
  if (seen.has(key)) return out;
  seen.add(key);
  for (const c of index.get(f)?.get(cls)?.composes ?? []) {
    const tf = resolveFrom(f, c.from);
    for (const n of c.names) {
      const t = index.get(tf)?.get(n);
      if (!t) continue;
      for (const [p, v] of t.decls) out.set(p, { owner: n, file: tf, value: v });
      for (const [p, o] of inherited(tf, n, seen)) if (!out.has(p)) out.set(p, o);
    }
  }
  return out;
}

/** TSX/TS 里**真正用到**的类：`import <ident> from '*.module.css'` → `<ident>.<cls>`
 *  键 `${moduleFile}#${cls}` → 用它的那些 tsx/ts 文件 */
const used = new Map();
for (const abs of walk(SRC, (n) => n.endsWith('.tsx') || n.endsWith('.ts'))) {
  const src = fs.readFileSync(abs, 'utf8');
  const idents = [...src.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]*\.module\.css)['"]/g)].map((m) => ({
    ident: m[1],
    file: rel(path.resolve(path.dirname(abs), m[2])),
  }));
  for (const { ident, file } of idents) {
    for (const m of src.matchAll(new RegExp(`\\b${ident}\\.([A-Za-z_]\\w*)`, 'g'))) {
      const key = `${file}#${m[1]}`;
      used.set(key, new Set([...(used.get(key) ?? []), rel(abs)]));
    }
  }
}

const head = (title) => {
  if (!json) console.log(`\n🎨 ${title}`);
};
const list = (rows) => {
  const shown = rows.slice(0, TOP);
  for (const r of shown) console.log(`   ${r}`);
  if (rows.length > shown.length) console.log(`   … 还有 ${rows.length - shown.length} 条（--top N 调整）`);
  if (rows.length === 0) console.log('   （无）');
};

// ─────────────────────────── 命令 ───────────────────────────

/** 本地声明**覆盖**了 `composes` 来的真源同名属性 —— 真源入 `@layer base` ⇒ **本地胜、真的生效** */
function override(quiet) {
  const out = [];
  for (const [f, map] of index) {
    for (const [cls, rec] of map) {
      if (rec.composes.length === 0) continue;
      const inh = inherited(f, cls);
      for (const prop of rec.props) {
        const hit = inh.get(prop);
        if (!hit) continue;
        const ownerRec = index.get(hit.file)?.get(hit.owner);
        // 同文件 ⇒ 同层同源，靠**行序**（后者胜）；跨文件 ⇒ 真源在 `@layer`（分层 < 未分层）⇒ 本地胜；否则顺序未知
        const wins = hit.file === f
          ? ownerRec !== undefined && ownerRec.line < rec.line
          : (layeredFiles.has(hit.file) ? true : null);
        const localValue = rec.decls.get(prop);
        out.push({
          file: f,
          line: rec.line,
          cls,
          prop,
          base: hit.owner,
          baseFile: hit.file,
          localValue,
          baseValue: hit.value,
          identical: resolveValue(localValue) === resolveValue(hit.value),
          wins,
        });
      }
    }
  }
  const rows = applyChanged(out);
  if (quiet || json) return rows;
  const winsN = rows.filter((o) => o.wins === true).length;
  const loseN = rows.filter((o) => o.wins === false).length;
  const sameN = rows.filter((o) => o.identical).length;
  head(`override · 本地覆盖真源 · ${rows.length} 处（**生效 ${winsN}** · 被盖 ${loseN} · 值等效 ${sameN}）`);
  list(rows.map((o) => `${o.file}:${o.line}  .${o.cls} —— \`${o.prop}\`: 本地 \`${o.localValue}\` ${o.wins === true ? '＞' : o.wins === false ? '＜' : '？'} \`.${o.base}\` 的 \`${o.baseValue}\`${o.identical ? '  ※值等效（经 token 别名，本地那条可删）' : ''}`));
  return rows;
}

/** `composes` 引用的类 / 文件不存在 */
function missing(quiet) {
  const out = [];
  for (const [f, map] of index) {
    for (const [cls, rec] of map) {
      for (const c of rec.composes) {
        const tf = resolveFrom(f, c.from);
        const set = known.get(tf);
        if (!set) {
          out.push({ file: f, line: c.line, cls, target: tf, what: 'file' });
          continue;
        }
        for (const n of c.names) if (!set.has(n)) out.push({ file: f, line: c.line, cls, target: n, what: 'class', inFile: tf });
      }
    }
  }
  const rows = applyChanged(out);
  if (quiet || json) return rows;
  head(`missing · composes 引用不存在 · ${rows.length} 处`);
  list(rows.map((o) => (o.what === 'file' ? `${o.file}:${o.line}  .${o.cls} —— 目标文件不存在：${o.target}` : `${o.file}:${o.line}  .${o.cls} —— 目标类不存在：${o.target}（在 ${o.inFile}）`)));
  return rows;
}

/** 定义了但没人用的类 */
function dead(quiet) {
  const composed = new Set();
  for (const [f, map] of index) {
    for (const [, rec] of map) {
      for (const c of rec.composes) {
        const tf = resolveFrom(f, c.from);
        for (const n of c.names) composed.add(`${tf}#${n}`);
      }
    }
  }
  const out = [];
  for (const [f, map] of index) {
    for (const [cls, rec] of map) {
      const key = `${f}#${cls}`;
      if (used.has(key) || composed.has(key)) continue;
      out.push({ file: f, line: rec.line, cls, props: rec.props.size });
    }
  }
  const rows = applyChanged(out);
  if (quiet || json) return rows;
  head(`dead · 定义了但没人用（TSX 没引、也没被 composes）· ${rows.length} 处`);
  list(rows.map((o) => `${o.file}:${o.line}  .${o.cls}（${o.props} 条声明）`));
  return rows;
}

/** 跨模块同形类体 —— 收口候选 */
function dupe(quiet) {
  const min = optNum('min', 3);
  const groups = new Map();
  for (const [f, body] of bodies) {
    for (const [cls, decls] of body) {
      if (!decls) continue;
      const n = decls.split(';').length;
      if (n < min) continue;
      const list0 = groups.get(decls) ?? [];
      list0.push(`${f}#${cls}`);
      groups.set(decls, list0);
    }
  }
  const out = [...groups.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([decls, v]) => ({ decls, members: v, count: v.length }))
    .sort((a, b) => b.count - a.count);
  if (quiet || json) return out;
  head(`dupe · 同形类体（≥${min} 条声明、出现在 ≥2 处）· ${out.length} 组`);
  for (const g of out.slice(0, TOP)) {
    console.log(`   ×${g.count}  ${g.decls.replaceAll(';', ' · ').slice(0, 90)}`);
    for (const m of g.members) console.log(`         ${m}`);
  }
  if (out.length === 0) console.log('   （无）');
  return out;
}

/** CSS 变量对账（定义在 `.css`，引用可能在 `.css` / `.tsx` / `.ts` 的内联样式里） */
function vars(quiet) {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const defs = new Map();
  const uses = new Map();
  const note = (map, key, f) => map.set(key, [...new Set([...(map.get(key) ?? []), f])]);
  for (const abs of walk(SRC, (n) => n.endsWith('.css'))) {
    const f = rel(abs);
    const src = strip(fs.readFileSync(abs, 'utf8'));
    for (const m of src.matchAll(/(^|[\s{;])(--[\w-]+)\s*:/g)) note(defs, m[2], f);
    for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) note(uses, m[1], f);
  }
  for (const abs of walk(SRC, (n) => n.endsWith('.tsx') || n.endsWith('.ts'))) {
    const f = rel(abs);
    for (const m of strip(fs.readFileSync(abs, 'utf8')).matchAll(/var\(\s*(--[\w-]+)/g)) note(uses, m[1], f);
  }
  const unused = [...defs.keys()].filter((v) => !uses.has(v));
  const undef = [...uses.keys()].filter((v) => !defs.has(v));
  const out = { defined: defs.size, used: uses.size, unused, undefined: undef };
  if (quiet || json) return out;
  head(`vars · 定义 ${defs.size} · 引用 ${uses.size}`);
  console.log(`   定义了没人用（${unused.length}）：`);
  list(unused.map((v) => `${v}  （定义于 ${defs.get(v).join(', ')}）`));
  console.log(`   用了没定义（${undef.length}）：`);
  list(undef.map((v) => `${v}  （${uses.get(v).join(', ')}）`));
  return out;
}

/** 硬编码值（该走 token 的） */
function hard(quiet) {
  const out = [];
  for (const abs of walk(SRC, (n) => n.endsWith('.module.css'))) {
    const f = rel(abs);
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    lines.forEach((text, i) => {
      const t = text.replace(/\/\*.*?\*\//g, '');
      if (/#[0-9a-fA-F]{3,8}\b/.test(t)) out.push({ file: f, line: i + 1, kind: '色值', text: t.trim() });
      else if (/\b(rgba?|hsla?)\(/.test(t)) out.push({ file: f, line: i + 1, kind: '色值', text: t.trim() });
      else if (/z-index:\s*-?\d/.test(t)) out.push({ file: f, line: i + 1, kind: '裸 z-index', text: t.trim() });
      else if (/[^\w-]([2-9]|\d{2,})px\b/.test(t) && !t.includes('var(')) out.push({ file: f, line: i + 1, kind: '裸 px', text: t.trim() });
    });
  }
  const rows = applyChanged(out);
  if (quiet || json) return rows;
  head(`hard · 硬编码值（色值 / 裸 px / 裸 z-index）· ${rows.length} 处`);
  list(rows.map((o) => `[${o.kind}] ${o.file}:${o.line}  ${o.text.slice(0, 80)}`));
  return rows;
}

/** 总览 */
function stats() {
  const FAMILIES = {
    close: /close/i,
    head: /head/i,
    title: /title/i,
    empty: /empty/i,
    overlay: /overlay|backdrop|mask|scrim|layer|hitarea/i,
    panelCard: /panel|card|tile|dialog/i,
    menu: /menu/i,
    itemRow: /item|row|option|cell/i,
    btn: /btn|button/i,
    chipPill: /chip|pill|badge|tag|dot/i,
    field: /field|input|textarea|select/i,
  };
  let classes = 0;
  let edges = 0;
  const fam = Object.fromEntries(Object.keys(FAMILIES).map((k) => [k, 0]));
  for (const [, map] of index) {
    classes += map.size;
    for (const [cls, rec] of map) {
      edges += rec.composes.length;
      for (const [k, re] of Object.entries(FAMILIES)) if (re.test(cls)) fam[k] += 1;
    }
  }
  const out = {
    files: index.size,
    classes,
    composesEdges: edges,
    families: fam,
    dead: dead(true).length,
    override: override(true).length,
    missing: missing(true).length,
  };
  if (json) return out;
  head('stats · 总览');
  console.log(`   module.css 文件 ${out.files} · 类（单类规则）${out.classes} · composes 边 ${out.composesEdges}`);
  console.log(`   诊断：override（本地覆盖真源，现**生效**）${out.override} · missing（悬空引用）${out.missing} · dead（死类）${out.dead}`);
  console.log('   逐族类数（P6 口径：数类名）：');
  for (const [k, v] of Object.entries(fam).sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(10)} ${v}`);
  return out;
}

/** 定位一个类 */
function where() {
  if (!arg) return console.log('用法：npm run css -- where <类名>');
  const defs = byName.get(arg) ?? [];
  const composedBy = [];
  for (const [f, map] of index) {
    for (const [cls, rec] of map) {
      for (const c of rec.composes) {
        const tf = resolveFrom(f, c.from);
        if (tf === f && c.names.includes(arg)) composedBy.push(`${f}#${cls}`);
        else if (c.names.includes(arg)) composedBy.push(`${f}#${cls} → ${tf}`);
      }
    }
  }
  const usedIn = [...used].filter(([k]) => k.endsWith(`#${arg}`)).flatMap(([, v]) => [...v]);
  const out = { name: arg, definedIn: defs.map((d) => `${d.file}:${d.line}`), composedBy, usedIn };
  if (json) return out;
  head(`where · .${arg}`);
  console.log(`   定义（${defs.length}）：`);
  list(defs.map((d) => `${d.file}:${d.line}  ${d.props.size} 条声明${d.composes.length ? ` · composes ${d.composes.flatMap((c) => c.names).join(' ')}` : ''}`));
  console.log(`   被 composes（${composedBy.length}）：`);
  list(composedBy);
  console.log(`   TSX 里用到（${usedIn.length}）：`);
  list(usedIn);
  return out;
}

/** composes 链 */
function tree() {
  if (!arg) return console.log('用法：npm run css -- tree <类名>');
  const lines = [];
  const visit = (f, cls, depth, seen) => {
    const pad = '   ' + '  '.repeat(depth);
    const rec = index.get(f)?.get(cls);
    if (!rec) {
      return lines.push(
        known.get(f)?.has(cls)
          ? `${pad}.${cls}  [${f}]（只有变体规则，如 :hover —— 无基础声明）`
          : `${pad}${cls}  ← ⚠️ 不存在（在 ${f}）`,
      );
    }
    lines.push(`${pad}.${cls}  [${f}:${rec.line}]`);
    const key = `${f}#${cls}`;
    if (seen.has(key)) return lines.push(`${pad}  ↺ 环`);
    seen.add(key);
    for (const c of rec.composes) {
      const tf = resolveFrom(f, c.from);
      for (const n of c.names) visit(tf, n, depth + 1, new Set(seen));
    }
  };
  const hits = byName.get(arg) ?? [];
  if (hits.length === 0) return console.log(`找不到类 .${arg}`);
  for (const h of hits) visit(h.file, arg, 0, new Set());
  if (json) return lines;
  head(`tree · .${arg}`);
  for (const l of lines) console.log(l);
  return lines;
}

// ── `--changed`：只报「git 改动文件」里的发现（全局开关） ──
const changed = (() => {
  if (!argv.includes('--changed')) return null;
  try {
    const out = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
    const set = new Set();
    for (const l of out.split('\n')) {
      if (!l.trim()) continue;
      let p = l.slice(3).trim();
      if (p.includes(' -> ')) p = p.split(' -> ').pop();
      set.add(p.replace(/^"|"$/g, ''));
    }
    return set;
  } catch {
    console.error('⚠️ --changed：读 git status 失败，改为全量');
    return null;
  }
})();
const inChanged = (f) => !changed || changed.has(f);
const applyChanged = (rows) => (changed ? rows.filter((r) => inChanged(r.file)) : rows);

/** ★ 级联求解：一个类**最终生效**的声明（`composes` 闭包 + 顺序模型：真源/跨文件在后 ⇒ 覆盖本地） */
function effective() {
  if (!arg) return console.log('用法：npm run css -- effective <类名>');
  const hits = byName.get(arg) ?? [];
  if (hits.length === 0) return console.log(`找不到类 .${arg}`);
  const report = [];
  for (const h of hits) {
    const f0 = h.file;
    const seen = new Set();
    const contributors = [];
    const visit = (f, c) => {
      const key = `${f}#${c}`;
      if (seen.has(key)) return;
      seen.add(key);
      const rec = index.get(f)?.get(c);
      if (!rec) return;
      contributors.push({ file: f, cls: c, line: rec.line, decls: [...rec.decls] });
      for (const comp of rec.composes) {
        const tf = resolveFrom(f, comp.from);
        for (const n of comp.names) visit(tf, n);
      }
    };
    visit(f0, arg);
    // 顺序模型：本文件（rank0）在前、跨文件（rank1）在后；同 rank 按行号
    contributors.sort((a, b) => {
      const ra = a.file === f0 ? 0 : 1;
      const rb = b.file === f0 ? 0 : 1;
      return ra - rb || a.line - b.line || a.file.localeCompare(b.file);
    });
    const resolved = new Map();
    const shadowed = new Map();
    for (const c of contributors) {
      for (const [p, v] of c.decls) {
        if (resolved.has(p)) shadowed.set(p, [...(shadowed.get(p) ?? []), resolved.get(p)]);
        resolved.set(p, { value: v, from: c.cls, file: c.file });
      }
    }
    report.push({
      file: f0,
      line: h.line,
      resolved: [...resolved].map(([p, x]) => ({ prop: p, ...x })),
      shadowed: [...shadowed].map(([p, arr]) => ({ prop: p, lost: arr })),
    });
  }
  if (json) return report;
  head(`effective · .${arg} · 最终生效声明`);
  for (const r of report) {
    console.log(`   ── ${r.file}:${r.line}`);
    for (const d of r.resolved) {
      const shadow = r.shadowed.find((s) => s.prop === d.prop);
      const lost = shadow ? `   ⚠️ 盖掉 ${shadow.lost.map((l) => `${l.value}（.${l.from}）`).join(' · ')}` : '';
      console.log(`     ${d.prop}: ${d.value}   ← .${d.from}${d.file !== r.file ? `（${d.file}）` : ''}${lost}`);
    }
  }
  return report;
}

/** ★ 语义改名：一次改三处（CSS 定义 + 所有 `composes` 引用 + 所有 `styles.X`）。默认 dry-run，加 `--write` 落地 */
function rename() {
  const old = positional[1];
  const neu = positional[2];
  if (!old || !neu) return console.log('用法：npm run css -- rename <旧类名> <新类名> [--file <目标.module.css>] [--write]');
  const write = argv.includes('--write');
  const fileOpt = optStr('file');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let targets;
  if (fileOpt) targets = [rel(path.resolve(ROOT, fileOpt))];
  else targets = [...index.keys()].filter((f) => known.get(f)?.has(old));
  if (targets.length === 0) return console.log(`找不到类 .${old} 的定义`);
  if (!fileOpt && targets.length > 1) {
    console.log(`⚠️ .${old} 在 ${targets.length} 个文件里都存在 —— 用 --file 指定要改哪个：`);
    for (const t of targets) console.log(`   ${t}`);
    return;
  }
  const edits = new Map();
  const summary = [];
  // ① CSS：选择器（仅目标文件）+ composes 引用（全文件）
  for (const { abs, rel: f } of cssAbs) {
    const root = postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs });
    let nSel = 0;
    let nComp = 0;
    if (targets.includes(f)) {
      root.walkRules((rule) => {
        const nw = rule.selector.replace(new RegExp(`\\.${esc(old)}(?![-\\w])`, 'g'), `.${neu}`);
        if (nw !== rule.selector) {
          rule.selector = nw;
          nSel += 1;
        }
      });
    }
    root.walkDecls('composes', (d) => {
      const fm = /\s+from\s+['"]([^'"]+)['"]\s*$/.exec(d.value.trim());
      const tf = resolveFrom(f, fm ? fm[1] : null);
      if (!targets.includes(tf)) return;
      const names = (fm ? d.value.slice(0, fm.index) : d.value).trim().split(/\s+/).filter(Boolean);
      if (!names.includes(old)) return;
      d.value = `${names.map((x) => (x === old ? neu : x)).join(' ')}${fm ? d.value.slice(fm.index) : ''}`;
      nComp += 1;
    });
    if (nSel || nComp) {
      edits.set(f, root.toString());
      summary.push(`${f}   选择器 ×${nSel} · composes ×${nComp}`);
    }
  }
  // ② TSX/TS：styles.X / styles['X']
  for (const abs of walk(SRC, (n) => n.endsWith('.tsx') || n.endsWith('.ts'))) {
    const src = fs.readFileSync(abs, 'utf8');
    const f = rel(abs);
    const idents = [...src.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]*\.module\.css)['"]/g)]
      .filter((m) => targets.includes(rel(path.resolve(path.dirname(abs), m[2]))))
      .map((m) => m[1]);
    if (idents.length === 0) continue;
    let text = src;
    let n = 0;
    for (const id of idents) {
      text = text.replace(new RegExp(`\\b${id}\\.${esc(old)}(?![-\\w])`, 'g'), () => {
        n += 1;
        return `${id}.${neu}`;
      });
      text = text.replace(new RegExp(`\\b${id}\\[(['"])${esc(old)}\\1\\]`, 'g'), () => {
        n += 1;
        return `${id}['${neu}']`;
      });
    }
    if (n) {
      edits.set(f, text);
      summary.push(`${f}   styles.X ×${n}`);
    }
  }
  if (summary.length === 0) return console.log(`无改动：.${old} 未被引用（或引用都在目标之外）`);
  head(`rename · .${old} → .${neu}${write ? '（已写入）' : '（dry-run，加 --write 落地）'}`);
  for (const s of summary) console.log(`   ${s}`);
  if (write) for (const [f, text] of edits) fs.writeFileSync(path.join(ROOT, f), text);
  return { old, neu, write, summary };
}

/** ★ 近似重复（比 `dupe` 更实用）：比**本地声明**，差 ≤ `--diff`（默认 2）即候选 —— 收口的真候选 */
function near(quiet) {
  const min = optNum('min', 4);
  const maxDiff = optNum('diff', 1);
  const items = [];
  for (const [f, map] of index) {
    for (const [cls, rec] of map) {
      const sig = [...rec.decls].map(([p, v]) => `${p}:${v}`).sort();
      if (sig.length < min) continue;
      items.push({ file: f, cls, sig, set: new Set(sig) });
    }
  }
  const byLen = new Map();
  for (const it of items) byLen.set(it.sig.length, [...(byLen.get(it.sig.length) ?? []), it]);
  const out = [];
  const seen = new Set();
  for (const it of items) {
    for (let len = it.sig.length; len <= it.sig.length + maxDiff; len += 1) {
      for (const other of byLen.get(len) ?? []) {
        if (other === it) continue;
        const k1 = `${it.file}#${it.cls}|${other.file}#${other.cls}`;
        const k2 = `${other.file}#${other.cls}|${it.file}#${it.cls}`;
        if (seen.has(k1) || seen.has(k2)) continue;
        const onlyA = it.sig.filter((x) => !other.set.has(x));
        const onlyB = other.sig.filter((x) => !it.set.has(x));
        if (onlyA.length + onlyB.length > maxDiff) continue;
        seen.add(k1);
        out.push({ a: `${it.file}#${it.cls}`, b: `${other.file}#${other.cls}`, shared: it.sig.length - onlyA.length, onlyA, onlyB });
      }
    }
  }
  out.sort((x, y) => x.onlyA.length + x.onlyB.length - (y.onlyA.length + y.onlyB.length) || y.shared - x.shared);
  const rows = changed ? out.filter((o) => inChanged(o.a.split('#')[0]) || inChanged(o.b.split('#')[0])) : out;
  if (quiet || json) return rows;
  head(`near · 近似重复（差 ≤ ${maxDiff}、≥ ${min} 项）· ${rows.length} 对`);
  for (const o of rows.slice(0, TOP)) {
    console.log(`   ~${o.shared}  ${o.a}  ⇄  ${o.b}`);
    if (o.onlyA.length) console.log(`         A 独有：${o.onlyA.join(' · ')}`);
    if (o.onlyB.length) console.log(`         B 独有：${o.onlyB.join(' · ')}`);
  }
  if (rows.length === 0) console.log('   （无）');
  return rows;
}

/** ★ 同文件顺序问题：同一个类被**多条基础规则**定义且属性重叠 ⇒ 后者静默盖前者（「追加而非修改」的残留） */
function order(quiet) {
  const out = [];
  for (const [f, rules] of rulesByFile) {
    const baseByCls = new Map();
    for (const r of rules) {
      const parts = r.selector.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0 || !parts.every((p) => /^\.[A-Za-z_][\w-]*$/.test(p))) continue;
      for (const p of parts) {
        const cls = p.slice(1);
        baseByCls.set(cls, [...(baseByCls.get(cls) ?? []), { line: r.line, props: r.props }]);
      }
    }
    for (const [cls, rs] of baseByCls) {
      for (let i = 0; i < rs.length; i += 1) {
        for (let j = i + 1; j < rs.length; j += 1) {
          const overlap = [...new Set(rs[i].props.filter((p) => rs[j].props.includes(p)))];
          if (overlap.length) out.push({ file: f, line: rs[j].line, cls, kind: 'redef', detail: `基础规则重复（行 ${rs[i].line} / ${rs[j].line}），重叠属性 \`${overlap.join(' ')}\` 被后者静默覆盖` });
        }
      }
    }
  }
  const rows = applyChanged(out);
  if (quiet || json) return rows;
  head(`order · 同文件「基础规则重复 + 属性重叠」· ${rows.length} 处`);
  list(rows.map((o) => `${o.file}:${o.line}  .${o.cls}  ${o.detail}`));
  return rows;
}

/** 诊断清单（`check` 的全部子项） */
const DIAG = { override, missing, order, dead, dupe, near, vars, hard };

/** `check [名称]` —— 只读诊断。不填名称 = 跑全部；填则只跑一条 */
function check() {
  if (arg) {
    const fn = DIAG[arg];
    if (!fn) {
      console.error(`未知诊断：${arg}\n可用：${Object.keys(DIAG).join(' · ')}`);
      process.exit(2);
    }
    return fn();
  }
  if (json) return Object.fromEntries(Object.entries(DIAG).map(([k, fn]) => [k, fn(true)]));
  for (const fn of Object.values(DIAG)) fn();
  return undefined;
}

/** `show <类名>` —— 一个类的全貌：定义 · composes 链 · 消费者 · 最终生效声明 */
function show() {
  if (!arg) return console.log('用法：npm run css -- show <类名>');
  if (json) return { where: where(), tree: tree(), effective: effective() };
  where();
  tree();
  effective();
  return undefined;
}

// ─────────────────────────── export：导出真机 CSS ───────────────────────────

/** 真源 `ui/common/shared.module.css` —— **不加前缀**：它的类（`.btn` / `.field` …）是全仓唯一的族名 */
const SHARED_FILE = 'src/ui/common/shared.module.css';
/** 全局 CSS（非 module）：原样拼在产物最前，顺序即加载顺序 */
const GLOBAL_FILES = ['src/styles/reset.css', 'src/styles/tokens.css', 'src/styles/theme.css'];
/** ReactFlow 官方样式（画布容器 / 连线 / 控件的基础布局）—— 存在才拼 */
const XYFLOW_FILE = 'node_modules/@xyflow/react/dist/style.css';
const OUT_DIR = path.join(ROOT, 'docs/mockup/spec');

/**
 * 每个 module.css 的作用域前缀 —— **默认取文件名**，重名时加目录（`nodes/shared` → `nodesShared`）。
 * 真源例外（无前缀）：它就是要被全仓 composes 的共享族。
 */
const prefixes = (() => {
  const byBase = new Map();
  for (const { rel: f } of cssAbs) {
    const base = path.basename(f, '.module.css');
    byBase.set(base, [...(byBase.get(base) ?? []), f]);
  }
  const out = new Map();
  for (const { rel: f } of cssAbs) {
    if (f === SHARED_FILE) {
      out.set(f, '');
      continue;
    }
    const base = path.basename(f, '.module.css');
    const dir = path.basename(path.dirname(path.join(ROOT, f)));
    const dup = byBase.get(base).length > 1;
    out.set(f, dup ? `${dir}${base[0].toUpperCase()}${base.slice(1)}-` : `${base}-`);
  }
  return out;
})();

/** `.cls` → `.{pre}cls`；`:global(…)` 内部**保持原名**（它作用在 React 控制不到的 DOM 上） */
function scopeSelector(sel, pre) {
  if (!pre) return sel.replace(/:global\(([^)]*)\)/g, '$1');
  const holes = [];
  const masked = sel.replace(/:global\(([^)]*)\)/g, (_, inner) => {
    holes.push(inner);
    return ` ${holes.length - 1} `;
  });
  const scoped = masked.replace(/\.([A-Za-z_][\w-]*)/g, (_, c) => `.${pre}${c}`);
  return scoped.replace(/ (\d+) /g, (_, i) => holes[Number(i)]);
}

/** 去 Modules 化后的 class 名（供 HTML / 清单用） */
const scoped = (file, cls) => `${prefixes.get(file) ?? ''}${cls}`;

/** composes 目标 → 目标文件的 scoped 类名 */
function scopedComposes(file, rec) {
  return rec.composes.flatMap((c) => {
    const tf = resolveFrom(file, c.from);
    return c.names.map((n) => ({ name: scoped(tf, n), from: tf }));
  });
}

/** 真机 CSS（浏览器可直接消费）：全局 CSS 原样 + 每个 module.css 作用域化后拼接 */
function buildRealCss() {
  const chunks = [
    '/* ════════════════════════════════════════════════════════════════════════',
    '   ui-real.css —— 真机 CSS 全量导出（**脚本产物，勿手改**）',
    '',
    // ⚠️ 注释里**不许出现 `*/`**：`src/**/*.css` 中的 `*/` 会提前闭合本注释块，
    //    把紧随其后的 reset（`*, *::before, *::after{box-sizing:border-box}`）整段吞掉。
    '   生成：`npm run css -- export`（真源 = src 下全部 .css）',
    '',
    '   为什么它能直接给 mockup 用：',
    '     · token 全部原样搬（reset → tokens → theme），改 token 这里同步变；',
    '     · module.css 只做一件事：把 CSS Modules 的**作用域**换成可读前缀 `<文件>-`；',
    '     · 真源 `common/shared.module.css` **不加前缀**（它就是要被全仓 composes 的共享族）；',
    '     · `composes` 已删 —— 浏览器不认它；HTML 里把祖先类**一并写上**即等价于真机。',
    '       （真机 TSX 写 `styles.x`，产出 class 里也会带上 composes 来的祖先类）',
    '   ════════════════════════════════════════════════════════════════════════ */',
  ];
  for (const g of GLOBAL_FILES) {
    const abs = path.join(ROOT, g);
    chunks.push(`\n/* ── ${g}（全局 · 原样）── */\n${fs.readFileSync(abs, 'utf8').trimEnd()}`);
  }
  if (fs.existsSync(path.join(ROOT, XYFLOW_FILE))) {
    chunks.push(`\n/* ── ${XYFLOW_FILE}（ReactFlow 官方 · 原样）── */\n${fs.readFileSync(path.join(ROOT, XYFLOW_FILE), 'utf8').trimEnd()}`);
  }
  for (const { abs, rel: f } of cssAbs) {
    const pre = prefixes.get(f);
    const root = postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs });
    const kfNames = new Set();
    root.walkAtRules((at) => {
      if (at.name !== 'keyframes') return;
      kfNames.add(at.params.trim());
      at.params = `${pre}${at.params.trim()}`;
    });
    root.walkRules((r) => {
      r.selector = scopeSelector(r.selector, pre);
    });
    root.walkDecls((d) => {
      if (d.prop === 'composes') {
        d.remove();
        return;
      }
      if (kfNames.size && /^animation(-name)?$/.test(d.prop)) {
        for (const n of kfNames) d.value = d.value.replace(new RegExp(`\\b${n}\\b`, 'g'), `${pre}${n}`);
      }
    });
    chunks.push(`\n/* ── ${f} · 前缀 ${pre || '（无 · 真源）'} ── */\n${root.toString().trimEnd()}`);
  }
  return `${chunks.join('\n')}\n`;
}

/** 人读索引：按区分组，每文件一张类表（声明全文在 ui-real.css，这里只给坐标） */
function buildMd() {
  const groups = new Map();
  for (const { rel: f } of cssAbs) {
    const zone = f.split('/').slice(0, 3).join('/');
    groups.set(zone, [...(groups.get(zone) ?? []), f]);
  }
  const out = [
    '# 真机 CSS 索引（**脚本产物 · 勿手改**）',
    '',
    '> 生成：`npm run css -- export`　真源：`src/**/*.css`',
    '> **声明全文在 `ui-real.css`** —— 本文件只给坐标（哪个类 · 在哪行 · composes 谁 · 谁用它）。',
    '> 类名一律是**去 Modules 化后**的名字：`<文件>-<类>`（真源 `shared` 无前缀）。',
    '> 写 mockup HTML 时：`class` 里**把 composes 祖先类一并写上**（真机 TSX 产出的 class 也是这样）。',
    '',
    '## 全局 CSS（原样搬，非 module）',
    '',
    ...GLOBAL_FILES.map((g) => `- \`${g}\``),
    '',
  ];
  let clsN = 0;
  for (const [zone, files] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`## ${zone}`, '');
    for (const f of files.sort()) {
      const pre = prefixes.get(f);
      const map = index.get(f);
      const consumers = [
        ...new Set([...used].filter(([k]) => k.startsWith(`${f}#`)).flatMap(([, v]) => [...v])),
      ];
      out.push(
        `### \`${f}\` — 前缀 \`${pre || '（无 · 真源）'}\` · ${map.size} 类`,
        '',
        consumers.length ? `消费者：${consumers.map((c) => `\`${c}\``).join(' · ')}` : '消费者：**（无 —— 未被 TSX 引用）**',
        '',
        '| class | 行 | 声明 | composes | 用它的 TSX |',
        '|---|---|---|---|---|',
      );
      const variantOnly = [...known.get(f)].filter((c) => !map.has(c)).sort();
      for (const [cls, rec] of [...map].sort((a, b) => a[1].line - b[1].line)) {
        clsN += 1;
        const comp = scopedComposes(f, rec);
        const users = [...(used.get(`${f}#${cls}`) ?? [])];
        out.push(
          `| \`${scoped(f, cls)}\` | ${rec.line} | ${rec.props.size} | ${comp.length ? comp.map((c) => `\`${c.name}\``).join(' ') : '—'} | ${users.length ? users.map((u) => `\`${path.basename(u)}\``).join(' ') : '—'} |`,
        );
      }
      out.push('');
      if (variantOnly.length) {
        out.push(`只有变体规则（无基础声明）：${variantOnly.map((c) => `\`${scoped(f, c)}\``).join(' · ')}`, '');
      }
    }
  }
  out.unshift(`（共 ${clsN} 个基础类 · ${cssAbs.length} 个 module.css）\n`);
  return `${out.join('\n')}\n`;
}

/** 机器可读全量：给 mockup 之外还要复用这份数据的工具 / 后续界面用 */
function buildJson() {
  return {
    globalFiles: GLOBAL_FILES,
    files: cssAbs
      .map(({ rel: f }) => f)
      .sort()
      .map((f) => ({
        file: f,
        prefix: prefixes.get(f),
        consumers: [...new Set([...used].filter(([k]) => k.startsWith(`${f}#`)).flatMap(([, v]) => [...v]))].sort(),
        classes: [...index.get(f)]
          .sort((a, b) => a[1].line - b[1].line)
          .map(([cls, rec]) => ({
            name: cls,
            scoped: scoped(f, cls),
            line: rec.line,
            decls: Object.fromEntries(rec.decls),
            composes: scopedComposes(f, rec).map((c) => c.name),
            usedBy: [...(used.get(`${f}#${cls}`) ?? [])].sort(),
          })),
        variantOnly: [...known.get(f)].filter((c) => !index.get(f).has(c)).sort().map((c) => scoped(f, c)),
      })),
  };
}

/**
 * `export` —— 导出真机 CSS 三件套到 `docs/mockup/spec/`
 *
 * ★ 它架的是「mockup ↔ 真机」的桥：mockup 用的类名与 token **就是真机的**，
 *   所以设计定稿后，样式改动可以直接回套，不存在"重新翻译一遍"。
 */
function exportCmd() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const css = buildRealCss();
  // 自检：产物必须留住 reset 的全局 box-sizing
  // （曾因**头注释里出现 `*/`** 提前闭合注释块，把整段 reset 吞掉 ⇒ 全站 padding 变外加宽）
  let boxOk = false;
  postcss.parse(css, { from: 'ui-real.css' }).walkRules((r) => {
    if (r.selector === '*, *::before, *::after' || r.selector.replace(/\s/g, '') === '*,*::before,*::after') {
      r.walkDecls('box-sizing', () => { boxOk = true; });
    }
  });
  if (!boxOk) {
    console.error('❌ 产物自检失败：reset 的全局 `box-sizing` 丢失 —— 检查头注释里是否有 `*/`');
    process.exit(2);
  }
  const md = buildMd();
  const data = buildJson();
  fs.writeFileSync(path.join(OUT_DIR, 'ui-real.css'), css);
  fs.writeFileSync(path.join(OUT_DIR, 'UI-CSS.md'), md);
  fs.writeFileSync(path.join(OUT_DIR, 'ui-css.json'), `${JSON.stringify(data, null, 2)}\n`);
  const total = data.files.reduce((n, f) => n + f.classes.length, 0);
  if (json) return { out: rel(OUT_DIR), files: data.files.length, classes: total };
  head(`export · 真机 CSS → ${rel(OUT_DIR)}`);
  console.log(`   ui-real.css   ${css.split('\n').length} 行（全局 ${GLOBAL_FILES.length} + module ${cssAbs.length}）`);
  console.log(`   UI-CSS.md     ${md.split('\n').length} 行（${total} 个基础类）`);
  console.log(`   ui-css.json   ${data.files.length} 个文件`);
  console.log('   前缀规则：`<文件>-<类>`；真源 common/shared 无前缀。写 HTML 时把 composes 祖先类一并写上。');
  return undefined;
}

function help() {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
}

const CMDS = { check, show, rename, stats, export: exportCmd, help };
const fn = CMDS[cmd];
if (!fn) {
  console.error(`未知命令：${cmd}\n`);
  help();
  process.exit(2);
}
const result = fn();
if (json) console.log(JSON.stringify(result, null, 2));
