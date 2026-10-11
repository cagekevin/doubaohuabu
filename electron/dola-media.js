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

const fs = require('fs');
const path = require('path');

// 各源（account type）对应的 host 与三类目标 URL
// dola / doubao 共用同一套路径前缀，仅 host 不同（移植自插件 service-worker.js 的双源定义）
const SOURCE_HOSTS = Object.freeze({
  dola: 'dola.com',
  doubao: 'doubao.com'
});
// 无水印媒体抽取时允许回源的 fallback_api 主机（防止抽错域）：
//   dola  → dola.com / byteintlapi.com
//   doubao → doubao.com / byteintlapi.com / snssdk.com（移植自插件 FALLBACK_API_ROOT_HOSTS）
const FALLBACK_API_ROOT_HOSTS = Object.freeze({
  dola: Object.freeze([SOURCE_HOSTS.dola, 'byteintlapi.com']),
  doubao: Object.freeze([SOURCE_HOSTS.doubao, 'byteintlapi.com', 'snssdk.com'])
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
  'logo_free_url'
];
// 注入用 skill-pack 响应体（移植自插件内置 *-skill-pack-response.json）：把生成选项喂给对应界面
function loadSkillPack(file, label) {
  try {
    return fs.readFileSync(path.join(__dirname, file), 'utf8');
  } catch (err) {
    console.warn(`[dola-media] 读取 ${file} 失败:`, err.message || err);
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
const DIAG_HOME = (() => {
  try { return require('os').homedir(); } catch { return __dirname; }
})();
const DIAG_SAMPLE_PATH = path.join(DIAG_HOME, 'dola-media-sample.json');
const DIAG_FALLBACK_URL_PATH = path.join(DIAG_HOME, 'dola-media-fallback-url.txt');
const QAAB_SALT_HEX =
  '4dd4c2e6b83162090e52b3c7a6733ba4' +
  '1cb2462b829ab58a196b39db57177524' +
  'f49baf7f08e8d68d26a72e37c1a95a2f' +
  '1f05a51892aef2949732b62a38aadd58';

// ───────────────────────── 模块级状态 ─────────────────────────
let mainWindowGetter = null;
const latestItems = []; // { type, url, fallbackApi? }
const seenKeys = new Set();

// ───────────────────────── 工具：源/URL 判定 ─────────────────────────
function getSourceFromUrl(rawUrl) {
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

function isSourcePathUrl(rawUrl, source, pathPrefix) {
  if (getSourceFromUrl(rawUrl) !== source) return false;
  try {
    const pathname = new URL(rawUrl).pathname;
    return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
  } catch {
    return false;
  }
}

function isHttpUrl(url) {
  if (typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url.trim());
}

// ───────────────────────── 工具：解码辅助 ─────────────────────────
function normalizeExtractedUrl(value) {
  return typeof value === 'string' ? decodeJsonEscapedFragment(value).trim() : '';
}

function decodeJsonEscapedFragment(value) {
  let text = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = JSON.parse(`"${text.replace(/"/g, '\\"')}"`);
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
}

function replaceQueryParams(url, params) {
  const parsedUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsedUrl.searchParams.set(key, value);
  }
  return parsedUrl.toString();
}

function getQueryParam(url, name) {
  try {
    return new URL(url).searchParams.get(name)?.trim() || '';
  } catch {
    return '';
  }
}

function findRegexUrls(text, pattern) {
  const urls = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    const url = normalizeExtractedUrl(match[1]);
    if (url) urls.push(url);
    match = pattern.exec(text);
  }
  return urls;
}

// ───────────────────────── JSON 遍历 ─────────────────────────
function parseJsonString(text) {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function walkJsonAndStrings(value, visitor, seen = new Set()) {
  if (value == null) return;
  if (typeof value === 'string') {
    const parsed = parseJsonString(value);
    if (parsed !== null) walkJsonAndStrings(parsed, visitor, seen);
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) walkJsonAndStrings(item, visitor, seen);
    return;
  }
  for (const key of Object.keys(value)) walkJsonAndStrings(value[key], visitor, seen);
}

function findValuesByKey(value, targetKey) {
  const values = [];
  walkJsonAndStrings(value, (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (Object.prototype.hasOwnProperty.call(node, targetKey)) values.push(node[targetKey]);
  });
  return values;
}

function findImageOriRawUrls(value) {
  const urls = [];
  walkJsonAndStrings(value, (node) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const image = node.image_ori_raw;
      if (image && typeof image === 'object' && isHttpUrl(image.url)) urls.push(image.url);
    }
  });
  return urls;
}

