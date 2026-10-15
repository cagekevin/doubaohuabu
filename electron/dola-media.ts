// 无水印媒体增强（移植自「豆包 Dola 30秒去水印助手」扩展的 service-worker）
// 原插件用 chrome.debugger.attach({tabId}) 按「标签页（webview）」拦截；Electron 等价物是
// webContents.debugger（每个 webview 一个）。这里在任意 <webview> 真实挂载时，直接对其
// webContents 挂 CDP Fetch 拦截，覆盖 dola.com / doubao.com 双源：
//   ① /im/chain/single          → 仅观察（抽取无水印图/视频直链，推送面板）
//   ② /samantha/skill/pack       → fulfill 成对应内置 *-skill-pack.json（注入 30s 时长/音频参考等生成选项）
//   ③ /alice/slot/action_bar_v3/get_item_conf → 读取真实响应，注入 15s 时长项后 fulfill 改写
//
// 注意：早期版本用 session.debugger 按分区（persist:doubao_<id>）拦截，但 Electron 下
// session.debugger 的 Fetch 在 webview 流量上经常不触发，且分区名随 sessionId 变化难对准。
// 改用 webContents.debugger 后彻底绕开这两个坑。来源（dola/doubao）按请求 URL 的 host 判定。
//
// ②③ 是「30s / 音频参考选项注入」的核心（后台 CDP 注入，自包含可控）；页面内 MAIN-world 的
// 30s 滑杆钩子（duration-main.js 直接 patch dola/doubao 内部 XHR）由渲染进程注入，见 preload/injectDolaDurationMain。

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  app,
  dialog,
  net,
  session as sessionModule,
  webContents,
  type BrowserWindow,
  type Session,
  type WebContents,
} from 'electron';
import { handle } from './ipc';
import { asRecord } from './api/shape';
// 各源（account type）对应的 host 与三类目标 URL
// dola / doubao 共用同一套路径前缀，仅 host 不同（移植自插件 service-worker.js 的双源定义）
// ★ **域名表不在本文件**（2026-10-14 收口）：收口到 `electron/site-hosts.ts`
//   （层 1 域名 = `SITE_HOSTS`；层 2 归属判定 = `isHostOf` / `sourceOfHost` / `hostOfUrl`）。
//   ⚠️ 原先这里并排放着 `SOURCE_HOSTS` **和** `ATTACH_HOSTS`（同一串字面量抄两遍）、
//      外加两处各自的 `endsWith('.' + h)` 子域规则 ⇒ 5 个中心（另有 `main.js` 3 处内联）。
import { SITE_HOSTS as SOURCE_HOSTS, normalizeHost, hostOfUrl, isHostOf, isKnownHost } from './site-hosts';

/** 外部 JSON 的“记录”形态（收窄用） */
type JsonRecord = Record<string, unknown>;

/**
 * 字节数组：**显式绑 `ArrayBuffer`** —— `crypto.subtle` 的 `BufferSource` 不收 `Uint8Array<ArrayBufferLike>`
 * （TS 5.7 起 `ArrayBufferLike` 含 `SharedArrayBuffer`）。本文件的字节都来自 `new Uint8Array(n)` 或 `slice`。
 */
type Bytes = Uint8Array<ArrayBuffer>;

/** 已抽到的一条媒体（`wcId` 只在捕获侧带上） */
interface MediaItem {
  type: string;
  url: string;
  fallbackApi?: string;
  wcId?: number;
}

/** 取主窗口（宿主注入）：事件推送 + 下载目录对话框都要真窗口 */
type MainWindowGetter = () => BrowserWindow | null;

// 无水印媒体抽取时允许回源的 fallback_api 主机（防止抽错域）：
//   dola  → dola.com / byteintlapi.com
//   doubao → doubao.com / byteintlapi.com / snssdk.com（移植自插件 FALLBACK_API_ROOT_HOSTS）
// ⚠️ 这是**额外的 CDN／接口域**（语义独立于"源主域"）⇒ 本表保留；
//    但源主域**引用层 1**，不重抄字面量（改主域只改 `site-hosts.ts`）。
const FALLBACK_API_ROOT_HOSTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  dola: Object.freeze([SOURCE_HOSTS['dola'] as string, 'byteintlapi.com']),
  doubao: Object.freeze([SOURCE_HOSTS['doubao'] as string, 'byteintlapi.com', 'snssdk.com']),
});
// 三类目标 URL 的路径前缀（host 无关，按 SOURCE_HOSTS 逐源匹配）
const PATH_CHAIN_SINGLE = '/im/chain/single';
const PATH_SKILL_PACK = '/samantha/skill/pack';
const PATH_ACTION_BAR = '/alice/slot/action_bar_v3/get_item_conf';
// 无水印视频直链回源字段名（豆包/dola 不同版本/不同端可能改名；这里多候选扫描，
// 最终是否采用仍由 isAllowedFallbackApiUrl 按白名单 host 校验决定，避免误抓非官方域名）。
// 注意：绝不要加入聊天响应里直接出现的 main_url/play_url —— 那些通常是「带水印」播放直链，
// 只有 fallback_api 这一族（配 logo_type=unwatermarked）才是云端原始无水印文件。
const FALLBACK_API_KEYS = [
  'fallback_api',
  'fallback_url',
  'unwatermarked_url',
  'no_watermark_url',
  'wm_free_api',
  'no_logo_url',
  'water_mark_free_api',
  'logo_free_url',
];
// 注入用 skill-pack 响应体（移植自插件内置 *-skill-pack-response.json）：把生成选项喂给对应界面
// ⚠️ 第二参在源里就是**未使用**的（只用于调用点自述来源）⇒ 保留形参、按未使用约定加下划线前缀
function loadSkillPack(file: string, _label: string): string {
  try {
    return fs.readFileSync(path.join(__dirname, file), 'utf8');
  } catch (err) {
    console.warn(`[dola-media] 读取 ${file} 失败:`, err instanceof Error ? err.message : String(err));
    return '{"code":0,"msg":"","data":{}}';
  }
}
const DOLA_SKILL_PACK_BODY = loadSkillPack('dola-skill-pack.json', 'dola');
const DOUBAO_SKILL_PACK_BODY = loadSkillPack('doubao-skill-pack.json', 'doubao');
const MAX_FALLBACK_API_COUNT = 8;
// 取无水印直链（第二跳）的两套网络栈预算：
//   ① Electron net.fetch → 走 Chromium 网络栈（与 webview 同一路径：同一代理/证书/DNS），
//      页面能打开豆包就一定能走通这条；这是「主进程 fetch 超时/失败」的正解。
//   ② Node 全局 fetch（undici）→ 仅在 ① 不可用时兜底，预算更短以便快速失败。
const FALLBACK_API_TIMEOUT_MS = 15000;
const NODE_FETCH_TIMEOUT_MS = 6000;
// 诊断产物（落在用户主目录，便于离线分析豆包改版；只记录「字段形状」，不含签名明文）：
//   ~/dola-media-sample.json        —— 视频相关响应的字段形状 + 候选字段清单
//   ~/dola-media-fallback-url.txt   —— 完整 fallback_api 直链（含签名，仅本机，用完可删）
const DIAG_HOME = ((): string => {
  try {
    return os.homedir();
  } catch {
    return __dirname;
  }
})();
const DIAG_SAMPLE_PATH = path.join(DIAG_HOME, 'dola-media-sample.json');
const DIAG_FALLBACK_URL_PATH = path.join(DIAG_HOME, 'dola-media-fallback-url.txt');
const QAAB_SALT_HEX =
  '4dd4c2e6b83162090e52b3c7a6733ba4' +
  '1cb2462b829ab58a196b39db57177524' +
  'f49baf7f08e8d68d26a72e37c1a95a2f' +
  '1f05a51892aef2949732b62a38aadd58';

// ───────────────────────── 模块级状态 ─────────────────────────
let mainWindowGetter: MainWindowGetter | null = null;
const latestItems: MediaItem[] = []; // { type, url, fallbackApi? }
const seenKeys = new Set<string>();

// ───────────────────────── 工具：源/URL 判定 ─────────────────────────
function getSourceFromUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    for (const [source, rootHost] of Object.entries(SOURCE_HOSTS)) {
      if (hostname === rootHost || hostname.endsWith(`.${rootHost}`)) return source;
    }
  } catch {
    return '';
  }
  return '';
}

function isSourcePathUrl(rawUrl: unknown, source: string, pathPrefix: string): boolean {
  if (getSourceFromUrl(rawUrl) !== source) return false;
  try {
    const pathname = new URL(String(rawUrl)).pathname;
    return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
  } catch {
    return false;
  }
}

function isHttpUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url.trim());
}

// ───────────────────────── 工具：解码辅助 ─────────────────────────
// ⚠️ 源里还有一个 `normalizeExtractedUrl(value)`，但它**只被上面那个零调用的 `findRegexUrls` 调用**
//    （`git grep` 实算）⇒ 两个一起未转过来。

function decodeJsonEscapedFragment(value: string): string {
  let text: string = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = JSON.parse(`"${text.replace(/"/g, '\\"')}"`) as unknown;
      if (typeof decoded !== 'string') break;
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
}

function replaceQueryParams(url: string, params: Record<string, string>): string {
  const parsedUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsedUrl.searchParams.set(key, value);
  }
  return parsedUrl.toString();
}

function getQueryParam(url: string, name: string): string {
  try {
    return new URL(url).searchParams.get(name)?.trim() || '';
  } catch {
    return '';
  }
}

// ⚠️ 源里还有一个 `findRegexUrls(text, pattern)`，但**全仓（含原版参考）只有定义、零调用**
//    （`git grep` 实算）⇒ 同 `license` 的 `b64urlEncode`：未转过来（保留会踩 lint 的未使用检查）。

