/**
 * 站点域名的**归属判定**（渲染侧唯一实现）—— 层 2
 *
 * 口径**移植自主进程的对口实现**（`electron/site-hosts.js` 的层 2：`normalizeHost` / `isHostOf`）：
 *   两个世界各留一份**判定形状**（跨世界消不掉），但规则必须逐字一致。
 *
 * ⚠️ **和 `core/rules/newImages.hostnameFromUrl` 分工**：那个只「**取** host」（通用、不问归属）；
 *    本模块**收 host 问归属**。⇒ 本模块**不解析 URL**：调用方本来就要 `new URL(href)` 取 `pathname`，
 *    顺手把 `hostname` 传进来即可（少一次解析、也不复制一份"取 host"）。
 *
 * ⚠️ **子域规则只有一条**：`h === base || h.endsWith('.' + base)`。
 *    **不许**写成 `h.slice(-9) === '.dola.com'` 那种**手写后缀长度** —— 换域／加子域会
 *    **静默失效**（判定恒假、无痕），见 `TD-05-12`。
 * ⚠️ **那个点不是修饰、是边界**：少了它，`evillovart.ai` 这种**近名**会被误判成本站点
 *    （自带正则就会漏掉它 —— `TD-05-12`）⇒ 边界只能由那个点保证。
 *
 * 消费者：`adapters/site/lovart/pageKind` · `tapnow/pageKind` · `tapnow/api`（图片域）。
 * （`doubao/dolaForce` 的页内脚本**不用本模块**——它跨世界；它用的是本模块所引的**值**。）
 */
import { SITE_HOSTS } from '@/constants/siteHosts';
import type { SiteType } from '@/constants/siteTypes';

/** 表按 `SiteType` 查（未登记的站点**没有值** ⇒ 判定按"不认识"处理，**不编默认值**） */
const HOSTS: Partial<Record<SiteType, readonly string[]>> = SITE_HOSTS;

/** 归一化 host（去 `www.` 前缀 ＋ 去尾点 ＋ 小写）—— 口径同主进程 `site-hosts.js` 的 `normalizeHost` */
function normalizeHost(raw: unknown): string {
  return String(raw ?? '')
    .replace(/^www\./i, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

/**
 * 某个 host 是不是某个站点的（**含子域**）
 *
 * @returns 该站点**未登记** / 空 host ⇒ `false`（与主进程 `isHostOf` 同口径：不认识就是 false）
 */
export function isHostOfSite(host: unknown, site: SiteType): boolean {
  const bases = HOSTS[site];
  if (!bases) return false;
  const h = normalizeHost(host);
  return bases.some((base) => h === base || h.endsWith(`.${base}`));
}
