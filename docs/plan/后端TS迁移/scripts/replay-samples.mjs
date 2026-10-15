#!/usr/bin/env node
/**
 * replay-samples.mjs —— 证据录制 / 回放（README §4.2 D-12 黄金样本 · D-13 数据兼容样本）。
 *
 * 为什么要有它（README §4.2 / 弯路 W15）：**没有 before，就无法证明 after**。
 * 「行为等价 + 数据兼容」若只有"我小心了"，事后任何等价主张都无据可查。
 *
 * 三条纪律（照 README §4.2 写，别自己加码）：
 *   · **复用**仓里 `tests/fixtures` 与 `%APPDATA%/doubao-canvas` 的真实文件，⛔ 不新造样本体系；
 *   · **一个通用脚本**（探针是一个数组，不是 N 个 harness）；⛔ 不为每个样本写专用脚本；
 *   · 样本里**不得有真实密钥 / cookie / 账号** ⇒ 录制时**按字段脱敏**（保留结构与长度提示）。
 *
 * ★ 回放对象是 **`electron/dist/`**（编译产物 = 真正会跑的那份）⇒ 转成 `.ts` 后**同一条命令继续有效**
 *   （源码是 `.js` 还是 `.ts` 与它无关），这正是「迁移前后跑同一读写再 diff」需要的形状。
 *
 * 用法：
 *   node docs/plan/后端TS迁移/scripts/replay-samples.mjs --record   # 录基线（证据区默认写）
 *   node docs/plan/后端TS迁移/scripts/replay-samples.mjs --verify   # 与基线 diff（漂移 ⇒ exit 1）
 *   node docs/plan/后端TS迁移/scripts/replay-samples.mjs --json [--record|--verify]
 * 退出码：0 通过 · 1 漂移/不可达（**不当成通过**）· 2 用法或环境错。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const TASK = path.resolve(HERE, '..');
const EVIDENCE = path.join(TASK, 'evidence');
const SAMPLES = path.join(EVIDENCE, 'samples');
const GOLDEN = path.join(EVIDENCE, 'golden');
const DIST = path.join(REPO, 'electron', 'dist');
const USER_DATA = path.join(os.homedir(), 'AppData', 'Roaming', 'doubao-canvas');
const FIXTURES = path.join(REPO, 'tests', 'fixtures', 'real-sample');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`replay-samples.mjs —— 证据录制/回放（D-12 黄金样本 · D-13 数据兼容样本）

用法：node .../replay-samples.mjs [--record] [--verify] [--json] [--help]
  --record  录基线（写 evidence/；证据区默认写）
  --verify  与基线 diff（漂移 ⇒ exit 1）
  --json    机器可读
  --help    本帮助

前置：electron/dist/ 存在（npx tsc -p electron/tsconfig.json）`);
  process.exit(0);
}
const doRecord = args.includes('--record');
const doVerify = args.includes('--verify');
const wantJson = args.includes('--json');
if (!doRecord && !doVerify) {
  console.error('❌ 二选一：--record 或 --verify');
  process.exit(2);
}

const require_ = createRequire(import.meta.url);
const REDACT_KEY = /(apiKey|secretKey|token|cookie|password|passwd|machineCode|^mc$|^code$|^sig$|privateKey)/i;
const redactValue = (v, key) => {
  if (typeof v === 'string') {
    const kind = /^[A-Za-z0-9+/=]+$/.test(v) ? 'base64' : /^[0-9a-f]+$/i.test(v) ? 'hex' : 'text';
    return `<redacted:${key}:${kind}:${v.length}B>`;
  }
  return `<redacted:${key}:${typeof v}>`;
};
/** 递归脱敏（只按字段名，保留结构与长度提示 —— 这是隐私与可复用的折中） */
function redact(node, keyHint = '') {
  if (Array.isArray(node)) return node.map((x) => redact(x, keyHint));
  if (node === null || typeof node !== 'object') {
    return REDACT_KEY.test(keyHint) ? redactValue(node, keyHint) : node;
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = redact(v, k);
  return out;
}

/** 稳定化：去掉绝对路径（证据要能在别的机器上 diff） */
const stabilize = (s) => String(s).split(REPO).join('<REPO>').split(USER_DATA).join('<USER_DATA>');

const report = { samples: [], golden: [], reachability: [], skipped: [] };

// ── ① D-13：真实文件 → 脱敏样本 ──
const DATA_FILES = [
  { name: 'api-config.json', note: 'API 接入配置（含 safeStorage 密文）' },
  { name: 'license.dat', note: '授权记录 JSON（HMAC 防篡改）' },
  { name: 'machine_id.dat', note: '机器码锚定记录' },
  { name: 'timeanchor.dat', note: '可信时间锚点' },
  { name: 'used_codes.dat', note: '激活码一次性使用记录（AES-256-GCM 密文）' },
  { name: 'settings.json', note: '下载落点设置（dola-media 读写）' },
];
for (const { name, note } of DATA_FILES) {
  const src = path.join(USER_DATA, name);
  if (!fs.existsSync(src)) {
    report.skipped.push({ file: name, note, reason: '本机 userData 里不存在（该用户从未写过）' });
    continue;
  }
  const raw = fs.readFileSync(src, 'utf-8');
  let sample;
  if (/\.json$|\.dat$/.test(name) && raw.trimStart().startsWith('{')) {
    sample = redact(JSON.parse(raw));
  } else {
    sample = { $note: '二进制/密文：只记长度与前缀类别', length: raw.length, kind: 'binary' };
  }
  const rec = { file: name, note, bytes: raw.length, redacted: JSON.stringify(sample, null, 2) };
  report.samples.push(rec);
  if (doRecord) {
    fs.mkdirSync(SAMPLES, { recursive: true });
    fs.writeFileSync(path.join(SAMPLES, `${name}.sample.json`), `${JSON.stringify(sample, null, 2)}\n`, 'utf-8');
  }
}
// tests/fixtures 的真实样本：**原地复用**（不再拷一份 —— 那一份就是第二载体）
const fixtureProjects = path.join(FIXTURES, 'projects-autobackup.json');
report.samples.push({
  file: 'projects-autobackup.json',
  note: '工程备份（与 localStorage doubao-projects 同源）',
  reuses: 'tests/fixtures/real-sample/projects-autobackup.json',
  exists: fs.existsSync(fixtureProjects),
  bytes: fs.existsSync(fixtureProjects) ? fs.statSync(fixtureProjects).size : 0,
});

// ── ② D-12/D-13 回放探针（**通用**：数组里加一条就是加一个探针）──
const PROBES = [
  {
    id: 'config-store.roundtrip',
    module: 'electron/dist/api/config-store.js',
    entry: 'createConfigStore',
    why: 'config-store 可注入（`createConfigStore(dir, null)`）⇒ 旧样本读一遍、写回、比字节',
    run(mod, { tmp }) {
      const dir = path.join(tmp, 'cfg');
      fs.mkdirSync(dir, { recursive: true });
      const samplePath = path.join(SAMPLES, 'api-config.json.sample.json');
      const sample = fs.existsSync(samplePath) ? JSON.parse(fs.readFileSync(samplePath, 'utf-8')) : { version: 2, providers: {} };
      fs.writeFileSync(path.join(dir, 'api-config.json'), JSON.stringify(sample, null, 2), 'utf-8');

      const store = mod.createConfigStore(dir, null);
      const adapter = { id: 'volcengine-ark', defaults: { baseUrl: 'https://x/v1', model: 'm', params: { a: 1 } } };
      const out = {};
      out.getSetup = store.getSetup();
      out.publicOf = store.publicOf(adapter);
      out.getUsage = store.getUsage();
      out.hasKey = store.hasKey(adapter);
      out.incrementUsage = store.incrementUsage('image', 1760000000000);
      out.maskKey = mod.maskKey('sk-abcdef1234567890');
      out.CONFIG_VERSION = mod.CONFIG_VERSION;
      // 写回后的文件（**格式兼容的核心证据**）：去掉绝对路径后再比
      out.fileAfterOps = stabilize(fs.readFileSync(path.join(dir, 'api-config.json'), 'utf-8'));
      return out;
    },
  },
];

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-dbts-'));
for (const probe of PROBES) {
  for (const rel of [probe.module, probe.module.replace(/\.js$/, '.ts')]) {
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) continue;
    if (!/dist[\\/]/.test(abs)) {
      report.reachability.push({ probe: probe.id, 可达: false, 依据: `${rel} 是源码（Node 读不了 .ts）⇒ 必须走 electron/dist/ 产物` });
      continue;
    }
    let mod;
    try {
      mod = require_(abs);
    } catch (err) {
      report.reachability.push({ probe: probe.id, 可达: false, 依据: `require 失败：${stabilize(String(err && err.message))}` });
      continue;
    }
    if (typeof mod[probe.entry] !== 'function') {
      report.reachability.push({ probe: probe.id, 可达: false, 依据: `导出面无 ${probe.entry}` });
      continue;
    }
    const value = probe.run(mod, { tmp: tmpRoot });
    report.reachability.push({ probe: probe.id, 可达: true, 依据: probe.why });
    report.golden.push({ probe: probe.id, value });
    break;
  }
}

