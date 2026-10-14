// ============================================================
// 真实 Google Chrome 启动器（Lovart 专用 · 零 CDP / 零自动化标记）
// ------------------------------------------------------------
// 背景：Lovart 的设备信任 SDK 会识别 Electron 内嵌 <webview>
// （即便指纹全清、引擎升到最新、甚至真实 Chrome + 新账号完全正常，
//  内嵌 webview + 新账号仍被拦）。根因在 TLS ClientHello / HTTP2
//  SETTINGS / QUIC 指纹 —— 引擎二进制写死，JS 与版本号都改不了。
//
// 本模块的做法（已逆向「Ai大模型多开器」确认的唯一可靠路径）：
//   让 Lovart 跑在「用户本机真实 Google Chrome」里，启动参数做到
//   —— 每账号固定独立 user-data-dir（登录态持久化）
//   —— 每账号独立出口代理 IP
//   —— 零注入 / 零 UA 改写 / 零调试端口 / 零自动化标记
//   这样 Lovart 视其为合法浏览器，不再报「账号异常」，且登录态长期保留。
//
// 与采集的关系（职责分离）：
//   真实 Chrome 在这里 ONLY 用于「人工登录」——人要在它里面过 Turnstile /
//   验证码。登录完成后，再由本模块的 dumpCookies() 在同 profile 上起一个
//   **临时 headless Chrome（带调试端口，但绝不访问 Lovart）** 把会话 cookie
//   明文导出，主进程把这些 cookie 注入内嵌 webview 的 persist 分区。
//   之后所有「自动采集图片」都走内嵌 webview（它此时已带合法会话），
//   完全不依赖真实 Chrome 的调试端口 —— 因此登录阶段永不暴露任何 CDP 标记。
//
// 为什么登录用「零调试端口」、导出才临时开端口：
//   调试端口会让 navigator.webdriver=true，这是 Cloudflare Turnstile 头号判据。
//   所以登录态的可见 Chrome 绝对不能带 --remote-debugging-port。
//   而 cookie 导出是登录完成后的「离线」动作，临时 headless 既不访问 Lovart、
//   也不参与人机验证，开端口无任何风控风险，用完即关。
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { app, session } = require('electron');
const WebSocket = require('ws');
const { handle } = require('./ipc');

// ---------- 路径 / 进程探测 ----------

function systemChromePath() {
  if (process.platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return fs.existsSync(p) ? p : null;
  }
  if (process.platform === 'win32') {
    const local = process.env['LOCALAPPDATA'] || '';
    const p = path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe');
    return fs.existsSync(p) ? p : null;
  }
  try {
    const out = require('child_process')
      .execSync('command -v google-chrome google-chrome-stable chromium chromium-browser 2>/dev/null', { encoding: 'utf8' })
      .trim()
      .split('\n')[0];
    return out || null;
  } catch {
    return null;
  }
}

function profilesRoot() {
  return path.join(app.getPath('userData'), 'chrome-profiles');
}

// 每账号一个固定 profile 目录：cookies / storage / cache 各自一份，互不串号，
// 且因为是稳定路径，登录态跨应用重启长期保留（这是「登录态记不住」的根治点）。
function profileDirFor(accountId) {
  return path.join(profilesRoot(), String(accountId).replace(/[^a-zA-Z0-9_.-]/g, '_'));
}

// ---------- 小工具 ----------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGetJSON(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('http timeout')); });
  });
}

function readDevToolsPort(dir) {
  const f = path.join(dir, 'DevToolsActivePort');
  if (!fs.existsSync(f)) return null;
  try {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    const port = parseInt(lines[0], 10);
    return isNaN(port) ? null : port;
  } catch {
    return null;
  }
}

