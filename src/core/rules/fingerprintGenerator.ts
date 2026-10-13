/**
 * 浏览器指纹**生成器**（★ 纯函数，必测）—— 原 `zc` shared.js:25397-25462
 *
 * ★ **它为什么必须存在（本轮查实）**：`electron/main.js:2575-2597` 的 `ensure-fingerprint`
 *   **不生成指纹** —— 它只有 `const fp = (acc && acc.fingerprint) || {}`，然后写
 *   `${id}.json` + `buildFingerprintPreload(fp)`。**没给就是空指纹**（账号全程用**原生**
 *   Chromium 身份、零伪装，且各账号身份完全相同）⇒ **前端必须自己产出**。
 *   而本工程此前**根本没有**这个生成器（`core/rules/fingerprint.ts` 是**隔离体检**，另一件事；
 *   `docs/过程.md` §1.3 第 204 行把"指纹生成/重算"也规划到那里，实际未实现）。
 *
 * 依据（**逐行回源抄录**）：
 *   - `b$` 25061-25069 —— FNV-1a 32 位哈希（把种子串变成 `uint32`）
 *   - `k$` 25070-25079 —— 种子 PRNG（返回 `[0,1)`）
 *   - `S$` 25108-25117 / `Md` 25118 —— 真实引擎主版本（`process.versions.chrome`，兜底 `126`）
 *   - `N$` 25119 —— Chrome 版本串候选（`${major}.0.0.0` ×2、`${major-1}.0.0.0`）
 *   - `Zh` 25120 = **3** —— 指纹版本
 *   - `Ry` 25121-25127 · `C$` 25128 · `E$` 25129-25149 —— 语言/时区候选
 *   - `j$` 25150-25198 —— **mac** 屏幕候选（8 条）
 *   - `_$` 25199-25235 —— **mac** WebGL 候选（12 条，全是 Apple Silicon / Metal）
 *   - `Dy` 25236-25284 —— **win** 屏幕候选（8 条）
 *   - `$d` 25285-25333 —— **win** WebGL 候选（16 条：NVIDIA 6 / Intel 5 / AMD 5）
 *   - `A$`/`I$` 25334-25335 —— win 的 `hardwareConcurrency` / `deviceMemory` 候选
 *   - `T$` 25371 —— win 的 `uaPlatformVersion` 候选
 *   - `Uc` 25080-25107 —— 当前 OS（**读宿主** ⇒ 已提取为 `os` 入参）
 *   - `M$` 25336-25353 —— win 屏幕候选的**按真实窗口尺寸过滤**（**读 `window`** ⇒ 入参）
 *   - `$$` 25354-25370 —— win WebGL 候选的**按真实 GPU 厂商过滤**（**读宿主 webgl** ⇒ 入参）
 *   - `P$` 25372-25379 / `R$` 25380-25396 —— Client Hints 两个形状
 *   - `zc` 25397-25462 —— 本函数本体
 *
 * ⚠️ **分层要点（本模块的三处刻意设计）**：
 *   ① `os` / `chromeMajor` / `winScreens` / `winWebgl` **全部作为入参** —— 因为源版的
 *      `Uc()` / `S$()` / `M$()` / `$$()` 都要**读宿主**（`window.api` / `process` /
 *      `window.innerWidth` / 真实 GPU）⇒ 不纯 ⇒ 由 state/adapter 注入（原则 4）。
 *      本模块另导出两个**纯**过滤器（`filterWinScreens` / `filterWinWebgl`），
 *      调用方只需把**读到的真实值**传进来。
 *   ② **PRNG 调用顺序即语义** —— 每多调/少调一次 `pick()`，后面所有维度都会漂。
 *      故 `generateFingerprint` 里 `pick()` 的调用顺序与 `zc` **逐行一致**，并有测试锁住。
 *   ③ 所有候选表**逐字抄录**（含大小写、空格、括号、`(TM)`、`0x00…` 十六进制 id）。
 *      表数据错一位**不可运行验证** ⇒ 只能靠逐行比对与"确定性"测试兜底（已留痕）。
 */

