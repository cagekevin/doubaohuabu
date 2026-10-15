#!/usr/bin/env node
/**
 * 抽取 `electron/preload.ts` 暴露的 `window.api` 方法面
 *
 * 用途：
 *   1. 生成 `adapters/host/electron` 的实现规格（W1 要求"方法名完全一致"）
 *   2. W1 校验时做差集（`preload` 的方法集 vs 重写工程的调用集）
 *
 * 用法：node scripts/extract-host-api.cjs [--json]
 */
const fs = require('node:fs');
const path = require('node:path');

const PRELOAD = path.resolve(__dirname, '..', 'electron', 'preload.ts');

if (!fs.existsSync(PRELOAD)) {
  console.error('❌ 未找到 electron/preload.ts');
  process.exit(1);
}

const src = fs.readFileSync(PRELOAD, 'utf8');
const start = src.indexOf("exposeInMainWorld('api'");
if (start < 0) {
  console.error("❌ 未找到 exposeInMainWorld('api')");
  process.exit(1);
}
const body = src.slice(start);

/**
 * 逐个成员扫描：`name: <参数> => <实现>`，实现体取到下一个同级成员或 400 字符
 * （比一次性全局正则可靠 —— 订阅方法体是多行块）
 */
const RE_MEMBER = /^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;

const positions = [];
let m;
while ((m = RE_MEMBER.exec(body)) !== null) {
  positions.push({ name: m[1], at: m.index, end: m.index + m[0].length });
}

const methods = [];
for (let i = 0; i < positions.length; i++) {
  const cur = positions[i];
  const next = positions[i + 1];
  // 实现体：到下一个同级成员之前（上限 1200 字符，防跨段）
  const impl = body.slice(cur.end, Math.min(next ? next.at : cur.end + 1200, cur.end + 1200));

  const sync = /ipcRenderer\.sendSync\(\s*'([^']+)'/.exec(impl);
  const send = /ipcRenderer\.send\(\s*'([^']+)'/.exec(impl);
  const invoke = /ipcRenderer\.invoke\(\s*'([^']+)'/.exec(impl);
  const on = /ipcRenderer\.on\(\s*'([^']+)'/.exec(impl);

  if (sync) methods.push({ name: cur.name, kind: 'sendSync', channel: sync[1] });
  else if (on) methods.push({ name: cur.name, kind: 'on', channel: on[1] });
  else if (send) methods.push({ name: cur.name, kind: 'send', channel: send[1] });
  else if (invoke) methods.push({ name: cur.name, kind: 'invoke', channel: invoke[1] });
  else methods.push({ name: cur.name, kind: 'value', channel: '' });
}

// 去重（同名只留第一次）
const seen = new Set();
const uniq = methods.filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)));
uniq.sort((a, b) => a.name.localeCompare(b.name));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(uniq, null, 2));
} else {
  const byKind = { invoke: [], send: [], sendSync: [], on: [], value: [] };
  for (const x of uniq) (byKind[x.kind] ??= []).push(x);

  console.log(`preload.ts 暴露 ${uniq.length} 个成员\n`);
  for (const [kind, list] of Object.entries(byKind)) {
    if (list.length === 0) continue;
    console.log(`── ${kind}（${list.length}）──`);
    for (const x of list) console.log(`  ${x.name.padEnd(34)} ${x.channel}`);
    console.log('');
  }
  console.log('★ sendSync（W1 要求：必须按同步调用）:');
  for (const x of byKind.sendSync) console.log(`  ${x.name}  ← ${x.channel}`);
  console.log('\n★ 订阅（W1 要求：必须返回并调用取消函数）:');
  for (const x of byKind.on) console.log(`  ${x.name}  ← ${x.channel}`);
}