// ───────────────────────── 视频 token 解码 ─────────────────────────
function getVideoData(payload) {
  const videoInfo = payload?.video_info || payload?.data?.video_info || payload;
  const data = videoInfo?.data || videoInfo;
  return data && typeof data === 'object' ? data : {};
}

function pickMainUrlToken(data) {
  const videoList = data?.video_list;
  const entries = videoList && typeof videoList === 'object' && Object.keys(videoList).length
    ? Object.values(videoList)
    : [data];
  let best = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const token = entry.main_url || entry.play_url || '';
    if (typeof token !== 'string' || !token.trim()) continue;
    const score =
      Number(entry.bitrate || entry.real_bitrate || 0) +
      Number(entry.vwidth || entry.width || 0) * Number(entry.vheight || entry.height || 0);
    if (!best || score > best.score) best = { token: token.trim(), score };
  }
  return best ? best.token : '';
}

function findKeySeedDeep(value, depth = 0) {
  if (depth > 10 || value == null) return '';
  if (typeof value === 'string') {
    let match = value.match(/(?:^|[?&])key_seed=([^&"'<>\\\s]+)/i);
    if (match) return decodeURIComponent(match[1]);
    match = value.match(/["']key_seed["']\s*:\s*["']([^"']+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }
  if (typeof value !== 'object') return '';
  if (typeof value.key_seed === 'string' && value.key_seed.trim()) return value.key_seed.trim();
  for (const item of Object.values(value)) {
    const hit = findKeySeedDeep(item, depth + 1);
    if (hit) return hit;
  }
  return '';
}

function tryDecodeBase64Url(token) {
  const bytes = base64DecodeLoose(token);
  if (!bytes) return '';
  const text = asciiUrlFromBytes(bytes);
  return isHttpUrl(text) ? text : '';
}

function base64DecodeLoose(text) {
  const input = String(text || '').trim();
  const variants = [
    input,
    input.replace(/[$@#]/g, (char) => ({ $: '_', '@': '/', '#': '.' }[char])),
    input.replace(/[$@#]/g, (char) => ({ $: '+', '@': '/', '#': '=' }[char]))
  ];
  const seen = new Set();
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

function padBase64(text) {
  const pad = (4 - (text.length % 4)) % 4;
  return text + '='.repeat(pad);
}

function asciiUrlFromBytes(bytes) {
  if (!bytes || !bytes.length) return '';
  for (const byte of bytes) {
    if (byte !== 9 && byte !== 10 && byte !== 13 && (byte < 32 || byte > 126)) return '';
  }
  return new TextDecoder().decode(bytes);
}

async function decodeMainUrl(token, keySeed = '') {
  if (isHttpUrl(token)) return token;
  const plainUrl = tryDecodeBase64Url(token);
  if (plainUrl) return plainUrl;
  if (token.startsWith('qAAB') && keySeed) return await decodeQaabToken(token, keySeed);
  return '';
}

async function decodeQaabToken(token, keySeed) {
  const data = base64DecodeLoose(token);
  const seed = base64DecodeLoose(keySeed);
  if (!data || !seed) return '';
  const digest1 = await crypto.subtle.digest('SHA-512', seed.slice(0, 32));
  const salt = hexToBytes(QAAB_SALT_HEX);
  const digest2Input = concatBytes(new Uint8Array(digest1), salt);
  const digest2 = new Uint8Array(await crypto.subtle.digest('SHA-512', digest2Input));
  const key = digest2.slice(0, 16);
  const iv = digest2.slice(16, 32);
  const attempts = [];
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

async function decryptAesCbcUrl(payload, keyBytes, ivBytes) {
  if (!payload.length || payload.length % 16 !== 0) return '';
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['decrypt']);
    const plain = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, key, payload)
    );
    const direct = asciiUrlFromBytes(plain);
    if (isHttpUrl(direct)) return direct;
    const stripped = stripPkcs7(plain);
    const url = asciiUrlFromBytes(stripped);
    return isHttpUrl(url) ? url : '';
  } catch {
    return '';
  }
}

function stripPkcs7(bytes) {
  if (!bytes || !bytes.length) return new Uint8Array();
  const pad = bytes[bytes.length - 1];
  if (pad < 1 || pad > 16 || pad > bytes.length) return bytes;
  for (let index = bytes.length - pad; index < bytes.length; index += 1) {
    if (bytes[index] !== pad) return bytes;
  }
  return bytes.slice(0, bytes.length - pad);
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(first, second) {
  const bytes = new Uint8Array(first.length + second.length);
  bytes.set(first, 0);
  bytes.set(second, first.length);
  return bytes;
}

// ───────────────────────── 抽取主流程 ─────────────────────────
function mediaIdentityKey(type, rawUrl, fallbackApi = '') {
  const stableFallbackApi = String(fallbackApi || '').trim();
  return type === 'video' && stableFallbackApi
    ? `video:fallback_api:${stableFallbackApi}`
    : `${type}:url:${rawUrl}`;
}

// wcId：捕获该媒体的 webview（guest WebContents）id，用于渲染层把它精确归属到发起生成的账号。
// 没有它时「同账号多节点并发生成」只能靠全局 FIFO 猜测归属，会把视频连错节点。
function addItem(type, url, fallbackApi = '', wcId = null) {
  if (!isHttpUrl(url)) return;
  const identity = mediaIdentityKey(type, url, fallbackApi);
  if (seenKeys.has(identity)) return;
  seenKeys.add(identity);
  latestItems.push({
    type,
    url,
    ...(fallbackApi ? { fallbackApi } : {}),
    ...(wcId != null ? { wcId } : {})
  });
}

function isAllowedFallbackApiUrl(rawUrl, source) {
  const allowedHosts = FALLBACK_API_ROOT_HOSTS[source];
  if (!Array.isArray(allowedHosts)) return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return allowedHosts.some((rootHost) => hostname === rootHost || hostname.endsWith(`.${rootHost}`));
  } catch {
    return false;
  }
}

function addFallbackApi(apis, value, source) {
  if (typeof value !== 'string' || !value) return;
  const url = decodeJsonEscapedFragment(value);
  if (isAllowedFallbackApiUrl(url, source)) apis.add(url);
}

function findFallbackApis(json, rawBody, source) {
  const apis = new Set();
  // 1) 走「已解析 JSON 对象树」扫描（可靠路径）：豆包/dola 改字段名也能命中
  for (const key of FALLBACK_API_KEYS) {
    for (const value of findValuesByKey(json, key)) addFallbackApi(apis, value, source);
  }
  // 2) 走「原始 body 正则」扫描（兜底）：应对响应被二次 JSON 转义、字段藏在字符串里的情形
  // 注意：先对「每个 key」单独转义正则元字符，再用未转义的 | 拼接成 alternation；
  // 若对整个 join 后的字符串转义，会把分隔符 | 也转义成 \|，使 alternation 失效（曾踩坑）。
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyClass = FALLBACK_API_KEYS.map(escapeRe).join('|');
  const patterns = [
    new RegExp(`(?:${keyClass})\\\\":\\\\"([^"\\\\]+?)\\\\"`, 'g'),
    new RegExp(`"(?:${keyClass})"\\s*:\\s*"([^"]+)"`, 'g')
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(rawBody);
    while (match) {
      addFallbackApi(apis, decodeJsonEscapedFragment(match[1]), source);
      match = pattern.exec(rawBody);
    }
  }
  return Array.from(apis);
}

// ───────────────────────── 诊断：字段「形状」快照 ─────────────────────────
// 目的：豆包改版时，只看「有没有 fallback_api」不够，需要知道响应里到底有哪些字段。
// 这里只记录字段名 / 类型 / 长度 / 是否 URL（含 host、query 参数名），不记录签名明文。
function hostOf(rawUrl) {
  try { return new URL(rawUrl).hostname; } catch { return ''; }
}

function pathOf(rawUrl) {
  try { return new URL(rawUrl).pathname; } catch { return ''; }
}

function queryKeysOf(rawUrl) {
  try { return Array.from(new URL(rawUrl).searchParams.keys()); } catch { return []; }
}

function describeLeaf(value) {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return typeof value;
  if (isHttpUrl(value)) {
    return `url(host=${hostOf(value)}, path=${pathOf(value)}, q=${queryKeysOf(value).join('|') || '-'}, len=${value.length})`;
  }
  const head = value.length <= 64 ? value : `${value.slice(0, 8)}…`;
  return `str(len=${value.length}, head=${JSON.stringify(head)})`;
}

function describeShape(value, depth = 0, seen = new Set()) {
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
  const out = {};
  for (const key of Object.keys(value)) out[key] = describeShape(value[key], depth + 1, seen);
  return out;
}

// 扫描全响应里「名字可疑」的字段（含嵌套 JSON 字符串），便于发现改版后的新字段名
function collectSuspiciousKeys(json, limit = 180) {
  const out = new Map();
  const KEY_RE = /(url|video|water|logo|play|api|token|seed|media|file|download|codec|bitrate|duration)/i;
  const walk = (node, pathStr, depth, seen) => {
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
    for (const key of Object.keys(node)) {
      const childPath = pathStr ? `${pathStr}.${key}` : key;
      if (KEY_RE.test(key)) {
        const child = node[key];
        out.set(childPath, typeof child === 'string' ? describeLeaf(child) : describeShape(child, 0, new Set()));
      }
      walk(node[key], childPath, depth + 1, seen);
    }
  };
  walk(json, '', 0, new Set());
  return Object.fromEntries(out);
}

// 把「视频相关响应形状」+ 候选直链落盘，供离线分析（每次覆盖，仅视频响应时写）
function writeSampleReport(json, rawBody, source, fallbackApis, videoResults) {
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
        len: u.length
      })),
      fallbackResults: videoResults.map((r) => ({
        ok: !!r.url,
        stack: r.stack || '',
        host: hostOf(r.url || ''),
        error: r.error || ''
      })),
      imageOriRawCount: findImageOriRawUrls(json).length,
      suspiciousKeys: collectSuspiciousKeys(json)
    };
    fs.writeFileSync(DIAG_SAMPLE_PATH, JSON.stringify(report, null, 2));
  } catch (err) {
    console.warn('[dola-media] 写诊断样本失败:', (err && err.message) || err);
  }
  if (fallbackApis.length) {
    try {
      const prev = (() => {
        try { return fs.readFileSync(DIAG_FALLBACK_URL_PATH, 'utf8').split('\n').filter(Boolean); } catch { return []; }
      })();
      const merged = Array.from(new Set([...fallbackApis, ...prev])).slice(0, 20);
      fs.writeFileSync(
        DIAG_FALLBACK_URL_PATH,
        `# 无水印视频直链（第二跳原始 fallback_api，含签名，仅供本机排查，可随时删除）\n${merged.join('\n')}\n`
      );
    } catch (err) {
      console.warn('[dola-media] 写 fallback_api 清单失败:', (err && err.message) || err);
    }
  }
}

// ───────────────────────── 第二跳：两套网络栈取直链 ─────────────────────────
function errText(error) {
  if (!error) return 'unknown';
  const head = error.name && error.name !== 'Error'
    ? `${error.name}: ${error.message || ''}`
    : (error.message || String(error));
  const parts = [head];
  let cause = error.cause;
  for (let i = 0; i < 3 && cause; i += 1) {
    parts.push(`⟵ ${cause.code || cause.name || ''} ${cause.message || ''}`.trim());
    cause = cause.cause;
  }
  return parts.join(' | ');
}

// 超时保护：即使底层忽略 AbortSignal（例如某些 Electron 版本的 net.fetch），也能按时放弃
function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时 ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let netFetchProbed = false;
let netModule = null;
function getElectronNet() {
  if (!netFetchProbed) {
    netFetchProbed = true;
    try {
      const electron = require('electron');
      netModule = electron && electron.net && typeof electron.net.fetch === 'function' ? electron.net : null;
    } catch {
      netModule = null;
    }
  }
  return netModule;
}

// 走 Chromium 网络栈：与 webview 同一条网络路径（同代理、同 DNS、同证书校验、同 cookie jar）。
// 注意：Electron 文档明确「net.fetch 只会用默认会话；要用别的会话请用 ses.fetch()」，
// 所以这里优先用 ses.fetch（某账号分区的会话），无会话时才退回 net.fetch（默认会话）。
function fetchViaElectronNet(url, ses, signal) {
  const net = getElectronNet();
  if (!net) throw new Error('net.fetch 不可用');
  const init = {
    method: 'GET',
    signal,
    credentials: 'include',
    headers: {
      accept: 'application/json,text/plain,*/*',
      referer: 'https://www.doubao.com/'
    }
  };
  if (ses && typeof ses.fetch === 'function') return ses.fetch(url, init);
  return net.fetch(url, init);
}

// 单套网络栈的一次尝试；hardStop=true 表示「已拿到合法响应但解析不出直链」——换栈无意义
async function attemptFallbackFetch(label, fetcher, url, source, budgetMs) {
  const controller = new AbortController();
  const started = Date.now();
  try {
    const response = await withTimeout(
      Promise.resolve().then(() => fetcher(url, controller.signal)),
      budgetMs,
      label
    );
    if (!response || !response.ok) throw new Error(`HTTP ${response ? response.status : '(无响应)'}`);
    // 注意：net.fetch 返回的 Response.url 可能不准确（Electron 文档已注明），
    // 因此只在其确实是合法 http(s) 地址时才做白名单校验，避免误判失败。
    const finalUrl = response.url || '';
    if (/^https?:\/\//i.test(finalUrl) && !isAllowedFallbackApiUrl(finalUrl, source)) {
      throw new Error(`重定向到非白名单域 ${hostOf(finalUrl)}`);
    }
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      const contentType = (response.headers && response.headers.get && response.headers.get('content-type')) || '-';
      return {
        url: '',
        hardStop: true,
        error: `${label}: 响应非 JSON（content-type=${contentType}, len=${text.length}, head=${JSON.stringify(text.slice(0, 80))}）`
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
        error: `${label}: 响应成功但无 main_url/play_url（payload keys=[${payloadKeys}] data keys=[${dataKeys}], ${Date.now() - started}ms）`
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
    try { controller.abort(); } catch (_) { /* ignore */ }
  }
}

async function getUnwatermarkedVideoUrlFromFallbackApi(fallbackApi, source, ses = null) {
  if (!isAllowedFallbackApiUrl(fallbackApi, source)) return { url: '', error: 'fallback_api host 不在白名单' };
  // 参数变体：都表达「要无水印」，但覆盖豆包把水印开关迁移到 lr=video_gen_no_watermark 的新写法。
  // 仅当服务端正常应答却「没给出 main_url」时才换下一个变体（网络层失败换参数没意义）。
  const variants = [
    { tag: '', params: { channel: 'no', codec_type: '8', logo_type: 'unwatermarked' } },
    { tag: '+lr', params: { channel: 'no', codec_type: '8', logo_type: 'unwatermarked', lr: 'video_gen_no_watermark' } }
  ];
  const stacks = [];
  if (getElectronNet()) {
    stacks.push(['net.fetch', (u, s) => fetchViaElectronNet(u, ses, s), FALLBACK_API_TIMEOUT_MS]);
  }
  stacks.push([
    'node.fetch',
    (u, s) => fetch(u, { method: 'GET', signal: s, headers: { accept: 'application/json,text/plain,*/*' } }),
    NODE_FETCH_TIMEOUT_MS
  ]);
  const errors = [];
  for (const variant of variants) {
    const url = replaceQueryParams(fallbackApi, variant.params);
    for (const [label, fetcher, budget] of stacks) {
      const result = await attemptFallbackFetch(label + variant.tag, fetcher, url, source, budget);
      if (result.url) return result;
      errors.push(result.error);
      if (result.hardStop) break; // 服务端已正常应答，只是解析不出直链 → 换网络栈无意义
    }
    const lastError = errors[errors.length - 1] || '';
    if (!/无 main_url/.test(lastError)) break; // 只有「应答正常但缺 main_url」才值得换参数变体
  }
  const error = errors.join(' ;; ');
  console.warn(`[dola-media] fallback_api 取直链失败: host=${hostOf(fallbackApi)} — ${error}`);
  return { url: '', error };
}

async function extractUnwatermarkedItems(json, rawBody, source, ses = null) {
  const result = [];
  const seen = new Set();
  for (const url of findImageOriRawUrls(json)) addItemTo(result, seen, 'image', url);
  const fallbackApis = findFallbackApis(json, rawBody, source).slice(0, MAX_FALLBACK_API_COUNT);
  const videoResults = await Promise.all(
    fallbackApis.map(async (fallbackApi) => ({
      fallbackApi,
      ...(await getUnwatermarkedVideoUrlFromFallbackApi(fallbackApi, source, ses))
    }))
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
    fallbackApis.length > 0 ||
    findValuesByKey(json, 'video_info').length > 0 ||
    findValuesByKey(json, 'video_list').length > 0;
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
        note: fallbackApis.length ? '有候选直链但第二跳失败，详见上面的失败原因' : '响应内未发现候选直链字段'
      })
    );
  }
  return result;
}

function addItemTo(items, seen, type, url, fallbackApi = '') {
  if (!isHttpUrl(url)) return;
  const identity = mediaIdentityKey(type, url, fallbackApi);
  if (seen.has(identity)) return;
  seen.add(identity);
  items.push({ type, url, ...(fallbackApi ? { fallbackApi } : {}) });
}

// ───────────────────────── CDP 拦截 ─────────────────────────
function emit() {
  const win = mainWindowGetter && mainWindowGetter();
  if (win && !win.isDestroyed()) {
    win.webContents.send('dola-media-update', { items: latestItems.slice() });
  }
}

function continueRequest(dbg, requestId) {
  if (!dbg) return Promise.resolve();
  // ★ TD-16-37：continueRequest 失败会让被拦截的请求**一直挂着**（页面卡住）⇒ 必须留痕
  return dbg.sendCommand('Fetch.continueRequest', { requestId }).catch((e) => {
    console.warn('[dola-media] Fetch.continueRequest 失败（该请求会一直挂起）:', (e && e.message) || e);
  });
}

async function onRequestPaused(dbg, params, wcId = null, ses = null) {
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
      lower
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
    let body = null;
    try {
      const resp = await dbg.sendCommand('Fetch.getResponseBody', { requestId });
      body = resp.base64Encoded ? fromBase64Utf8(resp.body) : resp.body;
    } catch (err) {
      console.warn('[dola-media] 读取 chain/single 响应体失败:', (err && err.message) || err);
    }
    await continueRequest(dbg, requestId);
    if (body == null) return;
    let json = null;
    try {
      json = JSON.parse(body);
    } catch (err) {
      console.warn('[dola-media] chain parse failed:', (err && err.message) || err);
      return;
    }
    // 放行后再异步抽取（不阻塞 CDP 消息循环）
    Promise.resolve()
      .then(() => extractUnwatermarkedItems(json, body, source, ses))
      .then((items) => {
        if (!items.length) return;
        // 合并进累积缓冲（去重由 addItem 内部 seenKeys 保证）
        items.forEach((it) => addItem(it.type, it.url, it.fallbackApi || '', wcId));
        emit();
      })
      .catch((err) => console.warn('[dola-media] 抽取无水印媒体失败:', (err && err.message) || err));
  } catch (err) {
    // 任何意外异常都确保放行该请求，绝不使其悬挂（悬挂会导致页面卡死）
    console.warn('[dola-media] onRequestPaused 异常（已放行请求）:', (err && err.message) || err);
    return continueRequest(dbg, params && params.requestId);
  }
}

function fromBase64Utf8(base64Text) {
  const normalized = String(base64Text || '').replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(normalized)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return atob(normalized);
  }
}

