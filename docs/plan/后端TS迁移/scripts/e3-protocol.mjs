#!/usr/bin/env node
/**
 * e3-protocol.mjs —— **E3 真会话**：三个协议 handler（`img` / `vid` / `appasset`）的 in/out 对照。
 *
 * 为什么单独一个脚本：这三个 handler 是 `main.ts` 里 `app.whenReady()` 注册的**内联闭包**
 * —— 纯 Node 跑不了（E1 的边界），也 import 不出来（没导出）⇒ 只能起真 Electron、
 * **在 `protocol.handle` 上抓**（见 `e3-protocol-probe.cjs`）。
 *
 * 做什么：
 *   ① 备**旧侧**：把基线（各文件"改名提交的父提交"）摊成 `<tmp>/e3/old/electron/*.js`，
 *      并把 `<tmp>/e3/dist` 软链到仓里 `dist/`（旧 main 的 `__dirname/../../dist` 正好落这）；
 *   ② 备**新侧**：直接用 `electron/dist/`（构建产物）；
 *   ③ 备两侧**各自**的 userData（`images/test.png` · `videos/test.mp4` —— 两侧同一份字节）；
 *   ④ 起两次 Electron（一进程一侧），喂同一批假 `Request`，比 `status` / 响应头 / body 长度+sha1。
 *
 * ⛔ 它**不判**"等价"：只报"同 / 异 + 两侧的值"。判断归人（`人工检查清单.md` §7.1 E3 行）。
 * ⛔ 不写仓库内任何文件（只写 OS 临时目录）。
 *
 * 用法：node .../e3-protocol.mjs [--values] [--keep] [--help]
 * 退出码：0 = 跑完（差异不改变退出码 —— 差异是"给人看的料"，不是闸）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`e3-protocol.mjs —— E3 真会话：三个协议 handler 的 in/out 对照
用法：node .../e3-protocol.mjs [--values] [--keep]
  --values  「同」也打印两侧实值
  --keep    保留临时目录（排查用）
只写 OS 临时目录；⛔ 不写仓库文件；不判"等价"（只报同/异）。`);
  process.exit(0);
}
const showValues = args.includes('--values');
const keep = args.includes('--keep');
const req = createRequire(path.join(REPO, 'electron', 'x.cjs'));
const PROBE = path.join(HERE, 'e3-protocol-probe.cjs');
const NEW_ROOT = path.join(REPO, 'electron', 'dist');

const sh = (c) => {
  try {
    return execSync(c, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

/** 用例（**人写**）：覆盖三个 handler 的**分支**（404 / 200 / 缩略图 / Range 206 / 416 / 防穿越 403） */
const CASES = [
  { id: 'img-404-缺名', scheme: 'img', url: 'img://' },
  { id: 'img-404-找不到', scheme: 'img', url: 'img://nope.png' },
  { id: 'img-200', scheme: 'img', url: 'img://test.png' },
  { id: 'img-缩略图-w16', scheme: 'img', url: 'img://test.png?w=16' },
  { id: 'vid-404-缺名', scheme: 'vid', url: 'vid://' },
  { id: 'vid-404-找不到', scheme: 'vid', url: 'vid://nope.mp4' },
  { id: 'vid-200', scheme: 'vid', url: 'vid://test.mp4' },
  { id: 'vid-206-Range', scheme: 'vid', url: 'vid://test.mp4', headers: { range: 'bytes=0-3' } },
  { id: 'vid-416-越界', scheme: 'vid', url: 'vid://test.mp4', headers: { range: 'bytes=99999-' } },
  { id: 'appasset-200', scheme: 'appasset', url: 'appasset://index.html' },
  { id: 'appasset-404', scheme: 'appasset', url: 'appasset://nope.wasm' },
  { id: 'appasset-403-防穿越', scheme: 'appasset', url: 'appasset://x/..%2f..%2fpackage.json' },
];

