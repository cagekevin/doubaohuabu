#!/usr/bin/env node
/**
 * compare-inout.mjs —— **两侧输入/输出对照**（复核清单的 E 层：后端没有 UI ⇒ 判据只能是 in/out）
 *
 * 做什么：
 *   ① 把**基线**（git 里 `electron/**` 各文件"改名提交的父提交"那版）导出到**仓外临时目录**，
 *      并逐个核对"它是否真的等于该文件的改名前版本"（B0-b 改过的文件会被点名 ⇒ 别拿它当基线）；
 *   ② 对每个模块，**同时 require 旧侧（导出副本）与新侧（`electron/dist/` 产物）**，然后比对：
 *      · **导出面**：名字集合 · 每个导出的 `typeof` · 函数的 arity（形参数）
 *      · **常量**：深比（排序键、区分 `undefined` 与 `null`、路径归一化）
 *      · **函数**：有输入样本的逐例调两侧、深比**返回值和抛错**（类型 ＋ 消息）
 *   ③ 打印逐项结果；**没有样本的函数显式列为"无样本"**（⛔ 不静默：没有样本 ≠ 验过）。
 *
 * ⛔ 它**不判**"等价"：只报"同 / 异 + 两侧的值"。判断归人（`人工检查清单.md` 的 B/E 层）。
 * ⛔ 不写仓库内任何文件（只写 OS 临时目录）。
 *
 * 用法：node .../compare-inout.mjs [--only <子串>] [--list] [--help]
 *   --only <s>  只看路径含 <s> 的模块
 *   --list      只列模块与导出面（不跑样本）
 * 退出码：0 = 跑完（差异不改变退出码 —— 差异是"给人看的料"，不是闸）
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`compare-inout.mjs —— 两侧输入/输出对照（复核 E 层）

用法：node .../compare-inout.mjs [--only <子串>] [--list]
  --only <s>  只看路径含 <s> 的模块
  --list      只列模块与导出面（不跑样本）
只写 OS 临时目录；⛔ 不写仓库文件；不判"等价"（只报同/异）。`);
  process.exit(0);
}
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const listOnly = args.includes('--list');
const engineIdx = args.indexOf('--engine');
const engine = engineIdx >= 0 ? (args[engineIdx + 1] || 'node') : 'node';
const e2OnlyIdx = args.indexOf('--e2-only');
const e2Only = e2OnlyIdx >= 0 ? args[e2OnlyIdx + 1] : null;

const sh = (c) => {
  try {
    return execSync(c, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
const req = createRequire(path.join(REPO, 'electron', 'x.cjs'));

/**
 * ① 导出基线到仓外临时目录。
 *
 * ★ 取法：**优先"该文件改名提交的父提交"**（＝改写依据那一版），取不到才回落 `0a6216d`（迁移前）。
 *   ⛔ 回落会让**被 B0-b 改过的文件**（实测 3 个：`api/bridge.js` / `firefox.js` / `main.js`）拿到错版本
 *   ⇒ 那些行**别当基线**（脚本会点名）。
 */
