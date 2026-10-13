// ============================================================
// API 接入 · 配置存储（密钥 safeStorage 加密，明文永不过 IPC 桥）
// ------------------------------------------------------------
// 文件：userData/api-config.json。结构见 docs/API接入功能-实现方案.md §2。
// 安全约定：
//   · apiKey 只以 safeStorage 密文落盘（macOS Keychain / Windows DPAPI）；
//   · safeStorage 不可用（部分 Linux 无 keyring）→ 拒绝保存，绝不落明文；
//   · getPublicConfig() 是唯一给渲染层的读取口，只回 hasKey + keyHint（脱敏）。
// ============================================================
const fs = require('fs');
const path = require('path');

const CONFIG_VERSION = 2;
const DEFAULT_CONCURRENCY = 3;

/** @param {string} userDataPath @param {import('electron').SafeStorage} safeStorage */
function createConfigStore(userDataPath, safeStorage) {
  const file = path.join(userDataPath, 'api-config.json');
  let _cache = null; // 读盘一次后驻内存，写操作同步落盘（实例级，多 store 实例互不串数据）

  function loadRaw() {
    if (_cache) return _cache;
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw);
      _cache = parsed && typeof parsed === 'object' ? parsed : { version: CONFIG_VERSION, providers: {} };
    } catch (_) {
      _cache = { version: CONFIG_VERSION, providers: {} };
    }
    if (!_cache.providers || typeof _cache.providers !== 'object') _cache.providers = {};
    return _cache;
  }

  function saveRaw() {
    const data = loadRaw();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** 取某 provider 的配置；不存在时以 adapter.defaults 为底初始化 */
  function getProviderConfig(adapter) {
    const data = loadRaw();
    if (!data.providers[adapter.id]) {
      data.providers[adapter.id] = {
        enabled: true,
        baseUrl: (adapter.defaults && adapter.defaults.baseUrl) || '',
        model: (adapter.defaults && adapter.defaults.model) || '',
        params: (adapter.defaults && adapter.defaults.params) || {},
        apiKeyEnc: ''
      };
      saveRaw();
    }
    return data.providers[adapter.id];
  }

  /** 更新非密钥字段（baseUrl/model/params/enabled）；返回更新后的公开形态 */
  function updateProviderConfig(adapter, patch) {
    const cfg = getProviderConfig(adapter);
    if (patch && typeof patch === 'object') {
      if (typeof patch.baseUrl === 'string') cfg.baseUrl = patch.baseUrl.trim();
      if (typeof patch.model === 'string') cfg.model = patch.model.trim();
      if (typeof patch.enabled === 'boolean') cfg.enabled = patch.enabled;
      if (patch.params && typeof patch.params === 'object') {
        cfg.params = { ...(cfg.params || {}), ...patch.params };
      }
    }
    saveRaw();
    return publicOf(adapter);
  }

  /** 保存密钥（加密）；返回 { ok, keyHint } 或 { ok:false, error } */
  function setApiKey(adapter, plainKey) {
    const key = String(plainKey || '').trim();
    if (!key) return { ok: false, error: '密钥不能为空' };
    let can = false;
    try { can = safeStorage && safeStorage.isEncryptionAvailable(); } catch (_) { can = false; }
    if (!can) return { ok: false, error: '系统安全存储不可用，无法保存密钥（不落明文）' };
    try {
      const cfg = getProviderConfig(adapter);
      cfg.apiKeyEnc = safeStorage.encryptString(key).toString('base64');
      saveRaw();
      return { ok: true, keyHint: maskKey(key) };
    } catch (err) {
      return { ok: false, error: (err && err.message) || '密钥加密失败' };
    }
  }

  /** 解密密钥（仅主进程内部：引擎提交 / 测试连接用） */
  function getApiKey(adapter) {
    const cfg = getProviderConfig(adapter);
    if (!cfg.apiKeyEnc) return '';
    try {
      const buf = Buffer.from(cfg.apiKeyEnc, 'base64');
      return safeStorage.decryptString(buf) || '';
    } catch (_) {
      return '';
    }
  }

  function hasKey(adapter) {
    const cfg = getProviderConfig(adapter);
    return !!cfg.apiKeyEnc;
  }

  function publicOf(adapter) {
    const cfg = getProviderConfig(adapter);
    let hint = '';
    if (cfg.apiKeyEnc) {
      const k = getApiKey(adapter);
      hint = k ? maskKey(k) : '（密钥解密失败，请重新保存）';
    }
    return {
      id: adapter.id,
      enabled: cfg.enabled !== false,
      baseUrl: cfg.baseUrl || '',
      model: cfg.model || '',
      params: { ...(cfg.params || {}) },
      hasKey: !!cfg.apiKeyEnc,
      keyHint: hint,
      hasSecret: !!cfg.secretKeyEnc
    };
  }

  // ---- 二次密钥（部分中转站需要的 secretKey，与 apiKey 同加密策略）----
  function hasSecretKey(adapter) {
    const cfg = getProviderConfig(adapter);
    return !!cfg.secretKeyEnc;
  }

  function setSecretKey(adapter, plainKey) {
    const key = String(plainKey || '').trim();
    if (!key) return { ok: false, error: '密钥不能为空' };
    let can = false;
    try { can = safeStorage && safeStorage.isEncryptionAvailable(); } catch (_) { can = false; }
    if (!can) return { ok: false, error: '系统安全存储不可用，无法保存密钥（不落明文）' };
    try {
      const cfg = getProviderConfig(adapter);
      cfg.secretKeyEnc = safeStorage.encryptString(key).toString('base64');
      saveRaw();
      return { ok: true, hasSecret: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || '密钥加密失败' };
    }
  }

  function getSecretKey(adapter) {
    const cfg = getProviderConfig(adapter);
    if (!cfg.secretKeyEnc) return '';
    try {
      const buf = Buffer.from(cfg.secretKeyEnc, 'base64');
      return safeStorage.decryptString(buf) || '';
    } catch (_) {
      return '';
    }
  }

  // ---- 全局通道设置（图片/视频通道 + 兜底服务商 + 队列并发）----
  function getSetup() {
    const data = loadRaw();
    const s = data.setup || {};
    return {
      imageProviderId: s.imageProviderId || null,
      videoProviderId: s.videoProviderId || null,
      fallbackProviderId: s.fallbackProviderId || null,
      concurrency: typeof s.concurrency === 'number' && s.concurrency >= 1 ? s.concurrency : DEFAULT_CONCURRENCY
    };
  }

  function setSetup(patch) {
    const data = loadRaw();
    data.setup = { ...(data.setup || {}), ...(patch && typeof patch === 'object' ? patch : {}) };
    saveRaw();
    return getSetup();
  }

  // ---- 每日额度计数（按本地日期键，成功出片 +1）----
  function todayKey(t) {
    const d = new Date(t || Date.now());
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function getUsage() {
    const data = loadRaw();
    return (data.usage && typeof data.usage === 'object') ? data.usage : {};
  }

  function incrementUsage(kind, t) {
    const data = loadRaw();
    if (!data.usage || typeof data.usage !== 'object') data.usage = {};
    const key = todayKey(t);
    if (!data.usage[key]) data.usage[key] = { image: 0, video: 0 };
    const ck = kind === 'image' ? 'image' : 'video';
    data.usage[key][ck] = (data.usage[key][ck] || 0) + 1;
    saveRaw();
    return { ...data.usage[key] };
  }

  return {
    getProviderConfig,
    updateProviderConfig,
    setApiKey,
    getApiKey,
    hasKey,
    publicOf,
    getSetup,
    setSetup,
    getUsage,
    incrementUsage,
    setSecretKey,
    getSecretKey,
    hasSecretKey,
    file
  };
}

/** sk-abcdef1234567890 → sk-****7890（保留前 2-6 与后 4） */
function maskKey(key) {
  const k = String(key || '');
  if (k.length <= 8) return '****';
  const head = k.slice(0, Math.min(6, k.length - 4));
  return `${head}****${k.slice(-4)}`;
}

module.exports = { createConfigStore, maskKey, CONFIG_VERSION };
