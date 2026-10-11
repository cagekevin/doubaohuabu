/**
 * 账号**默认名**相关（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `Mk` shared.js:26504-26526 —— 类型 → 默认名前缀
 *   - `xT` shared.js:26391-26398 —— 各类型「默认名」的**识别正则**（只有匹配它的名字才被重编号）
 *   - `vo` shared.js:26527-26554 —— 按**分组**给默认名重新编号（`豆包01` / `豆包02`…）
 *   - `addAccount` 30167-30180 —— 新账号在**其分组内**的下一个编号
 *
 * ★ **为什么现在才落**：`core/rules/accountTransfer.ts`（M11 批 1）只管**导入**侧的判重，
 *   而「新增账号」这条链一直没有落点 —— 实测 `addAccount` / `Mk` / `vo` 在本工程**零命中**，
 *   `state` 里也**只有 `setAccounts`（批量覆盖）**、没有任何账号 UI ⇒ **加不了账号**
 *   ⇒ 选号池永远为空 ⇒ 生成必然报「未配置已登录的豆包 / Dola 账号」。
 *
 * ⚠️ 原则 4：本模块不碰时间/宿主；`now` 由调用方注入（只在 `buildNewAccount` 里用到，见下批）。
 */

import type { Account, SiteType } from '@/stable/model/account';
import { normalizeAccountType, SITE_TYPES } from '@/stable/model/account';

/**
 * 类型 → 默认名前缀（原 `Mk` 26504）
 *
 * ⚠️ 与源**逐字一致**，包括大小写：`dola`/`lovart`/`tapnow` 是**小写**、`gpt` 是 **`GPT`**、
 *    `other` 是 `其他`、其余（含 `doubao`）是 `豆包`。
 */
export function accountNamePrefix(type: SiteType | string): string {
  const t = normalizeAccountType(type);
  if (t === 'dola') return 'dola';
  if (t === 'lovart') return 'lovart';
  if (t === 'tapnow') return 'tapnow';
  if (t === 'gpt') return 'GPT';
  if (t === 'other') return '其他';
  return '豆包';
}

/**
 * 各类型「默认名」的识别正则（原 `xT` 26391）
 *
 * ⚠️ 逐字抄：允许名字里出现 `空格` / `_` / `-`，且**前导零可有可无**（`豆包01` 与 `豆包1` 都算默认名）。
 * ⚠️ 只有 `doubao` 那条**没有 `i` 标志**（中文无所谓大小写），其余都有 —— 照抄。
 * ⚠️ **不带 `/g`** ⇒ 可安全复用（无 `lastIndex` 污染）。
 */
const DEFAULT_NAME_RE: Readonly<Record<string, RegExp>> = {
  doubao: /^豆包[\s_-]*0*(\d+)$/,
  dola: /^dola[\s_-]*0*(\d+)$/i,
  lovart: /^lovart[\s_-]*0*(\d+)$/i,
  tapnow: /^tapnow[\s_-]*0*(\d+)$/i,
  gpt: /^gpt[\s_-]*0*(\d+)$/i,
  other: /^其他[\s_-]*0*(\d+)$/i,
};

/** 是不是「可被自动重编号」的默认名（原 `xT[type].test(name)`） */
export function isDefaultAccountName(type: SiteType | string, name: string): boolean {
  const re = DEFAULT_NAME_RE[normalizeAccountType(type)];
  return !!re && re.test(name || '');
}

/** 编号补零位数（原 `String(c).padStart(2, '0')`） */
const PAD = 2;

/** 拼一个默认名（`豆包01`） */
export const makeAccountName = (type: SiteType | string, seq: number): string =>
  `${accountNamePrefix(type)}${String(seq).padStart(PAD, '0')}`;

/**
 * 按**分组**给默认名重新编号（原 `vo` 26527）
 *
 * 规则（逐字对齐）：
 *   ① 名字**不匹配**默认名模式的 ⇒ **原样不动**（用户自定义的名字绝不被覆盖）
 *   ② 匹配的 ⇒ 在**它所属分组内**按遍历顺序重新编号（`豆包01`、`dola01`…）
 *   ③ **全新编号与旧名完全相同** ⇒ 返回**原对象**（保引用）
 *   ④ 整趟**没有任何变化** ⇒ 返回**原数组**（引用相等 —— 源版靠它省掉一次 store 写入）
 *
 * ⚠️ 计数器**按 `groupId` 分桶**（`groupId || null`），不同分组各自从 1 开始。
 */
export function renumberAccounts(accounts: readonly Account[]): Account[] {
  const counters = new Map<string | null, number>();
  let changed = false;

  const next = accounts.map((a) => {
    const name = a.name || '';
    if (!isDefaultAccountName(a.type, name)) return a;

    const groupId = a.groupId ?? null;
    const seq = (counters.get(groupId) ?? 0) + 1;
    counters.set(groupId, seq);

    const renamed = makeAccountName(a.type, seq);
    if (renamed === name) return a;
    changed = true;
    return { ...a, name: renamed };
  });

  return changed ? next : (accounts as Account[]);
}

/**
 * 新账号在**其分组内**的下一个编号名（原 `addAccount` 30167-30180）
 *
 * 算法（逐字对齐）：只统计**同一分组**里名字匹配该类型默认名模式的账号，
 * 取其中**编号最大值 + 1**（不是"数量 + 1"—— 删过账号也要接着最大号往下走）。
 *
 * ⚠️ 源版对**任何**账号都会 `Math.max`，包括编号重复的 ⇒ 与"数量+1"在这些边界上不同，
 *    照抄源算法（用正则捕获组取编号）。
 */
export function nextAccountName(
  accounts: readonly Account[],
  type: SiteType | string,
  groupId: string | null = null,
): string {
  const re = DEFAULT_NAME_RE[normalizeAccountType(type)];
  const target = groupId ?? null;

  let max = 0;
  for (const a of accounts) {
    if ((a.groupId ?? null) !== target) continue;
    if (!re) break;
    const m = (a.name || '').match(re);
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return makeAccountName(type, max + 1);
}

/** 全站类型列表（供 UI 的"选平台"用；与 `SITE_TYPES` 同源） */
export const ACCOUNT_TYPES = SITE_TYPES;
