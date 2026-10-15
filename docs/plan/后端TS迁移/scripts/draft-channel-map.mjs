#!/usr/bin/env node
/**
 * draft-channel-map.mjs —— 从 `electron/preload.js` 抽 **channels 表草稿**（契约面真源的起手）。
 *
 * 两个用途（README §11.2 / §4.2 D-10）：
 *   ① `--snapshot`：把 preload 侧名面（成员名 · 种类 · 频道名 · 参数名）录成**证据**
 *      （`docs/plan/后端TS迁移/evidence/channel-map.json`）——**必须在 `preload.js` 还在时跑**；
 *      它就是 D-10 说的那份快照，**不再另存第二份**（同一产生方 ⇒ 载体数 = 1）。
 *   ② `--write`：产出 `src/stable/ipc-channels.ts` **草稿**（B1 用；判不出的地方一律 `TODO(…)`）。
 *
 * ★ 机械 vs 判断（README §11.5）：**名 · 种类 · 频道名 · 参数名**由脚本抽（语法就能定）；
 *   **参数类型 · 回执形状 · note** 是判断 ⇒ 草稿里只留 `TODO(…)`，⛔ 不许猜着填。
 *   草稿不可能被静默当成真源：漏/多/名字不符 ⇒ `preload.ts satisfies WindowApi` 编译期当场红。
 *
 * 写盘（README §11.1）：**改源文件 ⇒ 默认 dry ＋ `--write`**；证据区（evidence/）默认写。
 * 用法：
 *   node docs/plan/后端TS迁移/scripts/draft-channel-map.mjs [--snapshot] [--write] [--json] [--out <路径>] [--help]
 * 退出码：0 通过 · 1 抽取不成立（形态没识别出来，**不许静默跳过**）· 2 用法或环境错。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const PRELOAD = path.join(REPO, 'electron', 'preload.js');
const EVIDENCE = path.join(HERE, '..', 'evidence', 'channel-map.json');
const DEFAULT_OUT = path.join(REPO, 'src', 'stable', 'ipc-channels.ts');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`draft-channel-map.mjs —— 从 preload.js 抽 channels 表草稿

用法：node .../draft-channel-map.mjs [--snapshot] [--write] [--json] [--out <路径>] [--dry] [--help]
  --snapshot  写证据快照（默认写：证据区是可重生的产物区）
  --write     写 TS 草稿到 --out（默认 src/stable/ipc-channels.ts）；不给则只打印计划（dry）
  --out <p>   草稿落点
  --json      只打印 JSON（不写盘）
  --help      本帮助`);
  process.exit(0);
}
const wantJson = args.includes('--json');
const wantSnapshot = args.includes('--snapshot');
const wantWrite = args.includes('--write');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(REPO, args[outIdx + 1] ?? '') : DEFAULT_OUT;

if (!fs.existsSync(PRELOAD)) {
  console.error(`❌ 找不到 ${path.relative(REPO, PRELOAD)} —— 转换后就没有它了，本脚本必须在那之前跑`);
  process.exit(2);
}

const code = fs.readFileSync(PRELOAD, 'utf-8');
const ast = parse(code, { sourceType: 'unambiguous' });

/** 找 `contextBridge.exposeInMainWorld('api', { … })` 的第二个实参 */
let apiObject = null;
const walk = (node, fn) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, fn);
    return;
  }
  if (typeof node.type === 'string') fn(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k.endsWith('Comments')) continue;
    walk(node[k], fn);
  }
};
walk(ast, (node) => {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property?.name === 'exposeInMainWorld' &&
    node.arguments[0]?.value === 'api'
  ) {
    apiObject = node.arguments[1] ?? null;
  }
});
if (!apiObject || apiObject.type !== 'ObjectExpression') {
  console.error('❌ 没找到 `contextBridge.exposeInMainWorld(\'api\', {…})` 的对象字面量 —— 抽取不成立，修脚本而不是跳过');
  process.exit(1);
}

