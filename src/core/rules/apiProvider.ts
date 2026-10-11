/**
 * API provider 解析（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：原 `resolveApiProviderId` `shared.js:30624-30649`
 *
 * 用途：API 通道提交任务前，决定「用哪个 provider」——
 *   ① 先用 `apiSetup` 里显式选中的那个（若它真的可用）；
 *   ② 否则**线性找第一个可用**的；
 *   ③ 都没有 ⇒ `null`（调用方据此提示「没有可用的 API 服务商」，**不静默回落**）。
 *
 * 「可用」= 三条件**同时**满足（逐字对源）：
 *   · provider 元信息里存在该 id；
 *   · 它的 `capabilities` 含本 kind（`'image'` / `'video'`）；
 *   · 它的配置 `enabled !== false`（**缺省视为启用**）且 `hasKey === true`。
 *
 * ⚠️ 本模块**不接触** `window`/`Date`/随机（原则 4）。
 * ⚠️ 原版把这段逻辑住在 store action 里（`resolveApiProviderId`）；按本工程「纯归 core」
 *    （原则 4）抽成纯函数 —— 状态只是它的**输入**，不是它的家。
 */

import type { ApiConfigMap, ApiProviderMeta, ApiSetup } from '@/stable/model/gen';

/** 生成通道种类（原 `resolveApiProviderId(n)` 的 `'image' | 其它` 二分） */
export type ApiProviderKind = 'image' | 'video';

/**
 * 解析某通道实际要用的 provider id（原 `resolveApiProviderId`）
 *
 * @param kind      通道（`'image'` = 图片，其余一律当 `'video'` —— 逐字对源）
 * @param providers provider 元信息（`apiProvidersMeta`）
 * @param configs   按 id 索引的 provider 配置（`apiConfigs`）
 * @param setup     通道设置（`apiSetup`）
 * @returns provider id；无可用 ⇒ `null`
 */
export function resolveApiProviderId(
  kind: ApiProviderKind,
  providers: readonly ApiProviderMeta[],
  configs: ApiConfigMap,
  setup: ApiSetup,
): string | null {
  // 原：`const l = n === 'image' ? 'image' : 'video';`
  const capability = kind === 'image' ? 'image' : 'video';
  // 原：`const c = n === 'image' ? a.imageProviderId : a.videoProviderId;`
  const preferred = kind === 'image' ? setup.imageProviderId : setup.videoProviderId;

  const usable = (id: string): boolean => {
    const meta = providers.find((p) => p.id === id);
    const cfg = configs[id];
    // 原：`!!p && (p.capabilities || []).includes(l) && h.enabled !== false && h.hasKey`
    return (
      !!meta &&
      (meta.capabilities ?? []).includes(capability) &&
      cfg?.enabled !== false &&
      cfg?.hasKey === true
    );
  };

  if (preferred && usable(preferred)) return preferred;
  const found = providers.find((p) => usable(p.id));
  return found ? found.id : null;
}