// ───────────────────────── JSON 遍历 ─────────────────────────
function parseJsonString(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function walkJsonAndStrings(
  value: unknown,
  visitor: (node: JsonRecord | unknown[]) => void,
  seen: Set<object> = new Set(),
): void {
  if (value == null) return;
  if (typeof value === 'string') {
    const parsed = parseJsonString(value);
    if (parsed !== null) walkJsonAndStrings(parsed, visitor, seen);
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  visitor(value as JsonRecord | unknown[]);
  if (Array.isArray(value)) {
    for (const item of value) walkJsonAndStrings(item, visitor, seen);
    return;
  }
  for (const key of Object.keys(value)) walkJsonAndStrings((value as JsonRecord)[key], visitor, seen);
}

function findValuesByKey(value: unknown, targetKey: string): unknown[] {
  const values: unknown[] = [];
  walkJsonAndStrings(value, (node) => {
    if (Array.isArray(node)) return;
    if (Object.prototype.hasOwnProperty.call(node, targetKey)) values.push(node[targetKey]);
  });
  return values;
}

function findImageOriRawUrls(value: unknown): string[] {
  const urls: string[] = [];
  walkJsonAndStrings(value, (node) => {
    if (Array.isArray(node)) return;
    const image = node['image_ori_raw'];
    if (image && typeof image === 'object') {
      const url = asRecord(image)['url'];
      if (isHttpUrl(url)) urls.push(String(url));
    }
  });
  return urls;
}

// ───────────────────────── 视频 token 解码 ─────────────────────────
function getVideoData(payload: unknown): JsonRecord {
  const p = asRecord(payload);
  const videoInfo = p['video_info'] || asRecord(p['data'])['video_info'] || payload;
  const data = asRecord(videoInfo)['data'] || videoInfo;
  return data && typeof data === 'object' ? (data as JsonRecord) : {};
}

function pickMainUrlToken(data: JsonRecord): string {
  const videoList = data['video_list'];
  const entries: unknown[] =
    videoList && typeof videoList === 'object' && Object.keys(videoList).length
      ? (Object.values(videoList) as unknown[])
      : [data];
  let best: { token: string; score: number } | null = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = asRecord(entry);
    const token = e['main_url'] || e['play_url'] || '';
    if (typeof token !== 'string' || !token.trim()) continue;
    const score = Number(e['bitrate'] || e['real_bitrate'] || 0) + Number(e['vwidth'] || e['width'] || 0) * Number(e['vheight'] || e['height'] || 0);
    if (!best || score > best.score) best = { token: token.trim(), score };
  }
  return best ? best.token : '';
}

function findKeySeedDeep(value: unknown, depth = 0): string {
  if (depth > 10 || value == null) return '';
  if (typeof value === 'string') {
    let match = value.match(/(?:^|[?&])key_seed=([^&"'<>\\\s]+)/i);
    if (match) return decodeURIComponent(match[1] ?? '');
    match = value.match(/["']key_seed["']\s*:\s*["']([^"']+)/i);
    return match ? decodeURIComponent(match[1] ?? '') : '';
  }
  if (typeof value !== 'object') return '';
  const rec = value as JsonRecord;
  if (typeof rec['key_seed'] === 'string' && rec['key_seed'].trim()) return rec['key_seed'].trim();
  for (const item of Object.values(rec)) {
    const hit = findKeySeedDeep(item, depth + 1);
    if (hit) return hit;
  }
  return '';
}

function tryDecodeBase64Url(token: string): string {
  const bytes = base64DecodeLoose(token);
  if (!bytes) return '';
  const text = asciiUrlFromBytes(bytes);
  return isHttpUrl(text) ? text : '';
}

function base64DecodeLoose(text: unknown): Bytes | null {
  const input = String(text || '').trim();
  const variants = [
    input,
    input.replace(/[$@#]/g, (char: string) => ({ $: '_', '@': '/', '#': '.' })[char] ?? ''),
    input.replace(/[$@#]/g, (char: string) => ({ $: '+', '@': '/', '#': '=' })[char] ?? ''),
  ];
  const seen = new Set<string>();
  for (const candidate of variants) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const normalized = padBase64(candidate).replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    } catch {
      // 试下一个变体
    }
  }
  return null;
}

function padBase64(text: string): string {
  const pad = (4 - (text.length % 4)) % 4;
  return text + '='.repeat(pad);
}

function asciiUrlFromBytes(bytes: Bytes | null): string {
  if (!bytes || !bytes.length) return '';
  for (const byte of bytes) {
    if (byte !== 9 && byte !== 10 && byte !== 13 && (byte < 32 || byte > 126)) return '';
  }
  return new TextDecoder().decode(bytes);
}

async function decodeMainUrl(token: string, keySeed = ''): Promise<string> {
  if (isHttpUrl(token)) return token;
  const plainUrl = tryDecodeBase64Url(token);
  if (plainUrl) return plainUrl;
  if (token.startsWith('qAAB') && keySeed) return await decodeQaabToken(token, keySeed);
  return '';
}

async function decodeQaabToken(token: string, keySeed: string): Promise<string> {
  const data = base64DecodeLoose(token);
  const seed = base64DecodeLoose(keySeed);
  if (!data || !seed) return '';
  const digest1 = await crypto.subtle.digest('SHA-512', seed.slice(0, 32));
  const salt = hexToBytes(QAAB_SALT_HEX);
  const digest2Input = concatBytes(new Uint8Array(digest1), salt);
  const digest2 = new Uint8Array(await crypto.subtle.digest('SHA-512', digest2Input));
  const key = digest2.slice(0, 16);
  const iv = digest2.slice(16, 32);
  const attempts: { payload: Bytes; key: Bytes; iv: Bytes }[] = [];
  if (data.length >= 4 && data[0] === 0xa8 && data[1] === 0x00 && data[2] === 0x01 && data[3] === 0x00) {
    attempts.push({ payload: data.slice(4), key, iv });
    attempts.push({ payload: data.slice(4), key: iv, iv: key });
    if (data.length > 36) {
      attempts.push({ payload: data.slice(36), key, iv: data.slice(20, 36) });
      attempts.push({ payload: data.slice(36), key, iv });
    }
  } else {
    attempts.push({ payload: data, key, iv });
  }
  for (const attempt of attempts) {
    const url = await decryptAesCbcUrl(attempt.payload, attempt.key, attempt.iv);
    if (url) return url;
  }
  return '';
}

async function decryptAesCbcUrl(payload: Bytes, keyBytes: Bytes, ivBytes: Bytes): Promise<string> {
  if (!payload.length || payload.length % 16 !== 0) return '';
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, key, payload));
    const direct = asciiUrlFromBytes(plain);
    if (isHttpUrl(direct)) return direct;
    const stripped = stripPkcs7(plain);
    const url = asciiUrlFromBytes(stripped);
    return isHttpUrl(url) ? url : '';
  } catch {
    return '';
  }
}

function stripPkcs7(bytes: Bytes): Bytes {
  if (!bytes || !bytes.length) return new Uint8Array();
  const pad = bytes[bytes.length - 1] ?? 0;
  if (pad < 1 || pad > 16 || pad > bytes.length) return bytes;
  for (let index = bytes.length - pad; index < bytes.length; index += 1) {
    if (bytes[index] !== pad) return bytes;
  }
  return bytes.slice(0, bytes.length - pad);
}

function hexToBytes(hex: string): Bytes {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(first: Bytes, second: Bytes): Bytes {
  const bytes = new Uint8Array(first.length + second.length);
  bytes.set(first, 0);
  bytes.set(second, first.length);
  return bytes;
}

// ───────────────────────── 抽取主流程 ─────────────────────────
function mediaIdentityKey(type: string, rawUrl: string, fallbackApi = ''): string {
  const stableFallbackApi = String(fallbackApi || '').trim();
  return type === 'video' && stableFallbackApi ? `video:fallback_api:${stableFallbackApi}` : `${type}:url:${rawUrl}`;
}

// wcId：捕获该媒体的 webview（guest WebContents）id，用于渲染层把它精确归属到发起生成的账号。
// 没有它时「同账号多节点并发生成」只能靠全局 FIFO 猜测归属，会把视频连错节点。
function addItem(type: string, url: unknown, fallbackApi = '', wcId: number | null = null): void {
  if (!isHttpUrl(url)) return;
  const identity = mediaIdentityKey(type, String(url), fallbackApi);
  if (seenKeys.has(identity)) return;
  seenKeys.add(identity);
  latestItems.push({
    type,
    url: String(url),
    ...(fallbackApi ? { fallbackApi } : {}),
    ...(wcId != null ? { wcId } : {}),
  });
}

function isAllowedFallbackApiUrl(rawUrl: unknown, source: string): boolean {
  const allowedHosts = FALLBACK_API_ROOT_HOSTS[source];
  if (!Array.isArray(allowedHosts)) return false;
  try {
    const parsed = new URL(String(rawUrl));
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return allowedHosts.some((rootHost) => hostname === rootHost || hostname.endsWith(`.${rootHost}`));
  } catch {
    return false;
  }
}

function addFallbackApi(apis: Set<string>, value: unknown, source: string): void {
  if (typeof value !== 'string' || !value) return;
  const url = decodeJsonEscapedFragment(value);
  if (isAllowedFallbackApiUrl(url, source)) apis.add(url);
}

function findFallbackApis(json: unknown, rawBody: string, source: string): string[] {
  const apis = new Set<string>();
  // 1) 走「已解析 JSON 对象树」扫描（可靠路径）：豆包/dola 改字段名也能命中
  for (const key of FALLBACK_API_KEYS) {
    for (const value of findValuesByKey(json, key)) addFallbackApi(apis, value, source);
  }
  // 2) 走「原始 body 正则」扫描（兜底）：应对响应被二次 JSON 转义、字段藏在字符串里的情形
  // 注意：先对「每个 key」单独转义正则元字符，再用未转义的 | 拼接成 alternation；
  // 若对整个 join 后的字符串转义，会把分隔符 | 也转义成 \|，使 alternation 失效（曾踩坑）。
  const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyClass = FALLBACK_API_KEYS.map((k) => escapeRe(k)).join('|');
  const patterns = [
    new RegExp(`(?:${keyClass})\\\\":\\\\"([^"\\\\]+?)\\\\"`, 'g'),
    new RegExp(`"(?:${keyClass})"\\s*:\\s*"([^"]+)"`, 'g'),
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(rawBody);
    while (match) {
      addFallbackApi(apis, decodeJsonEscapedFragment(match[1] ?? ''), source);
      match = pattern.exec(rawBody);
    }
  }
  return Array.from(apis);
}

// ───────────────────────── 诊断：字段「形状」快照 ─────────────────────────
// 目的：豆包改版时，只看「有没有 fallback_api」不够，需要知道响应里到底有哪些字段。
// 这里只记录字段名 / 类型 / 长度 / 是否 URL（含 host、query 参数名），不记录签名明文。
function hostOf(rawUrl: unknown): string {
  try {
    return new URL(String(rawUrl)).hostname;
  } catch {
    return '';
  }
}

function pathOf(rawUrl: unknown): string {
  try {
    return new URL(String(rawUrl)).pathname;
  } catch {
    return '';
  }
}

function queryKeysOf(rawUrl: unknown): string[] {
  try {
    return Array.from(new URL(String(rawUrl)).searchParams.keys());
  } catch {
    return [];
  }
}

function describeLeaf(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return typeof value;
  if (isHttpUrl(value)) {
    return `url(host=${hostOf(value)}, path=${pathOf(value)}, q=${queryKeysOf(value).join('|') || '-'}, len=${value.length})`;
  }
  const head = value.length <= 64 ? value : `${value.slice(0, 8)}…`;
  return `str(len=${value.length}, head=${JSON.stringify(head)})`;
}

function describeShape(value: unknown, depth = 0, seen: Set<object> = new Set()): unknown {
  if (depth > 4) return '<deep>';
  if (value == null) return 'null';
  if (typeof value === 'string') {
    const parsed = parseJsonString(value);
    if (parsed !== null) return { '<jsonString>': describeShape(parsed, depth + 1, seen) };
    return describeLeaf(value);
  }
  if (typeof value !== 'object') return typeof value;
  if (seen.has(value)) return '<seen>';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 3).map((item) => describeShape(item, depth + 1, seen));
  const out: JsonRecord = {};
  for (const key of Object.keys(value)) out[key] = describeShape((value as JsonRecord)[key], depth + 1, seen);
  return out;
}

// 扫描全响应里「名字可疑」的字段（含嵌套 JSON 字符串），便于发现改版后的新字段名
function collectSuspiciousKeys(json: unknown, limit = 180): JsonRecord {
  const out = new Map<string, unknown>();
  const KEY_RE = /(url|video|water|logo|play|api|token|seed|media|file|download|codec|bitrate|duration)/i;
  const walk = (node: unknown, pathStr: string, depth: number, seen: Set<object>): void => {
    if (out.size >= limit || node == null || depth > 8) return;
    if (typeof node === 'string') {
      const parsed = parseJsonString(node);
      if (parsed !== null) walk(parsed, `${pathStr}<json>`, depth + 1, seen);
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.slice(0, 4).forEach((item, index) => walk(item, `${pathStr}[${index}]`, depth + 1, seen));
      return;
    }
    const rec = node as JsonRecord;
    for (const key of Object.keys(rec)) {
      const childPath = pathStr ? `${pathStr}.${key}` : key;
      if (KEY_RE.test(key)) {
        const child = rec[key];
        out.set(childPath, typeof child === 'string' ? describeLeaf(child) : describeShape(child, 0, new Set()));
      }
      walk(rec[key], childPath, depth + 1, seen);
    }
  };
  walk(json, '', 0, new Set());
  return Object.fromEntries(out);
}

/** 第二跳的一次尝试结果（`hardStop` 表示换网络栈无意义） */
interface VideoFetchResult {
  url: string;
  stack?: string;
  error?: string;
  hardStop?: boolean;
  fallbackApi?: string;
}

// 把「视频相关响应形状」+ 候选直链落盘，供离线分析（每次覆盖，仅视频响应时写）
function writeSampleReport(
  json: unknown,
  rawBody: string,
  source: string,
  fallbackApis: string[],
  videoResults: VideoFetchResult[],
): void {
  try {
    const report = {
      at: new Date().toISOString(),
      source,
      bodyLen: rawBody ? rawBody.length : 0,
      topLevelKeys: json && !Array.isArray(json) ? Object.keys(json) : ['<array>'],
      fallbackApis: fallbackApis.map((u) => ({
        host: hostOf(u),
        path: pathOf(u),
        queryKeys: queryKeysOf(u),
        len: u.length,
      })),
      fallbackResults: videoResults.map((r) => ({
        ok: !!r.url,
        stack: r.stack || '',
        host: hostOf(r.url || ''),
        error: r.error || '',
      })),
      imageOriRawCount: findImageOriRawUrls(json).length,
      suspiciousKeys: collectSuspiciousKeys(json),
    };
    fs.writeFileSync(DIAG_SAMPLE_PATH, JSON.stringify(report, null, 2));
  } catch (err) {
    console.warn('[dola-media] 写诊断样本失败:', err instanceof Error ? err.message : String(err));
  }
  if (fallbackApis.length) {
    try {
      const prev = ((): string[] => {
        try {
          return fs.readFileSync(DIAG_FALLBACK_URL_PATH, 'utf8').split('\n').filter(Boolean);
        } catch {
          return [];
        }
      })();
      const merged = Array.from(new Set([...fallbackApis, ...prev])).slice(0, 20);
      fs.writeFileSync(
        DIAG_FALLBACK_URL_PATH,
        `# 无水印视频直链（第二跳原始 fallback_api，含签名，仅供本机排查，可随时删除）\n${merged.join('\n')}\n`,
      );
    } catch (err) {
      console.warn('[dola-media] 写 fallback_api 清单失败:', err instanceof Error ? err.message : String(err));
    }
  }
}

// ───────────────────────── 第二跳：两套网络栈取直链 ─────────────────────────
function errText(error: unknown): string {
  if (!error) return 'unknown';
  const e = asRecord(error);
  const name = typeof e['name'] === 'string' ? e['name'] : '';
  const message = typeof e['message'] === 'string' ? e['message'] : '';
  const head = name && name !== 'Error' ? `${name}: ${message}` : message || String(error);
  const parts = [head];
  let cause: unknown = e['cause'];
  for (let i = 0; i < 3 && cause; i += 1) {
    const c = asRecord(cause);
    parts.push(`⟵ ${String(c['code'] || c['name'] || '')} ${String(c['message'] || '')}`.trim());
    cause = c['cause'];
  }
  return parts.join(' | ');
}

// 超时保护：即使底层忽略 AbortSignal（例如某些 Electron 版本的 net.fetch），也能按时放弃
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时 ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer ?? undefined));
}

let netFetchProbed = false;
let netModule: typeof net | null = null;
function getElectronNet(): typeof net | null {
  if (!netFetchProbed) {
    netFetchProbed = true;
    try {
      netModule = net && typeof net.fetch === 'function' ? net : null;
    } catch {
      netModule = null;
    }
  }
  return netModule;
}

// 走 Chromium 网络栈：与 webview 同一条网络路径（同代理、同 DNS、同证书校验、同 cookie jar）。
// 注意：Electron 文档明确「net.fetch 只会用默认会话；要用别的会话请用 ses.fetch()」，
// 所以这里优先用 ses.fetch（某账号分区的会话），无会话时才退回 net.fetch（默认会话）。
function fetchViaElectronNet(url: string, ses: Session | null, signal: AbortSignal): Promise<Response> {
  const netMod = getElectronNet();
  if (!netMod) throw new Error('net.fetch 不可用');
  const init = {
    method: 'GET',
    signal,
    credentials: 'include' as const,
    headers: {
      accept: 'application/json,text/plain,*/*',
      referer: 'https://www.doubao.com/',
    },
  };
  if (ses && typeof ses.fetch === 'function') return ses.fetch(url, init);
  return netMod.fetch(url, init);
}

/** 一套网络栈的取数函数（net.fetch / 全局 fetch） */
type Fetcher = (url: string, signal: AbortSignal) => Promise<Response>;

// 单套网络栈的一次尝试；hardStop=true 表示「已拿到合法响应但解析不出直链」——换栈无意义
async function attemptFallbackFetch(
  label: string,
  fetcher: Fetcher,
  url: string,
  source: string,
  budgetMs: number,
): Promise<VideoFetchResult> {
  const controller = new AbortController();
  const started = Date.now();
  try {
    const response = await withTimeout(
      Promise.resolve().then(() => fetcher(url, controller.signal)),
      budgetMs,
      label,
    );
    if (!response || !response.ok) throw new Error(`HTTP ${response ? response.status : '(无响应)'}`);
    // 注意：net.fetch 返回的 Response.url 可能不准确（Electron 文档已注明），
    // 因此只在其确实是合法 http(s) 地址时才做白名单校验，避免误判失败。
    const finalUrl = response.url || '';
    if (/^https?:\/\//i.test(finalUrl) && !isAllowedFallbackApiUrl(finalUrl, source)) {
      throw new Error(`重定向到非白名单域 ${hostOf(finalUrl)}`);
    }
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      const contentType = (response.headers && response.headers.get && response.headers.get('content-type')) || '-';
      return {
        url: '',
        hardStop: true,
        error: `${label}: 响应非 JSON（content-type=${contentType}, len=${text.length}, head=${JSON.stringify(text.slice(0, 80))}）`,
      };
    }
    const data = getVideoData(payload);
    const token = pickMainUrlToken(data);
    if (!token) {
      const payloadKeys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 8).join(',') : '';
      const dataKeys = data && typeof data === 'object' ? Object.keys(data).slice(0, 12).join(',') : '';
      return {
        url: '',
        hardStop: true,
        error: `${label}: 响应成功但无 main_url/play_url（payload keys=[${payloadKeys}] data keys=[${dataKeys}], ${Date.now() - started}ms）`,
      };
    }
    const keySeed = findKeySeedDeep(payload) || getQueryParam(url, 'key_seed');
    if (token.startsWith('qAAB') && !keySeed) {
      return { url: '', hardStop: true, error: `${label}: qAAB token 但缺 key_seed` };
    }
    const resolved = await decodeMainUrl(token, keySeed);
    if (!resolved) {
      return { url: '', hardStop: true, error: `${label}: token 解码失败（head=${token.slice(0, 6)}, len=${token.length}）` };
    }
    return { url: resolved, stack: label, error: '' };
  } catch (error) {
    return { url: '', hardStop: false, error: `${label}: ${errText(error)} (${Date.now() - started}ms)` };
  } finally {
    try {
      controller.abort();
    } catch {
      /* abort 幂等（可能已中止或已结束） */
    }
  }
}

async function getUnwatermarkedVideoUrlFromFallbackApi(
  fallbackApi: string,
  source: string,
  ses: Session | null = null,
): Promise<VideoFetchResult> {
  if (!isAllowedFallbackApiUrl(fallbackApi, source)) return { url: '', error: 'fallback_api host 不在白名单' };
  // 参数变体：都表达「要无水印」，但覆盖豆包把水印开关迁移到 lr=video_gen_no_watermark 的新写法。
  // 仅当服务端正常应答却「没给出 main_url」时才换下一个变体（网络层失败换参数没意义）。
  const variants = [
    { tag: '', params: { channel: 'no', codec_type: '8', logo_type: 'unwatermarked' } },
    { tag: '+lr', params: { channel: 'no', codec_type: '8', logo_type: 'unwatermarked', lr: 'video_gen_no_watermark' } },
  ];
  const stacks: [string, Fetcher, number][] = [];
  if (getElectronNet()) {
    stacks.push(['net.fetch', (u, s) => fetchViaElectronNet(u, ses, s), FALLBACK_API_TIMEOUT_MS]);
  }
  stacks.push([
    'node.fetch',
    (u, s) => fetch(u, { method: 'GET', signal: s, headers: { accept: 'application/json,text/plain,*/*' } }),
    NODE_FETCH_TIMEOUT_MS,
  ]);
  const errors: string[] = [];
  for (const variant of variants) {
    const url = replaceQueryParams(fallbackApi, variant.params);
    for (const [label, fetcher, budget] of stacks) {
      const result = await attemptFallbackFetch(label + variant.tag, fetcher, url, source, budget);
      if (result.url) return result;
      errors.push(result.error ?? '');
      if (result.hardStop) break; // 服务端已正常应答，只是解析不出直链 → 换网络栈无意义
    }
    const lastError = errors[errors.length - 1] || '';
    if (!/无 main_url/.test(lastError)) break; // 只有「应答正常但缺 main_url」才值得换参数变体
  }
  const error = errors.join(' ;; ');
  console.warn(`[dola-media] fallback_api 取直链失败: host=${hostOf(fallbackApi)} — ${error}`);
  return { url: '', error };
}

async function extractUnwatermarkedItems(
  json: unknown,
  rawBody: string,
  source: string,
  ses: Session | null = null,
): Promise<MediaItem[]> {
  const result: MediaItem[] = [];
  const seen = new Set<string>();
  for (const url of findImageOriRawUrls(json)) addItemTo(result, seen, 'image', url);
  const fallbackApis = findFallbackApis(json, rawBody, source).slice(0, MAX_FALLBACK_API_COUNT);
  const videoResults = await Promise.all(
    fallbackApis.map(async (fallbackApi) => ({
      fallbackApi,
      ...(await getUnwatermarkedVideoUrlFromFallbackApi(fallbackApi, source, ses)),
    })),
  );
  for (const video of videoResults) {
    if (video.url) {
      console.log(`[dola-media] ✅ 解析到无水印视频（stack=${video.stack || '-'}, host=${hostOf(video.url)}）`);
      addItemTo(result, seen, 'video', video.url, video.fallbackApi);
    }
  }
  // ── 诊断：命中 /im/chain/single 但 0 个无水印视频项 ──
  // 把响应「形状」落到日志 + ~/dola-media-sample.json，便于精准定位豆包改版。
  // 注意：绝不回退抓 main_url/play_url 等带水印播放直链（那会破坏"无水印"的核心承诺）。
  const hasVideoShape =
    fallbackApis.length > 0 || findValuesByKey(json, 'video_info').length > 0 || findValuesByKey(json, 'video_list').length > 0;
  if (hasVideoShape) {
    writeSampleReport(json, rawBody, source, fallbackApis, videoResults);
  }
  if (result.length === 0 && json) {
    console.warn(
      '[dola-media] ⚠️ /im/chain/single 命中但提取到 0 个无水印媒体项。诊断:',
      JSON.stringify({
        source,
        topKeys: Array.isArray(json) ? ['<array>'] : Object.keys(json).slice(0, 24),
        fallbackApiKeysFound: FALLBACK_API_KEYS.filter((k) => findValuesByKey(json, k).length > 0),
        fallbackApiScanCount: fallbackApis.length,
        bodyLen: rawBody ? rawBody.length : 0,
        note: fallbackApis.length ? '有候选直链但第二跳失败，详见上面的失败原因' : '响应内未发现候选直链字段',
      }),
    );
  }
  return result;
}

function addItemTo(items: MediaItem[], seen: Set<string>, type: string, url: unknown, fallbackApi = ''): void {
  if (!isHttpUrl(url)) return;
  const identity = mediaIdentityKey(type, String(url), fallbackApi);
  if (seen.has(identity)) return;
  seen.add(identity);
  items.push({ type, url: String(url), ...(fallbackApi ? { fallbackApi } : {}) });
}

// ───────────────────────── CDP 拦截 ─────────────────────────
function emit(): void {
  const win = mainWindowGetter && mainWindowGetter();
  if (win && !win.isDestroyed()) {
    win.webContents.send('dola-media-update', { items: latestItems.slice() });
  }
}

/** CDP 命令的客户端（`webContents.debugger`） */
type CdpDebugger = WebContents['debugger'];

/** `Fetch.requestPaused` 的事件参数（electron 给的是 `any` ⇒ 就地收窄成这个形状） */
interface FetchPausedParams {
  requestId?: string;
  request?: { url?: string; method?: string };
  responseStatusCode?: number;
  responseStatusText?: string;
  responseHeaders?: HeaderEntry[];
}

/** CDP 的响应头条目 */
interface HeaderEntry {
  name: string;
  value: string;
}

/** `Fetch.getResponseBody` 的回执 */
interface GetResponseBodyResult {
  base64Encoded: boolean;
  body: string;
}

function continueRequest(dbg: CdpDebugger | null, requestId: string | undefined): Promise<unknown> {
  if (!dbg) return Promise.resolve();
  // ★ TD-16-37：continueRequest 失败会让被拦截的请求**一直挂着**（页面卡住）⇒ 必须留痕
  return dbg.sendCommand('Fetch.continueRequest', { requestId }).catch((e: unknown) => {
    console.warn('[dola-media] Fetch.continueRequest 失败（该请求会一直挂起）:', errText(e));
  });
}

async function onRequestPaused(
  dbg: CdpDebugger,
  params: FetchPausedParams | null | undefined,
  wcId: number | null = null,
  ses: Session | null = null,
): Promise<unknown> {
  try {
    if (!params || typeof params !== 'object') return;
    const requestId = params.requestId;
    const url = (params.request && params.request.url) || '';
    // 仅处理响应阶段（responseStatusCode 存在表示已到达 Response 阶段）
    if (!params.responseStatusCode) return continueRequest(dbg, requestId);

    // 按 host 判定来源（dola / doubao），两者共用同一套路径前缀
    const source = getSourceFromUrl(url);
    if (!source) return continueRequest(dbg, requestId);
    // 诊断日志：仅对「已知三类目标」或「疑似 API 请求」打日志。
    // 出现「命中请求」即说明 CDP 拦截已生效；若怀疑真实接口路径不同，可据此看到豆包实际请求。
    const lower = url.toLowerCase();
    const isKnownPath =
      isSourcePathUrl(url, source, PATH_CHAIN_SINGLE) ||
      isSourcePathUrl(url, source, PATH_SKILL_PACK) ||
      isSourcePathUrl(url, source, PATH_ACTION_BAR);
    const isDiagApi = /(chain|skill|action_bar|api|chat|im\/|generate|video|image|media|completion|pack|tool|agent|message|query|v1\/)/.test(
      lower,
    );
    if (isKnownPath || isDiagApi) {
      console.log(`[dola-media] 命中请求 [${source}] ${params.request && params.request.method} ${url}`);
    }

    // ② 30s/音频参考选项注入：skill/pack 整体 fulfill 成内置 skill-pack（按来源选 dola / doubao 版）
    if (isSourcePathUrl(url, source, PATH_SKILL_PACK)) {
      return fulfillSkillPack(dbg, requestId, source === 'doubao' ? DOUBAO_SKILL_PACK_BODY : DOLA_SKILL_PACK_BODY);
    }

    // ③ action_bar 时长改写：读取真实响应 → 注入 15s 项 → fulfill 改写（两源共用一套补丁逻辑）
    if (isSourcePathUrl(url, source, PATH_ACTION_BAR)) {
      return rewriteActionBarConfigResponse(dbg, params);
    }

    // ① 无水印媒体抽取（仅观察后放行）
    if (!isSourcePathUrl(url, source, PATH_CHAIN_SINGLE)) {
      return continueRequest(dbg, requestId);
    }
    // 先读 body（只有在暂停态才读得到），随后「立刻放行」：
    // 第二跳取直链可能耗时数秒，绝不能让它卡住页面的聊天流式响应。
    let body: string | null = null;
    try {
      const resp = (await dbg.sendCommand('Fetch.getResponseBody', { requestId })) as GetResponseBodyResult;
      body = resp.base64Encoded ? fromBase64Utf8(resp.body) : resp.body;
    } catch (err) {
      console.warn('[dola-media] 读取 chain/single 响应体失败:', errText(err));
    }
    await continueRequest(dbg, requestId);
    if (body == null) return;
    let json: unknown = null;
    try {
      json = JSON.parse(body) as unknown;
    } catch (err) {
      console.warn('[dola-media] chain parse failed:', errText(err));
      return;
    }
    // 放行后再异步抽取（不阻塞 CDP 消息循环）
    return Promise.resolve()
      .then(() => extractUnwatermarkedItems(json, body ?? '', source, ses))
      .then((items) => {
        if (!items.length) return;
        // 合并进累积缓冲（去重由 addItem 内部 seenKeys 保证）
        items.forEach((it) => addItem(it.type, it.url, it.fallbackApi || '', wcId));
        emit();
      })
      .catch((err: unknown) => console.warn('[dola-media] 抽取无水印媒体失败:', errText(err)));
  } catch (err) {
    // 任何意外异常都确保放行该请求，绝不使其悬挂（悬挂会导致页面卡死）
    console.warn('[dola-media] onRequestPaused 异常（已放行请求）:', errText(err));
    return continueRequest(dbg, params?.requestId);
  }
}

function fromBase64Utf8(base64Text: unknown): string {
  const normalized = String(base64Text || '').replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(normalized)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch {
    return atob(normalized);
  }
}

// ───────────────────────── CDP 注入辅助（30s/音频参考选项注入） ─────────────────────────
function toBase64Utf8(text: unknown): string {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function corsHeaders(): HeaderEntry[] {
  return [
    { name: 'access-control-allow-origin', value: '*' },
    { name: 'access-control-allow-credentials', value: 'true' },
    { name: 'access-control-allow-methods', value: 'GET, POST, OPTIONS' },
    { name: 'access-control-allow-headers', value: '*' },
  ];
}

function responseHeadersForTextBody(headers: HeaderEntry[], body: string): HeaderEntry[] {
  const contentLength = String(new TextEncoder().encode(body).length);
  const nextHeaders: HeaderEntry[] = [];
  let hasContentType = false;
  let hasContentLength = false;
  for (const header of headers) {
    const name = header.name || '';
    const lowerName = name.toLowerCase();
    if (lowerName === 'content-encoding') continue; // 改写 body 后原编码失效，丢弃
    if (lowerName === 'content-type') {
      hasContentType = true;
      nextHeaders.push({ name, value: 'application/json; charset=utf-8' });
      continue;
    }
    if (lowerName === 'content-length') {
      hasContentLength = true;
      nextHeaders.push({ name, value: contentLength });
      continue;
    }
    nextHeaders.push(header);
  }
  if (!hasContentType) nextHeaders.push({ name: 'content-type', value: 'application/json; charset=utf-8' });
  if (!hasContentLength) nextHeaders.push({ name: 'content-length', value: contentLength });
  return nextHeaders;
}

// action_bar 时长选择器补丁：在「时长」选项的 option_list 中注入 15s 项（移植自插件 patchDurationSelector）
function patchActionBarDuration(body: string): string {
  try {
    const json = JSON.parse(body) as unknown;
    const changed = patchNestedJsonStrings(json);
    return changed ? JSON.stringify(json) : body;
  } catch (error) {
    console.warn('[dola-media] patch action bar duration failed:', errText(error));
    return body;
  }
}

function patchNestedJsonStrings(value: unknown, seen: Set<object> = new Set()): boolean {
  if (value == null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = patchNestedJsonStrings(item, seen) || changed;
    return changed;
  }
  const rec = value as JsonRecord;
  for (const key of Object.keys(rec)) {
    const child = rec[key];
    if (typeof child === 'string') {
      const patchedString = patchJsonStringDuration(child);
      if (patchedString !== child) {
        rec[key] = patchedString;
        changed = true;
      }
    } else {
      changed = patchNestedJsonStrings(child, seen) || changed;
    }
  }
  return changed;
}

function patchJsonStringDuration(text: string): string {
  if (!text || (!text.includes('时长') && !text.includes('鏃堕暱'))) return text;
  try {
    const json = JSON.parse(text) as unknown;
    const changed = patchDurationSelector(json);
    return changed ? JSON.stringify(json) : text;
  } catch (e) {
    // ⚠️ 留痕（TD-13-25）：原样透传 = 该响应的时长选项**没被注入**（用户看不到注入项）
    console.warn('[dola-media] action_bar 时长注入失败（原样透传该响应）:', errText(e));
    return text;
  }
}

function patchDurationSelector(value: unknown, seen: Set<object> = new Set()): boolean {
  if (value == null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = patchDurationSelector(item, seen) || changed;
    return changed;
  }
  const rec = value as JsonRecord;
  const optionList = rec['option_list'];
  if ((rec['label'] === '时长' || rec['label'] === '鏃堕暱') && Array.isArray(optionList)) {
    const has15s = optionList.some((option) => asRecord(option)['option_key'] === '15');
    if (!has15s) {
      const tenSecondIndex = optionList.findIndex((option) => asRecord(option)['option_key'] === '10');
      const insertIndex = tenSecondIndex >= 0 ? tenSecondIndex + 1 : optionList.length;
      optionList.splice(insertIndex, 0, createFifteenSecondOption(optionList));
      changed = true;
    }
  }
  for (const key of Object.keys(rec)) {
    const child = rec[key];
    if (typeof child === 'string') {
      const patchedString = patchJsonStringDuration(child);
      if (patchedString !== child) {
        rec[key] = patchedString;
        changed = true;
      }
    } else {
      changed = patchDurationSelector(child, seen) || changed;
    }
  }
  return changed;
}

/** 注入的 15s 时长项（形状移植自插件） */
interface FifteenSecondOption {
  id: number;
  display_text: string;
  message_text: string;
  option_key: string;
}

function createFifteenSecondOption(optionList: unknown[]): FifteenSecondOption {
  const maxId = optionList.reduce<number>((maxValue, option) => {
    const id = Number(asRecord(option)['id']);
    return Number.isFinite(id) ? Math.max(maxValue, id) : maxValue;
  }, 0);
  return {
    id: maxId + 1,
    display_text: '15s',
    message_text: '',
    option_key: '15',
  };
}

// ───────────────────────── CDP 注入动作 ─────────────────────────
async function fulfillRequest(
  dbg: CdpDebugger | null,
  requestId: string | undefined,
  body: string,
  responseCode: number,
  responseHeaders: HeaderEntry[],
  responsePhrase = 'OK',
): Promise<void> {
  if (!dbg) return;
  try {
    await dbg.sendCommand('Fetch.fulfillRequest', {
      requestId,
      responseCode,
      responsePhrase,
      responseHeaders,
      body: toBase64Utf8(body),
    });
  } catch (err) {
    console.warn('[dola-media] fulfillRequest 失败:', errText(err));
    await continueRequest(dbg, requestId);
  }
}

// ② skill/pack：用内置 skill-pack 整体 fulfill（注入 30s 时长/音频参考等生成选项）
async function fulfillSkillPack(dbg: CdpDebugger, requestId: string | undefined, body: string): Promise<void> {
  await fulfillRequest(dbg, requestId, body, 200, responseHeadersForTextBody(corsHeaders(), body));
}

// ③ action_bar：读取真实响应 → 注入 15s 时长项 → fulfill 改写后的响应
async function rewriteActionBarConfigResponse(dbg: CdpDebugger, params: FetchPausedParams | null | undefined): Promise<void> {
  try {
    // 源写 `if (!params || typeof params !== 'object')`：形参已是对象类型 ⇒ 只留空守卫
    // （此处 params 必为空 ⇒ 源那句 `params?.requestId` 的取值恒为 undefined）
    if (!params) {
      await continueRequest(dbg, undefined);
      return;
    }
    const requestId = params.requestId;
    const resp = (await dbg.sendCommand('Fetch.getResponseBody', { requestId })) as GetResponseBodyResult;
    const originalBody = resp.base64Encoded ? fromBase64Utf8(resp.body) : resp.body;
    const patchedBody = patchActionBarDuration(originalBody);
    const headers = responseHeadersForTextBody(params.responseHeaders || [], patchedBody);
    const code = params.responseStatusCode || 200;
    const phrase = params.responseStatusText || 'OK';
    await fulfillRequest(dbg, requestId, patchedBody, code, headers, phrase);
  } catch (err) {
    console.warn('[dola-media] action_bar rewrite 失败:', errText(err));
    await continueRequest(dbg, params?.requestId);
  }
}

// ───────────────────────── 对外 API ─────────────────────────
// 原插件用 chrome.debugger.attach({tabId}) 按「标签页（webview）」拦截；Electron 等价物是
// webContents.debugger（每个 webview 一个 debugger），而非 session.debugger（按分区，webview
// 流量上 Fetch 常常不触发）。这里在任意 <webview> 真实挂载时，直接对其 webContents 挂 debugger，
// 彻底绕开 partition 命名（persist:doubao_<id> 之类）与 session.debugger 不触发两个问题。
const attachedGuests = new WeakSet<WebContents>();

function safeGetHost(wc: WebContents): string {
  try {
    // ★ 归一化收口到层 2（`normalizeHost`）—— 原先这里自带一套（小写 + 去尾点、**不去 `www.`**），
    //   是「host 归一化」在 electron 侧的第二个中心。
    return normalizeHost(hostOfUrl(wc.getURL() || ''));
  } catch (e) {
    // ⚠️ 留痕（TD-13-25）：返回 '' 与「非目标域名」同形 ⇒ 静默不挂 debugger（无水印面板整个失效）。
    //    调用点已先判过「guest 活着且有 URL」⇒ 这里抛出来就是异常，不能吞。
    console.warn('[dola-media] safeGetHost 取 guest URL 失败（按未知 host 处理）:', errText(e));
    return '';
  }
}

/** 媒体来源推断的默认源（原实现写死 `'doubao'`）—— 具名以免散落 */
const DEFAULT_MEDIA_SOURCE = 'doubao';
/** 「byteintl」系域名归 dola（原实现在 `main.js` 内联的提示词）—— 具名以免散落 */
const BYTEINTL_HINT = 'byteintl';

// 取该 webview 的会话：第二跳取直链时用 net.fetch + 该 session，保证与页面同一条网络路径
// （同代理、同 DNS、同证书校验），并复用其 cookie jar。
function safeGetSession(wc: WebContents | null): Session | null {
  try {
    return wc ? wc.session : null;
  } catch (e) {
    // ⚠️ 留痕（TD-13-25）：返回 null ⇒ 第二跳取直链退回 Node 网络栈（不同代理 / cookie jar）
    console.warn('[dola-media] safeGetSession 取会话失败（第二跳将退回 Node 网络栈）:', errText(e));
    return null;
  }
}

/**
 * 层 3 · **媒体 URL → 来源推断**（原先内联在 `main.js` 的 `findWebviewSessionForUrl` 里，3 遍）
 *
 * 判据（**保留原语义**）：目标 URL 自身是 dola ⇒ `dola`；是豆包 ⇒ `doubao`；
 *   否则（多为 CDN 域名，如 `tosvbytedou.com` / `douyinpic.com`）看 host 是否含 `byteintl`
 *   ⇒ `dola`；其余 ⇒ `doubao`（默认源）。
 * ⚠️ 原实现是 `hostname.includes('dola') || hostname.includes('byteintl')` 的**子串**判定
 *   （`notdola.com` 会被误判成 dola）⇒ 本实现改为**按层 1 主域的子域规则**判定，只保留
 *   `byteintl` 这一条明确提示 —— **同一策略的更严实现**，不是新策略。
 * ⚠️ 为什么它不是"通用工具"而必须住这里：它答的是**媒体**的来源（CDN 域名归谁下载），
 *   属 dola-media 这个领域的策略；`main.js` 只是它的**消费者**。
 */
function mediaSourceOfUrl(rawUrl: unknown): string {
  const host = normalizeHost(hostOfUrl(rawUrl));
  if (!host) return DEFAULT_MEDIA_SOURCE;
  if (isHostOf(host, 'dola')) return 'dola';
  if (isHostOf(host, 'doubao')) return 'doubao';
  return host.includes(BYTEINTL_HINT) ? 'dola' : DEFAULT_MEDIA_SOURCE;
}

// 是否值得对该 guest 挂 CDP 拦截：只认豆包 / dola 域名。
// ⚠️ 这条过滤是必要的：早期实现在 did-attach-webview 时「无差别」给每个 webview
//   （含 Lovart、Tapnow 以及登录弹窗的临时 webview）挂 debugger，而这些 guest 会在
//   弹窗关闭时被销毁 —— 带 debugger 的 guest 被销毁会让浏览器进程 CHECK 失败
//   （表现为 EXC_BREAKPOINT / SIGTRAP 闪退，崩溃前日志可见 "detached: target closed"）。
// ★ **按"源"声明，不再抄域名**（2026-10-14 收口）：原先这里是与 `SOURCE_HOSTS` 并排的
//   `['doubao.com','dola.com']`（**同一串字面量第二遍**），且自带一套 `=== h || endsWith('.'+h)`
//   子域规则（第三份）。现在只声明**哪些源要挂**；域名与子域规则都取自层 1／2。
//   ⇒ 要改"挂谁"，改这一行；要改"域名是什么"，改 `site-hosts.ts`。
const ATTACH_SOURCES = ['dola', 'doubao'];
function shouldAttach(guest: WebContents | null): boolean {
  try {
    // ⚠️ 曾经的坑：`if (!guest || guest.isDestroyed || guest.isDestroyed())` 里
    //   `guest.isDestroyed` 是函数引用、恒为真 → 条件永远成立 → shouldAttach 永远 false
    //   → 豆包/dola 的 CDP 拦截被整个关掉（无水印资源面板失效）。必须「调用」它来判断。
    const destroyed = (wc: WebContents): boolean => {
      try {
        return wc.isDestroyed();
      } catch {
        return true;
      }
    };
    if (!guest || destroyed(guest)) return false;
    const u = guest.getURL() || '';
    if (!u || u === 'about:blank') return false; // 尚未导航：等 did-navigate 再判
    const host = safeGetHost(guest);
    // 子域规则（`host === base || host.endsWith('.' + base)`）的唯一实现在层 2
    return ATTACH_SOURCES.some((source) => isHostOf(host, source));
  } catch (e) {
    // ⚠️ 留痕（TD-13-25）：这里吞掉 ⇒ 该 webview **不挂 debugger**（无水印面板静默失效）
    console.warn('[dola-media] 目标域名判定失败（按「不挂 debugger」处理）:', errText(e));
    return false;
  }
}

/**
 * 层 3 · **跨文件契约的门面**（2026-10-14 收口）：某个 guest 就绪 ⇒ 该挂就挂
 *
 * ★ **为什么要门面**：跨文件调用的名字此前是**内部实现名**（`attachGuestDebugger`）
 *   ⇒ 内部**改名 / 拆分 / 重组**会牵动 `main.js`；漏改一处就断（表现为 IPC 每次都抛、
 *   被 handler 的 catch 收成一条 warn —— 真发生过）。收成门面后，跨文件只认**这一个意图**
 *   （"这个 guest 就绪了"）⇒ 内部实现怎么改都不牵动 `main.js`。
 * ⚠️ **收益的边界（别读大了）**：它只覆盖「内部改名 / 重组」；**新增对外能力仍要动 `module.exports`**
 *   —— CJS 的静态导出面就是一份手写列表，无法更小。（另一条路是让 `init` **返回 api 对象**，
 *   但那会让每个调用点都得 `dolaMedia?.xxx` ⇒ **引入 null 兜底**，不采用。）
 * ⚠️ 「什么时候该挂」的判据**不在调用方**：由内部 `shouldAttach`（按 `ATTACH_SOURCES` 的源声明）决定。
 *   本门面与 `initDolaMediaCapture` 里 `did-attach-webview` 那条入口，调的是**同一个幂等实现**。
 */
function onGuestReady(guest: WebContents): void {
  attachGuestDebugger(guest);
}

/**
 * 对单个 webview（guest WebContents）挂载 CDP Fetch 拦截（**内部实现** · 幂等：`attachedGuests` 去重）
 *
 * ⚠️ 跨文件契约是上面的 `onGuestReady`（意图级门面）—— **本函数故意不进导出面**：
 *   它的名字只属于本文件，改它不必动 `main.ts`。
 * ⚠️ 过滤（`shouldAttach`）与幂等都在本函数内完成 ⇒ 调用方**不判、不兜**。
 */
function attachGuestDebugger(guest: WebContents): void {
  if (!guest) {
    // 源的消息原文（含「或无 debugger 属性」那半截）—— 类型上已不需要那半截判断，但文案照抄
    console.warn('[dola-media] attachGuestDebugger 跳过：guest 无效或无 debugger 属性');
    return;
  }
  if (attachedGuests.has(guest)) {
    console.log('[dola-media] attachGuestDebugger 跳过：该 guest 已挂载（幂等）');
    return;
  }
  // 非豆包 / dola 的页面（Lovart、Tapnow、登录弹窗 about:blank 等）一律不挂：
  // 既省开销，也避免 guest 被销毁时带 debugger 触发浏览器进程崩溃。
  if (!shouldAttach(guest)) {
    try {
      console.log(`[dola-media] attachGuestDebugger 跳过：非目标域名 url=${guest.getURL() || '(空)'}, id=${guest.id}`);
    } catch {
      /* ★ TD-16-37：这行**就是**日志 ⇒ 失败只能吞（`getURL()` 在销毁后可能抛） */
    }
    return;
  }
  const dbg = guest.debugger;
  const VER = '1.3';
  // ⚠️ 关键修复：Electron 的 webContents.debugger.attach() 是「同步、无回调」API
  // （失败直接抛异常，成功不回调）。之前误用 dbg.attach(VER, cb)，导致 cb 永不触发、
  // Fetch.enable 永远不发、拦截从不生效——这正是「抓不到视频」的根因。
  try {
    dbg.attach(VER);
  } catch (err) {
    if (/already attached/i.test(errText(err))) {
      // 已挂载：仍继续注册，视为就绪
    } else {
      console.warn('[dola-media] guest debugger attach 失败:', errText(err));
      return;
    }
  }
  // attach 同步成功后，立即注册事件与 Fetch.enable（不依赖任何回调）
  attachedGuests.add(guest);
  try {
    console.log(`[dola-media] attachGuestDebugger 开始：url=${guest.getURL() || '(空)'}, id=${guest.id}`);
  } catch {
    /* getURL 可能抛 */
  }
  // dbg 闭包透传：同一请求的处理链都回到发起它的那个 webview debugger
  dbg.on('message', (_event, method, params) => {
    if (method === 'Fetch.requestPaused' && params) {
      // 不 await：避免阻塞 CDP 消息循环；异常由 onRequestPaused 内部兜底吞掉
      // `params` 由 electron 标注为 `any` ⇒ 就地收窄成 FetchPausedParams
      Promise.resolve()
        .then(() => onRequestPaused(dbg, params as FetchPausedParams, guest && guest.id != null ? guest.id : null, safeGetSession(guest)))
        .catch((err: unknown) => console.warn('[dola-media] onRequestPaused 异常（已吞掉，不影响主进程）:', errText(err)));
    }
  });
  dbg.on('detach', (_event, reason) => {
    console.log(`[dola-media] guest debugger detached：id=${guest.id}, reason=${reason || '(unknown)'}`);
    attachedGuests.delete(guest);
  });
  // guest 销毁前主动 detach 并清理引用：带 debugger 的 webContents 被销毁会让
  // 浏览器进程 CHECK 失败（EXC_BREAKPOINT / SIGTRAP 闪退），登录弹窗关闭时必现。
  const cleanupGuest = (): void => {
    attachedGuests.delete(guest);
    // ★ TD-16-37：detach 失败**留痕** —— 带 debugger 的 guest 被销毁会让浏览器进程 CHECK 失败（闪退）
    try {
      if (dbg.isAttached && dbg.isAttached()) dbg.detach();
    } catch (e) {
      console.warn('[dola-media] detach 失败（guest 销毁时可能闪退）:', errText(e));
    }
  };
  // ★ TD-16-37：注册失败 = 清理**永远不会跑** ⇒ 上面那条闪退风险直接暴露 ⇒ 必须留痕
  try {
    guest.once('destroyed', cleanupGuest);
  } catch (e) {
    console.warn('[dola-media] 注册 destroyed 清理失败:', errText(e));
  }
  // 发送任何 CDP 命令前确认 guest 还活着（销毁后 sendCommand 会直接崩浏览器进程）
  const isAlive = (): boolean => {
    try {
      return !guest.isDestroyed();
    } catch {
      return false;
    }
  };
  const patterns: { urlPattern: string; requestStage: string }[] = [];
  for (const source of Object.keys(SOURCE_HOSTS)) {
    // 三类已知目标（按源匹配）
    patterns.push({ urlPattern: `*${SOURCE_HOSTS[source]}${PATH_CHAIN_SINGLE}*`, requestStage: 'Response' });
    patterns.push({ urlPattern: `*${SOURCE_HOSTS[source]}${PATH_SKILL_PACK}*`, requestStage: 'Response' });
    patterns.push({ urlPattern: `*${SOURCE_HOSTS[source]}${PATH_ACTION_BAR}*`, requestStage: 'Response' });
  }
  if (!isAlive()) return;
  dbg
    .sendCommand('Fetch.enable', { patterns })
    .then(() =>
      console.log(
        `[dola-media] guest debugger Fetch.enable OK（id=${guest.id}, host=${safeGetHost(guest)}）— 开始监听 dola/doubao 的 /im/chain/single、/skill/pack、/action_bar`,
      ),
    )
    .catch((e: unknown) => console.warn('[dola-media] guest Fetch.enable 失败:', errText(e)));
}

function initDolaMediaCapture({ getMainWindow }: DolaMediaDeps): void {
  mainWindowGetter = getMainWindow ?? null;
  const win = getMainWindow && getMainWindow();
  if (!win || !win.webContents) {
    console.warn('[dola-media] 主窗口尚未就绪，无法注册 webview 拦截');
    return;
  }
  // 仅豆包 / dola 的 webview 才挂 debugger：did-attach 时 URL 通常还是 about:blank，
  // 这里补一条导航后再判的钩子；渲染进程在 dom-ready 时也会显式调用一次（主路径）。
  win.webContents.on('did-attach-webview', (_event, guest) => {
    attachGuestDebugger(guest);
    try {
      const tryLater = (): void => {
        if (!attachedGuests.has(guest)) attachGuestDebugger(guest);
      };
      guest.once('did-navigate', tryLater);
      guest.once('did-navigate-in-page', tryLater);
    } catch (e) {
      console.warn('[dola-media] 注册导航重试监听失败（时序竞态下可能漏挂 debugger）:', errText(e));
    }
  });
  /*
   * ⚠️ 原处有一条「延迟 1.5s 遍历 `getAllWebContents()` 补挂」的兜底 —— **已删（2026-10-14，弯路留痕）**：
   *
   *   ① **它从来没生效**：原文写的是 `win.webContents.getAllWebContents()`，而它是 `webContents`
   *      **模块的 static 方法**（`electron.d.ts:16276` 的 `static getAllWebContents(): WebContents[]`）
   *      ⇒ 挂到**实例**上调用必抛 `TypeError`。本仓别处的正确写法：`main.js:1996` / `:2007`
   *      （`webContents.getAllWebContents()`）—— 同一用法两份、一对一错，未收口。
   *   ② **它抛错后静默**：外面那层 `catch (_)` 的体内**只有一句注释**（「诊断增强：挂调试器失败不影响主流程」）、
   *      **零日志** ⇒ 这个 TypeError 连一行痕迹都没留下（「禁静默吞」形态①）。
   *   ③ **它要补的"竞态"不成立**：`initDolaMediaCapture` 紧跟 `createWindow()` 调用
   *      （`main.js:1128` / `:1130`），而 `<webview>` 要等渲染层加载后才 attach
   *      ⇒ 必然晚于本监听器注册，`did-attach-webview` 不会漏。
   *   ⇒ 结论：**不是修它，是删它** —— 修好只会让一个**不必要的**步骤开始运行（复杂度净增）。
   *     「谁该挂」的判据在 `shouldAttach`（按 host 白名单，本文件内），入口有两条且调的是
   *     **同一个幂等函数**（`attachedGuests` 去重）：这里的 `did-attach-webview`（**早**、
   *     URL 还是 about:blank ⇒ 下面 `did-navigate` 再试）与渲染层 `dom-ready` 那条 IPC
   *     （**本文件** `handle('attach-dola-debugger')` **自注册**，**准**）—— 两条互补，都留。
   */
  console.log(
    '[dola-media] 已注册 did-attach-webview，将按 webview 动态挂载 CDP 拦截（修复分区名不匹配 + session.debugger 不触发问题）',
  );
}

// ───────────────────── 无水印资源：下载 / 设置（域内自注册 IPC） ─────────────────────
// ★ 为什么这些 handler 住这里（TD-13-27）：它们的每条判据都是**媒体域策略** ——
//   源推断（本文件的 `mediaSourceOfUrl`）· 会话挑选（豆包／dola 的 webview）·
//   下载落点与自动命名 · 下载目录设置（`<userData>/settings.json`）。
//   ⇒ 宿主壳只说「初始化这个域」（`initDolaMedia`），不再知情域内细节。

/** 宿主注入面（主窗口 getter）—— `| undefined` 是显式允许的（`initDolaMedia` 会原样透传） */
interface DolaMediaDeps {
  getMainWindow?: MainWindowGetter | undefined;
}

let settingsJsonPath = '';

function readSettings(): JsonRecord {
  try {
    if (fs.existsSync(settingsJsonPath)) {
      const obj = asRecord(JSON.parse(fs.readFileSync(settingsJsonPath, 'utf8')) as unknown);
      if (obj && typeof obj === 'object') return obj;
    }
  } catch (e) {
    console.warn('[dola-media] 读取 settings.json 失败，使用默认：', errText(e));
  }
  return {};
}

function writeSettings(obj: JsonRecord): boolean {
  try {
    const dir = path.dirname(settingsJsonPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsJsonPath, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.warn('[dola-media] 写入 settings.json 失败：', errText(e));
    return false;
  }
}

/** 默认下载目录：系统 Downloads；用户设置过则用 settings.json 里的 downloadPath */
function getEffectiveDownloadDir(): string {
  const s = readSettings();
  if (s && typeof s['downloadPath'] === 'string' && s['downloadPath'].trim()) {
    const trimmed = s['downloadPath'].trim();
    try {
      if (!fs.existsSync(trimmed)) fs.mkdirSync(trimmed, { recursive: true });
      if (fs.statSync(trimmed).isDirectory()) return trimmed;
    } catch {
      /* 落到默认 */
    }
  }
  const def = app.getPath('downloads');
  // ★ TD-16-37：默认下载目录建不出来**留痕**（否则后续下载失败时无从判断是"目录不存在"）
  try {
    if (!fs.existsSync(def)) fs.mkdirSync(def, { recursive: true });
  } catch (e) {
    console.warn('[download] 默认下载目录创建失败:', errText(e));
  }
  return def;
}

/** 自动编号的产物 */
interface AutoFilePath {
  name: string;
  fullPath: string;
  nextCounter: number;
}

/**
 * 自动编号命名：序号在 session 内单调递增；目标名已被旧文件占用就继续往后找。
 */
function nextAutoFilePath(dir: string, typePrefix: string, ext: string, sessionCounter: number): AutoFilePath {
  let n = (sessionCounter || 0) + 1;
  // 防止极端情况下无限循环（>1 万）
  for (let i = 0; i < 100000; i++) {
    const name = `${typePrefix}_${String(n).padStart(2, '0')}${ext}`;
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) return { name, fullPath: full, nextCounter: n };
    n++;
  }
  throw new Error('自动命名空间已用尽（>100000），请清理下载目录');
}

// 会话级计数器落盘到 settings.json ⇒ 跨重启延续序号（否则重启后又从 01 开始、覆盖旧文件）
function getSessionCounter(): number {
  const s = readSettings();
  const counter = s['dolaMediaCounter'];
  return typeof counter === 'number' && Number.isInteger(counter) && counter >= 0 ? counter : 0;
}
function bumpSessionCounter(n: number): void {
  const s = readSettings();
  s['dolaMediaCounter'] = n;
  writeSettings(s);
}

/**
 * 找豆包／dola 的 guest webview 的 session（找不到 ⇒ `null`，**不编一个**）。
 *
 * 媒体 URL 是 CDN 域名（`tosvbytedou.com` / `douyinpic.com` 等）⇒ 不能按 hostname 匹配；
 * 改为找豆包／dola 的 webview，用其 session 下载即可继承 cookie / 认证。
 */
function findWebviewSessionForUrl(targetUrl: string): Session | null {
  try {
    const win = mainWindowGetter && mainWindowGetter();
    if (!win || win.isDestroyed()) return null;
    // ★ 来源推断**不在本函数**：`mediaSourceOfUrl`（层 3 —— 媒体 URL 归哪个源，是媒体域策略）
    const preferSource = mediaSourceOfUrl(targetUrl);
    const findSession = (match: (url: string) => boolean, label: string): Session | null => {
      for (const wc of webContents.getAllWebContents()) {
        if (wc === win.webContents) continue;
        try {
          const url = wc.getURL() || '';
          if (match(url)) {
            console.log(
              `[dola-media] ${label}找到 webview：host=${hostOfUrl(url)} id=${wc.id} partition=${(wc.session as Session & { partition?: string }).partition}`,
            );
            return wc.session;
          }
        } catch (e) {
          // ⚠️ 留痕（TD-13-25）：跳过这一条 = 可能漏掉真正持有目标会话的那个 webview
          console.warn('[dola-media] 枚举 webview 时 getURL 失败（跳过该条）:', errText(e));
        }
      }
      return null;
    };
    // ★ 判定取自层 1／2 —— 先把 URL 取成 host 再判（原先在**整条 URL**上做子串匹配，
    //   `https://evil.test/?u=doubao.com` 会被当成豆包页）
    const exact = findSession((url) => isHostOf(hostOfUrl(url), preferSource), '精确');
    if (exact) return exact;
    // 兜底：找不到精确来源时，尝试任意 doubao/dola webview
    const anyKnown = findSession((url) => isKnownHost(hostOfUrl(url)), '兜底');
    if (anyKnown) return anyKnown;
    console.warn(`[dola-media] 未找到任何 doubao/dola webview（preferSource=${preferSource}）`);
  } catch (err) {
    console.warn('[dola-media] findWebviewSessionForUrl 异常:', errText(err));
  }
  return null;
}

/** 下载回执 */
type DownloadResult = { ok: true; path: string; size: number } | { ok: false; error: string };

/** 用指定 session 下载文件（支持重定向跟随；`net.request({ session })` 继承 cookie） */
function downloadUrlWithSession(url: string, filePath: string, dlSession: Session | null): Promise<DownloadResult> {
  const ses = dlSession || sessionModule.defaultSession;
  // 会话的 partition 名只用于日志：electron.d.ts 未暴露 `partition` 字段（运行期存在）⇒ 就地标注
  console.log(
    `[dola-media] downloadUrlWithSession ses=${ses ? (ses as Session & { partition?: string }).partition || '(defaultSession)' : 'UNDEFINED'}`,
  );
  return new Promise((resolve) => {
    try {
      if (!ses) {
        resolve({ ok: false, error: 'session 不可用（null）' });
        return;
      }
      const request = net.request({ url, method: 'GET', session: ses });
      const chunks: Buffer[] = [];
      request.on('response', (response) => {
        // `headers` 是索引签名 ⇒ 方括号访问；`location` 的类型含 `string[]` ⇒ 只认字符串那种形态
        const location = response.headers['location'];
        if (response.statusCode >= 300 && response.statusCode < 400 && typeof location === 'string') {
          resolve(downloadUrlWithSession(location, filePath, ses));
          return;
        }
        if (response.statusCode !== 200) {
          resolve({ ok: false, error: 'http_' + response.statusCode });
          return;
        }
        response.on('data', (d: Buffer) => chunks.push(d));
        response.on('end', () => {
          try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, Buffer.concat(chunks));
            resolve({ ok: true, path: filePath, size: Buffer.concat(chunks).length });
          } catch (writeErr) {
            resolve({ ok: false, error: errText(writeErr) });
          }
        });
        response.on('error', (err: Error) => resolve({ ok: false, error: err.message || String(err) }));
      });
      request.on('error', (err: Error) => resolve({ ok: false, error: err.message || String(err) }));
      request.end();
    } catch (ex) {
      resolve({ ok: false, error: errText(ex) });
    }
  });
}

