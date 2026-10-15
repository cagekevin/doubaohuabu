// ============================================================
// 内置 Firefox 启动器（Lovart 专用）
// ------------------------------------------------------------
// 思路：Lovart 的「多账号异常」是 Electron（Chromium）内嵌视图被风控识别所致；
// 而用户在本机 Firefox + Multi-Account Containers 插件下完全正常。
// 因此把 Lovart 改为：每个账号一个独立的 Firefox profile（位于应用 userData 下），
// 该 profile 预装多账号容器插件，点击账号即在独立 Firefox 中打开 Lovart。
// 这等价于「每个账号 = 一台独立 Firefox + 容器插件」，与用户在火狐里的用法一致。
//
// 隔离边界：
//  · 每个账号 profile 完全独立（cookies / storage / cache / 扩展各自一份）
//  · 多账号容器插件额外提供「一个 Firefox 内多身份」能力（用户可继续新建容器）
//  · 不改动任何指纹（保持 Firefox 原生），不接代理（与用户火狐体验一致）
// ============================================================

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { app } = require('electron');
const { handle } = require('./ipc');

function shellEscape(arg) {
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(arg)) return arg;
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

// 内置 Firefox（打包后位于 resources/firefox）
// ⚠️ 开发态基准 = app 根：本文件住 `electron/`（源码）或 `electron/dist/`（产物）⇒ 一律上两级（同 D-4）
function bundledFirefoxPath() {
  const base = process.resourcesPath || path.join(__dirname, '..', '..');
  const candidates = [
    path.join(base, 'firefox', 'Firefox.app', 'Contents', 'MacOS', 'firefox'), // macOS
    path.join(base, 'firefox', 'firefox.exe'), // Windows
    path.join(base, 'firefox', 'firefox') // Linux
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function systemFirefoxPath() {
  if (process.platform === 'darwin') {
    const p = '/Applications/Firefox.app/Contents/MacOS/firefox';
    return fs.existsSync(p) ? p : null;
  }
  try {
    const out = execSync('command -v firefox 2>/dev/null || command -v firefox-esr 2>/dev/null', { encoding: 'utf8' }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function getFirefoxExecutable() {
  return bundledFirefoxPath() || systemFirefoxPath();
}

// 预装的 MAC 插件 XPI（打包后位于 resources/firefox-addons）
function addonAssetPath() {
  const base = process.resourcesPath || path.join(__dirname, '..', '..');
  const p = path.join(base, 'firefox-addons', 'multi-account-containers.xpi');
  return fs.existsSync(p) ? p : null;
}

// 读取 XPI（zip）内 manifest.json 的 addon id，用于正确命名到 extensions/<id>.xpi
function readAddonId(xpiPath) {
  try {
    const raw = execSync(`unzip -p "${xpiPath}" manifest.json`, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const manifest = JSON.parse(raw);
    const gecko = manifest.browser_specific_settings?.gecko || manifest.applications?.gecko;
    return gecko?.id || null;
  } catch {
    return null;
  }
}

function profilesRoot() {
  return path.join(app.getPath('userData'), 'firefox-profiles');
}

function profileDirFor(accountId) {
  const safe = String(accountId).replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(profilesRoot(), safe);
}

// 确保账号的独立 Firefox profile 已创建，并预装多账号容器插件
function ensureProfile(accountId) {
  const dir = profileDirFor(accountId);
  fs.mkdirSync(path.join(dir, 'extensions'), { recursive: true });

  const addon = addonAssetPath();
  if (addon) {
    const id = readAddonId(addon) || 'multi-account-containers@jetpack';
    const dest = path.join(dir, 'extensions', `${id}.xpi`);
    fs.copyFileSync(addon, dest);
  }

  // user.js：保持 Firefox 原生，仅关闭首次运行噪音与遥测；
  // 关键：extensions.autoDisableScopes=0 让 sideload 的 XPI 自动启用，无需手动 about:addons
  const userJs = path.join(dir, 'user.js');
  const prefs = [
    'user_pref("extensions.autoDisableScopes", 0);',
    'user_pref("extensions.autoDisableScanners", false);',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("toolkit.telemetry.unified", false);',
    'user_pref("datareporting.healthreport.uploadEnabled", false);',
    'user_pref("app.shield.optoutstudies.enabled", false);',
    'user_pref("trailhead.firstrun.pin", false);',
    'user_pref("browser.uitour.enabled", false);',
    'user_pref("extensions.legacy.enabled", false);'
  ].join('\n') + '\n';
  fs.writeFileSync(userJs, prefs);

  return dir;
}

function launch(accountId, url) {
  const exe = getFirefoxExecutable();
  if (!exe) return { ok: false, error: 'no-firefox' };
  if (!fs.existsSync(exe)) return { ok: false, error: `firefox 不存在: ${exe}` };
  const dir = ensureProfile(accountId); // 确保 profile 存在

  const appBundle = exe.replace(/\/Contents\/MacOS\/firefox$/, '');
  const isMacAppBundle = process.platform === 'darwin' && appBundle.endsWith('.app');

  // macOS：去掉内置 Firefox.app 的 Gatekeeper 隔离属性，否则系统会弹「无法打开」并拦截
  if (isMacAppBundle) {
    try {
      execSync(`xattr -dr com.apple.quarantine "${appBundle}"`, { stdio: 'ignore' });
    } catch { /* 已无隔离属性，忽略 */ }
  }

  const commonArgs = ['--no-remote', '--profile', dir];
  if (url) commonArgs.push(url);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (res) => { if (!settled) { settled = true; resolve(res); } };

    // macOS 优先使用 open -n -a <bundle> --args ... 启动 .app，绕过直接执行二进制可能遇到的签名/库校验问题
    if (isMacAppBundle) {
      const openArgs = ['-n', '-a', appBundle, '--args', ...commonArgs];
      const command = ['open', ...openArgs].map(shellEscape).join(' ');
      const child = spawn('open', openArgs, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      if (child.stderr) child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => settle({ ok: false, error: `open 启动失败: ${err && err.message || err}`, command }));
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          settle({ ok: false, error: `open 退出 (code ${code})：${stderr.trim() || '无错误输出'}`, command });
        } else {
          settle({ ok: true, executable: appBundle, profile: dir, args: openArgs, command });
        }
      });
      setTimeout(() => {
        child.unref();
        settle({ ok: true, executable: appBundle, profile: dir, args: openArgs, command });
      }, 500);
      return;
    }

    // 非 macOS / 非 .app 情况：直接执行二进制
    const command = [exe, ...commonArgs].map(shellEscape).join(' ');
    const child = spawn(exe, commonArgs, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => settle({ ok: false, error: `启动失败: ${err && err.message || err}`, command }));
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        settle({ ok: false, error: `Firefox 进程退出 (code ${code})：${stderr.trim() || '无错误输出'}`, command });
      } else {
        settle({ ok: true, executable: exe, profile: dir, args: commonArgs, command });
      }
    });
    setTimeout(() => {
      child.unref();
      settle({ ok: true, executable: exe, profile: dir, args: commonArgs, command });
    }, 500);
  });
}

