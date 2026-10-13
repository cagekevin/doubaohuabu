#!/usr/bin/env node
/**
 * 04-components.cjs —— 组件完整规格（一个脚本提全组件的所有东西）：
 *   props / hooks / store 绑定 / IPC / 文案 / 事件 / 图标 / 按钮（含**事件解析链**）/
 *   输入控件 / 布局 / 子组件。
 *
 * 为什么输出绑定与事件链：旧版只按「按钮文案 + 后 80 行里有没有 L.getState/window.api」
 * 判 `UI切换`，把 280/294 个按钮判成不可解。实测组件里 store 是**局部变量绑定**的
 * （`const l = L(B => B.onNodesChange)`、`const le = g.useCallback(B => { L.getState().arrangeNodes(B) })`），
 * 只要建出「局部变量 → store 字段/action」的映射再解析 onClick，按钮链路完全可追。
 *
 * 输入：inputs/.../expanded_components/*.jsx + outputs/03-store.json（区分 state/action）
 * 输出：outputs/04-组件规格.json + outputs/04-组件规格.md
 * 幂等、可重跑：node scripts/04-components.cjs（依赖 03-store 先跑）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { blankComments, analyzeComponent } = require('./_lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components');
const STORE = path.join(ROOT, 'outputs', '03-store.json');
const OUT_JSON = path.join(ROOT, 'outputs', '04-组件规格.json');
const OUT_MD = path.join(ROOT, 'outputs', '04-组件规格.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

const KIND_LABEL = {
  'store-action': 'store action',
  mixed: 'store+其它',
  ipc: 'IPC',
  setState: '本地 state',
  ref: 'ref/DOM',
  dom: 'DOM/宿主对象',
  prop: 'props/外部回调',
  unresolved: '未解析',
};

function loadStoreNames() {
  try {
    const j = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    return {
      actions: new Set(j.actions.map((a) => a.name)),
      states: new Set(j.states.map((s) => s.name)),
      // ⚠ 这里必须是 **03-store.json 自身** 的 sha256（不是它 inputs[0] 里 shared.js 的），
      // 否则 99 的新鲜度校验会永远对不上。
      sha: sha256(STORE),
    };
  } catch (_) {
    return { actions: new Set(), states: new Set(), sha: null };
  }
}

function main() {
  const names = loadStoreNames();
  if (!names.actions.size) console.warn('[04-components] ⚠ 未读到 outputs/03-store.json，按钮将无法区分 state/action，请先跑 03-store.cjs');

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.jsx') && f !== 'shared.js').sort();
  const comps = files
    .map((f) => {
      const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
      const text = blankComments(raw);
      return analyzeComponent(text, {
        name: path.basename(f, '.jsx'),
        actions: names.actions,
        states: names.states,
      });
    })
    .sort((a, b) => b.lines - a.lines);

  const allButtons = comps.flatMap((c) => c.buttons);
  const byKind = {};
  for (const b of allButtons) byKind[b.kind] = (byKind[b.kind] || 0) + 1;
  const resolved = allButtons.filter((b) => b.effects.actions.length || b.effects.ipc.length).length;

  const result = {
    generated_by: 'scripts/04-components.cjs',
    inputs: [
      ...files.map((f) => ({ path: `inputs/pipeline_step/project/src/expanded_components/${f}`, sha256: sha256(path.join(DIR, f)) })),
      { path: 'outputs/03-store.json', sha256: names.sha },
    ],
    stats: {
      total: comps.length,
      withLabels: comps.filter((c) => c.labels.length).length,
      withButtons: comps.filter((c) => c.buttons.length).length,
      withIpc: comps.filter((c) => c.ipc.length).length,
      withStore: comps.filter((c) => c.store.length).length,
      withImports: comps.filter((c) => c.imports.length).length,
      totalButtons: allButtons.length,
      buttonsResolved: resolved,
      buttonsByKind: byKind,
      totalLocals: comps.reduce((s, c) => s + c.bindings.locals.length, 0),
      totalStates: comps.reduce((s, c) => s + c.bindings.states.length, 0),
      withSetStateFields: comps.filter((c) => (c.setStateFields || []).length).length,
      setStateFields: [...new Set(comps.flatMap((c) => c.setStateFields || []))].sort(),
    },
    components: comps,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  const st = result.stats;
  console.log(`[04-components] 组件 ${st.total} / 按钮 ${st.totalButtons}（已追到 store/IPC ${st.buttonsResolved}）`);
  console.log(`[04-components] 按钮分类 ${Object.entries(byKind).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  console.log(`[04-components] 有 IPC ${st.withIpc} / 有 store ${st.withStore} / 有子组件 ${st.withImports}`);
  console.log(`[04-components] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 04 · 组件完整规格（机器生成）');
  L.push('');
  L.push('> 由 `scripts/04-components.cjs` 一次提全组件信息，勿手改；重跑 `node scripts/04-components.cjs`。');
  L.push(`> 组件 ${r.stats.total} / 按钮 ${r.stats.totalButtons}；按钮分类：${Object.entries(r.stats.buttonsByKind).map(([k, v]) => `\`${k}\`×${v}`).join(' ')}。`);
  L.push('');
  for (const c of r.components) {
    L.push(`## ${c.name}（${c.lines} 行）`);
    L.push('');
    if (c.props) L.push(`- props: \`{ ${c.props} }\``);
    L.push(`- hooks: useState×${c.hooks.useState} useRef×${c.hooks.useRef} useMemo×${c.hooks.useMemo} useEffect×${c.hooks.useEffect}`);
    if (c.imports.length) L.push(`- 子组件: ${c.imports.map((x) => '`' + x + '`').join(' ')}`);
    if (c.layout.length) L.push(`- 布局: ${c.layout.map((x) => '`' + x + '`').join(' ')}`);
    if (c.store.length) L.push(`- store: ${c.store.map((x) => '`' + x + '`').join(' ')}`);
    if (c.setStateFields && c.setStateFields.length) L.push(`- 直接写 store（\`L.setState\`）: ${c.setStateFields.map((x) => '`' + x + '`').join(' ')}`);
    if (c.ipc.length) L.push(`- IPC: ${c.ipc.map((x) => '`' + x + '`').join(' ')}`);
    if (c.events.length) L.push(`- 事件: ${c.events.map((x) => '`' + x + '`').join(' ')}`);
    if (c.labels.length) L.push(`- 文案: ${c.labels.slice(0, 15).map((s) => '「' + s + '」').join(' ')}${c.labels.length > 15 ? ' …' : ''}`);
    if (c.inputs.length) L.push(`- 输入: ${c.inputs.map((x) => '`' + x.tag + (x.placeholder ? ':' + x.placeholder : '') + '`').join(' ')}`);

    // 局部绑定（下游照写时要还原的变量名）
    const sel = c.bindings.selectors;
    if (sel.length) {
      L.push(`- 绑定（局部变量 → store）: ${sel.map((s) => `\`${s.var}\`→\`${s.field}\`(${s.kind === 'action' ? 'action' : s.kind === 'state' ? 'state' : '?'})`).join(' ')}`);
    }
    if (c.bindings.states.length) {
      L.push(`- useState: ${c.bindings.states.map((s) => `\`${s.state}\`/\`${s.setter}\``).join(' ')}`);
    }
    if (c.bindings.locals.length) {
      L.push(`- 局部函数: ${c.bindings.locals.map((s) => `\`${s.name}\`(${s.kind})`).join(' ')}`);
    }

    if (c.buttons.length) {
      L.push('');
      L.push('| 行 | 图标 | 文案 | title | 事件 | 来源 | 解析链 |');
      L.push('|---|---|---|---|---|---|---|');
      for (const b of c.buttons) {
        const chain = b.effects.chain.length
          ? b.effects.chain.map((x) => '`' + x.replace(/:/, ' → ') + '`').join(' ')
          : `（${KIND_LABEL[b.kind] || b.kind}）`;
        L.push(`| ${b.line} | ${b.icon ? '`' + b.icon + '`' : '—'} | ${b.label || '—'} | ${b.title || ''} | \`${b.event}\` | ${b.via} | ${chain} |`);
      }
    }
    L.push('');
  }
  return L.join('\n');
}

main();
