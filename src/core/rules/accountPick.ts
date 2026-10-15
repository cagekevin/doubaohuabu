/**
 * 发送账号解析（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `Bk` shared.js:34515-34534 —— **账号筛选**（可用 + 类型 + 分组）
 *   - `FS` shared.js:42830-42890 —— 把 `sendAccount` 串解析成账号 + 失败原因
 *   - `eO` shared.js:42819-42829 —— 站点显示名（在 `constants/text` 的 `siteDisplayName`）
 *
 * ★ **归属更正（`docs/过程.md` §10 标错）**：那里把 `FS`/`tO` 归入「GPT 站点（整条）」——
 *   **错**。`FS` 默认 `type:'doubao'`、`tO` 是 `channel` 参数化 ⇒ 两者都是**通用**的，
 *   只因 `FS` 里那句「所选账号与当前出图通道不匹配」被误关联。真正的 GPT 站点代码只有 `aO`/`sO`。
 *
 * ★ **`docs/过程.md` 另标错一处**：把 `Bk`(34515-34534) 记作「**已登录判定** → `isAccountUsable` ✅」——
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
import { POOL_STRATEGIES, isAccountUsable, normalizeAccountType } from '@/stable/model/account';
import { ACCOUNT_PICK_TEXT, siteDisplayName } from '@/constants/text';
import { pickAccount } from './accountPool';
import { DEFAULT_GROUP_NAME } from './accountGroup';
import { DEFAULT_CHANNEL } from '@/core/model/defaults';
import { siteTypesWhere } from './siteCaps';

/** 「未分组」的哨兵值（原 `FS` 的 `r.slice(11) || 'ungrouped'`） */
export const UNGROUPED = 'ungrouped';
/** `auto:group:` 前缀（原 `FS` 的 `slice(11)` ⇒ 长度 11） */
export const AUTO_GROUP_PREFIX = 'auto:group:';

/**
 * 归一选号策略（原 `Ou`，`shared.js:34480-34490`）
 *
 * 源：读 `localStorage['doubao-account-pool-strategy']`，**在选项表里**才收，
 *   否则回落 `'round-robin'`（原 `BP`）。
 * ⚠️ 非法值**不报错、不修数据**，静默回落默认 —— 逐字照抄（供 `hydrate` 读回时用）。
 */
export function normalizePoolStrategy(v: unknown): PoolStrategy {
  return typeof v === 'string' && (POOL_STRATEGIES as readonly string[]).includes(v)
    ? (v as PoolStrategy)
    : 'round-robin';
}

/**
 * 切换选号策略（原 `z3.jsx:273`：`b === 'round-robin' ? 'least-load' : 'round-robin'`）
 *
 * ⚠️ 源**写死这两个值**（不是"按选项表循环"）—— 逐字保留。
 */
export function nextPoolStrategy(v: PoolStrategy): PoolStrategy {
  return v === 'round-robin' ? 'least-load' : 'round-robin';
}

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
 *   ② 给了 `type` ⇒ `normalizeAccountType(a.type) === type`
 *   ③ 给了 `groupId` ⇒ `'ungrouped'` 表示**没有分组**（`!a.groupId`），否则**精确等于**
 *
 * ★★ **有意偏离源（留痕）**：源把 `type` 判据**写了两遍、且两遍不一致** ——
 *   显式账号那条（`FS:42850`）是 `(a.type || 'doubao')`（**缺省 ⇒ 豆包**），
 *   池选号这条（`Bk:34521`）是 `(s.type || '')`（**缺省 ⇒ 谁都匹配不上**）。
 *   ⇒ 同一个账号、同一个 `type` 入参，两条路给出**相反**结论：
 *     `type` 字段为空的账号，「显式指定」选得中、「池选号（`auto`）」选不中
 *     ⇒ 表现就是「图片能生成，『分析提示词』却说『未配置已登录的豆包 / Dola 账号』」。
 *   ⇒ 按正确性收口：**与显式那条用同一个 `normalizeAccountType`**（缺省 / 未知 ⇒ `doubao`）。
 *   ⚠️ 只改判据写法，**不动三层筛选语义**；`type` 缺失的账号从此两条路**一致**。
 */
