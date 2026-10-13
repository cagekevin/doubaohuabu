#!/usr/bin/env node
/**
 * 05-canvas-model.cjs —— 画布数据模型：节点类型枚举、节点 data 字段、引用格式、项目快照格式。
 *
 * 输入：
 *   - inputs/pipeline_step/project/src/expanded_components/shared.js（store 内 type 枚举 + 节点创建 action 参数）
 *   - inputs/electron/main.js + preload.js（img:// / vid:// 引用 + 保存格式）
 * 输出：outputs/05-画布模型.json + outputs/05-画布模型.md
 * 幂等、可重跑：node scripts/05-canvas-model.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components', 'shared.js');
const MAIN = path.join(ROOT, 'inputs', 'electron', 'main.js');
const PRELOAD = path.join(ROOT, 'inputs', 'electron', 'preload.js');
const OUT_JSON = path.join(ROOT, 'outputs', '05-画布模型.json');
const OUT_MD = path.join(ROOT, 'outputs', '05-画布模型.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// 定位 store return 对象范围
function findStoreRange(text) {
  const m = text.match(/const\s+L\s*=\s*(\w+)\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*\{\s*return\s*\{/);
  if (!m) return null;
  const braceIdx = m.index + m[0].length - 1;
  // 匹配 return 对象的结束花括号
  let depth = 0, i = braceIdx, inStr = false, strCh = '';
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === strCh) inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return { start: braceIdx, end: i }; }
  }
  return null;
}

// 提取节点 type 枚举（store 范围内的 type: 'xxx'）
function nodeTypes(text, range) {
  const slice = text.slice(range.start, range.end);
  const types = new Set();
  const re = /type:\s*['"]([a-z]+)['"]/g;
  let m;
  while ((m = re.exec(slice))) types.add(m[1]);
  return [...types].sort();
}

// 提取节点创建 action 的参数（data 字段候选）：add 开头 + 对象解构参数
function nodeActions(text, range) {
  const slice = text.slice(range.start, range.end);
  const out = [];
  // 顶层 key: value 里，找 add 开头的函数，其参数是对象解构
  const re = /^(\s{4})(add[A-Za-z]+)\s*:\s*\(\s*\{([^}]*)\}\s*[,)]/gm;
  let m;
  while ((m = re.exec(slice))) {
    if (/Preset|Share|Error/.test(m[2])) continue; // 排除非节点创建的 add（addPreset/addVideoShare/addBackendError）
    const fields = m[3].split(',').map((s) => {
      const mm = s.trim().match(/^(\w+)/);
      return mm ? mm[1] : s.trim();
    }).filter(Boolean);
    out.push({ action: m[2], fields });
  }
  return out;
}

// img:// / vid:// 引用格式（从 main.js / preload.js 注释与实现）
function refFormats() {
  const preload = fs.readFileSync(PRELOAD, 'utf8');
  const main = fs.readFileSync(MAIN, 'utf8');
  const facts = [];
  // preload 注释里的格式说明
  const preloadHints = preload.match(/\/\/[^\n]*(img:\/\/|vid:\/\/)[^\n]*/g) || [];
  const mainHints = main.match(/\/\/[^\n]*(img:\/\/|vid:\/\/)[^\n]*/g) || [];
  // main.js 里 img-save-sync / save-video-from-url 的落盘实现片段
  const imgSave = main.match(/ipcMain\.on\('img-save-sync'[\s\S]{0,400}?\)\s*;?/);
  const vidSave = main.match(/ipcMain\.handle\('save-video-from-url'[\s\S]{0,500}?\)\s*;?/);
  return {
    preloadHints: preloadHints.map((s) => s.replace(/^\s*\/\/\s?/, '').trim()),
    mainHints: mainHints.map((s) => s.replace(/^\s*\/\/\s?/, '').trim()),
    imgSave: imgSave ? imgSave[0].slice(0, 400) : null,
    vidSave: vidSave ? vidSave[0].slice(0, 500) : null,
  };
}