function exportBaseline() {
  const root = path.join(os.tmpdir(), 'onc');
  const oldDir = path.join(root, 'old');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(oldDir, { recursive: true });
  const files = (sh('git ls-tree -r --name-only 0a6216d electron') || '').split('\n').filter(Boolean);
  const fallback = [];
  const touched = [];
  let count = 0;
  for (const f of files) {
    const rel = f.replace(/^electron\//, '');
    const jsPath = f.endsWith('.js') ? f : null;
    let code = null;
    let how = '';
    if (jsPath) {
      // ⚠️ 用 `~1` 不用 `^`：Windows 的 cmd.exe 把 `^` 当转义符（`sha^:p` 会被吃成 `sha:p`）
      const del = sh(`git log --diff-filter=D -1 --format=%H -- ${jsPath}`);
      if (del) {
        code = sh(`git show ${del}~1:${jsPath}`);
        if (code !== null) how = `${del.slice(0, 7)}~1`;
      }
    }
    if (code === null) {
      code = sh(`git show 0a6216d:${f}`);
      how = '0a6216d(迁移前)';
      if (jsPath) fallback.push(jsPath);
    }
    if (code === null) continue;
    // ★ **基线 caveat**：该文件在"改名前"那版里是否**已被中途批次碰过**？
    //   （对照迁移前那版即可判 ⇒ 两者不同 ⇒ 这一版不是纯源，拿它比会出现**假差异**）
    if (jsPath) {
      const pre = sh(`git show 0a6216d:${f}`);
      if (pre !== null && pre !== code) touched.push(jsPath);
    }
    const dst = path.join(oldDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, code, 'utf8');
    count++;
    void how;
  }
  return { oldDir, count, fallback, touched, touchedSet: new Set(touched.map((t) => t.replace(/^electron\//, ''))) };
}

/**
 * ★ 两侧必须拿到**同一个** `electron` / `ws`：旧侧副本住在仓外临时目录 ⇒ 它解析不到仓库里的模块，
 *   而新侧（`electron/dist/`）能解析 ⇒ 会出现**不对称的加载失败**（不是真差异）。
 *   ⇒ 这里把这两个裸模块统一解析到仓库里那一份（两侧同一个实例 ⇒ 可比）。
 *   ⚠️ 于是"调用真 Electron API"的样本在两侧会**以同样方式失败** ⇒ 那种行只证明"两边同样失败"，
 *      **不是**等价证据（要真环境 ⇒ E2）。
 */
function unifyResolution() {
  const Module = createRequire(import.meta.url)('node:module');
  const orig = Module._resolveFilename;
  const nms = [path.join(REPO, 'electron', 'node_modules'), path.join(REPO, 'node_modules')];
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'electron' || request === 'ws') {
      for (const nm of nms) {
        try {
          return orig.call(this, path.join(nm, request), ...rest);
        } catch {
          /* 换下一个候选 */
        }
      }
    }
    return orig.call(this, request, ...rest);
  };
}

/** 深比 + 归一（排序键 · 区分 undefined/null · 路径占位 · 函数比 name/arity） */
function normalize(v, seen = new Set()) {
  if (v === null) return { t: 'null' };
  const ty = typeof v;
  if (ty === 'undefined') return { t: 'undefined' };
  if (ty === 'string') return { t: 'string', v: v.replace(/[/\\]onc[/\\]old/g, '<OLD>').replace(/[/\\]electron[/\\]dist/g, '<NEW>') };
  if (ty === 'number' || ty === 'boolean') return { t: ty, v };
  if (ty === 'bigint') return { t: 'bigint', v: String(v) };
  if (ty === 'symbol') return { t: 'symbol', v: String(v) };
  if (ty === 'function') return { t: 'function', name: v.name, arity: v.length };
  if (seen.has(v)) return { t: 'cycle' };
  seen.add(v);
  if (Array.isArray(v)) return { t: 'array', v: v.map((x) => normalize(x, seen)) };
  if (v instanceof Map) return { t: 'map', v: [...v.entries()].map(([k, x]) => [normalize(k, seen), normalize(x, seen)]) };
  if (v instanceof Set) return { t: 'set', v: [...v].map((x) => normalize(x, seen)) };
  if (v instanceof Error) return { t: 'error', name: v.name, message: v.message };
  const keys = Object.keys(v).sort();
  return { t: 'object', v: keys.map((k) => [k, normalize(v[k], seen)]) };
}
const show = (v) => {
  const s = JSON.stringify(normalize(v));
  return s.length > 300 ? s.slice(0, 300) + '…' : s;
};

/**
 * ② **语义面映射**（⛔ 不是我临时编的口径 —— 每一条都引用**已登记的约定**）
 *
 * `api/providers/*`：B2-b 日志登记的约定变化 ——源是 `module.exports = adapter`（模块本体就是 adapter），
 * 转换后是 **具名导出 `export { adapter }`**（⛔ 禁 `export default`），且 `bridge.js` 的 5 处
 * `registerProvider(require('./providers/x'))` **同批**改成取 `.adapter`。
 * ⇒ 比"语义面"：旧侧取**模块本体**，新侧取 **`.adapter`**。
 */
const FACE = {
  'api/providers/geeknow-relay.js': { old: (m) => m, new: (m) => m.adapter, why: 'B2-b：module.exports = adapter → export { adapter }' },
  // ⚠️ kling 多一处：B2-b 把源里 adapter 上的 `signKlingJwt` 搬成**模块级具名导出**
  //   （日志原文："kling 的 `module.exports.signKlingJwt` → 一并具名导出"）
  //   ⇒ 语义面 = `.adapter` **再合回** `signKlingJwt`（否则会误报"缺 signKlingJwt"）
  'api/providers/kling.js': {
    old: (m) => m,
    new: (m) => ({ ...m.adapter, signKlingJwt: m.signKlingJwt }),
    why: 'B2-b：adapter 本体 ＋ signKlingJwt 改具名导出（本处把两者合回同一语义面）',
  },
  'api/providers/llm-openai-compat.js': { old: (m) => m, new: (m) => m.adapter, why: '同上' },
  'api/providers/vidu.js': { old: (m) => m, new: (m) => m.adapter, why: '同上' },
  'api/providers/volcengine-ark.js': { old: (m) => m, new: (m) => m.adapter, why: '同上' },
};

/** ② 输入样本（**人写**：这一步是判断活，脚本不生成输入） */
/** 5 个 provider 共用的样本（表里没这个函数时会被跳过） */
const PROVIDER_CASES = [
  { fn: 'buildSubmit', args: [{}] },
  { fn: 'buildSubmit', args: [null] },
  { fn: 'buildSubmit', args: [undefined] },
  { fn: 'buildSubmit', args: [{ model: 'x', prompt: 'hello', params: { a: 1 } }] },
  { fn: 'buildPoll', args: [{ id: 'job-1' }] },
  { fn: 'buildPoll', args: [null] },
  { fn: 'parseSubmit', args: [{ code: 0, data: { task_id: 't1', id: 'j1' } }] },
  { fn: 'parseSubmit', args: [{}] },
  { fn: 'parseSubmit', args: [null] },
  { fn: 'parseSubmit', args: ['not-json'] },
  { fn: 'parsePoll', args: [{ code: 0, data: { status: 'done', url: 'https://x/y.mp4' } }] },
  { fn: 'parsePoll', args: [{}] },
  { fn: 'parsePoll', args: [null] },
  { fn: 'signKlingJwt', args: ['ak-test', 'sk-test', { a: 1 }] },
  { fn: 'signKlingJwt', args: ['', '', 0] },
];
/** ⏱ 需要**冻结时钟**才可比的模块（含 `iat/exp` 之类时间戳的函数：两侧必须拿到同一个 `Date.now()`） */
const FREEZE = new Set(['api/providers/kling.js']);

const CASES = {
  // ★ 最高价值的一组：站点域名判定（层 1 域名 + 层 2 归属）—— 6 个导出，形参数已实测
  'site-hosts': [
    { fn: 'normalizeHost', args: ['www.doubao.com'] },
    { fn: 'normalizeHost', args: ['WWW.Doubao.COM'] },
    { fn: 'normalizeHost', args: ['  doubao.com  '] },
    { fn: 'normalizeHost', args: [''] },
    { fn: 'normalizeHost', args: [null] },
    { fn: 'normalizeHost', args: [undefined] },
    { fn: 'normalizeHost', args: [123] },
    { fn: 'hostOfUrl', args: ['https://www.doubao.com/chat/1?x=2'] },
    { fn: 'hostOfUrl', args: ['https://www.lovart.ai/'] },
    { fn: 'hostOfUrl', args: ['about:blank'] },
    { fn: 'hostOfUrl', args: ['not-a-url'] },
    { fn: 'hostOfUrl', args: [''] },
    { fn: 'hostOfUrl', args: [null] },
    { fn: 'isKnownHost', args: ['www.doubao.com'] },
    { fn: 'isKnownHost', args: ['doubao.com'] },
    { fn: 'isKnownHost', args: ['www.lovart.ai'] },
    { fn: 'isKnownHost', args: ['example.com'] },
    { fn: 'isKnownHost', args: [''] },
    { fn: 'isKnownHost', args: [null] },
    { fn: 'sourceOfHost', args: ['www.doubao.com'] },
    { fn: 'sourceOfHost', args: ['www.lovart.ai'] },
    { fn: 'sourceOfHost', args: ['example.com'] },
    { fn: 'sourceOfHost', args: [null] },
    { fn: 'isHostOf', args: ['www.doubao.com', 'doubao.com'] },
    { fn: 'isHostOf', args: ['www.doubao.com', 'lovart.ai'] },
    { fn: 'isHostOf', args: [null, null] },
  ],
  // 脱敏（日志面）：1 参
  'api/redact': [
    { fn: 'redactText', args: ['sk-1234567890123456789012345678901234567890'] },
    { fn: 'redactText', args: ['no secrets here'] },
    { fn: 'redactText', args: [''] },
    { fn: 'redactText', args: [null] },
    { fn: 'redactText', args: [undefined] },
    { fn: 'redactHeaders', args: [{ authorization: 'Bearer abcdefghijklmnop', 'x-api-key': 'k-1234567890', 'content-type': 'application/json' }] },
    { fn: 'redactHeaders', args: [{}] },
    { fn: 'redactHeaders', args: [null] },
    { fn: 'redactForLog', args: [{ apiKey: 'k-1234567890', nested: { secret: 's-abcdefghij' }, ok: 1 }] },
    { fn: 'redactForLog', args: ['plain-string'] },
    { fn: 'redactForLog', args: [null] },
  ],
  // 配额文案匹配（2 参：参数语义未知 ⇒ 同一组探针两侧各跑一次，值相等即可，语义归人核）
  'api/quota': [
    { fn: 'matchQuotaHint', args: ['今日生成次数已用完', {}] },
    { fn: 'matchQuotaHint', args: ['生成失败：额度不足，请稍后再试', {}] },
    { fn: 'matchQuotaHint', args: ['', {}] },
    { fn: 'matchQuotaHint', args: [null, null] },
    { fn: 'quotaMessage', args: ['quota', {}] },
    { fn: 'quotaMessage', args: [null, {}] },
  ],
  // HTTP 错误分类（1 参，纯）：网络类函数（requestJson*）要真网络 ⇒ 本层不测（如实列"无样本"）
  'api/http': [
    { fn: 'classifyHttpError', args: [new Error('boom')] },
    { fn: 'classifyHttpError', args: ['plain'] },
    { fn: 'classifyHttpError', args: [{ status: 429 }] },
    { fn: 'classifyHttpError', args: [null] },
    { fn: 'classifyHttpError', args: [undefined] },
  ],
  // ★ 密钥脱敏（1 参）：脱错 = 日志里漏密钥 ⇒ 高价值
  'api/config-store': [
    { fn: 'maskKey', args: ['sk-1234567890123456789012345678901234567890'] },
    { fn: 'maskKey', args: ['short'] },
    { fn: 'maskKey', args: [''] },
    { fn: 'maskKey', args: [null] },
    { fn: 'maskKey', args: [undefined] },
    { fn: 'maskKey', args: ['a'.repeat(200)] },
  ],
  // ★ 服务商注册表（纯内存状态：两侧各自从空开始 ⇒ 逐例同序调用即等价可比）
  'api/registry': [
    { fn: 'listProviderIds', args: [] },
    { fn: 'listProvidersMeta', args: [] },
    { fn: 'getProvider', args: ['nope'] },
    { fn: 'getProvider', args: [null] },
  ],
  // 轮换器与队列工具的**接口形状**（时间/网络相关的行为不在此层测 ⇒ 见 7.1b 读法纪律）
  'api/domains': [
    { fn: 'createDomainRota', args: ['a.com,b.com', 1000] },
    { fn: 'createDomainRota', args: [[], 0] },
  ],
  'api/job-manager': [
    { fn: 'defaultFetchBytes', args: [{ byteLength: 10 }, 'https://x/y'] },
    { fn: 'defaultFetchBytes', args: [null, null] },
    { fn: 'createJobManager', args: [{}] },
  ],
  // license 的导出面只有 initLicense / __setTrustedTimeOverride ⇒ 机器码/验签**不可注入**（如实"无样本"）
  'license': [{ fn: '__setTrustedTimeOverride', args: [1234567890] }, { fn: '__setTrustedTimeOverride', args: [null] }],
  // ★ provider 的**请求构建 / 响应解析**（改写最容易静默漂移的地方；5 个 provider 共用同一张表，
  //   工具会跳过"该模块没有的函数"）。数据常量（auth/capabilities/defaults/paramSchema/…）走常量深比。
  ...Object.fromEntries(
    [
      'api/providers/geeknow-relay.js',
      'api/providers/kling.js',
      'api/providers/llm-openai-compat.js',
      'api/providers/vidu.js',
      'api/providers/volcengine-ark.js',
    ].map((k) => [k, 'PROVIDER_CASES']),
  ),
  'api/shape': [
    { fn: 'asRecord', args: [{ a: 1 }] },
    { fn: 'asRecord', args: [null] },
    { fn: 'asRecord', args: [undefined] },
    { fn: 'asRecord', args: ['str'] },
    { fn: 'asRecord', args: [[1, 2]] },
    { fn: 'asRecord', args: [42] },
  ],
  'fingerprint-preload': [
    { fn: 'buildFingerprintPreload', args: [{}] },
    { fn: 'buildFingerprintPreload', args: [null] },
    { fn: 'buildFingerprintPreload', args: [undefined] },
    {
      fn: 'buildFingerprintPreload',
      args: [
        {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
          platform: 'MacIntel',
          languages: ['zh-CN', 'zh'],
          screen: { width: 1512, height: 982 },
          webgl: { renderer: 'Apple M1', vendor: 'Apple' },
          timezone: 'Asia/Shanghai',
        },
      ],
    },
  ],
  'dola-duration-dump': [{ fn: 'DUMP_EXPR', args: [], note: '常量逐字比（注入文本）' }],
};

/**
 * ③ **E2 样本**（要真 Electron 才跑得起来的那些）：`{{BASE}}` 在运行时换成父进程起的本地 HTTP 服务地址
 * （网络那几条要**可确定**的服务端 ⇒ 不碰外网）。
 */
const E2_CASES = [
  // ⚠️ 签名按源码：`requestJson(fetchImpl, url, opts)` —— 首参是**注入的 fetch 栈**（生产用 `net.fetch`）
  { mod: 'api/http.js', fn: 'requestJson', args: [{ $fn: 'net.fetch' }, '{{BASE}}/json'] },
  { mod: 'api/http.js', fn: 'requestJson', args: [{ $fn: 'net.fetch' }, '{{BASE}}/404'] },
  { mod: 'api/http.js', fn: 'requestJson', args: [{ $fn: 'net.fetch' }, '{{BASE}}/500'] },
  { mod: 'api/http.js', fn: 'requestJson', args: [{ $fn: 'net.fetch' }, '{{BASE}}/text'] },
  // 换栈分支：第一栈故意失败 ⇒ 应落到第二栈（`via` 字段就是它）
  {
    mod: 'api/http.js',
    fn: 'requestJsonWithFallback',
    args: [[{ $fn: '__throwingFetch' }, { $fn: 'net.fetch' }], '{{BASE}}/json'],
  },
  { mod: 'api/http.js', fn: 'requestJsonWithFallback', args: [[{ $fn: 'net.fetch' }], '{{BASE}}/json'] },
  { mod: 'api/config-store.js', fn: 'createConfigStore', args: ['probe', {}] },
  { mod: 'license.js', fn: 'initLicense', args: [] },
];

/** 启一个**确定**的本地 HTTP 服务（网络类函数的对照必须有确定的对端） */
async function startServer() {
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    const u = req.url || '/';
    if (u === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, n: 1 }));
      return;
    }
    if (u === '/text') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
      return;
    }
    if (u === '/404') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    if (u === '/500') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

