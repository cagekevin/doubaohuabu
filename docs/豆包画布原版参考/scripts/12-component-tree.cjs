#!/usr/bin/env node
/**
 * 12-component-tree.cjs —— 组件树重建（组件级依赖图，import 别名 + JSX 标签双信号）。
 *
 * 旧版 JSX 边为 0，根因有两处：
 *   1) 只从 shared.js 建 `_cmp_X` 别名表，而组件文件里的标签用的是**该文件自己的 import 别名**
 *      （`_Component42.jsx` 里 `<_cmp__Component37>`，shared.js 里并没有这个 import）。
 *   2) 组件文件从 `./shared.js` 具名导入的组件（`_Component39` / `NM` / `F3`…）在 shared.js 里
 *      只是**一层包装**（`_Component39 = Tb(_cmp_oM)`、`NM = g.memo(_cmp_ik)`），必须顺着一跳
 *      还原到真正的 `.jsx` 实现，否则解析不出来。
 *   3) 标签扫描没跳过字符串/模板串，shared.js 里的 HTML 模板会产出 `<iframes` 之类假标签。
 *
 * 本版：节点 = `.jsx` 文件 或 `shared#Name`（shared.js 里自定义的组件类/函数）；
 *       解析 = 本文件 import 别名 → shared.js 包装一跳 → shared.js 定义 → 文件名兜底。
 *
 * 输入：expanded_components/shared.js + *.jsx
 * 输出：outputs/12-组件树.json + outputs/12-组件树.md
 * 幂等、可重跑：node scripts/12-component-tree.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { blankComments, topLevelDefs, jsxTags, importsOf, definedNames, destructuredProps, isComponentDef, balancedEnd } = require('./_lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components');
const SHARED = path.join(DIR, 'shared.js');
const OUT_JSON = path.join(ROOT, 'outputs', '12-组件树.json');
const OUT_MD = path.join(ROOT, 'outputs', '12-组件树.md');
const SHARED_KEY = 'shared';

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// 组件标签（大写开头 / _cmp_ / _ComponentN）才算「待解析」，HTML 小写标签直接跳过
function isComponentTag(tag) {
  return /^_cmp_/.test(tag) || /^_Component/.test(tag) || /^[A-Z]/.test(tag);
}

function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.jsx')).sort();
  const names = files.map((f) => f.replace('.jsx', ''));
  const nameSet = new Set(names);

  const texts = {};
  for (const f of files) texts[f.replace('.jsx', '')] = blankComments(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const sharedText = blankComments(fs.readFileSync(SHARED, 'utf8'));

  // ---- 索引 1：shared.js 的 import 别名 + 顶层定义 ----
  const sharedImp = importsOf(sharedText);           // { jsx: Map<alias, file>, shared: Set }
  const sharedDefs = topLevelDefs(sharedText);
  const wrapperTarget = new Map();                   // shared.js 里 N = g.memo(_cmp_X) 这种一层包装
  for (const [n, d] of sharedDefs) {
    const ref = /_cmp_([\w$-]+)/.exec(d.head || '');
    if (ref && sharedImp.jsx.has('_cmp_' + ref[1])) wrapperTarget.set(n, sharedImp.jsx.get('_cmp_' + ref[1]));
    else if (ref && sharedImp.jsx.has(ref[1])) wrapperTarget.set(n, sharedImp.jsx.get(ref[1]));
  }

  // ---- 索引 2：每个文件自己的 import 别名 ----
  const fileAliases = { [SHARED_KEY]: { jsx: sharedImp.jsx, shared: new Set(sharedDefs.keys()) } };
  for (const n of names) fileAliases[n] = importsOf(texts[n]);

  // ---- 索引 3：本文件内部定义的局部组件（判「内部」而非「未解析」） ----
  const localDefs = { [SHARED_KEY]: definedNames(sharedText) };
  for (const n of names) localDefs[n] = definedNames(texts[n]);

  // ---- 索引 4：解构 props（`CustomComponent: _Component9`）→ 由父组件传入的组件 ----
  const propDefs = { [SHARED_KEY]: destructuredProps(sharedText) };
  for (const n of names) propDefs[n] = destructuredProps(texts[n]);
  const propComponents = new Map(); // tag → { prop, samples }

  // ---- 索引 5：React Flow 注册表（`nodeTypes={dO}` / `edgeTypes={fO}` → 对象字面量成员） ----
  function registryOf(text) {
    const map = new Map();
    for (const [n, d] of topLevelDefs(text)) {
      const b = (d.body || '').trim();
      if (!b.startsWith('{')) continue;
      const members = [];
      for (const m of b.matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)) members.push(m[2]);
      if (members.length) map.set(n, members);
    }
    return map;
  }
  const sharedRegistry = registryOf(sharedText);
  const fileRegistry = {};
  for (const n of names) fileRegistry[n] = registryOf(texts[n]);
  function registryLookup(fileKey, varName) {
    if (fileRegistry[fileKey] && fileRegistry[fileKey].has(varName)) return fileRegistry[fileKey].get(varName);
    if (sharedRegistry.has(varName)) return sharedRegistry.get(varName);
    return null;
  }

  // ---- 解析 ----
  function sharedResolve(name) {
    if (wrapperTarget.has(name)) return wrapperTarget.get(name);
    if (sharedDefs.has(name)) return SHARED_KEY + '#' + name;
    if (sharedImp.jsx.has('_cmp_' + name)) return sharedImp.jsx.get('_cmp_' + name);
    if (sharedImp.jsx.has(name)) return sharedImp.jsx.get(name);
    return null;
  }

  const unresolved = new Map(); // tag → { count, samples: [file] }

  // record=false 用于「试探性解析」（校验注册表成员），不把失败计入缺口
  function resolveTag(tag, fileKey, record) {
    const al = fileAliases[fileKey] || { jsx: new Map(), shared: new Set() };
    let node = null;
    if (al.jsx.has(tag)) node = al.jsx.get(tag);
    else if (al.shared.has(tag)) node = sharedResolve(tag);
    else if (nameSet.has(tag)) node = tag;
    else if (sharedDefs.has(tag)) node = sharedResolve(tag);
    else if (sharedImp.jsx.has(tag)) node = sharedImp.jsx.get(tag);
    if (node) return node === fileKey ? null : node;
    // 本文件内部定义的局部组件 / 成员表达式（`Rb.Provider`）/ 单字母局部变量 → 不算缺口
    if ((localDefs[fileKey] && localDefs[fileKey].has(tag)) || tag.includes('.')) return null;
    // 解构 props 传入的组件（`CustomComponent: _Component9`）→ 由父组件提供，单独归类
    if (propDefs[fileKey] && propDefs[fileKey].has(tag)) {
      const p = propComponents.get(tag) || { prop: propDefs[fileKey].get(tag), count: 0, samples: [] };
      p.count++;
      if (p.samples.length < 4 && !p.samples.includes(fileKey)) p.samples.push(fileKey);
      propComponents.set(tag, p);
      return null;
    }
    if (isComponentTag(tag) && record !== false) {
      const u = unresolved.get(tag) || { count: 0, samples: [] };
      u.count++;
      if (u.samples.length < 4 && !u.samples.includes(fileKey)) u.samples.push(fileKey);
      unresolved.set(tag, u);
    }
    return null;
  }

  // ---- 索引 6：**组件查找表**（`{ material: pL, text: EL, … }` / `{ input: _cmp_iI, … }`）----
  // 判定条件：对象字面量成员**全部**能解析成组件节点 → 它是「按类型取组件」的注册表，
  // 用到它的组件应当把表内组件都算作子节点（React Flow 的 nodeTypes/edgeTypes、handle 类型表等）。
  // 节点是否「真的是组件」：`.jsx` 文件算；`shared#Name` 交给 _lib.isComponentDef 按定义形态判
  const componentCache = new Map();
  function isComponentNode(node) {
    if (!node) return false;
    if (!node.startsWith(SHARED_KEY + '#')) return true;
    if (componentCache.has(node)) return componentCache.get(node);
    const ok = isComponentDef(sharedDefs.get(node.slice(SHARED_KEY.length + 1)));
    componentCache.set(node, ok);
    return ok;
  }

  function validatedRegistries(reg, fileKey) {
    const out = new Map();
    for (const [name, members] of reg) {
      if (!members.length) continue;
      const nodes = [];
      let componentMembers = 0;
      for (const m of members) {
        const node = resolveTag(m, fileKey, false);
        if (!node || !isComponentNode(node)) continue;
        componentMembers++;
        if (!nodes.includes(node)) nodes.push(node);
      }
      // 成员过半是组件才算「组件查找表」（避免把混了 helper 的对象当注册表）
      if (nodes.length && componentMembers * 2 >= members.length) out.set(name, nodes);
    }
    return out;
  }
  const sharedRegValid = validatedRegistries(sharedRegistry, SHARED_KEY);
  const fileRegValid = {};
  const registryVars = { [SHARED_KEY]: sharedRegValid };
  for (const n of names) {
    fileRegValid[n] = validatedRegistries(fileRegistry[n], n);
    const merged = new Map(sharedRegValid);
    for (const [k, v] of fileRegValid[n]) merged.set(k, v);
    registryVars[n] = merged;
  }

  // ---- 遍历：.jsx 文件 + shared.js 里被引用到的自定义组件（worklist 收敛） ----
  const deps = {};
  const viaImport = {};
  const viaJsx = {};
  const pending = new Set();

  function edgesOf(slice, fileKey, directAlias) {
    const direct = new Set();
    const jsx = new Set();
    for (const { tag } of jsxTags(slice)) {
      if (!isComponentTag(tag)) continue;
      const node = resolveTag(tag, fileKey);
      if (!node) continue;
      if (directAlias && directAlias.jsx.get(tag) === node) direct.add(node);
      else jsx.add(node);
    }
    // 组件查找表：本片段引用到的注册表（`nodeTypes={dO}` / 直接用 `hy`）→ 表内组件都算子节点
    const regs = registryVars[fileKey] || new Map();
    if (regs.size) {
      for (const m of slice.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)/g)) {
        const members = regs.get(m[1]);
        if (!members) continue;
        for (const node of members) if (node !== fileKey) jsx.add(node);
      }
    }
    return { direct, jsx };
  }

  for (const n of names) {
    const { direct, jsx } = edgesOf(texts[n], n, fileAliases[n]);
    const all = new Set([...direct, ...jsx]);
    deps[n] = [...all].sort();
    viaImport[n] = [...direct].sort();
    viaJsx[n] = [...jsx].sort();
    for (const d of all) if (d.startsWith(SHARED_KEY + '#')) pending.add(d);
  }

  const seenShared = new Set();
  while (pending.size) {
    const node = pending.values().next().value;
    pending.delete(node);
    if (seenShared.has(node)) continue;
    seenShared.add(node);
    const name = node.slice(SHARED_KEY.length + 1);
    const def = sharedDefs.get(name);
    if (!def) { deps[node] = []; continue; }
    const { direct, jsx } = edgesOf(sharedText.slice(def.start, def.end + 1), SHARED_KEY, null);
    const all = new Set([...direct, ...jsx]);
    deps[node] = [...all].sort();
    viaImport[node] = [...direct].sort();
    viaJsx[node] = [...jsx].sort();
    for (const d of all) if (d.startsWith(SHARED_KEY + '#')) pending.add(d);
  }

  // ---- 根：shared.js 里 __createRoot(...).render(<_Component49> … </_Component49>) ----
  const rootNode = SHARED_KEY + '#_Component49';
  const rootChildren = [];
  const renderIdx = sharedText.lastIndexOf('.render(');
  if (renderIdx >= 0) {
    const openIdx = sharedText.indexOf('(', renderIdx);
    const end = balancedEnd(sharedText, openIdx);
    const block = sharedText.slice(openIdx, end < 0 ? sharedText.length : end + 1);
    for (const { tag } of jsxTags(block)) {
      if (!isComponentTag(tag) || tag === '_Component49') continue;
      const node = resolveTag(tag, SHARED_KEY);
      if (node && node !== rootNode && !rootChildren.includes(node)) rootChildren.push(node);
    }
  }
  deps[rootNode] = rootChildren.slice();
  if (!viaImport[rootNode]) { viaImport[rootNode] = []; viaJsx[rootNode] = rootChildren.slice(); }
  for (const c of rootChildren) if (c.startsWith(SHARED_KEY + '#')) pending.add(c);
  while (pending.size) {
    const node = pending.values().next().value;
    pending.delete(node);
    if (seenShared.has(node)) continue;
    seenShared.add(node);
    const def = sharedDefs.get(node.slice(SHARED_KEY.length + 1));
    if (!def) { deps[node] = []; continue; }
    const { direct, jsx } = edgesOf(sharedText.slice(def.start, def.end + 1), SHARED_KEY, null);
    const all = new Set([...direct, ...jsx]);
    deps[node] = [...all].sort();
    viaImport[node] = [...direct].sort();
    viaJsx[node] = [...jsx].sort();
    for (const d of all) if (d.startsWith(SHARED_KEY + '#')) pending.add(d);
  }

  // ---- BFS 建树 ----
  const tree = [];
  const visited = new Set();
  function walk(node, depth) {
    if (!node || visited.has(node)) return;
    visited.add(node);
    const children = deps[node] || [];
    tree.push({ name: node, depth, children });
    for (const c of children) walk(c, depth + 1);
  }
  walk(rootNode, 0);

  const allNodes = new Set([...names, ...Object.keys(deps)]);
  const orphans = [...allNodes].filter((n) => !visited.has(n)).sort();

  // 孤儿性质：被当函数调用（helper 模块，不是组件） / 只有别名引用（未使用的导出）
  const everything = sharedText + '\n' + names.map((n) => texts[n]).join('\n');
  const orphanDetails = orphans.map((n) => {
    const base = n.includes('#') ? n.split('#')[1] : n;
    const asFn = new RegExp('_cmp_' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(').test(everything);
    return { name: n, kind: asFn ? 'helper-fn' : 'unused-export', note: asFn ? '被当普通函数调用（非组件）' : '仅被 import/export 引用，未在任何 JSX/注册表中出现' };
  });
  const unresolvedList = [...unresolved.entries()]
    .map(([tag, v]) => ({ tag, count: v.count, samples: v.samples }))
    .sort((a, b) => b.count - a.count);

  const sum = (o) => Object.values(o).reduce((s, d) => s + d.length, 0);
  const result = {
    generated_by: 'scripts/12-component-tree.cjs',
    inputs: [
      { path: 'inputs/pipeline_step/project/src/expanded_components/shared.js', sha256: sha256(SHARED) },
      ...files.map((f) => ({ path: `inputs/pipeline_step/project/src/expanded_components/${f}`, sha256: sha256(path.join(DIR, f)) })),
    ],
    stats: {
      components: names.length,
      aliasBindings: sharedImp.jsx.size + names.reduce((s, n) => s + fileAliases[n].jsx.size, 0),
      wrapperShortcuts: wrapperTarget.size,
      root: rootNode,
      nodes: allNodes.size,
      treeNodes: tree.length,
      orphans: orphans.length,
      importEdges: sum(viaImport),
      jsxEdges: sum(viaJsx),
      totalEdges: sum(deps),
      propComponents: propComponents.size,
      registryTables: sharedRegValid.size + names.reduce((s, n) => s + fileRegValid[n].size, 0),
      unresolvedTags: unresolvedList.length,
      orphanHelperFns: orphanDetails.filter((o) => o.kind === 'helper-fn').length,
      orphanUnusedExports: orphanDetails.filter((o) => o.kind === 'unused-export').length,
    },
    root: rootNode,
    rootChildren,
    tree,
    orphanComponents: orphans,
    orphanDetails,
    deps,
    viaImport,
    viaJsx,
    wrapperShortcuts: Object.fromEntries(wrapperTarget),
    propComponents: [...propComponents.entries()].map(([tag, v]) => ({ tag, prop: v.prop, count: v.count, samples: v.samples })),
    unresolvedTags: unresolvedList,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  const st = result.stats;
  console.log(`[12-component-tree] 组件 ${st.components} / 节点 ${st.nodes} / 根 ${st.root} / 树节点 ${st.treeNodes} / 孤儿 ${st.orphans}`);
  console.log(`[12-component-tree] 依赖边：import 别名 ${st.importEdges} + JSX 标签/注册表 ${st.jsxEdges} = ${st.totalEdges}（包装一跳 ${st.wrapperShortcuts} / 组件查找表 ${st.registryTables}）`);
  console.log(`[12-component-tree] 孤儿性质：helper 模块 ${st.orphanHelperFns} + 未使用导出 ${st.orphanUnusedExports}`);
  console.log(`[12-component-tree] 未解析组件标签 ${st.unresolvedTags} 种${unresolvedList.length ? '：' + unresolvedList.slice(0, 5).map((u) => u.tag + '×' + u.count).join(' ') : ''}`);
  console.log(`[12-component-tree] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 12 · 组件树（机器生成 · 组件级依赖图）');
  L.push('');
  L.push('> 由 `scripts/12-component-tree.cjs` 重建，勿手改；重跑 `node scripts/12-component-tree.cjs`。');
  L.push(`> 节点 = \`.jsx\` 文件 或 \`shared#Name\`（shared.js 自定义组件）；组件 ${r.stats.components} / 节点 ${r.stats.nodes}。`);
  L.push(`> 依赖边 import 别名 ${r.stats.importEdges} + JSX 标签 ${r.stats.jsxEdges} = ${r.stats.totalEdges}。`);
  L.push('');
  L.push('## 组件树（BFS，从应用根）');
  L.push('');
  for (const n of r.tree) {
    const indent = '  '.repeat(n.depth);
    L.push(`${indent}- \`${n.name}\`${n.children.length ? ' → ' + n.children.map((x) => '`' + x + '`').join(' ') : ''}`);
  }
  L.push('');
  L.push('## shared.js 包装一跳（局部名 → 真实 .jsx 实现）');
  L.push('');
  L.push('| shared.js 局部名 | 真实实现 |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(r.wrapperShortcuts)) L.push(`| \`${k}\` | \`${v}\` |`);
  L.push('');
  if (r.propComponents.length) {
    L.push(`## props 传入的组件（${r.propComponents.length} 个，由父组件提供）`);
    L.push('');
    L.push('| 标签 | 来自 prop | 出现次数 | 出现在 |');
    L.push('|---|---|---|---|');
    for (const p of r.propComponents) L.push(`| \`${p.tag}\` | \`${p.prop}\` | ${p.count} | ${p.samples.map((x) => '`' + x + '`').join(' ')} |`);
    L.push('');
  }
  if (r.orphanDetails && r.orphanDetails.length) {
    L.push(`## 孤儿节点（未挂上树，${r.orphanDetails.length} 个）`);
    L.push('');
    L.push('> 「孤儿」= 从应用根出发**静态不可达**。已逐条判定性质，不是解析失败。');
    L.push('');
    L.push('| 节点 | 性质 | 说明 |');
    L.push('|---|---|---|');
    for (const o of r.orphanDetails) L.push(`| \`${o.name}\` | ${o.kind === 'helper-fn' ? 'helper 模块' : '未使用导出'} | ${o.note} |`);
    L.push('');
  }
  if (r.unresolvedTags.length) {
    L.push(`## 未解析的组件标签（${r.unresolvedTags.length} 种）`);
    L.push('');
    L.push('> 这些标签在本文件/本节点作用域内找不到定义，多为 `props` 传入的组件或 `shared.js` 未导出的局部组件。');
    L.push('');
    L.push('| 标签 | 出现次数 | 出现在 |');
    L.push('|---|---|---|');
    for (const u of r.unresolvedTags) L.push(`| \`${u.tag}\` | ${u.count} | ${u.samples.map((x) => '`' + x + '`').join(' ')} |`);
    L.push('');
  }
  return L.join('\n');
}

main();
