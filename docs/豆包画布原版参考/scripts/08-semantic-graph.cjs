#!/usr/bin/env node
/**
 * 08-semantic-graph.cjs —— 消费 records[6] 主进程分析结果：
 *   - semantic_graph（符号级）：节点 kind 分布 + 关系类型分布
 *   - graph（应用级）：实体 kind 分布 + 模块间依赖 + IPC handler↔channel 配对
 *
 * 输入：inputs/rea/rea-evidence-bundle.json（60MB，只读 records[6]）
 * 输出：outputs/08-语义图.json + outputs/08-语义图.md
 * 幂等、可重跑：node scripts/08-semantic-graph.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = path.join(ROOT, 'inputs', 'rea', 'rea-evidence-bundle.json');
const OUT_JSON = path.join(ROOT, 'outputs', '08-语义图.json');
const OUT_MD = path.join(ROOT, 'outputs', '08-语义图.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function countBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x) || '(none)'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function main() {
  const t0 = Date.now();
  const j = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  const nr = j.records[6].normalized_result;
  const sg = nr.semantic_graph;
  const graph = nr.graph;

  // ---- 符号级（semantic_graph）----
  const sgKindDist = countBy(sg.nodes || [], (n) => n.kind);
  const sgRelDist = countBy(sg.relations || [], (r) => r.relation);

  // ---- 应用级（graph）----
  const gNodes = graph.nodes || [];
  const gEdges = graph.edges || [];
  const gKindDist = countBy(gNodes, (n) => n.kind);
  const gRelDist = countBy(gEdges, (e) => e.relation);

  // node_id → {kind, key}
  const gNode = new Map();
  for (const n of gNodes) {
    gNode.set(n.node_id, { kind: n.kind, key: (n.identity && n.identity.key) || null });
  }

  // 模块依赖：javascript-module 之间的边
  const moduleDeps = new Map();
  const kindPairs = new Map();
  for (const e of gEdges) {
    const s = gNode.get(e.source_node_id);
    const t = gNode.get(e.target_node_id);
    if (!s || !t) continue;
    const pk = s.kind + ' -> ' + t.kind;
    kindPairs.set(pk, (kindPairs.get(pk) || 0) + 1);
    if (s.kind === 'javascript-module' && t.kind === 'javascript-module' && s.key && t.key && s.key !== t.key) {
      const k = s.key + ' -> ' + t.key;
      moduleDeps.set(k, (moduleDeps.get(k) || 0) + 1);
    }
  }

  // IPC handler ↔ channel 配对（ipc-handler ↔ ipc-channel）
  const ipcPairs = [];
  for (const e of gEdges) {
    const s = gNode.get(e.source_node_id);
    const t = gNode.get(e.target_node_id);
    if (!s || !t) continue;
    if ((s.kind === 'ipc-handler' && t.kind === 'ipc-channel') || (s.kind === 'ipc-channel' && t.kind === 'ipc-handler')) {
      const h = s.kind === 'ipc-handler' ? s.key : t.key;
      const c = s.kind === 'ipc-channel' ? s.key : t.key;
      ipcPairs.push({ handler: h, channel: c });
    }
  }

  const result = {
    generated_by: 'scripts/08-semantic-graph.cjs',
    inputs: [{ path: 'inputs/rea/rea-evidence-bundle.json', sha256: sha256(BUNDLE) }],
    semantic: {
      nodes: (sg.nodes || []).length, relations: (sg.relations || []).length, unknowns: (sg.unknowns || []).length,
      nodeKindDist: sgKindDist, relationDist: sgRelDist,
    },
    graph: {
      nodes: gNodes.length, edges: gEdges.length,
      nodeKindDist: gKindDist, relationDist: gRelDist, kindPairs: kindPairs,
      moduleDeps: [...moduleDeps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 150).map(([k, v]) => ({ dep: k, count: v })),
      ipcPairs,
    },
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[08-semantic-graph] 符号级: 节点 ${result.semantic.nodes} / 关系 ${result.semantic.relations} | 应用级: 节点 ${result.graph.nodes} / 边 ${result.graph.edges} / 模块依赖 ${result.graph.moduleDeps.length} / IPC 配对 ${result.graph.ipcPairs.length}`);
  console.log(`[08-semantic-graph] 耗时 ${Date.now() - t0}ms`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 08 · 主进程语义图 + 应用图（机器生成）');
  L.push('');
  L.push('> 由 `scripts/08-semantic-graph.cjs` 消费 records[6] 生成，勿手改。');
  L.push('');
  L.push('## 应用级实体（graph）');
  L.push('');
  L.push('| kind | 数量 |');
  L.push('|---|---|');
  for (const [k, v] of r.graph.nodeKindDist) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  L.push('### 实体关系对（kind -> kind）');
  L.push('');
  L.push('| 关系 | 次数 |');
  L.push('|---|---|');
  for (const [k, v] of r.graph.kindPairs) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  L.push('## 模块间依赖（javascript-module -> javascript-module）');
  L.push('');
  L.push('| 依赖 | 次数 |');
  L.push('|---|---|');
  for (const d of r.graph.moduleDeps.slice(0, 80)) L.push(`| \`${d.dep}\` | ${d.count} |`);
  L.push('');
  L.push('## 符号级关系类型（semantic_graph）');
  L.push('');
  L.push('| relation | 数量 |');
  L.push('|---|---|');
  for (const [k, v] of r.semantic.relationDist) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  L.push('## 符号级节点 kind');
  L.push('');
  L.push('| kind | 数量 |');
  L.push('|---|---|');
  for (const [k, v] of r.semantic.nodeKindDist) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  return L.join('\n');
}

main();
