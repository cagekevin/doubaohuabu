// ============================================================
// API 接入 · 日志脱敏（引擎 v2，对标改造方案 §3.1）
// ------------------------------------------------------------
// 错误消息 / 响应体 / 请求头在进入 job.error（会经 IPC 桥给渲染层）
// 与 console 日志前，统一把疑似密钥的值替换为 <redacted>。
// 服务商的报错有时会回显请求头或 query 里的 key（如 ?key=sk-xxx），
// 不脱敏就会把明文密钥写进 genHistory / 控制台。
// 纯函数，无状态。
// ============================================================

/** 键名词表：authorization / api key / access key / token / secret / password / 裸 key（前面不能是字母或下划线，避免 monkey=、cache_key= 误伤） */
const KEY_WORDS = String.raw`authorization|api[ _-]?key|access[ _-]?key(?:[ _-]?id)?|token|secret(?:[ _-]?key)?|password|(?<![a-z_])key`;

/** 形态一：key=value / key: value / "key": "value"（JSON、query、header 通用） */
const KV_RE = new RegExp(`((?:${KEY_WORDS})"?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;&}"']+)`, 'gi');
/** 形态二：英文散文 + 引号值，如 invalid api key "sk-proj-xxxx"（值 ≥8 字符才认定是密钥） */
const QUOTED_RE = new RegExp(`((?:${KEY_WORDS})\\s*)("[^"]{8,}")`, 'gi');

/**
 * 文本脱敏：`key=value` / `"key": "value"` / `key "value"` 形态的疑似密钥字段，
 * 值替换为 <redacted>。键名口径与噜噜同源公开协议形态：
 * authorization / api[_ -]key / token / secret / password / access[_ -]key / 裸 key。
 * @param {string} text
 * @returns {string}
 */
function redactText(text) {
  const s0 = String(text || '');
  if (!s0) return s0;
  return s0.replace(QUOTED_RE, (_m, head) => `${head}<redacted>`)
           .replace(KV_RE, (_m, head) => `${head}<redacted>`);
}

/**
 * 请求头脱敏：键名命中敏感词的整个值替换为 <redacted>
 * （Authorization: Bearer sk-xxx → Authorization: <redacted>）。
 * @param {Record<string,string>} headers
 * @returns {Record<string,string>}
 */
function redactHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    out[k] = /authorization|api-?key|access-?key|token|secret|password/i.test(k) ? '<redacted>' : String(v);
  }
  return out;
}

/**
 * 任意值安全转日志字符串：对象 JSON 序列化后过 redactText，
 * 序列化失败（循环引用等）降级 String()。
 * @param {*} value
 * @returns {string}
 */
function redactForLog(value) {
  let s;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch (_) {
    s = String(value);
  }
  return redactText(s);
}

module.exports = { redactText, redactHeaders, redactForLog };
