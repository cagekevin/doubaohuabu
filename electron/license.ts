// ============================================================
// 授权模块（主进程）
// ------------------------------------------------------------
// 设计要点：
//   1. 机器码：采集稳定的硬件标识，加盐哈希后格式化，离线生成、可复现。
//   2. 激活码：开发者用「私钥」对 {machineCode, exp, v} 签名，
//      客户端仅内置「公钥」验证 —— 私钥永不进入客户端二进制，无法伪造。
//   3. 持久化：激活状态写入 userData/license.dat，并用独立 HMAC 密钥
//      签名防止篡改（改到期时间 / 改机器码都会被检出）。
//   4. 离线验证：全部为本地密码学运算，无需联网。
//
// ★ 时间防篡改（本次新增）：
//   问题：仅用本地 Date.now() 判断有效期时，用户把系统时间往回拨即可
//        让已过期的授权“复活”，从而绕过激活。
//   对策：
//     a) 可信时间源：优先读取多个 HTTPS 站点的 Date 响应头（TLS 保证不可伪造）
//        作为权威“当前时间”，有效期判定以它为准，而非本地时钟。
//     b) 单调时钟锚点：进程内用 process.hrtime（不受系统时间修改影响）建立
//        “锚点”，即使断网也能按真实流逝时间推进有效期，运行中回拨无效。
//     c) 持久化时间基线：timeanchor.dat（HMAC 防篡改）记录最近一次可信时间；
//        启动时若本地时钟落后于该基线（说明被回拨）且处于离线，则判定篡改。
//     d) 篡改处置：检测到时间回拨/异常跳变 → 返回 status:'tampered'，
//        拒绝激活与验证，并由界面触发告警。
// ============================================================
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { app, type App } from 'electron';
import { handle } from './ipc';
import { asRecord } from './api/shape';

// ---- 内置常量（公钥 / salt / HMAC 密钥）----
// 公钥仅用于「验证」激活码；配对的私钥**不在客户端**，离线保存在仓库外
// `豆包画布/签发工具/`（与该目录的 `issue-code.cjs` 一起用）。
// ⚠️ 换私钥必须同步改本行并**重新打包分发** —— 旧包的公钥验不过新码。
const PUBLIC_KEY_SPKI = 'MCowBQYDK2VwAyEAe8TRvOAbh6m4nkcgXFMo3/wzwONAc6p5gTeRRlrm/aE=';
const SALT = 'p0Z5zCsRnTlwpaKJjnnkkg==';
const HMAC_SECRET = 'i/UJRBkqWpwgUFGrcPGRvZ2Z8YI3K3RGzSl4ioPlUig=';
const LICENSE_VERSION = 1;

// ★ **2026-10-11 恢复验签（`TD-13-4`）**：此前的「[本地激活补丁] 跳过 Ed25519 签名 + 时间防篡改」
//   （`const LOCAL_MODE = true`）**已删除** —— 它让 `checkLicenseStatus` **恒返 `ok`**、
//   `activateWithCode` **任何码都成功** ⇒ 许可形同虚设。
//   ⚠️ 删除时**无任何存量激活码**（用户 2026-10-11 确认）⇒ **零迁移成本**。
//   ⚠️ `SALT` / `HMAC_SECRET` 是**客户端固有限制**（桌面端密钥必然可被提取），
//      `docs/05` §5.3 已如实登记为「硬编码（仅公钥可公开）」⇒ **不在本债范围内**。
// 时间容差：允许正常网络/时钟漂移（5 分钟）
const TIME_TOL_MS = 5 * 60 * 1000;

// 可信时间源：读取 HTTPS 响应的 Date 头（TLS 保证不可篡改）。
// 任一可达即返回权威时间，全部失败（离线）返回 null。
const TRUSTED_TIME_HOSTS = ['https://www.baidu.com', 'https://www.qq.com', 'https://www.apple.com', 'https://doubao.com'];

// 测试用时间覆盖（仅测试时通过 __setTrustedTimeOverride 注入）
let _timeOverride: number | null = null;

// 缓存的公钥对象（首次使用时构建）
let _pubKey: crypto.KeyObject | null = null;
function getPublicKey(): crypto.KeyObject {
  if (!_pubKey) {
    _pubKey = crypto.createPublicKey({
      key: Buffer.from(PUBLIC_KEY_SPKI, 'base64'),
      format: 'der',
      type: 'spki',
    });
  }
  return _pubKey;
}