const kindOfCallee = (name) => (name === 'invoke' || name === 'send' || name === 'sendSync' || name === 'on' ? name : null);

/** 从函数体里找 ipcRenderer 调用（含 block body 里的 `ipcRenderer.on(...)`） */
function findIpcCall(fnNode) {
  const out = [];
  walk(fnNode.body, (n) => {
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    if (c.type !== 'MemberExpression') return;
    const obj = c.object?.name;
    const kind = kindOfCallee(c.property?.name);
    if (!kind) return;
    if (obj !== 'ipcRenderer' && obj !== 'ipcMain') return;
    const ch = n.arguments[0];
    out.push({ kind, channel: ch && typeof ch.value === 'string' ? ch.value : '(动态)', callee: `${obj}.${c.property.name}` });
  });
  return out;
}

const members = [];
const todos = [];
for (const prop of apiObject.properties) {
  if (prop.type !== 'ObjectProperty' && prop.type !== 'ObjectMethod') {
    console.error(`❌ 形态不认识：${prop.type} —— 修脚本而不是跳过`);
    process.exit(1);
  }
  const name = prop.key.name ?? prop.key.value;
  const val = prop.value ?? prop;
  const isFn = /Function/.test(val.type);
  const params = isFn ? val.params.map((p) => (p.type === 'Identifier' ? p.name : p.type)) : [];
  const rec = { name, kind: null, channel: null, params, at: code.slice(0, prop.start).split('\n').length };

  if (!isFn) {
    rec.kind = 'value';
    todos.push(`${name}：value 类（非 IPC）—— 类型与语义需人判`);
    members.push(rec);
    continue;
  }
  const calls = findIpcCall(val);
  if (calls.length === 0) {
    rec.kind = 'value';
    todos.push(`${name}：函数但不含 ipcRenderer 调用（如拼装返回值）—— 种类需人判`);
    members.push(rec);
    continue;
  }
  const kinds = [...new Set(calls.map((c) => c.kind))];
  if (kinds.length > 1) todos.push(`${name}：一次调用里出现多种 ipc 种类（${kinds.join('/')}）—— 需人判`);
  rec.kind = kinds[0];
  rec.channel = calls[0].channel;
  if (new Set(calls.map((c) => c.channel)).size > 1) {
    todos.push(`${name}：多个频道（${calls.map((c) => c.channel).join(' / ')}）—— 需人判`);
  }
  rec.ipcCalls = calls.map((c) => c.callee);
  members.push(rec);
}

const snapshot = {
  $comment: 'preload 侧名面快照（D-10）。由 draft-channel-map.mjs --snapshot 生成；证据，非真源。',
  source: 'electron/preload.js',
  count: members.length,
  byKind: members.reduce((acc, m) => ({ ...acc, [m.kind]: (acc[m.kind] ?? 0) + 1 }), {}),
  members,
  todos,
};

const channelsOfKind = (k) => members.filter((m) => m.kind === k).map((m) => m.channel);

if (wantSnapshot) {
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
  console.log(`✅ 快照已写入 ${path.relative(REPO, EVIDENCE)}（${members.length} 个成员：${Object.entries(snapshot.byKind).map(([k, n]) => `${k} ${n}`).join(' · ')}）`);
}

if (wantJson) {
  console.log(JSON.stringify(snapshot, null, 2));
  process.exit(0);
}