// ───────────────────────── CDP 注入辅助（30s/音频参考选项注入） ─────────────────────────
function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function corsHeaders() {
  return [
    { name: 'access-control-allow-origin', value: '*' },
    { name: 'access-control-allow-credentials', value: 'true' },
    { name: 'access-control-allow-methods', value: 'GET, POST, OPTIONS' },
    { name: 'access-control-allow-headers', value: '*' }
  ];
}

function responseHeadersForTextBody(headers, body) {
  const contentLength = String(new TextEncoder().encode(body).length);
  const nextHeaders = [];
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
function patchActionBarDuration(body) {
  try {
    const json = JSON.parse(body);
    const changed = patchNestedJsonStrings(json);
    return changed ? JSON.stringify(json) : body;
  } catch (error) {
    console.warn('[dola-media] patch action bar duration failed:', error.message || error);
    return body;
  }
}

function patchNestedJsonStrings(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = patchNestedJsonStrings(item, seen) || changed;
    return changed;
  }
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (typeof child === 'string') {
      const patchedString = patchJsonStringDuration(child);
      if (patchedString !== child) {
        value[key] = patchedString;
        changed = true;
      }
    } else {
      changed = patchNestedJsonStrings(child, seen) || changed;
    }
  }
  return changed;
}

function patchJsonStringDuration(text) {
  if (!text || (!text.includes('时长') && !text.includes('鏃堕暱'))) return text;
  try {
    const json = JSON.parse(text);
    const changed = patchDurationSelector(json);
    return changed ? JSON.stringify(json) : text;
  } catch {
    return text;
  }
}

