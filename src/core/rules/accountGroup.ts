/**
 * 账号分组（CRUD + 移组）—— **纯函数**（★ 必测）
 *
 * 依据（**逐行回源**）：`shared.js:31937-32040` ——
 *   `addGroup` / `setGroupColor` / `renameGroup` / `deleteGroup` / `moveAccountsToGroup` / `setGroupAutoStart`。
 *
 * ⚠️ 形状真源在 `stable/model/account.ts` 的 `AccountGroup`（本模块只做变换）。
 * ⚠️ 原则 4：`Date.now()` / `` `grp_${…}` `` 经注入（`now` / `idFactory`）。
 * ⚠️ **重编号（`vo`）只在源版跑了它的三处跑**：`deleteGroup`（31995）· `moveAccountsToGroup`（32018）
 *    —— `setGroupAutoStart` **没有** `vo`（32036 直接 `e({accounts})`），照抄。
 * ⚠️ 源版的 `gr()` / `ml()` 是**落盘**助手 —— 本工程由 `container.ts` 的自动落盘订阅覆盖（`pick()` 含
 *    `accounts` / `groups`）⇒ 本模块**不碰持久化**。
 */

import type { Account, AccountGroup } from '@/stable/model/account';
import { renumberAccounts } from './accountName';

/** 建组依赖（原 `addGroup` 31938-31943） */
export interface AddGroupDeps {
  /** 新组 id（原 `` `grp_${Date.now().toString(36)}` ``） */
  idFactory: () => string;
  /** 建组时间（原 31942） */
  now: number;
}

/**
 * 默认组名（原 31941 的 `n && n.trim() || '未命名分组'`）
 *
 * ★ **2026-10-14 收口（`TD-16-149`）：全仓唯一声明** —— `core/rules/accountPick` 的分组列表兜底
 *   （原 `_Component45.jsx:607` 的 `ye.name || '未命名分组'`）是**同一命题**（分组名缺省兜底）
 *   ⇒ 那边改引本常量，不再各写一份。
 */
export const DEFAULT_GROUP_NAME = '未命名分组';

/** 新建分组（原 `addGroup` 31937-31951） */
export function addGroup(
  groups: readonly AccountGroup[],
  name: string,
  deps: AddGroupDeps,
): { groups: AccountGroup[]; id: string } {
  const id = deps.idFactory();
  const group: AccountGroup = {
    id,
    name: (name && name.trim()) || DEFAULT_GROUP_NAME,
    createdAt: deps.now,
    color: null,
  };
  return { groups: [...groups, group], id };
}

/** 设分组颜色（原 `setGroupColor` 31952-31967；`color` 假值 ⇒ `null`） */
export function setGroupColor(
  groups: readonly AccountGroup[],
  id: string,
  color: string | null,
): AccountGroup[] {
  return groups.map((g) => (g.id === id ? { ...g, color: color || null } : g));
}

/** 重命名分组（原 `renameGroup` 31968-31983；**空名 ⇒ 保留原名**） */
export function renameGroup(
  groups: readonly AccountGroup[],
  id: string,
  name: string,
): AccountGroup[] {
  return groups.map((g) => (g.id === id ? { ...g, name: (name && name.trim()) || g.name } : g));
}

/** 删分组的结果（原 `deleteGroup` 31984-32005） */
export interface DeleteGroupResult {
  groups: AccountGroup[];
  accounts: Account[];
}

/** 删分组：成员**落回未分组** + **重编号**（原 `deleteGroup` 31984-32005） */
export function deleteGroup(
  groups: readonly AccountGroup[],
  accounts: readonly Account[],
  id: string,
): DeleteGroupResult {
  const moved = accounts.map((a) => (a.groupId === id ? { ...a, groupId: null } : a));
  return { accounts: renumberAccounts(moved), groups: groups.filter((g) => g.id !== id) };
}

/** 把若干账号移进某组（原 `moveAccountsToGroup` 32006-32023；`groupId` 假值 ⇒ 未分组）+ **重编号** */
export function moveAccountsToGroup(
  accounts: readonly Account[],
  ids: readonly string[],
  groupId: string | null,
): Account[] {
  const set = new Set(ids);
  return renumberAccounts(accounts.map((a) => (set.has(a.id) ? { ...a, groupId: groupId || null } : a)));
}

/**
 * 整组设自启动（原 `setGroupAutoStart` 32024-32040）
 *
 * ⚠️ `groupId` 假值 ⇒ 命中**未分组**那一桶（源 `const s = n || null`）。
 * ⚠️ 与源一致：**不重编号**。
 */
export function setGroupAutoStart(
  accounts: readonly Account[],
  groupId: string | null,
  value: boolean,
): Account[] {
  const gid = groupId || null;
  return accounts.map((a) => ((a.groupId || null) === gid ? { ...a, autoStart: value } : a));
}

/**
 * **单账号**设自启动（源 `Ve` 的落点：`_Component43.jsx:516-524` 的
 * `updateAccount(id, { autoStart: true })` —— 静默遮罩的「恢复该账号页面」按钮）
 *
 * ⚠️ 与整组版一致：**不重编号**（源的 `updateAccount` 只是字段更新）。
 * ⚠️ 未命中的账号**引用不变**（与族内其它函数同款，便于 React 跳过无谓渲染）。
 */
export function setAccountAutoStart(
  accounts: readonly Account[],
  id: string,
  value: boolean,
): Account[] {
  return accounts.map((a) => (a.id === id ? { ...a, autoStart: value } : a));
}