// ---------- base64url 编解码 ----------
// ⚠️ 源里还有一个 `b64urlEncode`，但**全仓（含原版参考）只有定义、没有任何调用** ⇒
//    未转过来（保留会踩 lint 的未使用检查）。签发工具侧自带实现，故无消费者缺口。
function b64urlDecode(str: string): Buffer {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

// ============================================================
// 机器码采集（纯硬件标识，不含任何网络相关因子）
// ------------------------------------------------------------
// 设计原则：
//   - 主键：硬件序列号（IOPlatformSerialNumber / BIOS Serial）
//     → 终身不变，更换网络/内存/CPU 均不影响
//   - 辅键：硬件 UUID（IOPlatformUUID / motherboard UUID）
//     → 极稳定，仅主板更换时变化
//   - 兜底：CPU 型号 + 内存总量
//     → 升级内存/换 CPU 时可能变，但通过持久化锚定机制容忍
//   - 明确排除：hostname、MAC 地址、IP 等一切网络敏感标识
// ============================================================
/** 三档硬件标识（各自用 `|` 串接） */
interface StableId {
  primary: string;
  secondary: string;
  fallback: string;
}

function collectStableId(): StableId {
  const platform = os.platform();
  const primary: string[] = []; // 主键：硬件序列号（用于锚定匹配）
  const secondary: string[] = []; // 辅键：硬件 UUID
  const fallback: string[] = []; // 兜底：CPU/内存

  try {
    if (platform === 'darwin') {
      // ---- 主键：硬件序列号（Apple Silicon / Intel Mac 均有，终身不变）----
      try {
        const serialOut = execSync(
          "ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | grep -o '\"IOPlatformSerialNumber\" = \"[^\"]*\"'",
          { timeout: 3000 },
        )
          .toString()
          .trim();
        const sm = serialOut.match(/"IOPlatformSerialNumber" = "([^"]+)"/);
        if (sm && sm[1]) primary.push('serial:' + sm[1]);
      } catch {
        /* 主键采集失败，继续尝试辅键 */
      }

      // ---- 辅键：平台 UUID（固件级，极稳定）----
      try {
        const uuidOut = execSync(
          "ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | grep -o '\"IOPlatformUUID\" = \"[^\"]*\"'",
          { timeout: 3000 },
        )
          .toString()
          .trim();
        const um = uuidOut.match(/"IOPlatformUUID" = "([^"]+)"/);
        if (um && um[1]) secondary.push('uuid:' + um[1]);
      } catch {
        // ★ TD-13-17：**补上理由**（原先只写 `/* ignore */` —— 那不是理由）。
        //   辅键（平台 UUID）采集失败**只影响指纹的稳定性**（机器码由 primary/secondary 组合而成，
        //   少一档仍能出码），**不影响功能** ⇒ 刻意静默。与上方主键那处同口径。
      }
    } else if (platform === 'win32') {
      // ---- 主键：BIOS 序列号 ----
      try {
        const biosOut = execSync('wmic bios get serialnumber', { timeout: 3000 }).toString().trim();
        const bm = biosOut.match(/\b[A-Za-z0-9]{5,}\b/);
        if (bm && bm[0] && !/^[0-9]+$/.test(bm[0])) primary.push('serial:' + bm[0].toUpperCase());
      } catch {
        // ★ TD-13-17：Windows **主键**采集失败（wmic 不在 / 无权限）—— 只影响指纹稳定性
        //   （机器码由 primary/secondary/fallback 三档组合，少一档仍能出码），不影响功能。同上方主键口径。
      }

      // ---- 辅键：主板 UUID ----
      try {
        const uuidOut = execSync('wmic csproduct get uuid', { timeout: 3000 }).toString().trim();
        const um = uuidOut.match(/[0-9A-Fa-f]{8}-[0-9A-Fa-f-]{27}/);
        if (um) secondary.push('uuid:' + um[0].toUpperCase());
      } catch {
        // ★ TD-13-17：Windows **辅键**（主板 UUID）采集失败 —— 同主键口径：只影响指纹稳定性。
      }
    } else if (platform === 'linux') {
      // ---- 主键：machine-id（/etc/machine-id 或 /var/lib/dbus/machine-id）----
      try {
        for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
          const id = fs.readFileSync(p, 'utf-8').trim();
          if (id) {
            primary.push('mid:' + id);
            break;
          }
        }
      } catch {
        // ★ TD-13-17：Linux **主键**（machine-id）读取失败（文件不存在 / 无权限）—— 只影响指纹稳定性。
      }

      // ---- 辅键：DMI product_uuid ----
      try {
        const dmiOut = execSync('cat /sys/class/dmi/id/product_uuid 2>/dev/null || cat /etc/machine-id 2>/dev/null', {
          timeout: 3000,
        })
          .toString()
          .trim();
        if (dmiOut) secondary.push('uuid:' + dmiOut);
      } catch {
        // ★ TD-13-17：Linux **辅键**（DMI product_uuid）采集失败 —— 同主键口径。
      }
    }
  } catch (e) {
    console.warn('[license] 硬件标识采集异常:', e instanceof Error ? e.message : String(e));
  }

  // ---- 兜底：纯硬件特征（CPU 型号 + 内存总量）----
  // 注意：不包含 os.hostname()（DHCP/VPN 可动态修改主机名）
  // 不包含 MAC 地址（虚拟网卡随网络切换增删）
  try {
    const cpu = os.cpus()[0];
    fallback.push('cpu:' + ((cpu && cpu.model) || ''));
  } catch {
    // ★ TD-13-17：**兜底档**采集失败 —— 指纹仍可由 primary/secondary 组合，不影响功能。
  }
  fallback.push('mem:' + os.totalmem());

  return { primary: primary.join('|'), secondary: secondary.join('|'), fallback: fallback.join('|') };
}

