// ============================================================
// API 接入 · 配置存储（密钥 safeStorage 加密，明文永不过 IPC 桥）
// ------------------------------------------------------------
// 文件：userData/api-config.json。结构见 docs/API接入功能-实现方案.md §2。
// 安全约定：
//   · apiKey 只以 safeStorage 密文落盘（macOS Keychain / Windows DPAPI）；
//   · safeStorage 不可用（部分 Linux 无 keyring）→ 拒绝保存，绝不落明文；
//   · getPublicConfig() 是唯一给渲染层的读取口，只回 hasKey + keyHint（脱敏）。
// ============================================================

import fs from 'fs';
import path from 'path';
import type { SafeStorage } from 'electron';
import { asRecord, causeText } from './shape';
import type { ProviderAdapter } from './types';

const CONFIG_VERSION = 2;
const DEFAULT_CONCURRENCY = 3;

/**
 * 一条 provider 配置的**磁盘格式**（键名是契约：改它＝要迁移用户数据）。
 * ⚠️ 全部可选：磁盘上的文件用户可手改，读的时候**逐字段判定**，⛔ 不假设它一定合规。
 */
interface ProviderConfigRow {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  params?: Record<string, unknown>;
  apiKeyEnc?: string;
  secretKeyEnc?: string;
}

/**
 * 配置文档。
 * ⚠️ 带索引签名是**故意的**：源实现保留文件里的全部顶层键（用户手加的字段/未来字段在写回时**不该丢**），
 *    所以这里只对**已知键**给类型，其余原样带着走。
 */
interface ApiConfigDoc {
  version?: number;
  providers: Record<string, ProviderConfigRow>;
  /** ⚠️ `setup` / `usage` 留 `unknown`：磁盘文件可被手改，读它们的地方带 `typeof === 'object'` 守卫（源如此） */
  setup?: unknown;
  usage?: unknown;
  [k: string]: unknown;
}

/** `ENOENT` 判定（用 `in` 收窄，不用 `as`） */
function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}