/** 生成 TS 草稿（名面完整 · 字段面一律 TODO —— B1 的起手，不是终态） */
function draftTs() {
  const lines = [];
  lines.push('// ⚠️ 本文件由 `draft-channel-map.mjs` 从 `electron/preload.js` 生成 —— **草稿**。');
  lines.push('//    · 名面（成员名 · 种类 · 频道名 · 参数名）由脚本抽出 ⇒ 与 preload 同源；');
  lines.push('//    · 字段面（参数类型 · 回执形状 · note）是判断 ⇒ 一律留 TODO(…)，**完成判据 = TODO 清零**；');
  lines.push('//    · `electron/preload.ts` 的 `satisfies WindowApi` 是交叉校验：漏/多/改名 ⇒ 编译期当场红。');
  lines.push('');
  lines.push("export type ChannelKind = 'invoke' | 'send' | 'sendSync' | 'on' | 'value';");
  lines.push('');
  lines.push('export interface ChannelSpec {');
  lines.push('  readonly kind: ChannelKind;');
  lines.push('  readonly channel: string | null;');
  lines.push('  readonly params: readonly string[];');
  lines.push('  /** 回执原始形状 */');
  lines.push('  readonly ret: unknown;');
  lines.push('  readonly note?: string;');
  lines.push('}');
  lines.push('');
  lines.push('export const IPC_CHANNELS = {');
  for (const m of members) {
    lines.push(`  // TODO(形状)：${m.name} 的 ret —— 按 handler 实际 return 补（取证锚点用符号名，禁行号）`);
    if (m.kind !== 'value') lines.push(`  // TODO(note)：${m.name} 的判据（fail-closed / sendSync 不得 await 等）`);
    lines.push(
      `  ${m.name}: { kind: '${m.kind}', channel: ${m.channel === null ? 'null' : `'${m.channel}'`}, params: [${m.params
        .map((p) => `'${p}'`)
        .join(', ')}], ret: TODO_${m.name}.ret } as const,`,
    );
  }
  lines.push('} as const satisfies Record<string, ChannelSpec>;');
  lines.push('');
  lines.push('export type IpcChannelMap = typeof IPC_CHANNELS;');
  lines.push('');
  lines.push('/** 渲染层原始面（四种种类各有各的回执形态 —— 只按 sendSync 分两支会漏 send/on） */');
  lines.push('export type WindowApi = {');
  lines.push('  readonly [K in keyof IpcChannelMap]: IpcChannelMap[K][\'kind\'] extends \'sendSync\'');
  lines.push('    ? (...args: unknown[]) => unknown');
  lines.push('    : IpcChannelMap[K][\'kind\'] extends \'send\'');
  lines.push('      ? (...args: unknown[]) => void');
  lines.push('      : IpcChannelMap[K][\'kind\'] extends \'on\'');
  lines.push('        ? (...args: unknown[]) => () => void');
  lines.push('        : IpcChannelMap[K][\'kind\'] extends \'value\'');
  lines.push('          ? unknown');
  lines.push('          : (...args: unknown[]) => Promise<unknown>;');
  lines.push('};');
  lines.push('');
  for (const m of members) {
    lines.push(`// TODO(形状)：declare namespace TODO_${m.name} { const ret: unknown; }   // 占位，B1 逐个补`);
  }
  return lines.join('\n');
}

if (!wantWrite) {
  console.log(`${'─'.repeat(70)}
抽取结果：${members.length} 个成员
  按种类：${Object.entries(snapshot.byKind).map(([k, n]) => `${k} ${n}`).join(' · ')}
  invoke 频道（${channelsOfKind('invoke').length}）：${channelsOfKind('invoke').join(', ')}
  send 频道（${channelsOfKind('send').length}）：${channelsOfKind('send').join(', ')}
  sendSync 频道（${channelsOfKind('sendSync').length}）：${channelsOfKind('sendSync').join(', ')}
  on 频道（${channelsOfKind('on').length}）：${channelsOfKind('on').join(', ')}
  value 成员：${members.filter((m) => m.kind === 'value').map((m) => m.name).join(', ')}
  TODO 占位（需人判，共 ${todos.length}）：
${todos.map((t) => `    · ${t}`).join('\n')}

（dry：未写盘。要写草稿加 --write --out <路径>；要写证据快照加 --snapshot。）`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${draftTs()}\n`, 'utf-8');
console.log(`✅ 草稿已写入 ${path.relative(REPO, OUT)}（${members.length} 个成员 · TODO ${todos.length + members.length * 2} 处）`);
