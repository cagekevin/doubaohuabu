// ============================================================
// API 接入域 · 装配 + IPC 自注册（本域唯一门面）
// ------------------------------------------------------------
// 为什么住这里：配置存储 / 任务引擎 / 传输双栈 / 事件推送 / 12 个 handler 全是
//   **本域装配细节**，宿主壳不该知情（`TD-13-24` 同族）。
//
// ★ **依赖注入**（域**不反向** `require` 宿主壳）：
//   · `getMainWindow`  —— 任务事件回推到渲染层（`api-job-event`）
//   · `resolveImageRef` —— `img://` → 本地绝对路径（属存储/媒体域，本域不实现）
// ============================================================

const fs = require('fs');
const { app } = require('electron');
const { handle } = require('../ipc');
const { createConfigStore, maskKey } = require('./config-store');
const { createJobManager } = require('./job-manager');
const apiRegistry = require('./registry');

// 新接入一个服务 = 一个 provider 文件 + 这里 registerProvider 一行
// ⚠️ 取 `.adapter`：5 个 provider 已转 TS，导出从「单值 module.exports」改成**具名导出**
//    （本仓禁 `export default`）⇒ 这里必须同批跟着改，否则运行期拿到的是命名空间对象
//    （registerProvider 会因缺 id 抛错 —— 而且**编译期不会报**，因为本文件还是 .js）。
apiRegistry.registerProvider(require('./providers/volcengine-ark').adapter);
apiRegistry.registerProvider(require('./providers/geeknow-relay').adapter);      // 中转聚合（Stage B）
apiRegistry.registerProvider(require('./providers/vidu').adapter);               // Vidu 官方直连（Stage D · 含首尾帧）
apiRegistry.registerProvider(require('./providers/kling').adapter);              // 可灵官方直连（Stage E · JWT 自签）
apiRegistry.registerProvider(require('./providers/llm-openai-compat').adapter);  // LLM 通道（Stage F · 与生成隔离）

let _apiConfigStore = null;
let _apiJobManager = null;

/**
 * ★ **域唯一门面**：宿主壳只说「初始化 API 接入域」。
 * 幂等 —— `whenReady` 可能与窗口重建并发触发一次以上。
 */