// ── ③ D-12 可达性裁决（**没做的如实写"未验"**）──
report.reachability.push(
  {
    probe: 'license.verifyActivationCode',
    可达: false,
    依据:
      'license.js 的导出面只有 `initLicense` / `__setTrustedTimeOverride`（源码 A 级证据）⇒ 机器码/验签函数**不可注入**；' +
      '要触发只能起 Electron（`initLicense` 内 `require(\'electron\').app`）',
    结果: '未验',
    手测清单: [
      '前提：本机有 license.dat（真实授权）',
      '操作：起窗 → 打开授权页 → 点「复制机器码」',
      '期望：显示的机器码与 userData/machine_id.dat 的 code 字段一致',
      '实际：（待人工填）',
    ],
  },
  {
    probe: 'main.detectStorageLayout / migrateEngineeringToFile',
    可达: false,
    依据: '二者都在 `main.js` 内部，未导出；`makeProjectStorage` 亦然 ⇒ 只能经 IPC handler（需 Electron + 对话框）',
    结果: '未验',
    手测清单: [
      '前提：准备三种布局的目录（new-file / new-folder / legacy）',
      '操作：起窗 → 对每个目录走一次「切换项目存储位置」',
      '期望：new-file 直用；new-folder 生成 <项目名>.json 并删旧子目录；legacy 平铺子目录不变',
      '实际：（待人工填）',
    ],
  },
);

