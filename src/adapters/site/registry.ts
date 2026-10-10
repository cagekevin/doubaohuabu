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
import type { SiteRegistry } from '@/core/ports/site.port';
import { createDoubaoSite } from './doubao';
import { createLovartSite } from './lovart';

/**
 * 创建站点注册表
 *
 * | 站点 | 能力 |
 * |---|---|
 * | `doubao` / `dola` | 发送（四级降级）+ 等结果 |
 * | `lovart` | 抓取素材（两档降级）+ 页面类型探测 |
 * | `tapnow` / `gpt` / `other` | **暂未实现**（注册表里缺项 ⇒ 调用方报明确错误） |
 */
export function createSiteRegistry(host: HostPort): SiteRegistry {
  return {
    doubao: createDoubaoSite('doubao', host),
    dola: createDoubaoSite('dola', host),
    lovart: createLovartSite(host),
  };
}
