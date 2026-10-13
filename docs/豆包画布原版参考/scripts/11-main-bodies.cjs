#!/usr/bin/env node
/**
 * 11-main-bodies.cjs —— 主进程函数体提取：以 REA 语义图（records[6]）的 source_range 为准，
 *   精确切片每个 handler / 函数体（AST 级精确，authority=ast-static-analysis，零正则猜边界）。
 *
 * 数据源（站在前人基础上，以 REA 为准）：
 *   - inputs/rea/rea-evidence-bundle.json（records[6]：graph 的 ipc-handler 83 个 + semantic_graph 的 function 678 个，均带精确 source_range）
 *   - inputs/electron/**​/*.js（未混淆源码，按 source_range 切片，切出的是源码原文）
 *
 * 输出：outputs/11-主进程函数体.json + outputs/11-主进程函数体.md
 * 幂等、可重跑：node scripts/11-main-bodies.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON = path.join(ROOT, 'inputs', 'electron');
const BUNDLE = path.join(ROOT, 'inputs', 'rea', 'rea-evidence-bundle.json');
const OUT_JSON = path.join(ROOT, 'outputs', '11-主进程函数体.json');
const OUT_MD = path.join(ROOT, 'outputs', '11-主进程函数体.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function walkJs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkJs(p));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function norm(p) { return String(p || '').replace(/\\/g, '/'); }

// 从切片代码第一行解析函数名 + 参数（properties.name 大量为 null 时的兜底）
function parseSig(code) {
  const first = (code || '').trim().split('\n')[0] || '';
  let m;
  m = first.match(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
  if (m) return { name: m[1], params: m[2].trim() };
  m = first.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\(([^)]*)\)|([A-Za-z_$][\w$]*)\s*=>)/);
  if (m) return { name: m[1], params: (m[2] || '').trim() };
  m = first.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(/);
  if (m) return { name: m[1], params: '' };
  m = first.match(/^\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/);
  if (m) return { name: m[1], params: m[2].trim() };
  return { name: null, params: '' };
}

function main() {
  const t0 = Date.now();

  // 1. 读源码原文（未混淆）
  const files = walkJs(ELECTRON).sort();
  const textByRel = new Map();
  for (const f of files) textByRel.set(norm(path.relative(ELECTRON, f)), fs.readFileSync(f, 'utf8'));

  // 2. 读 REA（权威：AST 级精确 source_range）
  const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  const nr = bundle.records[6].normalized_result;
  const graph = nr.graph;
  const sg = nr.semantic_graph;

  // 3. ipc-handler 清单（graph，channel + handler_location）
  const handlerList = [];
  for (const node of graph.nodes || []) {
    if (node.kind !== 'ipc-handler') continue;
    for (const obs of node.observations || []) {
      const props = obs.properties || {};
      const loc = obs.evidence && obs.evidence.location && obs.evidence.location.value;
      if (!props.channel || !loc) continue;
      const hl = props.handler_location || loc;
      handlerList.push({
        channel: props.channel,
        mode: props.mode || props.operation || 'handle',
        source: norm(loc.source),
        startLine: hl.start.line,
        endLine: hl.end.line,
      });
    }
  }

  // 4. function 清单（semantic_graph，source_range；source 取 module_path）
  const funcList = [];
  for (const n of sg.nodes || []) {
    if (n.kind !== 'function') continue;
    const sr = n.identity && n.identity.source_range;
    if (!sr) continue;
    const evSrc = n.evidence && n.evidence.location && n.evidence.location.value && n.evidence.location.value.source;
    const source = norm(n.identity.module_path || evSrc);
    if (!source) continue;
    funcList.push({
      name: n.properties && n.properties.name,
      source,
      startLine: sr.start.line,
      endLine: sr.end.line,
    });
  }

  // 5. 顶层函数去重：去掉被其他 function 的 source_range 严格包含的（嵌套回调）
  const topFuncs = funcList.filter((a) => !funcList.some(
    (b) => b !== a && b.source === a.source
      && b.startLine <= a.startLine && b.endLine >= a.endLine
      && (b.startLine < a.startLine || b.endLine > a.endLine)
  ));

  // 6. 切片辅助
  const slice = (source, s, e) => {
    const text = textByRel.get(norm(source));
    if (!text) return null;
    const lines = text.split('\n');
    return lines.slice(s - 1, e).join('\n');
  };

  // handler 行范围集合（用于从 funcs 排除已作为 handler 列出的函数）
  const handlerKeys = new Set(handlerList.map((h) => `${h.source}:${h.startLine}-${h.endLine}`));

  const byRel = new Map();
  // 初始化所有源文件（含完整原文 raw），保证 IIFE 包裹等 REA 盲区文件也不丢
  for (const f of files) {
    const rel = norm(path.relative(ELECTRON, f));
    byRel.set(rel, { file: rel, handlers: [], funcs: [], raw: textByRel.get(rel) || '', lines: (textByRel.get(rel) || '').split('\n').length });
  }
  const getMod = (rel) => {
    const r = norm(rel);
    if (!byRel.has(r)) byRel.set(r, { file: r, handlers: [], funcs: [], raw: '', lines: 0 });
    return byRel.get(r);
  };

  // 7. 组装 handlers
  let handlerOk = 0, handlerMiss = 0;
  for (const h of handlerList) {
    const body = slice(h.source, h.startLine, h.endLine);
    if (body == null) { handlerMiss++; continue; }
    getMod(h.source).handlers.push({ channel: h.channel, method: h.mode, line: h.startLine, body });
    handlerOk++;
  }

  // 8. 组装 funcs（排除已作为 handler 的范围）
  let funcOk = 0, funcMiss = 0, funcSkipHandler = 0;
  for (const f of topFuncs) {
    if (handlerKeys.has(`${f.source}:${f.startLine}-${f.endLine}`)) { funcSkipHandler++; continue; }
    const body = slice(f.source, f.startLine, f.endLine);
    if (body == null) { funcMiss++; continue; }
    const sig = f.name ? { name: f.name, params: '' } : parseSig(body);
    getMod(f.source).funcs.push({ name: sig.name || '(anonymous)', params: sig.params, line: f.startLine, body });
    funcOk++;
  }

  const modules = [...byRel.values()].sort((a, b) => a.file.localeCompare(b.file));
  const totalHandlers = modules.reduce((s, m) => s + m.handlers.length, 0);
  const totalFuncs = modules.reduce((s, m) => s + m.funcs.length, 0);

  const result = {
    generated_by: 'scripts/11-main-bodies.cjs',
    inputs: [
      { path: 'inputs/rea/rea-evidence-bundle.json', sha256: sha256(BUNDLE) },
      ...files.map((f) => ({ path: `inputs/electron/${norm(path.relative(ELECTRON, f))}`, sha256: sha256(f) })),
    ],
    stats: {
      modules: modules.length,
      handlers: totalHandlers,
      functions: totalFuncs,
      totalLines: modules.reduce((s, m) => s + m.lines, 0),
      rawBytes: modules.reduce((s, m) => s + (m.raw ? m.raw.length : 0), 0),
      // REA 权威计数（完整性基准）
      rea: {
        ipcHandlers: handlerList.length,
        functions: funcList.length,
        topFunctions: topFuncs.length,
        handlerSliced: handlerOk,
        handlerMiss: handlerMiss,
        funcSliced: funcOk,
        funcMiss: funcMiss,
        funcSkippedAsHandler: funcSkipHandler,
      },
    },
    modules,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[11-main-bodies] REA 权威：ipc-handler ${handlerList.length} / function ${funcList.length} / 顶层函数 ${topFuncs.length}`);
  console.log(`[11-main-bodies] 切片：handler ${handlerOk}（漏 ${handlerMiss}）/ 函数 ${funcOk}（漏 ${funcMiss}，其中 ${funcSkipHandler} 已作为 handler）`);
  console.log(`[11-main-bodies] 已写 ${OUT_JSON} / ${OUT_MD}（耗时 ${Date.now() - t0}ms）`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 11 · 主进程函数体（机器生成，REA source_range 精确切片）');
  L.push('');
  L.push('> 由 `scripts/11-main-bodies.cjs` 以 REA 语义图（records[6]）的 source_range 切片，勿手改；重跑 `node scripts/11-main-bodies.cjs`。');
  L.push(`> handler ${r.stats.handlers} / 函数 ${r.stats.functions}（REA 权威：ipc-handler ${r.stats.rea.ipcHandlers} / function ${r.stats.rea.functions}）。`);
  L.push('');
  for (const m of r.modules) {
    L.push(`## ${m.file}`);
    L.push('');
    if (m.handlers.length) {
      L.push('### IPC handler');
      L.push('');
      for (const h of m.handlers) {
        L.push(`#### ${h.channel}（${h.method}，行 ${h.line}）`);
        L.push('');
        L.push('```js');
        L.push(h.body);
        L.push('```');
        L.push('');
      }
    }
    if (m.funcs.length) {
      L.push('### 函数');
      L.push('');
      for (const f of m.funcs) {
        L.push(`#### ${f.name}(${f.params})（行 ${f.line}）`);
        L.push('');
        L.push('```js');
        L.push(f.body);
        L.push('```');
        L.push('');
      }
    }
    if (!m.handlers.length && !m.funcs.length) {
      L.push('> REA 未识别出函数节点（如 IIFE 包裹），以下为完整原文。');
      L.push('');
      L.push('```js');
      L.push(m.raw || '');
      L.push('```');
      L.push('');
    }
  }
  return L.join('\n');
}

main();