// ============================================================
// 机器码持久化锚定（抗网络切换 / 硬件微变）
// ------------------------------------------------------------
// 原理：
//   首次启动时将「主硬件 ID + 机器码」写入 machine_id.dat。
//   后续启动时：
//     - 若主硬件 ID 未变 → 始终沿用首次机器码（即使内存/CPU 变了）
//     - 若主硬件 ID 变了 → 这是不同的机器，生成新机器码
//   效果：切换 WiFi/VPN/路由器、升级内存、换 CPU 均不导致重新激活。
// ============================================================
/** `machine_id.dat` 的记录（磁盘值：只校验 `primary`/`code` 两个字段是字符串，其余原样带过） */
interface MachineIdRecord {
  primary?: string;
  code: string;
  firstSeenAt?: number;
  v?: number;
  [k: string]: unknown;
}

function machineIdFilePath(appRef: App): string {
  return path.join(appRef.getPath('userData'), 'machine_id.dat');
}

/**
 * 读取已存储的机器码记录 { primary, code, firstSeenAt }
 * 返回 null 表示无记录或损坏
 */
function readMachineIdRecord(appRef: App): MachineIdRecord | null {
  const file = machineIdFilePath(appRef);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return null;
    const obj = asRecord(JSON.parse(raw) as unknown);
    // 基本结构校验（`asRecord` 已把非对象收成 `{}` ⇒ 源的 `obj &&` 那一层在此多余）
    if (typeof obj['primary'] === 'string' && typeof obj['code'] === 'string') {
      return obj as MachineIdRecord;
    }
    return null;
  } catch {
    return null; // 损坏的记录视为不存在
  }
}

function writeMachineIdRecord(appRef: App, primary: string, code: string): void {
  const file = machineIdFilePath(appRef);
  const record = {
    primary: primary,
    code: code,
    firstSeenAt: Date.now(),
    v: LICENSE_VERSION,
  };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf-8');
  fs.renameSync(tmp, file); // 原子写，防崩溃导致半写
}

let _machineCode: string | null = null;

/**
 * 获取当前机器码（带持久化锚定）
 *
 * @param appRef Electron app 实例（用于获取 userData 路径）
 * @returns 格式化的机器码 "DBPC-XXXX-XXXX-XXXX-XXXX"
 */