// 项目快照格式（Td 函数：structuredClone({nodes, edges, library})）
function snapshotFormat(text) {
  const m = text.match(/const\s+Td\s*=\s*e\s*=>\s*\{[\s\S]{0,200}?return\s+structuredClone\(([^)]+)\)/);
  if (m) return m[1].trim();
  return null;
}

// 从字段 value 推断类型（重点看 `|| 默认值`）
function inferDataType(val) {
  const dm = val.match(/\|\|\s*('([^']*)'|"([^"]*)"|`([^`]*)`|true|false|null|\d+|\[\]|\{\})/);
  if (dm) {
    const d = dm[1];
    if (/^['"`]/.test(d)) return 'string';
    if (d === 'true' || d === 'false') return 'boolean';
    if (d === 'null') return 'unknown';
    if (/^\d/.test(d)) return 'number';
    if (d === '[]') return 'array';
    if (d === '{}') return 'object';
  }
  if (/^\[\]/.test(val)) return 'array';
  if (/^\{\}/.test(val)) return 'object';
  if (/^true\b|^false\b/.test(val)) return 'boolean';
  if (/^\d/.test(val)) return 'number';
  if (/^['"`]/.test(val)) return 'string';
  return 'unknown';
}

// 字段名 → 类型启发式（当字面量推断不出时，用字段名语义补足）
function inferByName(name) {
  if (/(id|url|vid|name|label|poster|account|channel|text|model|src|path|folder|prompt|recipe|sourceLabel|reason|email|phone|code)$/i.test(name)) return 'string';
  if (/(width|height|duration|count|size|time|ratio|slot|pos|attempt|progress|percent|amount|index|number|page|zoom)$/i.test(name)) return 'number';
  if (/(snap|favorite|enabled|visible|locked|active|is[A-Z]|has[A-Z])$/i.test(name)) return 'boolean';
  if (/(ids|nodes|edges|items|results|list|library|styleIds|linkOrder|history)$/i.test(name)) return 'array';
  return 'unknown';
}

// 节点 data schema：每个 type 的 data 顶层字段 + 默认值 + 推断类型
function nodeDataSchema(text, range) {
  const slice = text.slice(range.start, range.end);
  const schema = new Map(); // type -> Map(field -> value)
  const typeRe = /type:\s*'([a-z]+)'/g;
  let m;
  while ((m = typeRe.exec(slice))) {
    const type = m[1];
    const after = slice.slice(m.index);
    const dm = after.match(/data:\s*\{/);
    if (!dm) continue;
    const dataIdx = m.index + dm.index + dm[0].length - 1;
    let depth = 0, i = dataIdx, inStr = false, strCh = '';
    const fields = new Map();
    let curKey = '', keyStart = false;
    for (; i < slice.length; i++) {
      const c = slice[i];
      if (inStr) { if (c === '\\') { i++; continue; } if (c === strCh) inStr = false; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
      if (c === '{') { depth++; continue; }
      if (c === '}') { depth--; if (depth === 0) break; continue; }
      if (depth === 1) {
        if (!keyStart && /[A-Za-z_$]/.test(c)) { curKey = c; keyStart = true; continue; }
        if (keyStart && /[A-Za-z0-9_$]/.test(c)) { curKey += c; continue; }
        if (keyStart && c === ':') {
          // 提取 value（到顶层逗号）
          let val = '', vD = 0, vP = 0, vB = 0, vin = false, vCh = '';
          for (let k = i + 1; k < slice.length; k++) {
            const cc = slice[k];
            if (vin) { if (cc === '\\') { k++; val += cc; continue; } if (cc === vCh) vin = false; val += cc; continue; }
            if (cc === '"' || cc === "'" || cc === '`') { vin = true; vCh = cc; val += cc; continue; }
            if (cc === '{') { vD++; val += cc; continue; }
            if (cc === '}') { if (vD === 0) { i = k - 1; break; } vD--; val += cc; continue; }
            if (cc === '(') { vP++; val += cc; continue; }
            if (cc === ')') { vP = Math.max(0, vP - 1); val += cc; continue; }
            if (cc === '[') { vB++; val += cc; continue; }
            if (cc === ']') { vB = Math.max(0, vB - 1); val += cc; continue; }
            if (cc === ',' && vD === 0 && vP === 0 && vB === 0) { i = k; break; }
            val += cc;
          }
          fields.set(curKey, val.trim());
          curKey = ''; keyStart = false;
          continue;
        }
        curKey = ''; keyStart = false;
      }
    }
    if (!schema.has(type)) schema.set(type, new Map());
    for (const [k, v] of fields) if (!schema.get(type).has(k)) schema.get(type).set(k, v);
  }
  return [...schema.entries()].map(([type, fmap]) => ({
    type,
    fields: [...fmap.entries()].map(([name, val]) => {
      const t = inferDataType(val);
      return { name, type: t !== 'unknown' ? t : inferByName(name), initial: val.slice(0, 50) };
    }).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

function main() {
  const sharedText = fs.readFileSync(SHARED, 'utf8');
  const range = findStoreRange(sharedText);
  if (!range) { console.error('[05-canvas-model] 未定位 store'); process.exit(1); }

  const types = nodeTypes(sharedText, range);
  const actions = nodeActions(sharedText, range);
  const refs = refFormats();
  const snapshot = snapshotFormat(sharedText);
  const dataSchemas = nodeDataSchema(sharedText, range);

  const result = {
    generated_by: 'scripts/05-canvas-model.cjs',
    inputs: [
      { path: 'inputs/pipeline_step/project/src/expanded_components/shared.js', sha256: sha256(SHARED) },
      { path: 'inputs/electron/main.js', sha256: sha256(MAIN) },
      { path: 'inputs/electron/preload.js', sha256: sha256(PRELOAD) },
    ],
    nodeTypes: types,
    nodeActions: actions,
    nodeDataSchema: dataSchemas,
    refFormats: refs,
    snapshotFormat: snapshot,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[05-canvas-model] 节点类型 ${types.length} / data schema ${dataSchemas.length} / 节点创建 action ${actions.length}`);
  console.log(`[05-canvas-model] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 05 · 画布数据模型（机器生成）');
  L.push('');
  L.push('> 由 `scripts/05-canvas-model.cjs` 生成，勿手改；重跑 `node scripts/05-canvas-model.cjs`。');
  L.push('');
  L.push('## 节点类型枚举');
  L.push('');
  L.push(r.nodeTypes.map((t) => '`' + t + '`').join('、'));
  L.push('');
  L.push('## 节点 data schema（字段 + 推断类型）');
  L.push('');
  L.push('| 类型 | data 字段（名:类型） |');
  L.push('|---|---|');
  for (const s of r.nodeDataSchema) L.push(`| \`${s.type}\` | ${s.fields.map((f) => '`' + f.name + ':' + f.type + '`').join(' ')} |`);
  L.push('');
  L.push('## 节点创建 action 的字段（data 候选）');
  L.push('');
  L.push('| action | 字段 |');
  L.push('|---|---|');
  for (const a of r.nodeActions) L.push(`| \`${a.action}\` | ${a.fields.map((f) => '`' + f + '`').join(' ')} |`);
  L.push('');
  L.push('## 引用格式（img:// / vid://）');
  L.push('');
  for (const h of [...r.refFormats.preloadHints, ...r.refFormats.mainHints]) L.push(`- ${h}`);
  L.push('');
  L.push(`## 项目快照格式`);
  L.push('');
  L.push(`\`structuredClone(${r.snapshotFormat})\``);
  L.push('');
  return L.join('\n');
}

main();