function patchDurationSelector(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = patchDurationSelector(item, seen) || changed;
    return changed;
  }
  if ((value.label === '时长' || value.label === '鏃堕暱') && Array.isArray(value.option_list)) {
    const has15s = value.option_list.some((option) => option && option.option_key === '15');
    if (!has15s) {
      const tenSecondIndex = value.option_list.findIndex((option) => option && option.option_key === '10');
      const insertIndex = tenSecondIndex >= 0 ? tenSecondIndex + 1 : value.option_list.length;
      value.option_list.splice(insertIndex, 0, createFifteenSecondOption(value.option_list));
      changed = true;
    }
  }
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (typeof child === 'string') {
      const patchedString = patchJsonStringDuration(child);
      if (patchedString !== child) {
        value[key] = patchedString;
        changed = true;
      }
    } else {
      changed = patchDurationSelector(child, seen) || changed;
    }
  }
  return changed;
}

function createFifteenSecondOption(optionList) {
  const maxId = optionList.reduce((maxValue, option) => {
    const id = Number(option?.id);
    return Number.isFinite(id) ? Math.max(maxValue, id) : maxValue;
  }, 0);
  return {
    id: maxId + 1,
    display_text: '15s',
    message_text: '',
    option_key: '15'
  };
}

// ───────────────────────── CDP 注入动作 ─────────────────────────
async function fulfillRequest(dbg, requestId, body, responseCode, responseHeaders, responsePhrase = 'OK') {
  if (!dbg) return;
  try {
    await dbg.sendCommand('Fetch.fulfillRequest', {
      requestId,
      responseCode,
      responsePhrase,
      responseHeaders,
      body: toBase64Utf8(body)
    });
  } catch (err) {
    console.warn('[dola-media] fulfillRequest 失败:', err.message || err);
    await continueRequest(dbg, requestId);
  }
}