/** 跑 E2：起 Electron 探针，两侧各跑同一批 job，按 id 配对比较 */
async function runElectron(base) {
  const { spawnSync } = await import('node:child_process');
  const electronBin = req('electron');
  const probe = path.join(HERE, 'compare-inout-probe.cjs');
  const { server, port } = await startServer();
  const BASE = `http://127.0.0.1:${port}`;
  const fill = (a) => (typeof a === 'string' ? a.replace('{{BASE}}', BASE) : a);
  const tmpRoot = path.dirname(base.oldDir);
  console.log(`探针：${probe}`);
  console.log(`本地服务：${BASE}（端点：/json · /text · /404 · /500）`);

  /**
   * ★ **一进程一侧**（实测必需）：两侧同进程时，`license.initLicense()` 第二次会抛
   *   `Attempted to register a second handler for 'get-machine-code'` —— Electron **禁止重复注册同一 IPC handler**
   *   ⇒ 那不是代码差异，是"同一进程塞了两个版本"。而且真实运行本来就是"一次只跑一个版本"。
   *   userData 也**两侧各一个**（`config-store` 会落盘 ⇒ 共用目录会让第二侧看到第一侧写的文件 ✗）。
   */
  const runSide = (side) => {
    const userData = path.join(tmpRoot, `userdata-${side}`);
    const jobPath = path.join(tmpRoot, `job-${side}.json`);
    const jobs = E2_CASES.map((c, i) => ({ c, i }))
      .filter(({ c, i }) => (e2Only ? JSON.stringify(c).includes(e2Only) || String(i) === e2Only : true))
      .map(({ c, i }) => ({
        id: String(i),
        side,
        mod: c.mod,
        fn: c.fn,
        args: (c.args || []).map(fill),
      }));
    fs.writeFileSync(jobPath, JSON.stringify({ oldRoot: base.oldDir, newRoot, userData, jobs }, null, 2), 'utf8');
    const res = spawnSync(electronBin, [probe, jobPath], { encoding: 'utf8', timeout: 90000, cwd: REPO });
    const out = new Map();
    for (const l of (res.stdout || '').split('\n')) {
      if (!l.startsWith('__E2__ ')) continue;
      const o = JSON.parse(l.slice('__E2__ '.length));
      out.set(String(o.id), o);
    }
    return { out, stderr: res.stderr || '', stdout: res.stdout || '' };
  };

  const jobsCount = E2_CASES.filter((c, i) => (e2Only ? JSON.stringify(c).includes(e2Only) || String(i) === e2Only : true)).length;
  const a = runSide('old');
  const b = runSide('new');
  server.close();
  if (!a.out.size || !b.out.size) {
    console.log(`❌ 探针没有输出（旧 ${a.out.size} 行 / 新 ${b.out.size} 行）—— 原始 stdout/stderr：`);
    console.log((a.stderr + a.stdout).slice(-1200));
    console.log((b.stderr + b.stdout).slice(-1200));
    return { ran: 0, same: 0, diff: 0, problems: ['E2 探针无输出（环境问题，非代码差异）'] };
  }
  // ⚠️ **部分失败也要给原因**（不然只看到"探针没回"，看不见它为什么死）
  if (a.out.size < jobsCount || b.out.size < jobsCount) {
    console.log(
      `⚠️ 探针**提前结束**（期望 ${jobsCount} 行：旧 ${a.out.size} / 新 ${b.out.size}）—— stderr 尾部：`,
    );
    console.log('   [旧] ' + (a.stderr.trim().split('\n').slice(-4).join(' ｜ ') || '(空)').slice(0, 400));
    console.log('   [新] ' + (b.stderr.trim().split('\n').slice(-4).join(' ｜ ') || '(空)').slice(0, 400));
  }
  let same = 0;
  let diff = 0;
  const problems = [];
  for (let i = 0; i < E2_CASES.length; i++) {
    const c = E2_CASES[i];
    if (e2Only && !(JSON.stringify(c).includes(e2Only) || String(i) === e2Only)) continue;
    const oa = a.out.get(String(i));
    const ob = b.out.get(String(i));
    const argBrief = JSON.stringify((c.args || []).map((x) => (typeof x === 'string' ? x.replace(BASE, '{{BASE}}') : x)));
    if (!oa || !ob) {
      console.log(`   ⚠️ ${c.mod} ${c.fn}(${argBrief}) —— 探针没回（旧 ${oa ? '有' : '无'} / 新 ${ob ? '有' : '无'}）`);
      problems.push(`${c.mod}.${c.fn}：探针未回结果`);
      continue;
    }
    // ⛔ 比的是 **`ok` ＋ `value`**，不比 `id`（id 是配对用的，带 side ⇒ 必然不同）
    const sa = JSON.stringify({ ok: oa.ok, value: oa.value });
    const sb = JSON.stringify({ ok: ob.ok, value: ob.value });
    const ok = sa === sb;
    if (ok) same++;
    else {
      diff++;
      problems.push(`${c.mod}.${c.fn}(${argBrief}) 输出不同`);
    }
    console.log(`   ${ok ? '✅' : '❌'} ${c.mod.replace(/\.js$/, '')} · ${c.fn}(${argBrief})`);
    if (!ok) {
      console.log(`      旧：${sa.slice(0, 300)}`);
      console.log(`      新：${sb.slice(0, 300)}`);
    }
  }
  return { ran: E2_CASES.length, same, diff, problems };
}

