#!/usr/bin/env node
/**
 * 01-ipc-contract.cjs —— 从一手源码自动提取 IPC 契约，机器生成 JSON + Markdown。
 *
 * 输入（一手，producing boundary）：
 *   - inputs/electron/preload.js           渲染层 window.api 定义（方法名 → 通道 → 调用类型 → 参数 → 注释）
 *   - inputs/electron/**​/*.js             主进程 ipcMain.handle/on 注册（通道 → 文件 → 行号）
 * 输出：
 *   - outputs/05-IPC契约.json              结构化契约（机器可消费）
 *   - outputs/05-IPC契约.md                人类可读（按功能域前缀规则分组）
 *
 * 幂等：同输入 → 输出字节级一致（无时间戳；输入文件 sha256 记录在 outputs 里便于追溯）。
 * 重跑：node scripts/01-ipc-contract.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_DIR = path.join(ROOT, 'inputs', 'electron');
const PRELOAD = path.join(ELECTRON_DIR, 'preload.js');
const OUT_DIR = path.join(ROOT, 'outputs');
const OUT_JSON = path.join(OUT_DIR, '05-IPC契约.json');
const OUT_MD = path.join(OUT_DIR, '05-IPC契约.md');

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// ---------------------------------------------------------------------------
// 1. 解析 preload.js
// ---------------------------------------------------------------------------
function parsePreload(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');

  // 方法定义：2 空格缩进的 `name:`（在 exposeInMainWorld('api', {...}) 内）
  const methodLineRe = /^  ([A-Za-z_$][\w$]*):\s/;
  const methodAtLine = new Map(); // lineIndex -> name
  lines.forEach((ln, i) => {
    const m = ln.match(methodLineRe);
    if (m) methodAtLine.set(i, m[1]);
  });

  // ipcRenderer 调用：invoke / send / sendSync / on / removeListener
  const calls = [];
  lines.forEach((ln, i) => {
    const re = /ipcRenderer\.(invoke|send|sendSync|on|removeListener)\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(ln))) {
      calls.push({ type: m[1], channel: m[2], line: i, raw: ln.trim() });
    }
  });

  // 每个调用归属到上方最近的方法名
  for (const c of calls) {
    let name = null;
    for (let i = c.line; i >= 0; i--) {
      if (methodAtLine.has(i)) { name = methodAtLine.get(i); break; }
    }
    c.apiName = name;
  }

  // 提取方法上方的连续注释
  const docOf = new Map(); // name -> doc 字符串
  lines.forEach((ln, i) => {
    const m = ln.match(methodLineRe);
    if (!m) return;
    const name = m[1];
    const doc = [];
    for (let j = i - 1; j >= 0; j--) {
      const cm = lines[j].match(/^\s*\/\/\s?(.*)$/);
      if (cm) doc.unshift(cm[1].trim());
      else break;
    }
    if (doc.length) docOf.set(name, doc.join(' '));
  });

  // 聚合为通道契约（按 channel 去重）
  const channels = new Map();
  for (const c of calls) {
    if (c.type === 'removeListener') continue; // 清理调用不定义契约
    if (!channels.has(c.channel)) {
      channels.set(c.channel, {
        channel: c.channel,
        apiName: c.apiName,
        kind: c.type === 'on' ? 'event' : c.type, // on = 主进程推送
        args: extractArgs(c.raw),
        doc: (c.apiName && docOf.get(c.apiName)) || null,
      });
    }
  }

  return { channels: [...channels.values()], docs: docOf };
}

// 从 invoke/send 调用行提取参数片段
function extractArgs(raw) {
  const m = raw.match(/ipcRenderer\.\w+\(\s*['"][^'"]+['"]\s*(?:,\s*(.*?))?\)\s*,?;?$/);
  return m && m[1] ? m[1].replace(/,\s*$/, '') : null;
}

// ---------------------------------------------------------------------------
// 2. 解析主进程 handler（递归遍历 electron/ 下所有 .js）
// ---------------------------------------------------------------------------
function walkJs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkJs(p));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function parseHandlers(dir) {
  const handlers = []; // { channel, file, line, raw }
  for (const file of walkJs(dir)) {
    const rel = path.relative(ELECTRON_DIR, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      const m = ln.match(/ipcMain\.(handle|handleOnce|on)\(\s*['"]([^'"]+)['"]/);
      if (m) {
        handlers.push({ channel: m[2], method: m[1], file: rel, line: i + 1, raw: ln.trim().slice(0, 120) });
      }
    });
  }
  return handlers;
}

// 解析主进程 → 渲染层 推送（webContents.send / sender 封装）
function parsePushes(dir) {
  const pushes = []; // { channel, payload, file, line, raw }
  for (const file of walkJs(dir)) {
    if (path.basename(file) === 'preload.js') continue; // preload 的 ipcRenderer.send 已在 parsePreload 处理
    const rel = path.relative(ELECTRON_DIR, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      // 形式1：xxx.webContents.send('channel', payload) / e.sender.send(...)
      // 形式2：sender('channel', payload) —— lovart-fetch.js 里的封装
      const m = ln.match(/(?:\.send|sender)\(\s*['"]([^'"]+)['"]\s*(?:,\s*(.*?))?\)/);
      if (m) {
        pushes.push({ channel: m[1], payload: m[2] || null, file: rel, line: i + 1, raw: ln.trim().slice(0, 120) });
      }
    });
  }
  return pushes;
}

// ---------------------------------------------------------------------------
// 3. 配对 + 分组
// ---------------------------------------------------------------------------
const GROUPS = [
  ['API 接入 / 生成任务', /^api-/],
  ['项目存储与快照', /^(projects-backup|project-storage|project-snapshot|project-operation)/],
  ['剪贴板 / 拖放', /clipboard|paste-to-webview|start-file-drag/],
  ['图片 / 视频外置存储', /^(img-|image-|save-video|show-in-folder|clear-browser-cache)/],
  ['文件 / 导入导出', /^(import-files|save-file|load-file|open-external|select-folder|download-|reveal-path)/],
  ['账号', /account/],
  ['授权', /machine-code|license|activate/],
  ['dola 采集', /dola/],
  ['Lovart 采集', /lovart|firefox|get-download-settings|pick-download-path/],
  ['指纹 / 会话隔离', /fingerprint|fp-net|plain-session|account-session|account-proxy/],
  ['屏幕 / 视频采集', /capture-rect|detect-videos|detect-errors/],
];

function groupOf(channel) {
  for (const [name, re] of GROUPS) if (re.test(channel)) return name;
  return '其他';
}

// ---------------------------------------------------------------------------
// 4. 生成输出
// ---------------------------------------------------------------------------
function main() {
  const { channels } = parsePreload(PRELOAD);
  const handlers = parseHandlers(ELECTRON_DIR);
  const pushes = parsePushes(ELECTRON_DIR);

  // 每个通道关联 handler（可能多个文件，也可能 0 个 = 主进程推送）
  for (const ch of channels) {
    ch.handlers = handlers
      .filter((h) => h.channel === ch.channel)
      .map(({ method, file, line, raw }) => ({ method, file, line, raw }));
    // event 通道：关联主进程推送，用推送实参修正 payload（覆盖 parsePreload 误取的 listener）
    if (ch.kind === 'event') {
      const ps = pushes.filter((p) => p.channel === ch.channel);
      ch.pushes = ps.map(({ payload, file, line, raw }) => ({ payload, file, line, raw }));
      if (ch.pushes.length === 1 && ch.pushes[0].payload) ch.args = ch.pushes[0].payload;
    }
  }

  // 有 handler 但 preload 未暴露的通道（内部/其他调用方）
  const exposed = new Set(channels.map((c) => c.channel));
  const orphanHandlers = handlers.filter((h) => !exposed.has(h.channel));

  // 按 preload 定义顺序分组
  const grouped = new Map();
  for (const ch of channels) {
    const g = groupOf(ch.channel);
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g).push(ch);
  }

  // 输入指纹：记录输入文件的 sha256，保证可追溯 / 可复现
  const inputFiles = [PRELOAD, ...walkJs(ELECTRON_DIR)].sort();
  const inputs = inputFiles.map((p) => ({
    path: path.relative(ROOT, p).replace(/\\/g, '/'),
    sha256: sha256(p),
  }));

  const result = {
    generated_by: 'scripts/01-ipc-contract.cjs',
    inputs,
    stats: {
      api_methods: channels.length,
      ipc_handlers: handlers.length,
      orphan_handlers: orphanHandlers.length,
    },
    channels,
    orphan_handlers: orphanHandlers,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result, grouped), 'utf8');

  console.log(`[01-ipc-contract] 通道 ${channels.length} / handler ${handlers.length} / 孤儿 handler ${orphanHandlers.length}`);
  console.log(`[01-ipc-contract] 已写 ${OUT_JSON}`);
  console.log(`[01-ipc-contract] 已写 ${OUT_MD}`);
}

function renderMarkdown(result, grouped) {
  const L = [];
  L.push('# 05 · IPC 契约（机器生成）');
  L.push('');
  L.push('> 由 `scripts/01-ipc-contract.cjs` 从一手源码解析生成，勿手改；改脚本后重跑 `node scripts/01-ipc-contract.cjs`。');
  L.push(`> 通道 ${result.stats.api_methods} / 主进程 handler ${result.stats.ipc_handlers} / 孤儿 handler ${result.stats.orphan_handlers}。`);
  L.push('');
  L.push('| 方向 | 含义 |');
  L.push('|---|---|');
  L.push('| invoke / send / sendSync | 渲染层 → 主进程 |');
  L.push('| event | 主进程 → 渲染层推送 |');
  L.push('');

  for (const [group, chs] of grouped) {
    L.push(`## ${group}`);
    L.push('');
    L.push('| 通道 | api 方法 | 类型 | 参数 | 职责（preload 注释） | 主进程实现 |');
    L.push('|---|---|---|---|---|---|');
    for (const ch of chs) {
      const locs = [];
      if (ch.handlers.length) locs.push(...ch.handlers.map((h) => `${h.file}:${h.line}`));
      if (ch.pushes && ch.pushes.length) locs.push(...ch.pushes.map((p) => `${p.file}:${p.line}（推送）`));
      const hloc = locs.length ? locs.join(', ') : '—（webContents.send 推送）';
      const doc = (ch.doc || '').replace(/\|/g, '\\|');
      L.push(`| \`${ch.channel}\` | \`${ch.apiName || '?'}\` | ${ch.kind} | ${ch.args ? '`' + ch.args + '`' : '—'} | ${doc} | ${hloc} |`);
    }
    L.push('');
  }

  if (result.orphan_handlers.length) {
    L.push('## 孤儿 handler（主进程有、preload 未暴露）');
    L.push('');
    L.push('| 通道 | method | 位置 |');
    L.push('|---|---|---|');
    for (const h of result.orphan_handlers) L.push(`| \`${h.channel}\` | ${h.method} | ${h.file}:${h.line} |`);
    L.push('');
  }

  return L.join('\n');
}

main();
