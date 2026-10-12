/**
 * 站点适配器注册表（★ 唯一把 `SiteType` 映射到实现的地方）
 *
 * 依据：docs/11 §3.2（`bootstrap/container.ts` 是唯一知道"用哪个 adapter"的地方）
 *
 * ⚠️ 本文件**只做组装**；站点细节全在各自的子目录里
 * ⚠️ 注册表是 `Partial`：**没有适配器的站点就是没有** —— 调用方必须处理
 *    （`core/usecases/generate` 会返回「无 X 站点适配器」，**不静默回落**）
 */

import type { HostPort } from '@/core/ports/host.port';
import type { StoragePort } from '@/core/ports/storage.port';
import type { SiteRegistry } from '@/core/ports/site.port';
import { createDoubaoSite } from './doubao';
import { createLovartSite } from './lovart';
import { createTapnowSite } from './tapnow';
import { createGptSite } from './gpt';

/**
 * 创建站点注册表
 *
 * | 站点 | 能力 |
 * |---|---|
 * | `doubao` / `dola` | 发送（四级降级）+ 等结果 |
 * | `lovart` | 抓取素材（两档降级）+ 页面类型探测 |
 * | `tapnow` | 抓取素材（两档降级）+ 页面类型探测；**不发消息**（原 `fP` 无发送路径） |
 * | `gpt` | **发送**（附参考图 + 页内脚本）；**不抓素材** |
 * | `other` | **有意不提供适配器** —— `other` = 用户自填 URL 的**未知站点**，选择器未知 ⇒ 无从适配；**原版亦无** `other` 适配器（取证：`shared.js` 里 `other` 无任何 send/scan/site 分支）⇒ 注册表缺项，调用方报明确错误、**不静默回落**；**不要为"补全"去造一个** |
 */
export function createSiteRegistry(host: HostPort, storage: StoragePort): SiteRegistry {
  return {
    // ⚠️ `storage` 只有豆包 / Dola 用得上（跨会话去重表）—— 其余站点拿不到也不该拿
    doubao: createDoubaoSite('doubao', host, storage),
    dola: createDoubaoSite('dola', host, storage),
    lovart: createLovartSite(host),
    tapnow: createTapnowSite(host),
    gpt: createGptSite(host),
  };
}