function removeProfile(accountId) {
  const dir = profileDirFor(accountId);
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true };
}

function getStatus() {
  const exe = getFirefoxExecutable();
  return {
    available: !!exe,
    bundled: !!bundledFirefoxPath(),
    path: exe,
    addonInstalled: !!addonAssetPath()
  };
}

// ───────────────────── IPC 自注册（本域） ─────────────────────
// 四个 handler 说的都是「Lovart 的内置 Firefox」这一件事 ⇒ 住本文件（TD-13-24）。
/**
 * ★ **域唯一门面**：宿主壳只说「初始化 Lovart 内置 Firefox 域」。
 * ⚠️ 宿主壳不再需要域内任何别的名字 —— 路径解析 / profile 落点 / 启动命令全在本文件。
 */
function initFirefox() {
  handle('ensure-lovart-firefox-profile', async (_e, { accountId } = {}) => {
    if (!accountId) return { ok: false, error: '缺少 accountId' };
    ensureProfile(accountId);
    return { ok: true };
  });

  handle('open-lovart-firefox', async (_e, { accountId, url } = {}) => {
    if (!accountId) return { ok: false, error: '缺少 accountId' };
    const res = await launch(accountId, url);
    if (!res.ok) {
      console.error('[lovart-firefox] 启动失败 | accountId:', accountId, '| error:', res.error, '| command:', res.command);
      return res;
    }
    console.log('[lovart-firefox] 已启动 | accountId:', accountId, '| profile:', res.profile, '| command:', res.command);
    return res;
  });

  handle('remove-lovart-firefox-profile', async (_e, { accountId } = {}) => {
    if (!accountId) return { ok: false, error: '缺少 accountId' };
    removeProfile(accountId);
    return { ok: true };
  });

  handle('get-firefox-status', async () => getStatus());
}

// 导出面 = **宿主可用面**：只有 `initFirefox` 出本文件（其余函数都是本文件内部实现）
module.exports = { initFirefox };