function getMachineCode(appRef?: App | null): string {
  if (_machineCode) return _machineCode;

  const collected = collectStableId();
  // 用主键+辅键+兜底拼接作为原始输入（与旧版格式不同，但哈希后都是固定长度）
  const rawInput = [collected.primary, collected.secondary, collected.fallback].filter(Boolean).join('||');

  // 计算当前实时机器码
  const currentRaw = SALT + '::' + rawInput;
  const currentHash = crypto.createHash('sha256').update(currentRaw, 'utf-8').digest('hex');
  const groups = [currentHash.slice(0, 4), currentHash.slice(4, 8), currentHash.slice(8, 12), currentHash.slice(12, 16)];
  const currentCode = 'DBPC-' + groups.join('-').toUpperCase();

  // ---- 持久化锚定逻辑 ----
  if (appRef) {
    const stored = readMachineIdRecord(appRef);

    if (stored) {
      // 已有历史记录：检查主硬件 ID 是否匹配
      if (collected.primary && stored.primary === collected.primary) {
        // 主硬件未变 → 沿用旧机器码（容忍次要因子变化）
        _machineCode = stored.code;
        if (_machineCode !== currentCode) {
          console.log('[license] 机器码锚定生效：主硬件未变，沿用旧码', stored.code, '(实时计算为', currentCode + ')');
        }
        return _machineCode;
      }

      // 主硬件变了 → 这是一台不同的机器（或首次采集时主键缺失后来补上了）
      // 仅当有有效的新主键时才视为"真正换了机器"
      if (collected.primary && !stored.primary) {
        // 旧记录没有主键（早期版本），现在有了 → 更新为主键模式
        console.log('[license] 机器码升级：补充主键', collected.primary);
        writeMachineIdRecord(appRef, collected.primary, currentCode);
        _machineCode = currentCode;
        return _machineCode;
      }

      // 主键确实不同 → 新机器，使用新码
      console.log('[license] 检测到新设备：主硬件从', stored.primary, '变为', collected.primary);
      writeMachineIdRecord(appRef, collected.primary || collected.secondary || '', currentCode);
      _machineCode = currentCode;
      return _machineCode;
    }

    // 首次启动：写入持久化记录
    writeMachineIdRecord(appRef, collected.primary || collected.secondary || '', currentCode);
    _machineCode = currentCode;
    return _machineCode;
  }

  // 无 app 实例（测试场景）：直接返回计算值
  _machineCode = currentCode;
  return _machineCode;
}

// ============================================================
// 激活码验证（客户端仅验证，不含本地时间判断）
// ============================================================
/** 验签回执（`ok:true` 时才带有效期与机器码） */
type VerifyResult = { ok: true; expireAt: number; machineCode: string } | { ok: false; error: string };

// 激活码格式：  base64url(JSON{ mc, exp, v }) + '.' + base64url(ed25519签名)
function verifyActivationCode(code: unknown, currentMachineCode: string): VerifyResult {
  if (!code || typeof code !== 'string' || !code.includes('.')) {
    return { ok: false, error: '激活码格式无效' };
  }
  const [payloadB64, sigB64] = code.split('.');
  if (!payloadB64 || !sigB64) return { ok: false, error: '激活码格式无效' };

  let payload: Record<string, unknown>;
  try {
    payload = asRecord(JSON.parse(b64urlDecode(payloadB64).toString('utf-8')) as unknown);
  } catch {
    return { ok: false, error: '激活码内容解析失败' };
  }

  // 1) 签名验证（开发者私钥签名，客户端公钥验签）
  let sigValid = false;
  try {
    sigValid = crypto.verify(null, Buffer.from(payloadB64, 'utf-8'), getPublicKey(), b64urlDecode(sigB64));
  } catch {
    sigValid = false;
  }
  if (!sigValid) return { ok: false, error: '激活码签名无效（可能被伪造）' };

  // 2) 机器码绑定校验
  if (payload['mc'] !== currentMachineCode) {
    return { ok: false, error: '激活码与本机机器码不匹配' };
  }

  // 3) 版本校验
  if (payload['v'] !== LICENSE_VERSION) {
    return { ok: false, error: '激活码版本不支持' };
  }
  if (typeof payload['exp'] !== 'number') {
    return { ok: false, error: '激活码缺少有效期字段' };
  }

  // 注意：此处不做“是否过期”判断，有效期由 checkLicenseStatus 结合可信时间判定。
  return { ok: true, expireAt: payload['exp'], machineCode: String(payload['mc']) };
}

// ============================================================
// 可信时间源（HTTPS Date 头）
// ============================================================
function fetchDateHeader(url: string, depth: number): Promise<number | null> {
  if (depth > 3) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: ReturnType<typeof https.get>;
    try {
      req = https.get(url, { timeout: 3000 }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          resolve(fetchDateHeader(next, depth + 1));
          return;
        }
        const dateHeader = res.headers['date'];
        res.resume();
        if (dateHeader) {
          const t = Date.parse(dateHeader);
          if (!isNaN(t)) {
            resolve(t);
            return;
          }
        }
        resolve(null);
      });
    } catch {
      resolve(null);
      return;
    }
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      try {
        req.destroy();
      } catch {
        // ★ TD-13-17：这里**已经在**错误/超时路径上收尾 —— destroy 失败无副作用
        //   （socket 最终由宿主/GC 回收），故刻意静默。
      }
      resolve(null);
    });
  });
}

