#!/usr/bin/env node
/**
 * 14-component-flows.cjs —— 组件交互链路：追踪「触发器按钮 → setState → 条件渲染面板 → 面板内按钮 → 操作」。
 *
 * 旧版只认 `setter(x => !x)` 一种形态、且面板要求 className 与 `{state &&` 同行，
 * 294 个按钮只追出 1 条链路。新版泛化：
 *   - 触发器：任意 setter 调用（含 `he(false)` / `q(node)` / `X('mode')`）
 *   - 面板：`{state && ...}` / `{state ? ...}` 条件块（括号配平取整块，不限行）
 *   - 面板内按钮：按**行号落在面板块范围内**判定，直接复用 04 的事件解析链
 *
 * 输入：inputs/.../expanded_components/*.jsx + outputs/03-store.json
 * 输出：outputs/14-交互链路.json + outputs/14-交互链路.md
 * 幂等、可重跑：node scripts/14-component-flows.cjs（依赖 03-store 先跑）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { blankComments, balancedEnd, lineOf, analyzeComponent } = require('./_lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components');
const STORE = path.join(ROOT, 'outputs', '03-store.json');
const OUT_JSON = path.join(ROOT, 'outputs', '14-交互链路.json');
const OUT_MD = path.join(ROOT, 'outputs', '14-交互链路.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function loadStoreNames() {
  try {
    const j = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    // ⚠ sha 必须是 **03-store.json 自身** 的（不是它 inputs[0] 里 shared.js 的）
    return { actions: new Set(j.actions.map((a) => a.name)), states: new Set(j.states.map((s) => s.name)), sha: sha256(STORE) };
  } catch (_) {
    return { actions: new Set(), states: new Set(), sha: null };
  }
}

// 找 state 驱动的条件渲染块：{ state && … } / { state ? … }
function findPanels(text, state) {
  const out = [];
  const re = new RegExp('\\{\\s*' + state + '\\b', 'g');
  let m;
  while ((m = re.exec(text))) {
    const openIdx = m.index;
    const end = balancedEnd(text, openIdx);
    if (end < 0) { re.lastIndex = openIdx + 1; continue; }
    const seg = text.slice(openIdx, Math.min(end, openIdx + 4000));
    const cls = (seg.match(/className="([^"]+)"/) || [])[1] || '';
    out.push({ cls, start: openIdx, end, startLine: lineOf(text, openIdx), endLine: lineOf(text, end) });
    re.lastIndex = end;
  }
  return out;
}

function extract(file, names) {
  const raw = fs.readFileSync(file, 'utf8');
  const text = blankComments(raw);
  const name = path.basename(file, '.jsx');
  const c = analyzeComponent(text, { name, actions: names.actions, states: names.states });

  const byState = new Map(); // state → { setter, triggers: [], panels: [] }
  for (const s of c.bindings.states) byState.set(s.state, { setter: s.setter, triggers: [], panels: [] });
  for (const b of c.buttons) {
    for (const st of b.effects.setState) {
      if (!byState.has(st)) byState.set(st, { setter: '', triggers: [], panels: [] });
      byState.get(st).triggers.push({ label: b.label, title: b.title, icon: b.icon, line: b.line, event: b.event, via: b.via });
    }
  }
  for (const [st, rec] of byState) rec.panels = findPanels(text, st);

  const flows = [];
  const toggles = [];
  for (const [st, rec] of byState) {
    if (!rec.triggers.length) continue;
    if (!rec.panels.length) {
      toggles.push({ state: st, setter: rec.setter, triggers: rec.triggers.map((t) => t.label || t.title || t.icon) });
      continue;
    }
    for (const p of rec.panels) {
      const items = c.buttons
        .filter((b) => b.line >= p.startLine && b.line <= p.endLine && !(b.effects.setState.includes(st) && b.line <= p.startLine))
        .map((b) => ({
          label: b.label, title: b.title, icon: b.icon, line: b.line,
          kind: b.kind, chain: b.effects.chain,
        }));
      flows.push({
        state: st, setter: rec.setter,
        triggers: rec.triggers,
        panel: { className: p.cls, startLine: p.startLine, endLine: p.endLine },
        items,
      });
    }
  }
  return { name, lines: text.split('\n').length, flows, toggles };
}

function main() {
  const names = loadStoreNames();
  if (!names.actions.size) console.warn('[14-flows] ⚠ 未读到 outputs/03-store.json，请先跑 03-store.cjs');
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.jsx') && f !== 'shared.js').sort();
  const comps = files.map((f) => extract(path.join(DIR, f), names)).filter((c) => c.flows.length).sort((a, b) => b.flows.length - a.flows.length);

  const totalFlows = comps.reduce((s, c) => s + c.flows.length, 0);
  const totalItems = comps.reduce((s, c) => s + c.flows.reduce((t, f) => t + f.items.length, 0), 0);
  const itemsWithAction = comps.reduce((s, c) => s + c.flows.reduce((t, f) => t + f.items.filter((i) => i.chain.some((x) => x.startsWith('action:') || x.includes('action:'))).length, 0), 0);

  const result = {
    generated_by: 'scripts/14-component-flows.cjs',
    inputs: [
      ...files.map((f) => ({ path: `inputs/pipeline_step/project/src/expanded_components/${f}`, sha256: sha256(path.join(DIR, f)) })),
      { path: 'outputs/03-store.json', sha256: names.sha },
    ],
    stats: {
      componentsWithFlows: comps.length,
      flows: totalFlows,
      panelItems: totalItems,
      panelItemsWithAction: itemsWithAction,
      toggles: comps.reduce((s, c) => s + c.toggles.length, 0),
    },
    components: comps,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  const st = result.stats;
  console.log(`[14-flows] 有链路组件 ${st.componentsWithFlows} / 链路 ${st.flows} / 面板内操作 ${st.panelItems}（含 store action ${st.panelItemsWithAction}）`);
  console.log(`[14-flows] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 14 · 组件交互链路（机器生成）');
  L.push('');
  L.push('> 由 `scripts/14-component-flows.cjs` 追踪「触发器 → setState → 面板 → 面板内操作」，勿手改。');
  L.push(`> 有链路组件 ${r.stats.componentsWithFlows} / 链路 ${r.stats.flows} / 面板内操作 ${r.stats.panelItems}（其中解析到 store action 的 ${r.stats.panelItemsWithAction}）。`);
  L.push('');
  for (const c of r.components) {
    L.push(`## ${c.name}`);
    L.push('');
    for (const f of c.flows) {
      const trig = f.triggers.map((t) => `「${t.label || t.title || t.icon || '?'}」(行 ${t.line})`).join('、');
      L.push(`- ${trig} → \`${f.setter}(${f.state})\` → 面板 \`${f.panel.className || '(无条件 className)'}\`（行 ${f.panel.startLine}-${f.panel.endLine}）`);
      for (const it of f.items) {
        const chain = it.chain.length ? it.chain.map((x) => '`' + x.replace(/:/, ' → ') + '`').join(' ') : `（${it.kind}）`;
        L.push(`  - ${it.icon ? '`' + it.icon + '` ' : ''}${it.label || it.title || '—'} → ${chain}`);
      }
    }
    if (c.toggles.length) {
      L.push('');
      L.push(`- 无面板的状态切换：${c.toggles.map((t) => `\`${t.setter}(${t.state})\`（${t.triggers.join('、')}）`).join('；')}`);
    }
    L.push('');
  }
  return L.join('\n');
}

main();
