#!/usr/bin/env node
/**
 * 02-providers.cjs —— 生成 pipeline 逆向：机器提取 provider 规格 + 任务引擎 + 类型契约。
 *
 * 输入（一手，未混淆源码）：
 *   - inputs/electron/api/providers/*.js   5 个 ProviderAdapter（require 提取字面字段 + 函数体）
 *   - inputs/electron/api/job-manager.js   任务引擎（源码解析常量 + 状态机）
 *   - inputs/electron/api/types.js         类型契约（文件头 JSDoc）
 *   - inputs/electron/api/registry.js / config-store.js  模块职责
 * 输出：
 *   - outputs/02-生成pipeline.json
 *   - outputs/02-生成pipeline.md
 *
 * 幂等：同输入 → 输出字节级一致（无时间戳；输入文件 sha256 记录在 outputs）。
 * 重跑：node scripts/02-providers.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'inputs', 'electron', 'api');
const PROVIDERS_DIR = path.join(API_DIR, 'providers');
const OUT_JSON = path.join(ROOT, 'outputs', '02-生成pipeline.json');
const OUT_MD = path.join(ROOT, 'outputs', '02-生成pipeline.md');

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// 提取文件头 ===== 注释块（第一个真实代码行之前）
function headerDoc(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const doc = [];
  for (const ln of lines) {
    const m = ln.match(/^\s*\/\/\s?(.*)$/);
    if (m) doc.push(m[1].trim());
    else if (ln.trim() === '') continue; // 文件头空行/分隔行跳过
    else break; // 遇到代码行停止
  }
  // 去掉纯分隔线（==== 或 ---- 或空）
  return doc.filter((s) => s && !/^=+$/.test(s) && !/^-+$/.test(s)).join(' ');
}

// 从 buildSubmit 函数体启发式提取端点路径（模板字符串 / 路径字面量）
function extractEndpoints(fn) {
  if (typeof fn !== 'function') return [];
  const src = fn.toString();
  const set = new Set();
  // 匹配 `${base}/videos/xxx`、`/videos/xxx`、`https://...` 等含路径的字符串
  const re = /[`'"]([^`'"\n]*\/[a-zA-Z0-9_./{}$-]+)[`'"]/g;
  let m;
  while ((m = re.exec(src))) {
    let p = m[1].replace(/\$\{base\}/g, '{base}').replace(/\$\{[^}]+\}/g, '{var}');
    if (!p.includes('/') || /^\/\//.test(p)) continue;
    if (/^[a-z][a-z0-9.+-]*\/[a-z0-9.+-]+$/.test(p)) continue; // 过滤 mime（application/json 等）
    set.add(p);
  }
  return [...set];
}

// require provider（纯数据 + 纯函数模块，安全）
function extractProvider(file) {
  const adapter = require(file);
  return {
    id: adapter.id,
    name: adapter.name,
    capabilities: adapter.capabilities || [],
    domains: adapter.domains || [],
    auth: adapter.auth || null,
    defaults: adapter.defaults || {},
    frameSupport: adapter.frameSupport || null,
    quotaHints: (adapter.quotaHints || []).map((h) => ({
      kind: h.kind,
      pattern: h.re instanceof RegExp ? h.re.toString() : null,
      advice: h.advice,
    })),
    paramSchema: (adapter.paramSchema || []).map((f) => ({
      key: f.key, label: f.label, type: f.type, default: f.default,
      options: f.options ? f.options.map((o) => (o && o.value != null ? o.value : o)) : undefined,
      min: f.min, max: f.max,
    })),
    endpoints: extractEndpoints(adapter.buildSubmit),
    header: headerDoc(file),
  };
}

// 引擎常量（源码解析 job-manager.js 顶部的 const XXX = ...）
function engineConstants() {
  const text = fs.readFileSync(path.join(API_DIR, 'job-manager.js'), 'utf8');
  const consts = {};
  const re = /^const ([A-Z_][A-Z0-9_]*) = (.+);/gm;
  let m;
  while ((m = re.exec(text))) consts[m[1]] = m[2].trim();
  return consts;
}

function main() {
  const providerFiles = fs.readdirSync(PROVIDERS_DIR).filter((f) => f.endsWith('.js')).sort();
  const providers = providerFiles.map((f) => extractProvider(path.join(PROVIDERS_DIR, f)));

  const engine = {
    header: headerDoc(path.join(API_DIR, 'job-manager.js')),
    constants: engineConstants(),
    statusMachine: 'queued → submitting → running → downloading → done / failed / cancelled',
  };

  const result = {
    generated_by: 'scripts/02-providers.cjs',
    inputs: [
      ...providerFiles.map((f) => ({ path: `inputs/electron/api/providers/${f}`, sha256: sha256(path.join(PROVIDERS_DIR, f)) })),
      { path: 'inputs/electron/api/job-manager.js', sha256: sha256(path.join(API_DIR, 'job-manager.js')) },
      { path: 'inputs/electron/api/types.js', sha256: sha256(path.join(API_DIR, 'types.js')) },
      { path: 'inputs/electron/api/registry.js', sha256: sha256(path.join(API_DIR, 'registry.js')) },
      { path: 'inputs/electron/api/config-store.js', sha256: sha256(path.join(API_DIR, 'config-store.js')) },
    ],
    types_contract: headerDoc(path.join(API_DIR, 'types.js')),
    registry: headerDoc(path.join(API_DIR, 'registry.js')),
    config_store: headerDoc(path.join(API_DIR, 'config-store.js')),
    providers,
    engine,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[02-providers] provider ${providers.length} 个 / 引擎常量 ${Object.keys(engine.constants).length} 个`);
  console.log(`[02-providers] 已写 ${OUT_JSON}`);
  console.log(`[02-providers] 已写 ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 02 · 生成 pipeline（机器生成）');
  L.push('');
  L.push('> 由 `scripts/02-providers.cjs` 从一手未混淆源码解析生成，勿手改；重跑 `node scripts/02-providers.cjs`。');
  L.push('');

  L.push('## 任务引擎（job-manager.js）');
  L.push('');
  L.push(`- 状态机：\`${r.engine.statusMachine}\``);
  L.push('');
  L.push('| 常量 | 值 |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(r.engine.constants)) L.push(`| \`${k}\` | \`${v}\` |`);
  L.push('');
  L.push(`> ${r.engine.header}`);
  L.push('');

  L.push('## 服务商规格（providers/）');
  L.push('');
  for (const p of r.providers) {
    L.push(`### ${p.id} — ${p.name}`);
    L.push('');
    L.push(`- capabilities: ${p.capabilities.map((c) => '`' + c + '`').join(' ')}`);
    L.push(`- domains: ${p.domains.length ? p.domains.map((d) => '`' + d + '`').join(' ') : '—（未声明，走 baseUrl/动态）'}`);
    L.push(`- auth: ${p.auth ? '`' + p.auth.type + '`' + (p.auth.keyFields ? '（密钥字段 ' + p.auth.keyFields.map((k) => '`' + k + '`').join('/') + '）' : '') : '—'}`);
    if (p.frameSupport) L.push(`- 首尾帧支持: ${JSON.stringify(p.frameSupport)}`);
    L.push(`- 默认值: ${JSON.stringify(p.defaults)}`);
    L.push('');
    L.push('| 参数键 | 标签 | 类型 | 默认 | 可选项 |');
    L.push('|---|---|---|---|---|');
    for (const f of p.paramSchema) {
      const opts = f.options ? f.options.join(' / ') : '—';
      L.push(`| \`${f.key}\` | ${f.label} | ${f.type} | \`${f.default ?? ''}\` | ${opts} |`);
    }
    L.push('');
    if (p.endpoints.length) {
      L.push(`端点（从 buildSubmit 启发式提取）: ${p.endpoints.map((e) => '`' + e + '`').join('、')}`);
      L.push('');
    }
    if (p.quotaHints.length) {
      L.push('| 额度信号 | 正则 | 建议 |');
      L.push('|---|---|---|');
      for (const q of p.quotaHints) L.push(`| \`${q.kind}\` | \`${q.pattern}\` | ${q.advice} |`);
      L.push('');
    }
    L.push(`> ${p.header}`);
    L.push('');
  }

  L.push('## 类型契约（types.js）');
  L.push('');
  L.push(`> ${r.types_contract}`);
  L.push('');
  L.push('## 注册表（registry.js）');
  L.push('');
  L.push(`> ${r.registry}`);
  L.push('');
  L.push('## 配置存储（config-store.js）');
  L.push('');
  L.push(`> ${r.config_store}`);
  L.push('');

  return L.join('\n');
}

main();
