/**
 * Dola「30s 强开」的**闸**（原 `Mt` 的条件，`_Component43.jsx:761`）
 *
 * ★ **为什么住 `core/rules`**（不是 `adapters/site/doubao`）：它的入参是 **`(账号类型, params)`** ——
 *   都是**业务数据**，不掺环境（没有主机名/路径/DOM）。按 `docs/11` §六·六 的归属规则
 *   「**纯判据（顺序 / 匹配 / 阈值 / 格式化）→ `core/rules`**」它就该在这里。
 *   ⚠️ 与 `adapters/site/<站点>/pageKind.ts` 的「站点专属 ⇒ 留本目录」（判据 A1）**不冲突**：
 *   那一类的专属点是**主机名正则 + 路径规则**（**环境**判定）；本件是阈值判定。
 *   附带好处：住 `adapters` 就**只能不测**（`ui/`、`adapters/` 下不许有测试文件）⇒ 搬来才**测得着**。
 *
 * ⚠️ **两个别并成一个的判据**（源就是这么分开写的）：
 *   · 本闸 = `duration > 15`（源 `:761`）
 *   · `JP` 脚本**内部**另有一个 `d < 16`（`shared.js:34774`）—— 那是"已经够长就别再改"的第二道
 *
 * ⚠️ **模型名认的是连字符**：`'seedance-2.5'`（**模型 id**）。**不是**报文里那个
 *   `'seedance_v2.5'`（下划线形态，见 `adapters/site/doubao/dolaForce.ts` 的默认值）——
 *   两者**同源不同形**，别"顺手统一"（统一了这条闸就永远不成立）。
 */
import type { SiteType } from '@/stable/model/account';

/**
 * 这条发送是否该走 Dola 的「30s 强开」（原 `Mt`/`Rt` 共用的条件）
 *
 * 源逐字取反式：`kind !== 'dola' || !(duration > 15) || model !== 'seedance-2.5'` ⇒ 命中即强开。
 * ★ 网络层（`Mt`）与面板层（`Rt`）**共用这一个闸**（判据 C1 —— 源在两处各写了一遍）。
 * ⚠️ `Number(...)` 是**源就这样**（字符串 `'16'` 也算过；`undefined` ⇒ `NaN` ⇒ 不过）。
 */
export function isDolaForceTarget(
  kind: SiteType,
  params: Record<string, unknown> | null | undefined,
): boolean {
  const p = params ?? {};
  return kind === 'dola' && Number(p.duration) > 15 && p.model === 'seedance-2.5';
}