// ② skill/pack：用内置 skill-pack 整体 fulfill（注入 30s 时长/音频参考等生成选项）
async function fulfillSkillPack(dbg, requestId, body) {
  await fulfillRequest(dbg, requestId, body, 200, responseHeadersForTextBody(corsHeaders(), body));
}

// ③ action_bar：读取真实响应 → 注入 15s 时长项 → fulfill 改写后的响应
async function rewriteActionBarConfigResponse(dbg, params) {
  try {
    if (!params || typeof params !== 'object') { await continueRequest(dbg, params?.requestId); return; }
    const requestId = params.requestId;
    const resp = await dbg.sendCommand('Fetch.getResponseBody', { requestId });
    const originalBody = resp.base64Encoded ? fromBase64Utf8(resp.body) : resp.body;
    const patchedBody = patchActionBarDuration(originalBody);
    const headers = responseHeadersForTextBody(params.responseHeaders || [], patchedBody);
    const code = params.responseStatusCode || 200;
    const phrase = params.responseStatusText || 'OK';
    await fulfillRequest(dbg, requestId, patchedBody, code, headers, phrase);
  } catch (err) {
    console.warn('[dola-media] action_bar rewrite 失败:', err.message || err);
    await continueRequest(dbg, requestId);
  }
}

// ───────────────────────── 对外 API ─────────────────────────
// 原插件用 chrome.debugger.attach({tabId}) 按「标签页（webview）」拦截；Electron 等价物是
// webContents.debugger（每个 webview 一个 debugger），而非 session.debugger（按分区，webview
// 流量上 Fetch 常常不触发）。这里在任意 <webview> 真实挂载时，直接对其 webContents 挂 debugger，
// 彻底绕开 partition 命名（persist:doubao_<id> 之类）与 session.debugger 不触发两个问题。
const attachedGuests = new WeakSet();

