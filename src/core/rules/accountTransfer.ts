/**
 * 账号导入 / 导出 —— **纯逻辑半**（★ 必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - 导入：`OP.jsx:585-699`（`loadAccountsFile` → 解析 → 三重判重 → 恢复 cookie → 逐个建号）
 *   - 导出：`PP.jsx:36-94`（逐号取 cookie → 组 JSON → `saveAccountsFile`）
 *   - 建号归一：`shared.js:30159-30210` 的 `addAccount`
 *
 * ⚠️ **编排（文件对话框 / cookie IPC）不在本文件** —— 见 `core/usecases/accountTransfer.ts`。
 *    本文件只做「给定输入 → 给定输出」的纯变换，故可单测（原则 7）。
 *
 * ⚠️ **时间一律注入**（原则 4）：`now` / `nowBase36` 都由调用方给。
 */

import type { Account } from '@/stable/model/account';
import { ACCOUNT_STATUS, normalizeAccountType } from '@/stable/model/account';
import { ACCOUNT_ID_PREFIX, ACCOUNTS_EXPORT_VERSION } from '@/stable/contracts/schemas';
import { ACCOUNT_TRANSFER_TEXT } from '@/constants/text';
// ⚠️ 2026-10-14：分区键的形状**收口到** `core/rules/partition.ts`（本文件原先也各写一种形状）
import { makeImportedPartition } from './partition';
import { capsOf } from './siteCaps';
import { asRecord } from '@/lib/object';

/**
 * 导入时的状态别名（原 `OP.jsx:624-628` 的 `Pe`）
 *
 * 源版把三个「运行时态」映射成 `已登录` —— 因为导出文件里可能是别的会话写下的中间态。
 */
const STATUS_ALIASES: Readonly<Record<string, string>> = {
  used: ACCOUNT_STATUS.loggedIn,
  done: ACCOUNT_STATUS.loggedIn,
  idle: ACCOUNT_STATUS.loggedIn,
};

/**
 * 状态归一（原 `Pe[yt.status] || yt.status || '已登录'`）
 *
 * ⚠️ 与源一致：**别名优先**，其次原样，最后兜底 `已登录`。
 */
export function normalizeImportedStatus(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return STATUS_ALIASES[s] ?? (s || ACCOUNT_STATUS.loggedIn);
}

/** 导入时补的账号 id（原 `OP.jsx:635` 的 `` `acc_${bt}_${mt}` ``，`bt` = 当前时间的 base36） */
export function makeImportedAccountId(nowBase36: string, index: number): string {
  return `${ACCOUNT_ID_PREFIX}${nowBase36}_${index}`;
}

/** 待建账号的完整形状（= `addAccount` 归一后的结果） */
export interface ImportedAccountDraft {
  account: Account;
  /** 该号在文件里带的 cookie（用于后续 `importCookies`） */
  cookies: unknown[];
}

/**
 * 单条导入项 → 账号（原 `OP.jsx:663-676` + `addAccount` 的字段归一）
 *
 * ⚠️ 与源一致的两处「补默认」：
 *   · `autoStart` —— 导入**从不**带它 ⇒ `addAccount` 的 `n.autoStart === true` 恒 false
 *   · `url` —— 源 `addAccount` 写 `s === 'other' && n.url || ''` ⇒ **非 `other` 也是空串**
 *
 * ⚠️ **有意不在本函数做的事**：`addAccount` 会**按当前宿主 OS 重算指纹**
 *    （`shared.js:30194`：`hostOS` 不符或版本过期 ⇒ `zc(id#fpSalt)`）。
 *    指纹生成器 = **`core/rules/fingerprintGenerator.ts`（已落地）**，宿主输入由 `state/slices/global.ts`
 *    的 `addAccount` 注入（原 `zc` 现读 `Uc()`/`M$()`/`$$()`；见 `global.ts:291`「addAccount 与
 *    `regenerateFingerprint` 共用这一处展开」）⇒ 该判定归 **state 的 `addAccount`**，此处**原样透传**文件里的指纹。
 */
