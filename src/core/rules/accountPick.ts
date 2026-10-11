/**
 * 发送账号解析（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `Bk` shared.js:34515-34534 —— **账号筛选**（可用 + 类型 + 分组）
 *   - `FS` shared.js:42830-42890 —— 把 `sendAccount` 串解析成账号 + 失败原因
 *   - `eO` shared.js:42819-42829 —— 站点显示名（在 `constants/text` 的 `siteDisplayName`）
 *
 * ★ **归属更正（`docs/14` §10 标错）**：那里把 `FS`/`tO` 归入「GPT 站点（整条）」——
 *   **错**。`FS` 默认 `type:'doubao'`、`tO` 是 `channel` 参数化 ⇒ 两者都是**通用**的，
 *   只因 `FS` 里那句「所选账号与当前出图通道不匹配」被误关联。真正的 GPT 站点代码只有 `aO`/`sO`。
 *
 * ★ **`docs/14` 另标错一处**：把 `Bk`(34515-34534) 记作「**已登录判定** → `isAccountUsable` ✅」——
 *   形状就对不上：`Bk` **返回账号数组**（可用 + 类型 + 分组三层筛），不是一个布尔判定。
 *   ⇒ 本模块的 `filterPoolAccounts` 才是它。
 *
 * ⚠️ **双源收口（有意偏离）**：原版「账号在忙」有**两个来源** —— store 的 `accountBusy`
 *   与模块级 `Set Er`（`Hk` 34611 / `Ei` 34553 都 `||` 了它们）。
 *   同一事实两个来源必然出现"store 说闲、Set 说忙"的不一致 ⇒ 本实现只留**一个** `busy` 入参，
 *   由调用方（`state`）保证是**唯一真源**。
 *
 * ⚠️ 本模块**不读 store**（原版 `FS` 里的 `L.getState()` 归用例层）；`now`/随机一律不碰（原则 4）。
 */

import type { Account, PoolStrategy, SiteType } from '@/stable/model/account';
import { isAccountUsable } from '@/stable/model/account';
import { ACCOUNT_PICK_TEXT, siteDisplayName } from '@/constants/text';
import { pickAccount } from './accountPool';

/** 「未分组」的哨兵值（原 `FS` 的 `r.slice(11) || 'ungrouped'`） */
export const UNGROUPED = 'ungrouped';
/** `auto:group:` 前缀（原 `FS` 的 `slice(11)` ⇒ 长度 11） */
export const AUTO_GROUP_PREFIX = 'auto:group:';

/** 失败原因（与源一一对应） */
export type SendAccountReason =
  /** 成功哨兵（原 `FS`/`Ei` 都用 `'idle'`） */
  | 'idle'
  /** 显式指定的账号不存在 / 未登录 */
  | 'account-missing'
  /** 显式指定的账号与站点类型不符 */
  | 'account-type-mismatch'
  /** 显式指定的账号正在生成 */
  | 'account-busy'
  /** 池里没有可用账号 */
  | 'no-account'
  /** 池里可用账号全在忙（⇒ 上层应**排队**，不是报错） */
  | 'all-busy';

/** 解析结果 */
export interface SendAccountPick {
  ok: boolean;
  account: Account | null;
  reason: SendAccountReason;
  /** 失败文案（**已按站点显示名生成**）；成功时为 `null` */
  note: string | null;
  /** round-robin 的下一个游标（成功时给出，调用方存回 `state`） */
  nextCursor?: number;
}

/** 解析入参（原 `FS` 的 `{type, sendAccount}` + 原本从 store 读的部分改为注入） */
export interface SendAccountPickInput {
  accounts: readonly Account[];
  /** 站点类型（决定筛哪种账号 + 报错文案里的站点名） */
  type: SiteType;
  /** 原 `sendAccount` 串：`'auto'` ｜ `'auto:group:<id>'` ｜ 显式账号 id */
  sendAccount: string;
  /** ★ **忙账号（唯一来源）** —— 原版有两个源，见文件头「双源收口」 */
  busy?: readonly string[];
  /** 选号策略（透传给 `pickAccount`） */
  strategy?: PoolStrategy;
  /** round-robin 游标（调用方从 state 传入） */
  cursor?: number;
}

const fail = (reason: SendAccountReason, note: string): SendAccountPick => ({
  ok: false,
  account: null,
  reason,
  note,
});