import type { Fingerprint, SecChUaHints, UserAgentDataLike } from '@/stable/model/account';
// ★ 指纹版本（原 `Zh` 25120 = 3）的**唯一真源在 `constants/fingerprint.ts`** —— 此处只消费
import { FINGERPRINT_VERSION } from '@/constants/fingerprint';

/** 真实引擎主版本的兜底（原 `S$` 25116 的 `return 126`） */
export const FALLBACK_CHROME_MAJOR = 126;

// ─────────────────────────── 种子 → 随机数（原 `b$` / `k$`）───────────────────────────

/** FNV-1a 32 位哈希（原 `b$` 25061）—— 与源**逐字一致**（含 `Math.imul` 与 `>>> 0`） */
export function fnv1a32(text: string): number {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 种子 PRNG（原 `k$` 25070）—— 返回 `[0,1)` */
export function createSeededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t |= 0;
    t = (t + 1831565813) | 0;
    let n = Math.imul(t ^ (t >>> 15), t | 1);
    n = n + Math.imul(n ^ (n >>> 7), n | 61) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────── 候选表（逐字抄录）───────────────────────────

/** 一条屏幕规格（原 `j$`/`Dy` 的元素） */
export interface ScreenSpec {
  w: number;
  h: number;
  availH: number;
  colorDepth: number;
  pixelRatio: number;
}

/** 一条 WebGL 规格（原 `_$`/`$d` 的元素） */
export interface WebglSpec {
  vendor: string;
  renderer: string;
}

/** win 语言/时区候选（原 `E$` 25129-25149，**5** 条） */
const WIN_LOCALES: ReadonlyArray<{ language: string; languages: readonly string[]; timezone: string }> = [
  { language: 'zh-CN', languages: ['zh-CN', 'zh', 'en-US', 'en'], timezone: 'Asia/Shanghai' },
  { language: 'zh-CN', languages: ['zh-CN', 'zh', 'en-US', 'en'], timezone: 'Asia/Hong_Kong' },
  { language: 'zh-CN', languages: ['zh-CN', 'zh', 'en-US', 'en'], timezone: 'Asia/Macau' },
  { language: 'zh-TW', languages: ['zh-TW', 'zh', 'en-US', 'en'], timezone: 'Asia/Taipei' },
  { language: 'zh-CN', languages: ['zh-CN', 'zh', 'en-SG', 'en'], timezone: 'Asia/Singapore' },
];

/** mac 语言候选（原 `Ry` 25121-25127）—— ⚠️ 抽取用的是它的 **key** */
const MAC_LANGUAGES: Readonly<Record<string, readonly string[]>> = {
  'zh-CN': ['zh-CN', 'zh', 'en-US', 'en'],
  'zh-TW': ['zh-TW', 'zh', 'en-US', 'en'],
  'en-US': ['en-US', 'en'],
  'ja-JP': ['ja-JP', 'ja', 'en-US', 'en'],
  'ko-KR': ['ko-KR', 'ko', 'en-US', 'en'],
};

/** mac 时区候选（原 `C$` 25128，**12** 条，`Asia/Shanghai` 出现两次 —— 照抄） */
const MAC_TIMEZONES: readonly string[] = [
  'Asia/Shanghai',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Macau',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Australia/Sydney',
];

/** mac 屏幕候选（原 `j$` 25150-25198，**8** 条） */
const MAC_SCREENS: readonly ScreenSpec[] = [
  { w: 1440, h: 900, availH: 844, colorDepth: 24, pixelRatio: 2 },
  { w: 1512, h: 982, availH: 926, colorDepth: 30, pixelRatio: 2 },
  { w: 1728, h: 1117, availH: 1061, colorDepth: 30, pixelRatio: 2 },
  { w: 1280, h: 800, availH: 768, colorDepth: 24, pixelRatio: 2 },
  { w: 1920, h: 1080, availH: 1040, colorDepth: 24, pixelRatio: 1.5 },
  { w: 2560, h: 1440, availH: 1400, colorDepth: 30, pixelRatio: 2 },
  { w: 1366, h: 768, availH: 728, colorDepth: 24, pixelRatio: 2 },
  { w: 3024, h: 1964, availH: 1908, colorDepth: 30, pixelRatio: 2 },
];

/** mac WebGL 候选（原 `_$` 25199-25235，**12** 条） */
const MAC_WEBGL: readonly WebglSpec[] = [
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, Metal 3.0)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1 Pro, Metal 3.0)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1 Max, Metal 3.0)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1 Ultra, Metal 3.0)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2, Metal 3.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2 Pro, Metal 3.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2 Max, Metal 3.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M3, Metal 3.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M3 Pro, Metal 3.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M3 Max, Metal 3.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M4, Metal 3.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Intel Iris Plus Graphics, Metal 3.0)' },
];