// 返回可信时间（ms）；离线或全失败时返回 null。
function fetchTrustedTimeMs(): Promise<number | null> {
  if (_timeOverride != null) return Promise.resolve(_timeOverride);
  return new Promise((resolve) => {
    let i = 0;
    const tryNext = (): void => {
      if (i >= TRUSTED_TIME_HOSTS.length) {
        resolve(null);
        return;
      }
      // `i < length` 已判 ⇒ 下标必有值（`noUncheckedIndexedAccess` 不认这层）
      const url = TRUSTED_TIME_HOSTS[i++] as string;
      // `void`：源这里就是浮动 promise（没有 catch 分支）⇒ 闸要求显式忽略
      void fetchDateHeader(url, 0).then((t) => {
        if (t != null) resolve(t);
        else tryNext();
      });
    };
    tryNext();
  });
}

// ============================================================
// 单调时钟锚点（抗“运行中”系统时间回拨）
//   进程内用 process.hrtime（不受用户修改系统时间影响）建立锚点；
//   真实流逝时间 = 锚点可信时间 + (当前单调 - 锚点单调)。
// ============================================================
function monoNowMs(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

/** 单调锚点（`monoMs` 单调钟读数 · `trustedMs` 对应的可信墙上时间） */
interface TimeAnchor {
  monoMs: number;
  trustedMs: number;
}

let _anchor: TimeAnchor | null = null;
function setAnchor(trustedMs: number | null): TimeAnchor {
  _anchor = { monoMs: monoNowMs(), trustedMs: trustedMs != null ? trustedMs : Date.now() };
  return _anchor;
}
function effectiveNowMs(): number {
  // 源的写法：无锚点则先 `setAnchor(null)` 再读 —— `??` 让编译器看到"这里一定有值"
  const a = _anchor ?? setAnchor(null);
  return a.trustedMs + (monoNowMs() - a.monoMs);
}

// ============================================================
// 持久化时间基线（跨进程/重启，HMAC 防篡改）
//   记录最近一次可信时间；离线启动时若本地时钟落后于该基线 → 判定回拨。
// ============================================================
function timeAnchorFilePath(appRef: App): string {
  return path.join(appRef.getPath('userData'), 'timeanchor.dat');
}
function taHmacOf(obj: Record<string, unknown>): string {
  const { sig: _sig, ...rest } = obj;
  const canonical = JSON.stringify(rest);
  return crypto.createHmac('sha256', HMAC_SECRET).update(canonical, 'utf-8').digest('hex');
}
function readTimeAnchor(appRef: App): number | null {
  const file = timeAnchorFilePath(appRef);
  if (!fs.existsSync(file)) return null;
  try {
    const obj = asRecord(JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown);
    if (obj['sig'] !== taHmacOf(obj)) return null; // 基线被篡改 → 视为无基线
    return typeof obj['t'] === 'number' ? obj['t'] : null;
  } catch {
    return null;
  }
}
function writeTimeAnchor(appRef: App, t: number): void {
  const obj: Record<string, unknown> = { t, v: LICENSE_VERSION };
  obj['sig'] = taHmacOf(obj);
  fs.writeFileSync(timeAnchorFilePath(appRef), JSON.stringify(obj), 'utf-8');
}

// ============================================================
// 本地授权持久化（含 HMAC 防篡改）
// ============================================================
function licenseFilePath(appRef: App): string {
  return path.join(appRef.getPath('userData'), 'license.dat');
}

// 对授权记录计算 HMAC（排除 sig 字段本身）
function hmacOf(record: Record<string, unknown>): string {
  const { sig: _sig, ...rest } = record;
  const canonical = JSON.stringify(rest);
  return crypto.createHmac('sha256', HMAC_SECRET).update(canonical, 'utf-8').digest('hex');
}

/** 写授权时给的四个字段 */
interface LicenseWriteInput {
  machineCode: string;
  code: string;
  expireAt: number;
  activatedAt: number;
}

function writeLicense(appRef: App, { machineCode, code, expireAt, activatedAt }: LicenseWriteInput): Record<string, unknown> {
  const record: Record<string, unknown> = {
    v: LICENSE_VERSION,
    mc: machineCode,
    code,
    exp: expireAt,
    activatedAt,
  };
  record['sig'] = hmacOf(record);
  const file = licenseFilePath(appRef);
  fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8');
  return record;
}

/** 读授权的三种形态（`tampered` 作判别位；`record` 只在第三种出现） */
type LicenseReadResult =
  | { exists: false; tampered?: undefined; reason?: undefined; record?: undefined }
  | { exists: true; tampered: true; reason: string; record?: undefined }
  | { exists: true; tampered?: undefined; reason?: undefined; record: Record<string, unknown> };

function readLicense(appRef: App): LicenseReadResult {
  const file = licenseFilePath(appRef);
  if (!fs.existsSync(file)) return { exists: false };
  let record: Record<string, unknown>;
  try {
    record = asRecord(JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown);
  } catch {
    return { exists: true, tampered: true, reason: '授权文件损坏' };
  }
  if (record['sig'] !== hmacOf(record)) {
    return { exists: true, tampered: true, reason: '授权文件被篡改' };
  }
  return { exists: true, record };
}

// ============================================================
// 激活码一次性使用记录（防重复激活）
//   设计：本地维护一份「已被成功激活消耗」的激活码清单 used_codes.dat。
//   由于本软件为纯离线客户端（无后端服务器），这是当前架构下唯一可行的
//   “使用记录”——用 AES-256-GCM（密钥派生自 HMAC_SECRET）加密存储，
//   任何手动篡改/删除该文件都会导致解密失败 → 拒绝激活（fail-close），
//   从而阻止同一激活码被反复用于进入软件。
//   说明：同一激活码本就与机器码绑定（只能在本机使用），本机制进一步保证
//        它在本机上“成功激活一次后即失效”，无法二次进入。
// ============================================================
/** 一条"已消耗"记录 */
interface UsedCodeEntry {
  h?: string;
  mc?: string;
  ts?: number;
}

function usedCodesFilePath(appRef: App): string {
  return path.join(appRef.getPath('userData'), 'used_codes.dat');
}
function _usedKey(): Buffer {
  // 由 HMAC 密钥派生 32 字节 AES 密钥，与 license 共用同一信任根
  return crypto.createHash('sha256').update(HMAC_SECRET, 'utf-8').digest();
}
/** 加载结果（`tampered` 作判别位：为真时 `entries` 恒为 null） */
type UsedCodesLoaded = { tampered: true; entries: null } | { tampered: false; entries: UsedCodeEntry[] };

// 加载使用记录：返回 { entries, tampered }
//   - 文件不存在 → 视作全新（空记录，未篡改）
//   - 文件存在但解密失败 → 视为被篡改，tampered=true（fail-close）
function loadUsedCodes(appRef: App): UsedCodesLoaded {
  const file = usedCodesFilePath(appRef);
  if (!fs.existsSync(file)) return { entries: [], tampered: false };
  try {
    const buf = fs.readFileSync(file);
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', _usedKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf-8');
    const entries = JSON.parse(json) as unknown;
    // 磁盘值是 JSON 数组时按记录收窄
    return { entries: Array.isArray(entries) ? (entries as UsedCodeEntry[]) : [], tampered: false };
  } catch {
    return { entries: null, tampered: true };
  }
}
function saveUsedCodes(appRef: App, entries: UsedCodeEntry[]): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', _usedKey(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(entries), 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([iv, tag, enc]);
  const file = usedCodesFilePath(appRef);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file); // 原子替换，避免写崩导致误判为篡改
}
// 激活码指纹：与机器码/时长无关，仅标识“这个激活码字符串是否被消耗过”
function codeHash(code: string): string {
  return crypto.createHash('sha256').update(SALT + '|' + code, 'utf-8').digest('hex');
}
// 返回 true(已使用) / false(未使用) / 'tampered'(记录异常)
function isCodeUsed(appRef: App, code: string): boolean | 'tampered' {
  const loaded = loadUsedCodes(appRef);
  if (loaded.tampered) return 'tampered';
  const h = codeHash(code);
  return loaded.entries.some((e) => e.h === h);
}
function recordUsedCode(appRef: App, code: string, machineCode: string): void {
  const loaded = loadUsedCodes(appRef);
  const list: UsedCodeEntry[] = loaded.tampered ? [] : loaded.entries.slice(); // 上游已对 tampered 做 fail-close，此处仅健壮性兜底
  const h = codeHash(code);
  if (!list.some((e) => e.h === h)) {
    list.push({ h, mc: machineCode, ts: Date.now() });
    saveUsedCodes(appRef, list);
  }
}