/**
 * 账号筛选（原 `Bk` 34515）
 *
 * 三层（**顺序即语义**）：
 *   ① 必须**可用**（`status === '已登录'`，与源 `(s.status || '已登录') !== '已登录'` 一致）
 *   ② 给了 `type` ⇒ `(a.type || '') === type`
 *   ③ 给了 `groupId` ⇒ `'ungrouped'` 表示**没有分组**（`!a.groupId`），否则**精确等于**
 */
export function filterPoolAccounts(
  accounts: readonly Account[],
  opts: { type?: string; groupId?: string } = {},
): Account[] {
  const type = opts.type ?? '';
  const groupId = opts.groupId ?? '';
  return accounts.filter((a) => {
    if (!isAccountUsable(a) || (type && (a.type || '') !== type)) return false;
    if (groupId) {
      const g = a.groupId || null;
      if (groupId === UNGROUPED) return !g;
      return g === groupId;
    }
    return true;
  });
}

/**
 * 解析发送账号（原 `FS` 42830）
 *
 * 三条路径：
 *   ① **显式 id**（非 `auto` / 非 `auto:` 前缀）⇒ 逐项校验（存在且已登录 → 类型相符 → 不忙），
 *      **任一项不过直接失败**（不回落到池选号 —— 与源一致）
 *   ② `auto:group:<id>` ⇒ 在该分组内池选号
 *   ③ 其余（含 `'auto'`）⇒ 全池选号
 *
 * ⚠️ 与源一致：失败文案**只有 `no-account` 单独区分**，`all-busy` / `all-excluded` 一律
 *    说「都在忙」（源码就是个二元三目）。
 */
export function resolveSendAccount(input: SendAccountPickInput): SendAccountPick {
  const { accounts, type } = input;
  const busy = new Set(input.busy ?? []);
  const name = siteDisplayName(type);
  const raw = typeof input.sendAccount === 'string' ? input.sendAccount : 'auto';

  // ① 显式账号 id
  if (raw && raw !== 'auto' && !raw.startsWith('auto:')) {
    const hit = accounts.find((a) => a.id === raw);
    if (!hit || !isAccountUsable(hit)) return fail('account-missing', ACCOUNT_PICK_TEXT.missing);
    if ((hit.type || 'doubao') !== type) {
      return fail('account-type-mismatch', ACCOUNT_PICK_TEXT.typeMismatch);
    }
    if (busy.has(hit.id)) return fail('account-busy', ACCOUNT_PICK_TEXT.busy);
    return { ok: true, account: hit, reason: 'idle', note: null };
  }

  // ② / ③ 池选号
  const groupId = raw.startsWith(AUTO_GROUP_PREFIX)
    ? raw.slice(AUTO_GROUP_PREFIX.length) || UNGROUPED
    : '';
  const pool = filterPoolAccounts(accounts, { type, groupId });
  const picked = pickAccount(pool, {
    strategy: input.strategy,
    cursor: input.cursor,
    busy: [...busy],
  });

  if (!picked.account) {
    return picked.reason === 'no-account'
      ? fail('no-account', ACCOUNT_PICK_TEXT.noneConfigured(name))
      : fail('all-busy', ACCOUNT_PICK_TEXT.allBusy(name));
  }

  return {
    ok: true,
    account: picked.account,
    reason: 'idle',
    note: null,
    nextCursor: picked.nextCursor,
  };
}

// ─────────────────────────── 账号选择器（作者侧 UI 的纯半）───────────────────────────

/** 账号选择器用的一个分组（原 `_Component45.jsx:601-621` 的 `T` 元素） */
export interface AccountPickerGroup {
  /** `null` = 未分组（原 `gid: null`）；`'ungrouped'` 是**筛选入参**的哨兵，两者不同 */
  gid: string | null;
  label: string;
  list: Account[];
}

/** 分组名缺失时的兜底（原 `_Component45.jsx:607` 的 `ye.name || '未命名分组'`） */
const UNNAMED_GROUP = '未命名分组';
/** 未分组的显示名（原 `616` 的 `label: '未分组'`） */
const UNGROUPED_LABEL = '未分组';

