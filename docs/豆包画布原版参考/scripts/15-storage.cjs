#!/usr/bin/env node
/**
 * 15-storage.cjs —— 渲染层 localStorage 结构：消费 dist-evidence 的 storage 节点，
 *   提取 localStorage key，并和 store state 交叉（key 去 doubao- 前缀 → state 字段）。
 *
 * 输入：inputs/rea/dist-evidence.json + outputs/03-store.json
 * 输出：outputs/15-存储结构.json + outputs/15-存储结构.md
 * 幂等、可重跑：node scripts/15-storage.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'inputs', 'rea', 'dist-evidence.json');
const STORE = path.join(ROOT, 'outputs', '03-store.json');
const OUT_JSON = path.join(ROOT, 'outputs', '15-存储结构.json');
const OUT_MD = path.join(ROOT, 'outputs', '15-存储结构.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function main() {
  const s = fs.readFileSync(DIST, 'utf8').replace(/^\uFEFF/, '');
  const j = JSON.parse(s);
  const g = j.normalized_result && j.normalized_result.graph;

  // storage 节点（local-storage namespace，排除 call: 节点）
  const keys = [];
  for (const n of g.nodes || []) {
    if (n.kind !== 'storage') continue;
    const k = n.identity && n.identity.key;
    if (!k || k.startsWith('call:')) continue;
    const obs = (n.observations || [])[0];
    keys.push({
      key: k,
      storageKind: (obs && obs.properties && obs.properties.storage_kind) || 'local-storage',
      mechanism: (obs && obs.properties && obs.properties.mechanism) || '',
      evidence: (obs && obs.evidence && obs.evidence.authority) || '',
    });
  }

  // 和 store state 交叉（机器推导：去前缀 → kebab→camel → 直接匹配 → 子串匹配 → 快照字段）
  const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const stateNames = new Set(store.states.map((x) => x.name));
  // 画布复合字段：从 05 快照格式机器提取 {nodes, edges, library}
  let canvasFields = [];
  try {
    const canvas = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', '05-画布模型.json'), 'utf8'));
    if (canvas.snapshotFormat) canvasFields = [...canvas.snapshotFormat.matchAll(/(\w+):\s*e\.\w+/g)].map((x) => x[1]);
  } catch (_) {}
  const kebabToCamel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  for (const k of keys) {
    const candidate = k.key.replace(/^doubao-/, '');
    const camel = kebabToCamel(candidate);
    if (stateNames.has(candidate)) k.state = candidate;
    else if (stateNames.has(camel)) k.state = camel;
    else if (candidate === 'canvas' && canvasFields.length) k.state = canvasFields.join('/') + '（画布复合，from 05 快照）';
    else {
      const sub = [...stateNames].find((s) => candidate.includes(s) || s.includes(candidate));
      k.state = sub || null;
    }
    k.persisted = !!k.state;
  }

  const result = {
    generated_by: 'scripts/15-storage.cjs',
    inputs: [
      { path: 'inputs/rea/dist-evidence.json', sha256: sha256(DIST) },
      { path: 'outputs/03-store.json', sha256: sha256(STORE) },
    ],
    stats: { keys: keys.length, mappedToState: keys.filter((k) => k.state).length },
    keys,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[15-storage] localStorage key ${keys.length} / 对应 state ${result.stats.mappedToState}`);
  console.log(`[15-storage] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 15 · 渲染层 localStorage 结构（机器生成）');
  L.push('');
  L.push('> 由 `scripts/15-storage.cjs` 消费 dist-evidence 的 storage 节点，勿手改。');
  L.push('');
  L.push('| localStorage key | 对应 store state | 机制 | 证据 |');
  L.push('|---|---|---|---|');
  for (const k of r.keys) {
    L.push(`| \`${k.key}\` | ${k.state ? '`' + k.state + '`' : '—'} | ${k.mechanism} | ${k.evidence} |`);
  }
  L.push('');
  return L.join('\n');
}

main();