const t0 = Date.now();
const base = exportBaseline();
unifyResolution();
console.log('════════ 两侧输入/输出对照（E 层 · 后端没有 UI）════════\n');
console.log(`基线导出：${base.count} 个文件 → ${base.oldDir}（优先"各文件改名提交的父提交"）`);
if (base.fallback.length) {
  console.log(`⚠️ 回落成「迁移前」版本的文件（**B0-b 改过** ⇒ 这些行别当基线）：${base.fallback.join(' · ')}`);
} else {
  console.log('✔ 全部取到"改名前版本"（无回落）');
}
console.log('');

// 目标模块 = 新侧产物里有、且旧侧也有的 .js（排除 main/preload：它们需要 Electron，属 E2）
const newRoot = path.join(REPO, 'electron', 'dist');
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (e.name.endsWith('.js')) out.push(path.relative(newRoot, fp).split(path.sep).join('/'));
  }
  return out;
};
/**
 * ⚠️ **有加载期副作用的模块必须排到最后**（否则会污染同进程里其它模块的对照）：
 * `api/bridge.js` 在 **load 时**就 `registerProvider(…)` 五次 —— 实测把它排在 `api/registry.js` 之前时，
 * registry 的两个"空表"样本会假报"异"（新侧已被注册、旧侧还是空）。这是**工具的顺序问题**，不是代码差异。
 * ⇒ 本清单只放"加载即产生全局状态"的模块；加进来时必须写理由。
 */