/**
 * 构造账号选择器的分组列表（原 `_Component45.jsx:601-621`）
 *
 * 规则（**顺序即语义**）：
 *   ① 按 `groups` 的顺序输出，只保留**至少有一个账号**的组（空组**不显示**）
 *   ② 组名取 `group.name`，空则 `未命名分组`
 *   ③ **「未分组」永远排在最后**，且也只在非空时出现（原 `gid: null`）
 *
 * ⚠️ 与 `filterPoolAccounts` 的分工：那个是**筛选**（给定 gid 取列表），这个是**分桶**
 *    （一次把所有组列出来）—— 前者按 `groupId === 'ungrouped'` 判定，后者按 `groupId ?? null` 分桶。
 */
export function buildAccountGroups(
  accounts: readonly Account[],
  groups: readonly { id: string; name?: string }[],
): AccountPickerGroup[] {
  const byGroup = new Map<string | null, Account[]>();
  for (const a of accounts || []) {
    const gid = a.groupId ?? null;
    const bucket = byGroup.get(gid);
    if (bucket) bucket.push(a);
    else byGroup.set(gid, [a]);
  }

  const out: AccountPickerGroup[] = [];
  for (const g of groups || []) {
    const list = byGroup.get(g.id) ?? [];
    if (list.length) out.push({ gid: g.id, label: g.name || UNNAMED_GROUP, list });
  }
  const ungrouped = byGroup.get(null) ?? [];
  if (ungrouped.length) out.push({ gid: null, label: UNGROUPED_LABEL, list: ungrouped });
  return out;
}

/** 可走网页后台的站点类型（原 `nf`）—— 分组内**一个都没有**时「自动选择」按钮要禁用 */
const WEB_EXECUTABLE_TYPES: readonly string[] = ['doubao', 'dola', 'gpt'];

/**
 * 从一组账号**推出该走哪个通道**（原 `K` `_Component45.jsx:622-634`）
 *
 * 规则：取该组账号的 `type` 集合 —— **恰好只有 1 种** ⇒ 用它；否则 ⇒ `'doubao'`。
 * ⚠️ 与源一致：计的是**全部**账号的类型（**不筛**登录态）。
 */
export function deriveChannelFromGroup(list: readonly Account[]): SiteType {
  // ⚠️ 显式 `Set<string>`：`SiteType` 的 Set 不接受 string 查表
  const types = new Set<string>((list || []).map((a) => a.type || 'doubao'));
  const hit = WEB_EXECUTABLE_TYPES.filter((t) => types.has(t));
  return (hit.length === 1 ? hit[0] : 'doubao') as SiteType;
}

/** 该分组内是否**有可用**（已登录）+ **可执行**（豆包/Dola/GPT）的账号（原 `_Component45.jsx:1347-1349` 的 `be`） */
export function hasExecutableAccount(list: readonly Account[]): boolean {
  return (list || []).some((a) => isAccountUsable(a) && WEB_EXECUTABLE_TYPES.includes(a.type || 'doubao'));
}

/**
 * 账号选择器按钮上的**文案**（原 `Se` `_Component45.jsx:685-711`）
 *
 * 五档（**逐字对齐**）：
 *   | 取值 | 显示 |
 *   |---|---|
 *   | `channel === 'api'` | `API` |
 *   | `sendAccount === 'auto'` | `自动` |
 *   | `auto:group:ungrouped` | `未分组 · 自动` |
 *   | `auto:group:<id>` | `{组名} · 自动`（组不存在 ⇒ `分组 · 自动`） |
 *   | 显式账号 id | 账号名；**找不到 ⇒ 回落 `自动`** |
 *
 * ⚠️ `auto:<type>`（如 `auto:dola`）会落到**最后一档** —— 源版就是如此（它不是账号 id，
 *    找不到就显示 `自动`）。**照抄**。
 */
export function accountPickerLabel(input: {
  channel?: string;
  sendAccount?: string;
  accounts?: readonly Account[];
  groups?: readonly { id: string; name?: string }[];
}): string {
  if (input.channel === 'api') return 'API';
  const v = input.sendAccount ?? 'auto';
  if (v === 'auto') return '自动';
  if (v.startsWith('auto:group:')) {
    const gid = v.slice('auto:group:'.length);
    if (gid === UNGROUPED) return `${UNGROUPED_LABEL} · 自动`;
    const g = (input.groups || []).find((x) => x.id === gid);
    return `${g?.name || '分组'} · 自动`;
  }
  const hit = (input.accounts || []).find((a) => a.id === v);
  return hit ? hit.name : '自动';
}