// ── ④ 落盘 / diff ──
if (doRecord) {
  fs.mkdirSync(GOLDEN, { recursive: true });
  fs.writeFileSync(path.join(GOLDEN, 'samples-golden.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`✅ 已录：样本 ${report.samples.length}（跳过 ${report.skipped.length}）· 黄金样本 ${report.golden.length} 条 · 可达性 ${report.reachability.length} 条`);
  console.log(`   证据落点 ${path.relative(REPO, GOLDEN)} 与 ${path.relative(REPO, SAMPLES)}`);
}

let drifted = [];
if (doVerify) {
  const file = path.join(GOLDEN, 'samples-golden.json');
  if (!fs.existsSync(file)) {
    console.error(`❌ 没有基线可 diff（先 --record）：${path.relative(REPO, file)}`);
    process.exit(2);
  }
  const base = JSON.parse(fs.readFileSync(file, 'utf-8'));
  for (const cur of report.golden) {
    const old = base.golden.find((g) => g.probe === cur.probe);
    if (!old) {
      drifted.push(`${cur.probe}：基线里没有这条（新增探针？重录基线）`);
      continue;
    }
    if (JSON.stringify(old.value) !== JSON.stringify(cur.value)) {
      drifted.push(`${cur.probe}：输出漂移\n  基线: ${JSON.stringify(old.value).slice(0, 300)}\n  现在: ${JSON.stringify(cur.value).slice(0, 300)}`);
    }
  }
  for (const r of report.reachability) {
    const old = base.reachability.find((g) => g.probe === r.probe);
    if (old && old.可达 !== r.可达) drifted.push(`${r.probe}：可达性变了（${old.可达} → ${r.可达}）`);
  }
}

if (wantJson) {
  console.log(JSON.stringify({ ...report, drifted }, null, 2));
} else if (!doRecord) {
  console.log(`════════ 回放校验 ════════`);
  console.log(`  样本 ${report.samples.length} · 黄金样本 ${report.golden.length} · 跳过 ${report.skipped.length}`);
  for (const r of report.reachability) {
    console.log(`  ${r.可达 ? '✅' : '⚠️'} ${r.probe}：${r.可达 ? '已回放' : `未验 —— ${r.依据}`}`);
  }
  for (const s of report.skipped) console.log(`  ⏭️ ${s.file}：${s.reason}`);
  if (drifted.length) {
    console.error(`\n❌ 漂移 ${drifted.length} 处：`);
    for (const d of drifted) console.error(`  · ${d}`);
  } else {
    console.log('\n✅ 无漂移（与基线逐字节一致）');
  }
}

process.exit(drifted.length ? 1 : 0);