/** 1×1 透明 PNG（两侧写同一份字节 ⇒ body 可比） */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * ① 备旧侧：**整树取 `0a6216d`（迁移前）**，摊成 `<tmp>/e3/old/electron/*.js`。
 *
 * ★ 为什么是**整树一个提交**、不是 `compare-inout.mjs` 那种**逐文件"改名提交的父提交"**：
 *   E3 要**把整个 app 载起来**（`require(main.js)`）⇒ 树内必须**自洽**。
 *   逐文件取会得到**中途快照混搭**（实测：`bridge.js` 已用 `.adapter`，而 `providers/*.js` 还是
 *   `module.exports = adapter` ⇒ `registerProvider(undefined)` ⇒ **`main.js` 加载即抛**）。
 *   `0a6216d` 是迁移前最后一致状态 ⇒ 能载起来。
 *   ⚠️ **代价（如实）**：它**没有 B0-b 的 D-4**（入口切产物 / `loadFile('../dist')` / `appasset` dist 根）
 *   ⇒ 对**三个协议 handler 的行为**无影响（D-4 只改 dist 根**怎么算**，不改 handler 逻辑），
 *   且本脚本用软链把两侧的 dist 根都指到**同一份仓内 `dist/`** ⇒ appasset 的 body 可比。
 */
function exportOldTree(dstElectron) {
  fs.mkdirSync(dstElectron, { recursive: true });
  const files = (sh('git ls-tree -r --name-only 0a6216d electron') || '').split('\n').filter(Boolean);
  let n = 0;
  for (const f of files) {
    const code = sh(`git show 0a6216d:${f}`);
    if (code === null) continue;
    const dst = path.join(dstElectron, ...f.replace(/^electron\//, '').split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, code, 'utf8');
    n++;
  }
  return { n };
}

/**
 * ③ 备一侧夹具：写到 `<appData>/doubao-canvas/{images,videos}` ——
 *   ⚠️ **不是**写到 `userData` 直下：`main.js` 顶层把 userData 固定成 `appData/doubao-canvas`，
 *   所以我们只能从上游 `appData` 下手（见探针头注）。
 */
function makeAppData(appDataDir) {
  fs.rmSync(appDataDir, { recursive: true, force: true });
  const ud = path.join(appDataDir, 'doubao-canvas');
  fs.mkdirSync(path.join(ud, 'images'), { recursive: true });
  fs.mkdirSync(path.join(ud, 'videos'), { recursive: true });
  fs.writeFileSync(path.join(ud, 'images', 'test.png'), PNG_1x1);
  // vid handler 只 stat + 流字节（不校验容器格式）⇒ 定长字节即可，两侧同一份
  fs.writeFileSync(path.join(ud, 'videos', 'test.mp4'), Buffer.alloc(64, 7));
}

/** 起一侧 Electron（异步 spawn ＋ await —— ⛔ 不能 spawnSync：会堵父进程，见 `弯路.md` W36） */
function runSide(side, root, appData) {
  const jobPath = path.join(BASE_TMP, `job-${side}.json`);
  fs.writeFileSync(jobPath, JSON.stringify({ root, appData, cases: CASES }, null, 2), 'utf8');
  const bin = req('electron');
  return new Promise((resolve) => {
    const cp = spawn(bin, [PROBE, jobPath], {
      cwd: REPO,
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    });
    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', (d) => (stdout += d));
    cp.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => cp.kill('SIGKILL'), 90000);
    cp.on('close', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr });
    });
  });
}

// ────────────────────────── main ──────────────────────────
const BASE_TMP = path.join(os.tmpdir(), 'e3');
fs.rmSync(BASE_TMP, { recursive: true, force: true });
fs.mkdirSync(BASE_TMP, { recursive: true });

if (!fs.existsSync(path.join(NEW_ROOT, 'main.js'))) {
  console.error(`❌ 新侧产物不存在：${path.join(NEW_ROOT, 'main.js')} —— 先跑 \`npm run build:electron\``);
  process.exit(2);
}
if (!fs.existsSync(path.join(REPO, 'dist', 'index.html'))) {
  console.error(`❌ ${path.join(REPO, 'dist', 'index.html')} 不存在（前端没构建）—— appasset-200 用例会假失败，先 \`npm run build\``);
  process.exit(2);
}

const OLD_ROOT = path.join(BASE_TMP, 'old', 'electron');
const { n: oldFiles } = exportOldTree(OLD_ROOT);
// 旧侧住在仓外 ⇒ `require('ws')` 解析不到 ⇒ 软链仓库那份（两侧同一实例）
fs.symlinkSync(path.join(REPO, 'electron', 'node_modules'), path.join(BASE_TMP, 'old', 'electron', 'node_modules'), 'dir');
// 迁移前布局：`__dirname/../dist`（源态 `electron/` ⇒ 上一级）＝ `<tmp>/e3/old/dist` ⇒ 软链到仓里 dist
fs.symlinkSync(path.join(REPO, 'dist'), path.join(BASE_TMP, 'old', 'dist'), 'dir');