function safeGetHost(wc) {
  try {
    return new URL(wc.getURL() || '').hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

// 取该 webview 的会话：第二跳取直链时用 net.fetch + 该 session，保证与页面同一条网络路径
// （同代理、同 DNS、同证书校验），并复用其 cookie jar。
function safeGetSession(wc) {
  try {
    return wc && wc.session ? wc.session : null;
  } catch {
    return null;
  }
}

// 是否值得对该 guest 挂 CDP 拦截：只认豆包 / dola 域名。
// ⚠️ 这条过滤是必要的：早期实现在 did-attach-webview 时「无差别」给每个 webview
//   （含 Lovart、Tapnow 以及登录弹窗的临时 webview）挂 debugger，而这些 guest 会在
//   弹窗关闭时被销毁 —— 带 debugger 的 guest 被销毁会让浏览器进程 CHECK 失败
//   （表现为 EXC_BREAKPOINT / SIGTRAP 闪退，崩溃前日志可见 "detached: target closed"）。
const ATTACH_HOSTS = ['doubao.com', 'dola.com'];
function shouldAttach(guest) {
  try {
    // ⚠️ 曾经的坑：`if (!guest || guest.isDestroyed || guest.isDestroyed())` 里
    //   `guest.isDestroyed` 是函数引用、恒为真 → 条件永远成立 → shouldAttach 永远 false
    //   → 豆包/dola 的 CDP 拦截被整个关掉（无水印资源面板失效）。必须「调用」它来判断。
    const destroyed = (wc) => {
      try { return typeof wc.isDestroyed === 'function' ? wc.isDestroyed() : false; } catch { return true; }
    };
    if (!guest || destroyed(guest)) return false;
    const u = guest.getURL() || '';
    if (!u || u === 'about:blank') return false; // 尚未导航：等 did-navigate 再判
    const host = safeGetHost(guest);
    return ATTACH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// 对单个 webview（guest WebContents）挂载 CDP Fetch 拦截（幂等）
function attachGuestDebugger(guest) {
  if (!guest || typeof guest.debugger === 'undefined') {
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
    } catch (_) { /* ★ TD-16-37：这行**就是**日志 ⇒ 失败只能吞（`getURL()` 在销毁后可能抛） */ }
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
    if (/already attached/i.test((err && err.message) || '')) {
      // 已挂载：仍继续注册，视为就绪
    } else {
      console.warn('[dola-media] guest debugger attach 失败:', (err && err.message) || err);
      return;
    }
  }
  // attach 同步成功后，立即注册事件与 Fetch.enable（不依赖任何回调）
  attachedGuests.add(guest);
  try {
    console.log(`[dola-media] attachGuestDebugger 开始：url=${guest.getURL() || '(空)'}, id=${guest.id}`);
  } catch (_) { /* getURL 可能抛 */ }
  // dbg 闭包透传：同一请求的处理链都回到发起它的那个 webview debugger
  dbg.on('message', (event, method, params) => {
    if (method === 'Fetch.requestPaused' && params) {
      // 不 await：避免阻塞 CDP 消息循环；异常由 onRequestPaused 内部兜底吞掉
      Promise.resolve()
        .then(() =>
          onRequestPaused(
            dbg,
            params,
            guest && guest.id != null ? guest.id : null,
            safeGetSession(guest)
          )
        )
        .catch((err) => console.warn('[dola-media] onRequestPaused 异常（已吞掉，不影响主进程）:', (err && err.message) || err));
    }
  });
  dbg.on('detach', (_event, reason) => {
    console.log(`[dola-media] guest debugger detached：id=${guest.id}, reason=${reason || '(unknown)'}`);
    attachedGuests.delete(guest);
  });
  // guest 销毁前主动 detach 并清理引用：带 debugger 的 webContents 被销毁会让
  // 浏览器进程 CHECK 失败（EXC_BREAKPOINT / SIGTRAP 闪退），登录弹窗关闭时必现。
  const cleanupGuest = () => {
    attachedGuests.delete(guest);
    // ★ TD-16-37：detach 失败**留痕** —— 带 debugger 的 guest 被销毁会让浏览器进程 CHECK 失败（闪退）
    try { if (dbg.isAttached && dbg.isAttached()) dbg.detach(); } catch (e) { console.warn('[dola-media] detach 失败（guest 销毁时可能闪退）:', (e && e.message) || e); }
  };
  // ★ TD-16-37：注册失败 = 清理**永远不会跑** ⇒ 上面那条闪退风险直接暴露 ⇒ 必须留痕
  try { guest.once('destroyed', cleanupGuest); } catch (e) { console.warn('[dola-media] 注册 destroyed 清理失败:', (e && e.message) || e); }
  // 发送任何 CDP 命令前确认 guest 还活着（销毁后 sendCommand 会直接崩浏览器进程）
  const isAlive = () => {
    try { return typeof guest.isDestroyed === 'function' ? !guest.isDestroyed() : false; } catch { return false; }
  };
  const patterns = [];
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
        `[dola-media] guest debugger Fetch.enable OK（id=${guest.id}, host=${safeGetHost(guest)}）— 开始监听 dola/doubao 的 /im/chain/single、/skill/pack、/action_bar`
      )
    )
    .catch((e) => console.warn('[dola-media] guest Fetch.enable 失败:', (e && e.message) || e));
}

function initDolaMediaCapture({ getMainWindow }) {
  mainWindowGetter = getMainWindow;
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
      const tryLater = () => { if (!attachedGuests.has(guest)) attachGuestDebugger(guest); };
      guest.once('did-navigate', tryLater);
      guest.once('did-navigate-in-page', tryLater);
    } catch (e) { console.warn('[dola-media] 注册导航重试监听失败（时序竞态下可能漏挂 debugger）:', (e && e.message) || e); }
  });
  // 兜底：延迟扫描当前已存在的 webview（防 init 时序竞态漏挂）
  setTimeout(() => {
    try {
      for (const wc of win.webContents.getAllWebContents()) {
        if (wc === win.webContents) continue; // 跳过主窗口自身
        const host = safeGetHost(wc);
        if (host === 'doubao.com' || host === 'dola.com') attachGuestDebugger(wc);
      }
    } catch (_) {
      /* ignore */
    }
  }, 1500);
  console.log(
    '[dola-media] 已注册 did-attach-webview，将按 webview 动态挂载 CDP 拦截（修复分区名不匹配 + session.debugger 不触发问题）'
  );
}

function getDolaMediaItems() {
  return latestItems.slice();
}

function clearDolaMediaItems() {
  latestItems.length = 0;
  seenKeys.clear();
  emit();
}

module.exports = {
  initDolaMediaCapture,
  getDolaMediaItems,
  clearDolaMediaItems
};
