// ============================================================
// API 接入 · 服务商注册表
// ------------------------------------------------------------
// 新接入一个服务 = 一个 provider 文件 + 在这里 registerProvider 一行。
// 引擎（job-manager）、设置页、生成面板全部从 registry 取信息，零改动。
// ============================================================

/** @type {Map<string, import('./types').ProviderAdapter>} */
const providers = new Map();

/** @param {import('./types').ProviderAdapter} adapter */
function registerProvider(adapter) {
  if (!adapter || !adapter.id) throw new Error('registerProvider: 缺少 id');
  providers.set(adapter.id, adapter);
}

function getProvider(id) {
  return providers.get(id) || null;
}

function listProviderIds() {
  return [...providers.keys()];
}

/** 下发渲染层的元信息（不含密钥、不含请求头细节；domains 为公开端点地址，可下发） */
function listProvidersMeta() {
  return [...providers.values()].map((a) => ({
    id: a.id,
    name: a.name,
    capabilities: [...(a.capabilities || [])],
    paramSchema: a.paramSchema || [],
    defaults: a.defaults || {},
    domains: [...(a.domains || [])]
  }));
}

module.exports = { registerProvider, getProvider, listProviderIds, listProvidersMeta };