// ============================================================
// 时间防篡改检测（返回 { tampered, tamperReason }）
//   - 在线：可信时间 T 落后于持久化基线（说明被回拨过）→ 篡改
//   - 离线：本地系统时间落后于持久化基线 → 篡改
// ============================================================
/** 时间篡改检测回执（源的三种返回：带/不带 trustedTime） */
interface TimeTamperResult {
  tampered: boolean;
  tamperReason?: string | undefined;
  trustedTime?: number | null | undefined;
}

async function detectTimeTamper(appRef: App): Promise<TimeTamperResult> {
  const T = await fetchTrustedTimeMs();
  if (T != null) {
    const ltt = readTimeAnchor(appRef);
    if (ltt != null && T < ltt - TIME_TOL_MS) {
      return { tampered: true, tamperReason: 'clock_rollback', trustedTime: T };
    }
    // 在线：用可信时间刷新基线并重置单调锚点
    writeTimeAnchor(appRef, T);
    setAnchor(T);
    return { tampered: false, trustedTime: T };
  }
  // 离线：用单调锚点 + 本地时间兜底；并检测“本地时钟落后于基线”的回拨
  const ltt = readTimeAnchor(appRef);
  if (!_anchor) setAnchor(ltt);
  if (ltt != null && Date.now() < ltt - TIME_TOL_MS) {
    return { tampered: true, tamperReason: 'clock_rollback_offline' };
  }
  return { tampered: false, trustedTime: null };
}