function createConfigStore(userDataPath: string, safeStorage: SafeStorage | null) {
  const file = path.join(userDataPath, 'api-config.json');
  let _cache: ApiConfigDoc | null = null; // 读盘一次后驻内存，写操作同步落盘（实例级，多 store 实例互不串数据）

  /**
   * 读盘（**三态必须区分** —— 原实现把三者混成一个空配置，导致「损坏被静默重置 + 写回覆盖」）
   *
   * | 情况 | 原实现 | 现在 |
   * |---|---|---|
   * | 文件不存在（首次运行） | 空配置 | **空配置**（正常，不是失败） |
   * | **文件损坏**（JSON 解析失败） | 空配置 → **被 saveRaw 覆盖** | **先备份原文 → 抛错**（绝不覆盖） |
   * | 读盘失败（权限 / IO） | 空配置 | **抛错**（不假装"没有配置"） |
   *
   * ⚠️ 失败时**不写 `_cache`** —— 这样外部修好文件后下次调用就能读到（不缓存失败）。
   */
  function loadRaw(): ApiConfigDoc {
    if (_cache) return _cache;

    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf-8');
    } catch (err) {
      if (isEnoent(err)) {
        // ① 首次运行：文件还没有 —— **正常**，空配置
        const empty: ApiConfigDoc = { version: CONFIG_VERSION, providers: {} };
        _cache = empty;
        return _cache;
      }
      // ② 读盘失败：**如实上报**（不假装"没有配置"）
      throw new Error(`读取 API 配置失败（${file}）：${causeText(err)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (err) {
      // ③ 损坏：**先备份原文，再抛** —— 绝不静默重置（否则下一次 saveRaw 会覆盖掉用户配置与密钥）
      const bak = `${file}.corrupt-${Date.now()}`;
      let backupNote: string;
      try {
        fs.writeFileSync(bak, raw, 'utf-8');
        backupNote = `原文已备份到 ${bak}`;
      } catch (e2) {
        backupNote = `原文备份失败（${causeText(e2)}），请**不要**保存任何配置，先手工备份 ${file}`;
      }
      throw new Error(`API 配置已损坏（${file}）：${causeText(err)}。${backupNote}`);
    }

    // 收窄点：只保证"是对象、providers 是记录"，其余字段**原样保留**（见 ApiConfigDoc 的注释）
    const rec = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const providersRec = rec['providers'] !== null && typeof rec['providers'] === 'object' ? rec['providers'] : {};
    const doc = { ...rec, providers: providersRec } as unknown as ApiConfigDoc;
    if (typeof doc.version !== 'number') doc.version = CONFIG_VERSION;
    _cache = doc;
    return _cache;
  }

  function saveRaw(): void {
    const data = loadRaw();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** 取某 provider 的配置；不存在时以 adapter.defaults 为底初始化 */
  function getProviderConfig(adapter: ProviderAdapter): ProviderConfigRow {
    const data = loadRaw();
    const existing = data.providers[adapter.id];
    if (!existing) {
      const created: ProviderConfigRow = {
        enabled: true,
        baseUrl: (adapter.defaults && adapter.defaults.baseUrl) || '',
        model: (adapter.defaults && adapter.defaults.model) || '',
        params: (adapter.defaults && adapter.defaults.params) || {},
        apiKeyEnc: '',
      };
      data.providers[adapter.id] = created;
      saveRaw();
      return created;
    }
    return existing;
  }

  /** 更新非密钥字段（baseUrl/model/params/enabled）；返回更新后的公开形态 */
  function updateProviderConfig(adapter: ProviderAdapter, patch: unknown): ReturnType<typeof publicOf> {
    const cfg = getProviderConfig(adapter);
    if (patch && typeof patch === 'object') {
      const p = patch as Record<string, unknown>;
      if (typeof p['baseUrl'] === 'string') cfg.baseUrl = p['baseUrl'].trim();
      if (typeof p['model'] === 'string') cfg.model = p['model'].trim();
      if (typeof p['enabled'] === 'boolean') cfg.enabled = p['enabled'];
      if (p['params'] && typeof p['params'] === 'object') {
        cfg.params = { ...(cfg.params || {}), ...(p['params'] as Record<string, unknown>) };
      }
    }
    saveRaw();
    return publicOf(adapter);
  }

  /** 加密是否可用（safeStorage 可能为空 / 抛错 ⇒ 一律当"不可用"，**绝不落明文**） */
  function canEncrypt(): boolean {
    try {
      return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
    } catch {
      return false;
    }
  }

  /** 保存密钥（加密）；返回 { ok, keyHint } 或 { ok:false, error } */
  function setApiKey(adapter: ProviderAdapter, plainKey: unknown): { ok: true; keyHint: string } | { ok: false; error: string } {
    const key = String(plainKey || '').trim();
    if (!key) return { ok: false, error: '密钥不能为空' };
    if (!canEncrypt()) return { ok: false, error: '系统安全存储不可用，无法保存密钥（不落明文）' };
    if (!safeStorage) return { ok: false, error: '系统安全存储不可用，无法保存密钥（不落明文）' };
    try {
      const cfg = getProviderConfig(adapter);
      cfg.apiKeyEnc = safeStorage.encryptString(key).toString('base64');
      saveRaw();
      return { ok: true, keyHint: maskKey(key) };
    } catch (err) {
      return { ok: false, error: causeText(err) || '密钥加密失败' };
    }
  }

  /**
   * 解密密钥（仅主进程内部：引擎提交 / 测试连接用）
   *
   * ★ **解密失败必须抛**（TD-13-16）：原实现 `catch { return '' }` ⇒ 与同文件 `loadRaw`
   *   的「三态不吞」原则**自相矛盾** —— 调用方会把「密钥读不出来」当成「没配密钥」。
   * ⚠️ **调用方须接住**：`main.js` 的 `api-config:test` 走注册处守卫（`electron/ipc.ts` 的 `handle`）✓；
   *    `job-manager` 的 `submit` / `runJob` 已就地 try/catch（如实报，不回落成"未配"）。
   * ⚠️ 与源的一处**显式化**：`safeStorage` 为空时源会走到 `null.decryptString` 抛 TypeError 再被包成同一句话；
   *    这里在 try **外**显式判空并抛同一句话（错误文案里的**原因**从 TypeError 原话改为"系统安全存储不可用"）。
   */
  function getApiKey(adapter: ProviderAdapter): string {
    const cfg = getProviderConfig(adapter);
    if (!cfg.apiKeyEnc) return '';
    if (!safeStorage) throw new Error(decryptFailMessage('API 密钥', new Error('系统安全存储不可用')));
    try {
      const buf = Buffer.from(cfg.apiKeyEnc, 'base64');
      return safeStorage.decryptString(buf) || '';
    } catch (err) {
      throw new Error(decryptFailMessage('API 密钥', err));
    }
  }

  function hasKey(adapter: ProviderAdapter): boolean {
    const cfg = getProviderConfig(adapter);
    return !!cfg.apiKeyEnc;
  }

  function publicOf(adapter: ProviderAdapter) {
    const cfg = getProviderConfig(adapter);
    let hint = '';
    if (cfg.apiKeyEnc) {
      try {
        const k = getApiKey(adapter);
        hint = k ? maskKey(k) : '（密钥解密失败，请重新保存）';
      } catch {
        // ★ TD-13-16：解密失败**如实显示**（原实现靠 `k === ''` 推断，分不清"解密失败"与"解密成空串"）
        hint = '（密钥解密失败，请重新保存）';
      }
    }
    return {
      id: adapter.id,
      enabled: cfg.enabled !== false,
      baseUrl: cfg.baseUrl || '',
      model: cfg.model || '',
      params: { ...(cfg.params || {}) },
      hasKey: !!cfg.apiKeyEnc,
      keyHint: hint,
      hasSecret: !!cfg.secretKeyEnc,
    };
  }

  // ---- 二次密钥（部分中转站需要的 secretKey，与 apiKey 同加密策略）----
  function hasSecretKey(adapter: ProviderAdapter): boolean {
    const cfg = getProviderConfig(adapter);
    return !!cfg.secretKeyEnc;
  }

  function setSecretKey(adapter: ProviderAdapter, plainKey: unknown): { ok: true; hasSecret: true } | { ok: false; error: string } {
    const key = String(plainKey || '').trim();
    if (!key) return { ok: false, error: '密钥不能为空' };
    if (!canEncrypt() || !safeStorage) return { ok: false, error: '系统安全存储不可用，无法保存密钥（不落明文）' };
    try {
      const cfg = getProviderConfig(adapter);
      cfg.secretKeyEnc = safeStorage.encryptString(key).toString('base64');
      saveRaw();
      return { ok: true, hasSecret: true };
    } catch (err) {
      return { ok: false, error: causeText(err) || '密钥加密失败' };
    }
  }

  /** 同 `getApiKey`：解密失败**抛**（★ 判据适用面 —— 债里只点名了 `getApiKey`，本处**同形同因**） */
  function getSecretKey(adapter: ProviderAdapter): string {
    const cfg = getProviderConfig(adapter);
    if (!cfg.secretKeyEnc) return '';
    if (!safeStorage) throw new Error(decryptFailMessage('二次密钥（secretKey）', new Error('系统安全存储不可用')));
    try {
      const buf = Buffer.from(cfg.secretKeyEnc, 'base64');
      return safeStorage.decryptString(buf) || '';
    } catch (err) {
      throw new Error(decryptFailMessage('二次密钥（secretKey）', err));
    }
  }

  // ---- 全局通道设置（图片/视频通道 + 兜底服务商 + 队列并发）----
  function getSetup() {
    const data = loadRaw();
    // 源的 `data.setup || {}`：非对象（含字符串/null）一律当空 —— `asRecord` 正是这个语义
    const s = asRecord(data.setup);
    return {
      imageProviderId: s['imageProviderId'] || null,
      videoProviderId: s['videoProviderId'] || null,
      fallbackProviderId: s['fallbackProviderId'] || null,
      concurrency: typeof s['concurrency'] === 'number' && s['concurrency'] >= 1 ? s['concurrency'] : DEFAULT_CONCURRENCY,
    };
  }

  function setSetup(patch: unknown) {
    const data = loadRaw();
    // ⚠️ 断言只为表达"磁盘值"：源的 `{...(data.setup || {})}` 对非对象就是 JS 的展开语义
    data.setup = { ...((data.setup as Record<string, unknown> | null | undefined) || {}), ...(patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : {}) };
    saveRaw();
    return getSetup();
  }

  // ---- 每日额度计数（按本地日期键，成功出片 +1）----
  function todayKey(t?: unknown): string {
    const d = new Date(typeof t === 'number' ? t : Date.now());
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function getUsage(): Record<string, Record<string, number>> {
    const data = loadRaw();
    const u = data.usage;
    // 源的守卫逐字保留：`data.usage && typeof === 'object'`（非对象/假值 ⇒ 回落空配置）
    return u && typeof u === 'object' ? (u as Record<string, Record<string, number>>) : {};
  }

  function incrementUsage(kind: unknown, t?: unknown): Record<string, number> {
    const data = loadRaw();
    if (!data.usage || typeof data.usage !== 'object') data.usage = {};
    const usage = data.usage as Record<string, Record<string, number>>;
    const key = todayKey(t);
    if (!usage[key]) usage[key] = { image: 0, video: 0 };
    // 上一行刚保证该键存在；`noUncheckedIndexedAccess` 不认这一点
    const row = usage[key] as Record<string, number>;
    const ck = kind === 'image' ? 'image' : 'video';
    row[ck] = (row[ck] || 0) + 1;
    saveRaw();
    return { ...row };
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
    file,
  };
}

/**
 * 解密失败的统一原文（**不编造** —— 带 safeStorage 的原始 message）
 *
 * ★ TD-13-16：`getApiKey` / `getSecretKey` 共用一处（判据 C1：同一句不写两份）。
 */
function decryptFailMessage(what: string, err: unknown): string {
  const why = causeText(err);
  return `${what}解密失败（safeStorage 不可用或密文损坏）：${why} —— 请到「API 服务」重新保存该密钥`;
}

/** sk-abcdef1234567890 → sk-****7890（保留前 2-6 与后 4） */
function maskKey(key: unknown): string {
  const k = String(key || '');
  if (k.length <= 8) return '****';
  const head = k.slice(0, Math.min(6, k.length - 4));
  return `${head}****${k.slice(-4)}`;
}

export { createConfigStore, maskKey, CONFIG_VERSION };