// 清掉上次运行残留的锁文件 / 调试端口文件，避免 Chrome 误判「已有实例」。
// 注意：只删锁文件，绝不碰 Cookies / Local State 等登录态数据。
function clearStaleLock(dir) {
  for (const f of ['DevToolsActivePort', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try { fs.rmSync(path.join(dir, f), { force: true }); } catch { /* 清理临时文件失败可忽略（下次启动会重建） */ }
  }
}

// 启动参数签名：改动 spawn 参数时必须同步升版本号。
// 作用：残留的旧实例若用了不同参数，就不复用、直接杀掉按新参数重启。
// v4：彻底移除所有自动化标记（--remote-debugging-port / --disable-blink-features
//     / --remote-allow-origins 全部删除），仅保留「真实 Chrome 应有的正常能力」。
const LAUNCH_SIG = 'launch-2026-09-22-v4'; // v4: 零 CDP / 零自动化标记

// 杀掉「同一 user-data-dir」下正在运行的 Chrome（只影响本应用为某账号拉起的实例：
// 命令行里带 --user-data-dir=<我们的 profile 目录>，不会误伤用户自己的 Chrome）。
function killChromeForProfile(dir) {
  try {
    require('child_process').execFileSync('pkill', ['-f', `--user-data-dir=${dir}`], { stdio: 'ignore' });
  } catch { /* 没有匹配进程时 pkill 返回非 0，属正常 */ }
}

// ---------- 环境净化 ----------

// 剥离会从 Electron 父进程泄漏到 Chrome 子进程、导致其 sandbox / GPU 初始化失败的变量。
const BLOCKED_ENV_KEYS = [
  'XPC_SERVICE_NAME', 'XPC_FLAGS', 'LAUNCH_INSTANCE_ID', 'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ASAR', 'ELECTRON_ENABLE_LOGGING', 'ELECTRON_ENABLE_STACK_DUMPING',
  'ATOM_SHELL_INTERNAL_RUN_AS_NODE', 'APP_NAME', 'APP_PATH', 'APP_DATA_PATH'
];
function sanitizeEnv(src) {
  const out = {};
  for (const k of Object.keys(src || {})) {
    if (BLOCKED_ENV_KEYS.includes(k)) continue;
    if (k.startsWith('__XPC_')) continue; // launchd 注入的 bootstrap 端口，会干扰 Chrome 子进程
    out[k] = src[k];
  }
  return out;
}

// ============================================================
// 登录用：可见真实 Chrome（零自动化标记）
// ============================================================

const sessions = new Map(); // accountId -> { child, dir }

/**
 * 为某账号拉起「本机真实 Google Chrome」用于登录 Lovart。
 * 关键：不传任何自动化 / 调试标记，仅带 --user-data-dir（固定 profile）与可选 --proxy-server。
 * @param {string} accountId
 * @param {string} [url] 初始打开的网址（通常是 Lovart 登录页）
 * @param {{proxy?:string}} [opts] proxy 形如 "http://ip:port"，空则直连
 */
/**
 * ★ 同账号「正在拉起」的在飞 promise（accountId → promise）
 *
 * 为什么必须有：`sessions` 直到 `spawn` 之后才 `set` —— 快速重复调用会让**两次都走到 spawn**
 * （`sessions.get` 都为空）⇒ 并发拉起多个 Chrome 抢同一 profile（`SingletonLock` 互斥、登录态错乱）。
 * 锁的作用域 = 本模块；`finally` 保证无论成功/失败都释放。
 */
const pendingEnsure = new Map();

/**
 * 为某账号拉起「本机真实 Google Chrome」用于登录 Lovart。**带并发锁**（见 `pendingEnsure`）。
 */
async function ensureLovartChrome(accountId, url, opts = {}) {
  if (!accountId) return { ok: false, error: 'no-account' };
  const existing = sessions.get(accountId);
  if (existing && existing.child && !existing.child.killed) {
    // 已开着的登录窗口：**不重复拉起**（直接返回 alreadyOpen）
    return { ok: true, alreadyOpen: true };
  }
  const inflight = pendingEnsure.get(accountId);
  if (inflight) return inflight;
  const run = doEnsureLovartChrome(accountId, url, opts).finally(() => pendingEnsure.delete(accountId));
  pendingEnsure.set(accountId, run);
  return run;
}

async function doEnsureLovartChrome(accountId, url, opts = {}) {
  const exe = systemChromePath();
  if (!exe) {
    return { ok: false, error: 'no-chrome', message: '未找到本机 Google Chrome，请先安装后再使用 Lovart。' };
  }

  const dir = profileDirFor(accountId);
  fs.mkdirSync(dir, { recursive: true });

  // 若同 profile 有残留进程（可能是上次没关干净的 headless 导出实例），
  // 先清掉再开，避免 SingletonLock 互斥导致新实例读不到已有登录态。
  killChromeForProfile(dir);
  await sleep(400);
  clearStaleLock(dir);

  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    // 仅用于规避从 Electron 父进程继承的受限 Mach bootstrap 造成的
    // "sandbox initialization failed" 噪音；不改变任何 JS 侧可探测指纹。
    '--no-sandbox',
    `--user-data-dir=${dir}`
  ];
  if (opts && opts.proxy) args.push(`--proxy-server=${opts.proxy}`);
  if (url) args.push(url);

  const env = sanitizeEnv(process.env);

  let child;
  try {
    child = spawn(exe, args, { detached: true, stdio: ['ignore', 'ignore', 'ignore'], env });
  } catch (e) {
    return { ok: false, error: 'spawn-failed', message: (e && e.message) || '启动 Chrome 失败' };
  }
  child.unref();

  // 记录本次启动参数签名，供下次判断残留实例是否可安全复用
  try { fs.writeFileSync(path.join(dir, '.lovart-launch-sig'), LAUNCH_SIG); } catch { /* 标记文件写入失败可忽略（下次落盘重写） */ }

  sessions.set(accountId, { child, dir });
  const onExit = () => { sessions.delete(accountId); };
  child.on('exit', onExit);
  child.on('error', onExit);

  return { ok: true, profileDir: dir };
}