// ============================================================
// 对外状态查询 / 激活
// ============================================================
/** 授权状态回执（字段按源原样：可能缺席 ⇒ 用显式 `| undefined` 表达，别造值） */
type LicenseStatus =
  | { status: 'none'; machineCode: string }
  | { status: 'invalid'; machineCode: string; reason: string }
  | { status: 'tampered'; machineCode: string; tamperReason?: string | undefined; expireAt?: unknown; activatedAt?: unknown }
  | { status: 'expired'; machineCode: string; expireAt?: unknown; activatedAt?: unknown }
  | { status: 'ok'; machineCode: string; expireAt?: unknown; activatedAt?: unknown };

async function checkLicenseStatus(appRef: App): Promise<LicenseStatus> {
  // ★ `TD-13-4`：本地激活补丁已删 —— 这里**真的**读授权文件 + 复核激活码
  const mc = getMachineCode(appRef);
  const res = readLicense(appRef);
  if (!res.exists) return { status: 'none', machineCode: mc };
  if (res.tampered) {
    return { status: 'invalid', machineCode: mc, reason: res.reason || '授权文件异常' };
  }
  const record = res.record;
  // 复核激活码本身（签名 / 机器码 / 版本），双重保险
  const verify = verifyActivationCode(record['code'], mc);
  if (!verify.ok) {
    return { status: 'invalid', machineCode: mc, reason: verify.error };
  }

  // ★ 时间防篡改检测
  const tamper = await detectTimeTamper(appRef);
  if (tamper.tampered) {
    return {
      status: 'tampered',
      machineCode: mc,
      tamperReason: tamper.tamperReason,
      expireAt: record['exp'],
      activatedAt: record['activatedAt'],
    };
  }

  // ★ 有效期判定以可信时间（或单调锚点）为准，不依赖本地系统时间
  const now = tamper.trustedTime != null ? tamper.trustedTime : effectiveNowMs();
  if (now > Number(record['exp'])) {
    return {
      status: 'expired',
      machineCode: mc,
      expireAt: record['exp'],
      activatedAt: record['activatedAt'],
    };
  }

  return {
    status: 'ok',
    machineCode: mc,
    expireAt: record['exp'],
    activatedAt: record['activatedAt'],
  };
}

/** 激活回执 */
type ActivateResult =
  | { ok: true; status: 'ok'; expireAt: number; activatedAt: number; machineCode: string }
  | { ok: false; status: string; error: string; tamperReason?: string | undefined };