export function filterPoolAccounts(
  accounts: readonly Account[],
  opts: { type?: string; groupId?: string } = {},
): Account[] {
  const type = opts.type ?? '';
  const groupId = opts.groupId ?? '';
  return accounts.filter((a) => {
    if (!isAccountUsable(a) || (type && normalizeAccountType(a.type) !== type)) return false;
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
    if (normalizeAccountType(hit.type) !== type) {
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

// ⚠️ 分组名缺省兜底**不再**在此自写（`TD-16-149`）：它与 `accountGroup` 的 `DEFAULT_GROUP_NAME`
//   是同一命题 ⇒ 引那边的唯一声明。未分组的显示名（原 `616` 的 `label: '未分组'`）**留在本处** ——
//   它与 `sendPanelText` 的 `ungrouped` / `text` 的 `ungroupedName` 同值但**源里就是三处不同组件**
//   （`_Component45.jsx:616` · `OP.jsx:899` · `OP.jsx:449`）⇒ 照源，不合并（裁定见轮次文件）。
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
    if (list.length) out.push({ gid: g.id, label: g.name || DEFAULT_GROUP_NAME, list });
  }
  const ungrouped = byGroup.get(null) ?? [];
  if (ungrouped.length) out.push({ gid: null, label: UNGROUPED_LABEL, list: ungrouped });
  return out;
}

/** 可走网页后台的站点类型（原 `nf`）—— 分组内**一个都没有**时「自动选择」按钮要禁用 */
const WEB_EXECUTABLE_TYPES: readonly string[] = siteTypesWhere((c) => c.webExecutable);

/**
 * 「**画廊型**」站点 —— 后台视图里显示「**出新图**」条（原 `_Component26`）的那三站
 *
 * 源出处：`_Component43.jsx:3301` 的渲染条件
 * ```jsx
 * {t && c.length > 0 && (Ke?.type==='lovart' || Ke?.type==='tapnow' || Ke?.type==='other')
 *   && <_Component26 account={Ke} active={t} />}
 * ```
 * ⚠️ **它与上面 `WEB_EXECUTABLE_TYPES` 是同一处的互补两支**（源 `:3298` 是"其余站点"那支，
 *   渲染的是 `SD`「无水印资源」面板）—— 故把两者放在一起，**避免各写一份站点清单**（判据 C1）。
 * ⚠️ 类型放宽为 `readonly string[]`（与 `WEB_EXECUTABLE_TYPES` 同法）：本仓 `Account.type` 是
 *   `string`，用 `SiteType` 收窄会在调用处逼出一个 `as`（那就是类型层兜底）。
 */
export const NEW_IMAGES_SITES: readonly string[] = siteTypesWhere((c) => c.hasNewImagesPanel);

/**
 * 从一组账号**推出该走哪个通道**（原 `K` `_Component45.jsx:622-634`）
 *
 * 规则：取该组账号的 `type` 集合 —— **恰好只有 1 种** ⇒ 用它；否则 ⇒ `'doubao'`。
 * ⚠️ 与源一致：计的是**全部**账号的类型（**不筛**登录态）。
 */
export function deriveChannelFromGroup(list: readonly Account[]): SiteType {
  // ⚠️ 显式 `Set<string>`：`SiteType` 的 Set 不接受 string 查表
  const types = new Set<string>((list || []).map((a) => normalizeAccountType(a.type)));
  const hit = WEB_EXECUTABLE_TYPES.filter((t) => types.has(t));
  return (hit.length === 1 ? hit[0] : DEFAULT_CHANNEL) as SiteType;
}

/** 该分组内是否**有可用**（已登录）+ **可执行**（豆包/Dola/GPT）的账号（原 `_Component45.jsx:1347-1349` 的 `be`） */
export function hasExecutableAccount(list: readonly Account[]): boolean {
  return (list || []).some((a) => isAccountUsable(a) && WEB_EXECUTABLE_TYPES.includes(normalizeAccountType(a.type)));
}

/**
 * 「**当前账号**」的初值 —— **三级回退**（原 `shared.js:26791-26805` 的 IIFE，**逐字**）
 *
 * 源里这个字段（`activeDoubaoAccountId`）的**初值不是 `null`**，而是一次挑选：
 * ```js
 * const n = Vy();                                   // 读盘 accounts
 * const r = n.find(a => (a.status || '已登录') === '已登录' && a.autoStart === true);
 * if (r) return r.id;
 * return n.find(a => (a.status || '已登录') === '已登录')?.id || n[0]?.id || null;
 * ```
 * ⇒ ① 第一个「已登录 **且** `autoStart === true`」→ ② 第一个「已登录」→ ③ **第一个账号**（**不看状态**）→ `null`
 *
 * ★ **2026-10-12（越权族 · 源头补齐）**：本仓此前**没有这条规则** —— `ui` 切片的
 *   `activeAccountId` 初值**硬写 `null`**，于是"打开应用先帮你选中一个可用账号"这个**源行为整条丢了**。
 *   ⚠️ 注意这**不是**"字段缺位"：源字段在本仓是**改名**（`activeDoubaoAccountId` ⇒ `activeAccountId`），
 *      缺的是它**初值的语义** ⇒ 补在**纯层**（一处），消费侧（`bootstrap/hydrate` 的种子点）只调用。
 *
 * ⚠️ 「已登录」判据**复用** `isAccountUsable`（它的实现逐字就是源这句 `(status || '已登录') === '已登录'`）
 *   —— **不写第二份**。
 * ⚠️ 第三条回退**不看状态**（源 `n[0]`）是**刻意的**：哪怕全未登录，也把第一个选上（用户至少有个可点的）
 *   ⇒ 照抄。
 */
export function pickInitialActiveAccount(
  accounts: readonly Account[] | null | undefined,
): string | null {
  const list = accounts ?? [];
  return (
    list.find((a) => isAccountUsable(a) && a.autoStart === true)?.id ??
    list.find((a) => isAccountUsable(a))?.id ??
    list[0]?.id ??
    null
  );
}

/**
 * 「**补齐当前账号**」—— 没选中时该补谁（原 `_Component42.jsx:463-475` 的 `tt`，**逐字**）
 *
 * 源（`_Component42` 的顶栏「豆包后台」按钮的处理函数）：
 * ```js
 * const tt = () => {
 *   if (!L.getState().activeDoubaoAccountId) {
 *     const Oe = (S && C.find(w => w.id === S)) ? S                  // ① "上次发送过的"（**且该账号还在**）
 *              : (C.find(w => (w.status||'已登录')==='已登录')?.id) || null;  // ② 第一个已登录
 *     if (Oe) L.getState().setActiveDoubaoAccount(Oe);
 *   }
 *   t();                                                             // 再打开后台视图
 * };
 * ```
 *
 * @returns 需要设置的账号 id；**`null` = 什么都不用设**（已选中，或补不出可用账号）
 *
 * ★ **2026-10-12 · 为什么它是**另一条**规则（**不许与 `pickInitialActiveAccount` 合并**）**：
 *   | | `pickInitialActiveAccount`（源 `26791-26805` 的 IIFE） | 本条（源 `tt`） |
 *   | --- | --- | --- |
 *   | 时机 | **store 初始化**（读盘后种初值） | **运行期**（点顶栏入口时） |
 *   | 是否有"已选中就跳过"的前置 | **没有**（它就是初值） | **有**（`if (!active)`） |
 *   | 第一档 | 第一个「已登录 **且** `autoStart`」 | 「**上次发送过的**」（且账号还在） |
 *   | 最后一档 | **第一个账号（不看状态）** | **无**（补不出就 `null`） |
 *   ⚠️ 两条只有"第二个已登录"这一档相同 —— 合并任何一条都会**改掉源的语义**。
 * ⚠️ 「已登录」判据**复用** `isAccountUsable`（不写第二份）。
 */
export function pickActiveAccountFallback(input: {
  activeAccountId: string | null | undefined;
  lastSentAccountId: string | null | undefined;
  accounts: readonly Account[] | null | undefined;
}): string | null {
  // 源第一句：**已经选中了就不动**（这是它与 IIFE 最本质的区别）
  if (input.activeAccountId) return null;
  const list = input.accounts ?? [];
  const last = input.lastSentAccountId;
  // ① 「上次发送过的」—— **必须是当前仍在列表里的账号**（源 `C.find(id === S) ? S : …`）
  if (last && list.some((a) => a.id === last)) return last;
  // ② 第一个已登录；补不出 ⇒ `null`（源 `|| null`，**没有**"首个不看状态"那一档）
  return list.find((a) => isAccountUsable(a))?.id ?? null;
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

/**
 * 挑**自动换号**的候选账号（原 `_Component43.jsx:2448-2465` 的
 * `listNextIdleAccounts(T)` ＋ **同类型优先**）
 *
 * 源顺序（**顺序即语义**）：
 *   ① 只留「已登录 · 未曾试过 · 不忙」的账号（空 ⇒ 调用方判「没有其他已登录的可用账号」）
 *   ② **与当前账号同类型**的排在前，其余排在后（`:2461-2465`）
 *
 * ⚠️ 归**选号族**（而不是「发送后监测」）：它是"挑下一个用哪个账号"，与
 *    `resolveSendAccountForChain` / `pickAccount` 同一件事。
 * ⚠️ `busyIds` 由调用方注入（`core` 不读 store、不读时间 —— 原则 4）。
 */
export function pickSwitchCandidates(
  accounts: readonly Account[],
  currentType: string | undefined,
  triedIds: ReadonlySet<string>,
  busyIds: readonly string[],
): Account[] {
  const busy = new Set(busyIds);
  const idle = accounts.filter(
    (a) => isAccountUsable(a) && !triedIds.has(a.id) && !busy.has(a.id),
  );
  const sameType = idle.filter((a) => !!currentType && a.type === currentType);
  const others = idle.filter((a) => !currentType || a.type !== currentType);
  return [...sameType, ...others];
}