async function closeLovartChrome(accountId) {
  const entry = sessions.get(accountId);
  sessions.delete(accountId);
  if (!entry) return { ok: true, wasOpen: false };
  try {
    if (entry.child && !entry.child.killed) entry.child.kill('SIGTERM');
  } catch { /* 杀进程幂等（可能已退出） */ }
  // 兜底：确保该 profile 下没有遗留进程
  try { killChromeForProfile(entry.dir); } catch { /* 残留进程清理是 best-effort（失败不影响返回值） */ }
  return { ok: true, wasOpen: true };
}

function getStatus() {
  const exe = systemChromePath();
  return { available: !!exe, path: exe, open: Array.from(sessions.keys()) };
}

// ============================================================
// Cookie 导出：同 profile 临时 headless Chrome（带端口，但绝不访问 Lovart）
// ============================================================

// 极简 CDP 客户端：仅用于 Network.getAllCookies（导出明文 cookie）。
function cdpRequest(ws, idRef, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = idRef.n++;
    const onMsg = (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.id === id) {
        ws.removeListener('message', onMsg);
        if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
        else resolve(msg.result);
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/**
 * 导出某账号在真实 Chrome 里登录 Lovart 后产生的 cookie（明文）。
 * 实现：先确保同 profile 上没有别的 Chrome 在跑（否则 SingletonLock 互斥），
 * 再起一个临时 headless Chrome（带 --remote-debugging-port，仅用于读取，不访问任何网站），
 * 通过 CDP Network.getAllCookies 取回全部 cookie，立即关闭该临时实例。
 * @param {string} accountId
 * @returns {Promise<{ok:boolean, cookies?:Array, error?:string, message?:string}>}
 */
async function dumpCookies(accountId) {
  if (!accountId) return { ok: false, error: 'no-account' };
  const dir = profileDirFor(accountId);
  if (!fs.existsSync(dir)) {
    return { ok: false, error: 'no-profile', message: '该账号尚未用真实 Chrome 登录过 Lovart。' };
  }

  // 关掉同 profile 上可能仍开着的登录窗口 / 残留实例，释放 SingletonLock
  killChromeForProfile(dir);
  await sleep(600);
  clearStaleLock(dir);

  const exe = systemChromePath();
  if (!exe) return { ok: false, error: 'no-chrome', message: '未找到本机 Google Chrome。' };

  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${dir}`,
    // 必须带一个本地空页：Network.* 是「页面级」CDP 域命令，只有存在 page target
    // 才能连页面端点执行（浏览器级端点会报 "'Network.enable' wasn't found"）。
    // about:blank 不发起任何网络请求，不违反「绝不访问 Lovart」。
    'about:blank'
  ];
  const env = sanitizeEnv(process.env);

  let child;
  try {
    child = spawn(exe, args, { detached: true, stdio: ['ignore', 'ignore', 'ignore'], env });
  } catch (e) {
    return { ok: false, error: 'spawn-failed', message: (e && e.message) || '启动临时 Chrome 失败' };
  }
  child.unref();

  // 轮询 DevToolsActivePort，最多 ~15s
  let port = null;
  for (let i = 0; i < 60; i++) {
    port = readDevToolsPort(dir);
    if (port) break;
    await sleep(250);
  }
  if (!port) {
    try { child.kill('SIGTERM'); } catch { /* 杀进程幂等（可能已退出） */ }
    return { ok: false, error: 'chrome-no-port', message: '临时 Chrome 未暴露调试端口。' };
  }

  // 轮询 /json/list，拿到 page target 的 ws 端点（Network.* 只能在页面级会话上执行）
  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await httpGetJSON(`http://127.0.0.1:${port}/json/list`, 4000);
      const page = Array.isArray(list) && list.find((t) => t && t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch { /* Chrome 还没起好，继续等 */ }
    await sleep(250);
  }
  if (!wsUrl) {
    try { child.kill('SIGTERM'); } catch { /* 杀进程幂等（可能已退出） */ }
    try { killChromeForProfile(dir); } catch { /* 残留进程清理是 best-effort（失败不影响返回值） */ }
    return { ok: false, error: 'chrome-no-page', message: '临时 Chrome 未提供页面调试端点。' };
  }

  let cleanup = () => {};
  try {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    cleanup = () => { try { ws.close(); } catch { /* 关闭 CDP 连接幂等（可能已断） */ } };

    const idRef = { n: 1 };
    await cdpRequest(ws, idRef, 'Network.enable');
    const r = await cdpRequest(ws, idRef, 'Network.getAllCookies');
    const cookies = (r && r.cookies) || [];

    try { ws.close(); } catch { /* 关闭 CDP 连接幂等（可能已断） */ }
    try { if (!child.killed) child.kill('SIGTERM'); } catch { /* 杀进程幂等（可能已退出） */ }
    try { killChromeForProfile(dir); } catch { /* 残留进程清理是 best-effort（失败不影响返回值） */ }
    return { ok: true, cookies };
  } catch (e) {
    try { cleanup(); } catch { /* cleanup 已幂等，重复调用可忽略 */ }
    try { if (!child.killed) child.kill('SIGTERM'); } catch { /* 杀进程幂等（可能已退出） */ }
    try { killChromeForProfile(dir); } catch { /* 残留进程清理是 best-effort（失败不影响返回值） */ }
    return { ok: false, error: 'dump-failed', message: (e && e.message) || '读取 cookie 失败' };
  }
}

// ───────────────────── IPC 自注册（本域） ─────────────────────
// 六个 handler 说的都是「Lovart 的真实 Chrome 登录会话」这一件事 ⇒ 住本文件（TD-13-24）。
/**
 * ★ **域唯一门面**：宿主壳只说「初始化 Lovart 真实 Chrome 域」。
 * ⚠️ 宿主壳不再需要域内任何别的名字 —— 起窗 / 关窗 / 导 cookie / 会话同步全在本文件。
 */
function initChromeCdp() {
  handle('ensure-lovart-chrome', async (_e, { accountId, url, proxy } = {}) => {
    if (!accountId) return { ok: false, error: '缺少 accountId' };
    return await ensureLovartChrome(accountId, url, { proxy });
  });

  // 仅打开真实 Chrome（不强制导航到某个 URL）：先 ensure，若已打开则保持当前页。
  handle('open-lovart-chrome', async (_e, { accountId, url, proxy } = {}) => {
    if (!accountId) return { ok: false, error: '缺少 accountId' };
    const r = await ensureLovartChrome(accountId, url || null, { proxy });
    return r && r.ok ? r : { ok: false, error: (r && r.error) || '打开真实 Chrome 失败' };
  });

  handle('close-lovart-chrome', async (_e, { accountId } = {}) => {
    if (!accountId) return { ok: false, error: '缺少 accountId' };
    return await closeLovartChrome(accountId);
  });

  // 把真实 Chrome 里登录 Lovart 后的会话 cookie 同步进内嵌 webview 分区，
  // 使 webview 带上合法会话、继续承担「自动采集图片」的职责（零 CDP 暴露）。
  //
  // ⚠️ Cloudflare 安全 cookie（cf_clearance / __cf_bm 等）与「访问者的引擎指纹」绑定
  // （TLS ClientHello / HTTP2 指纹）。真实 Chrome 导出的这类 cookie 注入 Electron
  // webview 后指纹对不上，Cloudflare 会直接给硬 403（"request has been blocked …
  // potential threats"，WAF 拦截页）——比不给 cookie 更糟。因此同步时必须剔除，
  // 让 webview 自己过 Cloudflare 的透明质询、拿到属于自己的 CF cookie。
  handle('sync-lovart-session', async (_e, { accountId, partition } = {}) => {
    if (!accountId || !partition) return { ok: false, error: '缺少参数（accountId / partition）' };
    // 1) 关闭登录窗口，释放 SingletonLock，使同 profile 可被临时 headless 读取
    await closeLovartChrome(accountId);
    await new Promise((r) => setTimeout(r, 600));
    // 2) 导出明文 cookie（临时 headless，绝不访问 Lovart）
    const dump = await dumpCookies(accountId);
    if (!dump || !dump.ok) {
      return { ok: false, error: (dump && dump.error) || 'cookie 导出失败', message: (dump && dump.message) || '' };
    }
    // 3) 注入内嵌 webview 的 persist 分区（该 profile 专用于本 Lovart 账号，cookie 即其会话）
    const ses = session.fromPartition(partition);
    // 3a) 先清空分区里的旧 cookie：尤其要清掉上次注入的、与 webview 指纹失配的
    //     Cloudflare cookie——否则一重新导航就会被 WAF 403（2026-09-22 实测）。
    try {
      const olds = await ses.cookies.get({});
      for (const c of olds) {
        try {
          const host = (c.domain || '').replace(/^\./, '');
          const url = `http${c.secure ? 's' : ''}://${host}${c.path || '/'}`;
          await ses.cookies.remove(url, c.name);
        } catch { /* 个别删除失败不影响整体 */ }
      }
    } catch { /* 清旧 cookie 是 best-effort（失败仍继续注入新 cookie） */ }
    // 3b) 剔除 Cloudflare 指纹绑定 cookie 后再注入（登录态本身不含 CF cookie，不受影响）
    const CF_COOKIE_RE = /^(cf_clearance|__cf_bm|__cfruid|__cfhostmanager|__cf_cookies|__cfwait|__cfserverzone|cf_chl_[a-z0-9_]+|__cf_chl_[a-z0-9_]+|__cf_chl_[a-z0-9_]+_rc)$/i;
    const cookies = (dump.cookies || []).filter((c) => c && c.name && !CF_COOKIE_RE.test(c.name));
    const sameSiteMap = { None: 'no_restriction', Lax: 'lax', Strict: 'strict' };
    let count = 0;
    for (const c of cookies) {
      try {
        const secure = !!c.secure;
        const host = (c.domain || '').replace(/^\./, '');
        const url = `http${secure ? 's' : ''}://${host}${c.path || '/'}`;
        const exp = (typeof c.expires === 'number' && c.expires > 0) ? c.expires : undefined;
        await ses.cookies.set({
          url,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure,
          httpOnly: !!c.httpOnly,
          expirationDate: exp,
          sameSite: sameSiteMap[c.sameSite] || 'unspecified'
        });
        count++;
      } catch (e) { /* 个别 cookie 写入失败不影响整体 */ }
    }
    return { ok: true, count, total: cookies.length, rawTotal: (dump.cookies || []).length };
  });

  // 故意恒返 false：采集统一走内嵌 webview（会话同步后已登录），不走真实 Chrome。
  // 真实 Chrome 仅用于人工登录 + cookie 源；其开关状态请走 get-lovart-chrome-status。
  handle('lovart-chrome-is-open', async (_e, accountId) => {
    return { ok: true, open: false };
  });

  handle('get-lovart-chrome-status', async () => {
    return { ok: true, ...getStatus() };
  });
}

// 导出面 = **宿主可用面**：只有 `initChromeCdp` 出本文件（其余函数都是本文件内部实现）
module.exports = { initChromeCdp };