async function activateWithCode(appRef: App, code: unknown): Promise<ActivateResult> {
  // ★ `TD-13-4`：本地激活补丁已删 —— 这里**真的**校验 Ed25519 签名 + 机器码 + 版本
  const mc = getMachineCode(appRef);
  const raw = String(code || '').trim();
  const verify = verifyActivationCode(raw, mc);
  if (!verify.ok) {
    return { ok: false, status: 'invalid', error: verify.error };
  }

  // ★ 激活时同样做时间防篡改检测：回拨状态下拒绝激活
  const T = await fetchTrustedTimeMs();
  if (T != null) {
    const ltt = readTimeAnchor(appRef);
    if (ltt != null && T < ltt - TIME_TOL_MS) {
      return {
        ok: false,
        status: 'tampered',
        tamperReason: 'clock_rollback',
        error: '检测到系统时间被回拨，已拒绝激活，请恢复正确时间后重试',
      };
    }
  }

  // ★ 一次性机制：同一激活码成功激活一次后即失效，禁止二次进入。
  //   幂等例外仅适用于「当前激活态有效（未过期）」的情况；
  //   若当前已过期/无效/篡改，即使输入相同激活码也视为"重复使用"，拒绝激活。
  //   （否则过期后用户可反复用同一激活码重新激活，绕过一次性限制。）
  const existing = readLicense(appRef);
  let currentActiveCode: unknown = null;
  let currentStillValid = false;
  if (existing.exists && !existing.tampered && existing.record) {
    currentActiveCode = existing.record['code'];
    // 用本次获取的可信时间判断当前授权是否仍在有效期内
    const refNow = T != null ? T : Date.now();
    currentStillValid = refNow <= Number(existing.record['exp']);
  }
  const used = isCodeUsed(appRef, raw);
  if (used === 'tampered') {
    return {
      ok: false,
      status: 'tampered',
      tamperReason: 'used_record',
      error: '激活码使用记录异常（可能被篡改），已拒绝激活',
    };
  }
  // 已使用 + 非「有效期内同码幂等」→ 拒绝
  if (used === true && !(raw === currentActiveCode && currentStillValid)) {
    return { ok: false, status: 'used', error: '该激活码已被使用，无法重复激活' };
  }

  const activatedAt = T != null ? T : Date.now();
  writeLicense(appRef, { machineCode: mc, code: raw, expireAt: verify.expireAt, activatedAt });

  // 刷新时间基线与单调锚点
  if (T != null) writeTimeAnchor(appRef, T);
  else if (readTimeAnchor(appRef) == null) writeTimeAnchor(appRef, Date.now());
  setAnchor(T != null ? T : null);

  // 写入成功后再登记为“已使用”，确保“成功激活即失效”
  recordUsedCode(appRef, raw, mc);

  return { ok: true, status: 'ok', expireAt: verify.expireAt, activatedAt, machineCode: mc };
}

// ───────────────────── IPC 自注册（本域） ─────────────────────
// 三个 handler 说的都是「本机机器码 / 授权状态」这一件事 ⇒ 住本文件（TD-13-24）。
/**
 * ★ **域唯一门面**：宿主壳只说「初始化授权域」。
 * ⚠️ 宿主壳不再需要域内任何别的名字 —— 机器码派生 / 验签 / 联网取可信时间全在本文件。
 */
function initLicense(): void {
  // 获取本机机器码（供界面展示 / 复制 / 导出）
  handle('get-machine-code', () => {
    return { ok: true, machineCode: getMachineCode(app) };
  });

  // 查询当前授权状态（含时间防篡改检测，可能联网取可信时间）
  handle('get-license-status', async () => {
    return { ok: true, ...(await checkLicenseStatus(app)) };
  });

  // 用激活码激活（校验 + 持久化 + 时间防篡改检测）
  handle('activate-with-code', async (_e, code) => {
    // 源写 `{ ok: true, ...inner }`，但 inner 自身带 `ok` ⇒ 那个字面 `ok` **恒被覆盖**（TS2783 挡下）
    // ⇒ 去掉死字段，结果对象与源逐字段相同
    return { ...(await activateWithCode(app, code || '')) };
  });
}

/** 仅供测试注入可信时间（`_timeOverride`）—— 本仓当前无测试消费者，但删它会让该分支变死代码 */
function __setTrustedTimeOverride(ms: number | null): void {
  _timeOverride = ms;
}

// 导出面 = **宿主可用面**（`initLicense`）＋ 上面那个声明了用途的测试注入口
export { initLicense, __setTrustedTimeOverride };