const DEFER = new Set(['api/bridge.js']);

const mods = walk(newRoot)
  .filter((m) => !['main.js', 'preload.js'].includes(m))
  .filter((m) => fs.existsSync(path.join(base.oldDir, m)))
  .filter((m) => (only ? m.includes(only) : true))
  .sort((a, b) => Number(DEFER.has(a)) - Number(DEFER.has(b)) || a.localeCompare(b));
if (!only) {
  const deferred = mods.filter((m) => DEFER.has(m));
  if (deferred.length) console.log(`（已把有加载期副作用的模块排到末位：${deferred.join(' · ')}）\n`);
}

let casesRun = 0;
let casesSame = 0;
let casesDiff = 0;
let noSample = 0;
const problems = [];

// ── E2 分支（要真 Electron 的那些）：跑完就收工 ──
if (engine === 'electron') {
  const r = await runElectron(base);
  console.log(`════════ 汇总（E2 · Electron 探针）════════`);
  console.log(`逐例对照 ${r.ran} 例（同 ${r.same} · 异 ${r.diff}）`);
  if (r.problems.length) {
    console.log(`⚠️ 需人看的项（${r.problems.length}）：`);
    for (const p of r.problems) console.log('   · ' + p);
  } else {
    console.log('✅ 本次对照范围内没有"异"项（⛔ 但未进样本表的函数仍是未验）');
  }
  console.log(`（耗时 ${Date.now() - t0} ms · 两侧同一个序列化器 ⇒ 可比；⛔ 不判"等价"）`);
  process.exit(0);
}