const adOld = path.join(BASE_TMP, 'appdata-old');
const adNew = path.join(BASE_TMP, 'appdata-new');
makeAppData(adOld);
makeAppData(adNew);

console.log('════════ E3 真会话：三个协议 handler 的 in/out 对照 ════════');
console.log(`旧侧基线：${oldFiles} 个文件（整树 0a6216d＝迁移前）→ ${OLD_ROOT}`);
console.log(`新侧产物：${NEW_ROOT}`);
console.log(`用例：${CASES.length} 个\n`);

const a = await runSide('old', OLD_ROOT, adOld);
const b = await runSide('new', NEW_ROOT, adNew);

const parse = (out) => {
  const m = new Map();
  for (const l of out.split('\n')) {
    if (!l.startsWith('__E3__ ')) continue;
    const o = JSON.parse(l.slice('__E3__ '.length));
    m.set(String(o.id), o);
  }
  return m;
};
const ma = parse(a.stdout);
const mb = parse(b.stdout);
if (ma.get('__load__') || mb.get('__load__')) {
  console.log('❌ 有一侧 `require(main.js)` 加载即抛（用例跑不了）：');
  if (ma.get('__load__')) console.log(`   旧：${ma.get('__load__').error}`);
  if (mb.get('__load__')) console.log(`   新：${mb.get('__load__').error}`);
  if (keep) console.log(`\n临时目录保留：${BASE_TMP}`);
  process.exit(1);
}
// ⚠️ **先看夹具是否真到位**：否则 img/vid 的"两侧都 404"是**假通过**（两侧一起失败 ⇒ 逐字节相等）
const ea = ma.get('__env__');
const eb = mb.get('__env__');
console.log('夹具自检：');
console.log(`   旧 userData=${ea ? ea.userData : '(缺)'} 图=${ea && ea.hasImg} 视=${ea && ea.hasVid}`);
console.log(`   新 userData=${eb ? eb.userData : '(缺)'} 图=${eb && eb.hasImg} 视=${eb && eb.hasVid}`);
if (!ea || !eb || !ea.hasImg || !ea.hasVid || !eb.hasImg || !eb.hasVid) {
  console.log('❌ 夹具没到位 ⇒ img/vid 的"两侧都 404"是假通过，先修夹具再读结论');
  if (keep) console.log(`\n临时目录保留：${BASE_TMP}`);
  process.exit(1);
}
console.log('');

let same = 0;
let diff = 0;
const problems = [];
for (const c of CASES) {
  const oa = ma.get(c.id);
  const ob = mb.get(c.id);
  const brief = `${c.scheme}://…${c.headers ? ` [${c.headers.range}]` : ''}`;
  if (!oa || !ob) {
    console.log(`   ⚠️ ${c.id} —— 探针没回（旧 ${oa ? '有' : '无'} / 新 ${ob ? '有' : '无'}）`);
    problems.push(`${c.id}：探针未回结果`);
    continue;
  }
  const sa = JSON.stringify(oa);
  const sb = JSON.stringify(ob);
  const ok = sa === sb;
  if (ok) same++;
  else {
    diff++;
    problems.push(`${c.id} 输出不同`);
  }
  console.log(`   ${ok ? '✅' : '❌'} ${c.id}  ${brief}`);
  if (!ok || showValues) {
    console.log(`      旧：${JSON.stringify(oa)}`);
    console.log(`      新：${JSON.stringify(ob)}`);
  }
}

console.log(`\n════════ 汇总 ════════`);
console.log(`用例 ${CASES.length} ｜ 同 ${same} ｜ 异 ${diff}`);
if (problems.length) {
  console.log(`⚠️ 需人看的项（${problems.length}）：`);
  for (const p of problems) console.log(`   · ${p}`);
}
if (a.stderr.trim()) console.log(`\n（旧侧 stderr 摘要）${a.stderr.trim().split('\n').slice(-3).join(' | ')}`);
if (b.stderr.trim()) console.log(`（新侧 stderr 摘要）${b.stderr.trim().split('\n').slice(-3).join(' | ')}`);
if (keep) console.log(`\n临时目录保留：${BASE_TMP}`);
else fs.rmSync(BASE_TMP, { recursive: true, force: true });
