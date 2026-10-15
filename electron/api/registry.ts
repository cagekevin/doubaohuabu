// ============================================================
// API 接入 · 服务商注册表
// ------------------------------------------------------------
// 新接入一个服务 = 一个 provider 文件 + 在这里 registerProvider 一行。
// 引擎（job-manager）、设置页、生成面板全部从 registry 取信息，零改动。
// ============================================================

import type { ProviderAdapter } from './types';

/** id → 适配器（进程级注册表；由 `bridge` 在启动时逐个注册） */
const providers = new Map<string, ProviderAdapter>();

/**
 * 注册一个服务商。
 * ⚠️ 运行期校验保留：调用方是**各 provider 模块**（`bridge` 逐个导入后注册），
 *    "缺 id 就当场喊"的护栏代价近乎零，而漏注册会让渲染层看到空列表（静默）。
 */
function registerProvider(adapter: ProviderAdapter): void {
  if (!adapter || !adapter.id) throw new Error('registerProvider: 缺少 id');
  providers.set(adapter.id, adapter);
}

function getProvider(id: string): ProviderAdapter | null {
  return providers.get(id) || null;
}

function listProviderIds(): string[] {
  return [...providers.keys()];
}

/**
 * 下发渲染层的元信息（不含密钥、不含请求头细节；`domains` 为公开端点地址，可下发）。
 *
 * ⚠️ 与源相比**少了两处 `|| []` / `|| {}` 兜底**：`capabilities` / `paramSchema` / `defaults`
 *    在类型上已是必填 ⇒ 那两个兜底**不可达**（类型层取代了运行期兜底，这正是本迁移的目的）。
 *    `domains` 仍可选 ⇒ 它的 `|| []` 保留。
 */
function listProvidersMeta(): {
  id: string;
  name: string;
  capabilities: string[];
  paramSchema: ProviderAdapter['paramSchema'];
  defaults: ProviderAdapter['defaults'];
  domains: string[];
}[] {
  return [...providers.values()].map((a) => ({
    id: a.id,
    name: a.name,
    capabilities: [...a.capabilities],
    paramSchema: a.paramSchema,
    defaults: a.defaults,
    domains: [...(a.domains || [])],
  }));
}

export { registerProvider, getProvider, listProviderIds, listProvidersMeta };