/** win 屏幕候选（原 `Dy` 25236-25284，**8** 条） */
const WIN_SCREENS: readonly ScreenSpec[] = [
  { w: 1920, h: 1080, availH: 1040, colorDepth: 24, pixelRatio: 1 },
  { w: 1920, h: 1080, availH: 1032, colorDepth: 24, pixelRatio: 1 },
  { w: 2560, h: 1440, availH: 1400, colorDepth: 24, pixelRatio: 1 },
  { w: 1366, h: 768, availH: 728, colorDepth: 24, pixelRatio: 1 },
  { w: 1536, h: 864, availH: 824, colorDepth: 24, pixelRatio: 1.25 },
  { w: 1707, h: 1067, availH: 1027, colorDepth: 24, pixelRatio: 1.25 },
  { w: 1280, h: 720, availH: 680, colorDepth: 24, pixelRatio: 1 },
  { w: 3840, h: 2160, availH: 2120, colorDepth: 30, pixelRatio: 2 },
];

/** win WebGL 候选（原 `$d` 25285-25333，**16** 条：NVIDIA 6 / Intel 5 / AMD 5） */
const WIN_WEBGL: readonly WebglSpec[] = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503), Direct3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 (0x00002882), Direct3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 (0x00002507), Direct3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484), Direct3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786), Direct3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER (0x000021C4), Direct3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E98), Direct3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49), Direct3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004680), Direct3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917), Direct3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55), Direct3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF), Direct3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT (0x000073DF), Direct3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7600 (0x0000748F), Direct3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF), Direct3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638), Direct3D11)' },
];

/** win `hardwareConcurrency` 候选（原 `A$` 25334） */
const WIN_HARDWARE_CONCURRENCY: readonly number[] = [4, 6, 8, 10, 12, 16, 20, 24];
/** win `deviceMemory` 候选（原 `I$` 25335） */
const WIN_DEVICE_MEMORY: readonly number[] = [4, 8];
/** win `uaPlatformVersion` 候选（原 `T$` 25371） */
const WIN_UA_PLATFORM_VERSION: readonly string[] = ['10.0.0', '13.0.0', '15.0.0'];
/** mac 的 `hardwareConcurrency` 候选（原 `zc` 25428 的内联数组） */
const MAC_HARDWARE_CONCURRENCY: readonly number[] = [8, 10, 11, 12, 14, 16];
/** mac 的 `deviceMemory` 候选（原 `zc` 25429 的内联数组） */
const MAC_DEVICE_MEMORY: readonly number[] = [8, 16, 32];
/** mac 的 `uaPlatformVersion`（原 `zc` 25431 的字面量） */
const MAC_UA_PLATFORM_VERSION = '14.0.0';

// ─────────────────────────── 两个"按真实环境过滤"的纯函数（原 `M$` / `$$`）───────────────────────────