export function toImportedAccount(
  entry: Record<string, unknown>,
  opts: { index: number; nowBase36: string; now: number },
): ImportedAccountDraft {
  const rawId = typeof entry.id === 'string' && entry.id ? entry.id : '';
  const id = rawId || makeImportedAccountId(opts.nowBase36, opts.index);

  const rawName = typeof entry.name === 'string' ? entry.name : '';
  const name = rawName || ACCOUNT_TRANSFER_TEXT.defaultName;

  const rawPartition = typeof entry.partition === 'string' ? entry.partition : '';
  const partition = rawPartition || makeImportedPartition(id);

  const type = normalizeAccountType(entry.type);

  const addedAt = typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt) ? entry.addedAt : opts.now;
  const fpSalt = typeof entry.fpSalt === 'number' && Number.isFinite(entry.fpSalt) ? entry.fpSalt : 0;
  const groupId = typeof entry.groupId === 'string' && entry.groupId ? entry.groupId : null;

  const account: Account = {
    id,
    name,
    type,
    status: normalizeImportedStatus(entry.status),
    partition,
    addedAt,
    groupId,
    autoStart: false,
    fpSalt,
    ...(entry.fingerprint ? { fingerprint: entry.fingerprint as Account['fingerprint'] } : {}),
    // ★ 与源一致：`url` 恒存在；非 `other` 为空串
    // 只有**没有站点固定地址**的类型（自定义网站）才保留导入的网址（判据 = 能力表）
    url: !capsOf(type).hasFixedUrl && typeof entry.url === 'string' ? entry.url : '',
  };

  return { account, cookies: Array.isArray(entry.cookies) ? entry.cookies : [] };
}

/** 三重判重的已用集合（原 `OP.jsx:615-623`） */
interface UsedKeys {
  ids: Set<string>;
  partitions: Set<string>;
  names: Set<string>;
}

function collectUsed(existing: readonly Account[]): UsedKeys {
  const ids = new Set<string>();
  const partitions = new Set<string>();
  const names = new Set<string>();
  for (const a of existing) {
    ids.add(a.id);
    partitions.add(a.partition);
    names.add(a.name);
  }
  return { ids, partitions, names };
}

/**
 * 批量筛选可导入项（原 `OP.jsx:629-681`）
 *
 * ⚠️ 判重是**三重**且**边加边判**（新导入的号也进集合）—— 与源一致。
 *    顺序：`id` → `name` → `partition`（源里 `partition` 在 `name` 之后判）。
 */
export function selectImportableAccounts(
  entries: readonly unknown[],
  existing: readonly Account[],
  opts: { nowBase36: string; now: number },
): { drafts: ImportedAccountDraft[]; skipped: number } {
  const used = collectUsed(existing);
  const drafts: ImportedAccountDraft[] = [];
  let skipped = 0;

  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i];
    if (!raw || typeof raw !== 'object') {
      skipped++;
      continue;
    }
    const draft = toImportedAccount(asRecord(raw), { ...opts, index: i });
    const { account } = draft;

    if (used.ids.has(account.id) || used.names.has(account.name) || used.partitions.has(account.partition)) {
      skipped++;
      continue;
    }

    used.ids.add(account.id);
    used.names.add(account.name);
    used.partitions.add(account.partition);
    drafts.push(draft);
  }

  return { drafts, skipped };
}

/** 导出文件里的单条账号（原 `PP.jsx:63-73`） */
export interface ExportedAccountEntry {
  id: string;
  name: string;
  type: string;
  status: string;
  /** ★ 恒有值（`Account.partition` 的同一条不变量） */
  partition: string;
  addedAt: number;
  fpSalt: number;
  fingerprint: Account['fingerprint'] | null;
  cookies: unknown[];
}

/** 单条导出项（原 `PP.jsx:63-73`：`type || 'doubao'`、`fpSalt || 0`、`fingerprint || null`） */
export function toExportedAccountEntry(account: Account, cookies: readonly unknown[]): ExportedAccountEntry {
  return {
    id: account.id,
    name: account.name,
    type: normalizeAccountType(account.type),
    status: account.status,
    partition: account.partition,
    addedAt: account.addedAt,
    fpSalt: account.fpSalt || 0,
    fingerprint: account.fingerprint || null,
    cookies: [...cookies],
  };
}

/**
 * 导出文件正文（原 `PP.jsx:75-79`：`{version:1, exportedAt, accounts}`，**2 空格缩进**）
 *
 * ⚠️ `exportedAt` 由调用方给（`new Date(clock.now()).toISOString()`）—— 原则 4。
 */
export function buildAccountsExportFile(
  entries: readonly ExportedAccountEntry[],
  exportedAtIso: string,
): string {
  return JSON.stringify(
    { version: ACCOUNTS_EXPORT_VERSION, exportedAt: exportedAtIso, accounts: entries },
    null,
    2,
  );
}

/**
 * 从导出文件正文读账号数组（原 `OP.jsx:607`：`Ce.accounts || (Array.isArray(Ce) ? Ce : [])`）
 *
 * ⚠️ 与源一致：**同时接受**「带 `accounts` 的对象」与「裸数组」两种历史格式。
 */
export function readAccountsFromFile(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const list = asRecord(parsed).accounts;
    if (Array.isArray(list)) return list;
  }
  return [];
}
