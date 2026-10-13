#!/usr/bin/env node
/**
 * 99-build-spec.cjs —— 收敛层：读全部 facts + RULES，产出模块化 BUILD-SPEC 目录。
 *
 * 形态：outputs/BUILD-SPEC/ 下按模块分文件（00-总览 + 01..09 模块），
 *   总览给「模块清单 + 依赖顺序 + 分级」，AI 做哪个模块读哪个文件，不一次读全部。
 *   大模块（04-store / 05-组件）按子目录 + 分片：00-索引 先读，再按需读分片。
 *
 * 分级不再手写：由实测覆盖度决定（函数体是否齐全 / 按钮是否解析到 store）。
 * BUILD-SPEC = buildSpec(facts, RULES)
 * 重跑：node scripts/99-build-spec.cjs（依赖 01/02/03/04/05/06/07/08/09/11/12/14/18 先跑）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'outputs');
const SPEC = path.join(OUT, 'BUILD-SPEC');

const STORE_CHUNK = 40;      // 04-store 每个分片放多少个 action 函数体
const SHARED_CHUNK_BYTES = 80 * 1024;   // 10-shared工具 每个分片的源码字节预算

// ==================== RULES（架构判断，头脑 AI 固化）====================
const RULES = {
  app: { name: 'doubao-canvas-clone', title: '豆包画布本地复刻' },
  stack: 'electron + typescript(严格) + react + zustand + @xyflow/react；测试 node:test',
  scope: {
    keep: ['画布编辑', '本地/项目存储', '文件导入导出', '剪贴板/拖放', '生成 pipeline（5 provider + 引擎）', '图片/视频外置存储', 'IPC 基础'],
    drop: ['Lovart 采集', 'dola 采集', '指纹伪装', '浏览器自动化（Firefox/Chrome CDP）', '授权/license', '账号 cookie', '屏幕录制'],
    dropReason: '非核心 + 触及采集/授权边界',
  },
  conventions: {
    files: 'kebab-case.ts', components: 'PascalCase.tsx', types: 'PascalCase',
    functions: 'camelCase', constants: 'UPPER_SNAKE',
    ipc: '沿用原通道名（kebab-case）', exports: '命名导出',
  },
  structure: [
    'src/shared/types.ts（数据模型）',
    'src/main/index.ts（入口 + 注册 IPC + 装配 provider/engine）',
    'src/main/ipc/*.ts（各 IPC handler，按功能域拆）',
    'src/main/providers/*.ts（5 个 ProviderAdapter）',
    'src/main/engine/*.ts（任务引擎）',
    'src/renderer/store/canvas.ts（画布 store）',
    'src/renderer/components/*.tsx（画布组件）',
  ],
  // ⚠ 上面的 structure 是「目标形态」，不是让你另起工程。
  // 落到既有工程时按下面的映射表走（右侧子路径按本仓约定填）。
  targetRepo: {
    layout: 'electron/ + src/{core,adapters,state,ui}',
    note: '本 spec 是**行为真源**（契约 / 函数体 / 解析链），工程结构只是参考形态。既有工程已有代码与测试，按映射把 spec 的「行为」搬进既有目录，不要新建 src/main + src/renderer。',
  },
  mapping: [
    { spec: '01-数据模型', role: '领域类型 / 数据模型', to: 'src/core（类型层）' },
    { spec: '02-IPC契约', role: '通道名 + 入参出参 + 渲染侧调用封装', to: 'electron/（preload 暴露）+ src/adapters（渲染侧封装）' },
    { spec: '03-主进程', role: '主进程 handler / 模块实现', to: 'electron/' },
    { spec: '04-store', role: '画布状态 + action（zustand）', to: 'src/state' },
    { spec: '05-组件', role: 'UI 组件（含源码原文，可直接照写）', to: 'src/ui' },
    { spec: '06-数据流', role: '接线核对表（不改文件）', to: '横切：用于校对 state/action/IPC 连线' },
    { spec: '07-生成pipeline', role: '生成适配（provider / 引擎 / 参数表单）', to: 'src/adapters（若跑在主进程则 electron/）' },
    { spec: '08-样式', role: 'className → 样式', to: 'src/ui' },
    { spec: '09-缺口清单', role: '缺口 + 复刻策略', to: '不落文件' },
  ],
};

// ==================== 源侧事实（脚本自校验：pattern 必须命中才输出）====================
// 这些是「跨文件、靠人核出来」的关键单点事实，写成可校验的 locator，避免文档里出现
// 凭印象写错的归属（例如把「隐形桥」当成发送上游）。
const SOURCE_FACTS = [
  {
    file: 'shared.js',
    pattern: 'const r = IL();',
    text: (line) => `**发送入口唯一**：\`Bu\`（\`shared.js:${line}\`）是 \`IL()\` 的唯一调用者 → 全仓唯一发送入口。`,
  },
  {
    file: 'shared.js',
    pattern: 'function L0(e)',
    text: (line) => `发送通道是全局槽（\`shared.js:${line}\` \`L0(e){ kS = e }\` 注册、\`IL()\` 读取），不是 React context。`,
  },
  {
    file: 'shared.js',
    pattern: 'L0(async o =>',
    text: (line) => `**\`shared#_Component44\` 是「隐形桥」**（\`shared.js:${line}\`）：它把组件侧的 \`sendPayload\` 注册成发送通道，并把 \`setPullResultFn\` 挂到 store —— 它只做**注册**，不是发送上游。`,
  },
  {
    file: '_Component43.jsx',
    pattern: 'sendPayload: async (',
    text: (line) => `真正实现发送的是组件侧 \`_Component43\` 的 \`useImperativeHandle\` 暴露的 \`sendPayload\`（\`_Component43.jsx:${line}\`）。`,
  },
];

// 「常见任务 → 定义名」直达表（10-shared工具 索引用）。
// `must` 是 locator：必须在该定义的原文里命中，否则这条不输出 —— 防止表格与源码漂移。
const TASK_HINTS = [
  { task: '附件指纹：枚举参考图并算形态特征', name: 'cD', must: '深查询：穿透 Shadow DOM' },
  { task: '附件计数：按「位置近邻」找输入框上方的参考图', name: '_a', must: '位置近邻' },
  { task: '图序比对：期望图序 vs 实际图序 → 判定（不判定则返回 unknown）', name: 'uD', must: "'DATA$'" },
  { task: '去重键：dataUrl 前缀 + label', name: 'vD', must: 'substring(0, 80)' },
  { task: 'FNV-1a 哈希：长串 → 稳定短键', name: '_0', must: '2166136261' },
  { task: '聚焦输入框', name: 'Ap', must: 'input.focus(); return true' },
  { task: '读输入框状态（长度 / 是否聚焦）', name: 'Ql', must: 'focused: document.activeElement === input' },
  { task: '输入框命中检测（排除我方自触发）', name: 'dD', must: '避免自触发' },
];

// ==================== facts 新鲜度（防止「陈旧 JSON 生成过期 spec」）====================
// 每个 facts JSON 都记录了它的输入 path + sha256（含 `outputs/*.json` 这种链式依赖）。
// 99 只读 JSON、不刷新它 —— 所以必须重算输入 sha256 对账，否则 spec 会悄悄过期而自检全绿。
const FACTS_SCRIPTS = {
  '02-生成pipeline.json': 'scripts/02-providers.cjs',
  '03-store.json': 'scripts/03-store.cjs',
  '04-组件规格.json': 'scripts/04-components.cjs',
  '05-IPC契约.json': 'scripts/01-ipc-contract.cjs',
  '05-画布模型.json': 'scripts/05-canvas-model.cjs',
  '06-主进程模块.json': 'scripts/06-main-modules.cjs',
  '07-技能包.json': 'scripts/07-skillpack.cjs',
  '08-语义图.json': 'scripts/08-semantic-graph.cjs',
  '09-数据流.json': 'scripts/09-relations.cjs',
  '11-主进程函数体.json': 'scripts/11-main-bodies.cjs',
  '12-组件树.json': 'scripts/12-component-tree.cjs',
  '14-交互链路.json': 'scripts/14-component-flows.cjs',
  '18-样式.json': 'scripts/18-styles.cjs',
  '19-shared工具.json': 'scripts/19-shared-utils.cjs',
};

function verifyFactsFreshness() {
  const stale = [];
  const unverifiable = [];
  const fresh = [];
  for (const [file, script] of Object.entries(FACTS_SCRIPTS)) {
    const p = path.join(OUT, file);
    if (!fs.existsSync(p)) { stale.push({ file, script, why: 'facts 不存在' }); continue; }
    let j;
    try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { stale.push({ file, script, why: 'JSON 解析失败' }); continue; }
    const ins = (j.inputs || []).filter((x) => x && x.path && x.sha256);
    if (!ins.length) { unverifiable.push(`${file}（未记录 inputs）`); continue; }
    let bad = null;
    let missing = 0;
    for (const it of ins) {
      const abs = path.join(ROOT, it.path);
      if (!fs.existsSync(abs)) { missing++; continue; }
      if (sha256(abs) !== it.sha256) { bad = it.path; break; }
    }
    if (bad) stale.push({ file, script, why: `输入已变更：${bad}` });
    else if (missing === ins.length) unverifiable.push(`${file}（输入文件都不在本机，无法校验）`);
    else fresh.push(file);
  }
  return { stale, unverifiable, fresh };
}

// 把「本 spec 由哪些 facts 生成」的指纹写进 spec，收件方可据此判断 spec 与 facts 是否同步
function writeFingerprint(facts) {
  const L = [];
  L.push('# 00 · 事实指纹（本 spec 的来源）');
  L.push('');
  L.push('> 本目录的每个文件都由 `scripts/99-build-spec.cjs` 从下列 facts 派生。');
  L.push('> **收件方自检方法**：把下面每行的 `sha256` 与你自己 `outputs/` 下同名文件的 sha256 比对；');
  L.push('> 只要有一行不一致，就说明「spec 与 facts 不同步」—— 先跑一遍前置脚本再读 spec。');
  L.push('');
  L.push('| facts 文件 | sha256 | 生成脚本 |');
  L.push('|---|---|---|');
  for (const [file, script] of Object.entries(FACTS_SCRIPTS)) {
    const p = path.join(OUT, file);
    if (!fs.existsSync(p)) { L.push(`| \`${file}\` | —（不存在） | \`${script}\` |`); continue; }
    L.push(`| \`${file}\` | \`${sha256(p)}\` | \`${script}\` |`);
  }
  L.push('');
  L.push('## facts 的输入指纹（链式：facts 的输入也校验）');
  L.push('');
  L.push('| facts 文件 | 输入 | 输入 sha256 |');
  L.push('|---|---|---|');
  for (const file of Object.keys(FACTS_SCRIPTS)) {
    const p = path.join(OUT, file);
    if (!fs.existsSync(p)) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { continue; }
    for (const it of (j.inputs || []).filter((x) => x && x.path && x.sha256)) {
      L.push(`| \`${file}\` | \`${it.path}\` | \`${it.sha256}\` |`);
    }
  }
  L.push('');
  const ff = facts.__freshness;
  L.push('## 本次生成的校验结果');
  L.push('');
  L.push(`- 新鲜（输入 sha256 与磁盘一致）：${ff.fresh.length} 个`);
  L.push(`- 无法校验：${ff.unverifiable.length ? ff.unverifiable.join('、') : '无'}`);
  L.push(`- 过期：${ff.stale.length ? ff.stale.map((s) => `${s.file}（${s.why}）`).join('、') : '无'}`);
  L.push('');
  return L.join('\n');
}

function verifySourceFacts() {
  const { blankComments } = require('./_lib.cjs');
  const dir = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components');
  const cache = {};
  const out = [];
  for (const f of SOURCE_FACTS) {
    if (!cache[f.file]) cache[f.file] = blankComments(fs.readFileSync(path.join(dir, f.file), 'utf8'));
    const t = cache[f.file];
    const idx = t.indexOf(f.pattern);
    if (idx < 0) continue;                       // 命中不了就不输出，避免写错
    out.push({ file: f.file, line: t.slice(0, idx).split('\n').length, claim: f.text(t.slice(0, idx).split('\n').length) });
  }
  return out;
}

// ==================== 工具 ====================

function load(name) {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, name), 'utf8')); }
  catch (_) { return null; }
}
function readMd(name) {
  try { return fs.readFileSync(path.join(OUT, name), 'utf8'); }
  catch (_) { return null; }
}
function write(name, content) {
  const p = path.join(SPEC, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function pad(i) { return String(i).padStart(2, '0'); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
function sha256(p) { return require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function countFiles(dir) {
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) n += countFiles(p);
    else n++;
  }
  return n;
}

// ==================== 分级（实测决定，不手写）====================

function tiers(facts) {
  const s = facts.store && facts.store.stats;
  const c = facts.components && facts.components.stats;
  const storeTier = s && s.actionsWithBody === s.actionCount && s.actionCount > 0 ? 'L1' : 'L2';
  const unresolved = c && c.buttonsByKind ? (c.buttonsByKind.unresolved || 0) : 0;
  const compTier = c && c.totalButtons && pct(unresolved, c.totalButtons) <= 5 ? 'L1' : 'L2';
  return { storeTier, compTier, store: s, comp: c };
}

function modules(facts) {
  const t = tiers(facts);
  const s = t.store || {};
  const c = t.comp || {};
  return [
    { id: '01-数据模型', file: '01-数据模型.md', tier: 'L1', deps: [] },
    { id: '02-IPC契约', file: '02-IPC契约.md', tier: 'L1', deps: ['01-数据模型'] },
    { id: '03-主进程', file: '03-主进程/00-索引.md', tier: 'L1', deps: ['02-IPC契约'] },
    {
      id: '04-store', file: '04-store/00-索引.md', tier: t.storeTier, deps: ['01-数据模型'],
      note: `state ${s.stateCount || 0} / action ${s.actionCount || 0}；函数体已内联 ${s.actionsWithBody || 0}/${s.actionCount || 0}（set/get 规范化）`,
    },
    {
      id: '05-组件', file: '05-组件/00-索引.md', tier: t.compTier, deps: ['04-store', '02-IPC契约', '10-shared工具'],
      note: `组件 ${c.total || 0}；按钮 ${c.totalButtons || 0}，已解析到 store/IPC ${c.buttonsResolved || 0}，未解析 ${(c.buttonsByKind && c.buttonsByKind.unresolved) || 0}；**一组件一文件（规格 + 按钮解析链 + 源码原文）**，附组件树`,
    },
    {
      id: '10-shared工具', file: '10-shared工具/00-索引.md', tier: 'L1', deps: [],
      note: `shared.js 顶层定义**全量原文内联**：${(facts.sharedUtils && facts.sharedUtils.stats.defs) || 0} 个（页面脚本 ${(facts.sharedUtils && facts.sharedUtils.stats.byCategory['page-script']) || 0} 个 / 纯 helper ${(facts.sharedUtils && facts.sharedUtils.stats.byCategory['helper-fn']) || 0} 个）；组件侧用到的 helper 与页面探测脚本都在这里`,
    },
    { id: '06-数据流', file: '06-数据流.md', tier: 'L1', deps: ['03-主进程', '04-store', '05-组件'] },
    { id: '07-生成pipeline', file: '07-生成pipeline.md', tier: 'L1', deps: ['03-主进程'] },
    { id: '08-样式', file: '08-样式.md', tier: 'L1', deps: ['05-组件'] },
    { id: '09-缺口清单', file: '09-缺口清单.md', tier: '-', deps: [] },
  ];
}

// ==================== 00 总览 ====================

function renderOverview(facts, fileCount) {
  const t = tiers(facts);
  const mods = modules(facts);
  const L = [];
  L.push('# BUILD-SPEC · ' + RULES.app.title);
  L.push('');
  L.push('> **移交说明**：本目录是一份自包含的「AI 复刻蓝图」。把整个目录交给下一个 AI，按下面步骤即可复刻。');
  L.push(`> 本目录共 **${fileCount || countFiles(SPEC)} 个文件**（不含 \`outputs/*.json\`）；来源指纹见 \`00-事实指纹.md\`（可据此判断 spec 与 facts 是否同步）。`);
  L.push('');
  L.push('## 你的任务');
  L.push('');
  L.push(`复刻一个可运行的 Electron 桌面应用（\`${RULES.app.name}\`），技术栈 ${RULES.stack}。`);
  L.push('输入 = 本目录的模块文件；输出 = 一个可构建、可运行的工程。');
  L.push('');
  L.push('## 怎么开始（3 步）');
  L.push('');
  L.push('1. 读本文件（00-总览）：拿到范围、工程结构、模块清单与复刻顺序。');
  L.push('2. 按「复刻顺序」逐个读模块文件（01→10），**做哪个读哪个**，不要一次读全部。大模块先读 `00-索引.md`，再按需读分片。');
  L.push('3. 每个模块产出的代码，落到「工程结构」里对应路径。');
  L.push('');
  L.push('## 覆盖边界（先读这条，避免误判）');
  L.push('');
  L.push('> ⚠ 「125 个组件文件」**不等于** shared.js 已覆盖 —— 那是 116 个 `*.jsx` + 9 个「组件树里出现的 shared.js 组件」。');
  L.push('');
  L.push('| 源 | 内容 | 落在哪个模块 |');
  L.push('|---|---|---|');
  L.push(`| \`*.jsx\` 组件（116 个） | 规格 + 按钮解析链 + **源码原文** | \`05-组件/组件/<名>.md\` |`);
  L.push(`| \`shared.js\` 里的**组件**（组件树引用到的 9 个） | 定义原文 | \`05-组件/组件/shared__*.md\` |`);
  L.push(`| \`shared.js\` 的**其余全部顶层定义**（${(facts.sharedUtils && facts.sharedUtils.stats.defs) || 0} 个：页面脚本常量 ${(facts.sharedUtils && facts.sharedUtils.stats.byCategory['page-script']) || 0} / 纯 helper ${(facts.sharedUtils && facts.sharedUtils.stats.byCategory['helper-fn']) || 0} / 组件 / 类 / 常量） | **原文全量内联** | \`10-shared工具/\`（兜底全集，可 grep \`99-定义索引.md\`） |`);
  L.push('| store（165 action） | 函数体原文 + helper 原文 | `04-store/` |');
  L.push('| 主进程（28 文件） | 源码全文 | `03-主进程/` |');
  L.push('');
  L.push('> 一句话：**组件看 05，shared.js 的任何东西看 10**。');
  L.push('');
  L.push('## 覆盖度（脚本实测，非估计）');
  L.push('');
  L.push('| 项 | 实测 |');
  L.push('|---|---|');
  if (t.store) {
    L.push(`| store action 函数体 | ${t.store.actionsWithBody}/${t.store.actionCount} 内联（set/get 已规范化），共 ${t.store.totalBodyLines} 行 |`);
    L.push(`| store 引用到的 helper | ${t.store.helperCount} 个，原文一并内联 |`);
  }
  if (t.comp) {
    const bk = t.comp.buttonsByKind || {};
    L.push(`| 组件按钮事件解析 | ${t.comp.buttonsResolved}/${t.comp.totalButtons} 追到 store action / IPC；未解析 ${bk.unresolved || 0} |`);
    L.push(`| 按钮分类 | ${Object.entries(bk).map(([k, v]) => `${k} ${v}`).join(' · ')} |`);
    L.push(`| 组件局部绑定 | ${t.comp.totalStates} 个 useState、${t.comp.totalLocals} 个局部函数已索引 |`);
  }
  const flows = facts.flows && facts.flows.stats;
  if (flows) L.push(`| 组件交互链路 | ${flows.flows} 条（触发器→面板→操作），面板内操作 ${flows.panelItems}，其中 ${flows.panelItemsWithAction} 解析到 store action |`);
  const ct = facts.componentTree && facts.componentTree.stats;
  if (ct) L.push(`| 组件树（谁渲染谁） | 节点 ${ct.nodes}（树内 ${ct.treeNodes}）；依赖边 ${ct.totalEdges}；未解析标签 ${ct.unresolvedTags}；静态不可达 ${ct.orphans}（helper ${ct.orphanHelperFns} / 未使用导出 ${ct.orphanUnusedExports}） |`);
  const rel = facts.relations && facts.relations.stats;
  if (rel) L.push(`| store 字段数据流 | ${rel.fields}/${rel.stateTotal} 有数据流（含组件 \`L.setState\` 直接写的 ${rel.componentWrittenFields} 个），无数据流 ${rel.fieldsWithoutFlow} 个已单列 |`);
  L.push(`| 组件源码 | ${t.comp ? t.comp.total : 0} 个组件**源码原文全部内联**（05-组件/组件/<名>.md），做组件不用回 inputs |`);
  const su = facts.sharedUtils && facts.sharedUtils.stats;
  if (su) L.push(`| shared.js 工具 | **${su.defs} 个顶层定义原文全量内联**（10-shared工具/，${su.totalLines} 行 / ${(su.totalBytes / 1024).toFixed(0)}KB）；其中页面脚本 ${su.byCategory['page-script'] || 0} 个（${(su.pageScriptBytes / 1024).toFixed(0)}KB） |`);
  L.push('');
  L.push('## 移交物（本目录，自包含）');
  L.push('');
  L.push('- `00-总览.md`（本文件）：范围 / 工程结构 / 模块清单 / 复刻顺序 / 验收');
  L.push('- `00-事实指纹.md`：本 spec 的来源 facts sha256（**收件方据此判断 spec 与 facts 是否同步**）');
  for (const m of mods) L.push(`- \`${m.file}\`：${m.id}（${m.tier}）`);
  L.push('');
  L.push('## 范围');
  L.push('');
  L.push(`- 保留：${RULES.scope.keep.map((x) => '`' + x + '`').join(' ')}`);
  L.push(`- 舍弃：${RULES.scope.drop.map((x) => '`' + x + '`').join(' ')}（${RULES.scope.dropReason}）`);
  L.push('');
  L.push('## 命名 + 工程结构');
  L.push('');
  L.push('- 命名：' + Object.entries(RULES.conventions).map(([k, v]) => `${k}=${v}`).join('，'));
  L.push('- 技术栈：' + RULES.stack);
  L.push('- 工程结构（**目标形态 / 参考**，不是让你另起工程）：');
  for (const s of RULES.structure) L.push(`  - ${s}`);
  L.push('');
  L.push('## 落到既有工程（重要）');
  L.push('');
  L.push(`> ${RULES.targetRepo.note}`);
  L.push(`> 既有工程形态：\`${RULES.targetRepo.layout}\``);
  L.push('');
  L.push('| spec 模块 | 内容角色 | 落到既有工程 |');
  L.push('|---|---|---|');
  for (const m of RULES.mapping) L.push(`| \`${m.spec}\` | ${m.role} | ${m.to} |`);
  L.push('');
  L.push('## 模块清单 + 复刻顺序');
  L.push('');
  L.push('| 顺序 | 模块 | 文件 | 分级 | 依赖 | 说明 |');
  L.push('|---|---|---|---|---|---|');
  mods.forEach((m, i) => {
    L.push(`| ${i + 1} | ${m.id} | \`${m.file}\` | ${m.tier} | ${m.deps.join('、') || '—'} | ${m.note || ''} |`);
  });
  L.push('');
  L.push('## 复刻方式');
  L.push('');
  L.push('1. 按顺序逐个模块做，做哪个模块读哪个文件，不要一次读全部。');
  L.push('2. L1 = 事实齐全，照写；L2 = 文件内已标注剩余缺口，按行为规格重写。');
  L.push('3. 改任何一处，只看对应模块文件，不跳文件、不补判断。');
  L.push('');
  L.push('## 验收标准');
  L.push('');
  L.push('- 工程 `npm install && npm run build` 通过（TS 严格模式无错）。');
  L.push('- L1 模块（01 数据模型 / 02 IPC契约 / 03 主进程 / 07 生成pipeline / 04 store / 05 组件）：照写，产物与 spec 一一对应。');
  L.push('- store：按 04-store 的**函数体原文**逐条翻译（`set`/`get` 已是 store 形参，minified 短名按语义改名即可）。');
  L.push('- 组件：按 05-组件的**按钮解析链**接线（`action:xxx` = 调 store action，`ipc:xxx` = 调 window.api，`setState:xxx` = 本地 state）。');
  L.push('- 09-缺口清单的项：按标注的复刻策略实现。');
  return L.join('\n');
}

// ==================== 01 数据模型 ====================

function renderDataModel(facts) {
  const L = [];
  L.push('# 01 · 数据模型（src/shared/types.ts）');
  L.push('');
  L.push('> 来源：05 画布模型 + 03 store。照写成本文件，全部字段含推断类型。');
  L.push('');
  L.push('## 节点类型');
  L.push('');
  const canvas = facts.canvas;
  if (canvas) {
    L.push('判别联合 `CanvasNode`：`type` 字段 + 每种类型的 `data` 字段。');
    L.push('');
    for (const s of canvas.nodeDataSchema || []) {
      L.push(`### ${s.type}`);
      L.push('');
      L.push('```ts');
      L.push(`interface ${cap(s.type)}NodeData {`);
      for (const f of s.fields) L.push(`  ${f.name}: ${f.type};  // ${f.initial}`);
      L.push('}');
      L.push('```');
      L.push('');
    }
  }
  L.push('## store state');
  L.push('');
  const store = facts.store;
  if (store) {
    L.push('```ts');
    L.push('interface CanvasState {');
    for (const s of store.states) L.push(`  ${s.name}: ${s.type};  // 初始 ${s.initial}`);
    L.push('}');
    L.push('```');
  }
  return L.join('\n');
}

// ==================== 02 IPC 契约 ====================

function renderIpc(facts) {
  const L = [];
  L.push('# 02 · IPC 契约');
  L.push('');
  L.push('> 来源：01。`apiName` 是 `window.api` 方法名（camelCase），`channel` 是通道名（kebab-case）。');
  L.push('');
  const ipc = facts.ipc;
  if (ipc && ipc.channels) {
    L.push('| channel | apiName | kind | handler |');
    L.push('|---|---|---|---|');
    for (const c of ipc.channels) {
      const h = (c.handlers || []).map((x) => `${x.file}:${x.line}`).join(', ');
      L.push(`| \`${c.channel}\` | \`${c.apiName}\` | ${c.kind} | ${h || (c.pushes && c.pushes.length ? c.pushes.map((p) => `${p.file}:${p.line} 推送`).join(', ') : '—')} |`);
    }
  }
  return L.join('\n');
}

// ==================== 03 主进程 ====================

function writeMain(facts) {
  const dir = path.join(SPEC, '03-主进程');
  fs.mkdirSync(dir, { recursive: true });
  const oldMain = path.join(SPEC, '03-主进程.md');
  if (fs.existsSync(oldMain)) fs.rmSync(oldMain);
  const body = facts.mainBodies;
  const idx = [];
  idx.push('# 03 · 主进程（索引）');
  idx.push('');
  idx.push('> 来源：未混淆源码**全文内联（零遗漏）** + REA 函数索引。每个源文件一个子文件，做哪个读哪个。照写逐行翻译成 TS。');
  idx.push('');
  idx.push('| 源文件 | 行数 | handler | 函数 | 子文件 |');
  idx.push('|---|---|---|---|---|');
  for (const m of body.modules) {
    const flat = m.file.replace(/\//g, '__');
    const sub = flat + '.md';
    const L = [];
    L.push(`# 03 · ${m.file}`);
    L.push('');
    L.push('> 完整源码原文（零遗漏）+ REA 函数索引。照写逐行翻译成 TS。');
    L.push('');
    if (m.handlers.length) {
      L.push('## IPC handler 索引');
      L.push('');
      for (const h of m.handlers) L.push(`- \`${h.channel}\`（${h.method}，行 ${h.line}）`);
      L.push('');
    }
    if (m.funcs.length) {
      L.push('## 函数索引');
      L.push('');
      for (const f of m.funcs) L.push(`- \`${f.name}(${f.params})\`（行 ${f.line}）`);
      L.push('');
    }
    L.push('## 完整源码');
    L.push('');
    L.push('```js');
    L.push(m.raw || '');
    L.push('```');
    fs.writeFileSync(path.join(dir, sub), L.join('\n'), 'utf8');
    idx.push(`| \`${m.file}\` | ${m.lines} | ${m.handlers.length} | ${m.funcs.length} | \`03-主进程/${sub}\` |`);
  }
  fs.writeFileSync(path.join(dir, '00-索引.md'), idx.join('\n'), 'utf8');
}

// ==================== 04 store ====================

function writeStore(facts) {
  const store = facts.store;
  if (!store) return;
  const dir = path.join(SPEC, '04-store');
  fs.mkdirSync(dir, { recursive: true });
  const old = path.join(SPEC, '04-store.md');
  if (fs.existsSync(old)) fs.rmSync(old);

  const parts = chunk(store.actions, STORE_CHUNK);
  const files = [];

  // 00-索引
  const L = [];
  L.push('# 04 · store（zustand）· 索引');
  L.push('');
  L.push('> 来源：03。**action 函数体已内联原文**（`set`/`get` 已按 store 形参规范化），');
  L.push('> 只保留 minified 的局部短名（`n`/`r`/`l`），按语义改名即可，**不需要推断行为**。');
  L.push(`> state ${store.stats.stateCount} / action ${store.stats.actionCount} / helper ${store.stats.helperCount}。`);
  L.push('');
  L.push('## 分片');
  L.push('');
  L.push('| 分片 | 内容 |');
  L.push('|---|---|');
  for (let i = 0; i < parts.length; i++) {
    const f = `${pad(i + 1)}-函数体-${parts[i][0].name}…${parts[i][parts[i].length - 1].name}.md`;
    files.push(f);
    L.push(`| \`04-store/${f}\` | action ${i * STORE_CHUNK + 1}–${i * STORE_CHUNK + parts[i].length}（${parts[i].length} 个函数体） |`);
  }
  if (store.helpers.length) {
    files.push('99-helper.md');
    L.push(`| \`04-store/99-helper.md\` | action 引用到的 ${store.helpers.length} 个 helper 原文 |`);
  }
  L.push('');
  L.push('## state 字段（' + store.stats.stateCount + '）');
  L.push('');
  L.push('| 字段 | 类型 | 初始值 |');
  L.push('|---|---|---|');
  for (const s of store.states) L.push(`| \`${s.name}\` | \`${s.type}\` | \`${s.initial}\` |`);
  L.push('');
  L.push('## action 索引（' + store.stats.actionCount + '）');
  L.push('');
  L.push('| action | 参数 | 写入 state | 读取 state | 调 action | 调 IPC | 调 helper | 函数体所在 |');
  L.push('|---|---|---|---|---|---|---|---|');
  store.actions.forEach((a, i) => {
    const partFile = `${pad(Math.floor(i / STORE_CHUNK) + 1)}-函数体-${parts[Math.floor(i / STORE_CHUNK)][0].name}…${parts[Math.floor(i / STORE_CHUNK)][parts[Math.floor(i / STORE_CHUNK)].length - 1].name}.md`;
    L.push(`| \`${a.name}\` | ${a.params ? '`' + a.params.slice(0, 40) + '`' : '—'} | ${a.writes.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.readsState.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.callsActions.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.ipc.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.calls.map((x) => '`' + x + '`').join(' ') || '—'} | \`${partFile}\` |`);
  });
  L.push('');
  write('04-store/00-索引.md', L.join('\n'));

  // 函数体分片
  parts.forEach((part, i) => {
    const M = [];
    M.push(`# 04 · store 函数体（第 ${i + 1} 片）`);
    M.push('');
    M.push('> 照写翻译。`set` = zustand 的 set，`get` = zustand 的 get；局部短名按语义改名。');
    M.push('');
    for (const a of part) {
      M.push(`### ${a.name}（源行 ${a.line}）`);
      M.push('');
      const meta = [];
      if (a.params) meta.push(`参数 \`${a.params}\``);
      if (a.writes.length) meta.push(`写入 ${a.writes.map((x) => '`' + x + '`').join(' ')}`);
      if (a.callsActions.length) meta.push(`调 action ${a.callsActions.map((x) => '`' + x + '`').join(' ')}`);
      if (a.ipc.length) meta.push(`调 IPC ${a.ipc.map((x) => '`' + x + '`').join(' ')}`);
      if (a.calls.length) meta.push(`调 helper ${a.calls.map((x) => '`' + x + '`').join(' ')}`);
      if (a.literals.uiText.length) meta.push(`UI 文案 ${a.literals.uiText.map((x) => '「' + x + '」').join(' ')}`);
      if (a.literals.numbers.length) meta.push(`常量 ${a.literals.numbers.map((x) => '`' + x + '`').join(' ')}`);
      if (!a.renamed) meta.push('⚠ 含同名遮蔽，未做 set/get 规范化');
      M.push(meta.join('；'));
      M.push('');
      M.push('```js');
      M.push(a.body);
      M.push('```');
      M.push('');
    }
    write(`04-store/${files[i]}`, M.join('\n'));
  });

  // helper
  if (store.helpers.length) {
    const H = [];
    H.push('# 04 · store helper 原文');
    H.push('');
    H.push('> action 直接引用的顶层定义（去 minify 后的语义逻辑都在这里）。照写翻译。');
    H.push('');
    for (const h of store.helpers) {
      H.push(`### ${h.name}（源行 ${h.line}，${h.kind}）`);
      H.push('');
      if (h.calls.length) { H.push(`- 调用其它 helper：${h.calls.map((x) => '`' + x + '`').join(' ')}`); H.push(''); }
      H.push('```js');
      H.push(h.body);
      H.push('```');
      H.push('');
    }
    write('04-store/99-helper.md', H.join('\n'));
  }
}

// ==================== 10 shared.js 工具（页面脚本 + 纯 helper）====================

function writeSharedUtils(facts) {
  const su = facts.sharedUtils;
  if (!su) return;
  fs.mkdirSync(path.join(SPEC, '10-shared工具'), { recursive: true });

  // 分片：按源码字节预算切（保持源行顺序）
  const shards = [];
  let cur = [];
  let curBytes = 0;
  for (const d of su.defs) {
    if (cur.length && curBytes + d.bytes > SHARED_CHUNK_BYTES) { shards.push(cur); cur = []; curBytes = 0; }
    cur.push(d);
    curBytes += d.bytes;
  }
  if (cur.length) shards.push(cur);

  const shardOf = new Map();
  const shardFiles = [];
  shards.forEach((part, i) => {
    const a = part[0].line;
    const b = part[part.length - 1].line + part[part.length - 1].lines - 1;
    const f = `${pad(i + 1)}-源行${a}-${b}.md`;
    shardFiles.push({ file: f, from: a, to: b, count: part.length, bytes: part.reduce((s, d) => s + d.bytes, 0) });
    for (const d of part) shardOf.set(d.line + ':' + d.name, f);
  });

  // 分片正文
  shards.forEach((part, i) => {
    const M = [];
    M.push(`# 10 · shared.js 工具（第 ${i + 1} 片 · 源行 ${shardFiles[i].from}-${shardFiles[i].to}）`);
    M.push('');
    M.push('> shared.js 顶层定义**原文**（零遗漏）。页面脚本常量、纯 helper、组件、类全在内。');
    M.push('> 照写翻译；`### <名字>（源行 N）` 可直接回源定位。');
    M.push('');
    for (const d of part) {
      M.push(`### ${d.name}（源行 ${d.line}，${d.kind}，${d.category}，${d.lines} 行）`);
      M.push('');
      M.push('```js');
      M.push(d.src.replace(/\s+$/, ''));
      M.push('```');
      M.push('');
    }
    write(`10-shared工具/${shardFiles[i].file}`, M.join('\n'));
  });

  // 全量定义索引（可 grep 定位）
  const IDX = [];
  IDX.push('# 10 · shared.js 定义索引（全量）');
  IDX.push('');
  IDX.push(`> ${su.stats.defs} 个顶层定义（去重名 ${su.stats.uniqueNames}）→ 分片文件 + 源行。`);
  IDX.push('');
  IDX.push('| 名字 | 类别 | 源行 | 行数 | 字节 | 分片 |');
  IDX.push('|---|---|---|---|---|---|');
  for (const d of su.defs) {
    IDX.push(`| \`${d.name}\` | ${d.category} | ${d.line} | ${d.lines} | ${d.bytes} | \`${shardOf.get(d.line + ':' + d.name)}\` |`);
  }
  write('10-shared工具/99-定义索引.md', IDX.join('\n'));

  // 00-索引
  const L = [];
  L.push('# 10 · shared.js 工具（页面脚本 + 纯 helper）· 索引');
  L.push('');
  L.push('> 来源：19（`scripts/19-shared-utils.cjs` 采集 shared.js **全部**顶层定义原文）。');
  L.push(`> 定义 ${su.stats.defs} 个（去重名 ${su.stats.uniqueNames} / 重名 ${su.stats.duplicateNames}），共 ${su.stats.totalLines} 行 / ${(su.stats.totalBytes / 1024).toFixed(0)}KB，**原文全部内联**。`);
  L.push('');
  L.push('## 为什么有这个模块');
  L.push('');
  L.push('> 组件（`05-组件`）与 store（`04-store`）之外，`shared.js` 里还住着两类东西，行为细节都在里面：');
  L.push('> ① **页面脚本常量**：值是模板串的顶层 const（注入 webview 执行的探测脚本）；');
  L.push('> ② **跨组件纯 helper**（图序比对、去重键、FNV 哈希、几何窗口判定等）。');
  L.push('> 写交互细节时只能照抄原文，不能靠签名推断 —— 所以这里**不做筛选，全量内联**。');
  L.push('');
  L.push('## 分类统计（脚本按定义形态判，不靠名字）');
  L.push('');
  L.push('| 类别 | 数量 | 说明 |');
  L.push('|---|---|---|');
  const CAT_LABEL = {
    'page-script': '页面脚本常量（注入页面的脚本，交互细节所在地）',
    'helper-fn': '纯 helper 函数 / 函数声明',
    component: '组件（memo/forwardRef/Provider/hooks/JSX）',
    class: '类定义',
    'string-const': '长字符串常量',
    other: '其余顶层常量（对象/数组/表达式值）',
  };
  for (const [k, v] of Object.entries(su.stats.byCategory).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${v} | ${CAT_LABEL[k] || ''} |`);
  L.push('');

  // 任务直达表：每条 `must` 必须在该定义原文里命中（locator 校验），否则不输出
  const byName = new Map();
  for (const d of su.defs) if (!byName.has(d.name)) byName.set(d.name, d);
  const taskRows = [];
  const taskDropped = [];
  for (const t of TASK_HINTS) {
    const d = byName.get(t.name);
    if (!d) { taskDropped.push(`${t.name}(未找到)`); continue; }
    if (!d.src.includes(t.must)) { taskDropped.push(`${t.name}(locator 未命中)`); continue; }
    taskRows.push({ ...t, def: d });
  }
  if (taskRows.length) {
    L.push('## 常见任务 → 定义（locator 校验：`must` 在原文里命中才列出）');
    L.push('');
    L.push('| 你要做的事 | 定义名 | 类别 | 源行 | 行数 | 分片 |');
    L.push('|---|---|---|---|---|---|');
    for (const t of taskRows) {
      L.push(`| ${t.task} | \`${t.name}\` | ${t.def.category} | ${t.def.line} | ${t.def.lines} | \`${shardOf.get(t.def.line + ':' + t.def.name)}\` |`);
    }
    L.push('');
    if (taskDropped.length) L.push(`> 未列出的任务映射（locator 未命中，已丢弃）：${taskDropped.join('、')}`);
    L.push('');
  }

  const ps = su.defs.filter((d) => d.category === 'page-script');
  if (ps.length) {
    L.push(`## 页面脚本常量（${ps.length} 个，共 ${(su.stats.pageScriptBytes / 1024).toFixed(0)}KB）`);
    L.push('');
    L.push('> 「线索」= 脚本自身的第一条中文注释（脚本作者写的说明），用来快速判断这个脚本干嘛。');
    L.push('');
    L.push('| 名字 | 源行 | 行数 | 字节 | 线索 | 分片 |');
    L.push('|---|---|---|---|---|---|');
    for (const d of ps) L.push(`| \`${d.name}\` | ${d.line} | ${d.lines} | ${d.bytes} | ${(d.hint || '—').replace(/\|/g, '\\|')} | \`${shardOf.get(d.line + ':' + d.name)}\` |`);
    L.push('');
  }

  L.push('## 分片');
  L.push('');
  L.push('| 分片 | 源行区间 | 定义数 | 字节 |');
  L.push('|---|---|---|---|');
  for (const s of shardFiles) L.push(`| \`10-shared工具/${s.file}\` | ${s.from}-${s.to} | ${s.count} | ${(s.bytes / 1024).toFixed(0)}KB |`);
  L.push(`| \`10-shared工具/99-定义索引.md\` | — | ${su.stats.defs}（全量索引表，可 grep 定位） | — |`);
  L.push('');
  L.push('## 与 05-组件的口径区别');
  L.push('');
  L.push('> `05-组件/组件/shared__*.md` 只收**组件树里出现的** shared.js 组件（被 JSX 标签或组件查找表引用到）；');
  L.push('> shared.js 的**其余全部定义**（含组件、脚本、helper）都在本模块分片里。');
  L.push('> 换句话说：**本模块是 shared.js 的兜底全集**，任何在 05-组件 找不到的东西都在这里。');
  L.push('');
  write('10-shared工具/00-索引.md', L.join('\n'));

  return { shards: shardFiles.length, defs: su.stats.defs, pageScripts: ps.length };
}

// ==================== 05 组件 ====================

// 单个组件的规格段（props / hooks / 绑定 / 按钮解析链），索引与组件文件共用
function componentSpecLines(c) {
  const M = [];
  if (c.props) M.push(`- props: \`{ ${c.props} }\``);
  M.push(`- hooks: useState×${c.hooks.useState} useRef×${c.hooks.useRef} useMemo×${c.hooks.useMemo} useEffect×${c.hooks.useEffect}`);
  if (c.imports.length) M.push(`- 子组件: ${c.imports.map((x) => '`' + x + '`').join(' ')}`);
  if (c.layout.length) M.push(`- 布局: ${c.layout.map((x) => '`' + x + '`').join(' ')}`);
  if (c.store.length) M.push(`- store: ${c.store.map((x) => '`' + x + '`').join(' ')}`);
  if (c.setStateFields && c.setStateFields.length) M.push(`- 直接写 store（\`L.setState\`）: ${c.setStateFields.map((x) => '`' + x + '`').join(' ')}`);
  if (c.ipc.length) M.push(`- IPC: ${c.ipc.map((x) => '`' + x + '`').join(' ')}`);
  if (c.labels && c.labels.length) M.push(`- 文案: ${c.labels.slice(0, 15).map((s) => '「' + s + '」').join(' ')}`);
  if (c.inputs && c.inputs.length) M.push(`- 输入: ${c.inputs.map((x) => '`' + x.tag + (x.placeholder ? ':' + x.placeholder : '') + '`').join(' ')}`);
  const sel = (c.bindings && c.bindings.selectors) || [];
  if (sel.length) M.push(`- 绑定（局部变量→store）: ${sel.map((s) => `\`${s.var}\`→\`${s.field}\``).join(' ')}`);
  if (c.bindings && c.bindings.states.length) M.push(`- useState: ${c.bindings.states.map((s) => `\`${s.state}\`/\`${s.setter}\``).join(' ')}`);
  if (c.bindings && c.bindings.locals.length) M.push(`- 局部函数: ${c.bindings.locals.map((s) => `\`${s.name}\`(${s.kind})`).join(' ')}`);
  if (c.buttons.length) {
    M.push('');
    M.push('| 行 | 图标 | 文案 | title | 事件 | 来源 | 解析链 |');
    M.push('|---|---|---|---|---|---|---|');
    for (const b of c.buttons) {
      const chain = b.effects.chain.length
        ? b.effects.chain.map((x) => '`' + x.replace(/:/, ' → ') + '`').join(' ')
        : `（${b.kind}）`;
      M.push(`| ${b.line} | ${b.icon ? '`' + b.icon + '`' : '—'} | ${b.label || '—'} | ${b.title || ''} | \`${b.event}\` | ${b.via} | ${chain} |`);
    }
  }
  return M;
}

// 组件源码（.jsx 文件原文 + shared.js 内定义组件的原文），用于「零遗漏内联」
function loadComponentSources() {
  const dir = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components');
  const { blankComments, topLevelDefs } = require('./_lib.cjs');
  const files = {};
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsx')) files[f.replace('.jsx', '')] = fs.readFileSync(path.join(dir, f), 'utf8');
  const sharedRaw = fs.readFileSync(path.join(dir, 'shared.js'), 'utf8');
  const defs = topLevelDefs(blankComments(sharedRaw));
  const sharedDefs = new Map();
  for (const [n, d] of defs) sharedDefs.set(n, { line: d.line, kind: d.kind, src: sharedRaw.slice(d.start, d.end + 1) });
  return { files, sharedRaw, sharedDefs };
}

function writeComponents(facts) {
  const comps = facts.components;
  if (!comps) return;
  fs.mkdirSync(path.join(SPEC, '05-组件', '组件'), { recursive: true });
  const src = loadComponentSources();
  const ct = facts.componentTree;
  const flowMd = readMd('14-交互链路.md');

  // ---- 组件文件（一个组件一个文件：规格 + 源码原文，自包含）----
  const componentFiles = [];
  for (const c of comps.components) {
    const raw = src.files[c.name];
    if (raw == null) continue;
    const f = `组件/${c.name}.md`;
    componentFiles.push({ name: c.name, file: f, lines: c.lines, buttons: c.buttons.length, store: c.store.length, ipc: c.ipc.length, children: (c.imports || []).length, kind: 'jsx' });
    const M = [];
    M.push(`# 05 · 组件 \`${c.name}\``);
    M.push('');
    M.push(`> 来源：\`${c.name}.jsx\` **原文内联（零遗漏）** + 04 组件规格。本文件自包含：先看规格与按钮解析链，再按下面的源码原文照写。`);
    M.push('');
    M.push(`## 规格（${c.lines} 行）`);
    M.push('');
    M.push(...componentSpecLines(c));
    M.push('');
    M.push(`## 源码原文（${c.name}.jsx）`);
    M.push('');
    M.push('```jsx');
    M.push(raw.replace(/\s+$/, ''));
    M.push('```');
    write(`05-组件/${f}`, M.join('\n'));
  }

  // ---- shared.js 内定义的组件（shared#Name）：单独出文件 ----
  const sharedNodes = new Set();
  if (ct) {
    if (ct.root && ct.root.startsWith('shared#')) sharedNodes.add(ct.root);
    for (const k of Object.keys(ct.deps || {})) if (k.startsWith('shared#')) sharedNodes.add(k);
  }
  const sharedFiles = [];
  for (const node of [...sharedNodes].sort()) {
    const name = node.slice('shared#'.length);
    const d = src.sharedDefs.get(name);
    if (!d) continue;
    const f = `组件/shared__${name}.md`;
    sharedFiles.push({ name: node, file: f, line: d.line, kind: d.kind });
    const M = [];
    M.push(`# 05 · 组件 \`${node}\``);
    M.push('');
    M.push(`> 该组件**定义在 \`shared.js\` 内部**（不是独立 \`.jsx\` 文件），源行 ${d.line}，${d.kind}。照写。`);
    M.push('');
    M.push(`## 源码原文（shared.js 行 ${d.line}）`);
    M.push('');
    M.push('```js');
    M.push(d.src.replace(/\s+$/, ''));
    M.push('```');
    write(`05-组件/${f}`, M.join('\n'));
  }

  // ---- 00-索引 ----
  const L = [];
  L.push('# 05 · 渲染层组件 · 索引');
  L.push('');
  L.push('> 来源：04 组件规格 + 12 组件树 + 14 交互链路 + **组件源码原文**。');
  L.push(`> 组件 ${comps.stats.total}；按钮 ${comps.stats.totalButtons}，已解析到 store/IPC ${comps.stats.buttonsResolved}。`);
  L.push('> **每个组件一个文件**（\`05-组件/组件/<名>.md\`）：规格 + 按钮解析链 + **该组件源码原文（零遗漏）**。');
  L.push('> 做哪个组件读哪个文件，不用回原始 inputs。');
  L.push('> 按钮解析链：`action:xxx` = 调 store action，`ipc:xxx` = 调 `window.api`，`setState:xxx` = 本地 state，');
  L.push('> `xxx(…) → …` = 经局部函数（组件内 useCallback/箭头函数）中转。');
  L.push('');
  const skeleton = readMd('13-页面骨架.md');
  if (skeleton) {
    L.push('## 页面骨架（应用根 · 人工补足）');
    L.push('');
    L.push(skeleton);
    L.push('');
  }

  if (ct) {
    L.push('## 组件树（谁渲染谁，脚本重建）');
    L.push('');
    L.push(`> 根 \`${ct.root}\`；节点 ${ct.stats.nodes}；依赖边 import ${ct.stats.importEdges} + JSX标签/注册表 ${ct.stats.jsxEdges} = ${ct.stats.totalEdges}。`);
    L.push(`> 节点命名：\`.jsx\` 文件名 = 该文件的默认导出组件；\`shared#Name\` = shared.js 内部定义的组件。`);
    L.push(`> 未解析组件标签 ${ct.stats.unresolvedTags} 个；\`shared.js\` 包装一跳 ${ct.stats.wrapperShortcuts} 个（\`NM = g.memo(_cmp_ik)\` 这类，已还原到真实实现）。`);
    L.push('');
    for (const n of ct.tree) {
      const indent = '  '.repeat(n.depth);
      L.push(`${indent}- \`${n.name}\`${n.children.length ? ' → ' + n.children.map((x) => '`' + x + '`').join(' ') : ''}`);
    }
    L.push('');
    if (ct.orphanDetails && ct.orphanDetails.length) {
      L.push(`### 静态不可达模块（${ct.orphanDetails.length} 个，已判定性质）`);
      L.push('');
      L.push('| 节点 | 性质 |');
      L.push('|---|---|');
      for (const o of ct.orphanDetails) L.push(`| \`${o.name}\` | ${o.kind === 'helper-fn' ? 'helper 模块（被当函数调用，非组件）' : '未使用导出'} |`);
      L.push('');
    }
  }

  L.push('## 组件文件清单（按行数降序）');
  L.push('');
  L.push('| 组件 | 行数 | 按钮 | store | IPC | 子组件 | 文件（含源码原文） |');
  L.push('|---|---|---|---|---|---|---|');
  for (const f of componentFiles) {
    L.push(`| \`${f.name}\` | ${f.lines} | ${f.buttons} | ${f.store} | ${f.ipc} | ${f.children} | \`05-组件/${f.file}\` |`);
  }
  for (const f of sharedFiles) L.push(`| \`${f.name}\` | — | — | — | — | — | \`05-组件/${f.file}\`（shared.js 行 ${f.line}） |`);
  L.push('');
  if (flowMd) L.push('- `05-组件/99-交互链路.md`：组件交互链路全量（' + ((facts.flows && facts.flows.stats.flows) || 0) + ' 条）');
  L.push('');
  L.push('## 口径说明（别误读成「shared.js 已覆盖」）');
  L.push('');
  L.push(`> \`shared__*.md\` 只有 **${sharedFiles.length} 个**，筛选口径是「**在组件树里作为节点出现**的 shared.js 组件」`);
  const compDefs = (facts.sharedUtils && facts.sharedUtils.stats.byCategory && facts.sharedUtils.stats.byCategory.component) || 0;
  L.push(`> （即被 JSX 标签或组件查找表引用到的）。shared.js 里形态判定为组件的共 **${compDefs} 个**，其余在 \`10-shared工具/\`。`);
  L.push(`> **shared.js 的全部顶层定义**（${(facts.sharedUtils && facts.sharedUtils.stats.defs) || 0} 个：页面脚本常量、纯 helper、组件、类、常量）原文都在 \`10-shared工具/\`，`);
  L.push('> 用 `10-shared工具/99-定义索引.md` 按名字 grep 即可定位到分片与源行。');
  L.push('');
  write('05-组件/00-索引.md', L.join('\n'));

  if (flowMd) write('05-组件/99-交互链路.md', flowMd);
}

// ==================== 06 数据流 ====================

function renderRelations(facts) {
  const L = [];
  L.push('# 06 · 数据流');
  L.push('');
  L.push('> 来源：09（交叉 03/04/01）。字段读写 + action 调用 + IPC 链路。');
  L.push('');
  const rel = facts.relations;
  if (rel) {
    L.push('## store 字段（谁写 / 谁读）');
    L.push('');
    L.push(`> ⚠ **静态抽取，可能漏行；字段真源是 04-store 的 action 函数体**（本表只列「有数据流」的字段）。`);
    L.push(`> 覆盖：state ${rel.stats.stateTotal} 个中 ${rel.stats.fields} 个有数据流；剩余 ${rel.stats.fieldsWithoutFlow} 个见下方「无数据流字段」。`);
    L.push('');
    L.push('| 字段 | 写入（action） | 写入（组件 `L.setState`） | 读取（组件） |');
    L.push('|---|---|---|---|');
    for (const f of rel.fields) L.push(`| \`${f.field}\` | ${f.writtenBy.map((x) => '`' + x + '`').join(' ') || '—'} | ${(f.writtenByComponents || []).map((x) => '`' + x + '`').join(' ') || '—'} | ${f.readBy.map((x) => '`' + x + '`').join(' ') || '—'} |`);
    L.push('');
    if (rel.fieldsWithoutFlow && rel.fieldsWithoutFlow.length) {
      L.push(`### 无数据流字段（${rel.fieldsWithoutFlow.length} 个）`);
      L.push('');
      L.push('> 静态既没扫到 action 写、也没扫到组件读。可能只在 action 的 **helper** 里写、或只被运行时/外部读写。');
      L.push('');
      L.push(rel.fieldsWithoutFlow.map((x) => '`' + x + '`').join(' '));
      L.push('');
    }
    L.push('## action 调用关系（谁调 / 写哪些字段 / 调哪些 IPC）');
    L.push('');
    L.push('| action | 调用组件 | 写入字段 | 调 IPC |');
    L.push('|---|---|---|---|');
    for (const a of rel.actions) L.push(`| \`${a.action}\` | ${a.calledBy.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.writes.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.ipc.map((x) => '`' + x + '`').join(' ') || '—'} |`);
    L.push('');
    L.push('## IPC 链路（谁调 / 谁处理）');
    L.push('');
    L.push('| 通道 | 调用 action | 调用组件 | handler |');
    L.push('|---|---|---|---|');
    for (const i of rel.ipc) L.push(`| \`${i.channel}\` | ${i.calledByActions.map((x) => '`' + x + '`').join(' ') || '—'} | ${i.calledByComponents.map((x) => '`' + x + '`').join(' ') || '—'} | ${i.handler || '—'} |`);
    L.push('');
  }
  const sf = verifySourceFacts();
  if (sf.length) {
    L.push('## 源侧事实（脚本逐条校验，命中才输出）');
    L.push('');
    L.push('> 下面每条都带 locator，脚本在源文件里查不到就不输出 —— 防止「凭印象写归属」。');
    L.push('');
    for (const f of sf) L.push(`- ${f.claim}`);
    L.push('');
  }
  return L.join('\n');
}

// ==================== 07 生成 pipeline ====================

function renderProviders(facts) {
  const L = [];
  L.push('# 07 · 生成 pipeline');
  L.push('');
  L.push('> 来源：02 provider + 07 技能包。5 provider + 引擎 + 参数表单，完整内联。');
  L.push('');
  const prov = facts.providers;
  if (!prov) return L.join('\n');

  if (prov.types_contract) { L.push('## 类型契约'); L.push(''); L.push(prov.types_contract); L.push(''); }
  if (prov.registry) { L.push('## 服务商注册表'); L.push(''); L.push(prov.registry); L.push(''); }
  if (prov.config_store) { L.push('## 配置存储'); L.push(''); L.push(prov.config_store); L.push(''); }

  for (const p of prov.providers || []) {
    L.push(`## ${p.id} — ${p.name}`);
    L.push('');
    if (p.header) { L.push('### 接口口径（文件头，照写翻译）'); L.push(''); L.push(p.header); L.push(''); }
    L.push('### 规格');
    L.push('');
    L.push(`- 能力：${(p.capabilities || []).join('、')}`);
    L.push(`- 域名：${(p.domains || []).join('、') || '—'}`);
    L.push(`- 鉴权：\`${JSON.stringify(p.auth)}\``);
    L.push(`- 默认值：\`${JSON.stringify(p.defaults)}\``);
    L.push(`- 首尾帧：\`${JSON.stringify(p.frameSupport)}\``);
    L.push(`- 端点：${(p.endpoints || []).map((x) => '`' + x + '`').join(' ')}`);
    if (p.quotaHints && p.quotaHints.length) {
      L.push('- 额度信号：');
      for (const q of p.quotaHints) L.push(`  - \`${q.kind}\` 命中 \`${q.pattern}\` → ${q.advice}`);
    }
    if (p.paramSchema && p.paramSchema.length) {
      L.push('');
      L.push('### 参数 schema（生成表单）');
      L.push('');
      L.push('| 参数 | 类型 | 默认 | 可选项 |');
      L.push('|---|---|---|---|');
      for (const s of p.paramSchema) {
        L.push(`| \`${s.key}\` ${s.label || ''} | ${s.type} | ${s.default ?? '—'} | ${(s.options || []).join(' / ') || '—'} |`);
      }
    }
    L.push('');
  }

  if (prov.engine) {
    L.push('## 引擎');
    L.push('');
    L.push('状态机：`' + prov.engine.statusMachine + '`');
    L.push('');
    if (prov.engine.constants) {
      for (const [k, v] of Object.entries(prov.engine.constants)) L.push(`- \`${k} = ${v}\``);
    }
    if (prov.engine.header) { L.push(''); L.push(prov.engine.header); }
    L.push('');
  }

  const sk = facts.skillpack;
  if (sk && sk.packs) {
    L.push('## 技能包（生成参数表单 + prompt 模板）');
    L.push('');
    for (const p of sk.packs) {
      L.push(`### ${p.file}`);
      L.push('');
      if (p.params && p.params.length) {
        L.push('| 参数 | 控件 | 可选项 |');
        L.push('|---|---|---|');
        for (const prm of p.params) {
          L.push(`| \`${prm.value}\` | type=${prm.type} | ${(prm.options || []).map((o) => o.value + (o.default ? '*' : '')).join(' / ') || prm.placeholder || '—'} |`);
        }
      }
      if (p.templates && p.templates.length) {
        L.push('');
        L.push('prompt 模板：');
        for (const t of p.templates) L.push(`- \`${t}\``);
      }
      L.push('');
    }
  }
  return L.join('\n');
}

// ==================== 08 样式 ====================

function renderStyles(facts) {
  const L = [];
  L.push('# 08 · 样式');
  L.push('');
  L.push('> 来源：18。className → CSS 样式。');
  L.push('');
  const st = facts.styles;
  if (st && st.matched) {
    L.push('| className | 样式 |');
    L.push('|---|---|');
    for (const m of st.matched) L.push(`| \`.${m.className}\` | \`${m.style}\` |`);
  }
  return L.join('\n');
}

// ==================== 09 缺口清单（实测数据驱动）====================

function renderGaps(facts) {
  const t = tiers(facts);
  const s = t.store || {};
  const c = t.comp || {};
  const bk = c.buttonsByKind || {};
  const flows = (facts.flows && facts.flows.stats) || {};
  const L = [];
  L.push('# 09 · 缺口清单（实测覆盖度 + 剩余不可逆部分）');
  L.push('');
  L.push('> 由 `scripts/99-build-spec.cjs` 按实测数据生成，不手写。');
  L.push('');
  L.push('## 一、已消除的缺口（旧版曾标为「不可逆」，实测可提）');
  L.push('');
  L.push('| 旧缺口 | 旧判定 | 实测结果 |');
  L.push('|---|---|---|');
  L.push(`| store action 函数体 | 「minified 不可逆，只能推断」 | **${s.actionsWithBody || 0}/${s.actionCount || 0} 函数体原文已内联**（set/get 规范化，共 ${s.totalBodyLines || 0} 行），另附 ${s.helperCount || 0} 个 helper 原文 |`);
  L.push(`| 按钮事件处理器 | 「280/294 个按钮是 UI 切换，不可解」 | **${c.buttonsResolved || 0}/${c.totalButtons || 0} 已解析到 store action / IPC**，未解析仅 ${bk.unresolved || 0} 个 |`);
  L.push(`| 组件交互链路 | 「294 个按钮只追出 1 条链路」 | **${flows.flows || 0} 条链路**（触发器→面板→操作），面板内操作 ${flows.panelItems || 0}，其中 ${flows.panelItemsWithAction || 0} 解析到 store action |`);
  const rel2 = facts.relations && facts.relations.stats;
  L.push(`| 组件函数体 | 「spec 只有按钮 + store 列表，写组件要回原文」 | **${c.total || 0} 个组件源码原文全部内联**（\`05-组件/组件/<名>.md\`，规格 + 解析链 + 源码同文件） |`);
  if (rel2) L.push(`| 06 字段表漏行 | 「\`imageGenKeyTarget\` / \`imageGenJobNode\` 在 body 里写着但表里没有」 | **${rel2.fields}/${rel2.stateTotal} 全部覆盖**：\`set(l => { return {…} })\` 块体形态已解析；组件 \`L.setState\` 直写的 ${rel2.componentWrittenFields} 个字段也单列 |`);
  L.push('| 04-store 分片撞号 | 「磁盘 10 个分片、索引只列 5 个」 | 产出前**整目录清空** + 自检断言「分片数 = ceil(action/40)」「索引与磁盘一一对应」 |');
  L.push('| 工程结构不匹配 | 「spec 写 src/main + src/renderer，读者以为要另起工程」 | 00-总览新增「落到既有工程」映射表（spec 模块 → `electron/` + `src/{core,adapters,state,ui}`） |');
  L.push('| 组件树把 helper 当组件 | 「`shared#MA` / `shared#mb` 其实是连接线工具函数」 | 节点判定加 hook/JSX/类/包装校验，组件查找表要求成员过半是组件 |');
  L.push('');
  L.push('## 二、剩余不可逆 / 需人工的部分');
  L.push('');
  L.push('| 缺口 | 原因 | 复刻策略 |');
  L.push('|---|---|---|');
  L.push('| minified 局部标识符名（`n`/`r`/`l`） | 压缩时变量名被删除，静态不可恢复 | 不影响行为；照写时按语义改名（函数体与字段名都已给全） |');
  L.push(`| 按钮未解析（${bk.unresolved || 0} 个） | handler 是三目/间接变量，静态无法定位 | 见 05-组件 的按钮行，按文案 + 同类按钮推断 |`);
  L.push(`| 按钮归属父组件（prop 回调 ${bk.prop || 0} 个） | handler 由父组件传入 | 在父组件找同名 props 传参处（05-组件 已给 props 列表） |`);
  L.push(`| 宿主对象调用（dom ${bk.dom || 0} 个） | 调用 webview/ref/宿主对象方法 | 按 05-组件 的「解析链」里的 DOM 调用名实现对应副作用 |`);
  L.push('| 页面骨架 4 态语义 | 需语义理解，脚本提不准 | 已人工补足（见 05-组件/00-索引 顶部），直接照用 |');
  L.push('| Lovart / dola 采集、指纹、授权 | 范围外（见 00-总览「范围」） | 不复刻 |');
  return L.join('\n');
}

// ==================== main ====================

// ==================== 自检（防止「陈旧文件残留」「state 混进 action」这类静默错误）====================

function verifySpec(facts, fileCount) {
  const fails = [];
  const ok = [];
  const ls = (rel) => {
    const d = path.join(SPEC, rel);
    return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
  };

  // 1. 04-store 分片数 / 文件集合必须与索引一致（旧版曾残留上一轮分片，编号撞号）
  const storeShards = ls('04-store').filter((f) => /^\d+-函数体-/.test(f));
  const expectShards = Math.ceil((facts.store ? facts.store.actions.length : 0) / STORE_CHUNK);
  if (storeShards.length !== expectShards) fails.push(`04-store 分片数 ${storeShards.length} ≠ 期望 ${expectShards}（陈旧文件残留？）`);
  else ok.push(`04-store 分片 ${storeShards.length} 个，与 action ${facts.store.actions.length} 个一致`);

  const storeIdx = readMd('BUILD-SPEC/04-store/00-索引.md') || '';
  const missing = storeShards.filter((f) => !storeIdx.includes(f));
  if (missing.length) fails.push(`04-store 索引未列出分片：${missing.join(' ')}`);
  else ok.push('04-store 索引与磁盘分片一一对应');

  // 2. 每个 action 恰好出现一次为 `### name`，且 state 名不得出现为 action 标题
  const headings = [];
  for (const f of storeShards) {
    const t = fs.readFileSync(path.join(SPEC, '04-store', f), 'utf8');
    for (const m of t.matchAll(/^### (.+?)（源行/gm)) headings.push(m[1]);
  }
  const actionNames = facts.store.actions.map((a) => a.name);
  const dup = actionNames.filter((n) => headings.filter((h) => h === n).length > 1);
  const miss = actionNames.filter((n) => !headings.includes(n));
  if (dup.length) fails.push(`04-store 函数体重复出现：${dup.slice(0, 5).join(' ')}`);
  else if (miss.length) fails.push(`04-store 缺函数体：${miss.slice(0, 5).join(' ')}`);
  else ok.push(`04-store 函数体 ${headings.length} 个 = action ${actionNames.length} 个，无重复无缺失`);

  const stateAsAction = facts.store.states.map((s) => s.name).filter((n) => headings.includes(n));
  if (stateAsAction.length) fails.push(`04-store 把 state 当 action 渲染：${stateAsAction.join(' ')}`);
  else ok.push('04-store 未把 state 混入 action');

  // 3. 每个组件都必须有「含源码原文」的组件文件
  const compFiles = ls(path.join('05-组件', '组件'));
  const compNames = facts.components.components.map((c) => c.name);
  const noFile = compNames.filter((n) => !compFiles.includes(n + '.md'));
  if (noFile.length) fails.push(`05-组件 缺组件文件：${noFile.slice(0, 5).join(' ')}`);
  else ok.push(`05-组件 组件文件 ${compNames.length} 个，全部含源码原文`);
  const noSrc = compFiles.filter((f) => !fs.readFileSync(path.join(SPEC, '05-组件', '组件', f), 'utf8').includes('## 源码原文'));
  if (noSrc.length) fails.push(`05-组件 文件缺「源码原文」段：${noSrc.slice(0, 5).join(' ')}`);

  // 4. 06 数据流的字段覆盖度必须写清
  const rel = facts.relations;
  if (rel && rel.stats) {
    if (rel.stats.fields + rel.stats.fieldsWithoutFlow !== rel.stats.stateTotal) {
      fails.push(`06 字段覆盖度对不上：${rel.stats.fields}+${rel.stats.fieldsWithoutFlow} ≠ ${rel.stats.stateTotal}`);
    } else ok.push(`06 字段覆盖 ${rel.stats.fields}/${rel.stats.stateTotal}，无数据流 ${rel.stats.fieldsWithoutFlow} 已单列`);
  }

  // 5. 10-shared工具：shared.js 的**全部**顶层定义必须都能在分片里找到（含页面脚本常量）
  const su = facts.sharedUtils;
  if (su) {
    const suShards = ls('10-shared工具').filter((f) => /^\d+-源行/.test(f));
    const heads2 = [];
    for (const f of suShards) {
      const t = fs.readFileSync(path.join(SPEC, '10-shared工具', f), 'utf8');
      for (const m of t.matchAll(/^### (.+?)（源行 (\d+)，/gm)) heads2.push(m[1] + '@' + m[2]);
    }
    const want = su.defs.map((d) => d.name + '@' + d.line);
    const missSu = want.filter((w) => !heads2.includes(w));
    if (missSu.length) fails.push(`10-shared工具 缺定义：${missSu.slice(0, 6).join(' ')}（共缺 ${missSu.length}）`);
    else ok.push(`10-shared工具 定义 ${want.length} 个全部内联（分片 ${suShards.length} 个）`);
    const ps = su.defs.filter((d) => d.category === 'page-script');
    const missPs = ps.filter((d) => !heads2.includes(d.name + '@' + d.line));
    if (missPs.length) fails.push(`10-shared工具 缺页面脚本常量：${missPs.map((d) => d.name).join(' ')}`);
    else ok.push(`10-shared工具 页面脚本常量 ${ps.length} 个全部内联`);
    const suIdx = readMd('BUILD-SPEC/10-shared工具/00-索引.md') || '';
    const missIdx = suShards.filter((f) => !suIdx.includes(f));
    if (missIdx.length) fails.push(`10-shared工具 索引未列出分片：${missIdx.join(' ')}`);
    else ok.push('10-shared工具 索引与磁盘分片一一对应');

    // 任务直达表：locator 命中的条目必须都出现在索引里
    const byName = new Map();
    for (const d of su.defs) if (!byName.has(d.name)) byName.set(d.name, d);
    const expectHints = TASK_HINTS.filter((t) => { const d = byName.get(t.name); return d && d.src.includes(t.must); });
    const missHints = expectHints.filter((t) => !suIdx.includes('`' + t.name + '`'));
    if (missHints.length) fails.push(`10-shared工具 任务直达表缺：${missHints.map((t) => t.name).join(' ')}`);
    else ok.push(`10-shared工具 任务直达表 ${expectHints.length} 条（locator 全部命中）`);
  }

  // 6. facts 新鲜度（闸门已在 main 拦住过期，这里只汇报）
  const ff = facts.__freshness;
  if (ff) {
    if (ff.stale.length) fails.push(`facts 过期：${ff.stale.map((s) => s.file).join(' ')}`);
    else ok.push(`facts 新鲜度：${ff.fresh.length} 个已校验${ff.unverifiable.length ? `，${ff.unverifiable.length} 个无法校验` : ''}`);
  }

  // 7. 事实指纹 + 文件数（收件方据此判断 spec 与 facts 是否同步）
  const fp = readMd('BUILD-SPEC/00-事实指纹.md') || '';
  if (!fp) fails.push('缺 00-事实指纹.md');
  else {
    const missFp = Object.keys(FACTS_SCRIPTS).filter((f) => !fp.includes(f));
    if (missFp.length) fails.push(`00-事实指纹 未列出：${missFp.join(' ')}`);
    else ok.push(`00-事实指纹 列出 ${Object.keys(FACTS_SCRIPTS).length} 个 facts 的 sha256`);
  }
  const ov = readMd('BUILD-SPEC/00-总览.md') || '';
  const actualCount = countFiles(SPEC);
  if (!fileCount) fails.push('未取到 BUILD-SPEC 文件数');
  else if (actualCount !== fileCount) fails.push(`自报文件数 ${fileCount} ≠ 磁盘实际 ${actualCount}`);
  else if (!ov.includes(`${fileCount} 个文件`)) fails.push(`00-总览 未写明文件数 ${fileCount}`);
  else ok.push(`文件数自报 = 实际 = ${fileCount}（00-总览 已写明）`);

  console.log('[99-build-spec] 自检：');
  for (const s of ok) console.log('  ✓ ' + s);
  for (const s of fails) console.log('  ✗ ' + s);
  if (fails.length) { console.error(`[99-build-spec] 自检失败 ${fails.length} 项`); process.exitCode = 1; }
  else console.log('  → 自检全部通过');
  return { ok, fails };
}

function main() {
  const facts = {
    ipc: load('05-IPC契约.json'),
    providers: load('02-生成pipeline.json'),
    store: load('03-store.json'),
    components: load('04-组件规格.json'),
    canvas: load('05-画布模型.json'),
    mainModules: load('06-主进程模块.json'),
    skillpack: load('07-技能包.json'),
    semantic: load('08-语义图.json'),
    relations: load('09-数据流.json'),
    mainBodies: load('11-主进程函数体.json'),
    componentTree: load('12-组件树.json'),
    flows: load('14-交互链路.json'),
    styles: load('18-样式.json'),
    sharedUtils: load('19-shared工具.json'),
  };

  // 0. 新鲜度闸门：99 只读 facts、不刷新它。若 facts 的输入 sha256 与磁盘不一致，
  //    说明 facts 是旧的 —— 此时生成 spec 会产出「悄悄过期」的蓝图（自检还全绿）。
  const freshness = verifyFactsFreshness();
  if (freshness.stale.length) {
    console.error('[99-build-spec] ✗ facts 已过期，拒绝生成 spec（否则产出过期蓝图）：');
    for (const s of freshness.stale) console.error(`  - outputs/${s.file}：${s.why}\n      → 先跑 node ${s.script}`);
    console.error('[99-build-spec] 全部修好后重跑：node scripts/99-build-spec.cjs');
    process.exit(1);
  }
  facts.__freshness = freshness;

  // 先整目录清空：分片文件名带内容摘要，重跑时若只覆盖写会**残留上一轮分片**（编号撞号）
  fs.rmSync(SPEC, { recursive: true, force: true });
  fs.mkdirSync(SPEC, { recursive: true });
  write('01-数据模型.md', renderDataModel(facts));
  write('02-IPC契约.md', renderIpc(facts));
  writeMain(facts);
  writeStore(facts);
  writeSharedUtils(facts);
  writeComponents(facts);
  write('06-数据流.md', renderRelations(facts));
  write('07-生成pipeline.md', renderProviders(facts));
  write('08-样式.md', renderStyles(facts));
  write('09-缺口清单.md', renderGaps(facts));
  write('00-事实指纹.md', writeFingerprint(facts));

  // 文件数写进总览，让「基线是多少」不用靠记忆（收件方按此对账）。
  // 先落占位文件再统计，否则统计会漏掉 00-总览.md 自身。
  write('00-总览.md', '');
  const fileCount = countFiles(SPEC);
  facts.__fileCount = fileCount;
  write('00-总览.md', renderOverview(facts, fileCount));

  const t = tiers(facts);
  console.log('[99-build-spec] 已产出模块化 BUILD-SPEC 目录：outputs/BUILD-SPEC/');
  console.log(`[99-build-spec] 文件数 ${fileCount}（BUILD-SPEC 内，不含 outputs/*.json）`);
  console.log(`[99-build-spec] facts 新鲜度：${freshness.fresh.length} 个已校验${freshness.unverifiable.length ? '，无法校验 ' + freshness.unverifiable.length + ' 个' : ''}`);
  console.log(`[99-build-spec] 分级：04-store=${t.storeTier} / 05-组件=${t.compTier}`);
  verifySpec(facts, fileCount);
}

main();