/**
 * 按**真实窗口尺寸**过滤 win 屏幕候选（原 `M$` 25336-25353）
 *
 * ⚠️ 与源一致：取 `width >= realW && height >= realH` 的**子集**；若**一个都不满足**，
 *    返回**全表**（不是空数组）—— 于是"窗口比所有候选都大"时仍能抽到一条。
 */
export function filterWinScreens(realW: number, realH: number): readonly ScreenSpec[] {
  const hit = WIN_SCREENS.filter((s) => s.w >= realW && s.h >= realH);
  return hit.length ? hit : WIN_SCREENS;
}

/**
 * 按**真实 GPU** 过滤 win WebGL 候选（原 `$$` 25354-25370）
 *
 * 取真实 `vendor + ' ' + renderer` 里的厂商关键字（`nvidia`/`intel`/`amd|radeon`），
 * 再取候选里 `renderer` **包含 `(厂商,`** 的那些；**不足 2 条就返回全表**（原 `n.length >= 2`）。
 */
export function filterWinWebgl(realGpu: string): readonly WebglSpec[] {
  const s = String(realGpu || '');
  const brand = /nvidia/i.test(s) ? 'NVIDIA' : /intel/i.test(s) ? 'Intel' : /amd|radeon/i.test(s) ? 'AMD' : '';
  if (!brand) return WIN_WEBGL;
  const hit = WIN_WEBGL.filter((g) => g.renderer.includes(`(${brand},`));
  return hit.length >= 2 ? hit : WIN_WEBGL;
}

// ─────────────────────────── Client Hints（原 `P$` / `R$`）───────────────────────────