/** 注册本域 IPC（守卫在 `handle` 内统一施加） */
function registerDolaMediaIpc(): void {
  settingsJsonPath = path.join(app.getPath('userData'), 'settings.json');

  handle('dola-media-clear', async () => {
    clearDolaMediaItems();
    return { ok: true };
  });

  handle('get-download-settings', async () => {
    const s = readSettings();
    const eff = getEffectiveDownloadDir();
    return {
      ok: true,
      path: eff,
      configured: !!(s && typeof s['downloadPath'] === 'string' && s['downloadPath'].trim()),
      configuredPath: (s && s['downloadPath']) || '',
    };
  });

  handle('pick-download-path', async () => {
    const win = mainWindowGetter && mainWindowGetter();
    if (!win || win.isDestroyed()) return { ok: false, error: 'no_window' };
    const cur = getEffectiveDownloadDir();
    const res = await dialog.showOpenDialog(win, {
      title: '选择无水印资源下载目录',
      defaultPath: cur,
      buttonLabel: '设为下载目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const picked = res.filePaths[0];
    const s = readSettings();
    s['downloadPath'] = picked;
    writeSettings(s);
    console.log(`[dola-media] 已设置下载目录：${picked}`);
    return { ok: true, path: picked, configured: true };
  });

  // 下载走设置路径 + 自动命名（外部签名不变：url / mediaType）
  handle('dola-media-download', async (_e, url, mediaType) => {
    console.log(`[dola-media] 下载请求：type=${String(mediaType)} url=${url ? String(url).substring(0, 120) : '(空)'}`);
    if (!url) return { ok: false, error: 'missing_url' };
    const targetUrl = String(url);
    const isImage = mediaType === 'image';
    const ext = isImage ? '.png' : '.mp4';
    const typePrefix = isImage ? 'image' : 'video';
    const dir = getEffectiveDownloadDir();
    const curCounter = getSessionCounter();
    let filePath: string;
    let name: string;
    let nextC: number;
    try {
      const r = nextAutoFilePath(dir, typePrefix, ext, curCounter);
      filePath = r.fullPath;
      name = r.name;
      nextC = r.nextCounter;
    } catch (e) {
      return { ok: false, error: errText(e) };
    }
    bumpSessionCounter(nextC);
    console.log(`[dola-media] 下载目标路径：${filePath}（已用编号=${nextC}）`);
    const wvSession = findWebviewSessionForUrl(targetUrl);
    console.log(
      `[dola-media] 下载使用 session：${wvSession ? (wvSession as Session & { partition?: string }).partition : '(defaultSession - 无匹配 webview!)'}`,
    );
    const result = await downloadUrlWithSession(targetUrl, filePath, wvSession);
    console.log(`[dola-media] 下载结果：${JSON.stringify(result)}`);
    if (result && result.ok) {
      return { ...result, path: filePath, name, dir, configured: !dir.endsWith('Downloads') };
    }
    return result;
  });

  // 渲染进程 dom-ready 时按 webContentsId 挂 CDP Fetch 拦截（比 did-attach-webview 更准）
  handle('attach-dola-debugger', async (_e, webContentsId) => {
    const wc = webContents.fromId(Number(webContentsId));
    if (!wc || wc.isDestroyed()) return { ok: false, error: 'webview 已销毁或不存在' };
    const url = wc.getURL() || '';
    console.log(`[dola-media] attach-dola-debugger IPC 触发：wcId=${String(webContentsId)} url=${url}`);
    // ★ 只表达**意图**（"这个 guest 就绪了"）—— 挂不挂、怎么挂由本文件内部判
    onGuestReady(wc);
    return { ok: true, url };
  });
}

/**
 * ★ **域唯一门面**：宿主壳只说「初始化无水印媒体域」。
 *
 * 内部两件事：① 挂 CDP 拦截（`did-attach-webview` 早入口 + 导航后重试）；
 * ② 自注册本域 IPC（下载 / 清空 / 下载路径设置 / guest 就绪）。
 * ⚠️ 宿主壳**不再需要**域内任何别的名字 —— 会话查找 · 设置读写 · 下载策略全在本文件。
 */
function initDolaMedia({ getMainWindow }: DolaMediaDeps): void {
  initDolaMediaCapture({ getMainWindow });
  registerDolaMediaIpc();
}

function clearDolaMediaItems(): void {
  latestItems.length = 0;
  seenKeys.clear();
  emit();
}

// ★ 导出面**只列名字**（不放注释：注释会把"改导出面前先 grep 调用点"这类朴素解析搞成假阳）。
//   规则：**导出面 = `main.ts` 的可用面** —— 改这里之前先 `grep -n "dolaMedia\." electron/main.js`。
//   ★ `initDolaMedia` = 本仓新增的**域门面**：宿主壳只调它，不再知情域内细节。
//   ⚠️ **有意偏离源名** `initDolaMediaCapture`：它除挂 CDP 拦截外还自注册本域 IPC，
//      "Capture" 已不表意；`main.js` 的调用点同批改名。
export { initDolaMedia };
