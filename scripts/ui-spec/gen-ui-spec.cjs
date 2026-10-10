#!/usr/bin/env node
/**
 * 生成《12-UI对照表.md》—— **原版 vs 重写** 的完整规格文档
 *
 * 每个节点输出：① 结构树 ② 按钮清单 ③ 关键标识 ④ 交互/字段/状态 ⑤ 结构分区 ⑥ 文案
 * 末尾：页面/面板对照表 + 缺口统计 + 原版全量组件
 *
 * ⚠️ 依赖：先跑 `extract-ui-inventory.cjs` 生成 `_ui-inventory.json`
 * 用法：node scripts/ui-spec/gen-ui-spec.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const APP = path.resolve(__dirname, '..', '..');
const DOCS = path.resolve(APP, '..', '逆向工程', 'docs');
const inv = JSON.parse(fs.readFileSync(path.join(APP, '_ui-inventory.json'), 'utf8'));

/** 8 类节点 → [type, 原版文件, 我的文件, 中文名] */
const NODES = [
  ['text', 'CL.jsx', 'src/ui/nodes/TextNode.tsx', '文本节点'],
  ['material', 'fL.jsx', 'src/ui/nodes/MaterialNode.tsx', '素材节点'],
  ['account', 'OL.jsx', 'src/ui/nodes/AccountNode.tsx', '账号节点（发送）'],
  ['video', 'BL.jsx', 'src/ui/nodes/VideoNode.tsx', '视频节点'],
  ['download', 'WL.jsx', 'src/ui/nodes/DownloadNode.tsx', '下载节点'],
  ['group', 'GL.jsx', 'src/ui/nodes/GroupNode.tsx', '组节点'],
  ['genvideo', 'YL.jsx', 'src/ui/nodes/GenVideoNode.tsx', '文生视频节点'],
  ['imggen', 'ZL.jsx', 'src/ui/nodes/GenImageNode.tsx', '文生图节点'],
];

const UTIL = /^(nodrag|nopan|nowheel|selected|is-selected|warn|dot)$/;