/** Sec-CH-UA 请求头组（原 `P$` 25372） */
export function buildSecChUaHints(chromeMajor: number, platform: 'Windows' | 'macOS'): SecChUaHints {
  return {
    'Sec-CH-UA': `"Google Chrome";v="${chromeMajor}", "Chromium";v="${chromeMajor}", "Not?A_Brand";v="24"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': `"${platform}"`,
    'Sec-CH-UA-Full-Version': `"${chromeMajor}.0.0.0"`,
  };
}

/** `navigator.userAgentData`（原 `R$` 25380） */
export function buildUserAgentData(
  chromeMajor: number,
  fullVersion: string,
  platform: 'Windows' | 'macOS',
): UserAgentDataLike {
  return {
    brands: [
      { brand: 'Google Chrome', version: String(chromeMajor) },
      { brand: 'Chromium', version: String(chromeMajor) },
      { brand: 'Not?A_Brand', version: '24' },
    ],
    mobile: false,
    platform,
    _fullVersion: fullVersion,
  };
}

// ─────────────────────────── 生成（原 `zc`）───────────────────────────

export interface FingerprintEnv {
  /** 当前宿主 OS（原 `Uc()`，**读宿主** ⇒ 注入） */
  os: Fingerprint['hostOS'];
  /** 真实引擎主版本（原 `S$()`，**读 `process`** ⇒ 注入；兜底见 `FALLBACK_CHROME_MAJOR`） */
  chromeMajor?: number;
  /** win 屏幕候选（原 `M$()` 的产物）—— 不给 ⇒ 用全表 */
  winScreens?: readonly ScreenSpec[];
  /** win WebGL 候选（原 `$$()` 的产物）—— 不给 ⇒ 用全表 */
  winWebgl?: readonly WebglSpec[];
}

/**
 * 由种子生成一份指纹（原 `zc` 25397-25462）
 *
 * ⚠️ **`pick()` 的调用顺序与源逐行一致**（顺序即语义 —— 多一次少一次，后面全漂）：
 *   win：`N$` → `E$` → `M$()` → `$$()` → `A$` → `I$` → `T$`
 *   mac：`N$` → `Object.keys(Ry)` → `C$` → `j$` → `_$`（`hardwareConcurrency`/`deviceMemory`/
 *        `uaPlatformVersion` 在 mac 分支是**字面量**，不消耗随机数）
 * ⚠️ `hostOS` 是 `linux` 时，源版会走 **else（mac）分支**（只有 `r === 'windows'` 才走 win 分支）
 *    —— 于是 `platform` 会是 `MacIntel`。**照抄**（linux 上的伪装就是"看起来像 mac"）。
 */
export function generateFingerprint(seed: string, env: FingerprintEnv): Fingerprint {
  const rand = createSeededRandom(fnv1a32(String(seed)));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;

  const os = env.os;
  const isWin = os === 'windows';

  // ① Chrome 版本串（4 次里只有 1 次消耗随机数 —— `N$` 是三元组，`n(N$)` 一次）
  const chromeMajor = env.chromeMajor && env.chromeMajor > 0 ? env.chromeMajor : FALLBACK_CHROME_MAJOR;
  const chromeVersions: readonly string[] = [
    `${chromeMajor}.0.0.0`,
    `${chromeMajor}.0.0.0`,
    `${chromeMajor - 1}.0.0.0`,
  ];
  const version = pick(chromeVersions);
  const major = parseInt(version.split('.')[0] as string, 10);

  const userAgent = isWin
    ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
    : `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  const appVersion = userAgent.replace(/^Mozilla\/5\.0 /, '');

  // ② 分平台候选（**顺序即语义**）
  let languages: readonly string[];
  let timezone: string;
  let screen: ScreenSpec;
  let webgl: WebglSpec;
  let hardwareConcurrency: number;
  let deviceMemory: number;
  let uaPlatformVersion: string;

  if (isWin) {
    const locale = pick(WIN_LOCALES);
    languages = locale.languages;
    timezone = locale.timezone;
    screen = pick(env.winScreens?.length ? env.winScreens : WIN_SCREENS);
    webgl = pick(env.winWebgl?.length ? env.winWebgl : WIN_WEBGL);
    hardwareConcurrency = pick(WIN_HARDWARE_CONCURRENCY);
    deviceMemory = pick(WIN_DEVICE_MEMORY);
    uaPlatformVersion = pick(WIN_UA_PLATFORM_VERSION);
  } else {
    // ⚠️ 先抽 **key**，再用 key 取 languages（源版就是 `n(Object.keys(Ry))` → `Ry[key]`）
    const localeKey = pick(Object.keys(MAC_LANGUAGES));
    languages = MAC_LANGUAGES[localeKey] as readonly string[];
    timezone = pick(MAC_TIMEZONES);
    screen = pick(MAC_SCREENS);
    webgl = pick(MAC_WEBGL);
    hardwareConcurrency = pick(MAC_HARDWARE_CONCURRENCY);
    deviceMemory = pick(MAC_DEVICE_MEMORY);
    uaPlatformVersion = MAC_UA_PLATFORM_VERSION;
  }

  const platform: 'Windows' | 'macOS' = isWin ? 'Windows' : 'macOS';

  return {
    hostOS: os,
    ver: FINGERPRINT_VERSION,
    userAgent,
    appVersion,
    platform: isWin ? 'Win32' : 'MacIntel',
    vendor: 'Google Inc.',
    language: languages[0] as string,
    languages: [...languages],
    timezone,
    screen: {
      width: screen.w,
      height: screen.h,
      availWidth: screen.w,
      availHeight: screen.availH,
      colorDepth: screen.colorDepth,
      pixelRatio: screen.pixelRatio,
    },
    webgl: { vendor: webgl.vendor, renderer: webgl.renderer },
    hardwareConcurrency,
    deviceMemory,
    maxTouchPoints: 0,
    uaPlatformVersion,
    uaArchitecture: isWin ? 'x86' : 'arm',
    uaBitness: '64',
    uaWow64: false,
    uaClientHints: buildSecChUaHints(major, platform),
    userAgentData: buildUserAgentData(major, version, platform),
  };
}