for (const m of mods) {
  const oldPath = path.join(base.oldDir, m);
  const newPath = path.join(newRoot, m);
  let o;
  let n;
  let loadErr = null;
  try {
    o = req(oldPath);
  } catch (e) {
    loadErr = `旧侧加载失败：${e instanceof Error ? e.message : String(e)}`;
  }
  try {
    n = req(newPath);
  } catch (e) {
    loadErr = (loadErr ? loadErr + ' ｜ ' : '') + `新侧加载失败：${e instanceof Error ? e.message : String(e)}`;
  }
  console.log(`── ${m}`);
  if (loadErr) {
    console.log(`   ❌ ${loadErr}`);
    if (base.touchedSet.has(m)) {
      console.log(
        '   ⚠️ **基线含中途改动**（该文件的"改名前"那版已被迁移中途的批次碰过）⇒ 这里的加载失败**很可能是假差异**：\n' +
          '      旧侧拿到的是一份"中途快照"（例：bridge 那时已按 `.adapter` 取，而同期的 providers 还是 `module.exports = adapter`）⇒ 本行**只能人读**',
      );
    }
    problems.push(`${m}：两侧无法机械对照（加载失败）⇒ 人读`);
    console.log('');
    continue;
  }
  const face = FACE[m] || FACE[m.replace(/\.js$/, '')];
  const fo = face ? face.old(o) : o;
  const fn = face ? face.new(n) : n;
  if (face) console.log(`   语义面：${face.why}（旧＝模块本体 / 新＝.adapter）`);
  const ko = Object.keys(fo || {}).sort();
  const kn = Object.keys(fn || {}).sort();
  const miss = ko.filter((k) => !kn.includes(k));
  const extra = kn.filter((k) => !ko.includes(k));
  console.log(
    `   导出面：旧 ${ko.length} ｜ 新 ${kn.length} ${miss.length || extra.length ? `❌ 缺 ${miss.join(',') || '-'} ｜ 多 ${extra.join(',') || '-'}` : '✅ 名字集合相等'}`,
  );
  if (miss.length || extra.length) problems.push(`${m}：导出面不一致`);
  if (base.touchedSet.has(m)) {
    console.log(
      '   ⚠️ **基线含中途改动**：该文件的"改名前"那版已被迁移中途的批次碰过 ⇒ 本行的"异"可能是**假差异**，必须人读（见 日志.md 的批次记录）',
    );
    problems.push(`${m}：基线含中途改动 ⇒ 差异需人读（可能是假差异）`);
  }
  // 语义面替换后，下面常量/函数一律在 **语义面** 上比
  o = fo;
  n = fn;

  if (listOnly) {
    console.log(
      `   导出：${kn
        .map((k) => `${k}:${typeof n[k]}${typeof n[k] === 'function' ? `/${n[k].length}参` : ''}`)
        .join(' · ')}`,
    );
    console.log('');
    continue;
  }

  // 常量/非函数导出：直接深比
  for (const k of kn) {
    if (typeof n[k] === 'function') continue;
    const a = JSON.stringify(normalize(o[k]));
    const b = JSON.stringify(normalize(n[k]));
    casesRun++;
    if (a === b) {
      casesSame++;
      console.log(`   常量 ${k}：✅ 相同`);
    } else {
      casesDiff++;
      problems.push(`${m}：常量 ${k} 不同`);
      console.log(`   常量 ${k}：❌ 不同\n      旧：${a.slice(0, 220)}\n      新：${b.slice(0, 220)}`);
    }
  }
  // 函数：有样本就逐例跑，没有就显式列"无样本"
  const fns = kn.filter((k) => typeof n[k] === 'function');
  const rawCases = CASES[m] || CASES[m.replace(/\.js$/, '')] || [];
  const cases = (Array.isArray(rawCases) ? rawCases : PROVIDER_CASES).filter((c) => typeof n[c.fn] === 'function');
  const covered = new Set(cases.map((c) => c.fn));
  for (const k of fns) if (!covered.has(k)) noSample++;
  for (const c of cases) {
    const runOne = (mod, api) => {
      try {
        return { ok: true, v: normalize(api[c.fn](...c.args)) };
      } catch (e) {
        return { ok: false, v: { t: 'throw', name: e?.name, message: String(e?.message ?? e) } };
      }
    };
    // ⏱ 需要冻结时钟的模块：两侧拿到**同一个** `Date.now()`（否则 time 相关函数必然"异"，那是假差异）
    let a;
    let b;
    if (FREEZE.has(m) || FREEZE.has(m.replace(/\.js$/, ''))) {
      const realNow = Date.now;
      try {
        Date.now = () => 1750000000000;
        a = runOne(o, o);
        b = runOne(n, n);
      } finally {
        Date.now = realNow;
      }
    } else {
      a = runOne(o, o);
      b = runOne(n, n);
    }
    const same = JSON.stringify(a) === JSON.stringify(b);
    casesRun++;
    if (same) casesSame++;
    else {
      casesDiff++;
      problems.push(`${m}：${c.fn}(${c.args.length} 参) 输出不同`);
    }
    // ⚠️ `JSON.stringify` 会把 `undefined` 印成 `null` ⇒ 显式标出来（免看错探针）
    const argBrief = JSON.stringify(c.args, (_k, v) => (v === undefined ? '<undefined>' : v)).slice(0, 80);
    console.log(`   ${same ? '✅' : '❌'} ${c.fn}(${argBrief})`);
    if (!same) {
      console.log(`      旧：${a.ok ? '' : '【抛】'}${JSON.stringify(a.v).slice(0, 240)}`);
      console.log(`      新：${b.ok ? '' : '【抛】'}${JSON.stringify(b.v).slice(0, 240)}`);
    }
  }
  if (fns.length) {
    console.log(
      `   函数：${fns.length} 个 ｜ 有样本 ${covered.size} 个${covered.size < fns.length ? ` ｜ ⚠️ **无样本 ${fns.length - covered.size} 个**（未验，不是"验过没问题"）` : ''}`,
    );
  }
  console.log('');
}

console.log(`════════ 汇总 ════════`);
console.log(`模块 ${mods.length} ｜ 逐例对照 ${casesRun} 例（同 ${casesSame} · 异 ${casesDiff}）｜ ⚠️ 无样本的函数 ${noSample} 个`);
if (problems.length) {
  console.log(`⚠️ 需人看的项（${problems.length}）：`);
  for (const p of problems) console.log('   · ' + p);
} else {
  console.log('✅ 本次对照范围内没有"异"项（⛔ 但"无样本"的那些仍然是未验）');
}
console.log(`（耗时 ${Date.now() - t0} ms · 旧侧＝各文件改名前版本 · 新侧＝electron/dist 产物）`);