function initApi({ getMainWindow, resolveImageRef }) {
  if (_apiJobManager) return;
  try {
    _apiConfigStore = createConfigStore(app.getPath('userData'), require('electron').safeStorage);

    // img:// 引用 → 本地绝对路径；http(s)/data:/绝对路径 透传（buildSubmit 自己再编码）
    const resolveRefPath = (ref) => {
      try {
        if (typeof ref !== 'string' || !ref) return '';
        if (ref.startsWith('img://')) return resolveImageRef(ref) || '';
        if (/^https?:\/\//i.test(ref) || ref.startsWith('data:') || fs.existsSync(ref)) return ref;
        return '';
      } catch (_) {
        return '';
      }
    };

    // 传输双栈（引擎 v2）：优先 Chromium 栈 net.fetch（吃系统代理/企业网络环境），
    // 网络层失败自动降级 Node undici 栈 —— 哪条通走哪条。
    const apiTransports = [];
    try {
      const { net } = require('electron');
      if (net && typeof net.fetch === 'function') apiTransports.push(net.fetch.bind(net));
    } catch (_) { /* 非 Electron 运行环境忽略 */ }
    if (typeof globalThis.fetch === 'function') apiTransports.push(globalThis.fetch.bind(globalThis));

    _apiJobManager = createJobManager({
      configStore: _apiConfigStore,
      registry: apiRegistry,
      resolveRefPath,
      transports: apiTransports,
      onEvent: (snap) => {
        try {
          // 成功出片 → 今日额度计数 +1（密钥/引擎均不涉及，纯本地统计）
          if (snap && snap.status === 'done') {
            try { _apiConfigStore.incrementUsage(snap.kind); } catch (_) { /* 计数失败不影响主流程 */ }
          }
          const win = getMainWindow && getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('api-job-event', snap);
          }
        } catch (_) { /* 推送失败不影响引擎 */ }
      }
    });

    // ---- 服务商元信息（无密钥）----
    handle('api-providers:list', async () => {
      return { ok: true, providers: apiRegistry.listProvidersMeta() };
    });

    // ---- 配置读取（密钥脱敏）----
    handle('api-config:get', async () => {
      const configs = {};
      for (const id of apiRegistry.listProviderIds()) {
        const adapter = apiRegistry.getProvider(id);
        configs[id] = _apiConfigStore.publicOf(adapter);
      }
      return { ok: true, providers: apiRegistry.listProvidersMeta(), configs };
    });

    // ---- 配置更新（baseUrl/model/params/enabled；不含密钥）----
    handle('api-config:set', async (_e, providerId, patch) => {
      const adapter = apiRegistry.getProvider(providerId);
      if (!adapter) return { ok: false, error: `未知服务商 ${providerId}` };
      const pub = _apiConfigStore.updateProviderConfig(adapter, patch || {});
      return { ok: true, config: pub };
    });

    // ---- 保存密钥（加密落盘）----
    handle('api-config:set-key', async (_e, providerId, key) => {
      const adapter = apiRegistry.getProvider(providerId);
      if (!adapter) return { ok: false, error: `未知服务商 ${providerId}` };
      const r = _apiConfigStore.setApiKey(adapter, key);
      if (!r.ok) return r;
      return { ok: true, keyHint: r.keyHint, maskedBy: maskKey(key) };
    });

    // ---- 测试连接（回执用 `message`，与守卫的 `{ok:false,error}` 不同 ⇒ 形状就地保留）----
    handle('api-config:test', async (_e, providerId) => {
      const adapter = apiRegistry.getProvider(providerId);
      if (!adapter || typeof adapter.testConnection !== 'function') {
        return { ok: false, message: '该服务商不支持测试连接' };
      }
      // ⚠️ 配置读取（getApiKey/getProviderConfig）**必须在守卫内** ——
      //    原实现把 try 只包在 testConnection 上，配置损坏时这两行会逃出去
      const apiKey = _apiConfigStore.getApiKey(adapter);
      const cfgRow = _apiConfigStore.getProviderConfig(adapter);
      try {
        return await adapter.testConnection({
          config: { baseUrl: cfgRow.baseUrl, model: cfgRow.model, apiKey },
          fetchImpl: null
        });
      } catch (err) {
        return { ok: false, message: (err && err.message) || String(err) };
      }
    });

    // ---- 任务 ----
    handle('api-job:submit', async (_e, payload) => {
      return _apiJobManager.submit(payload);
    });
    handle('api-job:cancel', async (_e, jobId) => _apiJobManager.cancel(jobId));
    handle('api-job:list', async () => ({ ok: true, jobs: _apiJobManager.list() }));
    // 批量出片（Stage F）：同一请求按 matrix 展开成多个变体，复用同一并发队列
    handle('api-job:batch', async (_e, basePayload, matrix) => {
      return _apiJobManager.submitBatch(basePayload, matrix);
    });

    // ---- 通道设置（双通道 / 兜底 / 并发）----
    handle('api-setup:get', async () => {
      return { ok: true, setup: _apiConfigStore.getSetup(), usage: _apiConfigStore.getUsage() };
    });
    handle('api-setup:set', async (_e, patch) => {
      const setup = _apiConfigStore.setSetup(patch || {});
      // 并发数变化时实时通知引擎（不重建 manager）
      if (setup && typeof setup.concurrency === 'number' && _apiJobManager && typeof _apiJobManager.setConcurrency === 'function') {
        _apiJobManager.setConcurrency(setup.concurrency);
      }
      return { ok: true, setup };
    });

    // ---- 保存二次密钥（secretKey，加密落盘）----
    handle('api-config:set-secret', async (_e, providerId, key) => {
      const adapter = apiRegistry.getProvider(providerId);
      if (!adapter) return { ok: false, error: `未知服务商 ${providerId}` };
      const r = _apiConfigStore.setSecretKey(adapter, key);
      if (!r.ok) return r;
      return { ok: true, hasSecret: true };
    });

    console.log('[api-bridge] API 接入桥已初始化：providers =', apiRegistry.listProviderIds().join(', '));
  } catch (err) {
    console.error('[api-bridge] 初始化失败:', err && err.message || err);
  }
}

module.exports = { initApi };
