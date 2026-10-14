/**
 * 站点域名（**渲染侧唯一**的值真源）—— 层 1
 *
 * ⚠️ **为什么住 L0**：值是真常量（无状态），且渲染侧各层都要引它（判定在 `core/rules`、
 *    消费者在 `adapters/site`）。同 `src/constants/siteTypes.ts` 的先例。
 *
 * ⚠️ **值是「一组域」不是「一个域」**：源 `Dk`（`shared.js:33113`）逐字「**只认这两个域**」
 *    （`tapnow.media` + `tapnow.art`）⇒ 每个站点是一串主域，判定按串逐个比。
 *
 * ⚠️ **只登记渲染侧真要判归属的站点**（这 4 个）；`gpt` / `other` **不登记** ——
 *    渲染侧没有任何地方判它们的归属（不铺路，M6）。
 *
 * ★ **与主进程的表是两份，且不可合并**：`electron/site-hosts.js` 的 `SITE_HOSTS` 是**主进程**侧的值
 *    （作用域 = 主进程要判归属的两个源：豆包／dola）。两个世界**没有共享代码的路**
 *    （主进程是 CJS、渲染侧是 ESM bundle，互相 import 不到）⇒ 两个世界各 1 份，**都已登记**
 *    （`docs/判据登记表.md` §3／§4）。
 *
 * ⚠️ **guest 注入脚本里不许再写域名字面量**：跨世界够不着本模块 ⇒ 值**随调用载荷喂入**
 *    （同 `electron/dola-duration-main.js` 的宿主传参先例），脚本里只留**判定形状**。
 */
import type { SiteType } from './siteTypes';

export const SITE_HOSTS = {
  /** 豆包（原 `La` 的域；`www.` 由判定的归一化去掉） */
  doubao: ['doubao.com'],
  /** dola（原 `iS` 的域） */
  dola: ['dola.com'],
  /** Lovart（原 `_d` 的域） */
  lovart: ['lovart.ai'],
  /** Tapnow（原 `Dk` 逐字：**两个域**都认） */
  tapnow: ['tapnow.media', 'tapnow.art'],
} as const satisfies Partial<Record<SiteType, readonly string[]>>;
