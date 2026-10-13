#!/usr/bin/env node
/**
 * 09-relations.cjs —— 数据流串联：把 03（store）、04（组件）、01（IPC）连成端到端关系。
 *   输出三张关系表：
 *   1. store 字段 → 谁写（action）/ 谁读（组件）
 *   2. IPC 通道 → 谁调（组件 + action）/ 谁处理（handler）
 *
 * 输入：outputs/03-store.json + outputs/04-组件规格.json + outputs/05-IPC契约.json
 * 输出：outputs/09-数据流.json + outputs/09-数据流.md
 * 幂等、可重跑：node scripts/09-relations.cjs（依赖 01/03/04 先跑）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'outputs');
const OUT_JSON = path.join(OUT, '09-数据流.json');
const OUT_MD = path.join(OUT, '09-数据流.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(OUT, name), 'utf8'));
}

function main() {
  const store = load('03-store.json');
  const comps = load('04-组件规格.json');
  const ipc = load('05-IPC契约.json');

  // 字段 → 写它的 action
  const fieldWriters = new Map();
  for (const a of store.actions) {
    for (const w of a.writes) {
      if (!fieldWriters.has(w)) fieldWriters.set(w, new Set());
      fieldWriters.get(w).add(a.name);
    }
  }
  // 字段 → 组件直接写（`L.setState({ field: … })`）。没有这一列，字段表会漏行。
  const fieldComponentWriters = new Map();
  for (const c of comps.components) {
    for (const f of c.setStateFields || []) {
      if (!fieldComponentWriters.has(f)) fieldComponentWriters.set(f, new Set());
      fieldComponentWriters.get(f).add(c.name);
    }
  }

  // state 清单 + action 清单（区分"读 state"和"调 action"）
  const stateNames = new Set(store.states.map((s) => s.name));
  const actionNames = new Set(store.actions.map((a) => a.name));

  // 字段 → 读它的组件（只算 state）；action → 调用它的组件
  const fieldReaders = new Map();
  const actionCallers = new Map();
  for (const c of comps.components) {
    for (const s of c.store) {
      if (stateNames.has(s)) {
        if (!fieldReaders.has(s)) fieldReaders.set(s, new Set());
        fieldReaders.get(s).add(c.name);
      } else if (actionNames.has(s)) {
        if (!actionCallers.has(s)) actionCallers.set(s, new Set());
        actionCallers.get(s).add(c.name);
      }
    }
  }

  // IPC → 调它的 action + 组件
  const ipcCallers = new Map();
  for (const a of store.actions) {
    for (const i of a.ipc) {
      if (!ipcCallers.has(i)) ipcCallers.set(i, { actions: new Set(), components: new Set() });
      ipcCallers.get(i).actions.add(a.name);
    }
  }
  for (const c of comps.components) {
    for (const i of c.ipc) {
      if (!ipcCallers.has(i)) ipcCallers.set(i, { actions: new Set(), components: new Set() });
      ipcCallers.get(i).components.add(c.name);
    }
  }

  // 汇总：state 字段（谁写 + 谁读）
  const allFields = new Set([...fieldWriters.keys(), ...fieldComponentWriters.keys(), ...fieldReaders.keys()]);
  const fields = [...allFields].filter((f) => stateNames.has(f)).sort().map((f) => ({
    field: f,
    writtenBy: [...(fieldWriters.get(f) || [])].sort(),
    writtenByComponents: [...(fieldComponentWriters.get(f) || [])].sort(),
    readBy: [...(fieldReaders.get(f) || [])].sort(),
  }));

  // 没有任何数据流的 state 字段（既不写也不读）——单列，避免「表里没这行 = 这字段不存在」的误读
  const listed = new Set(fields.map((f) => f.field));
  const fieldsWithoutFlow = store.states.map((s) => s.name).filter((n) => !listed.has(n)).sort();

  // 汇总：action 调用关系（谁调 + 写哪些字段 + 调哪些 IPC）
  const actions = [...actionCallers.keys()].sort().map((a) => {
    const act = store.actions.find((x) => x.name === a);
    return {
      action: a,
      calledBy: [...(actionCallers.get(a) || [])].sort(),
      writes: act ? act.writes : [],
      ipc: act ? act.ipc : [],
    };
  });

  // apiName(camelCase) -> channel(kebab-case) 映射（04 用 window.api 方法名 camelCase，01 用通道名 kebab-case）
  const apiNameToChannel = new Map();
  for (const c of ipc.channels || []) {
    if (c.apiName) apiNameToChannel.set(c.apiName, c.channel);
    apiNameToChannel.set(c.channel, c.channel);
  }

  // IPC 通道（调用者用 camelCase → 映射到 kebab-case 找 handler）
  const allIpc = new Set(ipcCallers.keys());
  const ipcRows = [...allIpc].sort().map((i) => {
    const ch = apiNameToChannel.get(i) || i;
    const h = (ipc.channels || []).find((c) => c.channel === ch);
    return {
      channel: ch,
      apiName: i,
      calledByActions: [...(ipcCallers.get(i).actions)].sort(),
      calledByComponents: [...(ipcCallers.get(i).components)].sort(),
      handler: h && h.handlers && h.handlers.length
        ? h.handlers.map((x) => `${x.file}:${x.line}`).join(', ')
        : (h && h.kind === 'event' ? 'event 推送' : ''),
    };
  });

  const result = {
    generated_by: 'scripts/09-relations.cjs',
    inputs: [
      { path: 'outputs/03-store.json', sha256: sha256(path.join(OUT, '03-store.json')) },
      { path: 'outputs/04-组件规格.json', sha256: sha256(path.join(OUT, '04-组件规格.json')) },
      { path: 'outputs/05-IPC契约.json', sha256: sha256(path.join(OUT, '05-IPC契约.json')) },
    ],
    stats: {
      fields: fields.length,
      actions: actions.length,
      ipcChannels: ipcRows.length,
      stateTotal: store.states.length,
      fieldsWithoutFlow: fieldsWithoutFlow.length,
      componentWrittenFields: fieldComponentWriters.size,
    },
    fields,
    fieldsWithoutFlow,
    actions,
    ipc: ipcRows,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');
  console.log(`[09-relations] state 字段 ${fields.length}/${store.states.length}（无数据流 ${fieldsWithoutFlow.length}）/ action 调用 ${actions.length} / IPC 通道 ${ipcRows.length}`);
  console.log(`[09-relations] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 09 · 数据流（机器生成）');
  L.push('');
  L.push('> 由 `scripts/09-relations.cjs` 交叉 03/04/01 生成，勿手改；重跑 `node scripts/09-relations.cjs`。');
  L.push('');
  L.push('## store 字段数据流（谁写 / 谁读）');
  L.push('');
  L.push(`> ⚠ **静态抽取，可能漏行；字段真源是 04-store 的 action 函数体**（本表只列「有数据流」的字段）。`);
  L.push(`> 覆盖：state ${r.stats.stateTotal} 个中 ${r.stats.fields} 个有数据流；剩余 ${r.stats.fieldsWithoutFlow} 个见下方「无数据流字段」。`);
  L.push('');
  L.push('| 字段 | 写入（action） | 写入（组件 `L.setState`） | 读取（组件） |');
  L.push('|---|---|---|---|');
  for (const f of r.fields) {
    L.push(`| \`${f.field}\` | ${f.writtenBy.map((x) => '`' + x + '`').join(' ') || '—'} | ${(f.writtenByComponents || []).map((x) => '`' + x + '`').join(' ') || '—'} | ${f.readBy.map((x) => '`' + x + '`').join(' ') || '—'} |`);
  }
  L.push('');
  if (r.fieldsWithoutFlow && r.fieldsWithoutFlow.length) {
    L.push(`### 无数据流字段（${r.fieldsWithoutFlow.length} 个）`);
    L.push('');
    L.push('> 静态既没扫到 action 写、也没扫到组件读。可能是只在 action 的 **helper** 里写、或只被运行时/外部读写。');
    L.push('');
    L.push(r.fieldsWithoutFlow.map((x) => '`' + x + '`').join(' '));
    L.push('');
  }
  L.push('## action 调用关系（谁调 / 写哪些字段 / 调哪些 IPC）');
  L.push('');
  L.push('| action | 调用组件 | 写入字段 | 调 IPC |');
  L.push('|---|---|---|---|');
  for (const a of r.actions) {
    L.push(`| \`${a.action}\` | ${a.calledBy.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.writes.map((x) => '`' + x + '`').join(' ') || '—'} | ${a.ipc.map((x) => '`' + x + '`').join(' ') || '—'} |`);
  }
  L.push('');
  L.push('## IPC 通道数据流（谁调 / 谁处理）');
  L.push('');
  L.push('| 通道 | 调用 action | 调用组件 | 主进程 handler |');
  L.push('|---|---|---|---|');
  for (const i of r.ipc) {
    L.push(`| \`${i.channel}\` | ${i.calledByActions.map((x) => '`' + x + '`').join(' ') || '—'} | ${i.calledByComponents.map((x) => '`' + x + '`').join(' ') || '—'} | ${i.handler || '—'} |`);
  }
  L.push('');
  return L.join('\n');
}

main();