function mine(file) {
  const p = path.join(APP, file);
  if (!fs.existsSync(p)) return null;
  const code = fs.readFileSync(p, 'utf8');
  return {
    bytes: code.length,
    buttons: (code.match(/<button\b/g) || []).length,
    handlers: [...new Set([...code.matchAll(/\bon([A-Z]\w+)\s*=/g)].map((m) => m[1]))],
    dataFields: [...new Set([...code.matchAll(/\bdata\.([a-zA-Z_$][\w$]*)/g)].map((m) => m[1]))],
    classes: [...new Set([...code.matchAll(/className=\{?[`"]([^`"]+)/g)].map((m) => m[1]))],
  };
}

function treeOf(file) {
  try {
    return execFileSync(process.execPath, [path.join(__dirname, 'node-tree.cjs'), file], { encoding: 'utf8' });
  } catch (e) {
    return `(抽取失败: ${e.message})`;
  }
}

const dotOf = (classes) => {
  const all = classes.join(' ').replace(/…/g, ' ');
  return (
    all.match(/\bdot [a-z-]+dot\b/)?.[0] || all.match(/\bgv-dot\b/)?.[0] || all.match(/\b[a-z-]+-dot\b/)?.[0] || '—'
  );
};

const rootClass = (classes) =>
  [
    ...new Set(
      classes
        .join(' ')
        .replace(/…/g, ' ')
        .split(/\s+/)
        .filter((c) => /-node$/.test(c) && !/-(title|head|body|count|icon|name)$/.test(c)),
    ),
  ][0] || '—';

function groups(classes) {
  const g = new Map();
  for (const c of classes) {
    for (const part of c.split(/\s+/)) {
      if (!part || part.includes('…') || UTIL.test(part)) continue;
      const k = part.split('-')[0];
      if (!g.has(k)) g.set(k, new Set());
      g.get(k).add(part);
    }
  }
  return [...g.entries()].sort((a, b) => b[1].size - a[1].size);
}

const md = [];
const W = (s = '') => md.push(s);

W('# 12 · UI 对照表（**原版 vs 重写**）');
W('');
W('> **这份文档干什么用**：重写时**逐项对照**，保证**功能与按钮不漏**。改完代码可重新生成比对。');
W('> **非目标**：像素级样式对齐 —— 用户明确：「UI 只搭好骨架就行，别漏功能，别漏按钮……后面 UI 可以重写」。');
W('> **怎么生成**：');
W('> ```bash');
W('> node app/scripts/ui-spec/extract-ui-inventory.cjs   # 抽原版 101 个组件');
W('> node app/scripts/ui-spec/gen-ui-spec.cjs           # 生成本文档');
W('> ```');
W('');
W('---');
W('');
W('## 一、节点对照表（8 类）');
W('');
W('### 1.0 总览（差距一目了然）');
W('');
W('| # | type | 原版文件 | 原版字节 | 我的文件 | 我的字节 | **倍数** | 原版按钮 | 我的按钮 | 原版字段 | 我的字段 |');
W('|---|---|---|---|---|---|---|---|---|---|---|');
NODES.forEach(([type, of, mf], i) => {
  const o = inv[of] || { bytes: 0, buttons: [], dataFields: [] };
  const m = mine(mf) || { bytes: 0, buttons: 0, dataFields: [] };
  const ratio = m.bytes ? (o.bytes / m.bytes).toFixed(1) + '×' : '∞';
  W(
    `| ${i + 1} | \`${type}\` | \`${of}\` | ${o.bytes} | \`${mf.split('/').pop()}\` | ${m.bytes} | **${ratio}** | ${o.buttons.length} | ${m.buttons} | ${o.dataFields.length} | ${m.dataFields.length} |`,
  );
});
W('');
W('> **结论**：原版 8 类节点共 **34 个按钮**；重写实现 **0 个**。');
W('> 节点的「概念」（根类名 / 身份圆点 / 头部 / 缩放器 / 各功能区）**全部缺失**。');
W('');

NODES.forEach(([type, of, mf, label], idx) => {
  const o = inv[of];
  const m = mine(mf);
  W(`### 1.${idx + 1} \`${type}\` —— ${label}`);
  W('');
  W(
    `> 原版 \`${of}\`（${o ? o.bytes : 0} B，${o ? o.buttons.length : 0} 按钮） vs 我的 \`${mf}\`（${m ? m.bytes : 0} B，${m ? m.buttons : 0} 按钮）`,
  );
  W('');
  if (!o) {
    W('> ❌ 未抽取到原版');
    W('');
    return;
  }

  W('#### 结构树（机械抽取，按嵌套顺序）');
  W('');
  W('```');
  W(treeOf(of).trimEnd());
  W('```');
  W('');

  W('#### 按钮 / 可点元素');
  W('');
  if (o.buttons.length === 0) W('（无）');
  else {
    W('| # | 类名 | 文案 / title |');
    W('|---|---|---|');
    o.buttons.forEach((b, i) => W(`| ${i + 1} | \`${b.cls.split(' ')[0]}\` | ${(b.title || b.label).slice(0, 60)} |`));
  }
  W('');

  W('#### 关键标识');
  W('');
  W('| 项 | 原版 | 我的 |');
  W('|---|---|---|');
  W(
    `| 根类名 | \`${rootClass(o.classes)}\` | ${m && m.classes.join(' ').includes('styles.') ? 'CSS Module（无原版类名）' : '—'} |`,
  );
  W(`| 身份圆点 | \`${dotOf(o.classes)}\` | ${m && /dot/.test(m.classes.join(' ')) ? '有' : '**无**'} |`);
  W('');

  W('#### 交互 / 字段 / 状态');
  W('');
  W(
    `- **交互**：原版 \`${o.handlers.map((h) => 'on' + h).join(' ')}\` ／ 我的 \`${m && m.handlers.length ? m.handlers.map((h) => 'on' + h).join(' ') : '（无）'}\``,
  );
  W(`- **data 字段**：原版 ${o.dataFields.length} 个 → 我的 ${m ? m.dataFields.length : 0} 个`);
  W(`  - 原版：${o.dataFields.map((f) => `\`${f}\``).join(' ') || '—'}`);
  W(`  - 我的：${m && m.dataFields.length ? m.dataFields.map((f) => `\`${f}\``).join(' ') : '—'}`);
  W(`- **状态词**：${(o.states || []).map((s) => `\`${s}\``).join(' ') || '—'}`);
  W('');

  W('#### 结构分区（按类名前缀）');
  W('');
  W('| 前缀 | 类名 |');
  W('|---|---|');
  for (const [k, set] of groups(o.classes).slice(0, 16)) {
    W(`| \`${k}\` | ${[...set].slice(0, 12).map((c) => `\`${c}\``).join(' ')} |`);
  }
  W('');

  W(`#### 中文文案（${o.literals.length}）`);
  W('');
  W(o.literals.map((l) => `- ${l}`).join('\n') || '（无）');
  W('');
  W('---');
  W('');
});

// ── 二、页面 / 面板 ──
W('## 二、页面 / 面板对照表');
W('');
W('> 「我的实现」= `src/ui/**` 对应文件；`—` = **完全没有**。');
W('');
const MAP = [
  ['_Component48.jsx', '页面级外壳（.app/.main-area，左右栏可折叠）', 'ui/shell/AppShell.tsx'],
  ['_Component49.jsx', '全局错误边界', 'ui/shell/ErrorBoundary.tsx'],
  ['_Component47.jsx', '启动页', 'ui/pages/StartPage.tsx'],
  ['_Component42.jsx', '★ 画布宿主（ReactFlow + 全部画布交互）', 'ui/canvas/CanvasHost.tsx'],
  ['_Component43.jsx', '★ 豆包后台 webview 视图', '—'],
  ['Z3_1.jsx', '★ 文生视频面板', 'ui/panels/GenPanel.tsx'],
  ['_Component45.jsx', '★ 文生图面板', 'ui/panels/GenPanel.tsx'],
  ['_Component46.jsx', 'API 设置面板', '—'],
  ['OP.jsx', '左栏账号面板', '—'],
  ['RT.jsx', '右栏资源库', 'ui/panels/LibraryPanel.tsx'],
  ['G3.jsx', '图片编辑器（遮脸/涂抹）', '—'],
  ['_Component40.jsx', '遮脸参数面板', '—'],
  ['DP.jsx', '指纹诊断面板', '—'],
  ['z3.jsx', '发送队列浮窗', '—'],
  ['L3.jsx', '批量发送面板', '—'],
  ['W3.jsx', '激活页', '—'],
  ['B3.jsx', 'interactive 边', 'ui/edges/InteractiveEdge.tsx'],
  ['_Component37.jsx', '组连线结束菜单', '—'],
];
W('| 原版组件 | 字节 | 按钮 | 角色 | 我的实现 | 状态 |');
W('|---|---|---|---|---|---|');
for (const [f, role, minePath] of MAP) {
  const r = inv[f];
  const m = minePath !== '—' ? mine(minePath) : null;
  const st = minePath === '—' ? '❌ **缺**' : m && m.bytes > 0 ? '⚠️ 有（待对齐）' : '❌ 缺';
  W(
    `| \`${f}\` | ${r ? r.bytes : '—'} | ${r ? r.buttons.length : '—'} | ${role} | ${minePath === '—' ? '—' : `\`${minePath}\``} | ${st} |`,
  );
}
W('');
const missing = MAP.filter((x) => x[2] === '—');
W(`**缺口**：上表 ${MAP.length} 个主要组件里，**完全没有**的是 **${missing.length} 个**：`);
W('');
W(
  missing
    .map((x) => `- \`${x[0]}\` —— ${x[1]}（${inv[x[0]] ? inv[x[0]].bytes + ' B / ' + inv[x[0]].buttons.length + ' 按钮' : '?'}）`)
    .join('\n'),
);
W('');
W('### 2.1 原版全量组件（按大小，含未识别角色的）');
W('');
W('| 组件 | 字节 | 按钮 | 交互 | 文案 |');
W('|---|---|---|---|---|');
for (const [f, r] of Object.entries(inv)
  .sort((a, b) => b[1].bytes - a[1].bytes)
  .slice(0, 50)) {
  W(`| \`${f}\` | ${r.bytes} | ${r.buttons.length} | ${r.handlers.length} | ${r.literals.length} |`);
}
W('');

const out = path.join(DOCS, '12-UI对照表.md');
fs.writeFileSync(out, md.join('\n'), 'utf8');
console.log(`已写出 ${out}  (${md.length} 行)`);
